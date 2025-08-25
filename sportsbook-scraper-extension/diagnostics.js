// Diagnostics page functionality
class ScrapingDiagnostics {
  constructor() {
    this.currentDomain = '';
    this.debugLog = [];
    this.selectedTabId = null;
  }
  
  async init() {
    this.log('Initializing diagnostics...');
    await this.loadDiagnostics();
    this.setupEventListeners();
    
    // Auto-refresh every 30 seconds (reduced from 5 seconds to avoid spam)
    setInterval(() => this.loadDiagnostics(), 30000);
  }
  
  setupEventListeners() {
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadDiagnostics();
    });
    
    document.getElementById('test-endpoints-btn').addEventListener('click', () => {
      this.testEndpoints();
    });
    
    document.getElementById('clear-cache-btn').addEventListener('click', () => {
      this.clearCache();
    });
  }
  
  async loadDiagnostics() {
    try {
      // Get all sportsbook tabs from background script
      const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TABS' });
      let activeTab = null;
      
      if (statusResponse && statusResponse.success && statusResponse.tabs && statusResponse.tabs.length > 0) {
        // Use the first active sportsbook tab
        activeTab = statusResponse.tabs[0];
        this.currentDomain = activeTab.domain;
        this.selectedTabId = activeTab.id;
        
        document.getElementById('current-domain').textContent = this.currentDomain;
        document.getElementById('current-url').textContent = activeTab.url;
        this.log(`Found ${statusResponse.tabs.length} active sportsbook tab(s)`);
      } else {
        // Fallback: try to find any sportsbook tabs
        const allTabs = await chrome.tabs.query({});
        const sportsbookTabs = allTabs.filter(tab => 
          tab.url && 
          !tab.url.startsWith('chrome://') && 
          !tab.url.startsWith('chrome-extension://') &&
          (tab.url.includes('draftkings') || tab.url.includes('fanduel') || 
           tab.url.includes('betmgm') || tab.url.includes('caesars') ||
           tab.url.includes('bet365') || tab.url.includes('pointsbet') ||
           tab.url.includes('barstool') || tab.url.includes('tipico'))
        );
        
        if (sportsbookTabs.length > 0) {
          activeTab = sportsbookTabs[0];
          try {
            const url = new URL(activeTab.url);
            this.currentDomain = url.hostname;
            this.selectedTabId = activeTab.id;
            document.getElementById('current-domain').textContent = this.currentDomain;
            document.getElementById('current-url').textContent = activeTab.url;
            this.log(`Found ${sportsbookTabs.length} sportsbook tab(s) - using first one`);
          } catch (urlError) {
            this.log(`Invalid sportsbook URL: ${activeTab.url}`);
            activeTab = null;
            this.selectedTabId = null;
          }
        }
        
        if (!activeTab) {
          this.log('No sportsbook tabs found for diagnostics');
          document.getElementById('current-domain').textContent = 'No sportsbook tabs';
          document.getElementById('current-url').textContent = 'Open a sportsbook and press Start';
          this.selectedTabId = null;
          return;
        }
      }
      
      // Get configuration
      const configResult = await chrome.storage.local.get('scraperConfig');
      const configMethod = configResult.scraperConfig?.scrapingStrategy?.method || 'visual';
      document.getElementById('config-method').textContent = configMethod;
      
      // Get discovered endpoints only if we have a valid domain
      let endpoints = [];
      if (this.currentDomain && this.currentDomain !== 'Invalid URL') {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_DISCOVERED_ENDPOINTS',
          domain: this.currentDomain
        });
        
        if (response && response.success) {
          endpoints = response.endpoints || [];
          this.displayEndpoints(endpoints);
          document.getElementById('total-endpoints').textContent = endpoints.length;
          
          // Count odds-related endpoints
          const oddsEndpoints = this.findOddsEndpoints(endpoints);
          document.getElementById('odds-endpoints').textContent = oddsEndpoints.length;
        } else {
          this.log('Failed to get endpoints: ' + (response?.error || 'Unknown error'));
          this.displayEndpoints([]);
          document.getElementById('total-endpoints').textContent = '0';
          document.getElementById('odds-endpoints').textContent = '0';
        }
      }
      
      // Get overall status
      try {
        const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (statusResponse) {
          document.getElementById('current-method').textContent = statusResponse.scrapingMethod || 'Visual DOM';
          
          // Set status colors
          const methodElement = document.getElementById('current-method');
          if (statusResponse.scrapingMethod === 'API') {
            methodElement.className = 'diagnostic-value status-good';
          } else if (statusResponse.scrapingMethod === 'Hybrid') {
            methodElement.className = 'diagnostic-value status-warning';
          } else {
            methodElement.className = 'diagnostic-value status-info';
          }
        } else {
          this.log('No status response received');
        }
      } catch (statusError) {
        this.log('Error getting status: ' + statusError.message);
      }
      
      // Check API detection status
      this.checkAPIDetectionStatus();
      
      // Generate troubleshooting recommendations
      this.generateTroubleshooting(endpoints, configMethod);
      
      this.log('Diagnostics refreshed');
    } catch (error) {
      this.log(`Error loading diagnostics: ${error.message}`);
      console.error('Diagnostics error:', error);
      
      // Set default values on error
      document.getElementById('current-domain').textContent = 'Error loading';
      document.getElementById('current-url').textContent = 'Please refresh the page';
      document.getElementById('current-method').textContent = 'Unknown';
      document.getElementById('config-method').textContent = 'Unknown';
      document.getElementById('total-endpoints').textContent = '0';
      document.getElementById('odds-endpoints').textContent = '0';
      document.getElementById('api-scraper-status').textContent = 'Error';
      
      this.displayEndpoints([]);
      
      const troubleshootingContainer = document.getElementById('troubleshooting-content');
      troubleshootingContainer.innerHTML = `
        <div style="color: #ef4444;">
          <strong>Error loading diagnostics:</strong>
          <p>${error.message}</p>
          <br>
          <strong>Troubleshooting steps:</strong>
          <ol class="troubleshooting-steps">
            <li>Make sure you're on a sportsbook website (not a Chrome internal page)</li>
            <li>Reload the extension (chrome://extensions → reload button)</li>
            <li>Refresh this diagnostics page</li>
            <li>Check the browser console for additional error details</li>
          </ol>
        </div>
      `;
    }
  }
  
  displayEndpoints(endpoints) {
    const container = document.getElementById('endpoints-container');
    
    if (!endpoints || endpoints.length === 0) {
      container.innerHTML = '<p style="color: #64748b;">No API endpoints discovered on this domain.</p>';
      return;
    }
    
    let html = '<div class="endpoint-list">';
    
    endpoints.forEach(endpoint => {
      const isOddsRelated = this.isOddsEndpoint(endpoint);
      html += `
        <div class="endpoint-item">
          <span class="method-badge method-${endpoint.method}">${endpoint.method}</span>
          <span style="flex: 1; font-family: monospace; font-size: 12px;">${endpoint.path}</span>
          ${isOddsRelated ? '<span style="color: #22c55e;">📊 ODDS</span>' : ''}
        </div>
      `;
    });
    
    html += '</div>';
    container.innerHTML = html;
  }
  
  findOddsEndpoints(endpoints) {
    return endpoints.filter(endpoint => this.isOddsEndpoint(endpoint));
  }
  
  isOddsEndpoint(endpoint) {
    const oddsPatterns = [
      /odds/i, /lines/i, /markets/i, /events/i, /games/i,
      /betting/i, /prices/i, /moneyline/i, /spread/i, /total/i
    ];
    
    return oddsPatterns.some(pattern => 
      pattern.test(endpoint.path) || 
      (endpoint.responseStructure?.patterns?.hasMarkets) ||
      (endpoint.responseStructure?.patterns?.hasEvents)
    );
  }
  
  async checkAPIDetectionStatus() {
    try {
      // Check API detection status on the selected sportsbook tab
      if (this.selectedTabId) {
        try {
          const result = await chrome.tabs.sendMessage(this.selectedTabId, {
            type: 'CHECK_API_STATUS'
          });
          
          if (result && result.success) {
            document.getElementById('api-detection').innerHTML = 
              '<span class="status-good">Active</span>';
            document.getElementById('interceptor-status').innerHTML = 
              '<span class="status-good">Loaded</span>';
            document.getElementById('api-scraper-status').textContent = 
              result.apiScraperLoaded ? 'Loaded' : 'Not loaded';
          } else {
            document.getElementById('api-detection').innerHTML = 
              '<span class="status-warning">Not active</span>';
            document.getElementById('interceptor-status').innerHTML = 
              '<span class="status-warning">Not loaded</span>';
            document.getElementById('api-scraper-status').textContent = 'Not loaded';
          }
        } catch (messageError) {
          this.log('Cannot communicate with sportsbook tab: ' + messageError.message);
          document.getElementById('api-detection').innerHTML = 
            '<span class="status-error">No content script</span>';
          document.getElementById('interceptor-status').innerHTML = 
            '<span class="status-error">No content script</span>';
          document.getElementById('api-scraper-status').textContent = 'No content script';
        }
      } else {
        this.log('No sportsbook tab selected for API status check');
        document.getElementById('api-detection').innerHTML = 
          '<span class="status-info">No sportsbook tabs</span>';
        document.getElementById('interceptor-status').innerHTML = 
          '<span class="status-info">No sportsbook tabs</span>';
        document.getElementById('api-scraper-status').textContent = 'No sportsbook tabs';
      }
    } catch (error) {
      this.log('Error checking API status: ' + error.message);
      document.getElementById('api-detection').innerHTML = 
        '<span class="status-error">Error</span>';
      document.getElementById('interceptor-status').innerHTML = 
        '<span class="status-error">Error</span>';
      document.getElementById('api-scraper-status').textContent = 'Error';
    }
  }
  
  generateTroubleshooting(endpoints, configMethod) {
    const container = document.getElementById('troubleshooting-content');
    let issues = [];
    let solutions = [];
    
    // Check if we're on a valid page first
    if (!this.currentDomain || this.currentDomain === 'Invalid URL') {
      issues.push('Not on a valid sportsbook page');
      solutions.push('Navigate to a sportsbook website (DraftKings, FanDuel, etc.)');
      solutions.push('Ensure you are not on a Chrome internal page');
      solutions.push('Refresh the diagnostics page after navigating to a sportsbook');
    } else {
      // Analyze configuration issues
      if (configMethod === 'api' || configMethod === 'hybrid') {
        if (!endpoints || endpoints.length === 0) {
          issues.push('No API endpoints discovered on this site');
          solutions.push('Browse the sportsbook for a few minutes to trigger API calls');
          solutions.push('Look for odds data by clicking on games and markets');
          solutions.push('Check browser console for "📡 API Captured" messages');
          solutions.push('Try refreshing the page and interacting with odds');
        } else {
          const oddsEndpoints = this.findOddsEndpoints(endpoints);
          if (oddsEndpoints.length === 0) {
            issues.push(`Found ${endpoints.length} endpoints but none contain odds data`);
            solutions.push('Look for different sections of the sportsbook (live betting, different sports)');
            solutions.push('Try clicking on different games or markets to trigger odds API calls');
            solutions.push('Check if the site has changed its API structure');
          } else {
            // API endpoints found - check why they might not be working
            issues.push('API endpoints found but scraping may still be using visual mode');
            solutions.push('Check the extension popup to see current scraping method');
            solutions.push('Try clicking "Start" in the extension popup to activate API scraping');
          }
        }
      }
      
      if (configMethod === 'visual') {
        issues.push('Configuration is set to Visual DOM scraping only');
        solutions.push('Go to Config → Scraping Strategy and change to "API-Based" or "Hybrid"');
      }
    }
    
    // Generate HTML
    if (issues.length === 0) {
      container.innerHTML = '<p style="color: #22c55e;">✅ No issues detected!</p>';
    } else {
      let html = '<div style="margin-bottom: 15px;">';
      html += '<strong>Issues detected:</strong><ul style="margin-left: 20px; color: #ef4444;">';
      issues.forEach(issue => {
        html += `<li>${issue}</li>`;
      });
      html += '</ul></div>';
      
      html += '<strong>Recommended solutions:</strong>';
      html += '<ol class="troubleshooting-steps">';
      solutions.forEach(solution => {
        html += `<li>${solution}</li>`;
      });
      html += '</ol>';
      
      container.innerHTML = html;
    }
  }
  
  async testEndpoints() {
    this.log('Testing API endpoints...');
    
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_DISCOVERED_ENDPOINTS',
        domain: this.currentDomain
      });
      
      if (response && response.success && response.endpoints.length > 0) {
        const oddsEndpoints = this.findOddsEndpoints(response.endpoints);
        
        this.log(`Testing ${oddsEndpoints.length} odds-related endpoints...`);
        
        for (const endpoint of oddsEndpoints.slice(0, 3)) { // Test first 3
          try {
            const testResponse = await chrome.runtime.sendMessage({
              type: 'MAKE_API_REQUEST',
              url: `https://${this.currentDomain}${endpoint.path}`,
              method: endpoint.method,
              headers: endpoint.headers || {}
            });
            
            if (testResponse && testResponse.success) {
              this.log(`✅ ${endpoint.method} ${endpoint.path} - Success`);
            } else {
              this.log(`❌ ${endpoint.method} ${endpoint.path} - Failed: ${testResponse?.error || 'Unknown error'}`);
            }
          } catch (error) {
            this.log(`❌ ${endpoint.method} ${endpoint.path} - Error: ${error.message}`);
          }
        }
      } else {
        this.log('No endpoints to test');
      }
    } catch (error) {
      this.log(`Test failed: ${error.message}`);
    }
  }
  
  async clearCache() {
    this.log('Clearing endpoint cache...');
    
    try {
      await chrome.runtime.sendMessage({ type: 'CLEAR_ENDPOINTS' });
      this.log('Cache cleared successfully');
      
      // Refresh diagnostics
      setTimeout(() => this.loadDiagnostics(), 500);
    } catch (error) {
      this.log(`Clear cache failed: ${error.message}`);
    }
  }
  
  log(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    
    this.debugLog.unshift(logMessage);
    if (this.debugLog.length > 20) {
      this.debugLog.pop();
    }
    
    const logElement = document.getElementById('debug-log');
    if (logElement) {
      logElement.innerHTML = '<strong>Debug Log:</strong><br>' + this.debugLog.join('<br>');
    }
    
    console.log('Diagnostics:', message);
  }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
  const diagnostics = new ScrapingDiagnostics();
  diagnostics.init();
});