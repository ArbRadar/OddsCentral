import scrapy
import json
import requests
from datetime import datetime
from sportsbook_scraper.items import GameItem, OddsItem

class OddsSpiderSpider(scrapy.Spider):
    name = "odds_spider"
    allowed_domains = ["oddsjam.com"]
    
    def __init__(self, endpoints_file=None, urls_file=None, *args, **kwargs):
        super(OddsSpiderSpider, self).__init__(*args, **kwargs)
        self.endpoints_file = endpoints_file or "discovered_endpoints.json"
        self.urls_file = urls_file or "url_manager_urls.json"
        self.discovered_endpoints = self.load_endpoints()
        self.url_manager_urls = self.load_url_manager_urls()
        self.enabled_sportsbooks = self.load_enabled_sportsbooks()
        
        # Define all sports/leagues to scrape (fallback when no specific URLs/endpoints)
        self.sports_config = [
            {'sport': 'baseball', 'league': 'mlb'},
            {'sport': 'football', 'league': 'nfl'}, 
            {'sport': 'basketball', 'league': 'nba'},
            {'sport': 'hockey', 'league': 'nhl'},
            {'sport': 'football', 'league': 'ncaaf'},
            {'sport': 'basketball', 'league': 'ncaab'},
            {'sport': 'soccer', 'league': 'mls'},
            {'sport': 'soccer', 'league': 'epl'},
            {'sport': 'tennis', 'league': 'atp'},
            {'sport': 'golf', 'league': 'pga'},
            {'sport': 'mma', 'league': 'ufc'}
        ]
        
    def load_endpoints(self):
        """Load discovered endpoints from extension"""
        try:
            # Try to load from endpoints file
            import os
            endpoints_path = os.path.join(os.getcwd(), self.endpoints_file)
            if os.path.exists(endpoints_path):
                with open(endpoints_path, 'r') as f:
                    endpoints = json.loads(f.read())
                    self.logger.info(f"Loaded {len(endpoints)} endpoints from {endpoints_path}")
                    return endpoints
            else:
                self.logger.warning(f"Endpoints file not found: {endpoints_path}")
                
            # Fallback to hardcoded endpoints
            return [
                {
                    "domain": "oddsjam.com",
                    "method": "GET", 
                    "path": "/_next/data/WzUffJO619HTJItqBbnuC/mlb/screen/moneyline.json",
                    "headers": {
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
                        "Accept": "application/json",
                        "Referer": "https://oddsjam.com/mlb/screen/moneyline"
                    }
                }
            ]
        except Exception as e:
            self.logger.error(f"Failed to load endpoints: {e}")
            return []

    def load_url_manager_urls(self):
        """Load URLs from URL manager"""
        try:
            import os
            urls_path = os.path.join(os.getcwd(), self.urls_file)
            if os.path.exists(urls_path):
                with open(urls_path, 'r') as f:
                    urls = json.loads(f.read())
                    self.logger.info(f"Loaded {len(urls)} URLs from URL manager: {urls_path}")
                    return urls
            else:
                self.logger.info(f"URL manager file not found: {urls_path}")
                return []
        except Exception as e:
            self.logger.error(f"Failed to load URL manager URLs: {e}")
            return []
    
    def load_enabled_sportsbooks(self):
        """Load enabled sportsbooks from database"""
        try:
            import os
            supabase_url = os.getenv('SUPABASE_URL', 'http://localhost:54320')
            supabase_key = os.getenv('SUPABASE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0')
            
            headers = {
                'apikey': supabase_key,
                'Authorization': f'Bearer {supabase_key}',
                'Content-Type': 'application/json'
            }
            
            response = requests.get(
                f"{supabase_url}/sportsbook_filters?enabled=eq.true&order=priority,sportsbook",
                headers=headers
            )
            
            if response.ok:
                enabled_books = response.json()
                sportsbook_names = [book['sportsbook'] for book in enabled_books]
                self.logger.info(f"Loaded {len(sportsbook_names)} enabled sportsbooks: {sportsbook_names}")
                return set(sportsbook_names)
            else:
                self.logger.warning(f"Failed to load sportsbook filters: {response.status_code}")
                # Fallback to all sportsbooks if filter table not available
                return set()
                
        except Exception as e:
            self.logger.warning(f"Error loading sportsbook filters: {e}, will scrape all sportsbooks")
            return set()
    
    def start_requests(self):
        """Generate requests from URL manager (single source of truth) and default sports fallback"""
        
        # Note: Discovered endpoints are now managed through URL manager for unified control
        # No longer processing discovered_endpoints separately to avoid conflicts
        
        # Process URL manager URLs (these are the user-selected URLs)
        if self.url_manager_urls:
            self.logger.info(f"Processing {len(self.url_manager_urls)} URLs from URL manager")
            for url_item in self.url_manager_urls:
                # Check if this URL has associated API endpoints discovered by the extension
                associated_endpoints = url_item.get('associated_endpoints', [])
                
                if associated_endpoints:
                    # Process all discovered API endpoints for this URL
                    self.logger.info(f"URL {url_item['domain']} has {len(associated_endpoints)} associated API endpoints")
                    for endpoint in associated_endpoints:
                        api_url = f"https://{endpoint['domain']}{endpoint['path']}"
                        self.logger.info(f"🎯 Requesting OddsJam API: {api_url}")
                        
                        yield scrapy.Request(
                            url=api_url,
                            method=endpoint.get('method', 'GET'),
                            headers=endpoint.get('headers', {}),
                            callback=self.parse_api_response,
                            meta={
                                'endpoint': endpoint,
                                'url_id': url_item.get('url_id'),
                                'sport': url_item.get('sport'),
                                'league': url_item.get('league'),
                                'scrape_source': 'url_manager',
                                'parent_url': url_item.get('url')
                            },
                            dont_filter=True
                        )
                else:
                    # No associated API endpoints - process the URL directly
                    url = f"https://{url_item['domain']}{url_item['path']}"
                    
                    # Check if the URL itself looks like an API endpoint
                    if any(api_indicator in url_item['path'].lower() for api_indicator in ['/api/', '.json', 'data?']):
                        # This looks like an API endpoint
                        yield scrapy.Request(
                            url=url,
                            method=url_item.get('method', 'GET'),
                            headers=url_item.get('headers', {}),
                            callback=self.parse_api_response,
                            meta={
                                'endpoint': url_item,
                                'url_id': url_item.get('url_id'),
                                'sport': url_item.get('sport'),
                                'league': url_item.get('league'),
                                'scrape_source': 'url_manager'
                            },
                            dont_filter=True
                        )
                    else:
                        # This looks like a webpage - try to extract data or look for API calls
                        yield scrapy.Request(
                            url=url,
                            method=url_item.get('method', 'GET'),
                            headers=url_item.get('headers', {
                                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                            }),
                            callback=self.parse_webpage_for_data,
                            meta={
                                'url_item': url_item,
                                'url_id': url_item.get('url_id'),
                                'sport': url_item.get('sport'),
                                'league': url_item.get('league'),
                                'scrape_source': 'url_manager'
                            },
                            dont_filter=True
                        )
        
        # Only generate default sports requests if no user-defined URLs are available
        if not self.url_manager_urls:
            self.logger.info("No URL manager URLs found, generating default sports requests")
            base_url = "https://oddsjam.com/api/backend/oddscreen/v2/game/data"
            headers = {
                "Accept": "application/json",
                "User-Agent": "Mozilla/5.0"
            }
            
            for config in self.sports_config:
                url = f"{base_url}?sport={config['sport']}&league={config['league']}&bet_type=moneyline"
                
                yield scrapy.Request(
                    url=url,
                    method='GET',
                    headers=headers,
                    callback=self.parse_api_response,
                    meta={
                        'endpoint': {
                            'domain': 'oddsjam.com',
                            'path': f"/api/backend/oddscreen/v2/game/data?sport={config['sport']}&league={config['league']}&bet_type=moneyline",
                            'method': 'GET'
                        },
                        'sport': config['sport'],
                        'league': config['league'],
                        'scrape_source': 'default_sports'
                    },
                    dont_filter=True
                )
    
    def parse_webpage_for_data(self, response):
        """Parse webpage URLs for odds data - tries to find API endpoints or extract from page"""
        url_item = response.meta.get('url_item', {})
        self.logger.info(f"Parsing webpage: {response.url}")
        
        # This is a placeholder for webpage parsing logic
        # For OddsJam pages, we could:
        # 1. Look for embedded JSON data in script tags
        # 2. Extract data from rendered DOM
        # 3. Find and follow API calls made by the page
        
        try:
            # Check if the page contains odds data in JSON format
            content_type = response.headers.get('content-type', b'').decode('utf-8') if isinstance(response.headers.get('content-type', ''), bytes) else response.headers.get('content-type', '')
            if content_type.startswith('application/json'):
                # If it's actually JSON, parse as API response
                yield from self.parse_api_response(response)
                return
            
            # Look for JSON data in script tags
            json_scripts = response.css('script[type="application/json"]::text').getall()
            for script_text in json_scripts:
                try:
                    data = json.loads(script_text)
                    if self.contains_odds_data(data):
                        self.logger.info(f"Found odds data in JSON script on {response.url}")
                        # Process the JSON data directly
                        yield from self.parse_generic_odds(data, response)
                        return
                except json.JSONDecodeError:
                    continue
            
            # Look for Next.js data
            nextjs_scripts = response.css('script#__NEXT_DATA__::text').getall()
            for script_text in nextjs_scripts:
                try:
                    data = json.loads(script_text)
                    if self.contains_odds_data(data):
                        self.logger.info(f"Found odds data in Next.js data on {response.url}")
                        # Process the JSON data directly
                        yield from self.parse_generic_odds(data, response)
                        return
                except json.JSONDecodeError:
                    continue
            
            # If we can't find structured data, at least log that we visited the page
            self.logger.warning(f"Could not extract odds data from webpage: {response.url}")
            
        except Exception as e:
            self.logger.error(f"Error parsing webpage {response.url}: {e}")

    def contains_odds_data(self, data):
        """Check if data contains odds information"""
        if not isinstance(data, dict):
            return False
        
        # Look for common odds data indicators
        odds_indicators = ['odds', 'lines', 'games', 'markets', 'events', 'price', 'moneyline']
        data_str = json.dumps(data).lower()
        
        return any(indicator in data_str for indicator in odds_indicators)
    
    def parse_api_response(self, response):
        """Parse API responses for odds data"""
        endpoint = response.meta['endpoint']
        
        try:
            data = json.loads(response.text)
            self.logger.info(f"Processing {endpoint['path']} - Status: {response.status}")
            
            # Parse based on endpoint pattern
            if 'game/markets' in endpoint['path']:
                yield from self.parse_game_markets(data, response)
            elif 'moneyline.json' in endpoint['path']:
                yield from self.parse_moneyline_data(data, response)
            elif '/api/backend/oddscreen/v2/game/data' in endpoint['path']:
                yield from self.parse_oddscreen_api(data, response)
            else:
                # Generic odds data parser
                yield from self.parse_generic_odds(data, response)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON from {response.url}: {e}")
        except Exception as e:
            self.logger.error(f"Error processing {response.url}: {e}")
    
    def parse_game_markets(self, data, response):
        """Parse game markets endpoint"""
        # This would be customized based on the actual API response structure
        if 'games' in data:
            for game_data in data['games']:
                game_item = GameItem()
                game_item['sport'] = 'BASEBALL'
                game_item['league'] = 'MLB'
                game_item['home_team'] = game_data.get('home_team', '')
                game_item['away_team'] = game_data.get('away_team', '')
                game_item['start_time'] = game_data.get('start_time', '')
                game_item['created_at'] = datetime.utcnow().isoformat()
                
                # Generate game_id
                game_item['game_id'] = f"BASEBALL_MLB_{game_item['home_team']}_{game_item['away_team']}_{game_item['start_time']}"
                
                yield game_item
                
                # Parse odds for this game
                if 'odds' in game_data:
                    # Filter sportsbooks if filtering is enabled
                    odds_items = game_data['odds'].items()
                    if self.enabled_sportsbooks:
                        original_books = list(game_data['odds'].keys())
                        odds_items = [(sb, od) for sb, od in odds_items if sb in self.enabled_sportsbooks]
                        filtered_books = [sb for sb, od in odds_items]
                        if len(original_books) != len(filtered_books):
                            self.logger.info(f"Filtered sportsbooks: {len(original_books)} → {len(filtered_books)}")
                    
                    for sportsbook, odds_data in odds_items:
                        odds_item = OddsItem()
                        odds_item['game_id'] = game_item['game_id']
                        odds_item['sportsbook'] = sportsbook
                        odds_item['home_odds'] = odds_data.get('home')
                        odds_item['away_odds'] = odds_data.get('away') 
                        odds_item['draw_odds'] = odds_data.get('draw')
                        odds_item['odds_format'] = odds_data.get('format', 'decimal')
                        odds_item['created_at'] = datetime.utcnow().isoformat()
                        odds_item['scraping_source'] = response.meta.get('scrape_source', 'scrapy_monitor')
                        odds_item['scraping_method'] = 'api_scraping'
                        
                        yield odds_item
    
    def parse_moneyline_data(self, data, response):
        """Parse moneyline JSON data"""
        self.logger.info(f"Found moneyline data with keys: {list(data.keys()) if isinstance(data, dict) else 'Not dict'}")
        
        # The actual structure has pageProps containing the data
        if 'pageProps' in data:
            page_props = data['pageProps']
            self.logger.info(f"PageProps keys: {list(page_props.keys()) if isinstance(page_props, dict) else 'Not dict'}")
            
            # Look for common data structures
            for key, value in page_props.items():
                if isinstance(value, list) and len(value) > 0:
                    self.logger.info(f"Found list '{key}' with {len(value)} items")
                    if len(value) > 0:
                        self.logger.info(f"First item keys: {list(value[0].keys()) if isinstance(value[0], dict) else 'Not dict'}")
                elif isinstance(value, dict) and len(value) > 0:
                    self.logger.info(f"Found dict '{key}' with keys: {list(value.keys())}")
                    
                    # If it's fallback, dig deeper
                    if key == 'fallback':
                        self.logger.info("Exploring fallback structure...")
                        for fb_key, fb_value in value.items():
                            if isinstance(fb_value, (list, dict)):
                                fb_type = type(fb_value).__name__
                                fb_len = len(fb_value) if hasattr(fb_value, '__len__') else 0
                                self.logger.info(f"  fallback['{fb_key}'] = {fb_type} with {fb_len} items")
                                
                                if isinstance(fb_value, list) and len(fb_value) > 0 and isinstance(fb_value[0], dict):
                                    self.logger.info(f"    First item keys: {list(fb_value[0].keys())}")
            
            # Try to extract games/odds data from various possible structures
            games_data = None
            
            # First check fallback structure
            if 'fallback' in page_props:
                fallback = page_props['fallback']
                # Look for games data in fallback
                possible_game_keys = ['games', 'events', 'matches', 'odds', 'data', 'results', 'leagues']
                
                for key in possible_game_keys:
                    if key in fallback:
                        if isinstance(fallback[key], list) and len(fallback[key]) > 0:
                            games_data = fallback[key]
                            self.logger.info(f"Using games data from fallback['{key}']")
                            break
                        elif isinstance(fallback[key], dict):
                            # Might be nested structure
                            for nested_key, nested_value in fallback[key].items():
                                if isinstance(nested_value, list) and len(nested_value) > 0:
                                    games_data = nested_value
                                    self.logger.info(f"Using games data from fallback['{key}']['{nested_key}']")
                                    break
                            if games_data:
                                break
            
            # If not found in fallback, check top level
            if not games_data:
                possible_game_keys = ['games', 'events', 'matches', 'odds', 'data', 'results']
                for key in possible_game_keys:
                    if key in page_props and isinstance(page_props[key], list):
                        games_data = page_props[key]
                        self.logger.info(f"Using games data from key: {key}")
                        break
            
            if games_data:
                for i, game_data in enumerate(games_data[:3]):  # Process first 3 for testing
                    try:
                        self.logger.info(f"Processing game {i+1}: {list(game_data.keys()) if isinstance(game_data, dict) else 'Not dict'}")
                        
                        # Extract basic game info (adapt to actual structure)
                        game_item = GameItem()
                        game_item['sport'] = 'BASEBALL'
                        game_item['league'] = 'MLB'
                        game_item['home_team'] = str(game_data.get('home', game_data.get('homeTeam', 'Unknown')))
                        game_item['away_team'] = str(game_data.get('away', game_data.get('awayTeam', 'Unknown')))
                        game_item['start_time'] = str(game_data.get('startTime', game_data.get('time', '')))
                        game_item['created_at'] = datetime.utcnow().isoformat()
                        
                        # Generate game_id
                        game_id = f"BASEBALL_MLB_{game_item['home_team']}_{game_item['away_team']}_{game_item['start_time']}"
                        game_id = game_id.replace(' ', '_').replace('/', '_')
                        game_item['game_id'] = game_id
                        
                        yield game_item
                        
                        # Look for odds in the game data
                        if 'odds' in game_data or 'lines' in game_data:
                            odds_data = game_data.get('odds', game_data.get('lines', {}))
                            
                            # Filter sportsbooks if filtering is enabled
                            odds_items = odds_data.items()
                            if self.enabled_sportsbooks:
                                original_books = list(odds_data.keys())
                                odds_items = [(sb, oi) for sb, oi in odds_items if sb in self.enabled_sportsbooks]
                                filtered_books = [sb for sb, oi in odds_items]
                                if len(original_books) != len(filtered_books):
                                    self.logger.info(f"Game {i+1} - Filtered sportsbooks: {len(original_books)} → {len(filtered_books)}")
                            
                            for sportsbook, odds_info in odds_items:
                                if isinstance(odds_info, dict):
                                    odds_item = OddsItem()
                                    odds_item['game_id'] = game_id
                                    odds_item['sportsbook'] = str(sportsbook)
                                    odds_item['home_odds'] = odds_info.get('home')
                                    odds_item['away_odds'] = odds_info.get('away')
                                    odds_item['draw_odds'] = odds_info.get('draw')
                                    odds_item['odds_format'] = 'decimal'
                                    odds_item['created_at'] = datetime.utcnow().isoformat()
                                    odds_item['scraping_source'] = response.meta.get('scrape_source', 'scrapy_monitor')
                                    odds_item['scraping_method'] = 'api_scraping'
                                    
                                    yield odds_item
                                    
                    except Exception as e:
                        self.logger.error(f"Error processing game {i+1}: {e}")
            else:
                self.logger.warning("No recognizable games data structure found")
        else:
            self.logger.warning("No pageProps found in response")
    
    def parse_oddscreen_api(self, data, response):
        """Parse the /api/backend/oddscreen/v2/game/data API format"""
        self.logger.info(f"Processing oddscreen API data from {response.url}")
        
        if 'data' not in data:
            self.logger.warning("No 'data' field found in oddscreen API response")
            return
        
        games_data = data['data']
        self.logger.info(f"Found {len(games_data)} games in oddscreen API")
        
        for game_data in games_data:
            try:
                # Extract game info
                game_id = game_data.get('game_id', '')
                team_name = game_data.get('teamName', '')
                entity = game_data.get('entity', 'default')
                
                self.logger.info(f"Processing game: {game_id}")
                
                if 'rows' not in game_data:
                    self.logger.warning(f"No rows data for game {game_id}")
                    continue
                
                rows = game_data['rows']
                self.logger.info(f"Game {game_id} has {len(rows)} sportsbook rows")
                
                # Collect odds from both rows (home and away)
                home_odds_data = {}
                away_odds_data = {}
                home_team = None
                away_team = None
                
                # First pass: collect odds from both rows
                for row_idx, row in enumerate(rows):
                    if 'display' not in row or 'odds' not in row or 'home_or_away' not in row:
                        self.logger.warning(f"Missing required fields in row {row_idx}")
                        continue
                    
                    display_info = row['display']
                    odds_data = row['odds']
                    home_or_away = row['home_or_away'].lower()  # 'AWAY' or 'HOME'
                    
                    # Extract team name from display info
                    market_key = list(display_info.keys())[0]  # e.g., 'Moneyline'
                    team_info = display_info[market_key]
                    team_name = team_info.get('team_name', team_info.get('title', 'Unknown'))
                    
                    self.logger.info(f"Processing {home_or_away} team: {team_name}")
                    
                    if home_or_away == 'home':
                        home_team = team_name
                        home_odds_data = odds_data
                    else:
                        away_team = team_name
                        away_odds_data = odds_data
                
                # Create game item
                if home_team and away_team:
                    game_item = GameItem()
                    # Get sport/league from response meta or default
                    sport = response.meta.get('sport', 'baseball').upper()
                    league = response.meta.get('league', 'mlb').upper()
                    
                    game_item['sport'] = sport
                    game_item['league'] = league
                    game_item['game_id'] = game_id
                    game_item['home_team'] = home_team
                    game_item['away_team'] = away_team
                    game_item['start_time'] = datetime.utcnow().isoformat()
                    game_item['start_time_parsed'] = datetime.utcnow().isoformat()
                    game_item['created_at'] = datetime.utcnow().isoformat()
                    yield game_item
                    
                    # Combine odds from both sides
                    all_sportsbooks = set(home_odds_data.keys()) | set(away_odds_data.keys())
                    
                    # Filter sportsbooks if filtering is enabled
                    if self.enabled_sportsbooks:
                        original_count = len(all_sportsbooks)
                        all_sportsbooks = all_sportsbooks & self.enabled_sportsbooks
                        filtered_count = len(all_sportsbooks)
                        if original_count != filtered_count:
                            self.logger.info(f"Filtered sportsbooks for {game_id}: {original_count} → {filtered_count}")
                    
                    for sportsbook_name in all_sportsbooks:
                        home_odds_list = home_odds_data.get(sportsbook_name, [])
                        away_odds_list = away_odds_data.get(sportsbook_name, [])
                        
                        # Get odds values
                        home_odds = None
                        away_odds = None
                        
                        if home_odds_list and isinstance(home_odds_list, list) and len(home_odds_list) > 0:
                            home_info = home_odds_list[0]
                            if isinstance(home_info, dict) and 'price' in home_info:
                                try:
                                    home_odds = int(float(home_info['price']))
                                except (ValueError, TypeError):
                                    pass
                        
                        if away_odds_list and isinstance(away_odds_list, list) and len(away_odds_list) > 0:
                            away_info = away_odds_list[0]
                            if isinstance(away_info, dict) and 'price' in away_info:
                                try:
                                    away_odds = int(float(away_info['price']))
                                except (ValueError, TypeError):
                                    pass
                        
                        # Only create odds item if we have at least one odds value
                        if home_odds is not None or away_odds is not None:
                            odds_item = OddsItem()
                            odds_item['game_id'] = game_id
                            odds_item['sportsbook'] = sportsbook_name
                            odds_item['home_odds'] = home_odds
                            odds_item['away_odds'] = away_odds
                            odds_item['draw_odds'] = None
                            odds_item['odds_format'] = 'american'
                            odds_item['created_at'] = datetime.utcnow().isoformat()
                            odds_item['timestamp'] = datetime.utcnow().isoformat()
                            odds_item['scraping_source'] = response.meta.get('scrape_source', 'scrapy_monitor')
                            odds_item['scraping_method'] = 'api_scraping'
                            
                            yield odds_item
                
            except Exception as e:
                self.logger.error(f"Error processing oddscreen game data: {e}")
        
    def parse_generic_odds(self, data, response):
        """Generic parser for unknown odds data structures"""
        self.logger.info(f"Processing generic odds data from {response.url}")
        
        # Log data structure for debugging
        self.logger.info(f"Data type: {type(data)}")
        if isinstance(data, dict):
            self.logger.info(f"Keys: {list(data.keys())[:10]}")  # Show first 10 keys
            
            # Check for Next.js props structure
            if 'props' in data:
                props = data['props']
                self.logger.info(f"Props type: {type(props)}, keys: {list(props.keys()) if isinstance(props, dict) else 'N/A'}")
                
                # Look for pageProps which usually contains the data
                if isinstance(props, dict) and 'pageProps' in props:
                    page_props = props['pageProps']
                    self.logger.info(f"PageProps keys: {list(page_props.keys()) if isinstance(page_props, dict) else 'N/A'}")
                    
                    # Look for common data containers
                    for key in ['data', 'games', 'odds', 'markets', 'initialData', 'serverData', 'fallback']:
                        if isinstance(page_props, dict) and key in page_props:
                            self.logger.info(f"Found '{key}' in pageProps with type: {type(page_props[key])}")
                            if isinstance(page_props[key], (list, dict)):
                                try:
                                    length = len(page_props[key])
                                    self.logger.info(f"'{key}' contains {length} items")
                                    
                                    # If it's fallback (SWR pattern), examine its keys
                                    if key == 'fallback' and isinstance(page_props[key], dict):
                                        fallback_keys = list(page_props[key].keys())[:5]  # First 5 keys
                                        self.logger.info(f"Fallback keys (first 5): {fallback_keys}")
                                        
                                        # Look for API endpoint keys that might contain game data
                                        for fb_key in page_props[key].keys():
                                            if any(pattern in fb_key for pattern in ['game', 'odds', 'market', 'screen', 'mlb']):
                                                self.logger.info(f"Interesting fallback key: {fb_key[:100]}...")  # Truncate long keys
                                                data_item = page_props[key][fb_key]
                                                if isinstance(data_item, dict):
                                                    self.logger.info(f"  Data keys: {list(data_item.keys())[:5]}")
                                except:
                                    pass
            
        # Implement basic parsing logic
        games_found = 0
        odds_found = 0
        
        try:
            # Look for Next.js props structure with game data
            if isinstance(data, dict) and 'props' in data:
                props = data['props']
                if isinstance(props, dict) and 'pageProps' in props:
                    page_props = props['pageProps']
                    if isinstance(page_props, dict) and 'fallback' in page_props:
                        fallback = page_props['fallback']
                        
                        # Search through all fallback data for games/odds
                        for key, value in fallback.items():
                            if isinstance(value, dict):
                                # Look for game arrays
                                for sub_key, sub_value in value.items():
                                    if isinstance(sub_value, list) and len(sub_value) > 0:
                                        # Check if this looks like game data
                                        sample = sub_value[0] if sub_value else {}
                                        if isinstance(sample, dict):
                                            sample_keys = set(str(k).lower() for k in sample.keys())
                                            game_indicators = {'team', 'home', 'away', 'game', 'match', 'event'}
                                            odds_indicators = {'odds', 'line', 'price', 'moneyline', 'spread'}
                                            
                                            if sample_keys & game_indicators:
                                                games_found += len(sub_value)
                                                self.logger.info(f"Found {len(sub_value)} potential games in {sub_key}")
                                            
                                            if sample_keys & odds_indicators:
                                                odds_found += len(sub_value)
                                                self.logger.info(f"Found {len(sub_value)} potential odds in {sub_key}")
        
        except Exception as e:
            self.logger.error(f"Error in basic parsing: {e}")
        
        # For now, just log what we found without creating actual items
        if games_found > 0 or odds_found > 0:
            self.logger.info(f"SUMMARY: Found {games_found} potential games, {odds_found} potential odds records")
        else:
            self.logger.warning("No structured game/odds data found in Next.js props")
        
        return []
