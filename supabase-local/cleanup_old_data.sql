-- Data Retention Policy: Keep only data from the last hour
-- This script creates functions and procedures to clean up old data

-- Function to delete old odds data (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_odds()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM odds_history 
    WHERE created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    DELETE FROM odds 
    WHERE created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = deleted_count + ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to delete old games data (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_games()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- First delete odds for games that will be deleted (foreign key constraint)
    DELETE FROM odds 
    WHERE game_id IN (
        SELECT game_id FROM games 
        WHERE created_at < NOW() - INTERVAL '1 hour'
    );
    
    DELETE FROM odds_history 
    WHERE game_id IN (
        SELECT game_id FROM games 
        WHERE created_at < NOW() - INTERVAL '1 hour'
    );
    
    -- Now delete the old games
    DELETE FROM games 
    WHERE created_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Master cleanup function that calls both cleanup functions
CREATE OR REPLACE FUNCTION cleanup_all_old_data()
RETURNS TABLE(
    games_deleted INTEGER,
    odds_deleted INTEGER,
    total_deleted INTEGER
) AS $$
DECLARE
    games_count INTEGER;
    odds_count INTEGER;
BEGIN
    -- Clean up old games (this will also clean related odds)
    games_count := cleanup_old_games();
    
    -- Clean up any remaining old odds
    odds_count := cleanup_old_odds();
    
    RETURN QUERY SELECT 
        games_count,
        odds_count,
        games_count + odds_count;
END;
$$ LANGUAGE plpgsql;

-- Create a view to monitor data age
CREATE OR REPLACE VIEW data_age_monitor AS
SELECT 
    'games' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_records,
    COUNT(CASE WHEN created_at <= NOW() - INTERVAL '1 hour' THEN 1 END) as old_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM games
UNION ALL
SELECT 
    'odds' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_records,
    COUNT(CASE WHEN created_at <= NOW() - INTERVAL '1 hour' THEN 1 END) as old_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM odds
UNION ALL
SELECT 
    'odds_history' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 hour' THEN 1 END) as recent_records,
    COUNT(CASE WHEN created_at <= NOW() - INTERVAL '1 hour' THEN 1 END) as old_records,
    MIN(created_at) as oldest_record,
    MAX(created_at) as newest_record
FROM odds_history;

-- Create a scheduled job using pg_cron (if available) or create a function for manual/external scheduling
-- Note: pg_cron extension needs to be installed for this to work
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup to run every 10 minutes (uncomment if pg_cron is available)
-- SELECT cron.schedule('cleanup-old-data', '*/10 * * * *', 'SELECT cleanup_all_old_data();');

-- Alternative: Create a function that can be called from application code
CREATE OR REPLACE FUNCTION scheduled_cleanup()
RETURNS JSONB AS $$
DECLARE
    cleanup_result RECORD;
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    execution_time INTERVAL;
BEGIN
    start_time := clock_timestamp();
    
    -- Perform cleanup
    SELECT * INTO cleanup_result FROM cleanup_all_old_data();
    
    end_time := clock_timestamp();
    execution_time := end_time - start_time;
    
    -- Log the cleanup operation
    INSERT INTO cleanup_log (
        executed_at,
        games_deleted,
        odds_deleted,
        total_deleted,
        execution_time_ms
    ) VALUES (
        NOW(),
        cleanup_result.games_deleted,
        cleanup_result.odds_deleted,
        cleanup_result.total_deleted,
        EXTRACT(MILLISECONDS FROM execution_time)
    );
    
    -- Return result as JSON
    RETURN jsonb_build_object(
        'success', true,
        'executed_at', NOW(),
        'games_deleted', cleanup_result.games_deleted,
        'odds_deleted', cleanup_result.odds_deleted,
        'total_deleted', cleanup_result.total_deleted,
        'execution_time_ms', EXTRACT(MILLISECONDS FROM execution_time)
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM,
            'executed_at', NOW()
        );
END;
$$ LANGUAGE plpgsql;

-- Create cleanup log table for tracking cleanup operations
CREATE TABLE IF NOT EXISTS cleanup_log (
    id BIGSERIAL PRIMARY KEY,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    games_deleted INTEGER,
    odds_deleted INTEGER,
    total_deleted INTEGER,
    execution_time_ms FLOAT,
    error_message TEXT
);

-- Create index on cleanup log for performance
CREATE INDEX idx_cleanup_log_executed_at ON cleanup_log(executed_at);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION cleanup_old_odds() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_games() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION cleanup_all_old_data() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION scheduled_cleanup() TO anon, authenticated, service_role;
GRANT SELECT ON data_age_monitor TO anon, authenticated, service_role;
GRANT ALL ON cleanup_log TO anon, authenticated, service_role;
GRANT ALL ON cleanup_log_id_seq TO anon, authenticated, service_role;