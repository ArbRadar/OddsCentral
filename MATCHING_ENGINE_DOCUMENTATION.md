# OddsJam to Omenizer Matching Engine Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Core Components](#core-components)
5. [Web Interfaces](#web-interfaces)
6. [API Endpoints](#api-endpoints)
7. [Usage Guide](#usage-guide)
8. [Data Flow](#data-flow)
9. [Troubleshooting](#troubleshooting)
10. [Future Enhancements](#future-enhancements)

---

## System Overview

The Matching Engine is designed to translate OddsJam betting data into Omenizer's nomenclature and match or create events. It handles three primary scenarios:

1. **Event Matching** - Find existing events in Omenizer's calendar
2. **Event Creation** - Create new events when all nomenclature matches
3. **Integration Flagging** - Flag events needing manual translation setup

### Key Features
- **Automatic Translation** - Sports, leagues, teams, bookmakers
- **Fuzzy Matching** - Handles minor spelling variations
- **Event Matching** - ±8 hour tolerance for game times
- **Smart Flagging** - Identifies exactly what needs integration
- **Web Dashboard** - Review and manage flagged events

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   OddsJam Data      │────▶│  Matching Engine    │────▶│   Omenizer API      │
│   (Local Supabase)  │     │                     │     │   (Remote)          │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
                                   │
                                   ▼
                            ┌─────────────────────┐
                            │  Translation Tables │
                            │  - Sports Mapping   │
                            │  - Leagues Mapping  │
                            │  - Teams Mapping    │
                            │  - Bookmakers Map   │
                            └─────────────────────┘
                                   │
                                   ▼
                            ┌─────────────────────┐
                            │   Flagged Events    │
                            │   Web Dashboard     │
                            └─────────────────────┘
```

---

## Database Schema

### Translation Tables

#### 1. `sports_mapping`
```sql
CREATE TABLE sports_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_sport VARCHAR(100) NOT NULL,      -- e.g., "BASEBALL"
    omenizer_sport VARCHAR(100) NOT NULL,     -- e.g., "Baseball"
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_sport, omenizer_sport)
);
```

#### 2. `leagues_mapping`
```sql
CREATE TABLE leagues_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_league VARCHAR(200) NOT NULL,     -- e.g., "MLB"
    oddsjam_sport VARCHAR(100) NOT NULL,      -- e.g., "BASEBALL"
    omenizer_league VARCHAR(200) NOT NULL,    -- e.g., "Major League Baseball"
    omenizer_sport VARCHAR(100) NOT NULL,     -- e.g., "Baseball"
    country VARCHAR(100),
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_league, oddsjam_sport, omenizer_league, omenizer_sport)
);
```

#### 3. `teams_mapping`
```sql
CREATE TABLE teams_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_team VARCHAR(255) NOT NULL,       -- e.g., "Chicago Cubs"
    omenizer_team VARCHAR(255) NOT NULL,      -- e.g., "Chicago Cubs"
    league VARCHAR(200),
    sport VARCHAR(100),
    country VARCHAR(100),
    aliases TEXT[],                           -- Alternative names
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_team, omenizer_team)
);
```

#### 4. `bookmakers_mapping`
```sql
CREATE TABLE bookmakers_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_bookmaker VARCHAR(200) NOT NULL,   -- e.g., "DraftKings"
    omenizer_bookmaker VARCHAR(200) NOT NULL,  -- e.g., "DraftKings"
    bookmaker_uuid UUID,                       -- e.g., "fe6bc0f8-e8a9-4083-9401-766d30817009"
    aliases TEXT[],
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_bookmaker, omenizer_bookmaker)
);
```

#### 5. `countries_mapping`
```sql
CREATE TABLE countries_mapping (
    id SERIAL PRIMARY KEY,
    oddsjam_country VARCHAR(100),
    omenizer_country VARCHAR(100) NOT NULL,
    iso_code_2 CHAR(2),                       -- ISO 3166-1 alpha-2
    iso_code_3 CHAR(3),                       -- ISO 3166-1 alpha-3
    confidence_score DECIMAL(3,2) DEFAULT 1.0,
    last_verified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_country, omenizer_country)
);
```

### Tracking Tables

#### 6. `event_matching`
```sql
CREATE TABLE event_matching (
    id SERIAL PRIMARY KEY,
    oddsjam_game_id VARCHAR(100) NOT NULL,
    omenizer_event_id UUID NOT NULL,
    match_score DECIMAL(3,2),                 -- Confidence in match
    matched_on TEXT[],                        -- Fields used for matching
    event_datetime TIMESTAMP,
    sport VARCHAR(100),
    league VARCHAR(200),
    home_team VARCHAR(255),
    away_team VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_game_id, omenizer_event_id)
);
```

#### 7. `flagged_events`
```sql
CREATE TABLE flagged_events (
    id SERIAL PRIMARY KEY,
    oddsjam_game_id VARCHAR(100) NOT NULL,
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    sport VARCHAR(100) NOT NULL,
    league VARCHAR(200),
    event_datetime TIMESTAMP,
    flag_reason VARCHAR(500) NOT NULL,
    resolution_status VARCHAR(50) DEFAULT 'pending',  -- pending, ready_for_creation, resolved
    translated_sport VARCHAR(100),
    translated_league VARCHAR(200),
    translated_home_team VARCHAR(255),
    translated_away_team VARCHAR(255),
    missing_elements TEXT[],                  -- What's missing for complete translation
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(oddsjam_game_id)
);
```

#### 8. `unmatched_items`
```sql
CREATE TABLE unmatched_items (
    id SERIAL PRIMARY KEY,
    source_system VARCHAR(20) NOT NULL,       -- 'oddsjam' or 'omenizer'
    item_type VARCHAR(20) NOT NULL,           -- 'sport', 'league', 'team', 'bookmaker', 'country'
    item_value VARCHAR(500) NOT NULL,
    context JSONB,                            -- Additional context for matching
    attempt_count INTEGER DEFAULT 1,
    last_attempt TIMESTAMP DEFAULT NOW(),
    resolution_status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_system, item_type, item_value)
);
```

---

## Core Components

### 1. **nomenclature_translator.py**
Core translation engine with fuzzy matching capabilities.

**Key Classes:**
- `NomenclatureTranslator` - Main translation class

**Key Methods:**
- `translate_sport()` - Translate sport names
- `translate_league()` - Translate league + sport combinations
- `translate_team()` - Translate team names with context
- `translate_bookmaker()` - Translate bookmaker names to UUIDs
- `find_matching_event()` - Search Omenizer calendar for matches

**Features:**
- Fuzzy matching using `fuzzywuzzy` library
- Automatic mapping creation
- Confidence scoring
- Comprehensive logging

### 2. **enhanced_matching_engine.py**
Enhanced engine with event creation and flagging logic.

**Key Classes:**
- `EnhancedMatchingEngine` - Extended functionality

**Key Methods:**
- `check_complete_translation()` - Verify all fields can be translated
- `find_or_create_event()` - Main decision logic
- `_create_new_event()` - Create events in Omenizer (stub)
- `_flag_event_for_integration()` - Flag incomplete translations
- `process_game_with_enhanced_matching()` - Main processing pipeline

**Decision Flow:**
1. Try to find existing event match
2. Check if complete translation possible
3. Create new event OR flag for integration

### 3. **matching_engine_sender.py**
Production sender with full translation pipeline.

**Features:**
- Database connection management
- Odds transformation (American to decimal)
- Batch processing
- Error handling and retry logic
- Translation statistics

### 4. **fetch_reference_data.py**
Fetches all sports, leagues, teams from both systems.

**Features:**
- Pagination handling for large datasets
- Automatic mapping creation for exact matches
- Reference data export to JSON
- Comprehensive analysis reports

### 5. **complete_reference_fetcher.py**
Enhanced version for complete dataset collection.

**Features:**
- Full pagination through all Omenizer events
- Complete OddsJam data extraction
- Automatic initial mapping creation
- Performance optimizations

### 6. **direct_db_test.py**
Direct database access bypassing Supabase REST API issues.

**Features:**
- PostgreSQL direct connection
- Proper type conversion handling
- Test mode for API verification

---

## Web Interfaces

### Current Web Pages (TO BE ORGANIZED):

#### 1. **flagged_events_viewer.html** ✅ (Primary Dashboard)
- **Purpose:** Review and manage flagged events
- **Features:**
  - Real-time statistics
  - Missing elements analysis
  - Event filtering and search
  - CSV export
  - Quick actions (resolve, run engine)
- **Status:** Production-ready with API backend

#### 2. **simple-panel.html**
- **Purpose:** Simple API testing interface
- **Features:** Basic API connection testing
- **Status:** Development/testing tool

#### 3. **analytics.html**
- **Purpose:** Betting analytics and EV calculations
- **Features:** Complex odds analysis
- **Status:** Existing production feature

#### 4. **sportsbook.html**
- **Purpose:** Live odds display
- **Features:** Real-time odds tracking
- **Status:** Existing production feature

#### 5. **config.html**
- **Purpose:** Extension configuration
- **Features:** Settings management
- **Status:** Needs consolidation

#### 6. **endpoints.html**
- **Purpose:** API endpoint testing
- **Features:** Endpoint discovery
- **Status:** Development tool

#### 7. **troubleshoot.html**
- **Purpose:** Debugging interface
- **Features:** System diagnostics
- **Status:** Development tool

#### 8. **diagnostics.html**
- **Purpose:** System health checks
- **Features:** Performance monitoring
- **Status:** Development tool

### Recommended Web Organization:
```
/web/
├── production/
│   ├── dashboard.html          (flagged_events_viewer.html)
│   ├── analytics.html          
│   └── sportsbook.html         
├── admin/
│   ├── config.html             
│   ├── translations.html       (new - manage mappings)
│   └── integration.html        (new - process flagged events)
└── development/
    ├── api-test.html           (simple-panel.html)
    ├── endpoints.html          
    ├── diagnostics.html        
    └── troubleshoot.html       
