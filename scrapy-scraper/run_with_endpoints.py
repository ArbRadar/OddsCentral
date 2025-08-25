#!/usr/bin/env python3
"""
Run Scrapy with endpoints exported from browser extension
"""
import os
import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path

def find_latest_endpoints_file():
    """Find the most recent endpoints file exported from extension"""
    downloads_dir = Path.home() / "Downloads"
    
    # Look for scrapy_endpoints_*.json files
    endpoint_files = list(downloads_dir.glob("scrapy_endpoints_*.json"))
    
    if not endpoint_files:
        # Also check current directory
        endpoint_files = list(Path(".").glob("scrapy_endpoints_*.json"))
    
    if not endpoint_files:
        print("❌ No endpoints file found. Export from browser extension first.")
        return None
    
    # Get the most recent file
    latest_file = max(endpoint_files, key=lambda p: p.stat().st_mtime)
    return latest_file

def validate_endpoints_file(filepath):
    """Validate the endpoints file structure"""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
            
        if 'endpoints' not in data:
            print("❌ Invalid endpoints file: missing 'endpoints' key")
            return False
            
        endpoint_count = len(data.get('endpoints', []))
        print(f"✅ Found {endpoint_count} endpoints in {filepath.name}")
        print(f"   Exported at: {data.get('exported_at', 'Unknown')}")
        print(f"   Source: {data.get('source', 'Unknown')}")
        
        return True
        
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in endpoints file: {e}")
        return False
    except Exception as e:
        print(f"❌ Error reading endpoints file: {e}")
        return False

def copy_endpoints_to_scrapy(source_file):
    """Copy endpoints file to Scrapy directory"""
    dest_file = Path("discovered_endpoints.json")
    
    try:
        with open(source_file, 'r') as f:
            data = json.load(f)
        
        # Convert to simple format expected by spider
        simplified_endpoints = data.get('endpoints', [])
        
        with open(dest_file, 'w') as f:
            json.dump(simplified_endpoints, f, indent=2)
            
        print(f"✅ Copied endpoints to {dest_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error copying endpoints: {e}")
        return False

def run_scrapy():
    """Run the Scrapy spider"""
    print("\n" + "="*60)
    print("RUNNING SCRAPY WITH BROWSER EXTENSION ENDPOINTS")
    print("="*60)
    print(f"Started at: {datetime.now()}")
    print()
    
    cmd = ["scrapy", "crawl", "odds_spider", "-L", "INFO"]
    print(f"Running: {' '.join(cmd)}")
    print()
    
    try:
        result = subprocess.run(cmd, capture_output=False, text=True)
        
        print()
        print("="*60)
        print(f"Scrapy finished with exit code: {result.returncode}")
        print(f"Finished at: {datetime.now()}")
        print("="*60)
        
        return result.returncode == 0
        
    except FileNotFoundError:
        print("❌ Error: Scrapy not found. Make sure it's installed:")
        print("pip install scrapy")
        return False
    except Exception as e:
        print(f"❌ Error running Scrapy: {e}")
        return False

def main():
    """Main entry point"""
    print("🔍 Looking for exported endpoints from browser extension...")
    
    # Find latest endpoints file
    endpoints_file = find_latest_endpoints_file()
    if not endpoints_file:
        return 1
    
    print(f"\n📄 Using endpoints file: {endpoints_file}")
    
    # Validate the file
    if not validate_endpoints_file(endpoints_file):
        return 1
    
    # Copy to Scrapy directory
    if not copy_endpoints_to_scrapy(endpoints_file):
        return 1
    
    # Run Scrapy
    success = run_scrapy()
    
    if success:
        print("\n✅ SUCCESS: Scrapy completed successfully!")
        print("\nNext steps:")
        print("1. Check your Supabase database for new data")
        print("2. View analytics in browser extension")
        print("3. Export new endpoints as sites change")
    else:
        print("\n❌ FAILED: Check logs above for errors")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())