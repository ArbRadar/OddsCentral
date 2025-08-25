// Sportsbook Filters Management
class SportsbookFiltersManager {
    constructor() {
        this.supabaseUrl = 'http://localhost:54320';
        this.supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
        this.headers = {
            'apikey': this.supabaseKey,
            'Authorization': `Bearer ${this.supabaseKey}`,
            'Content-Type': 'application/json'
        };
        this.filters = [];
        this.changes = new Map(); // Track pending changes
    }

    async init() {
        await this.loadFilters();
        await this.loadStats();
    }

    async loadFilters() {
        try {
            this.showStatus('Loading sportsbook filters...', 'info');
            document.getElementById('loading').style.display = 'block';
            document.getElementById('filtersTable').style.display = 'none';

            const response = await fetch(`${this.supabaseUrl}/sportsbook_filters?order=priority,sportsbook`, {
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.filters = await response.json();
            this.renderFilters();
            this.updateStats();
            this.showStatus(`Loaded ${this.filters.length} sportsbook filters`, 'success');

            document.getElementById('loading').style.display = 'none';
            document.getElementById('filtersTable').style.display = 'table';

        } catch (error) {
            console.error('Error loading filters:', error);
            this.showStatus(`Error loading filters: ${error.message}`, 'error');
            document.getElementById('loading').style.display = 'none';
        }
    }

    renderFilters() {
        const tbody = document.getElementById('filtersBody');
        tbody.innerHTML = '';

        this.filters.forEach(filter => {
            const row = document.createElement('tr');
            
            // Check if this row has pending changes
            const hasChanges = this.changes.has(filter.id);
            if (hasChanges) {
                row.style.backgroundColor = '#fff3cd';
            }
            
            row.innerHTML = `
                <td><strong>${filter.sportsbook}</strong></td>
                <td>
                    <label class="toggle-switch">
                        <input type="checkbox" ${filter.enabled ? 'checked' : ''} 
                               onchange="manager.toggleSportsbook(${filter.id}, this.checked)">
                        <span class="slider"></span>
                    </label>
                </td>
                <td>
                    <input type="number" class="priority-input" value="${filter.priority}" min="0" max="10"
                           onchange="manager.updatePriority(${filter.id}, this.value)">
                </td>
                <td>${filter.description || '-'}</td>
                <td>
                    <button class="secondary" onclick="manager.deleteSportsbook(${filter.id})" title="Delete">🗑️</button>
                </td>
            `;
            
            tbody.appendChild(row);
        });
    }

    toggleSportsbook(id, enabled) {
        const filter = this.filters.find(f => f.id === id);
        if (filter) {
            filter.enabled = enabled;
            this.changes.set(id, { ...filter });
            this.renderFilters();
            this.updateStats();
            this.showStatus(`${filter.sportsbook} ${enabled ? 'enabled' : 'disabled'} (not saved yet)`, 'info');
        }
    }

    updatePriority(id, priority) {
        const filter = this.filters.find(f => f.id === id);
        if (filter) {
            filter.priority = parseInt(priority);
            this.changes.set(id, { ...filter });
            this.renderFilters();
            this.showStatus(`${filter.sportsbook} priority updated to ${priority} (not saved yet)`, 'info');
        }
    }

    async addSportsbook() {
        const input = document.getElementById('newSportsbook');
        const sportsbookName = input.value.trim();
        
        if (!sportsbookName) {
            this.showStatus('Please enter a sportsbook name', 'error');
            return;
        }

        // Check if already exists
        if (this.filters.some(f => f.sportsbook.toLowerCase() === sportsbookName.toLowerCase())) {
            this.showStatus('Sportsbook already exists', 'error');
            return;
        }

        try {
            const newFilter = {
                sportsbook: sportsbookName,
                enabled: true,
                priority: 5,
                description: 'User added'
            };

            const response = await fetch(`${this.supabaseUrl}/sportsbook_filters`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(newFilter)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            input.value = '';
            await this.loadFilters();
            this.showStatus(`Added ${sportsbookName} successfully`, 'success');

        } catch (error) {
            console.error('Error adding sportsbook:', error);
            this.showStatus(`Error adding sportsbook: ${error.message}`, 'error');
        }
    }

    async deleteSportsbook(id) {
        const filter = this.filters.find(f => f.id === id);
        if (!filter) return;

        if (!confirm(`Are you sure you want to delete ${filter.sportsbook}?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.supabaseUrl}/sportsbook_filters?id=eq.${id}`, {
                method: 'DELETE',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            await this.loadFilters();
            this.showStatus(`Deleted ${filter.sportsbook} successfully`, 'success');

        } catch (error) {
            console.error('Error deleting sportsbook:', error);
            this.showStatus(`Error deleting sportsbook: ${error.message}`, 'error');
        }
    }

    async enableMajorBooks() {
        const majorBooks = ['DraftKings', 'FanDuel', 'BetMGM', 'Caesars', 'bet365', 'Pinnacle'];
        
        this.filters.forEach(filter => {
            if (majorBooks.includes(filter.sportsbook)) {
                filter.enabled = true;
                filter.priority = 1;
                this.changes.set(filter.id, { ...filter });
            }
        });

        this.renderFilters();
        this.updateStats();
        this.showStatus('Enabled major sportsbooks (not saved yet)', 'info');
    }

    async disableAll() {
        if (!confirm('Are you sure you want to disable all sportsbooks?')) {
            return;
        }

        this.filters.forEach(filter => {
            filter.enabled = false;
            this.changes.set(filter.id, { ...filter });
        });

        this.renderFilters();
        this.updateStats();
        this.showStatus('Disabled all sportsbooks (not saved yet)', 'info');
    }

    async saveAllChanges() {
        if (this.changes.size === 0) {
            this.showStatus('No changes to save', 'info');
            return;
        }

        try {
            this.showStatus('Saving changes...', 'info');
            
            // Save each changed filter
            for (const [id, filter] of this.changes.entries()) {
                const response = await fetch(`${this.supabaseUrl}/sportsbook_filters?id=eq.${id}`, {
                    method: 'PATCH',
                    headers: this.headers,
                    body: JSON.stringify({
                        enabled: filter.enabled,
                        priority: filter.priority,
                        updated_at: new Date().toISOString()
                    })
                });

                if (!response.ok) {
                    throw new Error(`Failed to save ${filter.sportsbook}: HTTP ${response.status}`);
                }
            }

            this.changes.clear();
            await this.loadFilters();
            this.showStatus(`Saved ${this.changes.size} changes successfully`, 'success');

        } catch (error) {
            console.error('Error saving changes:', error);
            this.showStatus(`Error saving changes: ${error.message}`, 'error');
        }
    }

    updateStats() {
        const total = this.filters.length;
        const enabled = this.filters.filter(f => f.enabled).length;
        
        document.getElementById('totalCount').textContent = total;
        document.getElementById('enabledCount').textContent = enabled;
    }

    async loadStats() {
        try {
            // Get recent odds count (24 hours)
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const response = await fetch(
                `${this.supabaseUrl}/odds?select=count&created_at.gte.${twentyFourHoursAgo}`, 
                { headers: this.headers }
            );

            if (response.ok) {
                const result = await response.json();
                document.getElementById('recentOdds').textContent = result.length || 0;
            }
        } catch (error) {
            console.error('Error loading stats:', error);
            document.getElementById('recentOdds').textContent = 'Error';
        }
    }

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';
        
        // Hide after 5 seconds for success/info messages
        if (type === 'success' || type === 'info') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }
}

// Global manager instance
const manager = new SportsbookFiltersManager();

// Global functions for HTML onclick handlers
function loadFilters() {
    manager.loadFilters();
}

function addSportsbook() {
    manager.addSportsbook();
}

function enableMajorBooks() {
    manager.enableMajorBooks();
}

function disableAll() {
    manager.disableAll();
}

function saveAllChanges() {
    manager.saveAllChanges();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    manager.init();
    
    // Add enter key support for adding sportsbooks
    document.getElementById('newSportsbook').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addSportsbook();
        }
    });
});