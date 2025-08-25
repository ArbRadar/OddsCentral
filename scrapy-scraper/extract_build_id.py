#!/usr/bin/env python3
"""
Extract Next.js build ID from OddsJam website
"""
import requests
import re
import json

def extract_build_id():
    """Extract the current Next.js build ID from OddsJam"""
    try:
        # Fetch the main page
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        response = requests.get('https://oddsjam.com/mlb', headers=headers)
        
        if response.status_code == 200:
            # Look for buildId in the page
            # Next.js includes it in __NEXT_DATA__ script tag
            match = re.search(r'"buildId":"([^"]+)"', response.text)
            if match:
                build_id = match.group(1)
                print(f"✅ Found build ID: {build_id}")
                
                # Test the URL with new build ID
                test_url = f"https://oddsjam.com/_next/data/{build_id}/mlb/screen/moneyline.json"
                print(f"🔍 Testing URL: {test_url}")
                
                test_response = requests.get(test_url, headers=headers)
                print(f"📊 Response status: {test_response.status_code}")
                
                if test_response.status_code == 200:
                    print("✅ New build ID works!")
                    print(f"📝 Update endpoints with: /_next/data/{build_id}/...")
                    return build_id
                else:
                    print("❌ New build ID doesn't work, might need cookies/auth")
            else:
                print("❌ Could not find buildId in page")
        else:
            print(f"❌ Failed to fetch page: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    
    return None

if __name__ == "__main__":
    extract_build_id()