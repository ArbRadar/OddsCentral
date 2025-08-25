# OddsCentral Scraper - Clean Architecture Implementation Plan (August 2025)

## 🎯 CURRENT IMPLEMENTATION STATUS: IN PROGRESS

**Goal:** Clean, modular scraping system with optional Chrome extension for multiple platforms

## 📋 TERMINOLOGY CLARIFICATION (CRITICAL)
- **Sportsbook** = A page/market from OddsJam (e.g., MLB moneyline, NBA spreads, NFL totals)
- **Bookmaker** = Individual betting companies (DraftKings, FanDuel, bet365, etc.)
- **Platform** = Scraping source (OddsJam, individual bookmaker sites, etc.)

## 🏗️ NEW ARCHITECTURE OVERVIEW

### **Core Principle:** Optional Extension
- **Core System:** Standalone Python + Database (no browser required)
- **Extension:** Optional enhancement for auth + discovery + visual scraping
- **Deployment:** Core system works independently, extension adds convenience

### **Database Schema (IMPLEMENTED)**

#### **1. scraping_platforms** - Define scraping sources
```sql
id, name, type, base_url, scraping_method, auth_required, active
-- Examples: 'oddsjam'/'aggregator', 'draftkings'/'bookmaker'
```

#### **2. platform_auth** - Authentication per platform  
```sql
id, platform_id, auth_type, auth_data, source, expires_at, active
-- auth_data: {'access_token': '...', 'cf_clearance': '...'}
-- source: 'manual', 'extension', 'api'
```

#### **3. scraping_targets** - What to scrape from each platform
```sql
id, platform_id, target_type, name, config, enabled, priority
-- config: {'sport': 'baseball', 'league': 'mlb', 'market': 'moneyline'}
-- Examples: 'MLB Moneyline', 'NFL Spread', 'NBA Total'
```

#### **4. known_endpoints** - API patterns (hardcoded + discovered)
```sql
id, platform_id, endpoint_pattern, method, description, source, active
-- Pattern: '/api/backend/oddscreen/v2/game/data?sport={sport}&league={league}'
```

#### **5. bookmaker_filters** - Secondary optimization
```sql
id, platform_id, bookmaker_name, enabled, priority
-- Filter individual betting companies within API responses
```

### **Current Implementation Status:**

#### ✅ **COMPLETED:**
1. **Database schema created** - All new tables in place
2. **OddsJam platform configured** - Initial data populated
3. **Known endpoints defined** - Hardcoded API patterns
4. **Target configuration** - MLB enabled, others disabled by default
5. **Bookmaker filters** - Major books enabled (DraftKings, FanDuel, etc.)

#### 🔄 **IN PROGRESS:**
1. **Update scrapy spider** - Use new schema instead of old URL manager
2. **Create web configuration interface** - Manage all settings
3. **Extension integration points** - Auth refresh + endpoint discovery APIs

#### 📅 **NEXT STEPS:**
1. **Modernize scrapy monitor** - Read from scraping_targets table
2. **Build web interface** - Replace multiple HTML pages with unified config
3. **Extension API endpoints** - For auth token updates
4. **Test end-to-end workflow** - Core system without extension
5. **Extension integration** - Optional enhancement features

## 🔧 IMPLEMENTATION PLAN DETAILS

### **Phase 1: Core System (No Extension Required)**

**Objective:** Working scraper using database configuration + manual auth

#### **Tasks:**
1. **Update odds_spider.py:**
   - Replace URL manager with scraping_targets queries
   - Load auth from platform_auth table
   - Use known_endpoints patterns
   - Apply bookmaker_filters

2. **Update scrapy_monitor.py:**
   - Query enabled scraping_targets
   - Generate API URLs using endpoint patterns + target config
   - Handle authentication per platform

3. **Create unified web interface:**
   - Platform management
   - Target configuration (enable/disable sports/leagues)
   - Auth token management (manual entry)
   - Bookmaker filtering

#### **Expected Result:** 
- Scrapes OddsJam without extension
- Manual auth token updates (every few weeks)
- Web-based configuration management
- Clean, maintainable codebase

### **Phase 2: Optional Extension Integration**

**Objective:** Extension enhances core system but isn't required

#### **Extension Features:**
1. **Auto auth token capture:**
   - Intercept OddsJam cookies during normal browsing
   - POST to core system: `POST /api/auth/refresh`
   - Zero-config authentication

2. **Endpoint discovery:**
   - Monitor network requests for new API patterns
   - Report to core system: `POST /api/endpoints/discovered`
   - Automatic adaptation to API changes

3. **Visual scraping assistance:**
   - For platforms without APIs (future bookmaker sites)
   - Coordinated with core system

4. **Quick configuration:**
   - "Save current page" button for easy target addition
   - Browser-based configuration shortcuts

