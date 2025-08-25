-- Create discovered_endpoints table for Extension-Scrapy communication
CREATE TABLE IF NOT EXISTS discovered_endpoints (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL DEFAULT 'GET',
  path TEXT NOT NULL,
  headers JSONB DEFAULT '{}',
  has_odds_data BOOLEAN DEFAULT false,
  response_size INTEGER DEFAULT 0,
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_scraped TIMESTAMP WITH TIME ZONE,
  scrape_status VARCHAR(50) DEFAULT 'pending', -- pending, active, success, failed
  scrape_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  active BOOLEAN DEFAULT true,
  UNIQUE(domain, method, path)
);

-- Create index for efficient queries
CREATE INDEX idx_endpoints_status ON discovered_endpoints(scrape_status, active);
CREATE INDEX idx_endpoints_domain ON discovered_endpoints(domain);
CREATE INDEX idx_endpoints_last_scraped ON discovered_endpoints(last_scraped);

-- Create scraping_jobs table for coordinating work
CREATE TABLE IF NOT EXISTS scraping_jobs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL, -- 'endpoint_discovery', 'data_scraping'
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  worker_id VARCHAR(255), -- identifies which Scrapy instance is working
  endpoints_count INTEGER DEFAULT 0,
  games_scraped INTEGER DEFAULT 0,
  odds_scraped INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Create scraping_config table for dynamic configuration
CREATE TABLE IF NOT EXISTS scraping_config (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config
INSERT INTO scraping_config (key, value) VALUES 
  ('scraping_enabled', 'true'),
  ('scrape_interval_seconds', '300'),
  ('max_concurrent_requests', '5'),
  ('request_delay_seconds', '2')
ON CONFLICT (key) DO NOTHING;