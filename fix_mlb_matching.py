#!/usr/bin/env python3
"""
Fix MLB Team Matching
Purpose: Properly fetch MLB teams from Omenizer and create mappings
"""
import requests
import psycopg2
from fuzzywuzzy import fuzz
import time

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

def get_db_connection():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, database=DB_NAME,
        user=DB_USER, password=DB_PASSWORD
    )

def fetch_mlb_teams_from_omenizer():
    """Fetch MLB teams specifically from Omenizer"""
    headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
    
    print("🔍 Searching for MLB teams in Omenizer...")
    
    mlb_teams = set()
    page = 1
    
    # Search through more pages to find Baseball teams
    while page <= 200:  # Increase search range
        try:
            print(f"📊 Checking page {page}...")
            response = requests.get(
                f"{OMENIZER_API_URL}/calendar/events/?page={page}&page_size=100",
                headers=headers,
                timeout=30
            )
            
            if response.status_code != 200:
                print(f"❌ Error on page {page}: {response.status_code}")
                break
                
            data = response.json()
            
            if not data.get('data', {}).get('items'):
                print(f"ℹ️ No more data at page {page}")
                break
                
            # Look for Baseball events
            for date_group in data['data']['items']:
                for event in date_group.get('events', []):
                    if event.get('sport') == 'Baseball':
                        if event.get('home_team'):
                            mlb_teams.add((event['home_team'], event.get('league', '')))
                        if event.get('away_team'):
                            mlb_teams.add((event['away_team'], event.get('league', '')))
                        
                        # Print first few Baseball teams found
                        if len(mlb_teams) < 5:
                            print(f"  Found: {event.get('home_team')} vs {event.get('away_team')} ({event.get('league')})")
            
            # If we found MLB teams, we can search more targeted
            if len(mlb_teams) > 20:
                print(f"✅ Found {len(mlb_teams)} Baseball teams so far")
                
            page += 1
            time.sleep(0.1)  # Rate limiting
            
        except Exception as e:
            print(f"❌ Error on page {page}: {e}")
            break
    
    print(f"✅ Found total {len(mlb_teams)} Baseball teams in Omenizer")
    return mlb_teams

def get_oddsjam_mlb_teams():
    """Get OddsJam MLB teams that need matching"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Get unique MLB teams from OddsJam
        cur.execute("""
            SELECT DISTINCT home_team FROM games 
            WHERE sport IN ('BASEBALL', 'MLB') AND home_team IS NOT NULL
            UNION
            SELECT DISTINCT away_team FROM games 
            WHERE sport IN ('BASEBALL', 'MLB') AND away_team IS NOT NULL
            ORDER BY home_team
        """)
        
        oddsjam_teams = [row[0] for row in cur.fetchall()]
        print(f"📊 Found {len(oddsjam_teams)} MLB teams in OddsJam")
        
        # Get currently unmatched teams
        cur.execute("""
            SELECT DISTINCT item_value 
            FROM unmatched_items 
            WHERE item_type = 'team' 
            AND item_value LIKE '%MLB%' OR item_value LIKE '%BASEBALL%'
        """)
        
        unmatched = [row[0].split('|')[0] for row in cur.fetchall()]
        print(f"⚠️ {len(unmatched)} teams currently unmatched")
        
        cur.close()
        conn.close()
        
        return oddsjam_teams, unmatched
        
    except Exception as e:
        print(f"❌ Error fetching OddsJam teams: {e}")
        cur.close()
        conn.close()
        return [], []

def create_mlb_team_mappings(omenizer_teams, oddsjam_teams):
    """Create team mappings using fuzzy matching"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    mappings_created = 0
    
    print("\n🔄 Creating team mappings...")
    
    # Convert Omenizer teams to just names for matching
    omenizer_names = [team[0] for team in omenizer_teams]
    
    for oj_team in oddsjam_teams:
        best_match = None
        best_score = 0
        best_league = ''
        
        # Find best match
        for om_team, om_league in omenizer_teams:
            score = fuzz.ratio(oj_team.lower(), om_team.lower())
            
            if score > best_score:
                best_score = score
                best_match = om_team
                best_league = om_league
        
        # Accept matches above 85% similarity
        if best_match and best_score >= 85:
            try:
                cur.execute("""
                    INSERT INTO teams_mapping (
                        oddsjam_team, omenizer_team, league, sport, confidence_score
                    ) VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (oddsjam_team, omenizer_team) DO UPDATE SET
                    confidence_score = %s, last_verified = NOW()
                """, (
                    oj_team, best_match, best_league, 'Baseball', best_score/100,
                    best_score/100
                ))
                mappings_created += 1
                print(f"  ✅ {oj_team} → {best_match} (score: {best_score}%)")
                
            except Exception as e:
                print(f"  ❌ Error mapping {oj_team}: {e}")
        else:
            print(f"  ⚠️ No good match for {oj_team} (best: {best_match} at {best_score}%)")
    
    conn.commit()
    cur.close()
    conn.close()
    
    print(f"\n✅ Created {mappings_created} team mappings")
    return mappings_created

def update_flagged_events():
    """Re-process flagged events with new mappings"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    try:
        # Clear resolution status for pending MLB events
        cur.execute("""
            UPDATE flagged_events 
            SET resolution_status = 'pending', updated_at = NOW()
            WHERE sport IN ('BASEBALL', 'MLB') 
            AND resolution_status = 'pending'
        """)
        
        updated = cur.rowcount
        conn.commit()
        
        print(f"🔄 Reset {updated} flagged MLB events for re-processing")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error updating flagged events: {e}")
        conn.rollback()
        cur.close()
        conn.close()

def main():
    print("🚀 Fixing MLB Team Matching\n")
    
    # 1. Fetch MLB teams from Omenizer
    omenizer_teams = fetch_mlb_teams_from_omenizer()
    
    if not omenizer_teams:
        print("❌ No Baseball teams found in Omenizer. May need to search more pages.")
        return
    
    # 2. Get OddsJam MLB teams
    oddsjam_teams, unmatched = get_oddsjam_mlb_teams()
    
    # 3. Create mappings
    if oddsjam_teams and omenizer_teams:
        mappings = create_mlb_team_mappings(omenizer_teams, oddsjam_teams)
        
        # 4. Update flagged events
        update_flagged_events()
        
        print("\n✅ MLB matching fix complete!")
        print("🔧 Now run: python enhanced_matching_engine.py")
        print("   to re-process games with the new mappings")
    else:
        print("❌ Missing data for mapping creation")

if __name__ == "__main__":
    main()