#!/usr/bin/env python3
"""
Complete Reference Data Fetcher
Purpose: Fetch ALL sports, leagues, teams, bookmakers from both systems
"""
import requests
import psycopg2
import json
from datetime import datetime
import time
from collections import defaultdict
import math

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def fetch_complete_omenizer_data():
    """Fetch ALL reference data from Omenizer API"""
    headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
    
    print("🔍 Fetching COMPLETE Omenizer reference data...")
    
    # Get total number of events first
    response = requests.get(f"{OMENIZER_API_URL}/calendar/events/?page_size=1", headers=headers)
    if response.status_code != 200:
        print(f"❌ Failed to get total count: {response.status_code}")
        return {}
    
    total_events = response.json().get('data', {}).get('total', 0)
    total_pages = math.ceil(total_events / 100)  # 100 events per page
    
    print(f"📊 Found {total_events} total events across {total_pages} pages")
    
    # Collections for all data
    sports = set()
    leagues = set()
    countries = set()
    teams = set()
    seasons = set()
    
    # Fetch ALL pages
    processed_events = 0
    for page in range(1, min(total_pages + 1, 500)):  # Limit to prevent excessive API calls
        try:
            print(f"📊 Fetching Omenizer page {page}/{total_pages}...")
            response = requests.get(
                f"{OMENIZER_API_URL}/calendar/events/?page={page}&page_size=100",
                headers=headers
            )
            
            if response.status_code != 200:
                print(f"❌ Error fetching page {page}: {response.status_code}")
                continue
                
            data = response.json()
            
            if not data.get('data', {}).get('items'):
                print(f"ℹ️ No more data at page {page}")
                break
                
            # Process all events in this page
            for date_group in data['data']['items']:
                for event in date_group.get('events', []):
                    if event.get('sport'):
                        sports.add(event['sport'])
                    if event.get('league'):
                        leagues.add((event['league'], event.get('sport', ''), event.get('country', '')))
                    if event.get('country'):
                        countries.add(event['country'])
                    if event.get('season'):
                        seasons.add(event['season'])
                    if event.get('home_team'):
                        teams.add((
                            event['home_team'], 
                            event.get('league', ''), 
                            event.get('sport', ''),
                            event.get('country', '')
                        ))
                    if event.get('away_team'):
                        teams.add((
                            event['away_team'], 
                            event.get('league', ''), 
                            event.get('sport', ''),
                            event.get('country', '')
                        ))
                        
                    processed_events += 1
            
            time.sleep(0.1)  # Rate limiting
            
        except Exception as e:
            print(f"❌ Error on page {page}: {e}")
            continue
    
    print(f"✅ Processed {processed_events} Omenizer events")
    print(f"📊 Found: {len(sports)} sports, {len(leagues)} leagues, {len(countries)} countries, {len(teams)} teams, {len(seasons)} seasons")
    
    return {
        'sports': sorted(list(sports)),
        'leagues': sorted(list(leagues)),
        'countries': sorted(list(countries)), 
        'teams': sorted(list(teams)),
        'seasons': sorted(list(seasons)),
        'total_events': processed_events
    }

def fetch_complete_oddsjam_data():
    """Fetch ALL reference data from OddsJam database"""
    print("🔍 Fetching COMPLETE OddsJam reference data...")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Get ALL sports
        cur.execute("SELECT DISTINCT sport FROM games WHERE sport IS NOT NULL ORDER BY sport;")
        sports = [row[0] for row in cur.fetchall()]
        
        # Get ALL leagues with their sports
        cur.execute("SELECT DISTINCT league, sport FROM games WHERE league IS NOT NULL AND sport IS NOT NULL ORDER BY sport, league;")
        leagues = [(row[0], row[1]) for row in cur.fetchall()]
        
        # Get ALL teams with their leagues/sports (remove limit)
        cur.execute("""
            SELECT DISTINCT home_team, league, sport 
            FROM games 
            WHERE home_team IS NOT NULL AND league IS NOT NULL AND sport IS NOT NULL
            UNION 
            SELECT DISTINCT away_team, league, sport 
            FROM games 
            WHERE away_team IS NOT NULL AND league IS NOT NULL AND sport IS NOT NULL
            ORDER BY sport, league, home_team;
        """)
        teams = [(row[0], row[1], row[2]) for row in cur.fetchall()]
        
        # Get ALL bookmakers
        cur.execute("SELECT DISTINCT sportsbook FROM odds WHERE sportsbook IS NOT NULL ORDER BY sportsbook;")
        bookmakers = [row[0] for row in cur.fetchall()]
        
        # Get total counts
        cur.execute("SELECT COUNT(DISTINCT game_id) FROM games;")
        total_games = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM odds;")
        total_odds = cur.fetchone()[0]
        
        cur.close()
        conn.close()
        
        print(f"✅ OddsJam complete data: {len(sports)} sports, {len(leagues)} leagues, {len(teams)} teams, {len(bookmakers)} bookmakers")
        print(f"📊 From {total_games} games with {total_odds} odds records")
        
        return {
            'sports': sports,
            'leagues': leagues,
            'countries': [],  # OddsJam doesn't have country data
            'teams': teams,
            'bookmakers': bookmakers,
            'total_games': total_games,
            'total_odds': total_odds
        }
        
    except Exception as e:
        print(f"❌ Error fetching OddsJam data: {e}")
        cur.close()
        conn.close()
        return {}

