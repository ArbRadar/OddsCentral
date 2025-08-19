# OddsCentral - Sports Betting Analytics Platform

## Overview

OddsCentral is a comprehensive sports betting analytics platform consisting of a Chrome browser extension that scrapes odds data from sportsbook websites and calculates expected value (EV) opportunities and arbitrage opportunities. The system uses a local Supabase database for data storage and provides real-time analytics through a tabbed web interface.

## Recent Updates & Bug Fixes

### Version 1.1 (August 2024)
- **🐛 Fixed Critical EV Calculation Bug**: Corrected American odds comparison logic that was causing inflated +EV percentages
- **🐛 Fixed Arbitrage Calculation Bug**: Same odds comparison fix applied to arbitrage detection
- **⚠️ Added 3-Way Market Detection**: Soccer games with draw options are now properly identified and skipped until full 3-way support is implemented
- **🎨 Enhanced User Interface**: Added tabbed navigation for +EV and Arbitrage opportunities
- **📊 Improved Validation**: Added suspicious high EV/arbitrage warnings and profit caps
- **🔍 Enhanced Debugging**: Detailed console logging for troubleshooting calculations

## Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Content       │    │   Background    │    │   Analytics     │
│   Script        │───▶│   Script        │───▶│   Interface     │
│  (Scraping)     │    │ (Data Storage)  │    │ (EV Analysis)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       ▼                       │
         │              ┌─────────────────┐              │
         │              │   Supabase      │              │
         └──────────────│   Database      │◀─────────────┘
                        │  (PostgreSQL)   │
                        └─────────────────┘
```

## Component Details

### 1. Chrome Extension (sportsbook-scraper-extension/)

#### manifest.json - Extension Configuration
- **Type**: Chrome Extension Manifest V3
- **Permissions**: 
  - All URLs access for web scraping
  - Storage for local data persistence
  - Alarms for scheduled tasks
  - Active tabs and scripting for content injection
- **Web Resources**: Exposes analytics.js and analytics.html to all websites
- **Host Permissions**: localhost:54320 (Supabase) + all HTTP/HTTPS sites

#### content.js - Web Scraping Engine
**Primary Functions:**
- **Automatic Detection**: Identifies sportsbook websites and their data structures
- **Sport Recognition**: Detects MLB, NFL, NBA, Soccer from URLs and page content
- **Data Extraction**:
  - Team names and rotation numbers
  - American odds formats (+150, -110, etc.)
  - Game timing and status
  - Best/average odds when available
- **Real-time Monitoring**: Uses MutationObserver for dynamic page updates
- **Error Resilience**: Handles extension context invalidation gracefully

**Supported Formats:**
- American odds: +150, -110
- Decimal odds: 2.50, 1.91
- Percentage: 60.5%, 39.5%

**Data Extraction Process:**
1. Page structure detection (AG Grid vs HTML tables)
2. Sport type identification from URL/content
3. Game data parsing from DOM elements
4. Odds conversion and validation
5. Data transmission to background script every 5 seconds

#### background.js - Data Management Hub
**Core Responsibilities:**
- **Database Operations**: Manages Supabase connection with retry logic
- **Data Processing**: Handles incoming scraped data
- **Duplicate Prevention**: Checks for existing records before insertion
- **Change Tracking**: Maintains historical odds data
- **Analytics Support**: Provides data for EV calculations

**Key Functions:**
- `processOddsData()`: Main data processing pipeline
- `upsertGameData()`: Game record management
- `trackOddsHistory()`: Historical data preservation
- `getAnalyticsData()`: Data retrieval for analytics

#### analytics.js - EV Calculation Engine
**Advanced Analytics Features:**

1. **Expected Value (EV) Calculation**:
   - Uses "sharp" odds (best available across all books) as baseline
   - Removes vig through probability normalization
   - Compares individual sportsbook odds to fair probability
   - Formula: `EV = ((fairProb × decimalOdds) - 1) × 100`

2. **Arbitrage Detection**:
   - Identifies opportunities where combined implied probabilities < 100%
   - Calculates optimal stake distribution
   - Shows guaranteed profit percentages

3. **Kelly Criterion**: Calculates optimal bet sizing based on edge

**EV Calculation Methodology:**
```javascript
// 1. Find best odds for each side
bestHomeOdds = findBestOdds(homeOdds)
bestAwayOdds = findBestOdds(awayOdds)

// 2. Convert to probabilities
homeProbRaw = oddsToImpliedProbability(bestHomeOdds)
awayProbRaw = oddsToImpliedProbability(bestAwayOdds)

// 3. Normalize (remove vig)
totalProb = homeProbRaw + awayProbRaw
fairHomeProb = homeProbRaw / totalProb
fairAwayProb = awayProbRaw / totalProb

