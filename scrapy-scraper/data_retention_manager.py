#!/usr/bin/env python3
"""
Data Retention Manager - Implements 1-hour data retention policy
Automatically cleans up old data from the database
"""
import psycopg2
import logging
import time
import signal
import sys
from datetime import datetime, timedelta
from threading import Thread, Event

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('DataRetentionManager')

class DataRetentionManager:
    def __init__(self, db_config=None):
        self.db_config = db_config or {
            'host': 'localhost',
            'port': 5433,
            'database': 'postgres',
            'user': 'postgres',
            'password': 'postgres'
        }
        self.running = True
        self.cleanup_interval = 600  # 10 minutes in seconds
        self.retention_hours = 1  # Keep only 1 hour of data
        self.stop_event = Event()
        
    def get_db_connection(self):
        """Get database connection"""
        return psycopg2.connect(**self.db_config)
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info("Shutdown signal received")
        self.running = False
        self.stop_event.set()
    
    def check_data_age(self):
        """Check current data age statistics"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # Use the data_age_monitor view we created
            cursor.execute("SELECT * FROM data_age_monitor")
            results = cursor.fetchall()
            
            logger.info("=== Data Age Statistics ===")
            for row in results:
                table_name, total, recent, old, oldest, newest = row
                logger.info(f"{table_name}: Total={total}, Recent={recent}, Old={old}")
                if oldest:
                    age = datetime.now(oldest.tzinfo) - oldest
                    logger.info(f"  Oldest record: {oldest} (Age: {age})")
                if newest:
                    logger.info(f"  Newest record: {newest}")
            logger.info("========================")
            
            cursor.close()
            conn.close()
            
            return results
            
        except Exception as e:
            logger.error(f"Error checking data age: {e}")
            return []
    
    def perform_cleanup(self):
        """Perform the actual cleanup operation"""
        try:
            conn = self.get_db_connection()
            cursor = conn.cursor()
            
            # Call our cleanup function
            cursor.execute("SELECT * FROM scheduled_cleanup()")
            result = cursor.fetchone()[0]  # Get the JSONB result
            
            conn.commit()
            cursor.close()
            conn.close()
            
            if result.get('success'):
                logger.info(f"✅ Cleanup successful: Deleted {result['total_deleted']} records")
                logger.info(f"   Games deleted: {result['games_deleted']}")
                logger.info(f"   Odds deleted: {result['odds_deleted']}")
                logger.info(f"   Execution time: {result['execution_time_ms']}ms")
            else:
                logger.error(f"❌ Cleanup failed: {result.get('error', 'Unknown error')}")
            
            return result
            
        except Exception as e:
            logger.error(f"Error performing cleanup: {e}")
            return {'success': False, 'error': str(e)}
    
    def cleanup_scrapy_cache(self):
        """Clean up any local Scrapy cache files"""
        try:
            import os
            import shutil
            
            # Clean up any temporary files or caches
            cache_dirs = [
                '.scrapy',
                '__pycache__',
                'scrapy_cache'
            ]
            
            for cache_dir in cache_dirs:
                if os.path.exists(cache_dir):
                    try:
                        shutil.rmtree(cache_dir)
                        logger.info(f"Cleaned up cache directory: {cache_dir}")
                    except Exception as e:
                        logger.warning(f"Could not clean {cache_dir}: {e}")
            
            # Clean up old log files
            for file in os.listdir('.'):
                if file.endswith('.log') and file.startswith('scrapy_'):
                    try:
                        file_time = os.path.getmtime(file)
                        if time.time() - file_time > 3600:  # Older than 1 hour
                            os.remove(file)
                            logger.info(f"Removed old log file: {file}")
                    except Exception as e:
                        logger.warning(f"Could not remove {file}: {e}")
                        
        except Exception as e:
            logger.error(f"Error cleaning Scrapy cache: {e}")
    
    def run_cleanup_cycle(self):
        """Run a single cleanup cycle"""
        logger.info("Starting cleanup cycle...")
        
        # Check data age before cleanup
        self.check_data_age()
        
        # Perform database cleanup
        result = self.perform_cleanup()
        
        # Clean up local caches
        self.cleanup_scrapy_cache()
        
        # Check data age after cleanup
        self.check_data_age()
        
        return result
    
    def run(self):
        """Main loop - runs cleanup on schedule"""
        logger.info("Data Retention Manager started")
        logger.info(f"Retention policy: {self.retention_hours} hour(s)")
        logger.info(f"Cleanup interval: {self.cleanup_interval} seconds")
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Run initial cleanup
        self.run_cleanup_cycle()
        
        while self.running:
            # Wait for the specified interval or until stopped
            if self.stop_event.wait(self.cleanup_interval):
                break
            
            if self.running:
                self.run_cleanup_cycle()
        
        logger.info("Data Retention Manager stopped")
    
    def run_once(self):
        """Run cleanup once and exit"""
        logger.info("Running one-time cleanup...")
        result = self.run_cleanup_cycle()
        return result

def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Data Retention Manager')
    parser.add_argument('--once', action='store_true', 
                       help='Run cleanup once and exit')
    parser.add_argument('--interval', type=int, default=600,
                       help='Cleanup interval in seconds (default: 600)')
    parser.add_argument('--retention', type=int, default=1,
                       help='Data retention in hours (default: 1)')
    parser.add_argument('--host', default='localhost',
                       help='Database host')
    parser.add_argument('--port', type=int, default=5433,
                       help='Database port')
    parser.add_argument('--database', default='postgres',
                       help='Database name')
    parser.add_argument('--user', default='postgres',
                       help='Database user')
    parser.add_argument('--password', default='postgres',
                       help='Database password')
    
    args = parser.parse_args()
    
    db_config = {
        'host': args.host,
        'port': args.port,
        'database': args.database,
        'user': args.user,
        'password': args.password
    }
    
    manager = DataRetentionManager(db_config)
    manager.cleanup_interval = args.interval
    manager.retention_hours = args.retention
    
    if args.once:
        result = manager.run_once()
        sys.exit(0 if result.get('success') else 1)
    else:
        manager.run()

if __name__ == "__main__":
    main()