#### **Integration Points:**
```javascript
// Extension → Core System APIs
POST /api/auth/refresh        // Update auth tokens
POST /api/endpoints/discovered // Report new endpoints  
POST /api/targets/quick-add   // Add current page as target
GET  /api/status              // Check core system status
```

### **Phase 3: Multi-Platform Expansion**

**Objective:** Add other platforms (DraftKings, FanDuel direct scraping)

#### **Framework Ready For:**
1. **API-based platforms** - Similar to OddsJam
2. **Visual scraping platforms** - Using extension coordination
3. **Hybrid approaches** - Mix of API + visual as needed

## 🗂️ FILE ORGANIZATION PLAN

### **Clean up existing files:**
```
sportsbook-scraper-extension/
├── web-interface/
│   ├── index.html              # Unified configuration interface
│   ├── platform-manager.js     # Platform CRUD operations
│   ├── target-manager.js       # Sport/league/market configuration  
│   ├── auth-manager.js         # Authentication management
│   └── dashboard.js            # Monitoring and stats
├── extension/ (optional)
│   ├── background.js           # Auth capture + endpoint discovery
│   ├── content.js             # Visual scraping coordination
│   └── api-integration.js     # Core system communication
└── archive/ (move old files)
    ├── old-url-manager/
    ├── old-diagnostics/
    └── old-analytics/
```

### **Update scrapy structure:**
```
scrapy-scraper/
├── core/
│   ├── platform_managers/
│   │   ├── oddsjam_manager.py  # OddsJam-specific logic
│   │   └── base_manager.py     # Common interface
│   ├── config/
│   │   ├── database_config.py  # Load from database
│   │   └── auth_manager.py     # Handle platform authentication
│   └── scrapers/
│       ├── api_scraper.py      # Generic API scraping
│       └── visual_scraper.py   # Browser automation
├── spiders/
│   └── unified_spider.py       # Single spider using new architecture
└── monitor/
    └── unified_monitor.py      # Replaces scrapy_monitor.py
```

## 🚀 USER EXPERIENCE GOALS

### **Without Extension (Core System Only):**
1. **Setup:** Configure platforms, add auth tokens manually, enable targets
2. **Operation:** Automatic scraping based on configuration
3. **Maintenance:** Update auth tokens when they expire (weeks/months)
4. **Management:** Web interface for all configuration

### **With Extension (Enhanced Experience):**
1. **Setup:** Install extension, browse OddsJam once (auto-captures auth)
2. **Operation:** Same automatic scraping + auto-refreshed auth tokens
3. **Maintenance:** Minimal - auth tokens refresh automatically
4. **Management:** Same web interface + browser shortcuts

### **Benefits of This Architecture:**
- ✅ **Simple deployment** - Core system runs on servers without browsers
- ✅ **Enhanced automation** - Extension adds convenience when available
- ✅ **Future-ready** - Framework supports multiple platforms + scraping methods
- ✅ **Clean separation** - No more confusion about what's required vs optional
- ✅ **Maintainable** - Modular design instead of tangled legacy code

## 🎯 SUCCESS CRITERIA

### **Phase 1 Complete When:**
- [ ] Scrapes OddsJam MLB using database configuration
- [ ] Web interface manages all settings
- [ ] No dependency on Chrome extension
- [ ] Clean, documented codebase

### **Phase 2 Complete When:**
- [ ] Extension automatically refreshes auth tokens
- [ ] Extension discovers new endpoints
- [ ] Core system works with or without extension
- [ ] Extension status visible in web interface

### **Phase 3 Complete When:**
- [ ] Framework supports multiple platforms
- [ ] Easy to add new scraping sources
- [ ] Visual + API scraping coordination works
- [ ] Scalable architecture for future expansion

---

## LEGACY CONTENT BELOW (For Historical Reference)

# Sportsbook Scraper Extension - Complete Implementation History

## Database Information
- **Type**: Supabase REST API (localhost:54320)
- **Connection**: Use REST API with anon key
- **URL**: http://localhost:54320/rest/v1/
- **Key**: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
- **Location**: Contains 835+ games with 980+ odds records
- **Coverage**: Variable coverage depending on scraping strategy
- **Tables**: games, odds, odds_history, discovered_endpoints, sportsbook_urls, scraping_jobs, scraping_config, batch_scraping_jobs
- **IMPORTANT**: Database stores timestamps in UTC format

## 🚨 CRITICAL: Database Connectivity Issues (RECURRING PROBLEM)

### **Known Issue Pattern**:
PostgREST frequently fails to recognize tables/columns even when they exist in PostgreSQL. This results in:
- **404 Not Found** errors for valid endpoints
- **401 Unauthorized** errors due to Row Level Security
- **Empty responses** `{}` instead of data arrays `[]`
- **Schema cache not updating** after table changes

