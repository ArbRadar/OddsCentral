#!/usr/bin/env python3
"""
Send odds data from local Supabase to external API using Supabase client
"""
from supabase import create_client, Client
import requests
import json
from datetime import datetime
import time
import sys

# Configuration
SUPABASE_URL = "http://localhost:54320"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
API_URL = "https://arb-general-api-1.onrender.com/raw-bets/upsert"
API_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"
SOURCE_ID = "17a7de9a-c23b-49eb-9816-93ebc3bba1c5"

# Bookmaker UUID mapping (simplified)
BOOKMAKER_UUIDS = {
    'draftkings': 'fe6bc0f8-e8a9-4083-9401-766d30817009',
    'fanduel': 'd0f4c753-b2a3-4f02-ace3-f23d6987184a',
    'betmgm': 'a4fb81f8-ba8c-4012-bd74-10f78846d6ea',
    'bet365': 'ce996a90-c4bf-40b3-803f-daffe6c19b4f',
    'pinnacle': '41a3c468-e086-4dd5-883a-d740d802c629',
}

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_games_with_odds(limit=10):
    """Fetch games with odds from local Supabase"""
    print(f"📊 Fetching games from Supabase (limit: {limit})...")
    
    try:
        # First get games
        games_response = supabase.table('games').select('*').limit(limit).execute()
        games = games_response.data
        print(f"📊 Found {len(games)} total games")
        
        if not games:
            print("⚠️ No games found in database")
            return []
        
        # Get odds for each game (manually join due to ID type mismatch)
        games_with_odds = []
        for game in games[:limit]:
            game_id_str = str(game['id'])
            
            try:
                odds_response = supabase.table('odds').select('*').eq('game_id', game_id_str).limit(10).execute()
                odds = odds_response.data
                
                if odds:
                    game['odds'] = odds
                    games_with_odds.append(game)
                    print(f"✅ Game {game_id_str}: {len(odds)} odds records")
                    if len(games_with_odds) >= 3:  # Limit for testing
                        break
                        
            except Exception as odds_error:
                print(f"⚠️ Error fetching odds for game {game_id_str}: {odds_error}")
                continue
        
        print(f"✅ Found {len(games_with_odds)} games with odds")
        return games_with_odds
        
    except Exception as e:
        print(f"❌ Error fetching games: {e}")
        raise

def get_bookmaker_uuid(bookmaker_name):
    """Get bookmaker UUID from name"""
    if not bookmaker_name:
        return SOURCE_ID
    
    normalized = bookmaker_name.lower().strip()
    
    if normalized in BOOKMAKER_UUIDS:
        return BOOKMAKER_UUIDS[normalized]
    
    for key, uuid in BOOKMAKER_UUIDS.items():
        if key in normalized or normalized in key:
            return uuid
    
    return SOURCE_ID

def american_to_decimal(american_odds):
    """Convert American odds to decimal format"""
    if not american_odds or american_odds == 0:
        return None
    
    odds = int(american_odds)
    if odds > 0:
        return (odds / 100) + 1
    else:
        return (100 / abs(odds)) + 1

def transform_to_api_format(game):
    """Transform game data to API format"""
    markets = []
    
    first_bookmaker = game['odds'][0].get('sportsbook') if game['odds'] else None
    event_source = get_bookmaker_uuid(first_bookmaker)
    
    bookmaker_odds = {}
    for odds in game['odds']:
        bookmaker = odds.get('sportsbook', 'Unknown')
        if bookmaker not in bookmaker_odds:
            bookmaker_odds[bookmaker] = []
        bookmaker_odds[bookmaker].append(odds)
    
    for bookmaker, odds_list in bookmaker_odds.items():
        market_odds = []
        odds = odds_list[0]
        
        if odds.get('home_odds'):
            market_odds.append({
                'outcome': 'Home',
                'outcome_team': game['home_team'],
                'american_price': odds['home_odds'],
                'price': american_to_decimal(odds['home_odds']),
                'format': 'decimal',
                'bookmaker': bookmaker
            })
        
        if odds.get('away_odds'):
            market_odds.append({
                'outcome': 'Away',
                'outcome_team': game['away_team'],
                'american_price': odds['away_odds'],
                'price': american_to_decimal(odds['away_odds']),
                'format': 'decimal',
                'bookmaker': bookmaker
            })
        
        if odds.get('draw_odds'):
            market_odds.append({
                'outcome': 'Draw',
                'outcome_team': 'Draw',
                'american_price': odds['draw_odds'],
                'price': american_to_decimal(odds['draw_odds']),
                'format': 'decimal',
                'bookmaker': bookmaker
            })
        
        if market_odds:
            markets.append({
                'bookmaker': bookmaker,
                'market_type': game.get('bet_type', 'Moneyline'),
                'is_live': game.get('game_status') == 'live',
                'last_updated': odds.get('timestamp', datetime.utcnow().isoformat()),
                'odds': market_odds
            })
    
    return {
        'source_id': SOURCE_ID,
        'event_source': event_source,
        'name': f"{game['home_team']} vs {game['away_team']}",
        'home_team': game['home_team'],
        'away_team': game['away_team'],
        'event_datetime': game.get('start_time_parsed') or game.get('start_time') or datetime.utcnow().isoformat(),
        'league': game.get('league', 'Unknown League'),
        'sport': game.get('sport', 'Unknown Sport'),
        'status': game.get('game_status', 'scheduled'),
        'markets': {
            'markets': markets,
            'bookmakers': list(bookmaker_odds.keys()),
            'market_types': [game.get('bet_type', 'Moneyline')],
            'total_markets': len(markets),
            'bookmaker_count': len(bookmaker_odds)
        } if markets else None
    }

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

def test_connection():
    """Test API connection"""
    print("🧪 Testing API connection...")
    
    test_record = {
        'source_id': SOURCE_ID,
        'event_source': SOURCE_ID,
        'name': 'Supabase Python Test vs Test Opponent',
        'home_team': 'Supabase Test Home',
        'away_team': 'Supabase Test Away',
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

def main(limit=10, test_only=False):
    """Main function"""
    if test_only:
        test_connection()
        return
    
    print("🚀 Starting odds data sync...")
    
    try:
        games = fetch_games_with_odds(limit)
        
        if not games:
            print("ℹ️ No games with odds found")
            return
        
        successful = 0
        failed = 0
        
        for i, game in enumerate(games, 1):
            print(f"\n📤 Sending game {i}/{len(games)}: {game['home_team']} vs {game['away_team']}")
            
            record = transform_to_api_format(game)
            success, result = send_to_api(record)
            
            if success:
                successful += 1
                print(f"✅ Sent successfully (ID: {result.get('data', {}).get('id', 'unknown')})")
            else:
                failed += 1
                print(f"❌ Failed: {result}")
            
            if i < len(games):
                time.sleep(0.5)
        
        print(f"\n✅ Sync complete: {successful} successful, {failed} failed")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "test":
            main(test_only=True)
        else:
            try:
                limit = int(sys.argv[1])
                main(limit=limit)
            except ValueError:
                print("Usage: python send_odds_supabase.py [limit|test]")
                print("  limit: Number of games to process (default: 10)")
                print("  test: Test API connection only")
    else:
        main()