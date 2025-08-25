-- Create URL management system for batch scraping

-- Table to store sportsbook URLs for scraping
CREATE TABLE IF NOT EXISTS sportsbook_urls (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    domain VARCHAR(255) NOT NULL,
    sport VARCHAR(50),
    league VARCHAR(50),
    market_type VARCHAR(50), -- 'moneyline', 'spread', 'totals', etc.
    title VARCHAR(500),
    description TEXT,
    active BOOLEAN DEFAULT true,
    last_scraped TIMESTAMPTZ,
    scrape_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    tags TEXT[], -- Array of tags for categorization
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'browser_extension'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sportsbook_urls_domain ON sportsbook_urls(domain);
CREATE INDEX IF NOT EXISTS idx_sportsbook_urls_sport ON sportsbook_urls(sport);
CREATE INDEX IF NOT EXISTS idx_sportsbook_urls_active ON sportsbook_urls(active);
CREATE INDEX IF NOT EXISTS idx_sportsbook_urls_last_scraped ON sportsbook_urls(last_scraped);
CREATE INDEX IF NOT EXISTS idx_sportsbook_urls_tags ON sportsbook_urls USING GIN(tags);

-- Enable RLS
ALTER TABLE sportsbook_urls ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable all for anon" ON sportsbook_urls
    FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Table for batch scraping jobs
CREATE TABLE IF NOT EXISTS batch_scraping_jobs (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    url_ids INTEGER[] NOT NULL, -- Array of sportsbook_urls.id
    status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    urls_scraped INTEGER DEFAULT 0,
    urls_failed INTEGER DEFAULT 0,
    games_found INTEGER DEFAULT 0,
    odds_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100) DEFAULT 'browser_extension'
);

-- Enable RLS for batch jobs
ALTER TABLE batch_scraping_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all for anon" ON batch_scraping_jobs
    FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

-- Add comments
COMMENT ON TABLE sportsbook_urls IS 'Stores sportsbook URLs for organized batch scraping';
COMMENT ON TABLE batch_scraping_jobs IS 'Tracks batch scraping operations across multiple URLs';
COMMENT ON COLUMN sportsbook_urls.tags IS 'Tags for categorization: [\"mlb\", \"today\", \"moneyline\", \"favorites\"]';
COMMENT ON COLUMN batch_scraping_jobs.url_ids IS 'Array of sportsbook_urls.id values to scrape in this batch';