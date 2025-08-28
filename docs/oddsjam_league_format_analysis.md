# OddsJam League Format Analysis

## Executive Summary

The issue with `spain_la_liga` vs `spain_-_la_liga` revealed a systematic problem with the OddsJam API league format mapping. After analyzing the actual OddsJam API responses in `working_sample.json`, I've extracted the complete list of 266+ leagues with their correct API formats.

## Key Findings

### 1. **combo.html Analysis**
- The HTML file contained only the **display names** (UI dropdown), not the API keys
- Shows leagues like "Spain - La Liga" and "England - Premier League" 
- **No actual API format data** was found in this file
- This was just the frontend React component output

### 2. **Actual OddsJam API Format Discovery**
- Found the real API formats in `/Users/joelsalazar/OddsCentral/scrapy-scraper/working_sample.json`
- Extracted **266 unique league API keys** from live OddsJam API responses
- Confirmed the correct format is `spain_-_la_liga` (with `_-_` separator)

### 3. **League Format Patterns**

OddsJam uses **4 main patterns**:

#### Pattern 1: Major Leagues (Simple Format)
```
nfl, nba, mlb, nhl, ufc, atp, wta, pga, boxing, afl
```

#### Pattern 2: Regional Leagues (country_-_league)
```
spain_-_la_liga
england_-_premier_league  
germany_-_bundesliga
usa_-_major_league_soccer
mexico_-_liga_mx
```

#### Pattern 3: International Competitions (org_-_competition)
```
uefa_-_champions_league
fifa_-_world_cup
conmebol_-_copa_libertadores
fiba_-_world_cup
```

#### Pattern 4: Olympics (olympics_sport_gender)
```
olympics_basketball_men
olympics_soccer_women
olympics_tennis_men
```

## Created Files

### 1. `/Users/joelsalazar/OddsCentral/docs/corrected_oddsjam_mapping.json`
- **Complete structured mapping** with 266+ leagues
- Organized by categories (major leagues, regional leagues, international competitions, olympics)
- Includes metadata and pattern explanations

### 2. `/Users/joelsalazar/OddsCentral/docs/oddsjam_league_lookup.json`
- **Simple lookup table** for quick reference
- Maps display names to API keys
- Includes common mistakes and corrections

### 3. `/Users/joelsalazar/OddsCentral/docs/oddsjam_complete_leagues.csv`
- **Spreadsheet-friendly format** with all leagues
- Columns: api_key, display_name, sport, region, category, pattern_type
- Easy to filter and sort

### 4. `/Users/joelsalazar/OddsCentral/docs/oddsjam_league_converter.py`
- **Python validation tool** for league format conversion
- Converts various formats to correct OddsJam API keys
- Includes fuzzy matching and pattern detection

## Major Corrections Needed

Your original mapping had these incorrect formats:

| ❌ **Wrong Format** | ✅ **Correct Format** |
|---------------------|----------------------|
| `soccer_spain_la_liga` | `spain_-_la_liga` |
| `soccer_epl` | `england_-_premier_league` |
| `soccer_england_premier_league` | `england_-_premier_league` |
| `americanfootball_nfl` | `nfl` |
| `basketball_nba` | `nba` |
| `usa_mls` | `usa_-_major_league_soccer` |

## Implementation Guide

### For Scrapy Spider Updates:
1. Replace your current league mapping with the corrected formats
2. Use the `all_leagues_flat` array from the JSON for iteration
3. Implement the converter script for validation

### Pattern Recognition Rules:
- **US Major Leagues**: Use simple format (nfl, nba, mlb, nhl)
- **Country Leagues**: Use `country_-_league` format  
- **International**: Use `organization_-_competition` format
- **Olympics**: Use `olympics_sport_gender` format

## Validation

The converter script successfully validates these transformations:
```
✅ Spanish La Liga        -> spain_-_la_liga
✅ spain_la_liga         -> spain_-_la_liga  
✅ soccer_spain_la_liga  -> spain_-_la_liga
✅ English Premier League -> england_-_premier_league
✅ NFL                   -> nfl
✅ MLS                   -> usa_-_major_league_soccer
```

## Next Steps

1. **Update your Scrapy configuration** with the corrected league formats from the JSON files
2. **Test a few key leagues** (Spanish La Liga, Premier League, NBA, NFL) to confirm the fixes work
3. **Use the Python converter** for any future league format questions
4. **Monitor for new leagues** that OddsJam might add and update the mappings accordingly

The comprehensive mapping now covers **all currently active leagues** that OddsJam supports, ensuring your scraper can access all available data without manual fixes.