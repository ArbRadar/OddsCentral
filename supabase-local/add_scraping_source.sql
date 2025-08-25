-- Add scraping source tracking to odds tables

-- Add scraping source columns to odds table
ALTER TABLE odds 
ADD COLUMN IF NOT EXISTS scraping_source VARCHAR(50) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS scraping_method VARCHAR(50) DEFAULT 'unknown';

-- Add scraping source columns to odds_history table  
ALTER TABLE odds_history
ADD COLUMN IF NOT EXISTS scraping_source VARCHAR(50) DEFAULT 'unknown',
ADD COLUMN IF NOT EXISTS scraping_method VARCHAR(50) DEFAULT 'unknown';

-- Create index for scraping source queries
CREATE INDEX IF NOT EXISTS idx_odds_scraping_source ON odds(scraping_source);
CREATE INDEX IF NOT EXISTS idx_odds_scraping_method ON odds(scraping_method);

-- Update existing records to indicate they were from extension
UPDATE odds SET 
  scraping_source = 'browser_extension',
  scraping_method = 'visual_dom'
WHERE scraping_source = 'unknown';

UPDATE odds_history SET
  scraping_source = 'browser_extension', 
  scraping_method = 'visual_dom'
WHERE scraping_source = 'unknown';

-- Comments for documentation
COMMENT ON COLUMN odds.scraping_source IS 'Source of the scraping: browser_extension, scrapy_monitor, manual, etc.';
COMMENT ON COLUMN odds.scraping_method IS 'Method used: visual_dom, api_scraping, hybrid, etc.';
COMMENT ON COLUMN odds_history.scraping_source IS 'Source of the scraping: browser_extension, scrapy_monitor, manual, etc.';
COMMENT ON COLUMN odds_history.scraping_method IS 'Method used: visual_dom, api_scraping, hybrid, etc.';