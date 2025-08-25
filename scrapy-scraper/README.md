# Sportsbook Scrapy Scraper

A headless, low-RAM alternative to browser extension scraping using Scrapy framework.

## Features

- **Headless**: No browser required, pure HTTP requests
- **Low RAM**: ~20-50MB vs 500MB+ for browser instances
- **Stealth**: Configurable delays, user agent rotation, rate limiting
- **Scalable**: Can handle 50+ URLs concurrently
- **API-focused**: Consumes discovered API endpoints from browser extension

## Architecture

```
Browser Extension (Discovery) → Scrapy (Scraping) → Supabase (Storage)
```

- **Extension**: Discovers API endpoints, provides UI
- **Scrapy**: Headless scraping of discovered endpoints  
- **Supabase**: Centralized data storage

## Installation

```bash
# Install dependencies
pip install scrapy requests

# Test the scraper
cd scrapy-scraper
python run_scraper.py
```

## Configuration

Edit `sportsbook_scraper/settings.py`:

```python
# Stealth settings
DOWNLOAD_DELAY = 2  # seconds between requests
RANDOMIZE_DOWNLOAD_DELAY = 0.5  # randomization
CONCURRENT_REQUESTS_PER_DOMAIN = 1  # single request at a time

# Supabase settings
SUPABASE_URL = "http://localhost:54320/rest/v1"
SUPABASE_KEY = "your_key_here"
```

## Running

### Manual Run
```bash
python run_scraper.py
```

### Scrapy Direct
```bash
scrapy crawl odds_spider -L INFO
```

### With Custom Endpoints
```bash
scrapy crawl odds_spider -a endpoints_file=custom_endpoints.json
```

## Data Flow

1. **Load Endpoints**: Read discovered API endpoints from extension
2. **Make Requests**: HTTP requests to each endpoint with stealth settings
3. **Parse Responses**: Extract games and odds data from JSON responses
4. **Validate Data**: Ensure required fields are present
5. **Store in Supabase**: Insert games and odds into database

## Endpoint Discovery Integration

To integrate with your browser extension:

1. **Export Endpoints**: Extension saves discovered endpoints to JSON
2. **Load in Scrapy**: Spider reads endpoints file on startup
3. **Dynamic Updates**: Can be run periodically to fetch new endpoints

Example endpoint format:
```json
[
  {
    "domain": "oddsjam.com",
    "method": "GET", 
    "path": "/api/backend/oddscreen/v2/game/markets",
    "headers": {"User-Agent": "Mozilla/5.0..."}
  }
]
```

## Scaling

For high-volume scraping:

1. **Add Proxies**: Configure rotating proxy middleware
2. **Multiple Instances**: Run multiple spiders in parallel
3. **Geographic Distribution**: Deploy to different regions
4. **Rate Limiting**: Adjust delays based on site response

## Monitoring

The scraper provides detailed statistics:
- Games processed/inserted
- Odds processed/inserted  
- Error counts
- Success rates

## vs Browser Extension

| Aspect | Browser Extension | Scrapy |
|--------|------------------|---------|
| RAM Usage | 500MB+ per tab | 20-50MB total |
| Stealth | Detectable | Highly configurable |
| Scale | Limited (4-5 sites) | 50+ sites easily |
| JavaScript | Full support | Limited |
| Setup | Complex injection | Simple HTTP |

## Future Enhancements

- Proxy rotation middleware
- Dynamic endpoint discovery
- Multi-sport support
- Real-time streaming
- Advanced anti-detection