#!/usr/bin/env python3
"""
Integration Test Script - Verify the automated scraping system works end-to-end
"""
import requests
import json
import time
import sys
from datetime import datetime

# Supabase configuration
SUPABASE_URL = 'http://localhost:54320/rest/v1'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

def test_supabase_connection():
    """Test if Supabase is accessible"""
    print("🧪 Testing Supabase connection...")
    try:
        response = requests.get(f"{SUPABASE_URL}/scraping_config", headers=HEADERS)
        if response.ok:
            print("✅ Supabase connection successful")
            return True
        else:
            print(f"❌ Supabase connection failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Supabase connection error: {e}")
        return False

def setup_test_data():
    """Insert test endpoint and configuration"""
    print("🧪 Setting up test data...")
    
    # Enable scraping in config
    config_data = {'value': 'true'}
    response = requests.patch(
        f"{SUPABASE_URL}/scraping_config?key=eq.scraping_enabled",
        headers=HEADERS,
        json=config_data
    )
    
    if response.ok:
        print("✅ Scraping enabled in config")
    else:
        print(f"❌ Failed to enable scraping: {response.status_code}")
    
    # Add test endpoint
    endpoint_data = {
        "domain": "oddsjam.com",
        "method": "GET", 
        "path": "/_next/data/WzUffJO619HTJItqBbnuC/mlb/screen/moneyline.json",
        "headers": {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept": "application/json",
            "Referer": "https://oddsjam.com/mlb/screen/moneyline"
        },
        "active": True,
        "scrape_status": "pending"
    }
    
    response = requests.post(
        f"{SUPABASE_URL}/discovered_endpoints",
        headers=HEADERS,
        json=endpoint_data
    )
    
    if response.ok:
        endpoint = response.json()[0]
        print(f"✅ Test endpoint created with ID: {endpoint['id']}")
        return endpoint['id']
    else:
        print(f"❌ Failed to create test endpoint: {response.status_code}")
        print(response.text)
        return None

def check_monitor_status():
    """Check if monitor is processing endpoints"""
    print("🧪 Checking monitor activity...")
    
    # Check recent jobs
    response = requests.get(
        f"{SUPABASE_URL}/scraping_jobs?order=created_at.desc&limit=5",
        headers=HEADERS
    )
    
    if response.ok:
        jobs = response.json()
        if jobs:
            latest_job = jobs[0]
            print(f"✅ Latest job: {latest_job['status']} at {latest_job['created_at']}")
            print(f"   Worker: {latest_job.get('worker_id', 'Unknown')}")
        else:
            print("⚠️  No jobs found - monitor may not be running")
    else:
        print(f"❌ Failed to check jobs: {response.status_code}")

def check_scraped_data():
    """Check if data was scraped successfully"""
    print("🧪 Checking scraped data...")
    
    # Check games
    response = requests.get(
        f"{SUPABASE_URL}/games?order=created_at.desc&limit=5",
        headers=HEADERS
    )
    
    if response.ok:
        games = response.json()
        print(f"✅ Found {len(games)} recent games")
        if games:
            for game in games[:2]:  # Show first 2
                print(f"   Game: {game['away_team']} @ {game['home_team']} ({game['league']})")
    else:
        print(f"❌ Failed to check games: {response.status_code}")
    
    # Check odds
    response = requests.get(
        f"{SUPABASE_URL}/odds?order=created_at.desc&limit=10",
        headers=HEADERS
    )
    
    if response.ok:
        odds = response.json()
        print(f"✅ Found {len(odds)} recent odds")
        if odds:
            for odd in odds[:3]:  # Show first 3
                print(f"   Odds: {odd['sportsbook']} - {odd['away_odds']}/{odd['home_odds']}")
    else:
        print(f"❌ Failed to check odds: {response.status_code}")

def check_endpoint_status(endpoint_id):
    """Check specific endpoint processing status"""
    print(f"🧪 Checking endpoint {endpoint_id} status...")
    
    response = requests.get(
        f"{SUPABASE_URL}/discovered_endpoints?id=eq.{endpoint_id}",
        headers=HEADERS
    )
    
    if response.ok:
        endpoints = response.json()
        if endpoints:
            endpoint = endpoints[0]
            print(f"✅ Endpoint status: {endpoint['scrape_status']}")
            print(f"   Last scraped: {endpoint.get('last_scraped', 'Never')}")
            print(f"   Scrape count: {endpoint.get('scrape_count', 0)}")
            print(f"   Error count: {endpoint.get('error_count', 0)}")
            if endpoint.get('last_error'):
                print(f"   Last error: {endpoint['last_error']}")
        else:
            print(f"❌ Endpoint {endpoint_id} not found")
    else:
        print(f"❌ Failed to check endpoint: {response.status_code}")

def run_full_test():
    """Run complete integration test"""
    print("🚀 Starting automated scraping integration test\n")
    
    # Test 1: Connection
    if not test_supabase_connection():
        print("\n❌ Test failed: Cannot connect to Supabase")
        sys.exit(1)
    
    # Test 2: Setup
    endpoint_id = setup_test_data()
    if not endpoint_id:
        print("\n❌ Test failed: Cannot setup test data")
        sys.exit(1)
    
    print("\n⏳ Waiting 30 seconds for monitor to pick up endpoint...")
    time.sleep(30)
    
    # Test 3: Monitor activity
    check_monitor_status()
    
    # Test 4: Endpoint processing
    check_endpoint_status(endpoint_id)
    
    # Test 5: Data results
    check_scraped_data()
    
    print("\n✅ Integration test complete!")
    print("\nNext steps:")
    print("1. Check Scrapy monitor logs for detailed processing info")
    print("2. Open extension dashboard to see results")
    print("3. Browse to a sportsbook site to trigger auto-discovery")

if __name__ == "__main__":
    run_full_test()