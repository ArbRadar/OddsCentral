# OddsJam Real Game Data Endpoints Discovery Guide

## Problem Summary
The current endpoints we're using only return configuration data (leagues, navigation, sidebar settings), not actual games with odds:

- `/_next/data/_lBykIN0RByeBTpFdr0Fv/mlb/screen/moneyline.json` - ❌ Config only
- `/_next/data/_lBykIN0RByeBTpFdr0Fv/mlb/screen/totals.json` - ❌ Config only

**Response Structure (Config Only):**
```json
{
  "pageProps": {
    "fallback": {
      "leagues": {...},           // League configuration
      "sidebarIsOpen": true,      // UI state
      "navGroups": [...],         // Navigation structure  
      "sidebarVersion": [...]     // Sidebar configuration
    }
  }
}
```

## What We Need to Find

Real game data endpoints should return:
```json
{
  "games": [
    {
      "homeTeam": "Yankees", 
      "awayTeam": "Red Sox",
      "startTime": "2025-08-23T19:30:00Z",
      "odds": {
        "draftkings": { "moneyline": {"home": -150, "away": 130} },
        "fanduel": { "moneyline": {"home": -145, "away": 125} }
      }
    }
  ]
}
```

## Discovery Methods

### Method 1: Browser DevTools Network Monitoring

1. **Open OddsJam in Chrome DevTools**
   ```
   1. Go to https://oddsjam.com/mlb/screen/moneyline
   2. Open DevTools (F12) → Network tab
   3. Filter by "XHR/Fetch" or "Doc"
   4. Clear existing requests
   5. Refresh page and navigate between sports/markets
   6. Look for requests that return game data
   ```

2. **Key Indicators of Game Data Endpoints:**
   - URLs containing: `/games`, `/odds`, `/events`, `/markets`, `/live`
   - JSON responses with arrays of game objects
   - Responses containing team names, start times, odds values
   - Regular polling intervals (every 30-60 seconds for live data)

### Method 2: Browser Extension API Interceptor

1. **Use the existing extension** (if running):
   ```javascript
   // Run in browser console on OddsJam page:
   console.log(window.__capturedAPIs);
   ```

2. **Or load the inspector script**:
   - Copy `/Users/joelsalazar/OddsCentral/inspect_extension_data.js` 
   - Paste and run in browser console

3. **Look for patterns:**
   - XHR/Fetch requests with game-like data structures
   - WebSocket connections (real-time updates)
   - Polling patterns (requests at regular intervals)

### Method 3: Alternative Next.js Build IDs

The current build ID `_lBykIN0RByeBTpFdr0Fv` may be outdated. Try:

1. **Extract current build ID from page source:**
   ```bash
   curl -s https://oddsjam.com/mlb/screen/moneyline | grep -o '"buildId":"[^"]*"'
   ```

2. **Test with new build ID:**
   ```bash
   # Replace NEW_BUILD_ID with extracted ID
   curl "https://oddsjam.com/_next/data/NEW_BUILD_ID/mlb/screen/moneyline.json"
   ```

### Method 4: Different Sports/Markets

Test the same patterns with different sports (active seasons):
```
# Current active sports (August 2025)
- MLB: /mlb/screen/moneyline
- NFL: /nfl/screen/moneyline  (preseason)
- Soccer: /soccer/screen/moneyline
- Tennis: /tennis/screen/moneyline
```

### Method 5: Real-Time vs Static Data

Consider that game data might be loaded via:
1. **Server-Side Rendering (SSR)** - In initial page HTML
2. **Client-Side API Calls** - After page load
3. **WebSocket Streams** - For live updates
4. **Polling Endpoints** - Regular data refresh

## Tools We've Created

### 1. Automated Discovery Script
```bash
python /Users/joelsalazar/OddsCentral/find_real_endpoints.py
```

### 2. Detailed Endpoint Analysis
```bash
python /Users/joelsalazar/OddsCentral/detailed_endpoint_analysis.py
```

### 3. Network Traffic Monitor
```bash
python /Users/joelsalazar/OddsCentral/network_monitor.py
```

### 4. Browser Console Inspector
```javascript
// Load inspect_extension_data.js in browser console
```

## Common Endpoint Patterns to Test

Based on similar betting sites, try these patterns:
```
# API-style endpoints
/api/odds/live
/api/games/today
/api/events/mlb
/api/markets/current

# Data feed endpoints  
/data/odds/mlb
/data/games/live
/feed/odds
/feed/events

# Next.js dynamic routes
/_next/data/{BUILD_ID}/api/games.json
/_next/data/{BUILD_ID}/data/odds.json

# Real-time endpoints
/live/odds
/live/games
/stream/odds

# GraphQL endpoints
/graphql (with POST queries)
/api/graphql
```

## Manual Testing Process

1. **Load OddsJam page**
2. **Open Network tab in DevTools**
3. **Navigate between different sections:**
   - Different sports (MLB → NFL → NBA)
   - Different bet types (Moneyline → Spreads → Totals)
   - Different time periods (Today → Tomorrow)
4. **Look for new API requests**
5. **Test each request manually** to see response structure
6. **Identify which contain actual game data**

## What Success Looks Like

When you find the real endpoints, you should see:

✅ **Response contains arrays of games**
```json
{
  "events": [/* array of games */],
  "games": [/* array of games */], 
  "data": [/* array of games */]
}
```

✅ **Each game has team information**
```json
{
  "homeTeam": "Team Name",
  "awayTeam": "Team Name", 
  "startTime": "ISO timestamp"
}
```

✅ **Each game has sportsbook odds**
```json
{
  "odds": {
    "draftkings": {"moneyline": {home: -150, away: 130}},
    "fanduel": {"spread": {home: -1.5, away: 1.5}}
  }
}
```

✅ **Data updates regularly** (polling/WebSocket)

## Next Steps

1. **Try Method 1 first** - Manual browser inspection is most reliable
2. **Focus on active sports** - MLB is currently in season
3. **Check during live games** - Real-time data flows more during active games
4. **Monitor WebSocket connections** - Modern betting sites use WebSockets for live updates
5. **Test different bet types** - Moneyline, spreads, totals may use different endpoints

## Results Location

Save any discovered endpoints to:
- `/Users/joelsalazar/OddsCentral/scrapy-scraper/real_game_endpoints.json`
- Update `/Users/joelsalazar/OddsCentral/scrapy-scraper/discovered_endpoints.json` with working endpoints

## Troubleshooting

**If no endpoints found:**
- Build ID might be rotating frequently
- Site might use WebSockets exclusively 
- Game data might be embedded in initial HTML
- Anti-bot measures might be blocking requests
- Try different user agents or request headers