/**
 * API Sender Test Panel JavaScript
 */

class APISenderTestPanel {
    constructor() {
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadSettings();
        this.startLogCapture();
    }

    setupEventListeners() {
        // Test connection
        document.getElementById('test-connection').addEventListener('click', () => {
            this.testConnection();
        });

        // Send data
        document.getElementById('send-all').addEventListener('click', () => {
            this.sendRecentData();
        });

        document.getElementById('send-specific').addEventListener('click', () => {
            document.getElementById('specific-controls').style.display = 'block';
            this.sendSpecificGames();
        });

        // Auto-send toggle
        document.getElementById('auto-send-toggle').addEventListener('change', (e) => {
            this.toggleAutoSend(e.target.checked);
        });

        // Stats refresh
        document.getElementById('refresh-stats').addEventListener('click', () => {
            this.refreshStats();
        });

        // Clear log
        document.getElementById('clear-log').addEventListener('click', () => {
            this.clearLog();
        });
    }

    async loadSettings() {
        try {
            const config = await chrome.storage.local.get(['apiAutoSendEnabled']);
            document.getElementById('auto-send-toggle').checked = config.apiAutoSendEnabled !== false;
        } catch (error) {
            this.log('Error loading settings: ' + error.message, 'error');
        }
    }

    async testConnection() {
        const button = document.getElementById('test-connection');
        const statusDiv = document.getElementById('connection-status');
        
        button.disabled = true;
        button.textContent = 'Testing...';
        statusDiv.innerHTML = '';
        
        try {
            this.log('🧪 Testing API connection...');
            this.log('Sending message to background script...');
            
            const response = await chrome.runtime.sendMessage({
                type: 'TEST_API_CONNECTION'
            });
            
            this.log('Raw response from background: ' + JSON.stringify(response));
            
            if (!response) {
                throw new Error('No response received from background script');
            }
            
            if (response.success) {
                statusDiv.innerHTML = '<div class="status success">✅ Connection successful!</div>';
                this.log('✅ API connection test passed');
                if (response.result) {
                    this.log('Response: ' + JSON.stringify(response.result, null, 2));
                }
            } else {
                statusDiv.innerHTML = `<div class="status error">❌ Connection failed: ${response.error}</div>`;
                this.log('❌ API connection test failed: ' + response.error, 'error');
            }
        } catch (error) {
            statusDiv.innerHTML = `<div class="status error">❌ Error: ${error.message}</div>`;
            this.log('❌ Connection test error: ' + error.message, 'error');
        }
        
        button.disabled = false;
        button.textContent = 'Test Connection';
    }

    async sendRecentData() {
        const button = document.getElementById('send-all');
        const statusDiv = document.getElementById('send-status');
        const limit = parseInt(document.getElementById('send-limit').value) || 10;
        
        button.disabled = true;
        button.textContent = 'Sending...';
        statusDiv.innerHTML = '';
        
        try {
            this.log(`🚀 Sending recent data (limit: ${limit})...`);
            
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_ODDS_TO_API',
                limit: limit
            });
            