```

---

## API Endpoints

### Flask API Server (`flagged_events_api.py`)

#### 1. **GET /** 
Serve the flagged events viewer interface

#### 2. **GET /api/flagged-events**
Get all flagged events with statistics

**Response:**
```json
{
  "status": "success",
  "stats": {
    "total_flagged": 5,
    "pending_integration": 5,
    "ready_creation": 0,
    "most_common_missing": "home_team:Chicago Cubs"
  },
  "missing_elements": [
    ["home_team:Chicago Cubs", 2],
    ["away_team:Los Angeles Angels", 2]
  ],
  "events": [...]
}
```

#### 3. **POST /api/flagged-events/:game_id/resolve**
Mark a flagged event as resolved

#### 4. **POST /api/run-matching-engine**
Execute the matching engine on recent games

#### 5. **GET /api/export-csv**
Export flagged events as CSV file

---

## Usage Guide

### Initial Setup

1. **Create Database Schema**
```bash
docker exec -i supabase-db psql -U postgres -d postgres < matching_engine_schema.sql
```

2. **Install Dependencies**
```bash
pip install fuzzywuzzy python-levenshtein psycopg2-binary flask requests
```

3. **Fetch Reference Data**
```bash
python fetch_reference_data.py
```

### Running the System

#### 1. **Process Games with Matching**
```bash
python enhanced_matching_engine.py
```

#### 2. **Start Web Dashboard**
```bash
python flagged_events_api.py
# Visit http://localhost:8081
```

#### 3. **Send Odds with Translation**
```bash
python matching_engine_sender.py
```

### Workflow

1. **Automatic Processing**
   - System attempts to match/translate all data
   - Creates events when possible
   - Flags incomplete translations

2. **Manual Review**
   - Access web dashboard
   - Review flagged events
   - Identify missing translations

3. **Integration**
   - Add missing teams/leagues to Omenizer
   - Update mapping tables
   - Re-run matching engine

4. **Monitoring**
   - Track success rates
   - Review unmatched items
   - Improve fuzzy matching rules

---

## Data Flow

### Translation Pipeline

```
OddsJam Game Data
     │
     ▼