// 4. Calculate EV for each sportsbook
EV = ((fairProb × decimalOdds) - 1) × 100
```

**Quality Controls:**
- EV range filtering (0.5% to 50%) to eliminate calculation errors
- Suspicious high EV warnings (>15%)
- Minimum sportsbook requirements (3+ books for meaningful analysis)

#### config.js - Configuration Management
- **Database Settings**: Supabase connection parameters
- **Sport Configurations**: Terminology mappings for different sports
- **Layout Configurations**: CSS selectors for various website structures
- **Scraping Parameters**: Update intervals and retry logic

### 2. Database Layer (supabase-local/)

#### PostgreSQL Schema (init.sql)

**Tables:**
1. **games**: Core game information
   - `game_id` (UUID, primary key)
   - `sport`, `league` (text)
   - `home_team`, `away_team` (text)
   - `game_time` (timestamp)
   - `status` (scheduled, live, final)

2. **odds**: Current odds data
   - `odds_id` (UUID, primary key)
   - `game_id` (foreign key to games)
   - `sportsbook` (text)
   - `home_odds`, `away_odds` (integer - American format)
   - `created_at`, `updated_at` (timestamps)

3. **odds_history**: Historical tracking
   - All odds fields plus change tracking
   - Immutable record of odds movements

**Key Features:**
- Unique constraints prevent duplicate data
- Performance indexes on frequently queried columns
- Row Level Security (RLS) enabled
- Automatic timestamp triggers

#### Docker Configuration (docker-compose.yml)
- PostgreSQL 15 with persistence
- Exposed on localhost:54320
- Automated schema initialization

### 3. Analytics Interface

#### analytics.html - User Interface
- **Tabbed Navigation**: Separate tabs for +EV and Arbitrage opportunities
- **Real-time Updates**: Auto-refresh every 30 seconds
- **Advanced Filtering**: By sport, minimum EV/profit thresholds, stake limits  
- **Interactive Tables**: Sortable columns with hover effects
- **Responsive Design**: Clean, modern interface with loading states
- **Data Validation**: Visual warnings for suspicious calculations

#### Popup Interface (popup.js/popup.html)
- Extension status monitoring
- Active tab management
- Database connection status
- Manual refresh controls

## Data Flow Architecture

### 1. Data Acquisition
```
Sportsbook Website → Content Script → Background Script → Database
```

### 2. Analytics Pipeline
```
Database → Analytics Engine → EV Calculations → User Interface
```

### 3. Real-time Updates
```
MutationObserver → Data Changes → Background Processing → Analytics Refresh
```

## Key Algorithms

### 1. Best Odds Detection
Handles American odds correctly where:
- Negative odds: -110 is better than -150 (closer to 0)
- Positive odds: +150 is better than +110 (higher number)

### 2. Probability Normalization
Removes sportsbook vig by normalizing probabilities to sum to 1:
```
normalizedProb = rawProb / (homeProbRaw + awayProbRaw)
```

### 3. Arbitrage Detection
Identifies opportunities where:
```
(1/homeOdds) + (1/awayOdds) < 1.0
```

## Technical Specifications

### Performance Characteristics
- **Scraping Frequency**: Every 5 seconds per active tab
- **Analytics Refresh**: Every 30 seconds
- **Database Operations**: Asynchronous with connection pooling
- **Memory Usage**: Minimal footprint with efficient data structures

### Error Handling
- **Network Failures**: Automatic retry with exponential backoff
- **Extension Context**: Graceful handling of context invalidation
- **Database Errors**: Transaction rollback and error logging
- **Invalid Data**: Validation and sanitization at all layers

### Security Features
- **Local Database**: All data stored locally, no external transmission
- **Input Sanitization**: SQL injection prevention
- **Row Level Security**: Database-level access controls
- **CORS Handling**: Proper cross-origin request management

## Supported Sportsbooks and Data Sources

### Primary Support
- **OddsJam**: Native AG Grid support with comprehensive data extraction
- **Generic HTML Tables**: Fallback parsing for standard table structures

### Data Types Extracted
- **Moneyline**: Win/loss betting odds
- **Point Spread**: Handicap betting (when available)
- **Totals**: Over/under betting (when available)
- **Live Odds**: Real-time odds during games
- **Historical Data**: Odds movement tracking

### Sports Coverage
- **MLB**: Major League Baseball
- **NFL**: National Football League
- **NBA**: National Basketball Association
- **Soccer**: Various leagues and tournaments

## Installation and Setup

### Prerequisites
- Chrome browser with Developer Mode enabled
- Docker and Docker Compose for database
- Local network access on port 54320

### Setup Process
1. **Database Setup**:
   ```bash
   cd supabase-local
   docker compose up -d
   docker exec -i supabase-db psql -U postgres -d postgres < init.sql
   ```

2. **Extension Installation**:
   - Open `chrome://extensions/`
   - Enable Developer Mode
   - Load unpacked extension from `sportsbook-scraper-extension/`

3. **Configuration**:
   - Extension auto-detects compatible websites
   - Analytics interface available via extension popup
   - No additional configuration required for basic operation

## Usage Patterns

### 1. Automated Scraping
- Extension runs automatically when visiting supported sportsbook sites
- Continuous monitoring with real-time updates
- Background operation requires no user intervention

