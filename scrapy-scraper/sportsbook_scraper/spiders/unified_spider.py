import scrapy
import json
import requests
from datetime import datetime
from sportsbook_scraper.items import GameItem, OddsItem

class UnifiedSpider(scrapy.Spider):
    """
    Unified spider for scraping odds data from multiple platforms.
    
    This spider uses database-driven configuration to:
    1. Load scraping targets from the scraping_targets table
    2. Build API URLs using endpoint patterns from known_endpoints table
    3. Apply authentication from platform_auth table
    4. Filter bookmakers based on bookmaker_filters table
    
    OddsJam API Requirements:
    - All sports use the same endpoint: /api/backend/oddscreen/v2/game/data
    - Required parameters: sport, league, state, market_name, is_future, 
      game_status_filter, opening_odds
    - Authentication via cookies: access_token, cf_clearance, state
    - Supports both 2-way (MLB, NBA) and 3-way (soccer) markets
    
    Configuration Example:
    {
        "sport": "soccer",
        "league": "spain_-_la_liga", 
        "state": "MX-MX",
        "market_name": "moneyline",
        "is_future": "0",
        "game_status_filter": "All",
        "opening_odds": "false"
    }
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
        """
        Build complete API URL from endpoint pattern and target config.
        
        OddsJam URL Pattern:
        /api/backend/oddscreen/v2/game/data?sport={sport}&league={league}
        &market_name={market_name}&state={state}&is_future={is_future}
        &game_status_filter={game_status_filter}&opening_odds={opening_odds}
        
        All parameters are required for OddsJam API to return data.
        Missing parameters will result in empty responses or errors.
        """
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
                home_team, away_team, home_odds_data, away_odds_data, draw_odds_data = self.extract_game_info(rows)
                
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
                    
                    # Parse actual game start time from game_id or API data
                    actual_start_time = self.parse_game_start_time(game_data, game_id)
                    game_item['start_time'] = actual_start_time
                    game_item['start_time_parsed'] = actual_start_time
                    game_item['created_at'] = datetime.utcnow().isoformat()
                    yield game_item
                    
                    # Process odds with bookmaker filtering - include draw odds
                    all_bookmakers = set(home_odds_data.keys()) | set(away_odds_data.keys()) | set(draw_odds_data.keys())
                    
                    # Bookmaker filtering disabled - get all available odds
                    # if enabled_bookmakers:
                    #     original_count = len(all_bookmakers)
                    #     all_bookmakers = all_bookmakers & enabled_bookmakers
                    #     filtered_count = len(all_bookmakers)
                    #     if original_count != filtered_count:
                    #         self.logger.info(f"Filtered bookmakers for {game_id}: {original_count} → {filtered_count}")
                    
                    has_draw = bool(draw_odds_data)
                    game_type = "3-outcome" if has_draw else "2-outcome"
                    self.logger.info(f"Processing all {len(all_bookmakers)} bookmakers for {game_id} ({game_type} game)")
                    
                    for bookmaker_name in all_bookmakers:
                        home_odds_list = home_odds_data.get(bookmaker_name, [])
                        away_odds_list = away_odds_data.get(bookmaker_name, [])
                        draw_odds_list = draw_odds_data.get(bookmaker_name, [])
                        
                        # Extract odds values
                        home_odds = self.extract_odds_value(home_odds_list)
                        away_odds = self.extract_odds_value(away_odds_list)
                        draw_odds = self.extract_odds_value(draw_odds_list)
                        
                        # Create odds item if we have at least one odds value
                        if home_odds is not None or away_odds is not None or draw_odds is not None:
                            odds_item = OddsItem()
                            odds_item['game_id'] = game_id
                            odds_item['sportsbook'] = bookmaker_name
                            odds_item['home_odds'] = home_odds
                            odds_item['away_odds'] = away_odds
                            odds_item['draw_odds'] = draw_odds
                            odds_item['odds_format'] = 'american'
                            odds_item['created_at'] = datetime.utcnow().isoformat()
                            odds_item['timestamp'] = datetime.utcnow().isoformat()
                            odds_item['scraping_source'] = target['name']
                            odds_item['scraping_method'] = 'api_scraping'
                            
                            yield odds_item
                
            except Exception as e:
                self.logger.error(f"Error processing game data: {e}")
    
    def extract_game_info(self, rows):
        """Extract game info from OddsJam rows - supports both 2-outcome and 3-outcome games"""
        home_odds_data = {}
        away_odds_data = {}
        draw_odds_data = {}
        home_team = None
        away_team = None
        
        for row_idx, row in enumerate(rows):
            if 'display' not in row or 'odds' not in row:
                continue
            
            display_info = row['display']
            odds_data = row['odds']
            
            # Handle potential None or missing 'home_or_away' field
            home_or_away_value = row.get('home_or_away')
            if home_or_away_value is None:
                # For draw outcomes, home_or_away might be None or missing
                # Check if this looks like a draw based on team name
                market_key = list(display_info.keys())[0] if display_info else None
                if market_key:
                    team_info = display_info[market_key]
                    team_name = team_info.get('team_name', team_info.get('title', 'Unknown'))
                    if team_name.lower() in ['draw', 'tie', 'x']:
                        home_or_away = 'draw'
                    else:
                        self.logger.warning(f"Row {row_idx} has no home_or_away field and doesn't look like draw: {team_name}")
                        continue
                else:
                    self.logger.warning(f"Row {row_idx} has no home_or_away field and no display info")
                    continue
            else:
                home_or_away = home_or_away_value.lower()
            
            # Extract team name from display info
            if display_info:
                market_key = list(display_info.keys())[0]
                team_info = display_info[market_key]
                team_name = team_info.get('team_name', team_info.get('title', 'Unknown'))
            else:
                team_name = 'Unknown'
            
            # Assign data based on outcome type
            if home_or_away == 'home':
                home_team = team_name
                home_odds_data = odds_data
            elif home_or_away == 'away':
                away_team = team_name
                away_odds_data = odds_data
            elif home_or_away == 'draw':
                # For draw, we don't set team name but we do capture odds
                draw_odds_data = odds_data
            else:
                self.logger.warning(f"Unknown home_or_away value: {home_or_away} for team: {team_name}")
        
        return home_team, away_team, home_odds_data, away_odds_data, draw_odds_data
    
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
    
    def parse_game_start_time(self, game_data, game_id):
        """Parse actual game start time from API data or game_id"""
        try:
            # First, check if API provides actual start time fields
            if isinstance(game_data, dict):
                # Look for common time fields in the API response
                time_fields = ['start_time', 'commence_time', 'game_time', 'event_time', 'scheduled_time']
                for field in time_fields:
                    if field in game_data and game_data[field]:
                        # Try to parse the time
                        time_str = str(game_data[field])
                        # Handle Unix timestamp
                        if time_str.isdigit() and len(time_str) == 10:
                            return datetime.fromtimestamp(int(time_str)).isoformat()
                        # Handle ISO format
                        try:
                            parsed_time = datetime.fromisoformat(time_str.replace('Z', '+00:00'))
                            return parsed_time.isoformat()
                        except:
                            pass
            
            # Fallback: Parse from game_id format: "teamId1-teamId2-YYYY-MM-DD-HH"
            if '-' in game_id:
                parts = game_id.split('-')
                if len(parts) >= 5:
                    try:
                        year = int(parts[-3])
                        month = int(parts[-2])
                        day = int(parts[-1])
                        # Default hour to 19 (7 PM) if not specified
                        hour = 19
                        
                        # Check if there's an hour part
                        if len(parts) >= 6:
                            try:
                                hour = int(parts[-1])
                                day = int(parts[-2])
                                month = int(parts[-3])
                                year = int(parts[-4])
                            except:
                                pass
                        
                        # Create datetime object
                        game_datetime = datetime(year, month, day, hour, 0, 0)
                        return game_datetime.isoformat()
                        
                    except (ValueError, IndexError) as e:
                        self.logger.warning(f"Could not parse game_id {game_id} for time: {e}")
            
            # Ultimate fallback: use current time
            self.logger.warning(f"Could not determine start time for {game_id}, using current time")
            return datetime.utcnow().isoformat()
            
        except Exception as e:
            self.logger.error(f"Error parsing start time for {game_id}: {e}")
            return datetime.utcnow().isoformat()