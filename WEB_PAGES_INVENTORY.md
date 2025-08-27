# OddsCentral Web Pages Inventory & Organization Plan

## Current Web Pages Status

### 🟢 Production-Ready Pages

#### 1. **flagged_events_viewer.html**
- **Location:** `/Users/joelsalazar/OddsCentral/flagged_events_viewer.html`
- **Purpose:** Dashboard for reviewing events that need integration
- **Features:**
  - Real-time statistics display
  - Missing elements analysis
  - Filterable events table
  - CSV export functionality
  - API integration for live data
- **Backend:** `flagged_events_api.py` (Flask server on port 8081)
- **Status:** ✅ Fully functional with API backend

#### 2. **analytics.html**
- **Location:** `/sportsbook-scraper-extension/analytics.html`
- **Purpose:** Betting analytics and EV calculations
- **Features:**
  - Expected value calculations
  - Arbitrage opportunity detection
  - Historical odds tracking
  - Fairline calculations
- **JavaScript:** `analytics.js`
- **Status:** ✅ Production feature (Version 1.3 - August 2025)

#### 3. **sportsbook.html**
- **Location:** `/sportsbook-scraper-extension/sportsbook.html`
- **Purpose:** Live sportsbook odds display
- **Features:**
  - Real-time odds updates
  - Multiple bookmaker comparison
  - Filter persistence
  - Date/time handling
- **JavaScript:** `sportsbook.js`
- **Status:** ✅ Production feature with filter persistence

### 🟡 Development/Testing Pages

#### 4. **simple-panel.html**
- **Location:** `/sportsbook-scraper-extension/simple-panel.html`
- **Purpose:** Simple API testing interface
- **Features:**
  - API connection testing
  - Basic data sending
  - No complex UI
- **JavaScript:** `simple-panel.js`, `simple-api-test.js`
- **Status:** 🔧 Development tool

#### 5. **endpoints.html**
- **Location:** `/sportsbook-scraper-extension/endpoints.html`
- **Purpose:** API endpoint testing and discovery
- **Features:**
  - Endpoint listing
  - Request testing
  - Response inspection
- **JavaScript:** `endpoints.js`
- **Status:** 🔧 Development tool

#### 6. **troubleshoot.html**
- **Location:** `/sportsbook-scraper-extension/troubleshoot.html`
- **Purpose:** System troubleshooting interface
- **Features:**
  - Error log viewing
  - System diagnostics
  - Debug information
- **JavaScript:** `troubleshoot.js`
- **Status:** 🔧 Development tool

#### 7. **diagnostics.html**
- **Location:** `/sportsbook-scraper-extension/diagnostics.html`
- **Purpose:** System health and performance monitoring
- **Features:**
  - Performance metrics
  - System status checks
  - Resource usage
- **JavaScript:** `diagnostics.js`
- **Status:** 🔧 Development tool

### 🔴 Configuration Pages

#### 8. **config.html**
- **Location:** `/sportsbook-scraper-extension/config.html`
- **Purpose:** Extension configuration management
- **Features:**
  - Settings management
  - User preferences
  - API configuration
- **Status:** ⚠️ Needs consolidation with web-first approach

#### 9. **popup.html**
- **Location:** `/sportsbook-scraper-extension/popup.html`
- **Purpose:** Chrome extension popup interface
- **Features:**
  - Quick status
  - Links to web interfaces
  - Minimal controls
- **JavaScript:** `popup.js`
- **Status:** ⚠️ Should link to web pages, not replicate features

## Recommended Organization Structure

```
/OddsCentral/
├── web/                                    # All web interfaces
│   ├── production/                         # User-facing pages
│   │   ├── dashboard/
│   │   │   ├── index.html                 # Main dashboard
│   │   │   ├── flagged-events.html        # (from flagged_events_viewer.html)
│   │   │   └── assets/
│   │   │       ├── dashboard.css
│   │   │       └── dashboard.js
│   │   ├── analytics/
│   │   │   ├── index.html                 # (from analytics.html)
│   │   │   └── assets/
│   │   │       ├── analytics.css
│   │   │       └── analytics.js
│   │   └── sportsbook/
│   │       ├── index.html                 # (from sportsbook.html)
│   │       └── assets/
│   │           ├── sportsbook.css
│   │           └── sportsbook.js
│   │
│   ├── admin/                              # Administrative interfaces
│   │   ├── config/
│   │   │   ├── index.html                 # Unified configuration
│   │   │   └── assets/
│   │   ├── translations/
│   │   │   ├── index.html                 # Manage nomenclature mappings
│   │   │   └── assets/
│   │   └── integration/
│   │       ├── index.html                 # Process flagged events
│   │       └── assets/
│   │
│   └── dev/                                # Development tools
│       ├── api-test/
│       │   ├── index.html                 # (from simple-panel.html)
│       │   └── assets/
│       ├── endpoints/
│       │   ├── index.html                 # (from endpoints.html)
│       │   └── assets/
│       └── diagnostics/
│           ├── index.html                 # (from diagnostics.html)
│           └── assets/
│
├── api/                                    # API servers
│   ├── flagged_events_api.py
│   ├── main_api.py                        # Future unified API
│   └── requirements.txt
│
├── scripts/                                # Processing scripts
│   ├── matching_engine/
│   │   ├── nomenclature_translator.py
│   │   ├── enhanced_matching_engine.py
│   │   └── matching_engine_sender.py
│   ├── data_collection/
│   │   ├── fetch_reference_data.py
│   │   └── complete_reference_fetcher.py
│   └── testing/
│       ├── direct_db_test.py
│       └── send_odds_to_api.py
│
└── docs/                                   # Documentation
    ├── MATCHING_ENGINE_DOCUMENTATION.md
    ├── WEB_PAGES_INVENTORY.md
    ├── ARCHITECTURE.md
    └── API_REFERENCE.md
```

