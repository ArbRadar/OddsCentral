# Data Retention System - 1 Hour Policy

This system implements an aggressive 1-hour data retention policy for the odds scraping system. All data older than 1 hour is automatically deleted to keep only fresh, relevant data for trading decisions.

## Overview

- **Retention Period**: 1 hour (configurable)
- **Cleanup Frequency**: Every 10 minutes (configurable)
- **Cleanup Scope**: Games, Odds, and Odds History tables
- **Integration**: Built into the existing Scrapy monitor

## Components

### 1. Database Layer (`/Users/joelsalazar/OddsCentral/supabase-local/cleanup_old_data.sql`)

SQL functions and views for data cleanup:

- `cleanup_old_odds()` - Removes odds older than 1 hour
- `cleanup_old_games()` - Removes games and related data older than 1 hour  
- `cleanup_all_old_data()` - Master cleanup function
- `scheduled_cleanup()` - Wrapper with logging and error handling
- `data_age_monitor` view - Monitor data age across tables
- `cleanup_log` table - Track all cleanup operations

### 2. Application Layer

#### Integrated Monitor (`monitor_with_direct_db.py`)
- **Updated** to include automatic cleanup every 10 minutes
- Runs cleanup in the background while processing endpoints
- Logs cleanup results with detailed statistics

#### Standalone Retention Manager (`data_retention_manager.py`)
- Dedicated cleanup service that can run independently
- Configurable intervals and retention periods
- Includes local cache cleanup (logs, temp files)

#### Setup Script (`setup_data_retention.py`)
- Installs all database functions and tables
- Tests the system to ensure everything works
- Runs initial cleanup

#### Status Checker (`check_data_status.py`)
- Monitor current data age and cleanup history
- Manual cleanup execution with safety prompts
- Estimate cleanup impact before execution

#### Startup Script (`start_with_cleanup.sh`)
- One-command startup for the entire system
- Sets up database functions and starts monitoring
- Colored output for better visibility

## Usage

### Quick Start

```bash
# Start everything with one command
./start_with_cleanup.sh
```

### Manual Operations

```bash
# Setup database functions (one-time)
python3 setup_data_retention.py

# Check current data status
python3 check_data_status.py

# Check data status with cleanup history
python3 check_data_status.py --history

# Estimate cleanup impact without doing it
python3 check_data_status.py --estimate

# Run manual cleanup (with confirmation prompt)
python3 check_data_status.py --cleanup

# Run standalone retention manager
python3 data_retention_manager.py

# Run one-time cleanup
python3 data_retention_manager.py --once
```

### Monitor Data Age

```sql
-- Check data age across all tables
SELECT * FROM data_age_monitor;

-- Check recent cleanup history
SELECT * FROM cleanup_log ORDER BY executed_at DESC LIMIT 10;

-- Manual cleanup (returns JSON result)
SELECT scheduled_cleanup();
```

## Configuration

### Retention Period
- **Default**: 1 hour
- **Database**: Modify the `INTERVAL '1 hour'` in SQL functions
- **Python**: Change `retention_hours` in DataRetentionManager

### Cleanup Frequency
- **Monitor Integration**: `cleanup_interval_minutes = 10` in monitor_with_direct_db.py
- **Standalone Manager**: `cleanup_interval = 600` (10 minutes) in data_retention_manager.py
- **Command Line**: `--interval 300` (5 minutes)

### Database Connection
Update DB_CONFIG in each Python file:
```python
DB_CONFIG = {
    'host': 'localhost',
    'port': 5433,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'postgres'
}
```

## Monitoring and Logging

### Cleanup Logs
All cleanup operations are logged to the `cleanup_log` table:
- Execution timestamp
- Records deleted by type (games, odds)
- Execution time
- Error messages (if any)

### Application Logs
- Monitor includes cleanup status in regular logs
- Detailed cleanup results with emoji indicators
- Error logging for failed operations

### Data Age Monitoring
The `data_age_monitor` view provides real-time visibility:
- Total records per table
- Recent vs old record counts
- Oldest and newest record timestamps

## Safety Features

1. **Confirmation Prompts**: Manual cleanup requires user confirmation
2. **Impact Estimation**: Shows what will be deleted before cleanup
3. **Error Handling**: Graceful error handling with detailed logging  
4. **Transaction Safety**: All operations use database transactions
5. **Signal Handling**: Graceful shutdown on SIGINT/SIGTERM

## Performance Considerations

- **Indexes**: Cleanup queries use existing indexes on `created_at` columns
- **Batch Operations**: Cleanup happens in single transactions
- **Low Impact**: Cleanup runs during regular monitor cycles
- **Quick Execution**: Typical cleanup completes in < 100ms

## Future Enhancements

### Snapshots (Planned)
For 30-minute historical snapshots:

1. Create `data_snapshots` table
2. Add snapshot creation before cleanup
3. Modify retention to keep snapshots longer
4. Add snapshot management commands

### Suggested Implementation:
```sql
-- Snapshot table (to be added later)
CREATE TABLE data_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    games_count INTEGER,
    odds_count INTEGER,
    data_summary JSONB
);
```

## Troubleshooting

### Common Issues

1. **Functions Not Found**
   ```bash
   python3 setup_data_retention.py
   ```

2. **Cleanup Not Running**
   - Check monitor logs for errors
   - Verify database connection
   - Ensure cleanup functions are installed

3. **Performance Issues**
   - Check data age - excessive old data may slow cleanup
   - Run manual cleanup during low usage
   - Consider adjusting cleanup frequency

4. **Data Loss Concerns**
   - Data older than 1 hour is intentionally deleted
   - Implement snapshots if historical data is needed
   - Adjust retention period if required

### Debug Commands

```bash
# Test database connection
python3 -c "import psycopg2; psycopg2.connect(host='localhost', port=5433, database='postgres', user='postgres', password='postgres'); print('OK')"

# Check if functions exist
psql -h localhost -p 5433 -U postgres -d postgres -c "SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE 'cleanup_%'"

# Manual SQL cleanup
psql -h localhost -p 5433 -U postgres -d postgres -c "SELECT scheduled_cleanup();"
```

## Files Created/Modified

### New Files:
- `/Users/joelsalazar/OddsCentral/supabase-local/cleanup_old_data.sql`
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/data_retention_manager.py`
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/setup_data_retention.py`
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/check_data_status.py`
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/start_with_cleanup.sh`

### Modified Files:
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/monitor_with_direct_db.py` (added cleanup integration)

This system ensures your trading system always has fresh, relevant data while automatically managing storage and maintaining optimal performance.