Check Sport Translation ──────► Found? ──► Use Translation
     │                           │
     │                           ▼
     │                        Not Found ──► Fuzzy Match ──► Log Unmatched
     ▼
Check League Translation ─────► Found? ──► Use Translation  
     │                           │
     │                           ▼
     │                        Not Found ──► Fuzzy Match ──► Log Unmatched
     ▼
Check Team Translations ──────► Found? ──► Use Translation
     │                           │
     │                           ▼
     │                        Not Found ──► Fuzzy Match ──► Log Unmatched
     ▼
All Translated? 
     │
     ├─► YES ──► Find/Create Event ──► Send to API
     │
     └─► NO ───► Flag for Integration ──► Web Dashboard
```

### Event Matching Logic

```
Search Omenizer Calendar
     │
     ├─► Home Team Match (>80% fuzzy score)
     ├─► Away Team Match (>80% fuzzy score)  
     ├─► Sport Match
     └─► DateTime Match (±8 hours tolerance)
           │
           ▼
     All Match? ──► Return event_id
           │
           ▼
     No Match ──► Check if can create new event
```

---

## Troubleshooting

### Common Issues

#### 1. **No Events Matched**
- **Cause:** Different sports focus (OddsJam=American, Omenizer=European)
- **Solution:** Expected until systems overlap

#### 2. **Database Connection Errors**
- **Check:** Supabase containers running
- **Port:** PostgreSQL on 5433
- **Fix:** `docker restart supabase-db`

#### 3. **Translation Not Found**
- **Check:** `SELECT * FROM unmatched_items;`
- **Add:** Manual mapping to appropriate table
- **Re-run:** Matching engine

#### 4. **API Authentication Failures**
- **Token:** Check API_TOKEN in scripts
- **Headers:** Verify Bearer token format

### Debugging Queries

```sql
-- Check flagged events
SELECT * FROM flagged_events WHERE resolution_status = 'pending';

