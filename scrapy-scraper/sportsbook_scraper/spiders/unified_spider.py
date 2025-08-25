import scrapy
import json
import requests
from datetime import datetime
from sportsbook_scraper.items import GameItem, OddsItem

class UnifiedSpider(scrapy.Spider):
    """
    Unified spider using new clean architecture.
    Replaces odds_spider.py with database-driven configuration.
    """
    name = "unified"
    allowed_domains = []  # Will be populated from platforms
    
    def __init__(self, *args, **kwargs):
        super(UnifiedSpider, self).__init__(*args, **kwargs)
        
        # Database configuration
        self.supabase_url = 'http://localhost:54320'
        self.supabase_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
        self.headers = {
            'apikey': self.supabase_key,
            'Authorization': f'Bearer {self.supabase_key}',
            'Content-Type': 'application/json'
        }
        
        # Load configuration from database
        self.platforms = self.load_platforms()
        self.targets = self.load_scraping_targets() 
        self.endpoints = self.load_known_endpoints()
        self.auth_data = self.load_platform_auth()
        self.bookmaker_filters = self.load_bookmaker_filters()
        
        # Update allowed domains from platforms
        self.allowed_domains = [p['base_url'].replace('https://', '').replace('http://', '') for p in self.platforms]
        
    def load_platforms(self):
        """Load active scraping platforms"""
        try:
            response = requests.get(
                f"{self.supabase_url}/scraping_platforms?active=eq.true",
                headers=self.headers
            )
            if response.ok:
                platforms = response.json()
                self.logger.info(f"Loaded {len(platforms)} active platforms")
                return platforms
            else:
                self.logger.error(f"Failed to load platforms: {response.status_code}")
                return []
        except Exception as e:
            self.logger.error(f"Error loading platforms: {e}")
            return []
    
    def load_scraping_targets(self):
        """Load enabled scraping targets"""
        try:
            response = requests.get(
                f"{self.supabase_url}/scraping_targets?enabled=eq.true&order=priority,name",
                headers=self.headers
            )
            if response.ok:
                targets = response.json()
                self.logger.info(f"Loaded {len(targets)} enabled scraping targets")
                for target in targets:
                    self.logger.info(f"  - {target['name']}: {target['config']}")
                return targets
            else:
                self.logger.error(f"Failed to load scraping targets: {response.status_code}")
                return []
        except Exception as e:
            self.logger.error(f"Error loading scraping targets: {e}")
            return []
    
    def load_known_endpoints(self):
        """Load known API endpoints"""
        try:
            response = requests.get(
                f"{self.supabase_url}/known_endpoints?active=eq.true",
                headers=self.headers
            )
            if response.ok:
                endpoints = response.json()
                self.logger.info(f"Loaded {len(endpoints)} known endpoints")
                return endpoints
            else:
                self.logger.error(f"Failed to load endpoints: {response.status_code}")
                return []
        except Exception as e:
            self.logger.error(f"Error loading endpoints: {e}")
            return []
    
    def load_platform_auth(self):
        """Load authentication data for platforms"""
        try:
            response = requests.get(
                f"{self.supabase_url}/platform_auth?active=eq.true",
                headers=self.headers
            )
            if response.ok:
                auth_records = response.json()
                auth_by_platform = {}
                for auth in auth_records:
                    platform_id = auth['platform_id']
                    auth_by_platform[platform_id] = auth['auth_data']
                    
                self.logger.info(f"Loaded authentication for {len(auth_by_platform)} platforms")
                return auth_by_platform
            else:
                self.logger.error(f"Failed to load platform auth: {response.status_code}")
                return {}
        except Exception as e:
            self.logger.error(f"Error loading platform auth: {e}")
            return {}
    
    def load_bookmaker_filters(self):
        """Load enabled bookmaker filters"""
        try:
            response = requests.get(
                f"{self.supabase_url}/bookmaker_filters?enabled=eq.true&order=priority,bookmaker_name",
                headers=self.headers
            )
            if response.ok:
                filters = response.json()
                # Group by platform_id
                filters_by_platform = {}
                for f in filters:
                    platform_id = f['platform_id']
                    if platform_id not in filters_by_platform:
                        filters_by_platform[platform_id] = set()
                    filters_by_platform[platform_id].add(f['bookmaker_name'])
                
                for platform_id, bookmakers in filters_by_platform.items():
                    self.logger.info(f"Platform {platform_id}: {len(bookmakers)} enabled bookmakers")
                    
                return filters_by_platform
            else:
                self.logger.error(f"Failed to load bookmaker filters: {response.status_code}")
                return {}
        except Exception as e:
            self.logger.error(f"Error loading bookmaker filters: {e}")
            return {}
    
    def start_requests(self):
        """Generate requests from enabled scraping targets"""
        
        if not self.targets:
            self.logger.warning("No enabled scraping targets found")
            return
            
        for target in self.targets:
            platform_id = target['platform_id']
            
            # Find platform info
            platform = next((p for p in self.platforms if p['id'] == platform_id), None)
            if not platform:
                self.logger.warning(f"Platform {platform_id} not found for target {target['name']}")
                continue
                
            # Find endpoint pattern for this platform
            endpoint = next((e for e in self.endpoints if e['platform_id'] == platform_id), None)
            if not endpoint:
                self.logger.warning(f"No endpoint pattern found for platform {platform['name']}")
                continue
            
            # Get authentication data
            auth_data = self.auth_data.get(platform_id, {})
            
            # Generate API URL from endpoint pattern and target config
            api_url = self.build_api_url(platform, endpoint, target, auth_data)
            if not api_url:
                continue
                
            # Build request headers
            request_headers = self.build_request_headers(platform, endpoint, auth_data)
            
            self.logger.info(f"Requesting: {target['name']} -> {api_url}")
            
            # Extract cookies for Scrapy
            cookies = {}
            if auth_data:
                if auth_data.get('access_token'):
                    cookies['access_token'] = auth_data['access_token']
                if auth_data.get('cf_clearance'):
                    cookies['cf_clearance'] = auth_data['cf_clearance']
                if auth_data.get('state'):
                    cookies['state'] = auth_data['state']
            
            yield scrapy.Request(
                url=api_url,
                method=endpoint.get('method', 'GET'),
                headers=request_headers,
                cookies=cookies,  # Use Scrapy's cookies parameter
                callback=self.parse_api_response,
                meta={
                    'platform': platform,
                    'target': target,
                    'endpoint': endpoint,
                    'auth_data': auth_data
                },
                dont_filter=True
            )
    
    def build_api_url(self, platform, endpoint, target, auth_data):
        """Build complete API URL from endpoint pattern and target config"""
        try:
            base_url = platform['base_url']
            pattern = endpoint['endpoint_pattern']
            config = target['config']
            
            # Replace placeholders in endpoint pattern with target config values
            api_path = pattern.format(**config)
            full_url = f"{base_url}{api_path}"
            
            return full_url
            
        except Exception as e:
            self.logger.error(f"Error building API URL for {target['name']}: {e}")
            return None
    
    def build_request_headers(self, platform, endpoint, auth_data):
        """Build request headers including authentication"""
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9'
        }
        
        # Note: Authentication cookies are now handled via Scrapy's cookies parameter
        # This prevents issues with cookie formatting and ensures proper handling
        
        # Add other auth types as needed (API keys, Bearer tokens, etc.)
        # Example: if auth_data.get('api_key'):
        #     headers['Authorization'] = f"Bearer {auth_data['api_key']}"
        
        # Platform-specific headers
        if platform['name'] == 'oddsjam':
            headers['Referer'] = 'https://oddsjam.com/'
            
        return headers
    
    def parse_api_response(self, response):
        """Parse API responses based on platform type"""
        platform = response.meta['platform']
        target = response.meta['target']
        
        try:
            data = json.loads(response.text)
            self.logger.info(f"Processing {target['name']} - Status: {response.status}")
            
            # Route to platform-specific parser
            if platform['name'] == 'oddsjam':
                yield from self.parse_oddsjam_response(data, response)
            else:
                self.logger.warning(f"No parser for platform: {platform['name']}")
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse JSON from {response.url}: {e}")
        except Exception as e:
            self.logger.error(f"Error processing {response.url}: {e}")
    
    def parse_oddsjam_response(self, data, response):
        """Parse OddsJam API responses"""
        platform = response.meta['platform']
        target = response.meta['target']
        
        if 'data' not in data:
            self.logger.warning(f"No 'data' field in OddsJam response for {target['name']}")
            return
        
        games_data = data['data']
        self.logger.info(f"Found {len(games_data)} games in {target['name']}")
        
        # Get enabled bookmakers for this platform
        enabled_bookmakers = self.bookmaker_filters.get(platform['id'], set())
        
        for game_data in games_data:
            try:
                game_id = game_data.get('game_id', '')
                self.logger.info(f"Processing game: {game_id}")
                
                if 'rows' not in game_data:
                    self.logger.warning(f"No rows data for game {game_id}")
                    continue
                
                rows = game_data['rows']
                self.logger.info(f"Game {game_id} has {len(rows)} rows")
                
                # Parse game data
                home_team, away_team, home_odds_data, away_odds_data = self.extract_game_info(rows)
                
                if home_team and away_team:
                    # Create game item
                    game_item = GameItem()
                    sport = target['config'].get('sport', 'unknown').upper()
                    league = target['config'].get('league', 'unknown').upper()
                    
                    game_item['sport'] = sport
                    game_item['league'] = league
                    game_item['game_id'] = game_id
                    game_item['home_team'] = home_team
                    game_item['away_team'] = away_team
                    game_item['start_time'] = datetime.utcnow().isoformat()
                    game_item['start_time_parsed'] = datetime.utcnow().isoformat()
                    game_item['created_at'] = datetime.utcnow().isoformat()
                    yield game_item
                    
                    # Process odds with bookmaker filtering
                    all_bookmakers = set(home_odds_data.keys()) | set(away_odds_data.keys())
                    
                    # Bookmaker filtering disabled - get all available odds
                    # if enabled_bookmakers:
                    #     original_count = len(all_bookmakers)
                    #     all_bookmakers = all_bookmakers & enabled_bookmakers
                    #     filtered_count = len(all_bookmakers)
                    #     if original_count != filtered_count:
                    #         self.logger.info(f"Filtered bookmakers for {game_id}: {original_count} → {filtered_count}")
                    
                    self.logger.info(f"Processing all {len(all_bookmakers)} bookmakers for {game_id}")
                    
                    for bookmaker_name in all_bookmakers:
                        home_odds_list = home_odds_data.get(bookmaker_name, [])
                        away_odds_list = away_odds_data.get(bookmaker_name, [])
                        
                        # Extract odds values
                        home_odds = self.extract_odds_value(home_odds_list)
                        away_odds = self.extract_odds_value(away_odds_list)
                        
                        # Create odds item if we have at least one odds value
                        if home_odds is not None or away_odds is not None:
                            odds_item = OddsItem()
                            odds_item['game_id'] = game_id
                            odds_item['sportsbook'] = bookmaker_name
                            odds_item['home_odds'] = home_odds
                            odds_item['away_odds'] = away_odds
                            odds_item['draw_odds'] = None
                            odds_item['odds_format'] = 'american'
                            odds_item['created_at'] = datetime.utcnow().isoformat()
                            odds_item['timestamp'] = datetime.utcnow().isoformat()
                            odds_item['scraping_source'] = target['name']
                            odds_item['scraping_method'] = 'api_scraping'
                            
                            yield odds_item
                
            except Exception as e:
                self.logger.error(f"Error processing game data: {e}")
    
    def extract_game_info(self, rows):
        """Extract game info from OddsJam rows"""
        home_odds_data = {}
        away_odds_data = {}
        home_team = None
        away_team = None
        
        for row_idx, row in enumerate(rows):
            if 'display' not in row or 'odds' not in row or 'home_or_away' not in row:
                continue
            
            display_info = row['display']
            odds_data = row['odds']
            home_or_away = row['home_or_away'].lower()
            
            # Extract team name from display info
            market_key = list(display_info.keys())[0]
            team_info = display_info[market_key]
            team_name = team_info.get('team_name', team_info.get('title', 'Unknown'))
            
            if home_or_away == 'home':
                home_team = team_name
                home_odds_data = odds_data
            else:
                away_team = team_name
                away_odds_data = odds_data
        
        return home_team, away_team, home_odds_data, away_odds_data
    
    def extract_odds_value(self, odds_list):
        """Extract odds value from odds list"""
        if odds_list and isinstance(odds_list, list) and len(odds_list) > 0:
            odds_info = odds_list[0]
            if isinstance(odds_info, dict) and 'price' in odds_info:
                try:
                    return int(float(odds_info['price']))
                except (ValueError, TypeError):
                    pass
        return None