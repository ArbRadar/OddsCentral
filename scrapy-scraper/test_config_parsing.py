#!/usr/bin/env python3
"""
Test script to reproduce the config parsing issue
"""
import requests
import json

# Database configuration
SUPABASE_URL = 'http://localhost:54320'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}

def test_config_parsing():
    """Test the config parsing issue"""
    print("Fetching scraping targets...")
    
    response = requests.get(
        f"{SUPABASE_URL}/scraping_targets?enabled=eq.true&order=priority,name",
        headers=headers
    )
    
    if response.ok:
        targets = response.json()
        print(f"Found {len(targets)} enabled targets")
        
        # Test endpoint pattern
        endpoint_pattern = "/api/backend/oddscreen/v2/game/data?sport={sport}&league={league}&market_name={market}&state={state}&is_future=0&game_status_filter=All&opening_odds=false"
        
        for target in targets:
            print(f"\nTesting target: {target['name']}")
            print(f"Config: {target['config']}")
            print(f"Config type: {type(target['config'])}")
            
            config = target['config']
            
            # Try the current approach (what's in the spider)
            try:
                api_path = endpoint_pattern.format(**config)
                print(f"✅ SUCCESS - API path: {api_path}")
            except Exception as e:
                print(f"❌ ERROR - {e}")
                
                # Try parsing as JSON first
                try:
                    if isinstance(config, str):
                        parsed_config = json.loads(config)
                        api_path = endpoint_pattern.format(**parsed_config)
                        print(f"✅ FIXED - API path: {api_path}")
                    else:
                        print("❌ Config is not a string to parse")
                except Exception as parse_error:
                    print(f"❌ JSON parsing failed: {parse_error}")
    else:
        print(f"Failed to get targets: {response.status_code}")

if __name__ == "__main__":
    test_config_parsing()