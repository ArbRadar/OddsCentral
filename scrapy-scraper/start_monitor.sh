#!/bin/bash
# Start the Scrapy Monitor service

echo "Starting Scrapy Monitor..."
echo "Press Ctrl+C to stop"
echo ""

# Set environment variables if needed
export SUPABASE_URL="http://localhost:54320/rest/v1"
export SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

# Run the monitor
python3 scrapy_monitor.py