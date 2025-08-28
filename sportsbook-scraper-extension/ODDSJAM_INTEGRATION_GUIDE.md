# OddsJam Integration Guide

## Quick Reference

### Required Parameters for All Sports
Every OddsJam API request requires these 7 parameters:
1. `sport` - Sport identifier (e.g., "baseball", "soccer")
2. `league` - League code with underscores (e.g., "mlb", "spain_-_la_liga")
3. `market_name` - Market type (e.g., "moneyline", "spread", "total")
4. `state` - Geographic state (e.g., "MX-MX", "NY-US")
5. `is_future` - Future games flag ("0" or "1")
6. `game_status_filter` - Game filter ("All", "Live", "Upcoming")
7. `opening_odds` - Opening odds flag ("true" or "false")

### Common Issues and Solutions

#### Issue: "Error building API URL: 'market'"
**Cause**: Config uses `market` instead of `market_name`
**Fix**: Update config to use `market_name`

#### Issue: "Error building API URL: 'is_future'"
**Cause**: Missing required parameters
**Fix**: Add all 7 required parameters to config

#### Issue: Authentication failed - 401 errors
**Cause**: Expired tokens
**Fix**: Update tokens in platform_auth table

## Configuration Examples

### Baseball (MLB)
```json
{
  "sport": "baseball",
  "league": "mlb",
  "market_name": "moneyline",
  "state": "MX-MX",
  "is_future": "0",
  "game_status_filter": "All",
  "opening_odds": "false"
}
```

### Soccer (La Liga)
```json
{
  "sport": "soccer",
  "league": "spain_-_la_liga",
  "market_name": "moneyline",
  "state": "MX-MX",
  "is_future": "0",
  "game_status_filter": "All",
  "opening_odds": "false"
}
```

### Basketball (NBA)
```json
{
  "sport": "basketball",
  "league": "nba",
  "market_name": "spread",
  "state": "NY-US",
  "is_future": "0",
  "game_status_filter": "All",
  "opening_odds": "false"
}
```

## Testing Your Configuration

### 1. Using Python Script
```bash
python verify_scraping_targets.py
```

### 2. Using Web Interface
Open in Chrome with extension loaded:
```
chrome-extension://[YOUR_EXTENSION_ID]/verify-targets.html
```

### 3. Using cURL
```bash
curl "https://oddsjam.com/api/backend/oddscreen/v2/game/data?sport=baseball&league=mlb&market_name=moneyline&state=MX-MX&is_future=0&game_status_filter=All&opening_odds=false" \
  -H "Cookie: access_token=YOUR_TOKEN; cf_clearance=YOUR_CF_TOKEN; state=YOUR_STATE"
```

## Database Updates

### Add New Sport/League
```sql
INSERT INTO scraping_targets (platform_id, target_type, name, config, enabled, priority)
VALUES (
  1, 
  'sport_league', 
  'NBA Spread',
  '{
    "sport": "basketball",
    "league": "nba",
    "market_name": "spread",
    "state": "MX-MX",
    "is_future": "0",
    "game_status_filter": "All",
    "opening_odds": "false"
  }'::jsonb,
  true,
  1
);
```

### Fix Existing Target
```sql
UPDATE scraping_targets 
SET config = jsonb_set(config, '{market_name}', '"moneyline"')
WHERE config->>'market' IS NOT NULL;
```

### Update Authentication
```sql
UPDATE platform_auth 
SET auth_data = '{
  "access_token": "NEW_TOKEN",
  "cf_clearance": "NEW_CF_TOKEN",
  "state": "MX-MX"
}'::jsonb
WHERE platform_id = 1;
```

## Monitoring

### Check Recent Scrapes
```sql
SELECT name, last_scraped, success_count, error_count
FROM scraping_targets
WHERE enabled = true
ORDER BY last_scraped DESC;
```

### View Recent Errors
```sql
SELECT name, config, updated_at
FROM scraping_targets
WHERE enabled = true 
  AND error_count > 0
ORDER BY updated_at DESC;
```

## Troubleshooting Checklist

1. ✓ All 7 parameters present in config?
2. ✓ Using `market_name` not `market`?
3. ✓ League code format correct (underscores)?
4. ✓ Authentication tokens valid?
5. ✓ Endpoint pattern matches config keys?
6. ✓ Platform active in database?
7. ✓ Target enabled in database?

## Important Notes

- **Consistency**: All sports use the exact same parameter structure
- **Case Sensitive**: League codes are case-sensitive (use lowercase)
- **Underscores**: League codes use underscores (e.g., "spain_-_la_liga")
- **Boolean Strings**: Use string values "0"/"1" and "true"/"false"
- **Rate Limiting**: Add 2-5 second delays between requests
- **Token Expiry**: Tokens typically last 2-4 weeks

---

Last Updated: August 2025