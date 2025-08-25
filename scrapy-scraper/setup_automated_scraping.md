# Automated Scraping Setup Guide

## Prerequisites
- Supabase running locally (docker-compose up)
- Python 3.8+ with Scrapy installed
- Chrome browser with the extension loaded

## 1. Database Setup

First, create the necessary tables in Supabase:

```bash
# Run the SQL scripts to create tables
psql -h localhost -p 54322 -U postgres -d postgres < /Users/joelsalazar/OddsCentral/supabase-local/endpoints_table.sql
```

Or use Supabase Studio at http://localhost:54320 and run:

```sql
-- Endpoints table for communication
CREATE TABLE IF NOT EXISTS discovered_endpoints (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL DEFAULT 'GET',
    path TEXT NOT NULL,
    headers JSONB DEFAULT '{}',
    active BOOLEAN DEFAULT true,
    scrape_status VARCHAR(50) DEFAULT 'pending',
    last_scraped TIMESTAMP,
    scrape_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraping configuration
CREATE TABLE IF NOT EXISTS scraping_config (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraping jobs history
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id SERIAL PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    worker_id VARCHAR(100),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    endpoints_count INTEGER DEFAULT 0,
    games_scraped INTEGER DEFAULT 0,
    odds_scraped INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config
INSERT INTO scraping_config (key, value, description) VALUES
    ('scraping_enabled', 'false', 'Enable/disable automated scraping'),
    ('scrape_interval_seconds', '300', 'Interval between scraping runs in seconds')
ON CONFLICT (key) DO NOTHING;
```

## 2. Start the Scrapy Monitor

```bash
cd /Users/joelsalazar/OddsCentral/scrapy-scraper
chmod +x start_monitor.sh
./start_monitor.sh
```

Or manually:
```bash
python3 scrapy_monitor.py
```

## 3. Enable Scraping in Extension

1. Open the extension popup
2. Go to "Scraping Dashboard" 
3. Click "Start Scraping" to enable automated scraping

## 4. Browse Sportsbooks

Navigate to supported sportsbook sites. The extension will:
1. Automatically detect API endpoints
2. Sync them to Supabase
3. The monitor will pick them up and run Scrapy
4. Results will appear in the extension UI

## Testing the Integration

### Test 1: Manual Endpoint Addition
```python
# Add a test endpoint directly to database
import requests

url = "http://localhost:54320/rest/v1/discovered_endpoints"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    "Content-Type": "application/json"
}

data = {
    "domain": "oddsjam.com",
    "method": "GET",
    "path": "/_next/data/WzUffJO619HTJItqBbnuC/mlb/screen/moneyline.json",
    "headers": {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json"
    }
}

response = requests.post(url, json=data, headers=headers)
print(response.json())
```

### Test 2: Check Monitor Status
Visit http://localhost:54320 and check:
- discovered_endpoints table for new entries
- scraping_jobs table for job history
- games and odds tables for scraped data

## Monitoring

- Extension Dashboard: Click extension icon → "Scraping Dashboard"
- Scrapy Logs: Check terminal running scrapy_monitor.py
- Database: http://localhost:54320 (Supabase Studio)

## Troubleshooting

1. **Monitor not picking up endpoints**
   - Check scraping_enabled = 'true' in scraping_config
   - Verify endpoints have scrape_status = 'pending'
   - Check monitor logs for errors

2. **Scrapy failing**
   - Check discovered_endpoints.json was created
   - Verify endpoint URLs are accessible
   - Check Scrapy logs for specific errors

3. **No data in extension**
   - Verify games/odds tables have data
   - Check browser console for API errors
   - Ensure Supabase is running