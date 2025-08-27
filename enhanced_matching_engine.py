#!/usr/bin/env python3
"""
Enhanced Matching Engine
Purpose: 
1. Match events with Omenizer calendar
2. Create new events in Omenizer when all nomenclature matches
3. Flag events that need integration review
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from nomenclature_translator import NomenclatureTranslator
import psycopg2
import requests
import json
from datetime import datetime, timedelta
import time
from typing import Dict, List, Optional, Tuple

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

API_URL = "https://arb-general-api-1.onrender.com/raw-bets/upsert"
CALENDAR_API_URL = "https://arb-general-api-1.onrender.com/calendar/events/"
API_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"
SOURCE_ID = "17a7de9a-c23b-49eb-9816-93ebc3bba1c5"

class EnhancedMatchingEngine:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        self.translator = NomenclatureTranslator()
        self.headers = {'Authorization': f'Bearer {API_TOKEN}', 'Content-Type': 'application/json'}
        self._setup_flagging_tables()
    
    def _setup_flagging_tables(self):
        """Create tables for flagging unmatched events"""
        cur = self.conn.cursor()
        try:
            # Table for events that need integration review
            cur.execute("""
                CREATE TABLE IF NOT EXISTS flagged_events (
                    id SERIAL PRIMARY KEY,
                    oddsjam_game_id VARCHAR(100) NOT NULL,
                    home_team VARCHAR(255) NOT NULL,
                    away_team VARCHAR(255) NOT NULL,
                    sport VARCHAR(100) NOT NULL,
                    league VARCHAR(200),
                    event_datetime TIMESTAMP,
                    flag_reason VARCHAR(500) NOT NULL,
                    resolution_status VARCHAR(50) DEFAULT 'pending',
                    translated_sport VARCHAR(100),
                    translated_league VARCHAR(200),
                    translated_home_team VARCHAR(255),
                    translated_away_team VARCHAR(255),
                    missing_elements TEXT[], -- What's missing for complete translation
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(oddsjam_game_id)
                )
            """)
            
            # Table for successfully created events
            cur.execute("""
                CREATE TABLE IF NOT EXISTS created_events (
                    id SERIAL PRIMARY KEY,
                    oddsjam_game_id VARCHAR(100) NOT NULL,
                    omenizer_event_id UUID NOT NULL,
                    created_via_api BOOLEAN DEFAULT TRUE,
                    creation_details JSONB,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(oddsjam_game_id)
                )
            """)
            
            self.conn.commit()
            print("✅ Flagging tables ready")
            
        except Exception as e:
            print(f"❌ Error setting up flagging tables: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def check_complete_translation(self, game_data: dict) -> Tuple[bool, List[str], Dict]:
        """Check if we can completely translate game to Omenizer nomenclature"""
        missing_elements = []
        translations = {}
        
        # Check sport translation
        sport_translation = self.translator.translate_sport(game_data.get('sport', ''))
        if sport_translation:
            translations['sport'] = sport_translation
        else:
            missing_elements.append(f"sport:{game_data.get('sport', '')}")
        
        # Check league translation
        league_translation = self.translator.translate_league(
            game_data.get('league', ''), 
            game_data.get('sport', '')
        )
        if league_translation:
            translations['league'] = league_translation[0]  # Get league name
            translations['sport_from_league'] = league_translation[1]  # Get sport from league
        else:
            missing_elements.append(f"league:{game_data.get('league', '')}|{game_data.get('sport', '')}")
        
        # Check team translations
        home_translation = self.translator.translate_team(
            game_data.get('home_team', ''),
            league=game_data.get('league', ''),
            sport=game_data.get('sport', '')
        )
        if home_translation:
            translations['home_team'] = home_translation
        else:
            missing_elements.append(f"home_team:{game_data.get('home_team', '')}")
        
        away_translation = self.translator.translate_team(
            game_data.get('away_team', ''),
            league=game_data.get('league', ''),
            sport=game_data.get('sport', '')
        )
        if away_translation:
            translations['away_team'] = away_translation
        else:
            missing_elements.append(f"away_team:{game_data.get('away_team', '')}")
        
        # We can create an event if we have all core elements translated
        can_create = (
            'sport' in translations and 
            'league' in translations and
            'home_team' in translations and
            'away_team' in translations
        )
        
        return can_create, missing_elements, translations
    
    def find_or_create_event(self, game_data: dict) -> Optional[str]:
        """Find existing event or create new one if possible"""
        
        # First try to find existing match
        event_id = self.translator.find_matching_event(
            game_data.get('home_team', ''),
            game_data.get('away_team', ''),
            game_data.get('sport', ''),
            game_data.get('start_time_parsed') or datetime.now()
        )
        
        if event_id:
            print(f"🎯 Found existing event: {event_id}")
            return event_id
        
        # Check if we can create a new event
        can_create, missing_elements, translations = self.check_complete_translation(game_data)
        
        if can_create:
            print("🚀 All elements translated - attempting to create new event")
            created_event_id = self._create_new_event(game_data, translations)
            if created_event_id:
                return created_event_id
        else:
            print(f"⚠️ Cannot create event - missing: {missing_elements}")
            self._flag_event_for_integration(game_data, missing_elements, translations)
        
        return None
    
    def _create_new_event(self, game_data: dict, translations: dict) -> Optional[str]:
        """Create new event in Omenizer via API"""
        try:
            # NOTE: This would require knowing the sport_id, league_id, season_id, team_ids
            # Since we only have names, not IDs, we need to look these up first
            # For now, let's simulate the creation and log what would be needed
            
            print("🔧 Event creation requires ID lookups (not implemented yet)")
            print(f"   Would create: {translations['home_team']} vs {translations['away_team']}")
            print(f"   Sport: {translations['sport']}, League: {translations['league']}")
            
            # TODO: Implement actual API calls to:
            # 1. GET /sports/ to find sport_id by name
            # 2. GET /leagues/ to find league_id by name  
            # 3. GET /seasons/ to find current season_id
            # 4. GET /teams/ to find team IDs by name
            # 5. POST /calendar/events/ to create event
            
            # For now, flag as "ready for creation"
            cur = self.conn.cursor()
            cur.execute("""
                INSERT INTO flagged_events (
                    oddsjam_game_id, home_team, away_team, sport, league, 
                    event_datetime, flag_reason, resolution_status,
                    translated_sport, translated_league, translated_home_team, translated_away_team
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_game_id) DO UPDATE SET
                resolution_status = 'ready_for_creation',
                translated_sport = %s, translated_league = %s,
                translated_home_team = %s, translated_away_team = %s,
                updated_at = NOW()
            """, (
                game_data.get('game_id', ''), game_data.get('home_team', ''), 
                game_data.get('away_team', ''), game_data.get('sport', ''),
                game_data.get('league', ''), game_data.get('start_time_parsed'),
                'ready_for_api_creation', 'ready_for_creation',
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team'),
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team')
            ))
            self.conn.commit()
            cur.close()
            
            return None  # Would return actual event_id when implemented
            
        except Exception as e:
            print(f"❌ Error creating event: {e}")
            return None
    
    def _flag_event_for_integration(self, game_data: dict, missing_elements: List[str], translations: dict):
        """Flag event that needs integration work"""
        cur = self.conn.cursor()
        try:
            cur.execute("""
                INSERT INTO flagged_events (
                    oddsjam_game_id, home_team, away_team, sport, league,
                    event_datetime, flag_reason, missing_elements,
                    translated_sport, translated_league, translated_home_team, translated_away_team
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_game_id) DO UPDATE SET
                flag_reason = %s, missing_elements = %s,
                translated_sport = %s, translated_league = %s,
                translated_home_team = %s, translated_away_team = %s,
                updated_at = NOW()
            """, (
                game_data.get('game_id', ''), game_data.get('home_team', ''),
                game_data.get('away_team', ''), game_data.get('sport', ''),
                game_data.get('league', ''), game_data.get('start_time_parsed'),
                f"Missing translations: {', '.join(missing_elements)}", missing_elements,
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team'),
                f"Missing translations: {', '.join(missing_elements)}", missing_elements,
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team')
            ))
            self.conn.commit()
            print(f"🚩 Flagged event for integration: {game_data.get('home_team')} vs {game_data.get('away_team')}")
            
        except Exception as e:
            print(f"❌ Error flagging event: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def process_game_with_enhanced_matching(self, game_data: dict) -> dict:
        """Process game with enhanced matching logic"""
        print(f"\n🔍 Enhanced processing: {game_data['home_team']} vs {game_data['away_team']}")
        
        # Try to find or create event
        event_id = self.find_or_create_event(game_data)
        
        # Transform game data using existing translation
        # Build basic API payload (simplified since we're focusing on flagging)
        api_payload = {
            'source_id': SOURCE_ID,
            'event_source': SOURCE_ID,
            'name': f"{game_data.get('home_team', '')} vs {game_data.get('away_team', '')}",
            'home_team': game_data.get('home_team', ''),
            'away_team': game_data.get('away_team', ''),
            'sport': game_data.get('sport', ''),
            'league': game_data.get('league', ''),
            'event_datetime': game_data.get('start_time_parsed', datetime.now()).isoformat() if game_data.get('start_time_parsed') else datetime.now().isoformat(),
            'status': game_data.get('game_status', 'scheduled'),
            'markets': None
        }
        
        # Add event_id if found/created
        if event_id:
            api_payload['event_id'] = event_id
            print(f"✅ Event ID added: {event_id}")
        
        return api_payload
    
    def send_to_api(self, record):
        """Send record to API"""
        response = requests.post(API_URL, json=record, headers=self.headers)
        
        if response.status_code in [200, 201]:
            return True, response.json()
        else:
            return False, f"Error {response.status_code}: {response.text}"
    
    def get_flagged_events_summary(self) -> dict:
        """Get summary of flagged events"""
        cur = self.conn.cursor()
        
        try:
            # Count by flag reason
            cur.execute("""
                SELECT flag_reason, resolution_status, COUNT(*) 
                FROM flagged_events 
                GROUP BY flag_reason, resolution_status
                ORDER BY COUNT(*) DESC
            """)
            reasons = cur.fetchall()
            
            # Count by missing elements
            cur.execute("""
                SELECT unnest(missing_elements) as element, COUNT(*) 
                FROM flagged_events 
                WHERE missing_elements IS NOT NULL
                GROUP BY element 
                ORDER BY COUNT(*) DESC
            """)
            missing = cur.fetchall()
            
            # Recent flags
            cur.execute("""
                SELECT oddsjam_game_id, home_team, away_team, sport, flag_reason, created_at
                FROM flagged_events 
                ORDER BY created_at DESC 
                LIMIT 10
            """)
            recent = cur.fetchall()
            
            return {
                'flag_reasons': reasons,
                'missing_elements': missing,
                'recent_flags': recent
            }
            
        except Exception as e:
            print(f"❌ Error getting flagged events: {e}")
            return {}
        finally:
            cur.close()
    
    def close(self):
        """Clean up connections"""
        self.translator.close()
        self.conn.close()

def fetch_games_with_odds_direct(limit=3):
    """Fetch games with odds directly from database"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        
        cur = conn.cursor()
        
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
            
            cur.execute("""
                SELECT sportsbook, home_odds, away_odds, draw_odds, timestamp
                FROM odds WHERE game_id = %s LIMIT 10
            """, (game_id_str,))
            
            odds_data = cur.fetchall()
            
            game = {
                'id': game_id, 'game_id': game_id_str,
                'home_team': home_team, 'away_team': away_team,
                'sport': sport, 'league': league,
                'start_time_parsed': start_time_parsed, 'start_time': start_time,
                'game_status': game_status, 'bet_type': bet_type,
                'odds': []
            }
            
            for odds_row in odds_data:
                sportsbook, home_odds, away_odds, draw_odds, timestamp = odds_row
                game['odds'].append({
                    'sportsbook': sportsbook, 'home_odds': home_odds,
                    'away_odds': away_odds, 'draw_odds': draw_odds,
                    'timestamp': timestamp
                })
            
            games_with_odds.append(game)
        
        cur.close()
        conn.close()
        return games_with_odds
        
    except Exception as e:
        print(f"❌ Error fetching games: {e}")
        return []

