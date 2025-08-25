// URL Manager JavaScript
class URLManager {
  constructor() {
    this.selectedUrls = new Set();
    this.currentTab = null;
    this.urls = [];
    this.init();
  }

  async init() {
    await this.loadCurrentTab();
    await this.loadURLs();
    this.setupEventListeners();
  }

  async loadCurrentTab() {
    try {
      // First try to get active tab
      const [activeTab] = await chrome.tabs.query({active: true, currentWindow: true});
      
      // If active tab is sportsbook, use it
      if (activeTab && this.isSportsbookURL(activeTab.url)) {
        this.currentTab = activeTab;
        document.getElementById('current-url').classList.add('show');
        document.getElementById('current-url-text').textContent = activeTab.url;
        return;
      }
      
      // Otherwise, look for any sportsbook tabs in current window
      const allTabs = await chrome.tabs.query({currentWindow: true});
      const sportsbookTabs = allTabs.filter(tab => this.isSportsbookURL(tab.url));
      
      if (sportsbookTabs.length > 0) {
        // Use the first sportsbook tab found
        this.currentTab = sportsbookTabs[0];
        document.getElementById('current-url').classList.add('show');
        document.getElementById('current-url-text').textContent = 
          `${sportsbookTabs[0].url} ${sportsbookTabs.length > 1 ? `(+${sportsbookTabs.length - 1} more sportsbook tabs)` : ''}`;
      } else {
        // No sportsbook tabs found
        console.log('No sportsbook tabs detected');
      }
    } catch (error) {
      console.error('Error loading current tab:', error);
    }
  }

  isSportsbookURL(url) {
    const sportsbookPatterns = [
      'oddsjam', 'odds', 'betting', 'sportsbook', 'mlb', 'nfl', 'nba', 'nhl', 'soccer',
      'fanduel', 'draftkings', 'caesars', 'betmgm', 'pointsbet', 'barstool'
    ];
    return sportsbookPatterns.some(pattern => url.toLowerCase().includes(pattern));
  }

