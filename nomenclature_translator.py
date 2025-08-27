#!/usr/bin/env python3
"""
Nomenclature Translation Engine
Purpose: Translate between OddsJam and Omenizer naming conventions
"""
import psycopg2
import requests
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import difflib
from fuzzywuzzy import fuzz, process

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

class NomenclatureTranslator:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        self._load_mappings()
    
    def _load_mappings(self):
        """Load all mappings from database into memory for fast access"""
        cur = self.conn.cursor()
        
        # Load sports mappings
        cur.execute("SELECT oddsjam_sport, omenizer_sport, confidence_score FROM sports_mapping")
        self.sports_map = {row[0]: row[1] for row in cur.fetchall()}
        
        # Load leagues mappings
        cur.execute("SELECT oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport FROM leagues_mapping")
        self.leagues_map = {(row[0], row[1]): (row[2], row[3]) for row in cur.fetchall()}
        
        # Load teams mappings
        cur.execute("SELECT oddsjam_team, omenizer_team, league, sport FROM teams_mapping")
        self.teams_map = {row[0]: row[1] for row in cur.fetchall()}
        
        # Load bookmakers mappings
        cur.execute("SELECT oddsjam_bookmaker, omenizer_bookmaker, bookmaker_uuid FROM bookmakers_mapping")
        self.bookmakers_map = {row[0]: (row[1], row[2]) for row in cur.fetchall()}
        
        cur.close()
        print(f"📚 Loaded mappings: {len(self.sports_map)} sports, {len(self.leagues_map)} leagues, {len(self.teams_map)} teams, {len(self.bookmakers_map)} bookmakers")
    
    def translate_sport(self, oddsjam_sport: str) -> Optional[str]:
        """Translate OddsJam sport to Omenizer format"""
        if not oddsjam_sport:
            return None
            
        # Direct mapping
        if oddsjam_sport in self.sports_map:
            return self.sports_map[oddsjam_sport]
        
        # Try fuzzy matching with existing Omenizer sports
        cur = self.conn.cursor()
        cur.execute("SELECT DISTINCT omenizer_sport FROM sports_mapping")
        omenizer_sports = [row[0] for row in cur.fetchall()]
        cur.close()
        
        if omenizer_sports:
            match, score = process.extractOne(oddsjam_sport, omenizer_sports)
            if score > 80:  # High confidence threshold
                self._add_mapping('sport', oddsjam_sport, match, score/100)
                self.sports_map[oddsjam_sport] = match
                return match
        
        # Log unmatched item
        self._log_unmatched('oddsjam', 'sport', oddsjam_sport)
        return None
    
    def translate_league(self, oddsjam_league: str, oddsjam_sport: str) -> Optional[Tuple[str, str]]:
        """Translate OddsJam league+sport to Omenizer format"""
        if not oddsjam_league or not oddsjam_sport:
            return None
            
        key = (oddsjam_league, oddsjam_sport)
        if key in self.leagues_map:
            return self.leagues_map[key]
        
        # Try fuzzy matching
        cur = self.conn.cursor()
        cur.execute("SELECT omenizer_league, omenizer_sport FROM leagues_mapping")
        omenizer_leagues = [(row[0], row[1]) for row in cur.fetchall()]
        cur.close()
        
        if omenizer_leagues:
            league_strings = [f"{league} ({sport})" for league, sport in omenizer_leagues]
            search_string = f"{oddsjam_league} ({oddsjam_sport})"
            
            match, score = process.extractOne(search_string, league_strings)
            if score > 70:
                # Extract league and sport from match
                idx = league_strings.index(match)
                omenizer_league, omenizer_sport = omenizer_leagues[idx]
                
                self._add_league_mapping(oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, score/100)
                self.leagues_map[key] = (omenizer_league, omenizer_sport)
                return (omenizer_league, omenizer_sport)
        
        self._log_unmatched('oddsjam', 'league', f"{oddsjam_league}|{oddsjam_sport}")
        return None
    
    def translate_team(self, oddsjam_team: str, league: str = "", sport: str = "") -> Optional[str]:
        """Translate team name with context"""
        if not oddsjam_team:
            return None
            
        # Direct mapping
        if oddsjam_team in self.teams_map:
            return self.teams_map[oddsjam_team]
        
        # Fuzzy matching with context
        cur = self.conn.cursor()
        
        # If we have league/sport context, prefer matches in same context
        if league and sport:
            cur.execute("""
                SELECT omenizer_team FROM teams_mapping 
                WHERE league = %s AND sport = %s
            """, (league, sport))
            context_teams = [row[0] for row in cur.fetchall()]
            
            if context_teams:
                match, score = process.extractOne(oddsjam_team, context_teams)
                if score > 85:
                    self._add_team_mapping(oddsjam_team, match, league, sport, score/100)
                    self.teams_map[oddsjam_team] = match
                    cur.close()
                    return match
        
        # General fuzzy matching
        cur.execute("SELECT DISTINCT omenizer_team FROM teams_mapping")
        all_teams = [row[0] for row in cur.fetchall()]
        cur.close()
        
        if all_teams:
            match, score = process.extractOne(oddsjam_team, all_teams)
            if score > 90:  # Higher threshold for team names
                self._add_team_mapping(oddsjam_team, match, league, sport, score/100)
                self.teams_map[oddsjam_team] = match
                return match
        
        self._log_unmatched('oddsjam', 'team', f"{oddsjam_team}|{league}|{sport}")
        return None
    
    def translate_bookmaker(self, oddsjam_bookmaker: str) -> Optional[Tuple[str, str]]:
        """Translate bookmaker name, return (omenizer_name, uuid)"""
        if not oddsjam_bookmaker:
            return None
            
        if oddsjam_bookmaker in self.bookmakers_map:
            return self.bookmakers_map[oddsjam_bookmaker]
        
        # Try fuzzy matching
        cur = self.conn.cursor()
        cur.execute("SELECT omenizer_bookmaker, bookmaker_uuid FROM bookmakers_mapping")
        omenizer_bookmakers = [(row[0], row[1]) for row in cur.fetchall()]
        cur.close()
        
        if omenizer_bookmakers:
            bookmaker_names = [name for name, uuid in omenizer_bookmakers]
            match, score = process.extractOne(oddsjam_bookmaker, bookmaker_names)
            
            if score > 80:
                # Find the UUID for this match
                for name, uuid in omenizer_bookmakers:
                    if name == match:
                        self._add_bookmaker_mapping(oddsjam_bookmaker, name, uuid, score/100)
                        self.bookmakers_map[oddsjam_bookmaker] = (name, uuid)
                        return (name, uuid)
        
        self._log_unmatched('oddsjam', 'bookmaker', oddsjam_bookmaker)
        return None
    
    def translate_country(self, oddsjam_country: str) -> Optional[str]:
        """Translate country name"""
        if not oddsjam_country:
            return None
            
        cur = self.conn.cursor()
        cur.execute("SELECT omenizer_country FROM countries_mapping WHERE oddsjam_country = %s", (oddsjam_country,))
        result = cur.fetchone()
        cur.close()
        
        if result:
            return result[0]
        
        self._log_unmatched('oddsjam', 'country', oddsjam_country)
        return None
    
    def find_matching_event(self, home_team: str, away_team: str, sport: str, 
                          event_datetime: datetime, tolerance_hours: int = 8) -> Optional[str]:
        """Find matching event in Omenizer calendar"""
        # Translate team names and sport first
        omenizer_home = self.translate_team(home_team, sport=sport) or home_team
        omenizer_away = self.translate_team(away_team, sport=sport) or away_team
        omenizer_sport = self.translate_sport(sport) or sport
        
        # Calculate date range with tolerance
        start_date = (event_datetime - timedelta(hours=tolerance_hours)).date()
        end_date = (event_datetime + timedelta(hours=tolerance_hours)).date()
        
        try:
            headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
            response = requests.get(
                f"{OMENIZER_API_URL}/calendar/events/",
                params={
                    'from_date': start_date.isoformat(),
                    'to_date': end_date.isoformat(),
                    'sport': omenizer_sport
                },
                headers=headers
            )
            
            if response.status_code != 200:
                return None
            
            data = response.json()
            
            # Search through events
            for date_group in data.get('data', {}).get('items', []):
                for event in date_group.get('events', []):
                    # Check team matches (fuzzy)
                    home_match = fuzz.ratio(omenizer_home.lower(), event.get('home_team', '').lower())
                    away_match = fuzz.ratio(omenizer_away.lower(), event.get('away_team', '').lower())
                    
                    if home_match > 80 and away_match > 80:
                        # Check datetime tolerance
                        event_dt = datetime.fromisoformat(event['event_datetime'].replace('Z', '+00:00'))
                        time_diff = abs((event_datetime - event_dt).total_seconds() / 3600)
                        
                        if time_diff <= tolerance_hours:
                            # Log the match
                            self._log_event_match(
                                home_team, away_team, sport, event_datetime,
                                event['event_id'], event['home_team'], event['away_team'],
                                home_match, away_match, time_diff
                            )
                            return event['event_id']
            
        except Exception as e:
            print(f"❌ Error finding matching event: {e}")
        
        return None
    
    def translate_game_to_omenizer_format(self, game_data: dict) -> dict:
        """Translate complete game data from OddsJam to Omenizer format"""
        
        # Translate core fields
        omenizer_sport = self.translate_sport(game_data.get('sport', ''))
        omenizer_home = self.translate_team(
            game_data.get('home_team', ''), 
            league=game_data.get('league', ''),
            sport=game_data.get('sport', '')
        )
        omenizer_away = self.translate_team(
            game_data.get('away_team', ''),
            league=game_data.get('league', ''),
            sport=game_data.get('sport', '')
        )
        
        league_result = self.translate_league(
            game_data.get('league', ''),
            game_data.get('sport', '')
        )
        omenizer_league = league_result[0] if league_result else game_data.get('league', '')
        
        # Try to find matching event_id
        event_datetime = None
        if game_data.get('start_time_parsed'):
            event_datetime = game_data['start_time_parsed']
        elif game_data.get('start_time'):
            try:
                event_datetime = datetime.fromisoformat(game_data['start_time'])
            except:
                event_datetime = datetime.now()
        
        event_id = None
        if event_datetime and omenizer_home and omenizer_away and omenizer_sport:
            event_id = self.find_matching_event(
                omenizer_home, omenizer_away, omenizer_sport, event_datetime
            )
        
        # Build translated data
        translated = {
            'source_id': game_data.get('source_id', '17a7de9a-c23b-49eb-9816-93ebc3bba1c5'),
            'event_source': game_data.get('event_source', '17a7de9a-c23b-49eb-9816-93ebc3bba1c5'),
            'name': f"{omenizer_home or game_data.get('home_team', '')} vs {omenizer_away or game_data.get('away_team', '')}",
            'home_team': omenizer_home or game_data.get('home_team', ''),
            'away_team': omenizer_away or game_data.get('away_team', ''),
            'sport': omenizer_sport or game_data.get('sport', ''),
            'league': omenizer_league,
            'event_datetime': event_datetime.isoformat() if event_datetime else datetime.now().isoformat(),
            'status': game_data.get('game_status', 'scheduled'),
        }
        
        # Add event_id if found
        if event_id:
            translated['event_id'] = event_id
        
        # Translate markets and odds
        if game_data.get('markets'):
            translated['markets'] = self._translate_markets(game_data['markets'])
        
        return translated
    
    def _translate_markets(self, markets_data: dict) -> dict:
        """Translate markets data"""
        if not markets_data or not markets_data.get('markets'):
            return markets_data
        
        translated_markets = []
        for market in markets_data['markets']:
            translated_market = market.copy()
            
            # Translate bookmaker
            bookmaker_result = self.translate_bookmaker(market.get('bookmaker', ''))
            if bookmaker_result:
                translated_market['bookmaker'] = bookmaker_result[0]
                # Could add bookmaker_uuid to market if needed
            
            translated_markets.append(translated_market)
        
        return {
            **markets_data,
            'markets': translated_markets
        }
    
    def _add_mapping(self, mapping_type: str, oddsjam_value: str, omenizer_value: str, confidence: float):
        """Add new mapping to database"""
        cur = self.conn.cursor()
        try:
            if mapping_type == 'sport':
                cur.execute("""
                    INSERT INTO sports_mapping (oddsjam_sport, omenizer_sport, confidence_score)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (oddsjam_sport, omenizer_sport) DO UPDATE SET
                    confidence_score = %s, last_verified = NOW()
                """, (oddsjam_value, omenizer_value, confidence, confidence))
            
            self.conn.commit()
            print(f"✅ Added {mapping_type} mapping: {oddsjam_value} → {omenizer_value} ({confidence:.2f})")
        except Exception as e:
            print(f"❌ Error adding mapping: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def _add_league_mapping(self, oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, confidence):
        """Add league mapping"""
        cur = self.conn.cursor()
        try:
            cur.execute("""
                INSERT INTO leagues_mapping (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, confidence_score)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport) DO UPDATE SET
                confidence_score = %s, last_verified = NOW()
            """, (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, confidence, confidence))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error adding league mapping: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def _add_team_mapping(self, oddsjam_team, omenizer_team, league, sport, confidence):
        """Add team mapping"""
        cur = self.conn.cursor()
        try:
            cur.execute("""
                INSERT INTO teams_mapping (oddsjam_team, omenizer_team, league, sport, confidence_score)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_team, omenizer_team) DO UPDATE SET
                confidence_score = %s, last_verified = NOW()
            """, (oddsjam_team, omenizer_team, league, sport, confidence, confidence))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error adding team mapping: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def _add_bookmaker_mapping(self, oddsjam_bookmaker, omenizer_bookmaker, uuid, confidence):
        """Add bookmaker mapping"""
        cur = self.conn.cursor()
        try:
            cur.execute("""
                INSERT INTO bookmakers_mapping (oddsjam_bookmaker, omenizer_bookmaker, bookmaker_uuid, confidence_score)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (oddsjam_bookmaker, omenizer_bookmaker) DO UPDATE SET
                confidence_score = %s, last_verified = NOW()
            """, (oddsjam_bookmaker, omenizer_bookmaker, uuid, confidence, confidence))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error adding bookmaker mapping: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def _log_unmatched(self, source_system: str, item_type: str, item_value: str, context: dict = None):
        """Log items that couldn't be matched"""
        cur = self.conn.cursor()
        try:
            cur.execute("""
                INSERT INTO unmatched_items (source_system, item_type, item_value, context, attempt_count)
                VALUES (%s, %s, %s, %s, 1)
                ON CONFLICT (source_system, item_type, item_value) DO UPDATE SET
                attempt_count = unmatched_items.attempt_count + 1,
                last_attempt = NOW()
            """, (source_system, item_type, item_value, json.dumps(context) if context else None))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error logging unmatched item: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def _log_event_match(self, oddsjam_home, oddsjam_away, oddsjam_sport, oddsjam_datetime,
                        omenizer_event_id, omenizer_home, omenizer_away, home_score, away_score, time_diff):
        """Log successful event matches"""
        cur = self.conn.cursor()
        try:
            match_score = (home_score + away_score) / 200  # Average of both scores as decimal
            matched_on = ['home_team', 'away_team', 'datetime']
            
            cur.execute("""
                INSERT INTO event_matching (
                    oddsjam_game_id, omenizer_event_id, match_score, matched_on,
                    event_datetime, sport, home_team, away_team
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_game_id, omenizer_event_id) DO UPDATE SET
                match_score = %s, updated_at = NOW()
            """, (
                f"{oddsjam_home}-{oddsjam_away}-{oddsjam_datetime}",
                omenizer_event_id, match_score, matched_on,
                oddsjam_datetime, oddsjam_sport, oddsjam_home, oddsjam_away,
                match_score
            ))
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error logging event match: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def close(self):
        """Close database connection"""
        self.conn.close()


def main():
    """Test the translator"""
    translator = NomenclatureTranslator()
    
    # Test sports translation
    print("🏈 Testing sport translations:")
    test_sports = ['BASEBALL', 'FOOTBALL', 'TENNIS', 'MLB']
    for sport in test_sports:
        result = translator.translate_sport(sport)
        print(f"  {sport} → {result}")
    
    # Test team translation
    print("\n👥 Testing team translations:")
    test_teams = ['Chicago Cubs', 'Boston Red Sox', 'Buffalo Bills']
    for team in test_teams:
        result = translator.translate_team(team, league='MLB', sport='BASEBALL')
        print(f"  {team} → {result}")
    
    translator.close()

if __name__ == "__main__":
    main()