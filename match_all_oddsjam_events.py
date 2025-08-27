#!/usr/bin/env python3
"""
Match All OddsJam Events
Purpose: Process all OddsJam games through the database matching engine
"""
import psycopg2
from datetime import datetime
import time

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

class OddsJamMatcher:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        print("🔗 Connected to database")
        
    def get_sports_mapping(self):
        """Get all sport mappings for quick lookup"""
        cur = self.conn.cursor()
        cur.execute("""
            SELECT LOWER(name), name, id FROM sports_reference WHERE active = true
        """)
        sports_map = {}
        sports_id_map = {}
        for lower_name, name, sport_id in cur.fetchall():
            sports_map[lower_name] = name
            sports_id_map[name] = sport_id
        cur.close()
        return sports_map, sports_id_map
        
    def translate_sport_fast(self, oddsjam_sport, sports_map):
        """Fast sport translation using preloaded mapping"""
        if not oddsjam_sport:
            return None
        
        # Direct lookup
        sport_lower = oddsjam_sport.lower()
        if sport_lower in sports_map:
            return sports_map[sport_lower]
        
        # Handle common variations
        variations = {
            'mlb': 'baseball',
            'baseball': 'baseball',
            'nfl': 'american football',
            'football': 'american football',
            'nba': 'basketball',
            'basketball': 'basketball',
            'nhl': 'ice hockey',
            'hockey': 'ice hockey',
            'soccer': 'soccer',
            'tennis': 'tennis'
        }
        
        if sport_lower in variations:
            mapped_sport = variations[sport_lower]
            if mapped_sport in sports_map:
                return sports_map[mapped_sport]
        
        return None
    
    def translate_team_fast(self, oddsjam_team, sport_id=None):
        """Fast team translation with database query"""
        if not oddsjam_team:
            return None
            
        cur = self.conn.cursor()
        
        try:
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
                return result[0]
            
            # Fuzzy match (only if exact match failed)
            if sport_id:
                cur.execute("""
                    SELECT official_name FROM teams_reference 
                    WHERE sport_id = %s AND active = true 
                    AND SIMILARITY(LOWER(official_name), LOWER(%s)) > 0.85
                    ORDER BY SIMILARITY(LOWER(official_name), LOWER(%s)) DESC
                    LIMIT 1
                """, (sport_id, oddsjam_team, oddsjam_team))
            else:
                cur.execute("""
                    SELECT official_name FROM teams_reference 
                    WHERE active = true AND SIMILARITY(LOWER(official_name), LOWER(%s)) > 0.85
                    ORDER BY SIMILARITY(LOWER(official_name), LOWER(%s)) DESC
                    LIMIT 1
                """, (oddsjam_team, oddsjam_team))
            
            result = cur.fetchone()
            return result[0] if result else None
            
        except Exception as e:
            return None
        finally:
            cur.close()
    
    def translate_league_fast(self, oddsjam_league, sport_id=None):
        """Fast league translation"""
        if not oddsjam_league or not sport_id:
            return None
            
        cur = self.conn.cursor()
        
        try:
            # Direct exact match
            cur.execute("""
                SELECT name FROM leagues_reference 
                WHERE LOWER(name) = LOWER(%s) AND sport_id = %s AND active = true
                LIMIT 1
            """, (oddsjam_league, sport_id))
            
            result = cur.fetchone()
            if result:
                return result[0]
            
            # Fuzzy match
            cur.execute("""
                SELECT name FROM leagues_reference 
                WHERE sport_id = %s AND active = true 
                AND SIMILARITY(LOWER(name), LOWER(%s)) > 0.8
                ORDER BY SIMILARITY(LOWER(name), LOWER(%s)) DESC
                LIMIT 1
            """, (sport_id, oddsjam_league, oddsjam_league))
            
            result = cur.fetchone()
            return result[0] if result else None
            
        except Exception as e:
            return None
        finally:
            cur.close()
    
    def clear_existing_flagged_events(self):
        """Clear existing flagged events to start fresh"""
        cur = self.conn.cursor()
        try:
            cur.execute("DELETE FROM flagged_events")
            deleted = cur.rowcount
            self.conn.commit()
            print(f"🗑️  Cleared {deleted} existing flagged events")
        except Exception as e:
            print(f"❌ Error clearing flagged events: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def process_all_games(self, limit=None):
        """Process all OddsJam games through matching engine"""
        cur = self.conn.cursor()
        
        # Get sport mappings
        sports_map, sports_id_map = self.get_sports_mapping()
        
        try:
            # Get only today and future games
            query = """
                SELECT game_id, home_team, away_team, sport, league, start_time_parsed 
                FROM games 
                WHERE start_time_parsed >= CURRENT_DATE
                ORDER BY start_time_parsed ASC
            """
            if limit:
                query += f" LIMIT {limit}"
                
            cur.execute(query)
            all_games = cur.fetchall()
            
            total_games = len(all_games)
            print(f"📊 Processing {total_games:,} OddsJam games...")
            
            # Statistics
            stats = {
                'total_processed': 0,
                'successful_matches': 0,
                'partial_matches': 0,
                'no_matches': 0,
                'by_sport': {},
                'missing_elements': {
                    'sport': 0,
                    'league': 0, 
                    'home_team': 0,
                    'away_team': 0
                }
            }
            
            batch_size = 1000
            batch_count = 0
            
            for i, (game_id, home_team, away_team, sport, league, start_time_parsed) in enumerate(all_games):
                # Track sport stats
                if sport not in stats['by_sport']:
                    stats['by_sport'][sport] = {'total': 0, 'matched': 0}
                stats['by_sport'][sport]['total'] += 1
                
                # Attempt translations
                missing_elements = []
                translations = {}
                
                # Sport translation
                sport_translation = self.translate_sport_fast(sport, sports_map)
                if sport_translation:
                    translations['sport'] = sport_translation
                    sport_id = sports_id_map.get(sport_translation)
                else:
                    missing_elements.append('sport')
                    sport_id = None
                    stats['missing_elements']['sport'] += 1
                
                # League translation
                if league and sport_id:
                    league_translation = self.translate_league_fast(league, sport_id)
                    if league_translation:
                        translations['league'] = league_translation
                    else:
                        missing_elements.append('league')
                        stats['missing_elements']['league'] += 1
                else:
                    if league:  # Only count as missing if there was a league to translate
                        missing_elements.append('league')
                        stats['missing_elements']['league'] += 1
                
                # Team translations
                home_translation = self.translate_team_fast(home_team, sport_id)
                if home_translation:
                    translations['home_team'] = home_translation
                else:
                    missing_elements.append('home_team')
                    stats['missing_elements']['home_team'] += 1
                
                away_translation = self.translate_team_fast(away_team, sport_id)
                if away_translation:
                    translations['away_team'] = away_translation
                else:
                    missing_elements.append('away_team')
                    stats['missing_elements']['away_team'] += 1
                
                # Determine status and create flagged event if needed
                if not missing_elements:
                    # Complete match - ready for creation
                    status = 'ready_for_creation'
                    stats['successful_matches'] += 1
                    stats['by_sport'][sport]['matched'] += 1
                elif len(missing_elements) < 4:  # Partial match
                    status = 'pending'
                    stats['partial_matches'] += 1
                    self._create_flagged_event(game_id, home_team, away_team, sport, league, start_time_parsed, missing_elements, translations, status)
                else:
                    # No useful matches
                    status = 'unmatched'
                    stats['no_matches'] += 1
                    self._create_flagged_event(game_id, home_team, away_team, sport, league, start_time_parsed, missing_elements, translations, status)
                
                stats['total_processed'] += 1
                
                # Progress reporting
                if (i + 1) % batch_size == 0:
                    batch_count += 1
                    progress = ((i + 1) / total_games) * 100
                    print(f"  📈 Batch {batch_count}: {i+1:,}/{total_games:,} games ({progress:.1f}%) - {stats['successful_matches']:,} ready")
                    self.conn.commit()  # Commit batch
            
            # Final commit
            self.conn.commit()
            
            # Print final statistics
            self._print_final_stats(stats, total_games)
            
            return stats
            
        except Exception as e:
            print(f"❌ Error processing games: {e}")
            self.conn.rollback()
            import traceback
            traceback.print_exc()
            return None
        finally:
            cur.close()
    
    def _create_flagged_event(self, game_id, home_team, away_team, sport, league, game_time, missing_elements, translations, status):
        """Create a flagged event entry"""
        cur = self.conn.cursor()
        
        try:
            flag_reason = f"Missing translations: {', '.join(missing_elements)}"
            
            cur.execute("""
                INSERT INTO flagged_events (
                    oddsjam_game_id, home_team, away_team, sport, league, event_datetime,
                    flag_reason, resolution_status, missing_elements,
                    translated_sport, translated_league, translated_home_team, translated_away_team
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (oddsjam_game_id) DO UPDATE SET
                resolution_status = %s,
                missing_elements = %s,
                translated_sport = %s,
                translated_league = %s,
                translated_home_team = %s,
                translated_away_team = %s,
                updated_at = NOW()
            """, (
                game_id, home_team, away_team, sport, league, game_time,
                flag_reason, status, missing_elements,
                translations.get('sport'), translations.get('league'), 
                translations.get('home_team'), translations.get('away_team'),
                # ON CONFLICT UPDATE values
                status, missing_elements,
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team')
            ))
            
        except Exception as e:
            print(f"❌ Error creating flagged event for {game_id}: {e}")
        finally:
            cur.close()
    
    def _print_final_stats(self, stats, total_games):
        """Print comprehensive final statistics"""
        print(f"\n📊 FINAL MATCHING RESULTS")
        print("=" * 60)
        
        success_rate = (stats['successful_matches'] / total_games) * 100
        partial_rate = (stats['partial_matches'] / total_games) * 100
        
        print(f"Total Games Processed: {total_games:,}")
        print(f"✅ Ready for Creation: {stats['successful_matches']:,} ({success_rate:.1f}%)")
        print(f"⚠️  Partial Matches:    {stats['partial_matches']:,} ({partial_rate:.1f}%)")
        print(f"❌ No Matches:         {stats['no_matches']:,}")
        
        print(f"\n🏆 BY SPORT:")
        for sport, sport_stats in stats['by_sport'].items():
            sport_success = (sport_stats['matched'] / sport_stats['total']) * 100
            print(f"  {sport:12} | {sport_stats['matched']:,}/{sport_stats['total']:,} ({sport_success:.1f}%)")
        
        print(f"\n❌ MISSING ELEMENTS:")
        total_missing = sum(stats['missing_elements'].values())
        for element, count in stats['missing_elements'].items():
            if total_missing > 0:
                pct = (count / total_missing) * 100
                print(f"  {element:12} | {count:,} ({pct:.1f}%)")
    
    def close(self):
        self.conn.close()

def main():
    print("🚀 Matching All OddsJam Events")
    print("=" * 50)
    
    matcher = OddsJamMatcher()
    
    try:
        # Clear existing flagged events
        matcher.clear_existing_flagged_events()
        
        # Process all games (or specify limit for testing)
        # matcher.process_all_games(limit=1000)  # For testing
        stats = matcher.process_all_games()  # Full processing
        
        if stats:
            print(f"\n✅ Processing complete!")
            if stats['successful_matches'] > 0:
                print(f"🎯 {stats['successful_matches']:,} events ready for Omenizer creation")
            if stats['partial_matches'] > 0:
                print(f"🔧 {stats['partial_matches']:,} events flagged for review")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        matcher.close()

if __name__ == "__main__":
    main()