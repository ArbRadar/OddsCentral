#!/bin/bash

# Start the scrapy monitoring system with integrated data cleanup
# This script ensures the database cleanup functions are installed and starts monitoring

set -e

echo "=================================================="
echo "STARTING SCRAPY MONITOR WITH DATA RETENTION"
echo "=================================================="
echo "Retention Policy: 1 hour"
echo "Cleanup Frequency: Every 10 minutes"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required files exist
if [ ! -f "setup_data_retention.py" ]; then
    print_error "setup_data_retention.py not found!"
    exit 1
fi

if [ ! -f "monitor_with_direct_db.py" ]; then
    print_error "monitor_with_direct_db.py not found!"
    exit 1
fi

# Step 1: Setup database cleanup functions
print_status "Setting up database cleanup functions..."
if python3 setup_data_retention.py; then
    print_status "Database cleanup functions installed successfully"
else
    print_error "Failed to setup database cleanup functions"
    exit 1
fi

# Step 2: Check current data status
print_status "Checking current data status..."
if command -v python3 check_data_status.py &> /dev/null; then
    python3 check_data_status.py --history
fi

# Step 3: Start the monitor with integrated cleanup
print_status "Starting monitor with integrated cleanup..."
print_status "Monitor will:"
print_status "  - Run scrapy spider on detected endpoints"
print_status "  - Cleanup data older than 1 hour every 10 minutes"
print_status "  - Log all cleanup operations"
print_status ""
print_warning "Press Ctrl+C to stop the monitor"
print_status ""

# Set up signal handler for graceful shutdown
cleanup() {
    print_status ""
    print_status "Shutting down monitor..."
    exit 0
}
trap cleanup INT TERM

# Start the monitor
python3 monitor_with_direct_db.py