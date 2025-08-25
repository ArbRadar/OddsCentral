#!/usr/bin/env python3
"""
Monitor OddsJam network requests to find real game data endpoints.
This script will use selenium to monitor network traffic while browsing.
"""

import json
import time
import re
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

class OddsJamNetworkMonitor:
    def __init__(self):
        self.real_endpoints = []
        self.all_requests = []
        
    def setup_driver(self):
        """Setup Chrome driver with network logging enabled"""
        caps = DesiredCapabilities.CHROME
        caps['goog:loggingPrefs'] = {'performance': 'ALL'}
        
        chrome_options = Options()
        chrome_options.add_argument('--enable-network-service-logging')
        chrome_options.add_argument('--disable-extensions')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        # chrome_options.add_argument('--headless')  # Comment out for debugging
        
        return webdriver.Chrome(options=chrome_options, desired_capabilities=caps)
    
    def analyze_network_logs(self, driver):
        """Analyze network logs to find API endpoints"""
        logs = driver.get_log('performance')
        
        for entry in logs:
            message = json.loads(entry['message'])
            
            if message['message']['method'] == 'Network.responseReceived':
                response = message['message']['params']['response']
                url = response['url']
                status = response['status']
                content_type = response.get('mimeType', '')
                
                # Filter for API-like requests
                if self.is_potential_api_request(url, content_type):
                    self.all_requests.append({
                        'url': url,
                        'status': status,
                        'content_type': content_type,
                        'method': response.get('method', 'GET'),
                        'timestamp': datetime.now().isoformat()
                    })
                    
                    print(f"📡 API Request: {url}")
                    print(f"   Status: {status}, Type: {content_type}")
    
    def is_potential_api_request(self, url, content_type):
        """Determine if a request might contain game data"""
        # Skip static assets
        static_extensions = ['.js', '.css', '.png', '.jpg', '.gif', '.ico', '.svg', '.woff', '.ttf']
        if any(url.endswith(ext) for ext in static_extensions):
            return False
            
        # Look for API patterns
        api_patterns = [
            r'/api/',
            r'/_next/data/',
            r'/graphql',
            r'\.json',
            r'/data/',
            r'/live/',
            r'/odds',
            r'/games',
            r'/events',
            r'/markets'
        ]
        
        # Content type indicators
        if 'application/json' in content_type.lower():
            return True
            
        # URL pattern matching
        for pattern in api_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                return True
                
        return False
    
    def fetch_and_analyze_response(self, driver, url):
        """Fetch and analyze API response content"""
        try:
            # Execute JavaScript to fetch the URL
            script = f"""
            return fetch('{url}', {{
                method: 'GET',
                headers: {{
                    'Accept': 'application/json',
                    'User-Agent': navigator.userAgent
                }}
            }}).then(response => response.text())
            .catch(error => 'ERROR: ' + error.toString());
            """
            
            response_text = driver.execute_script(script)
            
            if response_text and not response_text.startswith('ERROR:'):
                try:
                    data = json.loads(response_text)
                    analysis = self.analyze_response_data(data, url)
                    
                    if analysis['has_game_data']:
                        print(f"✅ FOUND GAME DATA: {url}")
                        print(f"   Games: {analysis['game_count']}")
                        print(f"   Description: {analysis['description']}")
                        
                        self.real_endpoints.append({
                            'url': url,
                            'analysis': analysis,
                            'sample_data': analysis.get('sample_games', [])
                        })
                        
                        # Save sample data
                        timestamp = datetime.now().strftime('%H%M%S')
                        filename = f"game_data_sample_{timestamp}.json"
                        filepath = f"/Users/joelsalazar/OddsCentral/scrapy-scraper/{filename}"
                        
                        with open(filepath, 'w') as f:
                            json.dump(data, f, indent=2)
                        print(f"   💾 Saved to {filename}")
                        
                        return True
                    else:
                        print(f"📊 Config data: {url}")
                        return False
                        
                except json.JSONDecodeError:
                    print(f"⚠️  Non-JSON: {url}")
                    
        except Exception as e:
            print(f"❌ Error fetching {url}: {e}")
            
        return False
    
    def analyze_response_data(self, data, url):
        """Analyze response to determine if it contains game data"""
        analysis = {
            'has_game_data': False,
            'game_count': 0,
            'description': '',
            'sample_games': []
        }
        
        # Look for game data patterns
        game_data_keys = ['games', 'events', 'matches', 'fixtures', 'contests', 'data']
        
        def check_for_games(obj, path=""):
            if isinstance(obj, dict):
                for key, value in obj.items():
                    current_path = f"{path}.{key}" if path else key
                    
                    if isinstance(value, list) and len(value) > 0:
                        first_item = value[0]
                        if isinstance(first_item, dict):
                            # Check if this looks like game data
                            item_keys = list(first_item.keys())
                            has_teams = any(team_key in item_keys for team_key in ['home', 'away', 'homeTeam', 'awayTeam', 'team1', 'team2'])
                            has_odds = any(odds_key in item_keys for odds_key in ['odds', 'markets', 'lines', 'prices', 'moneyline', 'spread'])
                            has_time = any(time_key in item_keys for time_key in ['startTime', 'gameTime', 'time', 'start', 'kickoff'])
                            
                            if has_teams and (has_odds or has_time):
                                analysis['has_game_data'] = True
                                analysis['game_count'] = len(value)
                                analysis['description'] = f"Game data in {current_path} - {len(value)} games"
                                analysis['sample_games'] = value[:3]  # First 3 games
                                return True
                    
                    elif isinstance(value, dict):
                        if check_for_games(value, current_path):
                            return True
                            
            elif isinstance(obj, list) and len(obj) > 0:
                first_item = obj[0]
                if isinstance(first_item, dict):
                    item_keys = list(first_item.keys())
                    has_teams = any(team_key in item_keys for team_key in ['home', 'away', 'homeTeam', 'awayTeam'])
                    
                    if has_teams:
                        analysis['has_game_data'] = True
                        analysis['game_count'] = len(obj)
                        analysis['description'] = f"Direct game array - {len(obj)} games"
                        analysis['sample_games'] = obj[:3]
                        return True
                        
            return False
        
        check_for_games(data)
        
        if not analysis['has_game_data']:
            # Check for configuration patterns
            config_indicators = ['leagues', 'sports', 'config', 'navigation', 'sidebar']
            if isinstance(data, dict):
                top_keys = list(data.keys())
                if any(indicator in key.lower() for key in top_keys for indicator in config_indicators):
                    analysis['description'] = "Configuration/metadata only"
                else:
                    analysis['description'] = f"Unknown structure: {top_keys[:5]}"
                    
        return analysis
    
    def monitor_oddsjam_network(self):
        """Monitor OddsJam network requests to find game data endpoints"""
        print("🚀 Starting OddsJam Network Monitor")
        print("=" * 60)
        
        driver = self.setup_driver()
        
        try:
            # Navigate to different pages and monitor network
            pages_to_monitor = [
                'https://oddsjam.com/mlb/screen/moneyline',
                'https://oddsjam.com/mlb/screen/totals', 
                'https://oddsjam.com/mlb/screen/spreads',
                'https://oddsjam.com/nfl/screen/moneyline',
                'https://oddsjam.com/nba/screen/moneyline'
            ]
            
            for page_url in pages_to_monitor:
                print(f"\n📖 Monitoring: {page_url}")
                
                # Clear logs
                driver.get_log('performance')
                
                # Navigate to page
                driver.get(page_url)
                
                # Wait for page to load
                time.sleep(5)
                
                # Wait for dynamic content
                try:
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.TAG_NAME, "body"))
                    )
                except:
                    pass
                
                # Additional wait for async requests
                time.sleep(10)
                
                # Analyze network logs
                self.analyze_network_logs(driver)
                
                # Try scrolling to trigger more requests
                driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                time.sleep(3)
                
                # Analyze again after scrolling
                self.analyze_network_logs(driver)
            
            print(f"\n📊 Found {len(self.all_requests)} API requests")
            
            # Test each unique API request to see if it contains game data
            unique_urls = list(set(req['url'] for req in self.all_requests))
            print(f"🧪 Testing {len(unique_urls)} unique endpoints for game data...")
            
            for url in unique_urls:
                if self.fetch_and_analyze_response(driver, url):
                    # Found game data endpoint
                    pass
                    
        finally:
            driver.quit()
        
        # Results
        print("\n" + "=" * 60)
        print("📋 NETWORK MONITORING RESULTS")
        print("=" * 60)
        
        if self.real_endpoints:
            print(f"✅ Found {len(self.real_endpoints)} endpoints with real game data!")
            
            for i, endpoint in enumerate(self.real_endpoints, 1):
                print(f"\n{i}. {endpoint['url']}")
                print(f"   Games: {endpoint['analysis']['game_count']}")
                print(f"   Description: {endpoint['analysis']['description']}")
            
            # Save results
            results_file = "/Users/joelsalazar/OddsCentral/scrapy-scraper/network_discovered_endpoints.json"
            with open(results_file, 'w') as f:
                json.dump(self.real_endpoints, f, indent=2)
            print(f"\n💾 Results saved to: network_discovered_endpoints.json")
            
        else:
            print("❌ No real game data endpoints found via network monitoring.")
            
        # Also save all API requests for manual review
        all_requests_file = "/Users/joelsalazar/OddsCentral/scrapy-scraper/all_api_requests.json"
        with open(all_requests_file, 'w') as f:
            json.dump(self.all_requests, f, indent=2)
        print(f"📄 All API requests saved to: all_api_requests.json")

