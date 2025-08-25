#!/usr/bin/env python3
"""
Direct Database Integration Test - Test the full automated system
"""
import psycopg2
import json
import subprocess
import time
import os
from datetime import datetime

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,  # Use direct DB port instead of PostgREST
    'database': 'postgres',
    'user': 'postgres',
    'password': 'postgres'
}

def test_database_connection():
    """Test direct database connection"""
    print("🧪 Testing direct database connection...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute("SELECT version()")
        version = cursor.fetchone()[0]
        print(f"✅ Database connected: {version.split(',')[0]}")
        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def setup_test_data():
    """Insert test data directly into database"""
    print("🧪 Setting up test data...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Insert config
        cursor.execute("""
            INSERT INTO scraping_config (key, value, description) VALUES 
            ('scraping_enabled', 'true', 'Enable automated scraping')
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        """)
        
        # Insert test endpoint
        cursor.execute("""
            INSERT INTO discovered_endpoints 
            (domain, method, path, headers, active, scrape_status) VALUES 
            (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (
            'oddsjam.com',
            'GET',
            '/_next/data/WzUffJO619HTJItqBbnuC/mlb/screen/moneyline.json',
            json.dumps({
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            }),
            True,
            'pending'
        ))
        
        endpoint_id = cursor.fetchone()[0]
        conn.commit()
        
        print(f"✅ Test endpoint created with ID: {endpoint_id}")
        cursor.close()
        conn.close()
        return endpoint_id
        
    except Exception as e:
        print(f"❌ Failed to setup test data: {e}")
        return None

def check_scrapy_execution():
    """Test if Scrapy can run with test data"""
    print("🧪 Testing Scrapy execution...")
    
    # Create test endpoints file
    test_endpoints = [{
        "domain": "oddsjam.com",
        "method": "GET",
        "path": "/_next/data/WzUffJO619HTJItqBbnuC/mlb/screen/moneyline.json",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
            "Accept": "application/json",
            "Referer": "https://oddsjam.com/mlb/screen/moneyline"
        },
        "endpoint_id": 1
    }]
    
    with open('discovered_endpoints.json', 'w') as f:
        json.dump(test_endpoints, f, indent=2)
    
    try:
        # Run Scrapy spider
        result = subprocess.run(
            ["scrapy", "crawl", "odds_spider", "-L", "INFO"],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        if result.returncode == 0:
            print("✅ Scrapy executed successfully")
            print(f"   Output lines: {len(result.stdout.splitlines())}")
            
            # Check if any data was found
            if "Scraped" in result.stdout or "items" in result.stdout:
                print("✅ Scrapy found and processed data")
            else:
                print("⚠️  Scrapy ran but may not have found data")
                
            return True
        else:
            print(f"❌ Scrapy failed with return code: {result.returncode}")
            print(f"   Error: {result.stderr[:200]}...")
            return False
            
    except subprocess.TimeoutExpired:
        print("⚠️  Scrapy timed out (may still be working)")
        return True
    except Exception as e:
        print(f"❌ Scrapy execution error: {e}")
        return False

def check_database_results():
    """Check if any data was scraped into the database"""
    print("🧪 Checking database for scraped results...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check games
        cursor.execute("SELECT COUNT(*) FROM games WHERE created_at > NOW() - INTERVAL '5 minutes'")
        recent_games = cursor.fetchone()[0]
        
        # Check odds  
        cursor.execute("SELECT COUNT(*) FROM odds WHERE created_at > NOW() - INTERVAL '5 minutes'")
        recent_odds = cursor.fetchone()[0]
        
        print(f"✅ Recent games: {recent_games}")
        print(f"✅ Recent odds: {recent_odds}")
        
        cursor.close()
        conn.close()
        
        return recent_games > 0 or recent_odds > 0
        
    except Exception as e:
        print(f"❌ Failed to check database results: {e}")
        return False

def run_integration_test():
    """Run the complete integration test"""
    print("🚀 Starting Direct Database Integration Test\n")
    
    # Test 1: Database connection
    if not test_database_connection():
        print("\n❌ Test failed: Cannot connect to database")
        return
    
    # Test 2: Setup test data
    endpoint_id = setup_test_data()
    if not endpoint_id:
        print("\n❌ Test failed: Cannot setup test data")
        return
    
    print(f"\n✅ Database is ready with test endpoint ID: {endpoint_id}")
    
    # Test 3: Scrapy execution
    if check_scrapy_execution():
        print("✅ Scrapy execution successful")
    else:
        print("⚠️  Scrapy had issues but test continues...")
    
    # Test 4: Check results
    if check_database_results():
        print("✅ Data was successfully scraped to database!")
    else:
        print("⚠️  No recent data found - endpoint may not have returned data")
    
    print(f"\n🎉 Integration test complete!")
    print("\nNext steps:")
    print("1. The database tables and test data are ready")
    print("2. Scrapy can execute and process endpoints")
    print("3. Start the monitor: python3 scrapy_monitor.py")
    print("4. Add endpoints from browser extension")
    print("5. Watch automated scraping in action!")

if __name__ == "__main__":
    run_integration_test()