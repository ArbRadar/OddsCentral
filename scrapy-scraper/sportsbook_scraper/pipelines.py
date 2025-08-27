# Define your item pipelines here
import requests
import json
from datetime import datetime
from itemadapter import ItemAdapter
from sportsbook_scraper.items import GameItem, OddsItem

class SupabasePipeline:
    """Pipeline to send scraped data to Supabase"""
    
    def __init__(self, supabase_url=None, supabase_key=None):
        self.supabase_url = supabase_url or "http://localhost:54320"
        self.supabase_key = supabase_key or "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
        
        self.headers = {
            'apikey': self.supabase_key,
            'Authorization': f'Bearer {self.supabase_key}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
        
        # Track processed items to avoid duplicates
        self.processed_games = set()
        self.stats = {
            'games_processed': 0,
            'odds_processed': 0, 
            'games_inserted': 0,
            'odds_inserted': 0,
            'errors': 0
        }
    
    @classmethod
    def from_crawler(cls, crawler):
        return cls(
            supabase_url=crawler.settings.get('SUPABASE_URL'),
            supabase_key=crawler.settings.get('SUPABASE_KEY')
        )
    
    def process_item(self, item, spider):
        """Process items and send to Supabase"""
        adapter = ItemAdapter(item)
        
        try:
            if isinstance(item, GameItem):
                self.process_game_item(adapter, spider)
            elif isinstance(item, OddsItem):
                self.process_odds_item(adapter, spider)
            else:
                spider.logger.warning(f"Unknown item type: {type(item)}")
                
        except Exception as e:
            self.stats['errors'] += 1
            spider.logger.error(f"Error processing item: {e}")
            
        return item
    
    def process_game_item(self, adapter, spider):
        """Process and insert game items"""
        game_id = adapter['game_id']
        
        # Skip if already processed
        if game_id in self.processed_games:
            spider.logger.debug(f"Game already processed: {game_id}")
            return
            
        self.stats['games_processed'] += 1
        
        # Prepare game data
        game_data = {
            'game_id': game_id,
            'sport': adapter['sport'],
            'league': adapter['league'], 
            'home_team': adapter['home_team'],
            'away_team': adapter['away_team'],
            'start_time': adapter['start_time'],
            'start_time_parsed': adapter.get('start_time_parsed', adapter['start_time']),
            'created_at': adapter['created_at']
        }
        
        # Try to insert game, handle duplicates gracefully
        spider.logger.info(f"🔍 Inserting game to: {self.supabase_url}/games")
        spider.logger.debug(f"🔍 Game data: {game_data}")
        
        response = requests.post(
            f"{self.supabase_url}/games",
            headers=self.headers,
            json=game_data
        )
        
        if response.status_code in [200, 201]:
            self.stats['games_inserted'] += 1
            self.processed_games.add(game_id)
            spider.logger.info(f"✅ Game inserted: {game_id}")
        elif response.status_code == 409:
            # Conflict - game already exists (expected with unique constraint)
            self.processed_games.add(game_id)
            spider.logger.debug(f"📝 Game already exists: {game_id}")
        elif 'duplicate key value violates unique constraint' in response.text.lower():
            # PostgreSQL unique constraint violation 
            self.processed_games.add(game_id)
            spider.logger.debug(f"📝 Game already exists (unique constraint): {game_id}")
        else:
            self.stats['errors'] += 1
            spider.logger.error(f"❌ Failed to insert game {game_id}: {response.status_code} - {response.text}")
    
    def process_odds_item(self, adapter, spider):
        """Process and insert odds items"""
        self.stats['odds_processed'] += 1
        
        # Prepare odds data
        odds_data = {
            'game_id': adapter['game_id'],
            'sportsbook': adapter['sportsbook'],
            'home_odds': adapter.get('home_odds'),
            'away_odds': adapter.get('away_odds'),
            'draw_odds': adapter.get('draw_odds'),
            'created_at': adapter['created_at'],
            'timestamp': adapter.get('timestamp', adapter['created_at']),
            'scraping_source': adapter.get('scraping_source', 'scrapy_monitor'),
            'scraping_method': adapter.get('scraping_method', 'api_scraping')
        }
        
        # Insert into Supabase
        spider.logger.info(f"🔍 Posting odds to: {self.supabase_url}/odds")
        spider.logger.info(f"🔍 Odds data: {odds_data}")
        response = requests.post(
            f"{self.supabase_url}/odds",
            headers=self.headers,
            json=odds_data
        )
        
        if response.status_code in [200, 201]:
            self.stats['odds_inserted'] += 1
            spider.logger.info(f"✅ Odds inserted: {adapter['sportsbook']} for {adapter['game_id']}")
        else:
            self.stats['errors'] += 1
            spider.logger.error(f"❌ Failed to insert odds: {response.status_code} - {response.text}")
    
    def close_spider(self, spider):
        """Print stats when spider closes"""
        spider.logger.info("="*60)
        spider.logger.info("SCRAPY SCRAPER STATISTICS")
        spider.logger.info("="*60)
        spider.logger.info(f"Games processed: {self.stats['games_processed']}")
        spider.logger.info(f"Games inserted: {self.stats['games_inserted']}")
        spider.logger.info(f"Odds processed: {self.stats['odds_processed']}")
        spider.logger.info(f"Odds inserted: {self.stats['odds_inserted']}")
        spider.logger.info(f"Errors: {self.stats['errors']}")
        spider.logger.info("="*60)

class ValidationPipeline:
    """Pipeline to validate item data before processing"""
    
    def process_item(self, item, spider):
        adapter = ItemAdapter(item)
        
        if isinstance(item, GameItem):
            # Validate required game fields
            required_fields = ['game_id', 'sport', 'league', 'home_team', 'away_team']
            for field in required_fields:
                if not adapter.get(field):
                    raise ValueError(f"Missing required field: {field}")
                    
        elif isinstance(item, OddsItem):
            # Validate required odds fields  
            required_fields = ['game_id', 'sportsbook']
            for field in required_fields:
                if not adapter.get(field):
                    raise ValueError(f"Missing required field: {field}")
                    
            # At least one odds value should be present
            if not any([adapter.get('home_odds'), adapter.get('away_odds'), adapter.get('draw_odds')]):
                raise ValueError("At least one odds value required")
        
        return item
