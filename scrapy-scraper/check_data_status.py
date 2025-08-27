#!/usr/bin/env python3
"""
Data Status Checker - Check current data age and perform manual cleanup
"""
import psycopg2
import logging
import argparse
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('DataStatusChecker')

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'postgres'
}

def get_db_connection():
    """Get database connection"""
    return psycopg2.connect(**DB_CONFIG)

def check_data_status():
    """Check current data status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Use the data_age_monitor view
        cursor.execute("SELECT * FROM data_age_monitor")
        results = cursor.fetchall()
        
        print("\n" + "="*80)
        print("DATA AGE STATUS REPORT")
        print("="*80)
        
        for row in results:
            table_name, total, recent, old, oldest, newest = row
            print(f"\n📊 {table_name.upper()} TABLE:")
            print(f"   Total records: {total:,}")
            print(f"   Recent (< 1 hour): {recent:,}")
            print(f"   Old (> 1 hour): {old:,}")
            
            if oldest:
                age = datetime.now(oldest.tzinfo) - oldest
                print(f"   Oldest record: {oldest.strftime('%Y-%m-%d %H:%M:%S')} (Age: {age})")
            else:
                print(f"   Oldest record: None")
                
            if newest:
                age = datetime.now(newest.tzinfo) - newest
                print(f"   Newest record: {newest.strftime('%Y-%m-%d %H:%M:%S')} (Age: {age})")
            else:
                print(f"   Newest record: None")
            
            # Calculate cleanup potential
            if old > 0:
                print(f"   ⚠️  {old:,} records eligible for cleanup")
            else:
                print(f"   ✅ No old records to cleanup")
        
        cursor.close()
        conn.close()
        
        print("="*80)
        
        return results
        
    except Exception as e:
        logger.error(f"Error checking data status: {e}")
        return []

def check_cleanup_history():
    """Check recent cleanup history"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT executed_at, games_deleted, odds_deleted, total_deleted, 
                   execution_time_ms, error_message
            FROM cleanup_log 
            ORDER BY executed_at DESC 
            LIMIT 10
        """)
        
        results = cursor.fetchall()
        
        if results:
            print("\n" + "="*80)
            print("RECENT CLEANUP HISTORY")
            print("="*80)
            
            for row in results:
                executed_at, games_del, odds_del, total_del, exec_time, error = row
                
                if error:
                    print(f"❌ {executed_at.strftime('%Y-%m-%d %H:%M:%S')} - FAILED: {error}")
                else:
                    print(f"✅ {executed_at.strftime('%Y-%m-%d %H:%M:%S')} - "
                          f"Deleted {total_del:,} records ({games_del:,} games, {odds_del:,} odds) "
                          f"in {exec_time:.1f}ms")
        else:
            print("\n📝 No cleanup history found")
        
        cursor.close()
        conn.close()
        
        return results
        
    except Exception as e:
        logger.error(f"Error checking cleanup history: {e}")
        return []

def manual_cleanup():
    """Run manual cleanup"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        print("\n🧹 Running manual cleanup...")
        
        # Call the scheduled cleanup function
        cursor.execute("SELECT * FROM scheduled_cleanup()")
        result = cursor.fetchone()[0]
        
        conn.commit()
        cursor.close()
        conn.close()
        
        if result.get('success'):
            print(f"✅ Cleanup successful!")
            print(f"   Games deleted: {result['games_deleted']:,}")
            print(f"   Odds deleted: {result['odds_deleted']:,}")
            print(f"   Total deleted: {result['total_deleted']:,}")
            print(f"   Execution time: {result['execution_time_ms']:.1f}ms")
            return True
        else:
            print(f"❌ Cleanup failed: {result.get('error', 'Unknown error')}")
            return False
        
    except Exception as e:
        logger.error(f"Error running manual cleanup: {e}")
        return False

def estimate_cleanup_impact():
    """Estimate what would be cleaned up"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Count what would be deleted
        cursor.execute("""
            SELECT 
                (SELECT COUNT(*) FROM games WHERE created_at < NOW() - INTERVAL '1 hour') as games_to_delete,
                (SELECT COUNT(*) FROM odds WHERE created_at < NOW() - INTERVAL '1 hour') as odds_to_delete,
                (SELECT COUNT(*) FROM odds_history WHERE created_at < NOW() - INTERVAL '1 hour') as history_to_delete
        """)
        
        games_count, odds_count, history_count = cursor.fetchone()
        total = games_count + odds_count + history_count
        
        print(f"\n🔮 CLEANUP IMPACT ESTIMATE:")
        print(f"   Games to delete: {games_count:,}")
        print(f"   Odds to delete: {odds_count:,}")
        print(f"   History to delete: {history_count:,}")
        print(f"   Total to delete: {total:,}")
        
        if total == 0:
            print("   ✅ No records need cleanup")
        else:
            print(f"   ⚠️  {total:,} records will be deleted")
        
        cursor.close()
        conn.close()
        
        return total
        
    except Exception as e:
        logger.error(f"Error estimating cleanup impact: {e}")
        return 0

def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(description='Data Status Checker and Manual Cleanup')
    parser.add_argument('--cleanup', action='store_true', 
                       help='Run manual cleanup after checking status')
    parser.add_argument('--estimate', action='store_true',
                       help='Only estimate cleanup impact without doing it')
    parser.add_argument('--history', action='store_true',
                       help='Show cleanup history')
    
    args = parser.parse_args()
    
    # Always show current data status
    check_data_status()
    
    # Show cleanup history if requested
    if args.history:
        check_cleanup_history()
    
    # Estimate cleanup impact
    if args.estimate or args.cleanup:
        impact = estimate_cleanup_impact()
        
        if args.cleanup and impact > 0:
            response = input(f"\n⚠️  About to delete {impact:,} records. Continue? (y/N): ")
            if response.lower() == 'y':
                manual_cleanup()
                # Show status again after cleanup
                check_data_status()
            else:
                print("Cleanup cancelled")
        elif args.cleanup and impact == 0:
            print("✅ No cleanup needed")

if __name__ == "__main__":
    main()