#!/usr/bin/env python3
"""
Verification script to test all OddsJam scraping targets.

This script:
1. Loads all enabled scraping targets from the database
2. Builds the API URLs using the endpoint pattern
3. Tests each endpoint with proper authentication
4. Reports success/failure for each target
5. Validates the response structure

No mocking - this uses real API calls to verify configuration.
"""

import json
import requests
import sys
from datetime import datetime
from typing import Dict, List, Tuple
import time

# Database configuration
SUPABASE_URL = 'http://localhost:54320'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json'
}


def load_platform_data() -> Dict:
    """Load platform, endpoints, and auth data from database"""
    data = {}
    
    # Load platforms
    response = requests.get(f"{SUPABASE_URL}/scraping_platforms?active=eq.true", headers=HEADERS)
    if response.ok:
        data['platforms'] = {p['id']: p for p in response.json()}
    else:
        print(f"Failed to load platforms: {response.status_code}")
        return {}
    
    # Load endpoints
    response = requests.get(f"{SUPABASE_URL}/known_endpoints?active=eq.true", headers=HEADERS)
    if response.ok:
        data['endpoints'] = {e['platform_id']: e for e in response.json()}
    else:
        print(f"Failed to load endpoints: {response.status_code}")
        return {}
    
    # Load authentication
    response = requests.get(f"{SUPABASE_URL}/platform_auth?active=eq.true", headers=HEADERS)
    if response.ok:
        data['auth'] = {a['platform_id']: a['auth_data'] for a in response.json()}
    else:
        print(f"Failed to load auth: {response.status_code}")
        return {}
    
    return data


def load_scraping_targets() -> List[Dict]:
    """Load enabled scraping targets"""
    response = requests.get(
        f"{SUPABASE_URL}/scraping_targets?enabled=eq.true&order=priority,name", 
        headers=HEADERS
    )
    if response.ok:
        return response.json()
    else:
        print(f"Failed to load scraping targets: {response.status_code}")
        return []


def build_api_url(platform: Dict, endpoint: Dict, target: Dict) -> str:
    """Build API URL from pattern and config"""
    try:
        base_url = platform['base_url']
        pattern = endpoint['endpoint_pattern']
        config = target['config']
        
        # Replace placeholders
        api_path = pattern.format(**config)
        return f"{base_url}{api_path}"
    except KeyError as e:
        return f"ERROR: Missing parameter {e}"
    except Exception as e:
        return f"ERROR: {e}"