def main():
    """Main function with enhanced matching"""
    print("🚀 Enhanced Matching Engine with Event Creation & Flagging")
    
    # Initialize enhanced engine
    engine = EnhancedMatchingEngine()
    
    try:
        # Fetch test games
        games = fetch_games_with_odds_direct(5)
        
        if not games:
            print("ℹ️ No games found")
            return
        
        print(f"📊 Processing {len(games)} games with enhanced matching...")
        
        successful = 0
        failed = 0
        
        for i, game in enumerate(games, 1):
            print(f"\n📤 Game {i}/{len(games)}: {game['home_team']} vs {game['away_team']}")
            
            # Process with enhanced matching
            record = engine.process_game_with_enhanced_matching(game)
            
            # Send to API
            success, result = engine.send_to_api(record)
            
            if success:
                successful += 1
                print(f"✅ Sent successfully")
                if record.get('event_id'):
                    print(f"🎯 With event_id: {record['event_id']}")
            else:
                failed += 1
                print(f"❌ Failed: {result}")
        
        print(f"\n✅ Processing complete: {successful} successful, {failed} failed")
        
        # Show flagging summary
        print("\n📊 FLAGGING SUMMARY:")
        print("="*50)
        summary = engine.get_flagged_events_summary()
        
        if summary.get('flag_reasons'):
            print("Flag reasons:")
            for reason, status, count in summary['flag_reasons']:
                print(f"  • {reason} ({status}): {count}")
        
        if summary.get('missing_elements'):
            print("\nMost common missing elements:")
            for element, count in summary['missing_elements'][:10]:
                print(f"  • {element}: {count}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.close()

if __name__ == "__main__":
    main()