## Migration Plan

### Phase 1: Organize Existing Pages (Week 1)
1. Create new directory structure
2. Move files to appropriate locations
3. Update internal links and references
4. Test all functionality

### Phase 2: Create Unified Navigation (Week 2)
1. Build main dashboard with navigation
2. Implement consistent header/footer
3. Add user authentication (if needed)
4. Create role-based access

### Phase 3: Consolidate APIs (Week 3)
1. Merge individual APIs into main_api.py
2. Implement proper routing
3. Add API documentation
4. Set up proper CORS handling

### Phase 4: Enhancement (Week 4)
1. Add missing admin interfaces
2. Improve development tools
3. Implement monitoring dashboard
4. Add automated testing

## New Pages to Create

### 1. **Main Dashboard** (`/web/production/dashboard/index.html`)
- Unified entry point
- Navigation to all features
- System status overview
- Recent activity feed

### 2. **Translations Manager** (`/web/admin/translations/index.html`)
- CRUD for mapping tables
- Bulk import/export
- Fuzzy matching testing
- Confidence score adjustments

### 3. **Integration Processor** (`/web/admin/integration/index.html`)
- Review flagged events
- Bulk resolution tools
- API creation interface
- Mapping suggestions

### 4. **System Monitor** (`/web/production/monitor/index.html`)
- Real-time system health
- API performance metrics
- Translation success rates
- Error tracking

## Technical Considerations

### 1. **Shared Resources**
```
/web/shared/
├── css/
│   ├── bootstrap.min.css
│   ├── common.css
│   └── theme.css
├── js/
│   ├── jquery.min.js
│   ├── bootstrap.min.js
│   └── api-client.js
└── img/
    └── logo.png
```

### 2. **API Client Library**
Create unified JavaScript API client:
```javascript
// /web/shared/js/api-client.js
class OddsCentralAPI {
    constructor(baseURL = 'http://localhost:8081') {
        this.baseURL = baseURL;
    }
    
    async getFlaggedEvents() { /* ... */ }
    async resolveEvent(id) { /* ... */ }
    async runMatchingEngine() { /* ... */ }
    // ... other methods
}
```

### 3. **Configuration Management**
- Move from extension storage to web-based config
- Use environment variables for API endpoints
- Implement proper secrets management

## Priority Actions

### Immediate (This Week)
1. ✅ Document current state (this document)
2. 🔄 Start flagged events dashboard (done - `flagged_events_viewer.html`)
3. ⏳ Create main navigation dashboard

### Short Term (Next 2 Weeks)
1. ⏳ Organize file structure
2. ⏳ Consolidate duplicate functionality
3. ⏳ Create admin interfaces

### Long Term (Next Month)
1. ⏳ Implement user authentication
2. ⏳ Add comprehensive monitoring
3. ⏳ Build automated testing suite

## Current Access Points

### Running Services
- **Flagged Events Dashboard:** http://localhost:8081
- **Chrome Extension Pages:** Via extension popup
- **Direct Files:** `file:///path/to/file.html`

### Starting Services
```bash
# API Server for Flagged Events
python flagged_events_api.py

# Simple HTTP Server (for static files)
cd /Users/joelsalazar/OddsCentral
python -m http.server 8080
```

## Summary

We currently have **9 web pages** serving various purposes:
- 3 production-ready (analytics, sportsbook, flagged events)
- 4 development tools
- 2 configuration interfaces

The recommended approach is to:
1. **Organize** into a clear directory structure
2. **Consolidate** duplicate functionality
3. **Enhance** with proper navigation and admin tools
4. **Maintain** the web-first philosophy

This will transform the current "mess of web pages" into a well-organized, professional web application suite.