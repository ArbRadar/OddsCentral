#!/usr/bin/env python3
"""
CSV-Based Matching Engine
Purpose: Use CSV files as primary reference, fallback to API fuzzy matching
"""
import pandas as pd
import psycopg2
import requests
from fuzzywuzzy import fuzz, process
import json
from datetime import datetime
import os

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

CSV_PATH = "/Users/joelsalazar/OddsCentral/docs/csv"

class CSVMatchingEngine:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        self.csv_data = {}
        self._load_csv_files()
        
    def _load_csv_files(self):
        """Load all CSV reference files"""
        print("📚 Loading CSV reference files...")
        
        csv_files = {
            'sports': 'sports_rows.csv',
            'leagues': 'leagues_rows.csv', 
            'teams': 'teams_rows.csv',
            'countries': 'countries_rows.csv',
            'bookmakers': 'bookmakers_rows (1).csv'
        }
        
        for key, filename in csv_files.items():
            filepath = os.path.join(CSV_PATH, filename)
            if os.path.exists(filepath):
                try:
                    df = pd.read_csv(filepath)
                    self.csv_data[key] = df
                    print(f"  ✅ Loaded {len(df)} {key} records")
                except Exception as e:
                    print(f"  ❌ Error loading {filename}: {e}")
                    self.csv_data[key] = pd.DataFrame()
            else:
                print(f"  ⚠️ File not found: {filename}")
                self.csv_data[key] = pd.DataFrame()
        
        # Create lookup dictionaries for fast matching
        self._create_lookup_dicts()
    
    def _create_lookup_dicts(self):
        """Create fast lookup dictionaries"""
        self.lookups = {}
        
        # Sports lookup (name -> id, name)
        if not self.csv_data['sports'].empty:
            sports_active = self.csv_data['sports'][self.csv_data['sports']['active'] == True]
            self.lookups['sports'] = dict(zip(
                sports_active['name'].str.lower(), 
                zip(sports_active['id'], sports_active['name'])
            ))
        
        # Leagues lookup (name -> id, name, sport_id)
        if not self.csv_data['leagues'].empty:
            leagues_active = self.csv_data['leagues'][self.csv_data['leagues']['active'] == True]
            self.lookups['leagues'] = dict(zip(
                leagues_active['name'].str.lower(),
                zip(leagues_active['id'], leagues_active['name'], leagues_active['sport_id'])
            ))
        
        # Teams lookup (official_name -> id, name, sport_id)
        if not self.csv_data['teams'].empty:
            teams_active = self.csv_data['teams'][self.csv_data['teams']['active'] == True]
            self.lookups['teams'] = dict(zip(
                teams_active['official_name'].str.lower(),
                zip(teams_active['id'], teams_active['official_name'], teams_active['sport_id'])
            ))
        
        print(f"🔍 Created lookups: {len(self.lookups.get('sports', {}))} sports, {len(self.lookups.get('leagues', {}))} leagues, {len(self.lookups.get('teams', {}))} teams")
    
    def translate_sport_csv_first(self, oddsjam_sport):
        """Translate sport using CSV first, API fallback"""
        if not oddsjam_sport:
            return None
            
        # Direct CSV lookup
        sport_lower = oddsjam_sport.lower()
        if sport_lower in self.lookups.get('sports', {}):
            sport_id, sport_name = self.lookups['sports'][sport_lower]
            print(f"  🎯 CSV match: {oddsjam_sport} → {sport_name}")
            self._log_mapping('sport', oddsjam_sport, sport_name, 1.0, 'csv_exact')
            return sport_name
        
        # Fuzzy match against CSV data
        if self.csv_data['sports'].empty:
            return self._api_fallback_sport(oddsjam_sport)
            
        sports_names = self.csv_data['sports'][self.csv_data['sports']['active'] == True]['name'].tolist()
        match, score = process.extractOne(oddsjam_sport, sports_names)
        
        if score >= 85:
            print(f"  🔍 CSV fuzzy match: {oddsjam_sport} → {match} ({score}%)")
            self._log_mapping('sport', oddsjam_sport, match, score/100, 'csv_fuzzy')
            return match
        
        # API fallback
        return self._api_fallback_sport(oddsjam_sport)
    
    def translate_team_csv_first(self, oddsjam_team, league=None, sport=None):
        """Translate team using CSV first, API fallback"""
        if not oddsjam_team:
            return None
            
        # Get sport_id for context
        sport_id = None
        if sport:
            sport_result = self.translate_sport_csv_first(sport)
            if sport_result:
                sport_matches = self.csv_data['sports'][
                    self.csv_data['sports']['name'].str.lower() == sport_result.lower()
                ]
                if not sport_matches.empty:
                    sport_id = sport_matches.iloc[0]['id']
        
        # Direct CSV lookup
        team_lower = oddsjam_team.lower()
        if team_lower in self.lookups.get('teams', {}):
            team_id, team_name, team_sport_id = self.lookups['teams'][team_lower]
            
            # Check sport context if available
            if sport_id and team_sport_id != sport_id:
                print(f"  ⚠️ Sport mismatch for {oddsjam_team}: expected {sport_id}, got {team_sport_id}")
            else:
                print(f"  🎯 CSV match: {oddsjam_team} → {team_name}")
                self._log_mapping('team', oddsjam_team, team_name, 1.0, 'csv_exact')
                return team_name
        
        # Fuzzy match with sport context
        if not self.csv_data['teams'].empty:
            teams_df = self.csv_data['teams'][self.csv_data['teams']['active'] == True]
            
            # Filter by sport if we have sport context
            if sport_id:
                teams_df = teams_df[teams_df['sport_id'] == sport_id]
                print(f"  🔍 Filtering to {len(teams_df)} teams in sport {sport}")
            
            if not teams_df.empty:
                team_names = teams_df['official_name'].tolist()
                match, score = process.extractOne(oddsjam_team, team_names)
                
                if score >= 90:  # Higher threshold for teams
                    print(f"  🔍 CSV fuzzy match: {oddsjam_team} → {match} ({score}%)")
                    self._log_mapping('team', oddsjam_team, match, score/100, 'csv_fuzzy')
                    return match
        
        # API fallback
        return self._api_fallback_team(oddsjam_team, league, sport)
    
    def translate_league_csv_first(self, oddsjam_league, oddsjam_sport):
        """Translate league using CSV first"""
        if not oddsjam_league or not oddsjam_sport:
            return None
            
        # Get sport_id for context
        sport_id = None
        sport_result = self.translate_sport_csv_first(oddsjam_sport)
        if sport_result:
            sport_matches = self.csv_data['sports'][
                self.csv_data['sports']['name'].str.lower() == sport_result.lower()
            ]
            if not sport_matches.empty:
                sport_id = sport_matches.iloc[0]['id']
        
        # Direct CSV lookup
        league_lower = oddsjam_league.lower()
        if league_lower in self.lookups.get('leagues', {}):
            league_id, league_name, league_sport_id = self.lookups['leagues'][league_lower]
            
            if sport_id and league_sport_id == sport_id:
                print(f"  🎯 CSV match: {oddsjam_league} → {league_name}")
                self._log_mapping('league', f"{oddsjam_league}|{oddsjam_sport}", f"{league_name}|{sport_result}", 1.0, 'csv_exact')
                return league_name, sport_result
        
        # Fuzzy match with sport context
        if not self.csv_data['leagues'].empty and sport_id:
            leagues_df = self.csv_data['leagues'][
                (self.csv_data['leagues']['active'] == True) &
                (self.csv_data['leagues']['sport_id'] == sport_id)
            ]
            
            if not leagues_df.empty:
                league_names = leagues_df['name'].tolist()
                match, score = process.extractOne(oddsjam_league, league_names)
                
                if score >= 80:
                    print(f"  🔍 CSV fuzzy match: {oddsjam_league} → {match} ({score}%)")
                    self._log_mapping('league', f"{oddsjam_league}|{oddsjam_sport}", f"{match}|{sport_result}", score/100, 'csv_fuzzy')
                    return match, sport_result
        
        # API fallback
        return self._api_fallback_league(oddsjam_league, oddsjam_sport)
    
    def _api_fallback_sport(self, oddsjam_sport):
        """Fallback to API for sport translation"""
        print(f"  🌐 API fallback for sport: {oddsjam_sport}")
        # TODO: Implement API search for updated sports
        return None
    
    def _api_fallback_team(self, oddsjam_team, league, sport):
        """Fallback to API for team translation"""
        print(f"  🌐 API fallback for team: {oddsjam_team}")
        # TODO: Implement API search for updated teams
        return None
    
    def _api_fallback_league(self, oddsjam_league, oddsjam_sport):
        """Fallback to API for league translation"""
        print(f"  🌐 API fallback for league: {oddsjam_league}")
        # TODO: Implement API search for updated leagues
        return None
    
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
    
    def test_mlb_matching(self):
        """Test MLB team matching specifically"""
        print("\n🔬 Testing MLB Team Matching")
        print("=" * 50)
        
        # Get OddsJam MLB teams that are currently flagged
        cur = self.conn.cursor()
        cur.execute("""
            SELECT DISTINCT home_team, away_team, sport, league 
            FROM flagged_events 
            WHERE sport IN ('BASEBALL', 'MLB')
            LIMIT 10
        """)
        
        flagged_games = cur.fetchall()
        cur.close()
        
        successful_matches = 0
        total_attempts = 0
        
        for home_team, away_team, sport, league in flagged_games:
            print(f"\n🏈 Game: {home_team} vs {away_team} ({sport})")
            
            # Test home team translation
            total_attempts += 1
            home_result = self.translate_team_csv_first(home_team, league, sport)
            if home_result:
                successful_matches += 1
            
            # Test away team translation  
            total_attempts += 1
            away_result = self.translate_team_csv_first(away_team, league, sport)
            if away_result:
                successful_matches += 1
            
            # Test league translation
            league_result = self.translate_league_csv_first(league, sport)
            if league_result:
                print(f"  📋 League: {league} → {league_result[0]}")
            
            # Test sport translation
            sport_result = self.translate_sport_csv_first(sport)
            if sport_result:
                print(f"  🏈 Sport: {sport} → {sport_result}")
        
        print(f"\n📊 RESULTS: {successful_matches}/{total_attempts} successful matches")
        print(f"Success rate: {(successful_matches/total_attempts*100):.1f}%")
        
        return successful_matches, total_attempts
    
    def close(self):
        self.conn.close()

def main():
    print("🚀 CSV-Based Matching Engine")
    
    engine = CSVMatchingEngine()
    
    try:
        # Test the system
        successful, total = engine.test_mlb_matching()
        
        if successful > 0:
            print(f"\n✅ Found matches! Re-running enhanced matching engine...")
            # Could automatically re-run the enhanced matching engine here
        else:
            print("\n⚠️ No matches found. May need API fallback implementation.")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        engine.close()

if __name__ == "__main__":
    main()