-- Check unmatched items
SELECT item_type, item_value, attempt_count 
FROM unmatched_items 
ORDER BY attempt_count DESC;

-- Check successful translations
SELECT * FROM translation_log WHERE success = true;

-- Check mapping coverage
SELECT 
    (SELECT COUNT(*) FROM sports_mapping) as sports_mapped,
    (SELECT COUNT(*) FROM leagues_mapping) as leagues_mapped,
    (SELECT COUNT(*) FROM teams_mapping) as teams_mapped;
```

---

## Future Enhancements

### 1. **Complete Event Creation**
- Implement ID lookups (sport_id, league_id, team_id)
- POST to Omenizer `/calendar/events/` endpoint
- Handle season_id detection

### 2. **Automated Integration**
- API endpoint to add new teams/leagues to Omenizer
- Batch processing for flagged events
- Auto-retry with exponential backoff

### 3. **Machine Learning**
- Train model on successful matches
- Improve fuzzy matching thresholds
- Predictive translation suggestions

### 4. **Real-time Processing**
- WebSocket connection for live odds
- Stream processing pipeline
- Event update notifications

### 5. **Admin Interface**
- Manual mapping management UI
- Bulk translation imports
- Visual matching confirmation

### 6. **Monitoring & Alerts**
- Translation success rate metrics
- Flagged event thresholds
- Email/Slack notifications

---

## Configuration

### Environment Variables
```bash
# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=postgres
DB_USER=postgres
DB_PASSWORD=postgres

# APIs
OMENIZER_API_URL=https://arb-general-api-1.onrender.com
OMENIZER_TOKEN=8044652f46c0ed50756a3a22d72f0c7b582b8b
SOURCE_ID=17a7de9a-c23b-49eb-9816-93ebc3bba1c5
```

### Fuzzy Matching Thresholds
- **Sports:** 80% similarity
- **Leagues:** 70% similarity
- **Teams:** 85-90% similarity
- **Event Matching:** 80% team names + ±8 hour time window

---

## Summary

The Matching Engine provides a robust solution for translating between OddsJam and Omenizer nomenclatures. It intelligently handles three scenarios:

1. **Matches existing events** when possible
2. **Creates new events** when all data translates
3. **Flags for integration** when translations are missing

The system is designed to improve over time as more mappings are added and provides complete visibility into what needs integration work through the web dashboard.

**Current Status:** 
- ✅ Core engine functional
- ✅ Flagging system operational
- ✅ Web dashboard ready
- ⏳ Event creation API integration pending
- ⏳ Full production deployment pending