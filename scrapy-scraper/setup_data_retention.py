#!/usr/bin/env python3
"""
Setup Data Retention System
This script initializes the database with cleanup functions and policies
"""
import psycopg2
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('DataRetentionSetup')

DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'postgres'
}

def setup_cleanup_functions():
    """Setup cleanup functions in the database"""
    try:
        # Read the cleanup SQL file
        sql_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 
                                     '..', 'supabase-local', 'cleanup_old_data.sql')
        
        if not os.path.exists(sql_file_path):
            # Try alternative path
            sql_file_path = '/Users/joelsalazar/OddsCentral/supabase-local/cleanup_old_data.sql'
        
        if not os.path.exists(sql_file_path):
            logger.error(f"Cleanup SQL file not found at {sql_file_path}")
            return False
        
        with open(sql_file_path, 'r') as f:
            cleanup_sql = f.read()
        
        # Connect to database and execute
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Split SQL into individual statements and execute each
        statements = cleanup_sql.split(';')
        
        for statement in statements:
            statement = statement.strip()
            if statement and not statement.startswith('--'):
                try:
                    cursor.execute(statement)
                    logger.debug(f"Executed SQL statement: {statement[:50]}...")
                except Exception as e:
                    # Log warning but continue - some statements might be duplicates
                    logger.warning(f"SQL statement failed (might be duplicate): {e}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        logger.info("✅ Cleanup functions installed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Error setting up cleanup functions: {e}")
        return False

def test_cleanup_functions():
    """Test that cleanup functions are working"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Test that functions exist
        cursor.execute("""
            SELECT routine_name 
            FROM information_schema.routines 
            WHERE routine_schema = 'public' 
            AND routine_name IN ('cleanup_old_odds', 'cleanup_old_games', 'cleanup_all_old_data', 'scheduled_cleanup')
        """)
        
        functions = [row[0] for row in cursor.fetchall()]
        expected_functions = ['cleanup_old_odds', 'cleanup_old_games', 'cleanup_all_old_data', 'scheduled_cleanup']
        
        missing_functions = set(expected_functions) - set(functions)
        if missing_functions:
            logger.error(f"Missing cleanup functions: {missing_functions}")
            return False
        
        # Test the data_age_monitor view
        cursor.execute("SELECT COUNT(*) FROM data_age_monitor")
        view_count = cursor.fetchone()[0]
        logger.info(f"Data age monitor view working - {view_count} tables monitored")
        
        # Test cleanup_log table
        cursor.execute("SELECT COUNT(*) FROM cleanup_log")
        log_count = cursor.fetchone()[0]
        logger.info(f"Cleanup log table exists with {log_count} records")
        
        cursor.close()
        conn.close()
        
        logger.info("✅ All cleanup functions and tables are properly installed")
        return True
        
    except Exception as e:
        logger.error(f"Error testing cleanup functions: {e}")
        return False

def run_initial_cleanup():
    """Run an initial cleanup to test the system"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Run the scheduled cleanup function
        cursor.execute("SELECT * FROM scheduled_cleanup()")
        result = cursor.fetchone()[0]
        
        if result.get('success'):
            logger.info(f"✅ Initial cleanup successful: Deleted {result['total_deleted']} records")
            logger.info(f"   Games deleted: {result['games_deleted']}")
            logger.info(f"   Odds deleted: {result['odds_deleted']}")
            logger.info(f"   Execution time: {result['execution_time_ms']}ms")
        else:
            logger.error(f"❌ Initial cleanup failed: {result.get('error', 'Unknown error')}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return result.get('success', False)
        
    except Exception as e:
        logger.error(f"Error running initial cleanup: {e}")
        return False

def main():
    """Main setup function"""
    logger.info("Setting up data retention system...")
    
    # Step 1: Install cleanup functions
    if not setup_cleanup_functions():
        logger.error("Failed to setup cleanup functions")
        return 1
    
    # Step 2: Test functions
    if not test_cleanup_functions():
        logger.error("Cleanup functions test failed")
        return 1
    
    # Step 3: Run initial cleanup
    if not run_initial_cleanup():
        logger.warning("Initial cleanup had issues, but continuing...")
    
    logger.info("="*60)
    logger.info("DATA RETENTION SYSTEM SETUP COMPLETE")
    logger.info("="*60)
    logger.info("Configuration:")
    logger.info("- Retention period: 1 hour")
    logger.info("- Cleanup runs every 10 minutes in the monitor")
    logger.info("- Manual cleanup: python data_retention_manager.py --once")
    logger.info("- Continuous cleanup: python data_retention_manager.py")
    logger.info("- Monitor with cleanup: python monitor_with_direct_db.py")
    logger.info("="*60)
    
    return 0

if __name__ == "__main__":
    exit(main())