#!/usr/bin/env python3
"""
Fetch complete reference datasets from both OddsJam and Omenizer APIs
Purpose: Build comprehensive mapping tables for nomenclature translation
"""
import requests
import psycopg2
import json
from datetime import datetime
import time
from collections import defaultdict

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"
ODDSJAM_API_BASE = "https://api.oddsjam.com"  # We'll need to find actual endpoints

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

def fetch_omenizer_reference_data():
    """Fetch all reference data from Omenizer API"""
    headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
    
    print("🔍 Fetching Omenizer reference data...")
    
    # 1. Get all sports from calendar events
    sports = set()
    leagues = set()
    countries = set()
    teams = set()
    
    # Fetch large sample of events to extract all nomenclature
    page = 1
    total_processed = 0
    
    while page <= 50:  # Limit to prevent infinite loop
        try:
            print(f"📊 Fetching Omenizer page {page}...")
            response = requests.get(
                f"{OMENIZER_API_URL}/calendar/events/?page={page}&page_size=100",
                headers=headers
            )
            
            if response.status_code != 200:
                print(f"❌ Error fetching page {page}: {response.status_code}")
                break
                
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
                        leagues.add((event['league'], event.get('sport', '')))
                    if event.get('country'):
                        countries.add(event['country'])
                    if event.get('home_team'):
                        teams.add((event['home_team'], event.get('league', ''), event.get('sport', '')))
                    if event.get('away_team'):
                        teams.add((event['away_team'], event.get('league', ''), event.get('sport', '')))
                        
                    total_processed += 1
            
            page += 1
            time.sleep(0.1)  # Rate limiting
            
        except Exception as e:
            print(f"❌ Error on page {page}: {e}")
            break
    
    print(f"✅ Processed {total_processed} Omenizer events")
    print(f"📊 Found: {len(sports)} sports, {len(leagues)} leagues, {len(countries)} countries, {len(teams)} teams")
    
    return {
        'sports': list(sports),
        'leagues': list(leagues),
        'countries': list(countries), 
        'teams': list(teams)
    }

def fetch_oddsjam_reference_data():
    """Fetch all reference data from OddsJam (from our database)"""
    print("🔍 Fetching OddsJam reference data from database...")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Get all sports
        cur.execute("SELECT DISTINCT sport FROM games WHERE sport IS NOT NULL ORDER BY sport;")
        sports = [row[0] for row in cur.fetchall()]
        
        # Get all leagues with their sports
        cur.execute("SELECT DISTINCT league, sport FROM games WHERE league IS NOT NULL AND sport IS NOT NULL ORDER BY sport, league;")
        leagues = [(row[0], row[1]) for row in cur.fetchall()]
        
        # Get all teams with their leagues/sports
        cur.execute("""
            SELECT DISTINCT home_team, league, sport 
            FROM games 
            WHERE home_team IS NOT NULL 
            UNION 
            SELECT DISTINCT away_team, league, sport 
            FROM games 
            WHERE away_team IS NOT NULL 
            ORDER BY sport, league, home_team 
            LIMIT 1000;
        """)
        teams = [(row[0], row[1] or '', row[2] or '') for row in cur.fetchall()]
        
        # Get all bookmakers
        cur.execute("SELECT DISTINCT sportsbook FROM odds WHERE sportsbook IS NOT NULL ORDER BY sportsbook;")
        bookmakers = [row[0] for row in cur.fetchall()]
        
        # OddsJam doesn't seem to have country data in our current schema
        countries = []
        
        cur.close()
        conn.close()
        
        print(f"✅ OddsJam data: {len(sports)} sports, {len(leagues)} leagues, {len(teams)} teams, {len(bookmakers)} bookmakers")
        
        return {
            'sports': sports,
            'leagues': leagues,
            'countries': countries,
            'teams': teams,
            'bookmakers': bookmakers
        }
        
    except Exception as e:
        print(f"❌ Error fetching OddsJam data: {e}")
        cur.close()
        conn.close()
        return {}