  async loadURLs() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STORED_URLS'
      });
      
      if (response && response.success) {
        this.urls = response.data;
        await this.renderURLTable();
        this.updateStats();
      } else {
        console.error('Failed to load URLs:', response?.error);
        this.showEmptyState('Failed to load URLs');
      }
    } catch (error) {
      console.error('Error loading URLs:', error);
      this.showEmptyState('Error loading URLs');
    }
  }

  setupEventListeners() {
    // Save current URL
    document.getElementById('save-current-btn').addEventListener('click', () => {
      this.saveCurrentURL();
    });

    // Selection controls
    document.getElementById('select-all-btn').addEventListener('click', () => {
      this.selectAll();
    });

    document.getElementById('select-none-btn').addEventListener('click', () => {
      this.selectNone();
    });

    document.getElementById('select-active-btn').addEventListener('click', () => {
      this.selectActive();
    });

    // Batch operations
    document.getElementById('batch-scrape-btn').addEventListener('click', () => {
      this.showBatchControls();
    });

    document.getElementById('delete-selected-btn').addEventListener('click', () => {
      this.deleteSelected();
    });

    // Batch job controls
    document.getElementById('start-batch-btn').addEventListener('click', () => {
      this.startBatchJob();
    });

    document.getElementById('cancel-batch-btn').addEventListener('click', () => {
      this.hideBatchControls();
    });

    // Main select all checkbox
    document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
      if (e.target.checked) {
        this.selectAll();
      } else {
        this.selectNone();
      }
    });

    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadURLs();
    });
  }

  async saveCurrentURL() {
    if (!this.currentTab) {
      alert('No current tab detected');
      return;
    }

    const url = this.currentTab.url;
    const domain = new URL(url).hostname;
    
    // Extract sport/league from URL or title
    const sport = this.extractSport(url, this.currentTab.title);
    const league = this.extractLeague(url, this.currentTab.title);
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_URL',
        data: {
          url: url,
          domain: domain,
          sport: sport,
          league: league,
          title: this.currentTab.title,
          description: `Saved from: ${this.currentTab.title}`,
          tags: this.generateTags(url, this.currentTab.title)
        }
      });

      if (response && response.success) {
        console.log('✅ URL saved successfully');
        await this.loadURLs(); // Refresh the list
        
        // Show success feedback
        const btn = document.getElementById('save-current-btn');
        const originalText = btn.textContent;
        btn.textContent = '✅ Saved!';
        btn.style.background = '#10b981';
        setTimeout(() => {
          btn.textContent = originalText;
          btn.style.background = '';
        }, 2000);
      } else {
        console.error('Failed to save URL:', response?.error);
        alert('Failed to save URL: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving URL:', error);
      alert('Error saving URL: ' + error.message);
    }
  }

  extractSport(url, title) {
    const text = (url + ' ' + title).toLowerCase();
    const sports = {
      'mlb': 'MLB',
      'baseball': 'MLB', 
      'nfl': 'NFL',
      'football': 'NFL',
      'nba': 'NBA',
      'basketball': 'NBA',
      'nhl': 'NHL',
      'hockey': 'NHL',
      'soccer': 'SOCCER',
      'mls': 'SOCCER'
    };
    
    for (const [key, sport] of Object.entries(sports)) {
      if (text.includes(key)) {
        return sport;
      }
    }
    return 'UNKNOWN';
  }

  extractLeague(url, title) {
    const text = (url + ' ' + title).toLowerCase();
    const leagues = ['mlb', 'nfl', 'nba', 'nhl', 'mls', 'ncaa', 'epl', 'bundesliga'];
    
    for (const league of leagues) {
      if (text.includes(league)) {
        return league.toUpperCase();
      }
    }
    return this.extractSport(url, title); // Fallback to sport
  }

  generateTags(url, title) {
    const tags = [];
    const text = (url + ' ' + title).toLowerCase();
    
    // Sport tags
    if (text.includes('mlb') || text.includes('baseball')) tags.push('mlb');
    if (text.includes('nfl') || text.includes('football')) tags.push('nfl');
    
    // Market type tags
    if (text.includes('moneyline')) tags.push('moneyline');
    if (text.includes('spread')) tags.push('spread');
    if (text.includes('total')) tags.push('totals');
    
    // Time tags
    const today = new Date();
    tags.push('saved-' + today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0'));
    
    return tags;
  }

  async renderURLTable() {
    const tbody = document.getElementById('url-table-body');
    tbody.innerHTML = '';

    if (this.urls.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No URLs stored yet. Save your first URL!</td></tr>';
      return;
    }

    for (const url of this.urls) {
      const row = document.createElement('tr');
      
      const successRate = url.scrape_count > 0 
        ? Math.round((url.success_count / url.scrape_count) * 100)
        : 0;
        
      const lastScraped = url.last_scraped 
        ? new Date(url.last_scraped).toLocaleString()
        : 'Never';

      // Check if we have discovered endpoints for this domain in memory
      const endpointInfo = await this.getEndpointStatusForDomain(url.domain);
      const endpointStatus = endpointInfo.html;
        
      row.innerHTML = `
        <td class="checkbox-cell">
          <input type="checkbox" data-url-id="${url.id}" ${this.selectedUrls.has(url.id) ? 'checked' : ''}>
        </td>
        <td class="domain-cell">${url.domain}</td>
        <td class="url-cell">${url.url}</td>
        <td>${url.sport || 'Unknown'}/${url.league || 'Unknown'}</td>
        <td>
          <span class="status-badge ${url.active ? 'status-active' : 'status-inactive'}">
            ${url.active ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td style="font-size: 0.75rem;">${endpointStatus}</td>
        <td style="font-size: 0.75rem;">${lastScraped}</td>
        <td>${successRate}% (${url.success_count}/${url.scrape_count})</td>
        <td class="actions-cell">
          <button class="action-btn secondary" data-action="toggle" data-url-id="${url.id}">
            ${url.active ? 'Disable' : 'Enable'}
          </button>
          ${endpointInfo.count === 0 ? `
            <button class="action-btn success" data-action="visual-scrape" data-url-id="${url.id}" title="Start visual scraping for this URL">👁️ Scrape</button>
            <button class="action-btn secondary" data-action="stop-visual-scrape" data-url-id="${url.id}" title="Stop visual scraping for this URL" style="display: none;">⏹️ Stop</button>
          ` : ''}
          <button class="action-btn danger" data-action="delete" data-url-id="${url.id}">Delete</button>
        </td>
      `;
      
      tbody.appendChild(row);
    }

    // Add event listeners for checkboxes
    tbody.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const urlId = parseInt(e.target.getAttribute('data-url-id'));
        if (e.target.checked) {
          this.selectedUrls.add(urlId);
        } else {
          this.selectedUrls.delete(urlId);
        }
        this.updateStats();
      });
    });

    // Add event listeners for action buttons
    tbody.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', (e) => {
        const urlId = parseInt(e.target.getAttribute('data-url-id'));
        const action = e.target.getAttribute('data-action');
        
        if (action === 'toggle') {
          this.toggleURL(urlId);
        } else if (action === 'delete') {
          this.deleteURL(urlId);
        } else if (action === 'visual-scrape') {
          this.startVisualScraping(urlId);
        } else if (action === 'stop-visual-scrape') {
          this.stopVisualScraping(urlId);
        }
      });
    });
  }

  updateStats() {
    document.getElementById('total-urls').textContent = `${this.urls.length} URLs`;
    document.getElementById('selected-count').textContent = `${this.selectedUrls.size} selected`;
    
    // Update master checkbox
    const masterCheckbox = document.getElementById('select-all-checkbox');
    const activeUrls = this.urls.filter(url => url.active);
    masterCheckbox.checked = this.selectedUrls.size > 0 && this.selectedUrls.size === activeUrls.length;
    masterCheckbox.indeterminate = this.selectedUrls.size > 0 && this.selectedUrls.size < activeUrls.length;
  }

  async selectAll() {
    this.urls.forEach(url => {
      if (url.active) {
        this.selectedUrls.add(url.id);
      }
    });
    await this.renderURLTable();
    this.updateStats();
  }

  async selectNone() {
    this.selectedUrls.clear();
    await this.renderURLTable();
    this.updateStats();
  }

  async selectActive() {
    this.selectedUrls.clear();
    this.urls.forEach(url => {
      if (url.active) {
        this.selectedUrls.add(url.id);
      }
    });
    await this.renderURLTable();
    this.updateStats();
  }

  showBatchControls() {
    if (this.selectedUrls.size === 0) {
      alert('Please select URLs to scrape');
      return;
    }
    
    document.getElementById('batch-controls').classList.add('show');
    document.getElementById('job-name').value = `Batch job - ${this.selectedUrls.size} URLs`;
  }

  hideBatchControls() {
    document.getElementById('batch-controls').classList.remove('show');
  }

  async startBatchJob() {
    const jobName = document.getElementById('job-name').value.trim();
    if (!jobName) {
      alert('Please enter a job name');
      return;
    }

    if (this.selectedUrls.size === 0) {
      alert('No URLs selected');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'START_BATCH_SCRAPING',
        data: {
          jobName: jobName,
          urlIds: Array.from(this.selectedUrls)
        }
      });

      if (response && response.success) {
        console.log('✅ Batch job started successfully');
        alert(`Batch job "${jobName}" started with ${this.selectedUrls.size} URLs`);
        this.hideBatchControls();
        this.selectNone();
      } else {
        console.error('Failed to start batch job:', response?.error);
        alert('Failed to start batch job: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error starting batch job:', error);
      alert('Error starting batch job: ' + error.message);
    }
  }

  async deleteSelected() {
    if (this.selectedUrls.size === 0) {
      alert('No URLs selected');
      return;
    }

    if (!confirm(`Delete ${this.selectedUrls.size} selected URLs? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_URLS',
        data: {
          urlIds: Array.from(this.selectedUrls)
        }
      });

      if (response && response.success) {
        console.log('✅ URLs deleted successfully');
        this.selectedUrls.clear();
        await this.loadURLs();
      } else {
        console.error('Failed to delete URLs:', response?.error);
        alert('Failed to delete URLs: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting URLs:', error);
      alert('Error deleting URLs: ' + error.message);
    }
  }

  async toggleURL(urlId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'TOGGLE_URL',
        data: { urlId: urlId }
      });

      if (response && response.success) {
        await this.loadURLs();
      } else {
        console.error('Failed to toggle URL:', response?.error);
        alert('Failed to update URL: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error toggling URL:', error);
      alert('Error updating URL: ' + error.message);
    }
  }

  async deleteURL(urlId) {
    if (!confirm('Delete this URL? This cannot be undone.')) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'DELETE_URLS',
        data: { urlIds: [urlId] }
      });

      if (response && response.success) {
        await this.loadURLs();
      } else {
        console.error('Failed to delete URL:', response?.error);
        alert('Failed to delete URL: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting URL:', error);
      alert('Error deleting URL: ' + error.message);
    }
  }

  async getEndpointStatusForDomain(domain) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DISCOVERED_ENDPOINTS',
        domain: domain
      });
      
      if (response && response.success && response.endpoints) {
        const count = response.endpoints.length;
        return {
          count: count,
          html: count > 0 
            ? `<span title="${count} API endpoints discovered for ${domain}">🚀 ${count} APIs</span>`
            : `<span title="No API endpoints discovered, will use visual scraping">👁️ Visual</span>`
        };
      }
    } catch (error) {
      console.error('Error getting endpoint status:', error);
    }
    
    return {
      count: 0,
      html: `<span title="No API endpoints discovered, will use visual scraping">👁️ Visual</span>`
    };
  }

  async startVisualScraping(urlId) {
    try {
      // Find the URL details
      const url = this.urls.find(u => u.id === urlId);
      if (!url) {
        alert('URL not found');
        return;
      }

      console.log(`🚀 Starting visual scraping for: ${url.url}`);
      
      // Send message to background script to trigger visual scraping
      const response = await chrome.runtime.sendMessage({
        type: 'START_VISUAL_SCRAPING',
        data: {
          url: url.url,
          urlId: urlId,
          domain: url.domain,
          sport: url.sport,
          league: url.league
        }
      });

      if (response && response.success) {
        console.log('✅ Visual scraping started successfully');
        
        // Show success feedback and toggle buttons
        const scrapeButton = document.querySelector(`button[data-action="visual-scrape"][data-url-id="${urlId}"]`);
        const stopButton = document.querySelector(`button[data-action="stop-visual-scrape"][data-url-id="${urlId}"]`);
        
        if (scrapeButton && stopButton) {
          scrapeButton.style.display = 'none';
          stopButton.style.display = 'inline-block';
        }
      } else {
        console.error('Failed to start visual scraping:', response?.error);
        alert('Failed to start visual scraping: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error starting visual scraping:', error);
      alert('Error starting visual scraping: ' + error.message);
    }
  }

  async stopVisualScraping(urlId) {
    try {
      const url = this.urls.find(u => u.id === urlId);
      if (!url) {
        alert('URL not found');
        return;
      }

      console.log(`⏹️ Stopping visual scraping for: ${url.url}`);
      
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_VISUAL_SCRAPING',
        data: {
          url: url.url,
          urlId: urlId,
          domain: url.domain
        }
      });

      if (response && response.success) {
        console.log('✅ Visual scraping stopped successfully');
        
        // Toggle buttons back
        const scrapeButton = document.querySelector(`button[data-action="visual-scrape"][data-url-id="${urlId}"]`);
        const stopButton = document.querySelector(`button[data-action="stop-visual-scrape"][data-url-id="${urlId}"]`);
        
        if (scrapeButton && stopButton) {
          scrapeButton.style.display = 'inline-block';
          stopButton.style.display = 'none';
        }
      } else {
        console.error('Failed to stop visual scraping:', response?.error);
        alert('Failed to stop visual scraping: ' + (response?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error stopping visual scraping:', error);
      alert('Error stopping visual scraping: ' + error.message);
    }
  }

  showEmptyState(message) {
    const tbody = document.getElementById('url-table-body');
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${message}</td></tr>`;
  }
}

// Initialize URL Manager
const urlManager = new URLManager();