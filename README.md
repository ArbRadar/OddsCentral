# Sportsbook Scraper Chrome Extension

A Chrome extension that scrapes sportsbook odds data and stores it in Supabase with real-time change detection.

## Features

- Scrapes odds data from sportsbook pages using AG Grid
- Detects changes and only updates new data
- Supports multiple tabs/windows in the same Chrome profile
- Stores data in local Supabase instance
- Tracks odds history for changes over time

## Setup

### 1. Start Supabase
```bash
cd supabase-local
docker compose up -d
```

After starting, run the SQL schema:
```bash
docker exec -i supabase-db psql -U postgres -d postgres < init.sql
```

### 2. Install Chrome Extension
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `sportsbook-scraper-extension` folder

### 3. Create Icon Files
The extension needs icon files. Either:
- Use the provided icon.html to create screenshots
- Add your own icon16.png, icon48.png, and icon128.png files

## Usage

1. Navigate to any sportsbook page with odds data
2. The extension automatically starts scraping when it detects the AG Grid structure
3. Click the extension icon to see status and active tabs
4. Data is sent to Supabase in real-time

## Database Schema

### Tables:
- **games**: Stores game information (teams, sport, league, start time)
- **odds**: Current odds for each game/sportsbook combination
- **odds_history**: Historical record of odds changes

## Configuration

Edit `config.js` to modify:
- Supabase connection details
- Update intervals
- CSS selectors for different sportsbook layouts

## Development

The extension consists of:
- `manifest.json`: Extension configuration
- `background.js`: Service worker handling data storage
- `content.js`: Page scraping logic
- `popup.html/js`: Status interface
- `config.js`: Configuration settings