#!/usr/bin/env python3
"""
Automated Scrapy Monitor - Polls Supabase for new endpoints and runs spiders
"""
import os
import sys
import json
import time
import requests
import subprocess
import logging
from datetime import datetime, timedelta
from threading import Thread
from queue import Queue
import signal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('ScrapyMonitor')

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL', 'http://localhost:54320')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0')

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

class ScrapyMonitor:
    def __init__(self):
        self.running = True
        self.endpoint_queue = Queue()
        self.worker_id = f"scrapy_monitor_{os.getpid()}"
        self.poll_interval = 30  # seconds - matches OddsJam's native polling frequency
        self.batch_size = 10  # endpoints per batch
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info("Shutdown signal received")
        self.running = False
        
    def get_config(self):
        """Get configuration from Supabase"""
        try:
            response = requests.get(
                f"{SUPABASE_URL}/scraping_config",
                headers=HEADERS
            )
            if response.ok:
                config = {}
                for item in response.json():
                    config[item['key']] = item['value']
                return config
            else:
                logger.error(f"Failed to get config: {response.status_code}")
                return {}
        except Exception as e:
            logger.error(f"Error getting config: {e}")
            return {}
    
    # NOTE: Discovered endpoints are now managed through URL manager for unified control
    # This method is kept for potential future use but not called in main processing loop

    def get_pending_urls(self):
        """Get URLs from URL manager that need scraping"""
        try:
            # Get active URLs that haven't been scraped recently
            # Use 30 seconds to match OddsJam's native polling frequency for API endpoints
            cutoff_time = (datetime.utcnow() - timedelta(seconds=30)).isoformat()
            
            query = f"select=*&active.eq.true&or=(last_scraped.is.null,last_scraped.lt.{cutoff_time})&limit={self.batch_size}"
            
            response = requests.get(
                f"{SUPABASE_URL}/sportsbook_urls?{query}",
                headers=HEADERS
            )
            
            if response.ok:
                urls = response.json()
                logger.info(f"Found {len(urls)} URLs to scrape from URL manager")
                return urls
            else:
                try:
                    error_details = response.json()
                    logger.error(f"Failed to get URLs: {response.status_code}, Details: {error_details}")
                except:
                    logger.error(f"Failed to get URLs: {response.status_code}, Response: {response.text}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting URLs: {e}")
            return []

    def get_pending_batch_jobs(self):
        """Get pending batch scraping jobs"""
        try:
            query = "select=*&status.eq.pending&limit=5"
            
            response = requests.get(
                f"{SUPABASE_URL}/batch_scraping_jobs?{query}",
                headers=HEADERS
            )
            
            if response.ok:
                jobs = response.json()
                logger.info(f"Found {len(jobs)} pending batch jobs")
                return jobs
            else:
                logger.error(f"Failed to get batch jobs: {response.status_code}")
                return []
                
        except Exception as e:
            logger.error(f"Error getting batch jobs: {e}")
            return []
    
    def update_endpoint_status(self, endpoint_id, status, error=None, endpoint_data=None):
        """Update endpoint scraping status"""
        try:
            data = {
                'scrape_status': status,
                'last_scraped': datetime.utcnow().isoformat()
            }
            
            # endpoint_id might be int or dict - handle both cases
            if isinstance(endpoint_id, dict):
                actual_id = endpoint_id['id']
                if status == 'success':
                    data['scrape_count'] = endpoint_id.get('scrape_count', 0) + 1
                elif status == 'failed' and error:
                    data['error_count'] = endpoint_id.get('error_count', 0) + 1
                    data['last_error'] = str(error)
            elif isinstance(endpoint_data, dict):
                actual_id = endpoint_id
                if status == 'success':
                    data['scrape_count'] = endpoint_data.get('scrape_count', 0) + 1
                elif status == 'failed' and error:
                    data['error_count'] = endpoint_data.get('error_count', 0) + 1
                    data['last_error'] = str(error)
            else:
                actual_id = endpoint_id
            
            response = requests.patch(
                f"{SUPABASE_URL}/discovered_endpoints?id=eq.{actual_id}",
                headers=HEADERS,
                json=data
            )
            
            if response.ok:
                logger.debug(f"Updated endpoint {endpoint_id} status to {status}")
            else:
                logger.error(f"Failed to update endpoint status: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error updating endpoint status: {e}")

    def update_url_status(self, url_id, status, error=None, url_data=None):
        """Update URL manager scraping status"""
        try:
            data = {
                'last_scraped': datetime.utcnow().isoformat()
            }
            
            # Handle url_id and url_data similar to endpoint handling
            if isinstance(url_id, dict):
                actual_id = url_id['id']
                if status == 'success':
                    data['scrape_count'] = url_id.get('scrape_count', 0) + 1
                    data['success_count'] = url_id.get('success_count', 0) + 1
                elif status == 'failed' and error:
                    data['scrape_count'] = url_id.get('scrape_count', 0) + 1
                    # Note: URL manager doesn't have error_count field, but tracks success_count
            elif isinstance(url_data, dict):
                actual_id = url_id
                if status == 'success':
                    data['scrape_count'] = url_data.get('scrape_count', 0) + 1
                    data['success_count'] = url_data.get('success_count', 0) + 1
                elif status == 'failed' and error:
                    data['scrape_count'] = url_data.get('scrape_count', 0) + 1
            else:
                actual_id = url_id
                # Without url_data, can't update counts, just timestamp
            
            response = requests.patch(
                f"{SUPABASE_URL}/sportsbook_urls?id=eq.{actual_id}",
                headers=HEADERS,
                json=data
            )
            
            if response.ok:
                logger.debug(f"Updated URL {url_id} scrape status")
            else:
                logger.error(f"Failed to update URL status: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error updating URL status: {e}")

    def update_batch_job_status(self, job_id, status, stats=None, error=None):
        """Update batch job status"""
        try:
            data = {
                'status': status,
                'updated_at': datetime.utcnow().isoformat()
            }
            
            if status == 'running':
                data['started_at'] = datetime.utcnow().isoformat()
            elif status in ['completed', 'failed']:
                data['completed_at'] = datetime.utcnow().isoformat()
            
            if stats:
                data.update(stats)
            if error:
                data['error_message'] = str(error)
            
            response = requests.patch(
                f"{SUPABASE_URL}/batch_scraping_jobs?id=eq.{job_id}",
                headers=HEADERS,
                json=data
            )
            
            if response.ok:
                logger.debug(f"Updated batch job {job_id} status to {status}")
            else:
                logger.error(f"Failed to update batch job: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error updating batch job status: {e}")
    
    def create_job_record(self):
        """Create a job record in Supabase"""
        try:
            data = {
                'job_type': 'data_scraping',
                'status': 'running',
                'started_at': datetime.utcnow().isoformat(),
                'worker_id': self.worker_id
            }
            
            headers_with_return = HEADERS.copy()
            headers_with_return['Prefer'] = 'return=representation'
            
            response = requests.post(
                f"{SUPABASE_URL}/scraping_jobs",
                headers=headers_with_return,
                json=data
            )
            
            if response.ok:
                job = response.json()[0] if response.json() else None
                logger.info(f"Created job record: {job['id'] if job else 'Unknown'}")
                return job
            else:
                try:
                    error_details = response.json()
                    logger.error(f"Failed to create job: {response.status_code}, Details: {error_details}")
                except:
                    logger.error(f"Failed to create job: {response.status_code}, Response: {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Error creating job: {e}")
            logger.error(f"Response status: {response.status_code if 'response' in locals() else 'No response'}")
            logger.error(f"Response text: {response.text if 'response' in locals() else 'No response'}")
            return None
    
    def update_job_record(self, job_id, status, stats=None, error=None):
        """Update job record"""
        try:
            data = {
                'status': status,
                'completed_at': datetime.utcnow().isoformat() if status in ['completed', 'failed'] else None
            }
            
            if stats:
                data.update(stats)
            if error:
                data['error_message'] = str(error)
            
            response = requests.patch(
                f"{SUPABASE_URL}/scraping_jobs?id=eq.{job_id}",
                headers=HEADERS,
                json=data
            )
            
            if response.ok:
                logger.debug(f"Updated job {job_id} status to {status}")
            else:
                logger.error(f"Failed to update job: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error updating job: {e}")
    
    def write_endpoints_file(self, endpoints, urls=None):
        """Write endpoints and URLs to file for Scrapy"""
        try:
            # Convert endpoints to Scrapy format
            scrapy_endpoints = []
            for ep in endpoints:
                scrapy_endpoints.append({
                    'domain': ep['domain'],
                    'method': ep['method'],
                    'path': ep['path'],
                    'headers': ep.get('headers', {}),
                    'endpoint_id': ep['id']  # Track for updates
                })
            
            with open('discovered_endpoints.json', 'w') as f:
                json.dump(scrapy_endpoints, f, indent=2)
                
            logger.info(f"Wrote {len(scrapy_endpoints)} endpoints to file")
            
            # Also write URLs to separate file if provided
            if urls:
                scrapy_urls = []
                for url in urls:
                    # Convert full URLs to domain/path format for consistency  
                    try:
                        from urllib.parse import urlparse
                        parsed = urlparse(url['url'])
                        
                        # Find associated endpoints for this domain
                        associated_endpoints = []
                        domain = parsed.netloc
                        for ep in endpoints:
                            if ep['domain'] == domain and ep['scrape_status'] == 'success':
                                # Add relevant endpoints for this sport/league
                                ep_path = ep['path'].lower()
                                url_sport = url.get('sport', '').lower()
                                url_league = url.get('league', '').lower()
                                
                                # Check if endpoint matches URL's sport/league
                                if (url_sport and url_sport in ep_path) or (url_league and url_league in ep_path):
                                    associated_endpoints.append({
                                        'domain': ep['domain'],
                                        'method': ep['method'],
                                        'path': ep['path'],
                                        'headers': ep.get('headers', {})
                                    })
                        
                        scrapy_url = {
                            'domain': parsed.netloc,
                            'method': 'GET',
                            'path': parsed.path + ('?' + parsed.query if parsed.query else ''),
                            'headers': {
                                'User-Agent': 'Mozilla/5.0',
                                'Accept': 'application/json'
                            },
                            'url_id': url['id'],  # Track for updates
                            'sport': url.get('sport'),
                            'league': url.get('league'),
                            'scrape_source': 'url_manager'
                        }
                        
                        # Add associated endpoints if found
                        if associated_endpoints:
                            scrapy_url['associated_endpoints'] = associated_endpoints
                            logger.info(f"URL {url['url']} has {len(associated_endpoints)} associated endpoints")
                            
                        scrapy_urls.append(scrapy_url)
                        
                    except Exception as parse_error:
                        logger.error(f"Error parsing URL {url['url']}: {parse_error}")
                        continue
                
                with open('url_manager_urls.json', 'w') as f:
                    json.dump(scrapy_urls, f, indent=2)
                    
                logger.info(f"Wrote {len(scrapy_urls)} URLs from URL manager to file")
            
            return True
            
        except Exception as e:
            logger.error(f"Error writing endpoints file: {e}")
            return False
    
    def run_scrapy(self, job_id):
        """Run Scrapy spider"""
        try:
            logger.info("Starting Scrapy spider...")
            
            cmd = ["scrapy", "crawl", "odds_spider", "-L", "INFO"]
            result = subprocess.run(
                cmd, 
                capture_output=True, 
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                logger.info("Scrapy completed successfully")
                # Parse stats from output if needed
                stats = {
                    'endpoints_count': len(self.endpoint_queue.queue),
                    'games_scraped': 0,  # Parse from output
                    'odds_scraped': 0    # Parse from output
                }
                self.update_job_record(job_id, 'completed', stats)
                return True
            else:
                logger.error(f"Scrapy failed with code {result.returncode}")
                logger.error(f"Error output: {result.stderr}")
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
    
    def process_endpoints_and_urls(self):
        """Main processing loop for both endpoints and URLs"""
        while self.running:
            try:
                # Get configuration
                config = self.get_config()
                
                # Check if scraping is enabled
                if config.get('scraping_enabled') != 'true':
                    logger.info("Scraping disabled in config")
                    time.sleep(60)
                    continue
                
                # Get pending work items - URL manager is single source of truth
                urls = self.get_pending_urls()
                batch_jobs = self.get_pending_batch_jobs()
                # Note: endpoints are now managed through URL manager, not scraped independently
                
                # Process batch jobs first (higher priority)
                for batch_job in batch_jobs:
                    logger.info(f"Processing batch job: {batch_job['job_name']}")
                    self.update_batch_job_status(batch_job['id'], 'running')
                    
                    # Get URLs for this batch job
                    batch_url_ids = batch_job.get('url_ids', [])
                    if batch_url_ids:
                        try:
                            # Get URL details for the batch
                            url_ids_str = ','.join(map(str, batch_url_ids))
                            response = requests.get(
                                f"{SUPABASE_URL}/sportsbook_urls?id=in.({url_ids_str})",
                                headers=HEADERS
                            )
                            
                            if response.ok:
                                batch_urls = response.json()
                                logger.info(f"Processing {len(batch_urls)} URLs in batch job")
                                
                                # Process batch URLs
                                success = self.process_url_batch(batch_urls, batch_job['id'])
                                
                                # Update batch job status
                                if success:
                                    self.update_batch_job_status(batch_job['id'], 'completed')
                                else:
                                    self.update_batch_job_status(batch_job['id'], 'failed')
                            else:
                                logger.error(f"Failed to get batch URLs: {response.status_code}")
                                self.update_batch_job_status(batch_job['id'], 'failed', error="Could not retrieve URLs")
                        except Exception as batch_error:
                            logger.error(f"Error processing batch job: {batch_error}")
                            self.update_batch_job_status(batch_job['id'], 'failed', error=str(batch_error))
                
                # Process individual URLs if no batch jobs (endpoints now managed through URL manager)
                if not batch_jobs and urls:
                    # Create job record
                    job = self.create_job_record()
                    if not job:
                        continue
                    
                    # Mark URLs as active
                    for url in urls:
                        url_id = url['id'] if isinstance(url, dict) else url
                        self.update_url_status(url_id, 'active', url_data=url if isinstance(url, dict) else None)
                    
                    # Get API endpoints for the URLs
                    endpoints = self.get_active_endpoints()
                    
                    # Write endpoints and URLs for Scrapy
                    if self.write_endpoints_file(endpoints, urls):
                        # Run Scrapy
                        success = self.run_scrapy(job['id'])
                        
                        # Update URL statuses
                        for url in urls:
                            status = 'success' if success else 'failed'
                            url_id = url['id'] if isinstance(url, dict) else url
                            self.update_url_status(url_id, status, url_data=url if isinstance(url, dict) else None)
                    else:
                        self.update_job_record(job['id'], 'failed', error="Failed to write URLs")
                
                # Sleep before next poll with interrupt checking
                poll_interval = int(config.get('scrape_interval_seconds', self.poll_interval))
                logger.info(f"Sleeping for {poll_interval} seconds...")
                for _ in range(poll_interval):
                    if not self.running:
                        break
                    time.sleep(1)
                
            except KeyboardInterrupt:
                logger.info("Keyboard interrupt received")
                self.running = False
            except Exception as e:
                logger.error(f"Error in process loop: {e}")
                time.sleep(60)  # Sleep on error

    def process_url_batch(self, urls, job_id):
        """Process a batch of URLs"""
        try:
            logger.info(f"Processing batch of {len(urls)} URLs")
            
            # Mark all URLs as active
            for url in urls:
                self.update_url_status(url['id'], 'active', url_data=url)
            
            # Write URLs to file
            if self.write_endpoints_file([], urls):
                # Run Scrapy for this batch
                success = self.run_scrapy(job_id)
                
                # Update all URL statuses
                for url in urls:
                    status = 'success' if success else 'failed'
                    self.update_url_status(url['id'], status, url_data=url)
                
                return success
            else:
                logger.error("Failed to write URLs file for batch")
                return False
                
        except Exception as e:
            logger.error(f"Error processing URL batch: {e}")
            return False
    
    def run(self):
        """Start the monitor"""
        logger.info(f"Starting Scrapy Monitor (PID: {os.getpid()})")
        logger.info(f"Worker ID: {self.worker_id}")
        logger.info(f"Supabase URL: {SUPABASE_URL}")
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Start processing
        self.process_endpoints_and_urls()
        
        logger.info("Scrapy Monitor stopped")

def main():
    """Main entry point"""
    monitor = ScrapyMonitor()
    monitor.run()

if __name__ == "__main__":
    main()