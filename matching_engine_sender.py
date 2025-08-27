#!/usr/bin/env python3
"""
Matching Engine Odds Sender
Purpose: Send odds data to Omenizer API using nomenclature matching and event matching
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from nomenclature_translator import NomenclatureTranslator
import psycopg2
import requests
import json
from datetime import datetime
import time

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

API_URL = "https://arb-general-api-1.onrender.com/raw-bets/upsert"
API_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"
SOURCE_ID = "17a7de9a-c23b-49eb-9816-93ebc3bba1c5"

def test_db_connection():
    """Test direct database connection"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM games")
        games_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM odds")
        odds_count = cur.fetchone()[0]
        
        print(f"✅ Database connection successful!")
        print(f"📊 Games: {games_count}, Odds: {odds_count}")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        return False

def fetch_games_with_odds_direct(limit=3):
    """Fetch games with odds directly from database"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        
        cur = conn.cursor()
        
        # Get games with odds using the correct game_id field
        query = """
        SELECT DISTINCT 
            g.id, g.game_id, g.home_team, g.away_team, g.sport, g.league, 
            g.start_time_parsed, g.start_time, g.game_status, g.bet_type
        FROM games g 
        INNER JOIN odds o ON g.game_id = o.game_id 
        LIMIT %s
        """
        
        cur.execute(query, (limit,))
        games_data = cur.fetchall()
        
        games_with_odds = []
        
        for game_row in games_data:
            game_id, game_id_str, home_team, away_team, sport, league, start_time_parsed, start_time, game_status, bet_type = game_row
            
            # Get odds for this game
            cur.execute("""
                SELECT sportsbook, home_odds, away_odds, draw_odds, timestamp
                FROM odds 
                WHERE game_id = %s 
                LIMIT 10
            """, (game_id_str,))
            
            odds_data = cur.fetchall()
            
            game = {
                'id': game_id,
                'game_id': game_id_str,
                'home_team': home_team,
                'away_team': away_team,
                'sport': sport,
                'league': league,
                'start_time_parsed': start_time_parsed,
                'start_time': start_time,
                'game_status': game_status,
                'bet_type': bet_type,
                'odds': []
            }
            
            for odds_row in odds_data:
                sportsbook, home_odds, away_odds, draw_odds, timestamp = odds_row
                game['odds'].append({
                    'sportsbook': sportsbook,
                    'home_odds': home_odds,
                    'away_odds': away_odds,
                    'draw_odds': draw_odds,
                    'timestamp': timestamp
                })
            
            games_with_odds.append(game)
            print(f"✅ Game {game_id}: {home_team} vs {away_team} - {len(game['odds'])} odds")
        
        cur.close()
        conn.close()
        
        print(f"📊 Found {len(games_with_odds)} games with odds")
        return games_with_odds
        
    except Exception as e:
        print(f"❌ Error fetching games: {e}")
        raise

def american_to_decimal(american_odds):
    """Convert American odds to decimal format"""
    if not american_odds or american_odds == 0:
        return None
    
    try:
        odds = int(american_odds)
        if odds > 0:
            return (odds / 100) + 1
        else:
            return (100 / abs(odds)) + 1
    except:
        return None

def transform_to_api_format_with_matching(game, translator):
    """Transform game data to API format using the matching engine"""
    print(f"\n🔄 Transforming game: {game['home_team']} vs {game['away_team']} ({game['sport']})")
    
    # Use the translator to convert to Omenizer format
    translated_game = translator.translate_game_to_omenizer_format(game)
    
    print(f"🔄 Translated sport: {game['sport']} → {translated_game['sport']}")
    print(f"🔄 Translated home team: {game['home_team']} → {translated_game['home_team']}")
    print(f"🔄 Translated away team: {game['away_team']} → {translated_game['away_team']}")
    print(f"🔄 Translated league: {game.get('league', '')} → {translated_game['league']}")
    
    if translated_game.get('event_id'):
        print(f"🎯 Found matching event_id: {translated_game['event_id']}")
    else:
        print("⚠️ No matching event_id found")
    
    # Build markets data
    markets = []
    bookmaker_odds = {}
    for odds in game['odds']:
        bookmaker = odds.get('sportsbook', 'Unknown')
        if bookmaker not in bookmaker_odds:
            bookmaker_odds[bookmaker] = []
        bookmaker_odds[bookmaker].append(odds)
    
    # Create market for each bookmaker
    for bookmaker, odds_list in bookmaker_odds.items():
        # Translate bookmaker name
        bookmaker_result = translator.translate_bookmaker(bookmaker)
        if bookmaker_result:
            translated_bookmaker = bookmaker_result[0]
            print(f"🔄 Translated bookmaker: {bookmaker} → {translated_bookmaker}")
        else:
            translated_bookmaker = bookmaker
            print(f"⚠️ Bookmaker not translated: {bookmaker}")
        
        market_odds = []
        odds = odds_list[0]  # Use first odds entry for this bookmaker
        
        if odds.get('home_odds'):
            market_odds.append({
                'outcome': 'Home',
                'outcome_team': translated_game['home_team'],
                'american_price': odds['home_odds'],
                'price': american_to_decimal(odds['home_odds']),
                'format': 'decimal',
                'bookmaker': translated_bookmaker
            })
        
        if odds.get('away_odds'):
            market_odds.append({
                'outcome': 'Away',
                'outcome_team': translated_game['away_team'],
                'american_price': odds['away_odds'],
                'price': american_to_decimal(odds['away_odds']),
                'format': 'decimal',
                'bookmaker': translated_bookmaker
            })
        
        if odds.get('draw_odds'):
            market_odds.append({
                'outcome': 'Draw',
                'outcome_team': 'Draw',
                'american_price': odds['draw_odds'],
                'price': american_to_decimal(odds['draw_odds']),
                'format': 'decimal',
                'bookmaker': translated_bookmaker
            })
        
        if market_odds:
            markets.append({
                'bookmaker': translated_bookmaker,
                'market_type': game.get('bet_type', 'Moneyline'),
                'is_live': game.get('game_status') == 'live',
                'last_updated': odds.get('timestamp').isoformat() if odds.get('timestamp') else datetime.utcnow().isoformat(),
                'odds': market_odds
            })
    
    # Build final API payload
    api_payload = {
        'source_id': SOURCE_ID,
        'event_source': translated_game.get('event_source', SOURCE_ID),
        'name': translated_game['name'],
        'home_team': translated_game['home_team'],
        'away_team': translated_game['away_team'],
        'event_datetime': translated_game['event_datetime'],
        'league': translated_game['league'],
        'sport': translated_game['sport'],
        'status': translated_game['status'],
        'markets': {
            'markets': markets,
            'bookmakers': list(bookmaker_odds.keys()),
            'market_types': [game.get('bet_type', 'Moneyline')],
            'total_markets': len(markets),
            'bookmaker_count': len(bookmaker_odds)
        } if markets else None
    }
    
    # Add event_id if found
    if translated_game.get('event_id'):
        api_payload['event_id'] = translated_game['event_id']
    
    return api_payload

def send_to_api(record):
    """Send single record to API"""
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {API_TOKEN}'
    }
    
    response = requests.post(API_URL, json=record, headers=headers)
    
    if response.status_code in [200, 201]:
        return True, response.json()
    else:
        return False, f"Error {response.status_code}: {response.text}"

def test_api_connection():
    """Test API connection"""
    print("🧪 Testing API connection...")
    
    test_record = {
        'source_id': SOURCE_ID,
        'event_source': SOURCE_ID,
        'name': 'Matching Engine Test vs Test Opponent',
        'home_team': 'Matching Engine Home',
        'away_team': 'Matching Engine Away',
        'event_datetime': datetime.utcnow().isoformat(),
        'league': 'Test League',
        'sport': 'Test Sport',
        'status': 'test',
        'markets': None
    }
    
    success, result = send_to_api(test_record)
    
    if success:
        print("✅ API connection test successful!")
        print(f"Response: {json.dumps(result, indent=2)}")
    else:
        print(f"❌ API connection test failed: {result}")
    
    return success

def main():
    """Main function with matching engine"""
    print("🚀 Matching Engine Odds Sender")
    
    # Test database connection
    if not test_db_connection():
        return
    
    # Test API connection  
    if not test_api_connection():
        return
    
    # Initialize translator
    print("\n🔧 Initializing nomenclature translator...")
    translator = NomenclatureTranslator()
    
    try:
        # Fetch games with odds
        games = fetch_games_with_odds_direct(3)
        
        if not games:
            print("ℹ️ No games with odds found")
            return
        
        successful = 0
        failed = 0
        
        for i, game in enumerate(games, 1):
            print(f"\n📤 Processing game {i}/{len(games)}: {game['home_team']} vs {game['away_team']}")
            
            # Transform using matching engine
            record = transform_to_api_format_with_matching(game, translator)
            
            # Send to API
            success, result = send_to_api(record)
            
            if success:
                successful += 1
                event_id = result.get('data', {}).get('id', 'unknown')
                print(f"✅ Sent successfully (ID: {event_id})")
                if record.get('event_id'):
                    print(f"🎯 Matched to existing event: {record['event_id']}")
            else:
                failed += 1
                print(f"❌ Failed: {result}")
            
            if i < len(games):
                time.sleep(0.5)
        
        print(f"\n✅ Sync complete: {successful} successful, {failed} failed")
        
        # Print translation statistics
        print("\n📊 Translation Summary:")
        print("Run `SELECT * FROM unmatched_items;` to see items that couldn't be matched")
        print("Run `SELECT * FROM translation_log;` to see translation attempts")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        translator.close()

if __name__ == "__main__":
    main()