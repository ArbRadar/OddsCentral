# OddsJam API Documentation

## Overview

OddsJam is an odds aggregation platform that collects betting data from multiple bookmakers. This documentation covers the API endpoints, authentication, and data structures used by OddsJam.

## API Endpoint Structure

### Primary Game Data Endpoint
```
https://oddsjam.com/api/backend/oddscreen/v2/game/data
```

### Parameters (Required for all sports)
- `sport` - Sport identifier (e.g., "baseball", "soccer", "basketball")
- `league` - League identifier with underscores (e.g., "mlb", "spain_-_la_liga", "nba")
- `state` - Geographic state code (e.g., "MX-MX", "NY-US")
- `market_name` - Type of bet (e.g., "moneyline", "spread", "total")
- `is_future` - Whether to include future games ("0" or "1")
- `game_status_filter` - Game status filter ("All", "Live", "Upcoming")
- `opening_odds` - Include opening odds ("true" or "false")

### Example URLs
```
# MLB Moneyline
https://oddsjam.com/api/backend/oddscreen/v2/game/data?sport=baseball&league=mlb&market_name=moneyline&state=MX-MX&is_future=0&game_status_filter=All&opening_odds=false

# Spanish La Liga Moneyline
https://oddsjam.com/api/backend/oddscreen/v2/game/data?sport=soccer&league=spain_-_la_liga&market_name=moneyline&state=MX-MX&is_future=0&game_status_filter=All&opening_odds=false

# NBA Spread
https://oddsjam.com/api/backend/oddscreen/v2/game/data?sport=basketball&league=nba&market_name=spread&state=NY-US&is_future=0&game_status_filter=All&opening_odds=false
```

## Authentication

### Required Cookies
1. **access_token** - JWT authentication token
2. **cf_clearance** - Cloudflare security token
3. **state** - Session/location identifier

### Cookie Lifetime
- Access tokens typically last 2-4 weeks
- cf_clearance tokens may expire more frequently
- Tokens can be captured via browser extension or manual extraction

## Response Structure

### Game Data Format
```json
{
  "data": [
    {
      "game_id": "teamId1-teamId2-YYYY-MM-DD-HH",
      "rows": [
        {
          "home_or_away": "home|away|null",  // null for draw/tie in 3-way markets
          "display": {
            "Moneyline": {
              "team_name": "Team Name",
              "subtitle": "Additional Info"
            }
          },
          "odds": {
            "BookmakerName": [
              {
                "price": 150,  // American odds format
                "timestamp": 1234567890
              }
            ]
          }
        }
      ]
    }
  ]
}
```

### Game ID Format
- Pattern: `{homeTeamId}-{awayTeamId}-{date}-{hour}`
- Example: `70493-25047-2025-08-29-16`
- Date format: YYYY-MM-DD
- Hour: 24-hour format (optional)

## Sport and League Codes

### Baseball
- **MLB**: `sport=baseball&league=mlb`
- **NPB**: `sport=baseball&league=japan_-_npb`
- **KBO**: `sport=baseball&league=korea_-_kbo`

### Soccer
- **Premier League**: `sport=soccer&league=england_-_premier_league`
- **La Liga**: `sport=soccer&league=spain_-_la_liga`
- **Serie A**: `sport=soccer&league=italy_-_serie_a`
- **Bundesliga**: `sport=soccer&league=germany_-_bundesliga`
- **Champions League**: `sport=soccer&league=uefa_champions_league`
- **MLS**: `sport=soccer&league=usa_-_mls`

### Basketball
- **NBA**: `sport=basketball&league=nba`
- **EuroLeague**: `sport=basketball&league=euroleague`
- **NCAA**: `sport=basketball&league=ncaa`

### Football
- **NFL**: `sport=football&league=nfl`
- **NCAAF**: `sport=football&league=ncaaf`

### Hockey
- **NHL**: `sport=hockey&league=nhl`
- **SHL**: `sport=hockey&league=sweden_-_shl`

## Market Types

### Common Markets
- `moneyline` - Winner of the game (2-way or 3-way)
- `spread` - Point spread betting
- `total` - Over/under total points/goals
- `btts` - Both teams to score (soccer)
- `props` - Player/team proposition bets

### Sport-Specific Markets
- Baseball: `first_5_innings`, `run_line`
- Soccer: `double_chance`, `correct_score`, `anytime_goalscorer`
- Basketball: `quarter_lines`, `half_lines`
- Football: `touchdown_scorer`, `passing_yards`

## Data Processing Notes

### 2-Way vs 3-Way Markets
- **2-Way** (Baseball, Basketball): Home and Away outcomes only
- **3-Way** (Soccer): Home, Away, and Draw outcomes
- Draw/Tie identified by `home_or_away: null` or team name containing "draw"/"tie"

### Bookmaker Names
Common bookmakers in responses:
- DraftKings
- FanDuel
- BetMGM
- Caesars
- PointsBet
- bet365
- Betfair Exchange
- ESPN BET

### Odds Format
- American odds format (e.g., +150, -200)
- Positive numbers: Amount won on $100 bet
- Negative numbers: Amount to bet to win $100

## Error Handling

### Common Errors
1. **401 Unauthorized** - Invalid or expired authentication tokens
2. **403 Forbidden** - Cloudflare challenge or rate limiting
3. **404 Not Found** - Invalid endpoint or parameters
4. **500 Server Error** - OddsJam internal issues

### Rate Limiting
- Implement delays between requests (2-5 seconds recommended)
- Use randomized delays to appear more natural
- Monitor for 403 responses indicating rate limiting

## Integration Best Practices

1. **Parameter Validation**
   - Always include all required parameters
   - Use exact parameter names (e.g., `market_name` not `market`)
   - League codes must match OddsJam's format exactly

2. **Authentication Management**
   - Store tokens securely in database
   - Implement token refresh mechanism
   - Monitor for 401 responses

3. **Data Parsing**
   - Handle both 2-way and 3-way markets
   - Extract game time from game_id if not provided
   - Validate bookmaker data before processing

4. **Error Recovery**
   - Implement retry logic with exponential backoff
   - Log failed requests for debugging
   - Have fallback mechanisms for authentication

## Database Schema for Configuration

```sql
-- Endpoint patterns
CREATE TABLE known_endpoints (
    endpoint_pattern TEXT,  -- e.g., "/api/backend/oddscreen/v2/game/data?..."
    method TEXT DEFAULT 'GET'
);

-- Scraping targets
CREATE TABLE scraping_targets (
    name TEXT,
    config JSONB  -- Contains all parameters: sport, league, state, etc.
);

-- Platform authentication
CREATE TABLE platform_auth (
    auth_data JSONB  -- Contains access_token, cf_clearance, state
);
```

## Testing Endpoints

### Manual Testing
```bash
# Test with curl
curl "https://oddsjam.com/api/backend/oddscreen/v2/game/data?sport=baseball&league=mlb&market_name=moneyline&state=MX-MX&is_future=0&game_status_filter=All&opening_odds=false" \
  -H "Cookie: access_token=YOUR_TOKEN; cf_clearance=YOUR_CF_TOKEN; state=YOUR_STATE"
```

### Automated Testing
- Use the verification endpoint to test all configured targets
- Monitor response times and success rates
- Alert on authentication failures

---

Last Updated: August 2025