### **Systematic Fix Procedure (ALWAYS RUN THESE STEPS)**:
```bash
# 1. Restart PostgREST container
docker compose restart rest

# 2. Force schema cache reload
docker exec supabase-rest pkill -USR1 postgrest

# 3. Check table access permissions
docker exec -i supabase-db psql -U postgres -d postgres -c "
GRANT SELECT, INSERT, UPDATE, DELETE ON discovered_endpoints TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON scraping_jobs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON scraping_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON sportsbook_urls TO anon;
"

# 4. Disable Row Level Security on automation tables
docker exec -i supabase-db psql -U postgres -d postgres -c "
ALTER TABLE sportsbook_urls DISABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_endpoints DISABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE scraping_config DISABLE ROW LEVEL SECURITY;
"

# 5. Test API access
curl "http://localhost:54320/rest/v1/discovered_endpoints?limit=1" \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# 6. If still failing, restart entire stack
docker compose down && sleep 2 && docker compose up -d
```

### **Common Error Messages & Solutions**:
- **`Column 'scraping_method' does not exist`** → Run step 1-2 (PostgREST restart)
- **`HTTP 401: Unauthorized`** → Run step 3-4 (Permissions & RLS)
- **`HTTP 404: Not Found`** → Run step 1-2, then step 6 if needed
- **`Failed to load URLs`** → Complete all steps 1-6

### **Root Causes**:
1. **PostgREST Schema Caching**: PostgREST caches database schema and doesn't auto-refresh
2. **Row Level Security**: Default RLS blocks anon user access to new tables
3. **Permission Issues**: New tables don't inherit anon user permissions automatically
4. **Container State**: PostgREST sometimes gets into corrupted state requiring full restart

## 🚀 SCRAPY MONITOR START/STOP PROCEDURES

### **✅ CORRECT PostgREST ENDPOINTS (VERIFIED)**:
- **Working URL Format**: `http://localhost:54320/games` (NO `/rest/v1/`)
- **Broken URL Format**: `http://localhost:54320/rest/v1/games` (Returns 404)

**📋 Verified Working Endpoints:**
- ✅ `http://localhost:54320/games` - Returns game data
- ✅ `http://localhost:54320/odds` - Returns odds data  
- ✅ `http://localhost:54320/discovered_endpoints` - Returns API endpoints
- ✅ `http://localhost:54320/scraping_config` - Returns monitor config
- ✅ `http://localhost:54320/scraping_jobs` - Returns job history
- ✅ `http://localhost:54320/sportsbook_urls` - Returns URL manager data

### **🚀 START SCRAPY MONITOR:**
```bash
cd /Users/joelsalazar/OddsCentral/scrapy-scraper
python scrapy_monitor.py
```

### **⏹️ STOP SCRAPY MONITOR (FAST SHUTDOWN):**

**Option 1: Ctrl+C (Fastest - Immediate)**
- Press `Ctrl+C` in the terminal running the monitor
- Catches KeyboardInterrupt and stops immediately

