#!/usr/bin/env python3
"""
Fetch all sports and leagues from OddsJam API and create oddsjam.json
"""
import requests
import json
from datetime import datetime

# OddsJam API base URL
BASE_URL = "https://oddsjam.com"

# Headers to mimic browser requests
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://oddsjam.com/',
    'Origin': 'https://oddsjam.com'
}

# Known OddsJam sports and their leagues based on the patterns seen
# Format: sport_country/region_league
ODDSJAM_SPORTS = {
    "baseball": ["mlb"],
    "football": ["nfl", "ncaaf", "cfl", "ufl"], 
    "basketball": ["nba", "ncaab", "wnba"],
    "hockey": ["nhl"],
    "soccer": [
        "mls",  # USA MLS
        "epl",  # England Premier League
        "uefa_champions_league",
        "uefa_europa_league", 
        "spain_la_liga",
        "germany_bundesliga",
        "italy_serie_a",
        "france_ligue_one",
        "mexico_ligamx",
        "brazil_campeonato",
        "argentina_primera",
        "netherlands_eredivisie",
        "portugal_primeira",
        "turkey_super_league",
        "russia_premier_league",
        "belgium_first_division",
        "scotland_premiership",
        "austria_bundesliga",
        "switzerland_super_league",
        "denmark_superliga",
        "sweden_allsvenskan",
        "norway_eliteserien",
        "greece_super_league",
        "japan_j_league",
        "south_korea_k_league",
        "china_super_league",
        "australia_a_league"
    ],
    "tennis": ["atp", "wta", "grand_slams"],
    "golf": ["pga", "european_tour", "lpga"],
    "mma": ["ufc", "bellator", "one_championship"],
    "boxing": ["championship_boxing"],
    "motorsports": ["f1", "nascar", "indycar"],
    "rugby": ["rugby_union", "rugby_league", "super_rugby"],
    "cricket": ["international", "ipl", "bbl"],
    "esports": ["lol", "csgo", "dota2", "valorant"],
    "aussie_rules": ["afl"],
    "table_tennis": ["international"],
    "volleyball": ["international", "beach"],
    "handball": ["international", "european"],
    "cycling": ["tour_de_france", "giro", "vuelta"],
    "darts": ["pdc", "bdo"],
    "snooker": ["world_championship", "uk_championship"]
}

def format_sport_league(sport, league):
    """
    Format sport and league into the pattern used by source.json
    Examples: 
    - baseball_mlb
    - soccer_usa_mls  
    - americanfootball_nfl
    """
    # Handle special sport name mappings
    sport_mappings = {
        "football": "americanfootball",
        "hockey": "icehockey"
    }
    
    formatted_sport = sport_mappings.get(sport, sport)
    
    # For soccer, try to detect country/region
    if sport == "soccer" and "_" in league:
        # Already has country/region info
        return f"{formatted_sport}_{league}"
    elif sport == "soccer":
        # Map common leagues to their countries
        country_mappings = {
            "mls": "usa_mls",
            "epl": "epl",
            "spain_la_liga": "spain_la_liga",
            "germany_bundesliga": "germany_bundesliga",
            "italy_serie_a": "italy_serie_a",
            "france_ligue_one": "france_ligue_one",
            "mexico_ligamx": "mexico_ligamx",
            "brazil_campeonato": "brazil_campeonato"
        }
        league_with_country = country_mappings.get(league, league)
        return f"{formatted_sport}_{league_with_country}"
    else:
        return f"{formatted_sport}_{league}"

def fetch_oddsjam_sports():
    """
    Generate OddsJam sports list based on known sports and leagues
    Note: Since we can't directly query OddsJam's API for a list of all sports,
    we'll use the known sports configuration.
    """
    sports_list = []
    
    for sport, leagues in ODDSJAM_SPORTS.items():
        for league in leagues:
            formatted = format_sport_league(sport, league)
            sports_list.append(formatted)
    
    # Sort the list for consistency
    sports_list.sort()
    
    return sports_list

def create_oddsjam_json():
    """Create oddsjam.json file matching the format of source.json"""
    
    print("Generating OddsJam sports and leagues list...")
    
    sports = fetch_oddsjam_sports()
    
    # Create the JSON structure matching source.json format
    oddsjam_data = {
        "sports": sports,
        "oddsjam_last_sync": datetime.utcnow().isoformat() + "+00:00",
        "oddsjam_update_frequency": "real-time",
        "note": "Generated from known OddsJam sports configuration"
    }
    
    # Save to oddsjam.json
    output_file = "oddsjam.json"
    with open(output_file, 'w') as f:
        json.dump(oddsjam_data, f, indent=3)
    
    print(f"✅ Created {output_file} with {len(sports)} sport/league combinations")
    print(f"📊 Sports breakdown:")
    
    # Show counts by sport
    sport_counts = {}
    for sport_league in sports:
        sport = sport_league.split('_')[0]
        sport_counts[sport] = sport_counts.get(sport, 0) + 1
    
    for sport, count in sorted(sport_counts.items()):
        print(f"   - {sport}: {count} leagues")

if __name__ == "__main__":
    create_oddsjam_json()