def create_comprehensive_mappings(omenizer_data, oddsjam_data):
    """Create comprehensive mappings with ALL data"""
    print("🔗 Creating comprehensive mappings...")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # 1. SPORTS - exact and fuzzy matching
        omenizer_sports = set(omenizer_data.get('sports', []))
        oddsjam_sports = set(oddsjam_data.get('sports', []))
        
        print(f"\n🏈 SPORTS ANALYSIS:")
        print(f"Omenizer: {sorted(omenizer_sports)}")
        print(f"OddsJam: {sorted(oddsjam_sports)}")
        
        sports_mapped = 0
        for oj_sport in oddsjam_sports:
            # Try exact match (case insensitive)
            exact_match = None
            for om_sport in omenizer_sports:
                if oj_sport.lower() == om_sport.lower():
                    exact_match = om_sport
                    break
            
            if exact_match:
                cur.execute("""
                    INSERT INTO sports_mapping (oddsjam_sport, omenizer_sport, confidence_score)
                    VALUES (%s, %s, 1.0)
                    ON CONFLICT (oddsjam_sport, omenizer_sport) DO UPDATE SET
                    confidence_score = 1.0, last_verified = NOW()
                """, (oj_sport, exact_match))
                sports_mapped += 1
                print(f"  ✅ {oj_sport} → {exact_match}")
        
        # 2. LEAGUES - match with sport context
        print(f"\n🏟️ LEAGUES ANALYSIS:")
        omenizer_leagues = set(omenizer_data.get('leagues', []))
        oddsjam_leagues = set(oddsjam_data.get('leagues', []))
        
        print(f"Omenizer leagues: {len(omenizer_leagues)}")
        print(f"OddsJam leagues: {len(oddsjam_leagues)}")
        
        leagues_mapped = 0
        for oj_league, oj_sport in oddsjam_leagues:
            # Find matching league in same sport
            for om_league, om_sport, om_country in omenizer_leagues:
                if (oj_league.lower() == om_league.lower() and 
                    oj_sport.lower() == om_sport.lower()):
                    
                    cur.execute("""
                        INSERT INTO leagues_mapping (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport, country, confidence_score)
                        VALUES (%s, %s, %s, %s, %s, 1.0)
                        ON CONFLICT (oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport) DO UPDATE SET
                        confidence_score = 1.0, last_verified = NOW()
                    """, (oj_league, oj_sport, om_league, om_sport, om_country))
                    leagues_mapped += 1
                    print(f"  ✅ {oj_league} ({oj_sport}) → {om_league} ({om_sport})")
                    break
        
        # 3. TEAMS - match with league/sport context
        print(f"\n👥 TEAMS ANALYSIS:")
        omenizer_teams = set(omenizer_data.get('teams', []))
        oddsjam_teams = set(oddsjam_data.get('teams', []))
        
        print(f"Omenizer teams: {len(omenizer_teams)}")
        print(f"OddsJam teams: {len(oddsjam_teams)}")
        
        teams_mapped = 0
        for oj_team, oj_league, oj_sport in oddsjam_teams:
            # Find exact team matches in same league/sport
            for om_team, om_league, om_sport, om_country in omenizer_teams:
                if (oj_team.lower() == om_team.lower() and
                    oj_league.lower() == om_league.lower() and
                    oj_sport.lower() == om_sport.lower()):
                    
                    cur.execute("""
                        INSERT INTO teams_mapping (oddsjam_team, omenizer_team, league, sport, country, confidence_score)
                        VALUES (%s, %s, %s, %s, %s, 1.0)
                        ON CONFLICT (oddsjam_team, omenizer_team) DO UPDATE SET
                        confidence_score = 1.0, last_verified = NOW()
                    """, (oj_team, om_team, om_league, om_sport, om_country))
                    teams_mapped += 1
                    print(f"  ✅ {oj_team} → {om_team}")
                    break
        
        conn.commit()
        
        print(f"\n📊 MAPPING SUMMARY:")
        print(f"✅ Sports mapped: {sports_mapped}")
        print(f"✅ Leagues mapped: {leagues_mapped}")  
        print(f"✅ Teams mapped: {teams_mapped}")
        
        cur.close()
        conn.close()
        
        return {
            'sports_mapped': sports_mapped,
            'leagues_mapped': leagues_mapped,
            'teams_mapped': teams_mapped
        }
        
    except Exception as e:
        print(f"❌ Error creating mappings: {e}")
        conn.rollback()
        cur.close()
        conn.close()
        return {}

