#!/usr/bin/env python3
"""
Simple API server to provide matching status data to the sportsbook interface
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import psycopg2
import json

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests

# Database configuration
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'postgres'
}

def get_db_connection():
    return psycopg2.connect(**DB_CONFIG)

@app.route('/api/matching-status', methods=['POST'])
def get_matching_status():
    """Get matching status for multiple game IDs"""
    try:
        data = request.json
        game_ids = data.get('game_ids', [])
        
        if not game_ids:
            return jsonify({'error': 'No game_ids provided'}), 400
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        matching_data = {}
        
        for game_id in game_ids:
            # Check flagged_events table first
            cur.execute("""
                SELECT resolution_status, translated_home_team, translated_away_team, 
                       translated_sport, translated_league, missing_elements, flag_reason
                FROM flagged_events 
                WHERE oddsjam_game_id = %s
            """, (game_id,))
            
            result = cur.fetchone()
            
            if result:
                status, t_home, t_away, t_sport, t_league, missing, reason = result
                
                translated_teams = None
                if t_home and t_away:
                    translated_teams = f"{t_home} vs {t_away}"
                
                matching_data[game_id] = {
                    'status': status,
                    'omenizer_event_id': None,  # We don't have this yet
                    'translated_teams': translated_teams,
                    'translated_sport': t_sport,
                    'translated_league': t_league,
                    'missing_elements': missing,
                    'message': reason or get_status_message(status),
                    'source': 'flagged_events'
                }
            else:
                # Not in flagged events - might be new or not processed
                matching_data[game_id] = {
                    'status': 'not_processed',
                    'omenizer_event_id': None,
                    'translated_teams': None,
                    'translated_sport': None,
                    'translated_league': None,
                    'missing_elements': None,
                    'message': 'Not yet processed by matching engine',
                    'source': 'new_game'
                }
        
        cur.close()
        conn.close()
        
        return jsonify({'matching_data': matching_data})
        
    except Exception as e:
        print(f"Error getting matching status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/omenizer-events', methods=['POST'])
def check_omenizer_events():
    """Check if events exist in Omenizer using normalized team names"""
    try:
        data = request.json
        games_to_check = data.get('games', [])
        
        # Get games that are ready for creation (have complete translations)
        conn = get_db_connection()
        cur = conn.cursor()
        
        omenizer_data = {}
        
        for game_check in games_to_check:
            game_id = game_check.get('game_id')
            
            # Get the translated data for this game
            cur.execute("""
                SELECT translated_home_team, translated_away_team, translated_sport, 
                       translated_league, event_datetime, resolution_status
                FROM flagged_events 
                WHERE oddsjam_game_id = %s AND resolution_status = 'ready_for_creation'
            """, (game_id,))
            
            result = cur.fetchone()
            
            if result:
                t_home, t_away, t_sport, t_league, event_datetime, status = result
                
                # Query Omenizer API with the normalized parameters
                omenizer_result = query_omenizer_api(t_home, t_away, t_sport, event_datetime)
                
                omenizer_data[game_id] = {
                    'exists': omenizer_result['exists'],
                    'event_id': omenizer_result.get('event_id'),
                    'omenizer_teams': f"{t_home} vs {t_away}" if t_home and t_away else None,
                    'checked_params': {
                        'home_team': t_home,
                        'away_team': t_away,
                        'sport': t_sport,
                        'league': t_league
                    },
                    'checked_at': omenizer_result.get('checked_at')
                }
            else:
                # Game not ready for Omenizer check
                omenizer_data[game_id] = {
                    'exists': False,
                    'event_id': None,
                    'omenizer_teams': None,
                    'message': 'Not ready for Omenizer check (incomplete translation)',
                    'checked_at': None
                }
        
        cur.close()
        conn.close()
        
        return jsonify({'omenizer_data': omenizer_data})
        
    except Exception as e:
        print(f"Error checking Omenizer events: {e}")
        return jsonify({'error': str(e)}), 500

def query_omenizer_api(home_team, away_team, sport, event_datetime):
    """Query Omenizer API to check if event exists"""
    try:
        import requests
        from datetime import datetime, timedelta
        
        OMENIZER_API_URL = "https://arb-general-api-1.onrender.com"
        OMENIZER_TOKEN = "8044652f46c0ed50756a3a22d72f0c7b582b8b"
        
        headers = {'Authorization': f'Bearer {OMENIZER_TOKEN}'}
        
        # Search in a reasonable date range around the event
        event_date = datetime.fromisoformat(str(event_datetime).replace('Z', '+00:00'))
        search_start = event_date - timedelta(hours=12)
        search_end = event_date + timedelta(hours=12)
        
        # Query recent events (last few pages should cover today/tomorrow)
        for page in range(1, 5):  # Check first 4 pages
            try:
                response = requests.get(
                    f"{OMENIZER_API_URL}/calendar/events/?page={page}&page_size=100",
                    headers=headers,
                    timeout=10
                )
                
                if response.status_code != 200:
                    continue
                    
                data = response.json()
                
                if not data.get('data', {}).get('items'):
                    break
                
                # Search through events
                for date_group in data['data']['items']:
                    for event in date_group.get('events', []):
                        # Match by sport and teams
                        if (event.get('sport') == sport and
                            event.get('home_team') == home_team and  
                            event.get('away_team') == away_team):
                            
                            return {
                                'exists': True,
                                'event_id': event.get('id'),
                                'checked_at': datetime.now().isoformat()
                            }
                            
            except Exception as e:
                print(f"Error querying Omenizer page {page}: {e}")
                continue
        
        # Not found in Omenizer
        return {
            'exists': False,
            'event_id': None,
            'checked_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        print(f"Error querying Omenizer API: {e}")
        return {
            'exists': False,
            'event_id': None,
            'error': str(e),
            'checked_at': datetime.now().isoformat()
        }

@app.route('/api/run-matching', methods=['POST'])
def run_matching_engine():
    """Trigger matching engine for new games"""
    try:
        data = request.json
        limit = data.get('limit', 100)
        
        # Import and run our matching engine
        import sys
        import os
        sys.path.append('/Users/joelsalazar/OddsCentral')
        
        from matching_engine import MatchingEngine
        
        engine = MatchingEngine()
        stats = engine.run_matching(limit=limit, verbose=False)
        engine.close()
        
        return jsonify({
            'success': True,
            'stats': stats,
            'message': f"Processed {stats['total']} games, {stats['ready']} ready for creation"
        })
        
    except Exception as e:
        print(f"Error running matching engine: {e}")
        return jsonify({'error': str(e)}), 500

def get_status_message(status):
    """Get user-friendly message for status"""
    messages = {
        'ready_for_creation': 'Complete translation - ready to create in Omenizer',
        'pending': 'Partial translation - requires manual review',
        'unmatched': 'Unable to translate - manual intervention needed',
        'already_exists': 'Event already exists in Omenizer'
    }
    return messages.get(status, f'Status: {status}')

@app.route('/api/health')
def health_check():
    """Health check endpoint"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute('SELECT 1')
        cur.close()
        conn.close()
        return jsonify({'status': 'healthy', 'database': 'connected'})
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

if __name__ == '__main__':
    print("🚀 Starting Matching API Server")
    print("📊 Endpoints:")
    print("  POST /api/matching-status - Get matching status for game IDs")
    print("  POST /api/omenizer-events - Check Omenizer for existing events") 
    print("  POST /api/run-matching - Trigger matching engine")
    print("  GET  /api/health - Health check")
    print("\n🔗 Server running on http://localhost:5555")
    
    app.run(host='0.0.0.0', port=5555, debug=True)