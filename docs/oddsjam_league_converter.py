#!/usr/bin/env python3
"""
OddsJam League Format Converter
Helps convert various league name formats to the correct OddsJam API format.
"""

import json
import re
from typing import Dict, List, Optional

# Load the corrected mapping data
def load_league_mappings() -> Dict:
    """Load the league mappings from the JSON file."""
    try:
        with open('/Users/joelsalazar/OddsCentral/docs/oddsjam_league_lookup.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        print("Warning: League lookup file not found. Using built-in mappings.")
        return get_builtin_mappings()

def get_builtin_mappings() -> Dict:
    """Return built-in league mappings as fallback."""
    return {
        "league_api_keys": {
            "NFL": "nfl",
            "NBA": "nba",
            "MLB": "mlb",
            "NHL": "nhl",
            "Spanish La Liga": "spain_-_la_liga",
            "English Premier League": "england_-_premier_league",
            "German Bundesliga": "germany_-_bundesliga",
            "Italian Serie A": "italy_-_serie_a",
            "French Ligue 1": "france_-_ligue_1",
            "MLS": "usa_-_major_league_soccer",
            "Liga MX": "mexico_-_liga_mx",
            "UEFA Champions League": "uefa_-_champions_league"
        },
        "common_mistakes": {
            "soccer_spain_la_liga": "spain_-_la_liga",
            "soccer_epl": "england_-_premier_league",
            "americanfootball_nfl": "nfl",
            "basketball_nba": "nba",
            "spain_la_liga": "spain_-_la_liga",
            "england_premier_league": "england_-_premier_league"
        }
    }

class OddsJamLeagueConverter:
    """Converts various league name formats to OddsJam API format."""
    
    def __init__(self):
        self.mappings = load_league_mappings()
        self.league_keys = self.mappings.get("league_api_keys", {})
        self.common_mistakes = self.mappings.get("common_mistakes", {})
        
        # Create reverse lookup for API keys to display names
        self.api_to_display = {v: k for k, v in self.league_keys.items()}
    
    def convert_to_api_key(self, league_name: str) -> Optional[str]:
        """
        Convert a league name to the correct OddsJam API key.
        
        Args:
            league_name: The league name to convert
            
        Returns:
            The correct API key or None if not found
        """
        # Exact match in display names
        if league_name in self.league_keys:
            return self.league_keys[league_name]
        
        # Check common mistakes
        if league_name in self.common_mistakes:
            return self.common_mistakes[league_name]
        
        # If it's already an API key, return as-is
        if league_name in self.api_to_display:
            return league_name
        
        # Try fuzzy matching
        return self._fuzzy_match(league_name)
    
    def _fuzzy_match(self, league_name: str) -> Optional[str]:
        """Attempt fuzzy matching for league names."""
        name_lower = league_name.lower()
        
        # Check for partial matches in display names
        for display_name, api_key in self.league_keys.items():
            if name_lower in display_name.lower() or display_name.lower() in name_lower:
                return api_key
        
        # Pattern-based matching
        if "la liga" in name_lower or "spanish liga" in name_lower:
            return "spain_-_la_liga"
        elif "premier league" in name_lower and ("english" in name_lower or "england" in name_lower):
            return "england_-_premier_league"
        elif "bundesliga" in name_lower and "german" in name_lower:
            return "germany_-_bundesliga"
        elif "serie a" in name_lower and "italian" in name_lower:
            return "italy_-_serie_a"
        elif "ligue 1" in name_lower and "french" in name_lower:
            return "france_-_ligue_1"
        elif "mls" in name_lower or "major league soccer" in name_lower:
            return "usa_-_major_league_soccer"
        elif "champions league" in name_lower and "uefa" in name_lower:
            return "uefa_-_champions_league"
        
        return None
    
    def validate_api_key(self, api_key: str) -> bool:
        """Check if an API key is valid."""
        return api_key in self.api_to_display
    
    def get_display_name(self, api_key: str) -> Optional[str]:
        """Get the display name for an API key."""
        return self.api_to_display.get(api_key)
    
    def get_pattern_info(self, api_key: str) -> str:
        """Get information about the pattern used for an API key."""
        if api_key in ["nfl", "nba", "mlb", "nhl", "ufc", "atp", "wta", "pga", "boxing", "afl"]:
            return "Major league - simple format"
        elif "_-_" in api_key:
            if api_key.startswith(("uefa_", "fifa_", "fiba_", "concacaf_", "conmebol_", "caf_", "afc_")):
                return "International competition - org_-_competition format"
            else:
                return "Regional league - country_-_league format"
        elif api_key.startswith("olympics_"):
            return "Olympics - olympics_sport_gender format"
        elif "_" in api_key:
            return "Special format - underscore separated"
        else:
            return "Simple format - no separators"

def main():
    """Main function for command-line usage."""
    converter = OddsJamLeagueConverter()
    
    print("OddsJam League Format Converter")
    print("=" * 40)
    
    while True:
        league_input = input("\nEnter league name (or 'quit' to exit): ").strip()
        
        if league_input.lower() == 'quit':
            break
        
        if not league_input:
            continue
        
        api_key = converter.convert_to_api_key(league_input)
        
        if api_key:
            display_name = converter.get_display_name(api_key)
            pattern_info = converter.get_pattern_info(api_key)
            
            print(f"✅ Found match!")
            print(f"   Input: {league_input}")
            print(f"   API Key: {api_key}")
            print(f"   Display Name: {display_name}")
            print(f"   Pattern: {pattern_info}")
        else:
            print(f"❌ No match found for: {league_input}")
            print("   Try variations like:")
            print("   - Full name (e.g., 'Spanish La Liga')")
            print("   - Common abbreviations (e.g., 'EPL' for Premier League)")
            print("   - Check spelling and try again")

if __name__ == "__main__":
    # Example usage
    converter = OddsJamLeagueConverter()
    
    # Test some conversions
    test_cases = [
        "Spanish La Liga",
        "spain_la_liga",
        "soccer_spain_la_liga",
        "EPL",
        "English Premier League",
        "NFL",
        "americanfootball_nfl",
        "UEFA Champions League",
        "MLS",
        "German Bundesliga"
    ]
    
    print("Testing league conversions:")
    print("=" * 50)
    
    for test_case in test_cases:
        result = converter.convert_to_api_key(test_case)
        status = "✅" if result else "❌"
        print(f"{status} {test_case:<25} -> {result or 'Not found'}")
    
    print("\n" + "=" * 50)
    print("Run the script interactively for more testing!")