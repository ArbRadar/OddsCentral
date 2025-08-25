#!/usr/bin/env python3
"""
Detailed analysis of OddsJam endpoints to understand response formats
"""

import requests
import json
import re
from urllib.parse import urljoin

def analyze_oddsjam_endpoints():
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://oddsjam.com/mlb/screen/moneyline'
    })
    
    base_url = "https://oddsjam.com"
    
    # Test the known endpoints first
    known_endpoints = [
        "/_next/data/_lBykIN0RByeBTpFdr0Fv/mlb/screen/moneyline.json",
        "/_next/data/_lBykIN0RByeBTpFdr0Fv/mlb/screen/totals.json"
    ]
    
    print("🔍 Analyzing known endpoints in detail...\n")
    
    for endpoint in known_endpoints:
        url = urljoin(base_url, endpoint)
        print(f"📡 Testing: {endpoint}")
        
        try:
            response = session.get(url, timeout=15)
            print(f"   Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type', 'Unknown')}")
            print(f"   Content-Length: {len(response.content)} bytes")
            
            if response.status_code == 200:
                # Try to parse as JSON
                try:
                    data = response.json()
                    print("   Format: JSON ✅")
                    
                    # Analyze structure
                    if isinstance(data, dict):
                        print(f"   Top-level keys: {list(data.keys())}")
                        
                        if 'pageProps' in data:
                            page_props = data['pageProps']
                            print(f"   PageProps keys: {list(page_props.keys())}")
                            
                            if 'fallback' in page_props:
                                fallback = page_props['fallback']
                                print(f"   Fallback keys: {list(fallback.keys())}")
                                
                                # Look for potential game data
                                for key, value in fallback.items():
                                    if isinstance(value, list):
                                        print(f"   Fallback['{key}'] = list with {len(value)} items")
                                        if len(value) > 0 and isinstance(value[0], dict):
                                            sample_keys = list(value[0].keys())
                                            print(f"     Sample item keys: {sample_keys[:10]}")
                                            
                                            # Check if this looks like game data
                                            has_teams = any(key in sample_keys for key in ['home', 'away', 'homeTeam', 'awayTeam', 'team1', 'team2'])
                                            has_odds = any(key in sample_keys for key in ['odds', 'markets', 'lines', 'prices', 'moneyline'])
                                            has_time = any(key in sample_keys for key in ['startTime', 'gameTime', 'time', 'start'])
                                            
                                            if has_teams and (has_odds or has_time):
                                                print(f"     ⭐ POTENTIAL GAME DATA FOUND in fallback['{key}']!")
                                                print(f"     Has teams: {has_teams}, Has odds: {has_odds}, Has time: {has_time}")
                                                
                                                # Save first few items for analysis
                                                sample_file = f"sample_{key}_{endpoint.replace('/', '_').replace('.json', '')}.json"
                                                with open(f"/Users/joelsalazar/OddsCentral/scrapy-scraper/{sample_file}", 'w') as f:
                                                    json.dump(value[:3], f, indent=2)
                                                print(f"     💾 Sample saved to {sample_file}")
                                            else:
                                                print(f"     Config/metadata only")
                                    elif isinstance(value, dict):
                                        print(f"   Fallback['{key}'] = dict with {len(value)} keys")
                                        print(f"     Keys: {list(value.keys())[:10]}")
                        else:
                            print("   No fallback structure found")
                    else:
                        print(f"   Data type: {type(data)}")
                        
                except json.JSONDecodeError as e:
                    print(f"   Format: Non-JSON")
                    print(f"   First 200 chars: {response.text[:200]}")
                    
                    # Check if it's HTML (might be an error page)
                    if response.text.strip().startswith('<'):
                        print("   Appears to be HTML - possible error/redirect page")
                        
                        # Look for any embedded JSON or API hints
                        json_pattern = r'({[^{}]*"[^"]*"[^{}]*})'
                        matches = re.findall(json_pattern, response.text)
                        if matches:
                            print(f"   Found {len(matches)} potential JSON fragments")
                    
            else:
                print(f"   Error: HTTP {response.status_code}")
                if response.content:
                    print(f"   Error content: {response.text[:200]}")
                    
        except requests.exceptions.RequestException as e:
            print(f"   Request failed: {e}")
            
        print()  # Empty line for readability

