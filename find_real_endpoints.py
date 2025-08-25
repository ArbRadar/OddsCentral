#!/usr/bin/env python3
"""
Script to find real OddsJam endpoints that return actual game data with odds.
Current endpoints only return configuration data, not actual games.
"""

import requests
import json
import time
import re
from urllib.parse import urljoin, urlparse
from datetime import datetime

class OddsJamEndpointFinder:
    def __init__(self):
        self.base_url = "https://oddsjam.com"
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://oddsjam.com/mlb/screen/moneyline',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin'
        })
        
        # Known build IDs to try
        self.build_ids = [
            '_lBykIN0RByeBTpFdr0Fv',  # Current known
            'WzUffJO619HTJItqBbnuC',   # Previous known
            'build-123',
            'latest',
            'current'
        ]
        
    def find_build_id(self):
        """Try to find current build ID from the main page"""
        print("🔍 Looking for current build ID...")
        
        try:
            response = self.session.get(f"{self.base_url}/mlb/screen/moneyline")
            if response.status_code == 200:
                # Look for Next.js build ID in the HTML
                build_id_patterns = [
                    r'"buildId":"([^"]+)"',
                    r'/_next/static/([^/]+)/',
                    r'/_next/data/([^/]+)/',
                    r'data-build-id="([^"]+)"'
                ]
                
                for pattern in build_id_patterns:
                    matches = re.findall(pattern, response.text)
                    if matches:
                        build_id = matches[0]
                        if build_id not in self.build_ids:
                            self.build_ids.insert(0, build_id)
                            print(f"✅ Found build ID: {build_id}")
                            return build_id
                
                print("❌ Could not extract build ID from page")
            else:
                print(f"❌ Failed to fetch main page: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error finding build ID: {e}")
            
        return self.build_ids[0]  # Return known build ID
    
    def test_endpoint_patterns(self):
        """Test various endpoint patterns that might contain real game data"""
        print("🎯 Testing potential game data endpoints...")
        
        # Get current build ID
        current_build_id = self.find_build_id()
        
        # Potential endpoint patterns
        endpoint_patterns = [
            # Next.js data endpoints - different sports/markets
            f"/_next/data/{current_build_id}/mlb/screen/moneyline.json",
            f"/_next/data/{current_build_id}/mlb/screen/spreads.json", 
            f"/_next/data/{current_build_id}/mlb/screen/totals.json",
            f"/_next/data/{current_build_id}/mlb/screen/props.json",
            f"/_next/data/{current_build_id}/mlb/markets.json",
            f"/_next/data/{current_build_id}/mlb/games.json",
            f"/_next/data/{current_build_id}/mlb/odds.json",
            
            # API-like endpoints
            "/api/v1/games",
            "/api/v1/odds",
            "/api/v1/events", 
            "/api/v1/markets",
            "/api/v1/sports/mlb/games",
            "/api/v1/sports/mlb/odds",
            "/api/games",
            "/api/odds",
            "/api/events",
            "/api/markets",
            
            # GraphQL endpoints
            "/graphql",
            "/api/graphql",
            
            # Different data formats
            f"/_next/data/{current_build_id}/mlb.json",
            f"/_next/data/{current_build_id}/sports/mlb.json",
            f"/_next/data/{current_build_id}/data/mlb.json",
            
            # Common patterns from other betting sites
            "/data/odds",
            "/data/games", 
            "/data/events",
            "/live/odds",
            "/live/games",
            "/feed/odds",
            "/feed/games"
        ]
        
        real_endpoints = []
        
        for pattern in endpoint_patterns:
            url = urljoin(self.base_url, pattern)
            print(f"🔄 Testing: {pattern}")
            
            try:
                response = self.session.get(url, timeout=10)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        analysis = self.analyze_response_data(data, pattern)
                        
                        if analysis['has_game_data']:
                            print(f"✅ FOUND REAL GAME DATA: {pattern}")
                            real_endpoints.append({
                                'endpoint': pattern,
                                'url': url,
                                'status_code': response.status_code,
                                'data_analysis': analysis
                            })
                            
                            # Save sample response
                            self.save_sample_response(pattern, data)
                        else:
                            print(f"📊 Config data only: {pattern} - {analysis['description']}")
                            
                    except json.JSONDecodeError:
                        print(f"⚠️  Non-JSON response: {pattern}")
                        
                elif response.status_code == 404:
                    print(f"❌ Not found: {pattern}")
                else:
                    print(f"❌ Error {response.status_code}: {pattern}")
                    
            except requests.exceptions.RequestException as e:
                print(f"❌ Request failed: {pattern} - {e}")
            
            time.sleep(0.5)  # Be respectful with requests
        
        return real_endpoints
    
    def analyze_response_data(self, data, endpoint_name):
        """Analyze response data to determine if it contains real game data"""
        analysis = {
            'has_game_data': False,
            'has_config_only': False,
            'description': '',
            'game_count': 0,
            'odds_count': 0,
            'structure': {},
            'sample_keys': []
        }
        
        if not isinstance(data, dict):
            analysis['description'] = f"Non-dict response: {type(data)}"
            return analysis
        
        # Check top-level structure
        top_keys = list(data.keys())
        analysis['sample_keys'] = top_keys[:10]  # First 10 keys
        
        # Look for Next.js pageProps pattern
        if 'pageProps' in data:
            page_props = data['pageProps']
            if isinstance(page_props, dict):
                return self.analyze_page_props(page_props, analysis)
        
        # Direct analysis of data
        return self.analyze_direct_data(data, analysis)
    
    def analyze_page_props(self, page_props, analysis):
        """Analyze Next.js pageProps structure"""
        props_keys = list(page_props.keys())
        analysis['structure']['pageProps_keys'] = props_keys
        
        # Check fallback structure (this is what we currently get - config only)
        if 'fallback' in page_props:
            fallback = page_props['fallback']
            if isinstance(fallback, dict):
                fallback_keys = list(fallback.keys())
                analysis['structure']['fallback_keys'] = fallback_keys
                
                # If only has leagues/config data, it's config only
                config_only_indicators = ['leagues', 'sports', 'config', 'settings']
                has_only_config = all(any(indicator in key.lower() for indicator in config_only_indicators) 
                                    for key in fallback_keys if isinstance(fallback.get(key), (list, dict)))
                
                if has_only_config:
                    analysis['has_config_only'] = True
                    analysis['description'] = "Config/leagues data only (fallback)"
                    return analysis
        
        # Look for actual game data indicators
        game_data_keys = ['games', 'events', 'matches', 'fixtures', 'contests']
        odds_data_keys = ['odds', 'markets', 'lines', 'prices', 'betting']
        
        found_games = False
        found_odds = False
        
        # Check all levels for game/odds data
        for key, value in page_props.items():
            if isinstance(value, list) and len(value) > 0:
                # Check if it's a list of games
                first_item = value[0]
                if isinstance(first_item, dict):
                    first_keys = list(first_item.keys())
                    
                    # Look for game-like structure
                    has_teams = any(team_key in first_keys for team_key in ['home', 'away', 'homeTeam', 'awayTeam', 'team1', 'team2'])
                    has_time = any(time_key in first_keys for time_key in ['startTime', 'gameTime', 'time', 'start'])
                    has_odds_data = any(odds_key in first_keys for odds_key in ['odds', 'markets', 'lines', 'prices'])
                    
                    if has_teams and (has_time or has_odds_data):
                        found_games = True
                        analysis['game_count'] = len(value)
                        
                        # Count odds entries
                        for item in value[:5]:  # Check first 5 items
                            if isinstance(item, dict):
                                for odds_key in odds_data_keys:
                                    if odds_key in item:
                                        odds_data = item[odds_key]
                                        if isinstance(odds_data, (dict, list)):
                                            analysis['odds_count'] += 1
            
            elif isinstance(value, dict):
                # Check nested dictionaries
                for nested_key, nested_value in value.items():
                    if isinstance(nested_value, list) and len(nested_value) > 0:
                        # Similar analysis for nested lists
                        if any(game_key in nested_key.lower() for game_key in game_data_keys):
                            found_games = True
                            analysis['game_count'] = len(nested_value)
        
        if found_games:
            analysis['has_game_data'] = True
            analysis['description'] = f"Real game data found! {analysis['game_count']} games"
        else:
            analysis['has_config_only'] = True
            analysis['description'] = "Config/metadata only"
            
        return analysis
    
    def analyze_direct_data(self, data, analysis):
        """Analyze direct data structure (not Next.js)"""
        # Look for direct game/event arrays
        game_data_keys = ['games', 'events', 'matches', 'fixtures', 'contests']
        
        for key in game_data_keys:
            if key in data and isinstance(data[key], list) and len(data[key]) > 0:
                analysis['has_game_data'] = True
                analysis['game_count'] = len(data[key])
                analysis['description'] = f"Direct game data - {analysis['game_count']} {key}"
                return analysis
        
        # Check if data itself is an array of games
        if isinstance(data, list) and len(data) > 0:
            first_item = data[0]
            if isinstance(first_item, dict):
                first_keys = list(first_item.keys())
                has_teams = any(team_key in first_keys for team_key in ['home', 'away', 'homeTeam', 'awayTeam'])
                
                if has_teams:
                    analysis['has_game_data'] = True
                    analysis['game_count'] = len(data)
                    analysis['description'] = f"Array of games - {analysis['game_count']} items"
                    return analysis
        
        analysis['has_config_only'] = True
        analysis['description'] = "Unknown structure or config only"
        return analysis
    
    def save_sample_response(self, endpoint_name, data):
        """Save sample response for analysis"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f"sample_response_{endpoint_name.replace('/', '_').replace('?', '_')}_{timestamp}.json"
        filepath = f"/Users/joelsalazar/OddsCentral/scrapy-scraper/{filename}"
        
        try:
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2)
            print(f"💾 Saved sample response to: {filename}")
        except Exception as e:
            print(f"❌ Failed to save sample: {e}")
    
    def test_dynamic_endpoints(self):
        """Test dynamically generated endpoints based on current time/date"""
        print("🕐 Testing time-based dynamic endpoints...")
        
        now = datetime.now()
        date_formats = [
            now.strftime('%Y-%m-%d'),
            now.strftime('%Y%m%d'),
            now.strftime('%m-%d-%Y'),
            now.strftime('%d-%m-%Y')
        ]
        
        dynamic_patterns = []
        for date_format in date_formats:
            dynamic_patterns.extend([
                f"/api/games/{date_format}",
                f"/api/odds/{date_format}",
                f"/data/games/{date_format}",
                f"/data/odds/{date_format}",
                f"/live/games/{date_format}",
                f"/mlb/games/{date_format}"
            ])
        
        real_endpoints = []
        for pattern in dynamic_patterns:
            url = urljoin(self.base_url, pattern)
            print(f"🔄 Testing dynamic: {pattern}")
            
            try:
                response = self.session.get(url, timeout=10)
                if response.status_code == 200:
                    try:
                        data = response.json()
                        analysis = self.analyze_response_data(data, pattern)
                        
                        if analysis['has_game_data']:
                            print(f"✅ FOUND REAL DYNAMIC DATA: {pattern}")
                            real_endpoints.append({
                                'endpoint': pattern,
                                'url': url,
                                'status_code': response.status_code,
                                'data_analysis': analysis
                            })
                            self.save_sample_response(pattern, data)
                            
                    except json.JSONDecodeError:
                        pass
                        
            except requests.exceptions.RequestException:
                pass
            
            time.sleep(0.3)
        
        return real_endpoints
    
    def run_full_analysis(self):
        """Run complete endpoint discovery analysis"""
        print("🚀 Starting OddsJam Endpoint Discovery")
        print("=" * 50)
        
        all_real_endpoints = []
        
        # Test static patterns
        static_endpoints = self.test_endpoint_patterns()
        all_real_endpoints.extend(static_endpoints)
        
        # Test dynamic patterns  
        dynamic_endpoints = self.test_dynamic_endpoints()
        all_real_endpoints.extend(dynamic_endpoints)
        
        print("\n" + "=" * 50)
        print("📋 FINAL RESULTS")
        print("=" * 50)
        
        if all_real_endpoints:
            print(f"✅ Found {len(all_real_endpoints)} endpoints with real game data!")
            
            for i, endpoint_info in enumerate(all_real_endpoints, 1):
                print(f"\n{i}. {endpoint_info['endpoint']}")
                print(f"   URL: {endpoint_info['url']}")
                print(f"   Games: {endpoint_info['data_analysis']['game_count']}")
                print(f"   Description: {endpoint_info['data_analysis']['description']}")
                
            # Save results
            results_file = "/Users/joelsalazar/OddsCentral/scrapy-scraper/real_game_endpoints.json"
            with open(results_file, 'w') as f:
                json.dump(all_real_endpoints, f, indent=2)
            print(f"\n💾 Results saved to: real_game_endpoints.json")
            
        else:
            print("❌ No real game data endpoints found.")
            print("The endpoints we tested only return configuration data.")
            print("\nNext steps:")
            print("1. Inspect browser network traffic while using the site")
            print("2. Look for WebSocket connections")
            print("3. Check for additional API calls made after page load")
            print("4. Try different sports (NBA, NFL, etc.)")

if __name__ == "__main__":
    finder = OddsJamEndpointFinder()
    finder.run_full_analysis()