def save_complete_reference_data(omenizer_data, oddsjam_data, mapping_stats):
    """Save complete reference data"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Complete analysis
    complete_analysis = {
        'timestamp': timestamp,
        'omenizer': {
            'sports_count': len(omenizer_data.get('sports', [])),
            'leagues_count': len(omenizer_data.get('leagues', [])),
            'countries_count': len(omenizer_data.get('countries', [])),
            'teams_count': len(omenizer_data.get('teams', [])),
            'seasons_count': len(omenizer_data.get('seasons', [])),
            'total_events': omenizer_data.get('total_events', 0),
            'sports': omenizer_data.get('sports', []),
            'countries': omenizer_data.get('countries', []),
            'sample_leagues': list(omenizer_data.get('leagues', []))[:50],
            'sample_teams': list(omenizer_data.get('teams', []))[:100]
        },
        'oddsjam': {
            'sports_count': len(oddsjam_data.get('sports', [])),
            'leagues_count': len(oddsjam_data.get('leagues', [])),
            'teams_count': len(oddsjam_data.get('teams', [])),
            'bookmakers_count': len(oddsjam_data.get('bookmakers', [])),
            'total_games': oddsjam_data.get('total_games', 0),
            'total_odds': oddsjam_data.get('total_odds', 0),
            'sports': oddsjam_data.get('sports', []),
            'leagues': oddsjam_data.get('leagues', []),
            'teams': oddsjam_data.get('teams', []),
            'bookmakers': oddsjam_data.get('bookmakers', [])
        },
        'mapping_results': mapping_stats
    }
    
    # Save complete analysis
    with open(f'/Users/joelsalazar/OddsCentral/complete_reference_analysis_{timestamp}.json', 'w') as f:
        json.dump(complete_analysis, f, indent=2, default=str)
    
    print(f"\n💾 Saved complete analysis: complete_reference_analysis_{timestamp}.json")
    return complete_analysis

def main():
    """Main function"""
    print("🚀 Starting COMPLETE reference data collection...")
    
    # Fetch complete data from both systems
    print("\n" + "="*60)
    omenizer_data = fetch_complete_omenizer_data()
    
    print("\n" + "="*60)  
    oddsjam_data = fetch_complete_oddsjam_data()
    
    print("\n" + "="*60)
    # Create comprehensive mappings
    mapping_stats = create_comprehensive_mappings(omenizer_data, oddsjam_data)
    
    # Save complete analysis
    analysis = save_complete_reference_data(omenizer_data, oddsjam_data, mapping_stats)
    
    print("\n" + "="*60)
    print("📊 COMPLETE REFERENCE DATA SUMMARY:")
    print("="*60)
    print(f"Omenizer: {analysis['omenizer']['sports_count']} sports, {analysis['omenizer']['leagues_count']} leagues, {analysis['omenizer']['countries_count']} countries, {analysis['omenizer']['teams_count']} teams")
    print(f"OddsJam:  {analysis['oddsjam']['sports_count']} sports, {analysis['oddsjam']['leagues_count']} leagues, {analysis['oddsjam']['teams_count']} teams, {analysis['oddsjam']['bookmakers_count']} bookmakers")
    print(f"\nMapping Success: {mapping_stats.get('sports_mapped', 0)} sports, {mapping_stats.get('leagues_mapped', 0)} leagues, {mapping_stats.get('teams_mapped', 0)} teams")
    
    print("\n✅ COMPLETE reference data collection finished!")

if __name__ == "__main__":
    main()