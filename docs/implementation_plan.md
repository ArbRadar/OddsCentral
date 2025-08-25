# Sportsbook Scraper Implementation Plan

## Completed Tasks ✅

1. **Configuration Page Created** (`config.html`, `config.js`)
   - Refresh settings (short/full intervals, odds window)
   - Game matching settings (time window, team/sport matching)
   - Analytics settings (outlier filtering, EV calculation method)
   - Data management (retention, auto-cleanup)

2. **Database Schema Updated**
   - Added `name` field: "TeamA vs TeamB" format
   - Added `sport_display` field: "Baseball", "Football", etc.
   - Added `league_display` field: "MLB", "NFL", etc.
   - Updated existing 564 games with new fields

3. **Fixed Core EV Calculation Bug**
   - Changed from comparing to BEST odds → WORST odds
   - Should now show realistic +EV percentages (1-2%+ instead of 0.4%)

## Pending Tasks 🚧

### High Priority
4. **Update Background Script** (`background.js`)
   - Handle CONFIG_UPDATED message
   - Implement game matching logic (8hr window configurable)
   - Update existing odds instead of inserting duplicates
   - Use configurable refresh intervals

5. **Create Sportsbook Recreation Page** (`sportsbook.html`)
   - Display odds data from database in sportsbook-like format
   - Filters: Sport, League, Bookmaker, Date
   - Pagination
   - Sort by EV, odds, etc.

6. **Implement Data Integrity Rules**
   - Only keep odds within configured time window
   - Match games by: same teams + start time within 8hrs + same sport/league
   - UPDATE existing odds records instead of INSERT

### Medium Priority
7. **Add Navigation Links**
   - Update popup.html to link to all pages
   - Add navigation between analytics/config/sportsbook pages

8. **Update Analytics Integration**
   - Read configuration from storage
   - Apply configured outlier filtering method
   - Use configured EV threshold

## Database Schema Status

```sql
-- Games table now has:
name VARCHAR(511)           -- "Yankees vs Red Sox"
sport_display VARCHAR(100)  -- "Baseball" 
league_display VARCHAR(100) -- "MLB"
sport VARCHAR(100)          -- "MLB" (existing)
league VARCHAR(100)         -- "MLB" (existing)
home_team VARCHAR(255)      -- "Yankees" (existing)
away_team VARCHAR(255)      -- "Red Sox" (existing)
```

## Configuration Schema

```javascript
{
  refresh: {
    shortInterval: 5,      // seconds - quick odds updates
    fullInterval: 5,       // minutes - full page reload
    oddsWindow: 30         // minutes - how long to keep odds
  },
  gameMatching: {
    timeWindow: 8,         // hours - game time matching window
    matchTeams: true,      // require same teams
    matchSport: true       // require same sport/league
  },
  analytics: {
    enableOutlierFilter: true,
    outlierMethod: 'conservative', // iqr|zscore|conservative
    minBooksForOutlier: 5,
    evThreshold: 0.5,      // minimum +EV to show
    evCalculationMethod: 'worst-odds' // worst-odds|average-odds|sharp-books
  },
  dataManagement: {
    retentionPeriod: 7,    // days
    autoCleanup: true
  }
}
```

## Key Fixes Applied

1. **EV Calculation**: Now uses worst odds as baseline (should show 1-2%+ EVs)
2. **Database URLs**: Fixed `/rest/v1/` prefix in background script
3. **Content Script**: Excluded from analytics.html to prevent conflicts
4. **Database Schema**: Added name, sport_display, league_display fields

## Next Steps

To continue implementation:
1. Update background script with game matching logic
2. Create sportsbook recreation page
3. Test configuration system
4. Add navigation links between pages
5. Document all features

## Files Created/Modified

- `config.html` - Configuration page UI
- `config.js` - Configuration page logic  
- `constants.js` - Renamed from config.js (sport/layout configs)
- `manifest.json` - Added web accessible resources
- Database schema - Added name, sport_display, league_display fields
- `analytics.js` - Fixed EV calculation (worst odds baseline)
- `background.js` - Fixed API URLs (/rest/v1/ prefix)