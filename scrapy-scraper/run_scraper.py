#!/usr/bin/env python3
"""
Simple script to run the sportsbook scraper
"""
import os
import sys
import subprocess
from datetime import datetime

def run_scraper():
    """Run the odds spider"""
    print("="*60)
    print("SPORTSBOOK SCRAPY SCRAPER")
    print("="*60)
    print(f"Started at: {datetime.now()}")
    print(f"Working directory: {os.getcwd()}")
    print()
    
    # Run the spider
    try:
        cmd = ["scrapy", "crawl", "odds_spider", "-L", "INFO"]
        print(f"Running command: {' '.join(cmd)}")
        print()
        
        result = subprocess.run(cmd, capture_output=False, text=True, cwd=".")
        
        print()
        print("="*60)
        print(f"Scraper finished with exit code: {result.returncode}")
        print(f"Finished at: {datetime.now()}")
        print("="*60)
        
        return result.returncode == 0
        
    except FileNotFoundError:
        print("❌ Error: Scrapy not found. Make sure it's installed:")
        print("pip install scrapy")
        return False
    except Exception as e:
        print(f"❌ Error running scraper: {e}")
        return False

if __name__ == "__main__":
    success = run_scraper()
    sys.exit(0 if success else 1)