**Option 2: Kill by PID (If Ctrl+C doesn't work)**
```bash
ps aux | grep scrapy_monitor
kill <PID>
```

**Option 3: Force Kill (Last resort)**
```bash
pkill -f scrapy_monitor
```

### **⚠️ SLOW SHUTDOWN ISSUE (FIXED):**
- **Problem**: Monitor had long sleep periods (30-60s) without checking shutdown flag
- **Solution**: Modified sleep to check `self.running` every second for fast shutdown
- **Result**: Shutdown now takes 1-2 seconds instead of up to 60 seconds

## Project Evolution Summary

### Phase 1: Initial Viewport Strategy (FAILED)
- ❌ Implemented aggressive viewport manipulation (5000x3000px)
- ❌ Multi-directional scrolling strategy
- ❌ AG Grid virtual row forcing
- **RESULT**: Only 26.6% coverage (95/356 games had odds)
- **LESSON**: Single-tab viewport manipulation insufficient for dynamic content

### Phase 2: Multi-Tab Strategy (IMPLEMENTED)
- ✅ Chrome native zoom API (chrome.tabs.setZoom)
- ✅ Automatic tab coordination via background script
- ✅ Dynamic zoom calculation (25%-80% based on content)
- ✅ Position-based tab assignment (4 tabs = 100% coverage)
- **RESULT**: Significantly improved coverage

### Phase 3: API-Based Scraping System (IMPLEMENTED)
- ✅ API endpoint discovery and interception
- ✅ Hybrid scraping modes (Visual/API/Hybrid)
- ✅ Comprehensive diagnostics system
- ✅ Configuration management
- **RESULT**: Alternative to high-RAM visual scraping

## Current Architecture (August 2025)

### Extension Structure
```
manifest.json (v1.0.3) - "Sportsbook Data Scraper v2"
├── background.js - Service worker, data processing, tab coordination
├── content.js - Main content script with multi-strategy scraping
├── popup.js/popup.html - Extension popup interface
├── config.js/config.html - Configuration interface
├── diagnostics.js/diagnostics.html - Troubleshooting interface
├── api-scraper.js - API-based scraping implementation
├── api-interceptor.js - Network request interception
├── analytics.js/analytics.html - Data analytics viewer
├── sportsbook.js/sportsbook.html - Raw data viewer
└── endpoints.js/endpoints.html - API endpoint viewer
```

### Key Configuration Files

**manifest.json** (Current: v1.0.3):
```json
{
  "content_scripts": [{
    "matches": ["https://*/*", "http://*/*"],
    "exclude_matches": [
      "chrome://*/*", 
      "chrome-extension://*/*",
      "file://*/analytics.html"
    ],
    "js": ["content.js"],
    "run_at": "document_end",
    "all_frames": false
  }]
}
```

## Core Scraping Strategies

### 1. Visual DOM Scraping (Default)
**Location**: content.js lines 2800-3200
- Extracts data from rendered AG Grid tables
- Multi-tab coordination for full coverage
- Dynamic zoom optimization
- Time parsing with multiple format support

**Key Functions**:
- `checkAndSendUpdates()` - Main scraping orchestration
- `performVisualScraping()` - DOM extraction logic
- `extractTeamData()` - Team name extraction
- `parseStartTime()` - Game time parsing
- `implementMultiTabStrategy()` - Tab coordination

### 2. API-Based Scraping (Alternative)
**Location**: api-scraper.js
- Intercepts network requests for odds data
- Polls discovered endpoints automatically
- Lower RAM usage than visual scraping
- Requires endpoint discovery phase

**Key Classes**:
- `APIScraper` - Main API scraping class
- API endpoint management and polling
- Response parsing and standardization

### 3. Hybrid Mode (Recommended)
- Uses API scraping when available
- Falls back to visual scraping if API fails
- Best of both approaches

## Multi-Tab Coordination System

**Background Script Management**:
- `tabPositionRegistry` Map tracks tab positions per URL
- `REGISTER_TAB_POSITION` message assigns positions 0-3
- `OPEN_COORDINATED_TABS` creates additional tabs
- Auto-cleanup after 10 minutes

**Content Script Coordination**:
- `registerTabPosition()` requests position assignment
- `positionTabAtDesignatedLocation()` scrolls to assigned section
- `calculateOptimalZoomLevel()` determines zoom (25%-80%)
- Each tab covers 25% of content area

## API Discovery and Interception System

### Network Interception (api-interceptor.js)
```javascript
// Monitors XHR, Fetch, WebSocket requests
// Identifies odds-related endpoints
// Captures request/response patterns
// Forwards discoveries to background script
```

**Endpoint Patterns Detected**:
- `/api/*odds*`, `/api/*markets*`, `/api/*events*`
- `*betting*`, `*lines*`, `*prices*`
- JSON responses with odds data structures

**Storage**: `discoveredEndpoints` Map in background.js
- Organized by domain
- Includes method, path, headers, response patterns
- Persistent during session

### Configuration System

**Storage Location**: chrome.storage.local['scraperConfig']
```javascript
{
  scrapingStrategy: {
    method: 'visual' | 'api' | 'hybrid'
  },
  // Other configuration options
}
```

**Config Interface**: config.html
- Scraping Strategy tab for method selection
- Visual DOM settings
- API configuration options

## Diagnostics System (diagnostics.html)

### Comprehensive Troubleshooting
**Tab Detection**:
- Queries background script for active sportsbook tabs
- Falls back to pattern matching for sportsbook URLs
- Shows current domain, URL, tab count

**API Status Monitoring**:
- Endpoint discovery status
- API scraper loading status
- Interceptor functionality
- Configuration verification

**Troubleshooting Recommendations**:
- Mode-specific guidance
- Common issue resolution
- Step-by-step solutions

## Data Pipeline and Storage

### Data Processing Flow
1. **Content Script** scrapes odds data
2. **Background Script** processes and validates
3. **Supabase REST API** stores in database
4. **Analytics/Viewer** displays processed data

### Database Schema
**games table**:
- game_id (primary key)
- sport, league, home_team, away_team
- start_time, start_time_parsed
- created_at (UTC timestamp)

**odds table**:
- id (primary key)
- game_id (foreign key)
- sportsbook, home_odds, away_odds, draw_odds
- created_at (UTC timestamp)

**odds_history table**:
- Historical odds tracking
- Change detection and logging

### Data Quality Monitoring
**Background Script Tracking**:
```javascript
globalDataQuality = {
  totalOddsProcessed: 0,
  completeOddsInserted: 0,
  incompleteOddsSkipped: 0,
  gamesWithIncompleteData: 0,
  incompleteByReason: Map(),
  incompleteByBook: Map()
}
```

## Time Parsing and Timezone Handling

### parseStartTime Function (content.js:1109-1313)
**Supported Formats**:
- "8/22 • 4:40PM" - Standard format
- "Today 8:00 PM" - Relative times
- "Tomorrow 3:30 PM" - Next day
- "7 Top", "3 Bottom" - Live game innings
- "Final" - Completed games

**Timezone Considerations**:
- Database stores in UTC
- Local time display in interfaces
- Precise filtering without timezone confusion

### Recent Fixes (August 2025)
- Added bullet character variants (• and ·)
- Debug logging for unparsed formats
- Character code analysis for troubleshooting

## Current Issues and Solutions (As of August 2025)

### 1. Content Script Loading Problems
**Issue**: New content script versions not loading due to Chrome caching
**Solution Applied**:
- Changed manifest content script timing to "document_end"
- Added explicit URL matching patterns
- Conspicuous debug logging: "🚀🚀🚀 SPORTSBOOK SCRAPER V2 LOADED 🚀🚀🚀"
- Version bumping in manifest.json

### 2. API Scraper Loading Failures
**Issue**: window.APIScraper not available after script injection
**Solution Applied**:
- Dual loading approach: fetch+eval then fallback to script injection
- Better error handling and logging
- Async/await pattern for proper initialization
- Multiple retry attempts with progressive delays

### 3. Timezone and Data Filtering
**Issue**: 1-hour filter showing old data, 6-hour filter showing recent data
**Root Cause**: Database UTC vs local time filtering mismatch
**Solution Applied**:
- Precise UTC-based filtering (removed liberal time windows)
- Exact hour calculation: `new Date(Date.now() - (hoursBack * 60 * 60 * 1000))`
- Consistent UTC timestamps throughout pipeline

### 4. Endpoint Discovery State Management
**Issue**: Switching between Visual/API/Hybrid modes breaks endpoint discovery
**Solution Applied**:
- Always load API interceptor regardless of mode
- Prevent endpoint clearing during mode switches
- Duplicate detection to avoid endpoint spam
- Better state management in discoveredEndpoints Map

## File-by-File Change Summary

### manifest.json (v1.0.3)
- Extension name: "Sportsbook Data Scraper v2"
- Content script matching: specific URL patterns
- Exclude chrome:// and chrome-extension:// URLs
- Run timing: "document_end" instead of "document_idle"
- All frames: false (main frame only)

### content.js (Major Refactor)
**Lines 38-41**: Enhanced debug logging with version identifier
**Lines 50-82**: Async configuration loading with error handling
**Lines 84-200**: Async initializeScrapers() function with dual API loading
**Lines 1153-1157**: Enhanced parseStartTime with bullet character variants
**Lines 3200-3210**: CHECK_API_STATUS message handler for diagnostics

### background.js (Data Pipeline)
**Lines 533-579**: Fixed timezone handling in getAnalyticsData()
- Precise UTC-based filtering
- Removed liberal time windows
- Better logging for debugging

**Lines 876-894**: Added CONTENT_SCRIPT_LOADED handler
**Lines 1017-1047**: Added GET_ACTIVE_TABS handler
**Lines 1245-1269**: Enhanced API endpoint storage with duplicate detection
**Lines 1315-1321**: Improved endpoint clearing with better logging

### api-scraper.js (API Implementation)
**Lines 1-2**: Added loading debug message
**Lines 360-362**: Added export confirmation logging
- Class properly exported to window.APIScraper
- Better error reporting for initialization failures

### diagnostics.js (Complete Rewrite)
**Previously corrupted, completely rewritten**
- Tab discovery via GET_ACTIVE_TABS message
- Fallback to URL pattern matching
- Comprehensive API status checking
- Mode-specific troubleshooting recommendations
- Auto-refresh every 30 seconds (reduced from 5 seconds)

## Testing and Validation

### Extension Installation Testing
1. Complete removal from chrome://extensions
2. Fresh "Load unpacked" installation
3. Console verification: "🚀🚀🚀 SPORTSBOOK SCRAPER V2 LOADED 🚀🚀🚀"
4. API loading verification: "✅ window.APIScraper available"

### Data Filtering Testing
1. Check 1-hour filter shows precise last 60 minutes
2. Verify 6-hour filter shows exact 6 hours
3. Confirm UTC timestamps in console logs
4. Validate data counts match expectations

### Multi-Mode Testing
1. Switch between Visual/API/Hybrid modes
2. Verify endpoint discovery persists across switches
3. Confirm diagnostics show correct status
4. Test fallback mechanisms

## Performance Optimizations

### Memory Usage
- API scraping reduces RAM usage vs visual scraping
- Tab coordination prevents redundant processing
- Endpoint caching reduces network requests

### Network Efficiency
- Duplicate endpoint detection
- Request batching where possible
- Intelligent retry mechanisms

### Database Efficiency
- Duplicate record detection
- Batch inserts for odds data
- Cleanup of old data based on configuration

## Debugging and Troubleshooting

### Console Logging Strategy
**Content Script**: Prefixed with script identifier
**Background Script**: Detailed with function context
**Diagnostics**: User-friendly status messages

### Common Issues and Solutions
1. **No data in viewers**: Check timezone filtering, verify database connection
2. **API scraper not loading**: Check console for loading errors, try extension reload
3. **Endpoints not discovered**: Browse sportsbook to trigger network requests
4. **Tab coordination issues**: Check background script activeTabs Map

### Debug Functions
```javascript
// Available in browser console on sportsbook pages
window.debugAllColumns() // Inspect grid columns
window.unparsedTimeFormats // View failed time parsing attempts
```

## Future Considerations

### Scalability
- Multi-sport configuration expansion
- Additional sportsbook site support
- Enhanced API discovery patterns

### Reliability
- Better error recovery mechanisms
- Enhanced state persistence
- Improved cache management

### User Experience
- More intuitive configuration interface
- Better progress indicators
- Enhanced diagnostics information

## Critical Commands and Procedures

### Force Extension Reload
1. chrome://extensions → Remove extension
2. Wait 5+ seconds
3. Load unpacked → Select extension folder
4. Verify new version logs in console

### Database Connection Verification
```javascript
// In background script console
console.log('Supabase status:', !!supabaseClient);
// Should show connection details
```

### Manual Tab Coordination Reset
```javascript
// In background script console
tabPositionRegistry.clear();
console.log('Tab registry cleared');
```

### Endpoint Discovery Reset
```javascript
// In background script console
discoveredEndpoints.clear();
console.log('Endpoints cleared, browse sportsbook to rediscover');
```

## 🎯 COMPLETE API ENDPOINT DISCOVERY AND SCRAPING WORKFLOW (VERIFIED WORKING)

### **Phase 1: API Endpoint Discovery (Automatic Process)**

#### **Smart Discovery Process**:
1. **Open OddsJam page** in Chrome with extension installed (e.g., `https://oddsjam.com/mlb/screen/moneyline`)
2. **Extension automatically captures relevant API calls**
   - **Default Mode**: "Sportsbook Only" - Only captures APIs on sportsbook domains (RECOMMENDED)
   - **Manual Mode**: "Manual Only" - Only captures when explicitly enabled  
   - **Disabled Mode**: "Disabled" - No API capture (for preventing endpoint pollution)
   - API interceptor (`api-interceptor.js`) monitors network requests with smart filtering
   - Background script (`background.js`) stores discovered endpoints in database
   - **No user action needed** - just browse OddsJam normally

3. **Key Discovered Endpoints** (verified working):
   - `/api/backend/oddscreen/v2/game/data?sport=baseball&league=mlb&bet_type=moneyline` ✅
   - `/api/backend/oddscreen/v2/game/markets` ✅
   - Additional sport variations automatically discovered

#### **Where to See Discovered Endpoints**:
- **Extension Diagnostics Page**: `chrome-extension://[id]/diagnostics.html`
  - Shows real-time endpoint discovery status
  - Displays API call patterns and success rates
  - Reports current scraping configuration

- **Extension Endpoints Page**: `chrome-extension://[id]/endpoints.html`
  - Full list of all discovered endpoints organized by domain
  - Shows endpoint paths, methods, headers, and response samples
  - Filter and search through captured APIs

- **Database Query**: 
  ```bash
  curl "http://localhost:54320/discovered_endpoints" \
       -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
  ```

- **URL Manager Integration**: `chrome-extension://[id]/url-manager.html`
  - "Endpoints" column shows 🚀 APIs if endpoints discovered
  - Shows 👁️ Visual if no API endpoints found  
  - Click "Save Current URL" to associate page with discovered endpoints

#### **Endpoint-URL Association (Automatic)**:
- **Domain-Based Grouping**: All endpoints from `oddsjam.com` are grouped together
- **Intelligent Association**: URLs saved from OddsJam pages automatically link to relevant API endpoints
- **Persistent Storage**: 
  - `discovered_endpoints` table: Raw API endpoint data with success rates
  - `sportsbook_urls` table: User-saved URLs with endpoint associations
  - `url_manager_urls.json`: Scrapy processing file (auto-generated)

### **Phase 2: Automated API Scraping (Continuous Process)**

#### **Scrapy Monitor Process (VERIFIED WORKING)**:
1. **Polls URL manager** every 30 seconds for active URLs (`active=true`)
2. **Identifies eligible URLs** (not scraped in last 30 seconds, preferred_scraping_method='scrapy')
3. **Loads associated API endpoints** for each eligible URL
4. **Makes direct API calls** to OddsJam endpoints (bypasses webpage rendering)
5. **Parses JSON responses** using OddsScreen API parser
6. **Extracts game and odds data**:
   - Game info (teams, start times, sport, league)
   - Comprehensive odds from 50+ sportsbooks per game
   - Proper data validation and formatting
7. **Stores to database** with metadata (`scraping_source: "url_manager"`, `scraping_method: "api_scraping"`)
8. **Updates URL statistics** (success_count, last_scraped timestamp)

#### **Performance Results (Actual)**:
- ✅ **2 active games found** (Colorado Rockies @ Pittsburgh Pirates, Cardinals @ Rays)
- ✅ **140+ odds records** processed from major sportsbooks
- ✅ **Complete sportsbook coverage**: BetRivers, DraftKings, Caesars, bet365, FanDuel, Betway, etc.
- ✅ **Real-time data**: Current odds with proper timestamps
- ✅ **Fast processing**: ~3 seconds per API endpoint
- ✅ **Error handling**: Validates data completeness, skips incomplete odds

#### **Monitoring and Status**:
- **Real-time Logs**: Monitor scrapy output for live processing status
- **Database Verification**: Query `games` and `odds` tables to see scraped data
- **URL Manager**: `chrome-extension://[id]/url-manager.html`
  - View last scraping times and success counts  
  - Toggle URLs active/inactive
  - Monitor scraping method (scrapy vs visual)

### **Complete Step-by-Step User Workflow**

#### **For Each New Sport/Market to Scrape**:

1. **Set API Capture Mode** (click extension → "🔍 Toggle API Capture")
   - **"Sportsbook Only"** (default): Automatically captures on sportsbook domains only
   - **"Manual Only"**: Only captures when you explicitly enable it
   - **"Disabled"**: No API capture (prevents endpoint pollution)

2. **Navigate to OddsJam page** (e.g., `https://oddsjam.com/mlb/screen/moneyline`)
   - Extension automatically captures relevant API calls (in Sportsbook Only mode)
   - No user interaction needed - just browse the page normally  
   - Let the page load completely to capture all API calls

3. **Save the URL** (optional but recommended)
   - Click extension icon → URL Manager
   - Click "Save Current URL" button
   - URL gets associated with any discovered endpoints

4. **Verify Endpoint Discovery**
   - Check Diagnostics page: Should show "X API endpoints discovered"
   - Check URL Manager: Should show 🚀 X APIs in Endpoints column
   - If showing 👁️ Visual, no APIs were discovered (page uses client-side rendering)

5. **Enable Automated Scraping**
   - In URL Manager, ensure URL is marked "Active" (toggle if needed)
   - Scrapy monitor will automatically start scraping discovered endpoints
   - Check automation dashboard for scraping activity

### **🚀 SOLUTION TO ENDPOINT POLLUTION**

**Problem**: Extension capturing irrelevant APIs from non-sportsbook browsing

**Built-in Solutions**:

#### **Domain Filtering (Default)**
- Only captures APIs from known sportsbook domains:
  - `oddsjam.com`, `fanduel.com`, `draftkings.com`, `caesars.com`
  - `betmgm.com`, `pointsbet.com`, `barstoolsportsbook.com`
- **Result**: Clean, relevant endpoint collection

#### **Toggle Control** 
- **Extension Popup → "🔍 Toggle API Capture"**
- **3 Modes**: 
  - "Sportsbook Only" (default) - Smart domain filtering
  - "Manual Only" - Only when you explicitly enable
  - "Disabled" - No capture at all

#### **Pattern Filtering**
- Only captures URLs matching odds/betting patterns:
  - `/api/*odds*`, `/api/*markets*`, `/api/*games*` 
  - `*betting*`, `*lines*`, `*moneyline*`, etc.

**Best Practice**: Keep default "Sportsbook Only" mode for normal use. Switch to "Disabled" when doing unrelated browsing if needed.

#### **For URLs Without API Endpoints**:
- URL Manager will show 👁️ Visual in Endpoints column
- Use "👁️ Scrape" button for manual visual scraping
- Visual scraping opens tabs and extracts data from DOM

### **Technical Details**

#### **API Interceptor Patterns**:
The extension captures endpoints matching these patterns:
```javascript
// Odds-related endpoints
/api/*odds*, /api/*markets*, /api/*events*
*betting*, *lines*, *prices*
JSON responses with odds data structures

// OddsJam specific patterns (discovered)
/api/backend/oddscreen/v2/game/data
/api/backend/moneyline.json
```

#### **Endpoint Storage Structure**:
```json
{
  "domain": "oddsjam.com",
  "path": "/api/backend/oddscreen/v2/game/data",
  "method": "GET",
  "headers": {"Accept": "application/json"},
  "query_params": "?sport=mlb&market=moneyline",
  "response_pattern": "games_array",
  "last_seen": "2025-08-24T03:30:00Z"
}
```

#### **URL-Endpoint Association**:
```json
{
  "url": "https://oddsjam.com/mlb/screen/moneyline",
  "domain": "oddsjam.com", 
  "associated_endpoints": [
    "/api/backend/oddscreen/v2/game/data?sport=mlb&market=moneyline"
  ],
  "scraping_method": "api", // or "visual" or "hybrid"
  "active": true
}
```

### **Troubleshooting Endpoint Discovery**

#### **If No Endpoints Are Discovered**:
1. **Check Diagnostics Page** - Look for "API interceptor loading" status
2. **Refresh the page** - Some endpoints only load on page refresh
3. **Navigate within the site** - Click filters, change dates, etc. to trigger API calls
4. **Check Console** - Look for network request logs
5. **Try different sports** - Some pages may use different API patterns

#### **If Endpoints Discovered But No Data**:
1. **Check scrapy monitor logs** - Look for parsing errors
2. **Verify endpoint responses** - Test endpoints manually with curl
3. **Check API format** - Response format may have changed
4. **Update parsers** - May need new parsing logic for endpoint format

### **Performance and Scaling**

#### **Endpoint Discovery**:
- **Lightweight**: Only monitors network requests, no performance impact
- **Persistent**: Endpoints stored permanently until manually cleared
- **Domain-wide**: One discovery session can capture endpoints for entire domain

#### **Automated Scraping**:
- **Efficient**: Direct API calls are faster than webpage rendering
- **Reliable**: No browser dependencies once endpoints discovered  
- **Scalable**: Can handle hundreds of endpoints simultaneously
- **Frequency**: Matches OddsJam's native 30-second polling intervals

## 🚀 QUICK START GUIDE (COMPLETE SYSTEM RESTART)

### **1. Start All Services**
```bash
# Start Supabase database and API services
cd /Users/joelsalazar/OddsCentral/supabase-local
docker compose down && sleep 2 && docker compose up -d

# Wait 5 seconds for services to initialize
sleep 5

# Test database connectivity  
curl -s "http://localhost:54320/games?limit=1" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
```

### **2. Configure API Scraping URL**
```bash
# Enable the MLB moneyline URL for API scraping
curl -X PATCH "http://localhost:54320/sportsbook_urls?id=eq.3" \
     -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
     -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
     -H "Content-Type: application/json" \
     -d '{"active":true,"preferred_scraping_method":"scrapy","last_scraped":"2025-08-24T14:00:00+00:00"}'
```

### **3. Start Automated Scraping**
```bash
# Start the Scrapy monitor for continuous API scraping
cd /Users/joelsalazar/OddsCentral/scrapy-scraper
python scrapy_monitor.py

# Expected output:
# 2025-08-24 09:12:19,873 - ScrapyMonitor - INFO - Starting Scrapy Monitor (PID: 23901)
# 2025-08-24 09:12:19,890 - ScrapyMonitor - INFO - Found 1 URLs to scrape from URL manager
# [Processing and scraping output...]
```

### **4. Verify System is Working**
```bash
# Check recent games (should see new games within minutes)
curl -s "http://localhost:54320/games?order=created_at.desc&limit=3" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# Check recent odds (should see API-scraped odds)
curl -s "http://localhost:54320/odds?order=created_at.desc&limit=3&scraping_method=eq.api_scraping" -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
```

### **5. Stop Everything**
```bash
# Stop Scrapy monitor: Ctrl+C in the terminal running scrapy_monitor.py
# Stop Supabase services:
cd /Users/joelsalazar/OddsCentral/supabase-local
docker compose down
```

### **🎯 EXPECTED RESULTS (VERIFIED)**

**When system is working correctly, you should see:**

1. **Scrapy Monitor Logs**:
   ```
   Found 2 games in oddscreen API
   Processing game: 16196-36707-2025-08-24-09
   Game 16196-36707-2025-08-24-09 has 50+ sportsbook rows
   ✅ Game inserted: 16196-36707-2025-08-24-09
   ✅ Odds inserted: DraftKings for 16196-36707-2025-08-24-09
   ✅ Odds inserted: bet365 for 16196-36707-2025-08-24-09
   [... 140+ successful odds insertions ...]
   ```

2. **Database Content**:
   - Fresh game records with current teams and start times
   - Comprehensive odds from 50+ major sportsbooks per game  
   - Records marked with `scraping_method: "api_scraping"`
   - All timestamps in UTC format

3. **Performance**:
   - ~3 seconds processing time per endpoint
   - 2-3 active games found per run
   - 100+ odds records processed per run
   - No errors or missing data (except occasional incomplete odds from specific books)

### **🔧 TROUBLESHOOTING**

**If Scrapy Monitor finds 0 URLs:**
- Check URL is active: `curl "http://localhost:54320/sportsbook_urls?id=eq.3"`
- Verify `active=true` and `preferred_scraping_method=scrapy`
- Ensure `last_scraped` is older than 30 seconds

**If Database connection fails:**
- Restart PostgREST: `docker exec supabase-rest pkill -USR1 postgrest`
- Full restart: `docker compose down && docker compose up -d`

**If Visual scraper still running:**
- Close browser tabs with OddsJam open
- Disable extension temporarily in problematic tabs

---

**Last Updated**: August 24, 2025
**Extension Version**: 1.0.3  
**Status**: PRODUCTION-READY with verified end-to-end API scraping workflow
**Performance**: 140+ odds from 50+ sportsbooks processed in <5 seconds
**Next Priority**: Documentation and user training complete ✅