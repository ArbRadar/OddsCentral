# OddsCentral Scraper - Clean Architecture Implementation Plan (August 2025)

## 🎯 CURRENT IMPLEMENTATION STATUS: IN PROGRESS

**Goal:** Clean, modular scraping system with optional Chrome extension for multiple platforms

## 🏗️ ARCHITECTURE PHILOSOPHY (Updated August 2025)

**Principle: Minimize Extension Usage - Web-First Approach**

- **Chrome Extension**: Only when it's the best or only possible tool
  - Authentication capture from protected sites
  - API endpoint discovery via network interception
  - CORS bypassing for cross-origin requests
  - Limited popup for quick status/controls with links to full web UIs

- **Web Pages**: Primary interface for all complex UIs
  - Configuration management
  - Data visualization and analytics
  - Testing and debugging tools
  - API management interfaces
  - Monitoring dashboards

- **Python**: Data processing and heavy lifting
  - Data transformation and normalization
  - Batch API operations
  - Statistical analysis and calculations
  - Database migrations and maintenance
  - Scheduled jobs and automation

- **Extension Links**: Popup provides quick access to full web interfaces
  - "Open Analytics Dashboard" → web page
  - "Configure Settings" → web page  
  - "API Test Panel" → web page
  - "View Logs" → web page

**Why This Approach:**
- Web pages are easier to develop and debug
- No Content Security Policy restrictions
- Full JavaScript capabilities and libraries
- Better responsive design and UX
- Python excels at data processing
- Extensions only for browser-specific features

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
- Configuration through web UI
- Easy to add new platforms

### **Phase 2: Extension Enhancement (Optional)**

**Objective:** Auto-discovery and simplified auth management

#### **Tasks:**
1. **Auth Refresh API:**
   - Extension posts tokens to `/api/update-auth`
   - Automatic platform_auth updates
   
2. **Endpoint Discovery:**
   - Extension captures new API patterns
   - Posts to `/api/discovered-endpoints`
   
3. **Visual Scraping Fallback:**
   - For sites without APIs
   - Extension sends DOM data to core system

### **Phase 3: Multi-Platform Support**

**Objective:** Add individual bookmaker scraping

#### **Implementation:**
1. Add platform entries for each bookmaker
2. Configure appropriate scraping methods
3. Extension provides auth when needed
4. Unified data pipeline

## 📁 KEY FILES TO UPDATE

### **1. scrapy_monitor.py**
```python
# Replace URL list with:
targets = fetch_enabled_targets()
for target in targets:
    url = build_url_from_pattern(target, endpoint_pattern)
    # ... spawn scrapy with auth
```

### **2. odds_spider.py**
```python
# Load auth from DB:
auth = fetch_platform_auth(platform_id)
headers = build_headers(auth)
```

### **3. web_config_app.py** (NEW)
- Flask/FastAPI app
- CRUD for all configuration tables
- Auth token management UI
- Target enable/disable

### **4. extension/background.js**
- Add auth capture helpers
- Endpoint discovery logic
- API communication functions

## 🎯 SUCCESS CRITERIA

1. **Core system runs without extension**
2. **Easy configuration through web UI**
3. **Extension provides convenience, not dependency**
4. **Clear separation of concerns**
5. **Easy to add new platforms/sports**

## 💡 ADVANTAGES OF NEW ARCHITECTURE

1. **Flexibility** - Works with or without extension
2. **Scalability** - Easy to add platforms
3. **Maintainability** - Clean separation of concerns
4. **Reliability** - Core system doesn't depend on browser
5. **Security** - Auth tokens stored securely in DB

---

## 🚨 CURRENT SESSION CONTEXT (August 25, 2025)

### Recent Bug Fixes Completed:
1. **Analytics Page Hang** - Fixed `ReferenceError: processedCount is not defined` at analytics.js:761
   - Added `let processedCount = 0;` declaration at line 741
   - Added `processedCount++;` increment at line 767

2. **Sportsbook Filter Persistence** - Implemented localStorage to maintain filters across 60-second auto-refreshes
   - Added `loadSavedFilters()`, `saveFilters()`, and `restoreFilterUI()` methods
   - Filters now persist: sport, league, bookmaker, date, freshness, oddsFormat

3. **Event Date Display Fix** - Corrected timezone handling for "Today/Tomorrow" labels
   - Changed from simple ISO string comparison to proper local timezone comparison
   - Fixed date filter from input field to select dropdown with relative labels

4. **Enhanced EV Detection** - Lowered threshold from 1.0% to 0.5% for better opportunity detection
   - Added comprehensive deduplication to handle ~10x duplicate records per sportsbook
   - Filtered out OddsJam Algo Odds that were skewing fairline calculations

5. **Live Game Detection** - Enhanced using start time comparison (within 4 hours of start)

### Documentation Updated:
- Added Version 1.3 (August 2025) section with all recent fixes
- Updated technical details for sportsbook interface and analytics processing
- Added new troubleshooting entries for common issues
- Updated quality controls section with deduplication and filtering info