if __name__ == "__main__":
    try:
        monitor = OddsJamNetworkMonitor()
        monitor.monitor_oddsjam_network()
    except ImportError:
        print("❌ Selenium not installed. Install with: pip install selenium")
        print("Also ensure Chrome browser and chromedriver are installed.")
    except Exception as e:
        print(f"❌ Error running network monitor: {e}")
        print("\nTrying simplified approach without browser automation...")
        
        # Fallback: Manual endpoint testing based on common patterns
        print("\n🔧 Fallback: Testing common endpoint patterns...")
        
        import requests
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Referer': 'https://oddsjam.com/mlb/screen/moneyline'
        })
        
        # Test patterns that might be used for real-time data
        test_patterns = [
            "https://oddsjam.com/api/odds/live",
            "https://oddsjam.com/api/games/today", 
            "https://oddsjam.com/api/events/mlb",
            "https://oddsjam.com/api/markets/mlb",
            "https://oddsjam.com/data/odds/current",
            "https://oddsjam.com/live/games",
            "https://oddsjam.com/feed/odds"
        ]
        
        for pattern in test_patterns:
            try:
                response = session.get(pattern, timeout=10)
                if response.status_code == 200:
                    print(f"✅ Found working endpoint: {pattern}")
                    try:
                        data = response.json()
                        # Quick check for game data
                        if isinstance(data, dict) and ('games' in data or 'events' in data):
                            print(f"   Potential game data found!")
                    except:
                        pass
            except:
                pass