def save_reference_data(omenizer_data, oddsjam_data):
    """Save reference data to files for analysis"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Save Omenizer data
    with open(f'/Users/joelsalazar/OddsCentral/omenizer_reference_{timestamp}.json', 'w') as f:
        json.dump(omenizer_data, f, indent=2, default=str)
    
    # Save OddsJam data
    with open(f'/Users/joelsalazar/OddsCentral/oddsjam_reference_{timestamp}.json', 'w') as f:
        json.dump(oddsjam_data, f, indent=2, default=str)
    
    print(f"💾 Saved reference data with timestamp {timestamp}")
    
    # Create analysis summary
    analysis = {
        'omenizer': {
            'sports_count': len(omenizer_data.get('sports', [])),
            'leagues_count': len(omenizer_data.get('leagues', [])),
            'countries_count': len(omenizer_data.get('countries', [])),
            'teams_count': len(omenizer_data.get('teams', [])),
            'sports': omenizer_data.get('sports', []),
            'sample_leagues': omenizer_data.get('leagues', [])[:20],
            'countries': omenizer_data.get('countries', [])
        },
        'oddsjam': {
            'sports_count': len(oddsjam_data.get('sports', [])),
            'leagues_count': len(oddsjam_data.get('leagues', [])),
            'teams_count': len(oddsjam_data.get('teams', [])),
            'bookmakers_count': len(oddsjam_data.get('bookmakers', [])),
            'sports': oddsjam_data.get('sports', []),
            'leagues': oddsjam_data.get('leagues', []),
            'sample_teams': oddsjam_data.get('teams', [])[:20],
            'bookmakers': oddsjam_data.get('bookmakers', [])
        }
    }
    
    with open(f'/Users/joelsalazar/OddsCentral/reference_analysis_{timestamp}.json', 'w') as f:
        json.dump(analysis, f, indent=2, default=str)
    
    return analysis

def create_initial_mappings(omenizer_data, oddsjam_data):
    """Create initial automatic mappings where possible"""
    print("🔗 Creating initial automatic mappings...")
    
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Sports mappings with fuzzy matching
        omenizer_sports = set(omenizer_data.get('sports', []))
        oddsjam_sports = set(oddsjam_data.get('sports', []))
        
        print(f"🏈 Omenizer sports: {sorted(omenizer_sports)}")
        print(f"🏈 OddsJam sports: {sorted(oddsjam_sports)}")
        
        # Simple exact matches (case-insensitive)
        auto_matches = 0
        for oj_sport in oddsjam_sports:
            for om_sport in omenizer_sports:
                if oj_sport.lower() == om_sport.lower():
                    cur.execute("""
                        INSERT INTO sports_mapping (oddsjam_sport, omenizer_sport, confidence_score)
                        VALUES (%s, %s, 1.0)
                        ON CONFLICT (oddsjam_sport, omenizer_sport) DO NOTHING
                    """, (oj_sport, om_sport))
                    auto_matches += 1
                    print(f"✅ Matched sport: {oj_sport} → {om_sport}")
        
        conn.commit()
        print(f"📊 Created {auto_matches} automatic sport mappings")
        
        # TODO: Add league and team matching logic
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error creating mappings: {e}")
        cur.close()
        conn.close()

def main():
    """Main function"""
    print("🚀 Starting reference data collection...")
    
    # Fetch data from both systems
    omenizer_data = fetch_omenizer_reference_data()
    oddsjam_data = fetch_oddsjam_reference_data()
    
    # Save data for analysis
    analysis = save_reference_data(omenizer_data, oddsjam_data)
    
    # Print summary
    print("\n📊 REFERENCE DATA SUMMARY:")
    print("=" * 50)
    print(f"Omenizer: {analysis['omenizer']['sports_count']} sports, {analysis['omenizer']['leagues_count']} leagues, {analysis['omenizer']['countries_count']} countries")
    print(f"OddsJam:  {analysis['oddsjam']['sports_count']} sports, {analysis['oddsjam']['leagues_count']} leagues, {analysis['oddsjam']['bookmakers_count']} bookmakers")
    
    # Create initial mappings
    create_initial_mappings(omenizer_data, oddsjam_data)
    
    print("\n✅ Reference data collection complete!")
    print("📁 Check generated JSON files for detailed analysis")

if __name__ == "__main__":
    main()