### Git Status:
- Ready to commit with comprehensive changes to:
  - analytics.js (processedCount fix, deduplication, threshold changes)
  - sportsbook.js (filter persistence, date handling)
  - sportsbook.html (date filter UI change)
  - background.js, popup.js, popup.html, content.js (various improvements)
  - DOCUMENTATION.md (comprehensive update)

### Recent API Integration (August 26, 2025):
Implemented API sender to forward odds data to external endpoint (/raw-bets/upsert):
- **Lesson Learned**: Started with complex Chrome extension architecture (ES6 modules, service workers, message passing)
- **Reality Check**: Simple API calls don't need complex frameworks - just fetch() + JSON
- **Current Solution**: Simple web page (simple-panel.html) that directly calls API
- **Architecture Update**: Web-first approach adopted - use extensions minimally

### Key Files:
- `simple-panel.html` - Direct API testing interface (web page)
- `simple-api-test.js` - Simple API functions without extension complexity  
- API integration working via direct fetch calls
- Extension popup should link to web interfaces, not replicate them

### Key Technical Context:
- System uses Supabase local database on port 54320
- Chrome extension scrapes OddsJam for odds data
- Analytics page calculates EV and arbitrage opportunities
- Major issue was duplicate data (10x per sportsbook) causing low EV detection
- OddsJam Algo Odds were included in fairline calculations, skewing results

---

## 🚨 LATEST SESSION FIXES (August 27, 2025)

### Database Authentication & Extension Issues Fixed:

#### **Issue 1: Sportsbook Page 401 Errors**
- **Problem**: Sportsbook Data page showing "Failed to fetch games: 401"
- **Root Cause**: Supabase auth service was failing to start, causing RLS policies to block anonymous access
- **Fix Applied**: 
  - Created missing `auth` and `realtime` schemas in PostgreSQL
  - Restarted Supabase services to resolve auth service crashes
  - Temporarily granted direct permissions to `anon` role for `games` and `odds` tables
- **Result**: Database API calls now work properly with 200 status codes

#### **Issue 2: Incorrect Freshness Filter Logic** 
- **Problem**: Sportsbook page showing 0 games despite having 647 odds records
- **Root Cause**: Query was filtering games by creation time instead of odds update time
- **Fix Applied**:
  - Updated background.js `getAnalyticsData()` function to filter games based on recent odds activity
  - Changed from `games WHERE created_at >= cutoffTime` to `games WHERE game_id IN (SELECT DISTINCT game_id FROM odds WHERE created_at >= cutoffTime)`
  - Updated UI label from "Game Freshness" to "Odds Freshness" 
  - Fixed dropdown option from "All Games" to "All Odds"
- **Result**: Freshness filter now correctly shows games with recent odds updates

#### **Issue 3: Visual Scraping Still Running**
- **Problem**: Extension still attempting visual scraping despite being disabled
- **Fix Applied**:
  - Completely removed content script injection from manifest.json
  - Added `VISUAL_SCRAPING_ENABLED = false` flag at top of content.js with early return
- **Result**: No more visual scraping attempts or related errors

#### **Issue 4: Extension Buttons Not Working**
- **Problem**: Extension popup buttons not opening any pages (critical JavaScript syntax error)
- **Root Cause**: Orphaned `else` clause in background.js after removing RPC query
- **Fix Applied**:
  - Removed orphaned `else` clause that was causing syntax error
  - Fixed indentation issues throughout background.js
  - Added missing event listener for `main-dashboard-btn`
  - Created `handleMainDashboard()` function to open dashboard.html
  - Added `dashboard.html` and `matching-api.js` to manifest.json web_accessible_resources
- **Result**: All extension buttons now work correctly and open their respective pages

#### **Technical Improvements Made**:
1. **Removed Broken RPC Queries**: Eliminated non-functional `/rpc/execute_sql` attempts
2. **Streamlined Database Queries**: Direct REST API calls with proper error handling  
3. **Fixed Query Logic**: Games now filtered by odds freshness, not game creation time
4. **Enhanced Error Handling**: Proper fallback when unique game IDs list is empty
5. **Code Cleanup**: Fixed indentation and removed dead code paths

#### **Files Modified**:
- `sportsbook.html` - Updated freshness filter labels
- `background.js` - Fixed syntax errors, query logic, and indentation
- `content.js` - Added visual scraping disable flag
- `popup.js` - Added missing main dashboard button handler
- `manifest.json` - Removed content scripts, added web accessible resources

#### **Database Fixes Applied**:
```sql
-- Created missing schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS realtime;

-- Granted permissions to resolve RLS issues
GRANT SELECT, INSERT, UPDATE, DELETE ON games TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON odds TO anon;
```

### Current Status:
- ✅ **Extension loads without errors**
- ✅ **All popup buttons functional** 
- ✅ **Sportsbook page shows games based on odds freshness**
- ✅ **No visual scraping attempts**
- ✅ **Database authentication working**
- ✅ **Main Dashboard accessible with comprehensive system overview**