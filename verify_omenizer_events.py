#!/usr/bin/env python3
"""
Verify Omenizer Events
Purpose: Check if "ready for creation" events already exist in Omenizer
"""
import psycopg2
import requests
from datetime import datetime, timedelta
import time

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"

class OmenizerEventVerifier:
    def __init__(self):
        self.conn = psycopg2.connect(
            host=DB_HOST, port=DB_PORT, database=DB_NAME,
            user=DB_USER, password=DB_PASSWORD
        )
        self.headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
        
    def get_ready_events(self, limit=None):
        """Get events marked as ready for creation"""
        cur = self.conn.cursor()
        
        query = """
            SELECT oddsjam_game_id, translated_home_team, translated_away_team, 
                   translated_sport, translated_league, event_datetime
            FROM flagged_events 
            WHERE resolution_status = 'ready_for_creation'
            AND event_datetime >= NOW()
            ORDER BY event_datetime ASC
        """
        
        if limit:
            query += f" LIMIT {limit}"
            
        cur.execute(query)
        events = cur.fetchall()
        cur.close()
        
        return events
    
    def fetch_omenizer_events(self, start_date=None, end_date=None):
        """Fetch events from Omenizer API"""
        print("🔍 Fetching events from Omenizer...")
        
        omenizer_events = []
        page = 1
        max_pages = 50  # Reasonable limit
        
        while page <= max_pages:
            try:
                print(f"  📄 Fetching page {page}...")
                
                response = requests.get(
                    f"{OMENIZER_API_URL}/calendar/events/?page={page}&page_size=100",
                    headers=self.headers,
                    timeout=30
                )
                
                if response.status_code != 200:
                    print(f"❌ API error on page {page}: {response.status_code}")
                    if response.status_code == 404:
                        print("API endpoint not found or no more pages")
                    break
                    
                data = response.json()
                
                if not data.get('data', {}).get('items'):
                    print(f"ℹ️ No more data at page {page}")
                    break
                
                # Extract events from response
                for date_group in data['data']['items']:
                    for event in date_group.get('events', []):
                        event_info = {
                            'home_team': event.get('home_team'),
                            'away_team': event.get('away_team'),
                            'sport': event.get('sport'),
                            'league': event.get('league'),
                            'event_time': event.get('start_time') or event.get('event_time'),
                            'id': event.get('id')
                        }
                        omenizer_events.append(event_info)
                
                page += 1
                time.sleep(0.1)  # Rate limiting
                
            except Exception as e:
                print(f"❌ Error fetching page {page}: {e}")
                break
        
        print(f"✅ Found {len(omenizer_events):,} events in Omenizer")
        return omenizer_events
    
    def match_events(self, ready_events, omenizer_events):
        """Match ready events against existing Omenizer events"""
        print(f"\n🔄 Matching {len(ready_events):,} ready events against {len(omenizer_events):,} Omenizer events...")
        
        # Create lookup for faster matching
        omenizer_lookup = set()
        for event in omenizer_events:
            if event['home_team'] and event['away_team'] and event['sport']:
                key = (
                    event['home_team'].lower().strip(),
                    event['away_team'].lower().strip(), 
                    event['sport'].lower().strip()
                )
                omenizer_lookup.add(key)
        
        matches_found = 0
        new_events = []
        
        for oddsjam_id, home_team, away_team, sport, league, event_datetime in ready_events:
            # Create matching key
            key = (
                home_team.lower().strip(),
                away_team.lower().strip(),
                sport.lower().strip()
            )
            
            if key in omenizer_lookup:
                matches_found += 1
                print(f"  ✅ Found: {home_team} vs {away_team} ({sport})")
            else:
                new_events.append((oddsjam_id, home_team, away_team, sport, league, event_datetime))
        
        return matches_found, new_events
    
    def update_event_status(self, oddsjam_id, status, reason):
        """Update event status in database"""
        cur = self.conn.cursor()
        
        try:
            cur.execute("""
                UPDATE flagged_events 
                SET resolution_status = %s,
                    flag_reason = %s,
                    updated_at = NOW()
                WHERE oddsjam_game_id = %s
            """, (status, reason, oddsjam_id))
            
            self.conn.commit()
        except Exception as e:
            print(f"❌ Error updating status for {oddsjam_id}: {e}")
            self.conn.rollback()
        finally:
            cur.close()
    
    def verify_all_events(self, limit=None):
        """Main verification process"""
        # Get ready events
        ready_events = self.get_ready_events(limit)
        
        if not ready_events:
            print("✅ No events marked as ready for creation")
            return {'ready': 0, 'existing': 0, 'truly_new': 0}
        
        print(f"📊 Found {len(ready_events):,} events marked as ready for creation")
        
        # Fetch Omenizer events
        omenizer_events = self.fetch_omenizer_events()
        
        # Match events
        existing_count, new_events = self.match_events(ready_events, omenizer_events)
        
        # Update status for existing events
        print(f"\n🔄 Updating status for {existing_count} existing events...")
        for oddsjam_id, home_team, away_team, sport, league, event_datetime in ready_events:
            key = (home_team.lower().strip(), away_team.lower().strip(), sport.lower().strip())
            
            # Check if this event was found in Omenizer
            found_in_omenizer = any(
                (event['home_team'].lower().strip(), event['away_team'].lower().strip(), event['sport'].lower().strip()) == key
                for event in omenizer_events
                if event['home_team'] and event['away_team'] and event['sport']
            )
            
            if found_in_omenizer:
                self.update_event_status(oddsjam_id, 'already_exists', 'Event already exists in Omenizer')
        
        # Report results
        print(f"\n📊 VERIFICATION RESULTS")
        print("=" * 40)
        print(f"Total Ready Events:    {len(ready_events):,}")
        print(f"Already in Omenizer:   {existing_count:,}")
        print(f"Truly New Events:      {len(new_events):,}")
        
        if new_events:
            print(f"\n🆕 NEW EVENTS TO CREATE:")
            for i, (oddsjam_id, home, away, sport, league, event_time) in enumerate(new_events[:10]):
                print(f"  {i+1}. {home} vs {away} ({sport} - {league}) at {event_time}")
            if len(new_events) > 10:
                print(f"  ... and {len(new_events) - 10} more")
        
        return {
            'ready': len(ready_events),
            'existing': existing_count, 
            'truly_new': len(new_events)
        }
    
    def close(self):
        self.conn.close()

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Verify events against Omenizer')
    parser.add_argument('--limit', type=int, help='Limit number of events to check')
    
    args = parser.parse_args()
    
    verifier = OmenizerEventVerifier()
    
    try:
        results = verifier.verify_all_events(limit=args.limit)
        
        print(f"\n✅ Verification complete!")
        if results['truly_new'] > 0:
            print(f"🎯 {results['truly_new']:,} events are truly ready for creation")
        else:
            print("💡 All events already exist in Omenizer")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        verifier.close()

if __name__ == "__main__":
    main()