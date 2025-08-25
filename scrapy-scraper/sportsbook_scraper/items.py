# Define here the models for your scraped items
import scrapy
from datetime import datetime

class GameItem(scrapy.Item):
    """Item for game data"""
    game_id = scrapy.Field()
    sport = scrapy.Field()  
    league = scrapy.Field()
    home_team = scrapy.Field()
    away_team = scrapy.Field()
    start_time = scrapy.Field()
    start_time_parsed = scrapy.Field()
    created_at = scrapy.Field()
    
class OddsItem(scrapy.Item):
    """Item for odds data"""
    game_id = scrapy.Field()
    sportsbook = scrapy.Field()
    home_odds = scrapy.Field()
    away_odds = scrapy.Field() 
    draw_odds = scrapy.Field()
    odds_format = scrapy.Field()  # 'decimal', 'american', 'percentage'
    created_at = scrapy.Field()
    timestamp = scrapy.Field()
    scraping_source = scrapy.Field()  # 'scrapy_monitor', 'manual_run', etc.
    scraping_method = scrapy.Field()  # 'api_scraping', 'html_parsing', etc.

class APIEndpointItem(scrapy.Item):
    """Item for discovered API endpoints"""
    domain = scrapy.Field()
    path = scrapy.Field()
    method = scrapy.Field()
    response_sample = scrapy.Field()
    odds_count = scrapy.Field()
    discovered_at = scrapy.Field()
