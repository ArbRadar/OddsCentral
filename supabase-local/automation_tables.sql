-- Tables for automated scraping integration

-- Endpoints table for communication between extension and Scrapy
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_discovered_endpoints_domain ON discovered_endpoints(domain);
CREATE INDEX IF NOT EXISTS idx_discovered_endpoints_status ON discovered_endpoints(scrape_status);
CREATE INDEX IF NOT EXISTS idx_discovered_endpoints_last_scraped ON discovered_endpoints(last_scraped);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraping_jobs_created_at ON scraping_jobs(created_at);

-- Enable RLS
ALTER TABLE discovered_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for automation tables
CREATE POLICY "Enable all for anon" ON discovered_endpoints
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON discovered_endpoints
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON discovered_endpoints
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for anon" ON scraping_config
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON scraping_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON scraping_config
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for anon" ON scraping_jobs
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for authenticated" ON scraping_jobs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for service_role" ON scraping_jobs
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Insert default config
INSERT INTO scraping_config (key, value, description) VALUES
    ('scraping_enabled', 'true', 'Enable/disable automated scraping'),
    ('scrape_interval_seconds', '30', 'Interval between scraping runs in seconds')
ON CONFLICT (key) DO NOTHING;