def test_api_endpoint(url: str, auth_data: Dict) -> Tuple[bool, str, Dict]:
    """Test an API endpoint and return (success, message, response_data)"""
    
    # Build request headers
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://oddsjam.com/'
    }
    
    # Build cookies from auth data
    cookies = {}
    if auth_data:
        if auth_data.get('access_token'):
            cookies['access_token'] = auth_data['access_token']
        if auth_data.get('cf_clearance'):
            cookies['cf_clearance'] = auth_data['cf_clearance']
        if auth_data.get('state'):
            cookies['state'] = auth_data['state']
    
    try:
        response = requests.get(url, headers=headers, cookies=cookies, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            
            # Validate response structure
            if 'data' in data and isinstance(data['data'], list):
                game_count = len(data['data'])
                
                # Check if we have games
                if game_count > 0:
                    # Validate first game structure
                    first_game = data['data'][0]
                    if 'game_id' in first_game and 'rows' in first_game:
                        return True, f"Success: {game_count} games found", data
                    else:
                        return False, "Invalid game structure", data
                else:
                    return True, "Success: No games currently available", data
            else:
                return False, "Invalid response structure", data
                
        elif response.status_code == 401:
            return False, "Authentication failed - tokens may be expired", {}
        elif response.status_code == 403:
            return False, "Forbidden - Cloudflare or rate limit", {}
        else:
            return False, f"HTTP {response.status_code}: {response.text[:100]}", {}
            
    except requests.exceptions.Timeout:
        return False, "Request timeout", {}
    except requests.exceptions.ConnectionError:
        return False, "Connection error", {}
    except json.JSONDecodeError:
        return False, "Invalid JSON response", {}
    except Exception as e:
        return False, f"Error: {str(e)}", {}


def validate_target_config(target: Dict) -> Tuple[bool, List[str]]:
    """Validate that target has all required parameters"""
    required_params = [
        'sport', 'league', 'state', 'market_name', 
        'is_future', 'game_status_filter', 'opening_odds'
    ]
    
    config = target.get('config', {})
    missing = [p for p in required_params if p not in config]
    
    return len(missing) == 0, missing


def update_target_status(target_id: int, success: bool, message: str):
    """Update scraping target with test results"""
    update_data = {
        'last_scraped': datetime.utcnow().isoformat(),
    }
    
    if success:
        update_data['success_count'] = 1
        update_data['error_count'] = 0
    else:
        update_data['success_count'] = 0
        update_data['error_count'] = 1
    
    response = requests.patch(
        f"{SUPABASE_URL}/scraping_targets?id=eq.{target_id}",
        headers=HEADERS,
        json=update_data
    )
    
    if not response.ok:
        print(f"Failed to update target status: {response.status_code}")


def main():
    """Main verification function"""
    print("=" * 80)
    print("OddsJam Scraping Targets Verification")
    print("=" * 80)
    print()
    
    # Load configuration
    print("Loading configuration...")
    platform_data = load_platform_data()
    if not platform_data:
        print("Failed to load platform data")
        sys.exit(1)
    
    targets = load_scraping_targets()
    if not targets:
        print("No enabled scraping targets found")
        sys.exit(0)
    
    print(f"Found {len(targets)} enabled scraping targets\n")
    
    # Test each target
    success_count = 0
    failure_count = 0
    
    for i, target in enumerate(targets):
        print(f"\n[{i+1}/{len(targets)}] Testing: {target['name']}")
        print("-" * 40)
        
        platform_id = target['platform_id']
        platform = platform_data['platforms'].get(platform_id)
        endpoint = platform_data['endpoints'].get(platform_id)
        auth = platform_data['auth'].get(platform_id, {})
        
        if not platform or not endpoint:
            print("❌ Missing platform or endpoint configuration")
            failure_count += 1
            continue
        
        # Validate configuration
        valid, missing = validate_target_config(target)
        if not valid:
            print(f"❌ Missing required parameters: {', '.join(missing)}")
            failure_count += 1
            update_target_status(target['id'], False, f"Missing parameters: {missing}")
            continue
        
        # Build URL
        url = build_api_url(platform, endpoint, target)
        if url.startswith("ERROR:"):
            print(f"❌ {url}")
            failure_count += 1
            update_target_status(target['id'], False, url)
            continue
        
        print(f"URL: {url}")
        
        # Test endpoint
        print("Testing endpoint...", end=" ", flush=True)
        success, message, data = test_api_endpoint(url, auth)
        
        if success:
            print(f"✅ {message}")
            success_count += 1
            
            # Show sample data if available
            if 'data' in data and len(data['data']) > 0:
                first_game = data['data'][0]
                print(f"   Sample game ID: {first_game.get('game_id', 'N/A')}")
                if 'rows' in first_game:
                    print(f"   Outcome count: {len(first_game['rows'])}")
        else:
            print(f"❌ {message}")
            failure_count += 1
        
        # Update database
        update_target_status(target['id'], success, message)
        
        # Rate limiting
        time.sleep(2)
    
    # Summary
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Total targets tested: {len(targets)}")
    print(f"✅ Successful: {success_count}")
    print(f"❌ Failed: {failure_count}")
    print(f"Success rate: {(success_count/len(targets)*100):.1f}%")
    
    # Check authentication status
    if failure_count > 0:
        print("\n⚠️  Some targets failed. Common issues:")
        print("   - Expired authentication tokens")
        print("   - Missing configuration parameters")
        print("   - Invalid league/sport codes")
        print("   - Rate limiting")
        
    sys.exit(0 if failure_count == 0 else 1)


if __name__ == "__main__":
    main()