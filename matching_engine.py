#!/usr/bin/env python3
"""
Reusable Matching Engine
Purpose: Core matching functionality for OddsJam -> Omenizer translation
Can be used by scheduled jobs, API endpoints, or manual execution
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

class MatchingEngine:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        # Preload sports mappings for performance
        self.sports_map, self.sports_id_map = self._load_sports_mapping()
        
    def _load_sports_mapping(self):
        """Preload all sport mappings for quick lookup"""
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
        
    def translate_sport(self, oddsjam_sport):
        """Fast sport translation using preloaded mapping"""
        if not oddsjam_sport:
            return None, None
        
        # Direct lookup
        sport_lower = oddsjam_sport.lower()
        if sport_lower in self.sports_map:
            sport_name = self.sports_map[sport_lower]
            return sport_name, self.sports_id_map[sport_name]
        
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
            if mapped_sport in self.sports_map:
                sport_name = self.sports_map[mapped_sport]
                return sport_name, self.sports_id_map[sport_name]
        
        return None, None
    
    def translate_team(self, oddsjam_team, sport_id=None):
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
    
    def translate_league(self, oddsjam_league, sport_id=None):
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
    
    def process_game(self, game_id, home_team, away_team, sport, league, start_time):
        """Process a single game and return translation status"""
        missing_elements = []
        translations = {}
        
        # Sport translation
        sport_translation, sport_id = self.translate_sport(sport)
        if sport_translation:
            translations['sport'] = sport_translation
        else:
            missing_elements.append('sport')
        
        # League translation
        if league and sport_id:
            league_translation = self.translate_league(league, sport_id)
            if league_translation:
                translations['league'] = league_translation
            else:
                missing_elements.append('league')
        elif league:  # Only count as missing if there was a league to translate
            missing_elements.append('league')
        
        # Team translations
        home_translation = self.translate_team(home_team, sport_id)
        if home_translation:
            translations['home_team'] = home_translation
        else:
            missing_elements.append('home_team')
        
        away_translation = self.translate_team(away_team, sport_id)
        if away_translation:
            translations['away_team'] = away_translation
        else:
            missing_elements.append('away_team')
        
        # Determine status
        if not missing_elements:
            return 'ready_for_creation', translations, missing_elements
        elif len(missing_elements) < 4:  # Partial match
            return 'pending', translations, missing_elements
        else:
            return 'unmatched', translations, missing_elements
    
    def get_unmatched_games(self, limit=None):
        """Get games that need matching (today and future only)"""
        cur = self.conn.cursor()
        
        query = """
            SELECT DISTINCT ON (game_id) 
                game_id, home_team, away_team, sport, league, start_time_parsed 
            FROM games 
            WHERE start_time_parsed >= CURRENT_DATE
            AND start_time_parsed <= CURRENT_DATE + INTERVAL '2 days'
            AND game_id NOT IN (SELECT oddsjam_game_id FROM flagged_events)
            ORDER BY game_id, created_at DESC
        """
        
        if limit:
            query += f" LIMIT {limit}"
            
        cur.execute(query)
        games = cur.fetchall()
        cur.close()
        
        return games
    
    def create_or_update_flagged_event(self, game_id, home_team, away_team, sport, league, start_time, status, translations, missing_elements):
        """Create or update a flagged event"""
        cur = self.conn.cursor()
        
        try:
            flag_reason = f"Missing translations: {', '.join(missing_elements)}" if missing_elements else "Complete translation"
            
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
                game_id, home_team, away_team, sport, league, start_time,
                flag_reason, status, missing_elements,
                translations.get('sport'), translations.get('league'), 
                translations.get('home_team'), translations.get('away_team'),
                # ON CONFLICT UPDATE values
                status, missing_elements,
                translations.get('sport'), translations.get('league'),
                translations.get('home_team'), translations.get('away_team')
            ))
            
            self.conn.commit()
            
        except Exception as e:
            print(f"❌ Error creating flagged event for {game_id}: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def run_matching(self, limit=None, verbose=True):
        """Main method to run the matching process"""
        games = self.get_unmatched_games(limit)
        
        if not games:
            if verbose:
                print("✅ No new games to process")
            return {'total': 0, 'ready': 0, 'pending': 0, 'unmatched': 0}
        
        if verbose:
            print(f"🔄 Processing {len(games):,} games...")
        
        stats = {'total': 0, 'ready': 0, 'pending': 0, 'unmatched': 0, 'by_sport': {}}
        
        for game_id, home_team, away_team, sport, league, start_time in games:
            status, translations, missing_elements = self.process_game(
                game_id, home_team, away_team, sport, league, start_time
            )
            
            # Track stats
            stats['total'] += 1
            if status == 'ready_for_creation':
                stats['ready'] += 1
            elif status == 'pending':
                stats['pending'] += 1
                self.create_or_update_flagged_event(game_id, home_team, away_team, sport, league, start_time, status, translations, missing_elements)
            else:
                stats['unmatched'] += 1
                self.create_or_update_flagged_event(game_id, home_team, away_team, sport, league, start_time, status, translations, missing_elements)
            
            # Track by sport
            if sport not in stats['by_sport']:
                stats['by_sport'][sport] = {'total': 0, 'ready': 0}
            stats['by_sport'][sport]['total'] += 1
            if status == 'ready_for_creation':
                stats['by_sport'][sport]['ready'] += 1
        
        if verbose:
            success_rate = (stats['ready'] / stats['total']) * 100 if stats['total'] > 0 else 0
            print(f"📊 Results: {stats['ready']:,}/{stats['total']:,} ready ({success_rate:.1f}%)")
            
            if stats['by_sport']:
                print("🏆 By Sport:")
                for sport, sport_stats in stats['by_sport'].items():
                    sport_rate = (sport_stats['ready'] / sport_stats['total']) * 100
                    print(f"  {sport}: {sport_stats['ready']:,}/{sport_stats['total']:,} ({sport_rate:.1f}%)")
        
        return stats
    
    def get_ready_events(self, limit=None):
        """Get events ready for creation in Omenizer"""
        cur = self.conn.cursor()
        
        query = """
            SELECT oddsjam_game_id, home_team, away_team, sport, league, event_datetime,
                   translated_sport, translated_league, translated_home_team, translated_away_team
            FROM flagged_events 
            WHERE resolution_status = 'ready_for_creation'
            ORDER BY event_datetime ASC
        """
        
        if limit:
            query += f" LIMIT {limit}"
            
        cur.execute(query)
        events = cur.fetchall()
        cur.close()
        
        return events
    
    def close(self):
        """Close database connection"""
        self.conn.close()

def main():
    """Command line interface for the matching engine"""
    import argparse
    
    parser = argparse.ArgumentParser(description='OddsJam to Omenizer Matching Engine')
    parser.add_argument('--limit', type=int, help='Limit number of games to process')
    parser.add_argument('--quiet', '-q', action='store_true', help='Minimal output')
    parser.add_argument('--show-ready', action='store_true', help='Show events ready for creation')
    
    args = parser.parse_args()
    
    engine = MatchingEngine()
    
    try:
        if args.show_ready:
            events = engine.get_ready_events(args.limit)
            print(f"📋 {len(events):,} events ready for Omenizer creation:")
            for i, (game_id, home, away, sport, league, event_time, t_sport, t_league, t_home, t_away) in enumerate(events[:10]):
                print(f"  {i+1}. {t_home} vs {t_away} ({t_sport} - {t_league}) at {event_time}")
            if len(events) > 10:
                print(f"  ... and {len(events) - 10} more")
        else:
            stats = engine.run_matching(limit=args.limit, verbose=not args.quiet)
            
            if not args.quiet:
                print(f"\n✅ Matching complete!")
                if stats['ready'] > 0:
                    print(f"🎯 {stats['ready']:,} events ready for Omenizer creation")
                    print(f"💡 Run with --show-ready to see them")
    
    except KeyboardInterrupt:
        print("\n⚠️ Interrupted by user")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.close()

if __name__ == "__main__":
    main()