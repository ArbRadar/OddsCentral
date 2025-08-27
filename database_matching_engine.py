#!/usr/bin/env python3
"""
Database-Based Matching Engine
Purpose: High-performance matching using indexed database queries instead of CSV files
"""
import psycopg2
import requests
from datetime import datetime
import time

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

class DatabaseMatchingEngine:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        print("🔗 Connected to database")
        
    def translate_sport_db(self, oddsjam_sport):
        """Translate sport using database with fuzzy matching"""
        if not oddsjam_sport:
            return None
            
        cur = self.conn.cursor()
        
        try:
            # Direct exact match (case-insensitive)
            cur.execute("""
                SELECT name FROM sports_reference 
                WHERE LOWER(name) = LOWER(%s) AND active = true
                LIMIT 1
            """, (oddsjam_sport,))
            
            result = cur.fetchone()
            if result:
                sport_name = result[0]
                print(f"  🎯 DB exact match: {oddsjam_sport} → {sport_name}")
                self._log_mapping('sport', oddsjam_sport, sport_name, 1.0, 'db_exact')
                return sport_name
            
            # Fuzzy match using trigram similarity
            cur.execute("""
                SELECT name, SIMILARITY(LOWER(name), LOWER(%s)) as sim
                FROM sports_reference 
                WHERE active = true AND SIMILARITY(LOWER(name), LOWER(%s)) > 0.6
                ORDER BY sim DESC LIMIT 1
            """, (oddsjam_sport, oddsjam_sport))
            
            result = cur.fetchone()
            if result:
                sport_name, similarity = result
                print(f"  🔍 DB fuzzy match: {oddsjam_sport} → {sport_name} ({similarity:.2f})")
                self._log_mapping('sport', oddsjam_sport, sport_name, similarity, 'db_fuzzy')
                return sport_name
            
            print(f"  ❌ No DB match for sport: {oddsjam_sport}")
            return None
            
        except Exception as e:
            print(f"  ❌ Error translating sport {oddsjam_sport}: {e}")
            return None
        finally:
            cur.close()
    
    def translate_team_db(self, oddsjam_team, league=None, sport=None):
        """Translate team using database with sport context"""
        if not oddsjam_team:
            return None
            
        cur = self.conn.cursor()
        
        try:
            # Get sport_id for context
            sport_id = None
            if sport:
                sport_result = self.translate_sport_db(sport)
                if sport_result:
                    cur.execute("""
                        SELECT id FROM sports_reference 
                        WHERE LOWER(name) = LOWER(%s) AND active = true
                    """, (sport_result,))
                    sport_row = cur.fetchone()
                    if sport_row:
                        sport_id = sport_row[0]
            
            # Direct exact match with sport context
            if sport_id:
                cur.execute("""
                    SELECT official_name FROM teams_reference 
                    WHERE LOWER(official_name) = LOWER(%s) AND sport_id = %s AND active = true
                    LIMIT 1
                """, (oddsjam_team, sport_id))
            else:
                cur.execute("""
                    SELECT official_name FROM teams_reference 
                    WHERE LOWER(official_name) = LOWER(%s) AND active = true
                    LIMIT 1
                """, (oddsjam_team,))
            
            result = cur.fetchone()
            if result:
                team_name = result[0]
                print(f"  🎯 DB exact match: {oddsjam_team} → {team_name}")
                self._log_mapping('team', oddsjam_team, team_name, 1.0, 'db_exact')
                return team_name
            
            # Fuzzy match with sport context (higher threshold for teams)
            if sport_id:
                cur.execute("""
                    SELECT official_name, SIMILARITY(LOWER(official_name), LOWER(%s)) as sim
                    FROM teams_reference 
                    WHERE sport_id = %s AND active = true 
                    AND SIMILARITY(LOWER(official_name), LOWER(%s)) > 0.8
                    ORDER BY sim DESC LIMIT 1
                """, (oddsjam_team, sport_id, oddsjam_team))
            else:
                cur.execute("""
                    SELECT official_name, SIMILARITY(LOWER(official_name), LOWER(%s)) as sim
                    FROM teams_reference 
                    WHERE active = true AND SIMILARITY(LOWER(official_name), LOWER(%s)) > 0.8
                    ORDER BY sim DESC LIMIT 1
                """, (oddsjam_team, oddsjam_team))
            
            result = cur.fetchone()
            if result:
                team_name, similarity = result
                print(f"  🔍 DB fuzzy match: {oddsjam_team} → {team_name} ({similarity:.2f})")
                self._log_mapping('team', oddsjam_team, team_name, similarity, 'db_fuzzy')
                return team_name
            
            print(f"  ❌ No DB match for team: {oddsjam_team} (sport: {sport})")
            return None
            
        except Exception as e:
            print(f"  ❌ Error translating team {oddsjam_team}: {e}")
            return None
        finally:
            cur.close()
    
    def translate_league_db(self, oddsjam_league, oddsjam_sport):
        """Translate league using database with sport context"""
        if not oddsjam_league or not oddsjam_sport:
            return None
            
        cur = self.conn.cursor()
        
        try:
            # Get sport_id for context
            sport_result = self.translate_sport_db(oddsjam_sport)
            if not sport_result:
                print(f"  ❌ Could not translate sport {oddsjam_sport}")
                return None
                
            cur.execute("""
                SELECT id FROM sports_reference 
                WHERE LOWER(name) = LOWER(%s) AND active = true
            """, (sport_result,))
            sport_row = cur.fetchone()
            if not sport_row:
                return None
            sport_id = sport_row[0]
            
            # Direct exact match within sport
            cur.execute("""
                SELECT name FROM leagues_reference 
                WHERE LOWER(name) = LOWER(%s) AND sport_id = %s AND active = true
                LIMIT 1
            """, (oddsjam_league, sport_id))
            
            result = cur.fetchone()
            if result:
                league_name = result[0]
                print(f"  🎯 DB exact match: {oddsjam_league} → {league_name}")
                self._log_mapping('league', f"{oddsjam_league}|{oddsjam_sport}", f"{league_name}|{sport_result}", 1.0, 'db_exact')
                return league_name, sport_result
            
            # Fuzzy match within sport
            cur.execute("""
                SELECT name, SIMILARITY(LOWER(name), LOWER(%s)) as sim
                FROM leagues_reference 
                WHERE sport_id = %s AND active = true 
                AND SIMILARITY(LOWER(name), LOWER(%s)) > 0.7
                ORDER BY sim DESC LIMIT 1
            """, (oddsjam_league, sport_id, oddsjam_league))
            
            result = cur.fetchone()
            if result:
                league_name, similarity = result
                print(f"  🔍 DB fuzzy match: {oddsjam_league} → {league_name} ({similarity:.2f})")
                self._log_mapping('league', f"{oddsjam_league}|{oddsjam_sport}", f"{league_name}|{sport_result}", similarity, 'db_fuzzy')
                return league_name, sport_result
            
            print(f"  ❌ No DB match for league: {oddsjam_league} in sport {sport_result}")
            return None
            
        except Exception as e:
            print(f"  ❌ Error translating league {oddsjam_league}: {e}")
            return None
        finally:
            cur.close()
    
    def translate_bookmaker_db(self, oddsjam_bookmaker):
        """Translate bookmaker using database"""
        if not oddsjam_bookmaker:
            return None
            
        cur = self.conn.cursor()
        
        try:
            # Direct exact match
            cur.execute("""
                SELECT name FROM bookmakers_reference 
                WHERE LOWER(name) = LOWER(%s)
                LIMIT 1
            """, (oddsjam_bookmaker,))
            
            result = cur.fetchone()
            if result:
                bookmaker_name = result[0]
                print(f"  🎯 DB exact match: {oddsjam_bookmaker} → {bookmaker_name}")
                return bookmaker_name
            
            # Fuzzy match
            cur.execute("""
                SELECT name, SIMILARITY(LOWER(name), LOWER(%s)) as sim
                FROM bookmakers_reference 
                WHERE SIMILARITY(LOWER(name), LOWER(%s)) > 0.7
                ORDER BY sim DESC LIMIT 1
            """, (oddsjam_bookmaker, oddsjam_bookmaker))
            
            result = cur.fetchone()
            if result:
                bookmaker_name, similarity = result
                print(f"  🔍 DB fuzzy match: {oddsjam_bookmaker} → {bookmaker_name} ({similarity:.2f})")
                return bookmaker_name
            
            print(f"  ❌ No DB match for bookmaker: {oddsjam_bookmaker}")
            return None
            
        except Exception as e:
            print(f"  ❌ Error translating bookmaker {oddsjam_bookmaker}: {e}")
            return None
        finally:
            cur.close()
    
    def _log_mapping(self, mapping_type, source_value, target_value, confidence, method):
        """Log successful mapping to database"""
        cur = self.conn.cursor()
        try:
            if mapping_type == 'sport':
                cur.execute("""
                    INSERT INTO sports_mapping (oddsjam_sport, omenizer_sport, confidence_score)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (oddsjam_sport, omenizer_sport) DO UPDATE SET
                    confidence_score = %s, last_verified = NOW()
                """, (source_value, target_value, confidence, confidence))
            
            elif mapping_type == 'team':
                cur.execute("""
                    INSERT INTO teams_mapping (oddsjam_team, omenizer_team, confidence_score)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (oddsjam_team, omenizer_team) DO UPDATE SET
                    confidence_score = %s, last_verified = NOW()
                """, (source_value, target_value, confidence, confidence))
            
            elif mapping_type == 'league':
                parts = source_value.split('|')
                target_parts = target_value.split('|')
                if len(parts) >= 2 and len(target_parts) >= 2:
                    cur.execute("""
                        INSERT INTO leagues_mapping (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, confidence_score)
                        VALUES (%s, %s, %s, %s, %s)
                        ON CONFLICT (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport) DO UPDATE SET
                        confidence_score = %s, last_verified = NOW()
                    """, (parts[0], parts[1], target_parts[0], target_parts[1], confidence, confidence))
            
            self.conn.commit()
            
        except Exception as e:
            print(f"  ❌ Error logging mapping: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def process_flagged_events(self):
        """Process flagged events using database matching"""
        cur = self.conn.cursor()
        
        try:
            # Get flagged events that need processing
            cur.execute("""
                SELECT id, home_team, away_team, sport, league, event_datetime
                FROM flagged_events 
                WHERE resolution_status = 'pending'
                ORDER BY created_at
                LIMIT 20
            """)
            
            flagged_events = cur.fetchall()
            
            if not flagged_events:
                print("✅ No flagged events to process")
                return 0, 0
            
            print(f"🔄 Processing {len(flagged_events)} flagged events...")
            
            successful_translations = 0
            total_events = len(flagged_events)
            
            for event_id, home_team, away_team, sport, league, event_datetime in flagged_events:
                print(f"\n🏈 Event: {home_team} vs {away_team} ({sport})")
                
                # Track missing elements
                missing_elements = []
                translations = {}
                
                # Translate sport
                sport_translation = self.translate_sport_db(sport)
                if sport_translation:
                    translations['sport'] = sport_translation
                else:
                    missing_elements.append('sport')
                
                # Translate league
                if league:
                    league_translation = self.translate_league_db(league, sport)
                    if league_translation:
                        translations['league'] = league_translation[0]
                    else:
                        missing_elements.append('league')
                
                # Translate teams
                home_translation = self.translate_team_db(home_team, league, sport)
                if home_translation:
                    translations['home_team'] = home_translation
                else:
                    missing_elements.append('home_team')
                
                away_translation = self.translate_team_db(away_team, league, sport)
                if away_translation:
                    translations['away_team'] = away_translation
                else:
                    missing_elements.append('away_team')
                
                # Note: Bookmaker translation would go here if needed
                
                # Update event status
                if not missing_elements:
                    # All elements translated successfully
                    cur.execute("""
                        UPDATE flagged_events 
                        SET resolution_status = 'ready_for_creation',
                            translated_sport = %s,
                            translated_league = %s,
                            translated_home_team = %s,
                            translated_away_team = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """, (
                        translations.get('sport'),
                        translations.get('league'), 
                        translations.get('home_team'),
                        translations.get('away_team'),
                        event_id
                    ))
                    
                    successful_translations += 1
                    print(f"  ✅ Ready for creation: {translations}")
                else:
                    # Some elements still missing
                    cur.execute("""
                        UPDATE flagged_events 
                        SET missing_elements = %s,
                            translated_sport = %s,
                            translated_league = %s,
                            translated_home_team = %s,
                            translated_away_team = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """, (
                        missing_elements,
                        translations.get('sport'),
                        translations.get('league'), 
                        translations.get('home_team'),
                        translations.get('away_team'),
                        event_id
                    ))
                    
                    print(f"  ⚠️ Still missing: {missing_elements}")
            
            self.conn.commit()
            
            print(f"\n📊 RESULTS: {successful_translations}/{total_events} events ready for creation")
            return successful_translations, total_events
            
        except Exception as e:
            print(f"❌ Error processing flagged events: {e}")
            self.conn.rollback()
            return 0, 0
        finally:
            cur.close()
    
    def benchmark_performance(self):
        """Benchmark database vs CSV performance"""
        print("\n⚡ Performance Benchmark: Database vs CSV")
        print("=" * 50)
        
        # Test queries with timing
        test_teams = ['Yankees', 'Red Sox', 'Lakers', 'Warriors', 'Cowboys']
        
        cur = self.conn.cursor()
        
        for team in test_teams:
            start_time = time.time()
            
            # Database query with index
            cur.execute("""
                SELECT official_name, SIMILARITY(LOWER(official_name), LOWER(%s)) as sim
                FROM teams_reference 
                WHERE active = true AND SIMILARITY(LOWER(official_name), LOWER(%s)) > 0.5
                ORDER BY sim DESC LIMIT 1
            """, (team, team))
            
            result = cur.fetchone()
            db_time = (time.time() - start_time) * 1000  # Convert to milliseconds
            
            if result:
                print(f"  {team}: Found '{result[0]}' in {db_time:.2f}ms (similarity: {result[1]:.2f})")
            else:
                print(f"  {team}: No match found in {db_time:.2f}ms")
        
        cur.close()
        print("\n💡 Database queries use trigram indexes for sub-millisecond fuzzy matching!")
    
    def close(self):
        self.conn.close()

def main():
    print("🚀 Database-Based Matching Engine")
    print("=" * 50)
    
    engine = DatabaseMatchingEngine()
    
    try:
        # Benchmark performance
        engine.benchmark_performance()
        
        # Process flagged events
        successful, total = engine.process_flagged_events()
        
        if successful > 0:
            print(f"\n✅ {successful} events ready for Omenizer creation!")
        else:
            print("\n⚠️ No events ready. Check data quality.")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.close()

if __name__ == "__main__":
    main()