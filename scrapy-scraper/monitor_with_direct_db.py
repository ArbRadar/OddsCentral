#!/usr/bin/env python3
"""
Scrapy Monitor with Direct Database Access - Works around PostgREST issues
"""
import psycopg2
import json
import time
import subprocess
import logging
import os
import signal
from datetime import datetime, timedelta
from threading import Thread

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('ScrapyMonitor')

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgres', 
    'user': 'postgres',
    'password': 'postgres'
}

class ScrapyMonitorDirect:
    def __init__(self):
        self.running = True
        self.worker_id = f"scrapy_monitor_{os.getpid()}"
        self.poll_interval = 30
        self.batch_size = 10
        self.last_cleanup = datetime.utcnow()
        self.cleanup_interval_minutes = 10  # Run cleanup every 10 minutes
        
    def signal_handler(self, signum, frame):
        logger.info("Shutdown signal received")
        self.running = False
        
    def get_db_connection(self):
        """Get database connection"""
        return psycopg2.connect(**DB_CONFIG)
        
    def get_config(self):
        """Get configuration from database"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT key, value FROM scraping_config")
            config = dict(cursor.fetchall())
            cursor.close()
            conn.close()
            return config
        except Exception as e:
            logger.error(f"Error getting config: {e}")
            return {}
    
    def get_pending_endpoints(self):
        """Get endpoints that need scraping"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cutoff_time = datetime.utcnow() - timedelta(minutes=30)
            
            cursor.execute("""
                SELECT id, domain, method, path, headers 
                FROM discovered_endpoints 
                WHERE active = true 
                AND (last_scraped IS NULL OR last_scraped < %s OR scrape_status = 'failed')
                LIMIT %s
            """, (cutoff_time, self.batch_size))
            
            endpoints = []
            for row in cursor.fetchall():
                endpoints.append({
                    'id': row[0],
                    'domain': row[1], 
                    'method': row[2],
                    'path': row[3],
                    'headers': row[4] if row[4] else {}
                })
            
            logger.info(f"Found {len(endpoints)} endpoints to scrape")
            cursor.close()
            conn.close()
            return endpoints
            
        except Exception as e:
            logger.error(f"Error getting endpoints: {e}")
            return []
    
    def update_endpoint_status(self, endpoint_id, status, error=None):
        """Update endpoint status"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            if status == 'success':
                cursor.execute("""
                    UPDATE discovered_endpoints 
                    SET scrape_status = %s, last_scraped = %s, scrape_count = scrape_count + 1
                    WHERE id = %s
                """, (status, datetime.utcnow(), endpoint_id))
            elif status == 'failed':
                cursor.execute("""
                    UPDATE discovered_endpoints 
                    SET scrape_status = %s, last_scraped = %s, error_count = error_count + 1, last_error = %s
                    WHERE id = %s
                """, (status, datetime.utcnow(), str(error) if error else None, endpoint_id))
            else:
                cursor.execute("""
                    UPDATE discovered_endpoints 
                    SET scrape_status = %s, last_scraped = %s
                    WHERE id = %s
                """, (status, datetime.utcnow(), endpoint_id))
            
            conn.commit()
            cursor.close()
            conn.close()
            logger.debug(f"Updated endpoint {endpoint_id} status to {status}")
            
        except Exception as e:
            logger.error(f"Error updating endpoint status: {e}")
    
    def create_job_record(self):
        """Create job record"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO scraping_jobs (job_type, status, started_at, worker_id)
                VALUES (%s, %s, %s, %s) RETURNING id
            """, ('data_scraping', 'running', datetime.utcnow(), self.worker_id))
            
            job_id = cursor.fetchone()[0]
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.info(f"Created job record: {job_id}")
            return job_id
            
        except Exception as e:
            logger.error(f"Error creating job: {e}")
            return None
    
    def update_job_record(self, job_id, status, stats=None, error=None):
        """Update job record"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            update_data = [status]
            sql = "UPDATE scraping_jobs SET status = %s"
            
            if status in ['completed', 'failed']:
                sql += ", completed_at = %s"
                update_data.append(datetime.utcnow())
            
            if stats:
                if 'endpoints_count' in stats:
                    sql += ", endpoints_count = %s"
                    update_data.append(stats['endpoints_count'])
                if 'games_scraped' in stats:
                    sql += ", games_scraped = %s"
                    update_data.append(stats['games_scraped'])
                if 'odds_scraped' in stats:
                    sql += ", odds_scraped = %s"  
                    update_data.append(stats['odds_scraped'])
            
            if error:
                sql += ", error_message = %s"
                update_data.append(str(error))
            
            sql += " WHERE id = %s"
            update_data.append(job_id)
            
            cursor.execute(sql, update_data)
            conn.commit()
            cursor.close()
            conn.close()
            
            logger.debug(f"Updated job {job_id} status to {status}")
            
        except Exception as e:
            logger.error(f"Error updating job: {e}")
    
    def perform_data_cleanup(self):
        """Perform data cleanup to maintain 1-hour retention policy"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # Call the scheduled cleanup function we created
            cursor.execute("SELECT * FROM scheduled_cleanup()")
            result = cursor.fetchone()
            
            if result and result[0]:
                result_json = result[0]
                if result_json.get('success'):
                    logger.info(f"🧹 Data cleanup completed: Deleted {result_json['total_deleted']} records")
                    logger.info(f"   Games: {result_json['games_deleted']}, Odds: {result_json['odds_deleted']}")
                    logger.info(f"   Execution time: {result_json['execution_time_ms']}ms")
                else:
                    logger.error(f"❌ Data cleanup failed: {result_json.get('error', 'Unknown error')}")
            
            conn.commit()
            cursor.close()
            conn.close()
            
            # Update last cleanup time
            self.last_cleanup = datetime.utcnow()
            
        except Exception as e:
            logger.error(f"Error performing data cleanup: {e}")
    
    def should_run_cleanup(self):
        """Check if it's time to run cleanup"""
        time_since_last_cleanup = datetime.utcnow() - self.last_cleanup
        return time_since_last_cleanup.total_seconds() >= (self.cleanup_interval_minutes * 60)
    
    def write_endpoints_file(self, endpoints):
        """Write endpoints to file for Scrapy"""
        try:
            scrapy_endpoints = []
            for ep in endpoints:
                scrapy_endpoints.append({
                    'domain': ep['domain'],
                    'method': ep['method'],
                    'path': ep['path'],
                    'headers': ep.get('headers', {}),
                    'endpoint_id': ep['id']
                })
            
            with open('discovered_endpoints.json', 'w') as f:
                json.dump(scrapy_endpoints, f, indent=2)
                
            logger.info(f"Wrote {len(scrapy_endpoints)} endpoints to file")
            return True
            
        except Exception as e:
            logger.error(f"Error writing endpoints file: {e}")
            return False
    
    def run_scrapy(self, job_id):
        """Run Scrapy spider"""
        try:
            logger.info("Starting Scrapy spider...")
            
            result = subprocess.run(
                ["scrapy", "crawl", "odds_spider", "-L", "INFO"],
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0:
                logger.info("Scrapy completed successfully")
                
                # Count recent data
                conn = self.get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("SELECT COUNT(*) FROM games WHERE created_at > NOW() - INTERVAL '10 minutes'")
                games_count = cursor.fetchone()[0]
                
                cursor.execute("SELECT COUNT(*) FROM odds WHERE created_at > NOW() - INTERVAL '10 minutes'")
                odds_count = cursor.fetchone()[0]
                
                cursor.close()
                conn.close()
                
                stats = {
                    'endpoints_count': 1,
                    'games_scraped': games_count,
                    'odds_scraped': odds_count
                }
                
                self.update_job_record(job_id, 'completed', stats)
                return True
            else:
                logger.error(f"Scrapy failed with code {result.returncode}")
                logger.error(f"Error output: {result.stderr[:500]}...")
                self.update_job_record(job_id, 'failed', error=result.stderr)
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("Scrapy timed out")
            self.update_job_record(job_id, 'failed', error="Timeout")
            return False
        except Exception as e:
            logger.error(f"Error running Scrapy: {e}")
            self.update_job_record(job_id, 'failed', error=str(e))
            return False
    
    def process_endpoints(self):
        """Main processing loop"""
        while self.running:
            try:
                config = self.get_config()
                
                if config.get('scraping_enabled') != 'true':
                    logger.info("Scraping disabled in config")
                    time.sleep(60)
                    continue
                
                # Check if cleanup should be performed
                if self.should_run_cleanup():
                    logger.info("🧹 Running scheduled data cleanup...")
                    self.perform_data_cleanup()
                
                endpoints = self.get_pending_endpoints()
                
                if endpoints:
                    job = self.create_job_record()
                    if not job:
                        continue
                    
                    # Mark endpoints as active
                    for ep in endpoints:
                        self.update_endpoint_status(ep['id'], 'active')
                    
                    # Write endpoints file
                    if self.write_endpoints_file(endpoints):
                        success = self.run_scrapy(job)
                        
                        # Update endpoint statuses
                        for ep in endpoints:
                            status = 'success' if success else 'failed'
                            self.update_endpoint_status(ep['id'], status)
                    else:
                        self.update_job_record(job, 'failed', error="Failed to write endpoints")
                
                poll_interval = int(config.get('scrape_interval_seconds', self.poll_interval))
                logger.info(f"Sleeping for {poll_interval} seconds...")
                time.sleep(poll_interval)
                
            except KeyboardInterrupt:
                logger.info("Keyboard interrupt received")
                self.running = False
            except Exception as e:
                logger.error(f"Error in process loop: {e}")
                time.sleep(60)
    
    def run(self):
        """Start the monitor"""
        logger.info(f"Starting Direct Database Scrapy Monitor (PID: {os.getpid()})")
        logger.info(f"Worker ID: {self.worker_id}")
        logger.info(f"Database: {DB_CONFIG['host']}:{DB_CONFIG['port']}")
        
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        self.process_endpoints()
        
        logger.info("Scrapy Monitor stopped")

def main():
    monitor = ScrapyMonitorDirect()
    monitor.run()

if __name__ == "__main__":
    main()