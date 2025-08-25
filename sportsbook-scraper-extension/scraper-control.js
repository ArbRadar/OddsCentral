// Scraper Control JavaScript
class ScraperControlManager {
    constructor() {
        this.API_URL = 'http://localhost:54320';
        this.API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
        
        this.headers = {
            'apikey': this.API_KEY,
            'Authorization': `Bearer ${this.API_KEY}`,
            'Content-Type': 'application/json'
        };
        
        this.targets = [];
        this.auth = null;
    }

    async init() {
        this.setupEventListeners();
        await this.loadAllData();
        
        // Refresh every 30 seconds
        setInterval(() => this.loadStats(), 30000);
    }

    setupEventListeners() {
        // Main refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadAllData());
        
        // Poll interval update
        document.getElementById('updatePollBtn').addEventListener('click', () => this.updatePollInterval());
        
        // Add new target
        document.getElementById('addTargetBtn').addEventListener('click', () => this.addNewTarget());
    }

    async loadAllData() {
        await Promise.all([
            this.loadTargets(),
            this.loadAuth(),
            this.loadStats(),
            this.loadConfig()
        ]);
    }

    async loadTargets() {
        try {
            this.showStatus('Loading scraping targets...', 'info');
            document.getElementById('targetsLoading').style.display = 'block';
            document.getElementById('targetsList').style.display = 'none';

            const response = await fetch(`${this.API_URL}/scraping_targets?order=priority,name`, { 
                headers: this.headers 
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.targets = await response.json();
            this.displayTargets();
            this.showStatus(`Loaded ${this.targets.length} scraping targets`, 'success');

            document.getElementById('targetsLoading').style.display = 'none';
            document.getElementById('targetsList').style.display = 'block';

        } catch (error) {
            console.error('Error loading targets:', error);
            this.showStatus(`Error loading targets: ${error.message}`, 'error');
            document.getElementById('targetsLoading').style.display = 'none';
        }
    }

    displayTargets() {
        const container = document.getElementById('targetsList');
        container.innerHTML = '';

        this.targets.forEach(target => {
            const div = document.createElement('div');
            div.className = 'target-item';
            
            const config = target.config;
            const details = `${config.sport} • ${config.league} • ${config.market}`;
            
            div.innerHTML = `
                <div class="target-info">
                    <div class="target-name">${target.name}</div>
                    <div class="target-details">${details}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${target.enabled ? 'checked' : ''} 
                           data-target-id="${target.id}">
                    <span class="slider"></span>
                </label>
            `;
            
            // Add event listener for toggle
            const toggle = div.querySelector('input[type="checkbox"]');
            toggle.addEventListener('change', (e) => {
                this.toggleTarget(target.id, e.target.checked);
            });
            
            container.appendChild(div);
        });
    }

    async toggleTarget(id, enabled) {
        try {
            const response = await fetch(`${this.API_URL}/scraping_targets?id=eq.${id}`, {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify({ enabled })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.showStatus(`Target ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
            await this.updateLastScraped(id);
        } catch (error) {
            console.error('Error updating target:', error);
            this.showStatus(`Error updating target: ${error.message}`, 'error');
            // Revert toggle on error
            this.loadTargets();
        }
    }

    async updateLastScraped(id) {
        // Reset last_scraped to null when enabling to force immediate scraping
        try {
            await fetch(`${this.API_URL}/scraping_targets?id=eq.${id}`, {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify({ last_scraped: null })
            });
        } catch (error) {
            console.error('Error resetting last_scraped:', error);
        }
    }

    async loadAuth() {
        try {
            const response = await fetch(`${this.API_URL}/platform_auth?platform_id=eq.1`, { 
                headers: this.headers 
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const auth = await response.json();
            if (auth.length > 0) {
                this.auth = auth[0];
                this.displayAuth();
            }

            document.getElementById('authLoading').style.display = 'none';
            document.getElementById('authInfo').style.display = 'block';
        } catch (error) {
            console.error('Error loading auth:', error);
            this.showStatus(`Error loading auth: ${error.message}`, 'error');
        }
    }

    displayAuth() {
        if (!this.auth) return;

        const status = document.getElementById('authStatus');
        const expires = new Date(this.auth.expires_at);
        const now = new Date();

        if (expires > now) {
            status.textContent = 'Valid';
            status.className = 'auth-status valid';
        } else {
            status.textContent = 'Expired';
            status.className = 'auth-status expired';
        }

        document.getElementById('authSource').textContent = this.auth.source || 'manual';
        document.getElementById('authExpires').textContent = expires.toLocaleString();
        document.getElementById('authUpdated').textContent = new Date(this.auth.updated_at).toLocaleString();
    }

    async loadStats() {
        try {
            // Get total games
            const gamesResponse = await fetch(`${this.API_URL}/games?select=count`, { 
                headers: this.headers 
            });
            if (gamesResponse.ok) {
                const games = await gamesResponse.json();
                document.getElementById('totalGames').textContent = games[0]?.count || 0;
            }

            // Get total odds
            const oddsResponse = await fetch(`${this.API_URL}/odds?select=count`, { 
                headers: this.headers 
            });
            if (oddsResponse.ok) {
                const odds = await oddsResponse.json();
                document.getElementById('totalOdds').textContent = odds[0]?.count || 0;
            }

            // Get last scraped time from both old and new systems
            try {
                // Check new system (scraping_targets)
                const targetsResponse = await fetch(
                    `${this.API_URL}/scraping_targets?select=last_scraped&order=last_scraped.desc&limit=1`, 
                    { headers: this.headers }
                );
                
                // Check old system (sportsbook_urls) as fallback
                const urlsResponse = await fetch(
                    `${this.API_URL}/sportsbook_urls?select=last_scraped&order=last_scraped.desc&limit=1`,
                    { headers: this.headers }
                );
                
                let lastScraped = null;
                
                if (targetsResponse.ok) {
                    const targets = await targetsResponse.json();
                    if (targets.length > 0 && targets[0].last_scraped) {
                        lastScraped = new Date(targets[0].last_scraped);
                    }
                }
                
                // Use old system timestamp if new system hasn't scraped yet
                if (!lastScraped && urlsResponse.ok) {
                    const urls = await urlsResponse.json();
                    if (urls.length > 0 && urls[0].last_scraped) {
                        lastScraped = new Date(urls[0].last_scraped);
                    }
                }
                
                if (lastScraped) {
                    const minutesAgo = Math.floor((new Date() - lastScraped) / 60000);
                    document.getElementById('lastScraped').textContent = `${minutesAgo}m ago`;
                } else {
                    document.getElementById('lastScraped').textContent = 'Never';
                }
            } catch (error) {
                console.error('Error getting last scraped time:', error);
                document.getElementById('lastScraped').textContent = 'Error';
            }
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    }

    async loadConfig() {
        try {
            const response = await fetch(`${this.API_URL}/scraping_config?key=eq.poll_interval_seconds`, { 
                headers: this.headers 
            });
            
            if (response.ok) {
                const config = await response.json();
                if (config.length > 0) {
                    const interval = config[0].value;
                    document.getElementById('pollInterval').textContent = interval;
                    document.getElementById('pollIntervalInput').value = interval;
                }
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    async updatePollInterval() {
        const value = document.getElementById('pollIntervalInput').value;

        try {
            const response = await fetch(`${this.API_URL}/scraping_config?key=eq.poll_interval_seconds`, {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify({ value })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.showStatus('Poll interval updated. Restart monitor for changes to take effect.', 'success');
            document.getElementById('pollInterval').textContent = value;
        } catch (error) {
            console.error('Error updating interval:', error);
            this.showStatus(`Error updating interval: ${error.message}`, 'error');
        }
    }

    async addNewTarget() {
        const sport = document.getElementById('newSport').value;
        const league = document.getElementById('newLeague').value;
        const market = document.getElementById('newMarket').value;

        const name = `${league.toUpperCase()} ${market.charAt(0).toUpperCase() + market.slice(1)}`;

        try {
            const response = await fetch(`${this.API_URL}/scraping_targets`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify({
                    platform_id: 1,
                    target_type: 'sport_league',
                    name: name,
                    config: {
                        sport: sport,
                        league: league,
                        market: market,
                        state: 'MX-MX'
                    },
                    enabled: false,
                    priority: 10
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.showStatus('Target added successfully', 'success');
            this.loadTargets();
        } catch (error) {
            console.error('Error adding target:', error);
            this.showStatus(`Error adding target: ${error.message}`, 'error');
        }
    }

    showStatus(message, type) {
        const status = document.getElementById('status');
        status.textContent = message;
        status.className = `status ${type}`;
        status.style.display = 'block';

        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

// Global manager instance
let scraperManager;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    scraperManager = new ScraperControlManager();
    scraperManager.init();
});