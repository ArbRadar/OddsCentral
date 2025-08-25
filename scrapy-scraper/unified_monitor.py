#!/usr/bin/env python3
"""
Unified Scrapy Monitor - Clean architecture using database configuration
Replaces scrapy_monitor.py with simplified, modular approach
"""
import os
import sys
import time
import logging
import subprocess
import signal
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('UnifiedMonitor')

class UnifiedMonitor:
    def __init__(self):
        self.running = True
        self.worker_id = f"unified_monitor_{os.getpid()}"
        
        # Database configuration
        self.supabase_url = 'http://localhost:54320'
        self.supabase_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
        
        # Load poll interval from config
        self.poll_interval = self.load_poll_interval()
    
    def load_poll_interval(self):
        """Load poll interval from database config"""
        try:
            import requests
            headers = {
                'apikey': self.supabase_key,
                'Authorization': f'Bearer {self.supabase_key}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(
                f"{self.supabase_url}/scraping_config?key=eq.poll_interval_seconds",
                headers=headers
            )
            
            if response.ok and response.json():
                interval = int(response.json()[0]['value'])
                logger.info(f"Loaded poll interval from config: {interval} seconds")
                return interval
            else:
                logger.warning("Could not load poll interval from config, using default: 30 seconds")
                return 30
                
        except Exception as e:
            logger.error(f"Error loading poll interval: {e}, using default: 30 seconds")
            return 30
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        logger.info("Shutdown signal received")
        self.running = False
        
    def run(self):
        """Main monitoring loop"""
        logger.info(f"Starting Unified Monitor (PID: {os.getpid()})")
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
        consecutive_errors = 0
        max_errors = 5
        
        while self.running:
            try:
                logger.info("Checking for scraping targets...")
                
                # Check if any targets need scraping
                if self.should_run_scraping():
                    logger.info("Running scrapy spider...")
                    result = self.run_scrapy_spider()
                    
                    if result == 0:
                        consecutive_errors = 0
                        logger.info("Scrapy run completed successfully")
                        self.update_target_timestamps()
                    else:
                        consecutive_errors += 1
                        logger.error(f"Scrapy run failed with exit code {result}")
                        
                        if consecutive_errors >= max_errors:
                            logger.error(f"Too many consecutive errors ({max_errors}), stopping monitor")
                            break
                else:
                    logger.info("No targets need scraping at this time")
                
                # Sleep with periodic wake-up to check shutdown flag
                for _ in range(self.poll_interval):
                    if not self.running:
                        break
                    time.sleep(1)
                    
            except KeyboardInterrupt:
                logger.info("Received keyboard interrupt")
                break
            except Exception as e:
                consecutive_errors += 1
                logger.error(f"Unexpected error in main loop: {e}")
                
                if consecutive_errors >= max_errors:
                    logger.error(f"Too many consecutive errors ({max_errors}), stopping monitor")
                    break
                    
                # Brief pause before retrying
                time.sleep(5)
        
        logger.info("Unified Monitor stopped")
    
    def should_run_scraping(self):
        """Check if any enabled targets need scraping"""
        try:
            import requests
            headers = {
                'apikey': self.supabase_key,
                'Authorization': f'Bearer {self.supabase_key}',
                'Content-Type': 'application/json'
            }
            
            # Get enabled targets that haven't been scraped recently
            # Add 10% buffer to prevent race conditions
            buffer = int(self.poll_interval * 1.1)
            cutoff_time = (datetime.utcnow() - timedelta(seconds=buffer)).isoformat()
            
            query = f"select=*&enabled=eq.true&or=(last_scraped.is.null,last_scraped.lt.{cutoff_time})"
            
            response = requests.get(
                f"{self.supabase_url}/scraping_targets?{query}",
                headers=headers
            )
            
            if response.ok:
                targets = response.json()
                logger.info(f"Found {len(targets)} targets that need scraping")
                return len(targets) > 0
            else:
                logger.error(f"Failed to check targets: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"Error checking scraping targets: {e}")
            return False
    
    def run_scrapy_spider(self):
        """Execute the unified scrapy spider"""
        try:
            # Run scrapy with the unified spider
            cmd = [
                'scrapy', 'crawl', 'unified',
                '-s', 'LOG_LEVEL=INFO'
            ]
            
            logger.info(f"Executing: {' '.join(cmd)}")
            
            # Run the command and capture output
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            # Log scrapy output
            if result.stdout:
                for line in result.stdout.split('\n'):
                    if line.strip():
                        logger.info(f"SCRAPY: {line}")
            
            if result.stderr:
                for line in result.stderr.split('\n'):
                    if line.strip():
                        logger.warning(f"SCRAPY STDERR: {line}")
            
            return result.returncode
            
        except subprocess.TimeoutExpired:
            logger.error("Scrapy command timed out")
            return 1
        except Exception as e:
            logger.error(f"Error running scrapy: {e}")
            return 1
    
    def update_target_timestamps(self):
        """Update last_scraped timestamps for processed targets"""
        try:
            import requests
            headers = {
                'apikey': self.supabase_key,
                'Authorization': f'Bearer {self.supabase_key}',
                'Content-Type': 'application/json'
            }
            
            # Update all enabled targets' timestamps
            now = datetime.utcnow().isoformat()
            
            response = requests.patch(
                f"{self.supabase_url}/scraping_targets?enabled=eq.true",
                headers=headers,
                json={'last_scraped': now, 'updated_at': now}
            )
            
            if response.ok:
                logger.info("Updated target timestamps")
            else:
                logger.warning(f"Failed to update timestamps: {response.status_code}")
                
        except Exception as e:
            logger.error(f"Error updating timestamps: {e}")

def main():
    """Main entry point"""
    monitor = UnifiedMonitor()
    
    try:
        monitor.run()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()