#!/usr/bin/env python3
"""
Final comprehensive script to find OddsJam's real game data endpoints.
This combines all methods and provides actionable results.
"""

import requests
import json
import re
import time
from datetime import datetime, timedelta
from urllib.parse import urljoin, parse_qs, urlparse

class ComprehensiveEndpointFinder:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Cache-Control': 'no-cache'
        })
        self.base_url = "https://oddsjam.com"
        self.found_endpoints = []
        
    def extract_all_build_ids(self):
        """Extract all possible build IDs from multiple pages"""
        print("🔍 Extracting build IDs from multiple pages...")
        
        build_ids = set()
        pages = [
            '/mlb/screen/moneyline',
            '/nfl/screen/moneyline', 
            '/nba/screen/moneyline',
            '/soccer/screen/moneyline'
        ]
        
        for page in pages:
            try:
                url = urljoin(self.base_url, page)
                response = self.session.get(url, timeout=15)
                
                if response.status_code == 200:
                    # Multiple regex patterns for build ID extraction
                    patterns = [
                        r'"buildId":"([a-zA-Z0-9_-]+)"',
                        r'/_next/data/([a-zA-Z0-9_-]+)/',
                        r'buildId=([a-zA-Z0-9_-]+)',
                        r'_app-([a-zA-Z0-9_-]+)\.js',
                        r'static/([a-zA-Z0-9_-]+)/'
                    ]
                    
                    for pattern in patterns:
                        matches = re.findall(pattern, response.text)
                        for match in matches:
                            if len(match) > 10:  # Build IDs are typically long
                                build_ids.add(match)
                                
            except Exception as e:
                print(f"   Error fetching {page}: {e}")
        
        build_ids_list = list(build_ids)
        print(f"   Found {len(build_ids_list)} potential build IDs: {build_ids_list}")
        return build_ids_list
    
    def test_next_js_endpoints(self, build_ids):
        """Test Next.js endpoints with different build IDs"""
        print("🧪 Testing Next.js endpoints...")
        
        # Endpoint patterns to test
        endpoint_patterns = [
            '/mlb/screen/moneyline.json',
            '/mlb/screen/totals.json', 
            '/mlb/screen/spreads.json',
            '/mlb/screen/props.json',
            '/mlb/live.json',
            '/mlb/today.json',
            '/mlb/games.json',
            '/mlb/odds.json',
            '/api/mlb.json',
            '/data/mlb.json',
            '/live/mlb.json',
            '/nfl/screen/moneyline.json',
            '/nba/screen/moneyline.json'
        ]
        
        for build_id in build_ids:
            print(f"\n   Testing build ID: {build_id}")
            
            for pattern in endpoint_patterns:
                url = f"{self.base_url}/_next/data/{build_id}{pattern}"
                
                try:
                    response = self.session.get(url, timeout=10)
                    
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            analysis = self.analyze_response_for_games(data, url)
                            
                            if analysis['has_games']:
                                print(f"   ✅ GAME DATA FOUND: {pattern}")
                                print(f"      Games: {analysis['game_count']}")
                                print(f"      Structure: {analysis['description']}")
                                
                                self.found_endpoints.append({
                                    'url': url,
                                    'pattern': pattern,
                                    'build_id': build_id,
                                    'analysis': analysis,
                                    'method': 'next_js'
                                })
                                
                                # Save sample
                                self.save_sample_response(f"nextjs_{pattern.replace('/', '_')}", data)
                            else:
                                print(f"   📋 Config only: {pattern}")
                                
                        except json.JSONDecodeError:
                            print(f"   ⚠️  Non-JSON: {pattern}")
                    elif response.status_code == 404:
                        pass  # Expected for most endpoints
                    else:
                        print(f"   ❌ Error {response.status_code}: {pattern}")
                        
                except requests.RequestException:
                    pass
                
                time.sleep(0.1)  # Rate limiting
    
    def test_direct_api_endpoints(self):
        """Test direct API endpoints that might bypass Next.js"""
        print("🎯 Testing direct API endpoints...")
        
        # Common API patterns
        api_patterns = [
            '/api/odds',
            '/api/games',
            '/api/events',
            '/api/markets',
            '/api/live/odds',
            '/api/live/games', 
            '/api/sports/mlb/odds',
            '/api/sports/mlb/games',
            '/api/v1/odds',
            '/api/v1/games',
            '/api/v2/odds',
            '/api/v2/games',
            '/data/odds',
            '/data/games',
            '/data/live',
            '/feed/odds',
            '/feed/games',
            '/live/odds',
            '/live/games',
            '/live/feed',
            '/odds/live',
            '/games/live',
            '/markets/live'
        ]
        
        for pattern in api_patterns:
            url = urljoin(self.base_url, pattern)
            
            try:
                response = self.session.get(url, timeout=10)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        analysis = self.analyze_response_for_games(data, url)
                        
                        if analysis['has_games']:
                            print(f"✅ DIRECT API GAME DATA: {pattern}")
                            self.found_endpoints.append({
                                'url': url,
                                'pattern': pattern,
                                'analysis': analysis,
                                'method': 'direct_api'
                            })
                            self.save_sample_response(f"direct_{pattern.replace('/', '_')}", data)
                        
                    except json.JSONDecodeError:
                        pass
                        
            except requests.RequestException:
                pass
            
            time.sleep(0.1)
    
    def test_graphql_endpoints(self):
        """Test GraphQL endpoints"""
        print("🔗 Testing GraphQL endpoints...")
        
        graphql_urls = [
            '/graphql',
            '/api/graphql',
            '/v1/graphql',
            '/api/v1/graphql'
        ]
        
        # Common GraphQL queries for sports betting
        queries = [
            {
                'query': '{ games { id homeTeam awayTeam startTime odds } }',
                'variables': {}
            },
            {
                'query': '{ events(sport: "baseball") { id home away startTime markets } }',
                'variables': {}
            },
            {
                'query': '{ odds(league: "mlb") { gameId sportsbook odds } }',
                'variables': {}
            }
        ]
        
        for graphql_url in graphql_urls:
            url = urljoin(self.base_url, graphql_url)
            
            for query_data in queries:
                try:
                    # Update headers for GraphQL
                    headers = self.session.headers.copy()
                    headers['Content-Type'] = 'application/json'
                    
                    response = requests.post(url, 
                                           json=query_data, 
                                           headers=headers, 
                                           timeout=10)
                    
                    if response.status_code == 200:
                        try:
                            data = response.json()
                            
                            if 'data' in data and data['data']:
                                analysis = self.analyze_response_for_games(data['data'], url)
                                
                                if analysis['has_games']:
                                    print(f"✅ GRAPHQL GAME DATA: {graphql_url}")
                                    self.found_endpoints.append({
                                        'url': url,
                                        'pattern': graphql_url,
                                        'query': query_data['query'],
                                        'analysis': analysis,
                                        'method': 'graphql'
                                    })
                                    self.save_sample_response(f"graphql_{graphql_url.replace('/', '_')}", data)
                                    
                        except json.JSONDecodeError:
                            pass
                            
                except requests.RequestException:
                    pass
                
                time.sleep(0.2)
    
    def analyze_response_for_games(self, data, url):
        """Comprehensive analysis to detect game data"""
        analysis = {
            'has_games': False,
            'game_count': 0,
            'description': '',
            'confidence': 0,  # 0-100 confidence score
            'sample_games': []
        }
        
        def check_object(obj, path="", depth=0):
            if depth > 3:  # Prevent infinite recursion
                return False
                
            if isinstance(obj, dict):
                keys = list(obj.keys())
                
                # Check for direct game indicators
                game_keys = ['games', 'events', 'matches', 'fixtures', 'contests']
                odds_keys = ['odds', 'markets', 'lines', 'prices', 'betting']
                
                for key in keys:
                    value = obj[key]
                    
                    # Direct game array check
                    if key.lower() in [gk.lower() for gk in game_keys]:
                        if isinstance(value, list) and len(value) > 0:
                            return check_game_array(value, f"{path}.{key}")
                    
                    # Nested structure check
                    elif isinstance(value, (dict, list)):
                        if check_object(value, f"{path}.{key}", depth + 1):
                            return True
                            
            elif isinstance(obj, list) and len(obj) > 0:
                return check_game_array(obj, path)
                
            return False
        
        def check_game_array(arr, path):
            if not arr or not isinstance(arr, list):
                return False
                
            first_item = arr[0]
            if not isinstance(first_item, dict):
                return False
                
            item_keys = [k.lower() for k in first_item.keys()]
            
            # Team indicators
            team_indicators = ['home', 'away', 'hometeam', 'awayteam', 'team1', 'team2', 'homecompetitor', 'awaycompetitor']
            has_teams = any(indicator in item_keys for indicator in team_indicators)
            
            # Time indicators  
            time_indicators = ['starttime', 'gametime', 'time', 'start', 'kickoff', 'scheduled', 'datetime']
            has_time = any(indicator in item_keys for indicator in time_indicators)
            
            # Odds indicators
            odds_indicators = ['odds', 'markets', 'lines', 'prices', 'moneyline', 'spread', 'total', 'betting']
            has_odds = any(indicator in item_keys for indicator in odds_indicators)
            
            # Sport indicators
            sport_indicators = ['sport', 'league', 'competition', 'tournament']
            has_sport = any(indicator in item_keys for indicator in sport_indicators)
            
            # Calculate confidence
            confidence = 0
            if has_teams:
                confidence += 40
            if has_time:
                confidence += 20
            if has_odds:
                confidence += 30
            if has_sport:
                confidence += 10
                
            # Need at least teams + (time OR odds) for high confidence
            if confidence >= 60:
                analysis['has_games'] = True
                analysis['game_count'] = len(arr)
                analysis['description'] = f"Games in {path} - Teams:{has_teams}, Time:{has_time}, Odds:{has_odds}"
                analysis['confidence'] = confidence
                analysis['sample_games'] = arr[:2]  # First 2 games
                return True
                
            return False
        
        # Start analysis
        check_object(data)
        
        # Fallback checks for configuration data
        if not analysis['has_games']:
            if isinstance(data, dict):
                top_keys = [k.lower() for k in data.keys()]
                config_indicators = ['leagues', 'sports', 'config', 'navigation', 'sidebar', 'fallback']
                
                if any(indicator in top_keys for indicator in config_indicators):
                    analysis['description'] = "Configuration/metadata only"
                else:
                    analysis['description'] = f"Unknown structure: {list(data.keys())[:5]}"
                    
        return analysis
    
    def save_sample_response(self, name, data):
        """Save sample response for manual inspection"""
        try:
            timestamp = datetime.now().strftime('%H%M%S')
            filename = f"sample_{name}_{timestamp}.json"
            filepath = f"/Users/joelsalazar/OddsCentral/scrapy-scraper/{filename}"
            
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2)
                
        except Exception as e:
            print(f"   Warning: Could not save sample - {e}")
    
    def run_comprehensive_search(self):
        """Run all discovery methods"""
        print("🚀 Starting Comprehensive OddsJam Endpoint Discovery")
        print("=" * 70)
        
        # Extract build IDs
        build_ids = self.extract_all_build_ids()
        
        if not build_ids:
            print("⚠️  No build IDs found, using known fallback")
            build_ids = ['_lBykIN0RByeBTpFdr0Fv']
        
        # Test Next.js endpoints
        self.test_next_js_endpoints(build_ids)
        
        # Test direct API endpoints
        self.test_direct_api_endpoints()
        
        # Test GraphQL endpoints
        self.test_graphql_endpoints()
        
        # Results
        print("\n" + "=" * 70)
        print("📋 COMPREHENSIVE DISCOVERY RESULTS")
        print("=" * 70)
        
        if self.found_endpoints:
            print(f"✅ Found {len(self.found_endpoints)} endpoints with game data!")
            
            for i, endpoint in enumerate(self.found_endpoints, 1):
                print(f"\n{i}. {endpoint['pattern']} ({endpoint['method']})")
                print(f"   URL: {endpoint['url']}")
                print(f"   Games: {endpoint['analysis']['game_count']}")
                print(f"   Confidence: {endpoint['analysis']['confidence']}/100")
                print(f"   Description: {endpoint['analysis']['description']}")
                
                if 'build_id' in endpoint:
                    print(f"   Build ID: {endpoint['build_id']}")
                if 'query' in endpoint:
                    print(f"   GraphQL Query: {endpoint['query']}")
            
            # Save final results
            results_file = "/Users/joelsalazar/OddsCentral/scrapy-scraper/comprehensive_game_endpoints.json"
            with open(results_file, 'w') as f:
                json.dump(self.found_endpoints, f, indent=2)
            
            print(f"\n💾 Complete results saved to: comprehensive_game_endpoints.json")
            
            # Create updated endpoints file for scraper
            scraper_endpoints = []
            for endpoint in self.found_endpoints:
                scraper_endpoints.append({
                    "domain": "oddsjam.com",
                    "method": "GET",
                    "path": urlparse(endpoint['url']).path + ('?' + urlparse(endpoint['url']).query if urlparse(endpoint['url']).query else ''),
                    "headers": {
                        "Accept": "application/json",
                        "User-Agent": "Mozilla/5.0"
                    },
                    "endpoint_id": len(scraper_endpoints) + 1,
                    "game_count": endpoint['analysis']['game_count'],
                    "confidence": endpoint['analysis']['confidence']
                })
            
            scraper_file = "/Users/joelsalazar/OddsCentral/scrapy-scraper/updated_discovered_endpoints.json"
            with open(scraper_file, 'w') as f:
                json.dump(scraper_endpoints, f, indent=2)
            
            print(f"🔄 Scraper-ready endpoints saved to: updated_discovered_endpoints.json")
            
        else:
            print("❌ No game data endpoints discovered through automated testing.")
            print("\n🔧 MANUAL INVESTIGATION REQUIRED")
            print("The endpoints likely use one of these approaches:")
            print("1. ✅ Real-time WebSocket connections")
            print("2. ✅ Server-side rendering (data embedded in HTML)")  
            print("3. ✅ Dynamic client-side API calls after page load")
            print("4. ✅ Frequent build ID rotation (anti-scraping measure)")
            print("5. ✅ User session-based endpoints")
            
            print("\n📖 Next Steps:")
            print("1. Use browser DevTools Network tab while browsing OddsJam")
            print("2. Look for XHR/Fetch requests during page navigation")
            print("3. Monitor WebSocket connections for real-time data")
            print("4. Check if game data is embedded in initial HTML")
            print("5. Test the browser extension to intercept API calls")
            
            print(f"\n📚 Consult the guide: /Users/joelsalazar/OddsCentral/ENDPOINT_DISCOVERY_GUIDE.md")

if __name__ == "__main__":
    finder = ComprehensiveEndpointFinder()
    finder.run_comprehensive_search()