### 2. Analytics Review
- Access analytics interface through extension popup
- Filter opportunities by sport, EV threshold, profit margins
- Export data for external analysis (if implemented)

### 3. Opportunity Alerts
- Visual indicators for high-value opportunities
- Suspicious high EV warnings for data validation
- Real-time updates as odds change

## Known Issues & Limitations

### Current Limitations
- **3-Way Markets Not Supported**: Soccer/football games with draw options are currently skipped
  - System detects these markets and warns in console
  - Database schema needs `draw_odds` field
  - Analytics algorithms need 3-way probability handling
- **Limited Sports Coverage**: Optimized primarily for MLB, NFL, NBA
- **Local Database Only**: No cloud sync or multi-device support
- **Manual Extension Installation**: Requires developer mode in Chrome

### Recently Fixed Issues
- **✅ American Odds Comparison**: Fixed `Math.max()` usage that incorrectly compared negative odds
- **✅ Inflated EV Calculations**: Resolved 70%+ EV calculations from improper odds handling
- **✅ Arbitrage Miscalculations**: Fixed 1000%+ profit calculations from same odds comparison bug
- **✅ UI Navigation**: Added tabbed interface to reduce scrolling

## Development Roadmap

### High Priority
1. **3-Way Market Support**: Full implementation for soccer betting
   - Database schema updates
   - Scraping logic enhancements
   - 3-way EV and arbitrage calculations
2. **Enhanced Sport Detection**: Better identification of market types
3. **Data Validation**: Improved sanity checks and error detection

### Medium Priority
1. **Additional Sports**: Hockey, tennis, golf support
2. **Cloud Sync**: Optional cloud database integration
3. **Mobile Interface**: Responsive design improvements
4. **Export Features**: CSV/Excel data export functionality

### Low Priority
1. **Browser Extension Store**: Publish to Chrome Web Store
2. **Multi-Browser Support**: Firefox and Edge compatibility
3. **Real-Time Notifications**: Push notifications for high-value opportunities

## Development and Maintenance

### Code Structure
- **Modular Design**: Separated concerns across components
- **Configuration-Driven**: Easy addition of new sportsbooks via config
- **Error Resilient**: Comprehensive error handling and recovery
- **Performance Optimized**: Efficient algorithms and minimal resource usage

### Extension Points
- **New Sportsbooks**: Add configurations in `config.js`
- **Additional Sports**: Extend sport detection and parsing logic
- **Enhanced Analytics**: Extend `analytics.js` with new calculations
- **UI Improvements**: Modify `analytics.html` and styling

### Monitoring and Debugging
- **Console Logging**: Detailed logging throughout the application
- **Database Queries**: SQL query logging for performance analysis
- **Extension DevTools**: Chrome extension debugging tools
- **Error Tracking**: Comprehensive error capture and reporting

## Data Privacy and Legal Considerations

### Privacy Protection
- **Local Storage**: All data remains on user's machine
- **No External Transmission**: No data sent to external servers
- **User Control**: Complete control over data collection and retention

### Legal Compliance
- **Web Scraping**: Respects robots.txt and rate limiting
- **Terms of Service**: Users responsible for compliance with site ToS
- **Data Use**: Educational and analytical purposes only

### Responsible Usage
- **Rate Limiting**: Prevents excessive server load
- **Error Handling**: Graceful degradation on access restrictions
- **User Education**: Clear documentation of capabilities and limitations

## Troubleshooting

### Common Issues

#### High EV/Arbitrage Percentages (>20%)
- **Cause**: Usually indicates 3-way market data or calculation errors
- **Solution**: Check console for "Skipping 3-way market" messages
- **Status**: Fixed in v1.1 with proper 3-way market detection

#### Extension Not Detecting Odds
- **Check**: Verify you're on a supported sportsbook website
- **Check**: Open browser DevTools console for error messages
- **Check**: Ensure extension is enabled in Chrome Extensions page

#### Database Connection Issues
- **Check**: Supabase Docker containers are running: `docker ps`
- **Restart**: `cd supabase-local && docker compose restart`
- **Logs**: `docker logs supabase-db` for database errors

#### No Opportunities Found
- **Expected**: Real arbitrage opportunities are rare (1-5% of games)
- **Check**: Lower filter thresholds (Min EV: 0%, Min Profit: 0%)
- **Verify**: Multiple sportsbooks are being scraped (need 3+ for analysis)

### Console Debugging

#### Expected Console Messages
```
Calculating EV opportunities from: 15 games
Game: Team A @ Team B
Best odds - Home: -110, Away: +105
Fair probabilities - Home: 52.4%, Away: 47.6%
```

#### Warning Messages
```
SUSPICIOUS HIGH +EV: 73.0% for BetMGM on Team A
Skipping 3-way market: Draw @ Team B - 3-way markets not yet supported
SUSPICIOUS HIGH ARBITRAGE: 15.2% for Team A @ Team B
```

#### Error Messages
```
Failed to connect to Supabase: [error details]
Extension context invalidated, stopping scraper
```

---

*Last Updated: August 2024*
*Version: 1.0*
*Author: Created from scratch for sports betting analytics*