#\!/bin/bash

echo "Testing deduplication logic..."

# Get raw games from last hour
echo -e "\n1. Fetching raw games from last hour..."
RAW_COUNT=$(curl -s "http://localhost:54320/games?created_at=gte.$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')&select=game_id" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" | jq 'length')

echo "Raw game records: $RAW_COUNT"

# Get unique games
echo -e "\n2. Counting unique game_ids..."
UNIQUE_COUNT=$(curl -s "http://localhost:54320/games?created_at=gte.$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')&select=game_id" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" | jq -r '.[].game_id' | sort | uniq | wc -l)

echo "Unique game_ids: $UNIQUE_COUNT"

echo -e "\n3. Checking deduplication ratio..."
echo "Duplicates: $((RAW_COUNT - UNIQUE_COUNT))"
echo "Duplication factor: $(echo "scale=1; $RAW_COUNT / $UNIQUE_COUNT" | bc)x"

# Show sample of most duplicated games
echo -e "\n4. Most duplicated game_ids:"
curl -s "http://localhost:54320/games?created_at=gte.$(date -u -v-1H '+%Y-%m-%dT%H:%M:%SZ')&select=game_id,home_team,away_team" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" | \
  jq -r '.[] | .game_id' | sort | uniq -c | sort -nr | head -5