            if (response.success) {
                const result = response.result;
                statusDiv.innerHTML = `
                    <div class="status success">
                        ✅ Send completed: ${result.successful} successful, ${result.failed} failed
                    </div>`;
                this.log(`✅ Send completed: ${result.successful} successful, ${result.failed} failed`);
                this.refreshStats();
            } else {
                statusDiv.innerHTML = `<div class="status error">❌ Send failed: ${response.error}</div>`;
                this.log('❌ Send failed: ' + response.error, 'error');
            }
        } catch (error) {
            statusDiv.innerHTML = `<div class="status error">❌ Error: ${error.message}</div>`;
            this.log('❌ Send error: ' + error.message, 'error');
        }
        
        button.disabled = false;
        button.textContent = 'Send Recent Data';
    }

    async sendSpecificGames() {
        const button = document.getElementById('send-specific');
        const statusDiv = document.getElementById('send-status');
        const gameIdsInput = document.getElementById('game-ids').value.trim();
        
        if (!gameIdsInput) {
            statusDiv.innerHTML = '<div class="status error">❌ Please enter game IDs</div>';
            return;
        }
        
        const gameIds = gameIdsInput.split(',').map(id => id.trim()).filter(id => id);
        
        button.disabled = true;
        button.textContent = 'Sending...';
        statusDiv.innerHTML = '';
        
        try {
            this.log(`🚀 Sending specific games: ${gameIds.join(', ')}`);
            
            const response = await chrome.runtime.sendMessage({
                type: 'SEND_ODDS_TO_API',
                gameIds: gameIds
            });
            
            if (response.success) {
                const result = response.result;
                statusDiv.innerHTML = `
                    <div class="status success">
                        ✅ Send completed: ${result.successful} successful, ${result.failed} failed
                    </div>`;
                this.log(`✅ Send completed: ${result.successful} successful, ${result.failed} failed`);
                this.refreshStats();
            } else {
                statusDiv.innerHTML = `<div class="status error">❌ Send failed: ${response.error}</div>`;
                this.log('❌ Send failed: ' + response.error, 'error');
            }
        } catch (error) {
            statusDiv.innerHTML = `<div class="status error">❌ Error: ${error.message}</div>`;
            this.log('❌ Send error: ' + error.message, 'error');
        }
        
        button.disabled = false;
        button.textContent = 'Send Specific Games';
    }

    async toggleAutoSend(enabled) {
        try {
            await chrome.storage.local.set({ apiAutoSendEnabled: enabled });
            this.log(`⚙️ Auto-send ${enabled ? 'enabled' : 'disabled'}`);
        } catch (error) {
            this.log('Error updating auto-send setting: ' + error.message, 'error');
        }
    }

    async refreshStats() {
        const statsDiv = document.getElementById('stats-display');
        
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_API_SENDER_STATS'
            });
            
            if (response.success) {
                const stats = response.stats;
                statsDiv.innerHTML = `
                    <div class="stats">
                        <div class="stat-card">
                            <h3>${stats.sent}</h3>
                            <p>Records Sent</p>
                        </div>
                        <div class="stat-card">
                            <h3>${stats.failed}</h3>
                            <p>Failed Sends</p>
                        </div>
                        <div class="stat-card">
                            <h3>${stats.successRate}</h3>
                            <p>Success Rate</p>
                        </div>
                        <div class="stat-card">
                            <h3>${stats.errors ? stats.errors.length : 0}</h3>
                            <p>Error Count</p>
                        </div>
                    </div>
                `;
                
                if (stats.errors && stats.errors.length > 0) {
                    statsDiv.innerHTML += '<h3>Recent Errors:</h3>';
                    stats.errors.slice(-5).forEach(error => {
                        statsDiv.innerHTML += `
                            <div class="status error" style="margin: 5px 0; font-size: 12px;">
                                <strong>${error.record}:</strong> ${error.error}
                                <br><small>${error.timestamp}</small>
                            </div>`;
                    });
                }
                
                this.log('📊 Statistics refreshed');
            } else {
                statsDiv.innerHTML = `<div class="status error">Failed to load stats: ${response.error}</div>`;
            }
        } catch (error) {
            statsDiv.innerHTML = `<div class="status error">Error loading stats: ${error.message}</div>`;
        }
    }

    startLogCapture() {
        // Initial stats load
        this.refreshStats();
        
        // Auto-refresh stats every 30 seconds
        setInterval(() => {
            this.refreshStats();
        }, 30000);
    }

    log(message, type = 'info') {
        const logDiv = document.getElementById('log');
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${message}\n`;
        
        logDiv.textContent += logEntry;
        logDiv.scrollTop = logDiv.scrollHeight;
        
        // Keep log to reasonable size
        const lines = logDiv.textContent.split('\n');
        if (lines.length > 500) {
            logDiv.textContent = lines.slice(-400).join('\n');
        }
    }

    clearLog() {
        document.getElementById('log').textContent = '';
        this.log('📋 Log cleared');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new APISenderTestPanel();
});