# API Sender Module

The API Sender module automatically sends scraped odds data to the external API endpoint (`/raw-bets/upsert`).

## Files Created

1. **`api-sender.js`** - Core module with data transformation and sending logic
2. **`api-sender-test.html`** - Test panel UI for manual testing and monitoring
3. **`api-sender-test.js`** - Test panel JavaScript
4. **Integration in `background.js`** - Message handlers and auto-send functionality

## Features

### ✅ **Data Transformation**
- Converts Supabase odds data to API-compatible format
- Maps bookmaker names to UUIDs from `bookmakers.csv`
- Handles American ↔ Decimal odds conversion
- Supports 2-way and 3-way markets (moneyline, spread, totals, draw)

### ✅ **Authentication & Configuration**
- Uses API token from `.env` file: `8044652f46c0ed50756a3a22d72f0c7b582b8b`
- Source ID: `17a7de9a-c23b-49eb-9816-93ebc3bba1c5` (odds_central)
- Event source: Individual bookmaker UUIDs

### ✅ **Sending Modes**
- **Real-time**: Automatically sends after successful data processing
- **Batch**: Send multiple records at once (configurable batch size)
- **Manual**: Send specific games by ID
- **Test**: Connection testing with dummy data

### ✅ **Error Handling & Reliability**
- Retry logic with exponential backoff
- Comprehensive error logging
- Statistics tracking (sent/failed/success rate)
- Non-blocking auto-send (won't break scraping if API is down)

### ✅ **Bookmaker Mapping**
Major bookmakers supported with correct UUIDs:
- DraftKings: `fe6bc0f8-e8a9-4083-9401-766d30817009`
- FanDuel: `d0f4c753-b2a3-4f02-ace3-f23d6987184a`
- BetMGM: `a4fb81f8-ba8c-4012-bd74-10f78846d6ea`
- bet365: `ce996a90-c4bf-40b3-803f-daffe6c19b4f`
- pinnacle: `41a3c468-e086-4dd5-883a-d740d802c629`
- And 70+ more from `bookmakers.csv`

## Usage

### **Auto-Send (Default)**
Auto-sending is enabled by default. After each successful scraping operation, the system will automatically send the processed odds data to the API.

**To disable auto-send:**
```javascript
chrome.storage.local.set({ apiAutoSendEnabled: false });
```

### **Manual Sending via Background Script**
```javascript
// Send recent data (limit 50 records)
chrome.runtime.sendMessage({
  type: 'SEND_ODDS_TO_API',
  limit: 50
});

// Send specific games
chrome.runtime.sendMessage({
  type: 'SEND_ODDS_TO_API', 
  gameIds: ['game_id_1', 'game_id_2']
});

// Test connection
chrome.runtime.sendMessage({
  type: 'TEST_API_CONNECTION'
});

// Get statistics  
chrome.runtime.sendMessage({
  type: 'GET_API_SENDER_STATS'
});
```

### **Using the Test Panel**
1. Open `api-sender-test.html` in the extension
2. Click "Test Connection" to verify API access
3. Use "Send Recent Data" to send a batch of records
4. Monitor statistics and logs in real-time
5. Toggle auto-send on/off as needed

### **Direct API Usage**
```javascript
import APISender from './api-sender.js';

const sender = new APISender();

// Test connection
await sender.testConnection();

// Send all recent data (limit 100)
const result = await sender.sendAll(100);
console.log(`Sent: ${result.successful}, Failed: ${result.failed}`);

// Send specific games
const gameResult = await sender.sendByGameIds(['game_123', 'game_456']);

// Get statistics
const stats = sender.getStats();
console.log(`Success rate: ${stats.successRate}`);
```

## API Format

The module transforms local data into this format:

```json
{
  "source_id": "17a7de9a-c23b-49eb-9816-93ebc3bba1c5",
  "event_source": "fe6bc0f8-e8a9-4083-9401-766d30817009",
  "name": "Lakers vs Warriors",
  "home_team": "Lakers",
  "away_team": "Warriors", 
  "event_datetime": "2025-08-26T20:00:00Z",
  "league": "NBA",
  "sport": "Basketball",
  "status": "scheduled",
  "markets": {
    "markets": [{
      "bookmaker": "DraftKings",
      "market_type": "Moneyline",
      "is_live": false,
      "last_updated": "2025-08-26T15:30:00Z",
      "odds": [{
        "outcome": "Home",
        "outcome_team": "Lakers",
        "american_price": -110,
        "price": 1.91,
        "format": "decimal",
        "bookmaker": "DraftKings"
      }]
    }],
    "bookmakers": ["DraftKings"],
    "market_types": ["Moneyline"],
    "total_markets": 1,
    "bookmaker_count": 1
  }
}
```

## Configuration

### **Environment Variables**
- `VITE_API_BASE_URL`: `https://arb-general-api-1.onrender.com/`
- `VITE_ARB_API_TOKEN`: `8044652f46c0ed50756a3a22d72f0c7b582b8b`

### **Chrome Storage Settings**
- `apiAutoSendEnabled`: Boolean (default: true)

### **Module Configuration**
```javascript
// In api-sender.js
this.config = {
  sourceId: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
  batchSize: 10,
  retryAttempts: 3,
  retryDelay: 1000
};
```

## Monitoring & Debugging

### **Console Logs**
- `🚀 Auto-sending processed data to API...`
- `✅ Auto-sent 5 games to API`
- `❌ Failed to send record: API Error 400`
- `⚠️ Auto API send failed (non-critical): Connection timeout`

### **Statistics Tracking**
- Records sent/failed
- Success rate percentage  
- Error history with timestamps
- Per-bookmaker mapping success

### **Error Handling**
- Non-blocking: API failures won't stop scraping
- Retry logic: 3 attempts with 1s delay
- Detailed error logging for debugging
- Graceful degradation if API is unavailable

## Integration Points

1. **Real-time**: Triggered after successful `processScrapedData()`
2. **Manual**: Via test panel or chrome message API
3. **Batch**: Configurable batch sizes for bulk operations  
4. **Monitoring**: Statistics and logs via test panel

The module is designed to be robust, non-intrusive, and easy to monitor/debug.