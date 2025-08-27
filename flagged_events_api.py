#!/usr/bin/env python3
"""
Flagged Events API Server
Purpose: Serve flagged events data to the web interface
"""
from flask import Flask, jsonify, render_template_string, send_from_directory
import psycopg2
import json
from datetime import datetime
import os

# Configuration
DB_HOST = "localhost"
DB_PORT = 5433
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASSWORD = "postgres"

app = Flask(__name__)

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )

@app.route('/')
def index():
    """Serve the flagged events viewer"""
    return send_from_directory('.', 'flagged_events_viewer.html')

@app.route('/api/flagged-events')
def get_flagged_events():
    """Get all flagged events data"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get flagged events
        cur.execute("""
            SELECT oddsjam_game_id, home_team, away_team, sport, league,
                   event_datetime, flag_reason, resolution_status,
                   translated_sport, translated_league, translated_home_team, translated_away_team,
                   missing_elements, created_at, updated_at
            FROM flagged_events 
            ORDER BY created_at DESC
        """)
        
        events = []
        for row in cur.fetchall():
            events.append({
                'oddsjam_game_id': row[0],
                'home_team': row[1],
                'away_team': row[2],
                'sport': row[3],
                'league': row[4],
                'event_datetime': row[5].isoformat() if row[5] else None,
                'flag_reason': row[6],
                'resolution_status': row[7],
                'translated_sport': row[8],
                'translated_league': row[9],
                'translated_home_team': row[10],
                'translated_away_team': row[11],
                'missing_elements': row[12] if row[12] else [],
                'created_at': row[13].isoformat() if row[13] else None,
                'updated_at': row[14].isoformat() if row[14] else None
            })
        
        # Get statistics
        cur.execute("""
            SELECT resolution_status, COUNT(*) 
            FROM flagged_events 
            GROUP BY resolution_status
        """)
        status_counts = dict(cur.fetchall())
        
        # Get missing elements analysis
        cur.execute("""
            SELECT unnest(missing_elements) as element, COUNT(*) 
            FROM flagged_events 
            WHERE missing_elements IS NOT NULL
            GROUP BY element 
            ORDER BY COUNT(*) DESC
            LIMIT 20
        """)
        missing_elements = cur.fetchall()
        
        # Get sports distribution
        cur.execute("""
            SELECT sport, COUNT(*) 
            FROM flagged_events 
            GROUP BY sport 
            ORDER BY COUNT(*) DESC
        """)
        sports_dist = cur.fetchall()
        
        cur.close()
        conn.close()
        
        # Calculate stats
        total_flagged = len(events)
        pending_integration = status_counts.get('pending', 0)
        ready_creation = status_counts.get('ready_for_creation', 0)
        most_common_missing = missing_elements[0][0] if missing_elements else 'None'
        
        return jsonify({
            'status': 'success',
            'stats': {
                'total_flagged': total_flagged,
                'pending_integration': pending_integration,
                'ready_creation': ready_creation,
                'most_common_missing': most_common_missing
            },
            'missing_elements': missing_elements,
            'sports_distribution': sports_dist,
            'events': events
        })
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/flagged-events/<game_id>/resolve', methods=['POST'])
def resolve_flagged_event(game_id):
    """Mark a flagged event as resolved"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            UPDATE flagged_events 
            SET resolution_status = 'resolved', updated_at = NOW()
            WHERE oddsjam_game_id = %s
        """, (game_id,))
        
        if cur.rowcount > 0:
            conn.commit()
            result = {'status': 'success', 'message': f'Event {game_id} marked as resolved'}
        else:
            result = {'status': 'error', 'message': f'Event {game_id} not found'}
        
        cur.close()
        conn.close()
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/run-matching-engine', methods=['POST'])
def run_matching_engine():
    """Trigger matching engine run"""
    try:
        import subprocess
        result = subprocess.run([
            'python', '/Users/joelsalazar/OddsCentral/enhanced_matching_engine.py'
        ], capture_output=True, text=True, timeout=60)
        
        if result.returncode == 0:
            return jsonify({
                'status': 'success',
                'message': 'Matching engine completed successfully',
                'output': result.stdout
            })
        else:
            return jsonify({
                'status': 'error', 
                'message': 'Matching engine failed',
                'error': result.stderr
            }), 500
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/api/export-csv')
def export_flagged_events_csv():
    """Export flagged events as CSV"""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT oddsjam_game_id, home_team, away_team, sport, league,
                   resolution_status, flag_reason, 
                   array_to_string(missing_elements, '; ') as missing_elements,
                   translated_sport, translated_league,
                   created_at
            FROM flagged_events 
            ORDER BY created_at DESC
        """)
        
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        # Create CSV content
        csv_content = "Game ID,Home Team,Away Team,Sport,League,Status,Flag Reason,Missing Elements,Translated Sport,Translated League,Created At\n"
        
        for row in rows:
            # Escape commas and quotes in CSV
            escaped_row = []
            for field in row:
                if field is None:
                    escaped_row.append('')
                else:
                    field_str = str(field)
                    if ',' in field_str or '"' in field_str:
                        field_str = '"' + field_str.replace('"', '""') + '"'
                    escaped_row.append(field_str)
            csv_content += ','.join(escaped_row) + '\n'
        
        return csv_content, 200, {
            'Content-Type': 'text/csv',
            'Content-Disposition': f'attachment; filename=flagged_events_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv'
        }
        
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    print("🚀 Starting Flagged Events API Server...")
    print("📊 Access the interface at: http://localhost:5000")
    print("🔧 API endpoints:")
    print("   GET  /api/flagged-events - Get all flagged events")
    print("   POST /api/flagged-events/<id>/resolve - Mark event as resolved") 
    print("   POST /api/run-matching-engine - Run matching engine")
    print("   GET  /api/export-csv - Export flagged events as CSV")
    app.run(debug=True, host='0.0.0.0', port=5000)