def try_alternative_approaches():
    """Try different approaches to find the real endpoints"""
    print("\n🔧 Trying alternative approaches...\n")
    
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
    })
    
    # 1. Try to get the main page and extract build ID more carefully
    print("1. Extracting current build ID from main page...")
    try:
        response = session.get("https://oddsjam.com/mlb/screen/moneyline")
        if response.status_code == 200:
            # Multiple patterns to find build ID
            patterns = [
                r'"buildId":"([a-zA-Z0-9_-]+)"',
                r'/_next/data/([a-zA-Z0-9_-]+)/',
                r'buildId=([a-zA-Z0-9_-]+)',
                r'static/([a-zA-Z0-9_-]+)/',
                r'_next/static/([a-zA-Z0-9_-]+)/'
            ]
            
            build_ids_found = set()
            for pattern in patterns:
                matches = re.findall(pattern, response.text)
                for match in matches:
                    if len(match) > 10:  # Build IDs are typically long
                        build_ids_found.add(match)
            
            if build_ids_found:
                print(f"   Found potential build IDs: {list(build_ids_found)}")
                
                # Test each build ID
                for build_id in build_ids_found:
                    test_url = f"https://oddsjam.com/_next/data/{build_id}/mlb/screen/moneyline.json"
                    print(f"   Testing build ID {build_id}...")
                    
                    test_response = session.get(test_url)
                    print(f"     Status: {test_response.status_code}")
                    
                    if test_response.status_code == 200:
                        try:
                            data = test_response.json()
                            print(f"     ✅ Valid JSON response!")
                            
                            # Quick analysis
                            if isinstance(data, dict) and 'pageProps' in data:
                                props = data['pageProps']
                                if 'fallback' in props:
                                    fb_keys = list(props['fallback'].keys())
                                    print(f"     Fallback keys: {fb_keys}")
                                    return build_id, data
                            
                        except json.JSONDecodeError:
                            print(f"     Non-JSON response")
            else:
                print("   No build IDs found in page")
        else:
            print(f"   Failed to fetch main page: {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")

    # 2. Try different sport paths
    print("\n2. Trying different sports to find active endpoints...")
    sports_paths = [
        '/nfl/screen/moneyline',
        '/nba/screen/moneyline', 
        '/soccer/screen/moneyline',
        '/tennis/screen/moneyline',
        '/hockey/screen/moneyline'
    ]
    
    for sport_path in sports_paths:
        print(f"   Checking {sport_path}...")
        try:
            response = session.get(f"https://oddsjam.com{sport_path}")
            if response.status_code == 200:
                # Look for build ID in this sport's page
                matches = re.findall(r'/_next/data/([a-zA-Z0-9_-]+)/', response.text)
                if matches:
                    build_id = matches[0]
                    test_url = f"https://oddsjam.com/_next/data/{build_id}{sport_path.replace('/screen/', '/screen/')}.json"
                    print(f"     Found build ID: {build_id}")
                    print(f"     Testing: {test_url}")
                    
                    test_response = session.get(test_url)
                    if test_response.status_code == 200:
                        try:
                            data = test_response.json()
                            print(f"     ✅ Working endpoint for {sport_path}!")
                            return build_id, data
                        except:
                            pass
        except:
            pass

if __name__ == "__main__":
    print("🚀 Detailed OddsJam Endpoint Analysis")
    print("=" * 60)
    
    # First analyze what we're getting from known endpoints
    analyze_oddsjam_endpoints()
    
    # Then try to find working endpoints
    result = try_alternative_approaches()
    
    if result:
        build_id, sample_data = result
        print(f"\n✅ Found working build ID: {build_id}")
        
        # Save the working data
        with open("/Users/joelsalazar/OddsCentral/scrapy-scraper/working_sample.json", 'w') as f:
            json.dump(sample_data, f, indent=2)
        print("💾 Sample data saved to working_sample.json")
        
        # Update endpoints file with working build ID
        endpoints = [
            {
                "domain": "oddsjam.com",
                "method": "GET",
                "path": f"/_next/data/{build_id}/mlb/screen/moneyline.json",
                "headers": {
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0"
                },
                "endpoint_id": 1
            },
            {
                "domain": "oddsjam.com", 
                "method": "GET",
                "path": f"/_next/data/{build_id}/mlb/screen/totals.json",
                "headers": {
                    "Accept": "application/json"
                },
                "endpoint_id": 2
            }
        ]
        
        with open("/Users/joelsalazar/OddsCentral/scrapy-scraper/updated_endpoints.json", 'w') as f:
            json.dump(endpoints, f, indent=2)
        print("🔄 Updated endpoints saved to updated_endpoints.json")
        
    else:
        print("\n❌ Could not find working endpoints")
        print("\nRecommendations:")
        print("1. Use browser DevTools to monitor network requests while browsing OddsJam")
        print("2. Look for XHR/Fetch requests that return actual game data") 
        print("3. Check if the site uses WebSockets for real-time data")
        print("4. The Next.js build ID may be frequently updated")