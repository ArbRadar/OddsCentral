// Configuration page JavaScript
class ConfigController {
  constructor() {
    this.defaultConfig = {
      refresh: {
        shortInterval: 5,      // seconds
        fullInterval: 5,       // minutes
        oddsWindow: 30        // minutes
      },
      gameMatching: {
        timeWindow: 8,        // hours
        matchTeams: true,
        matchSport: true
      },
      analytics: {
        enableOutlierFilter: true,
        outlierMethod: 'conservative',
        minBooksForOutlier: 5,
        evThreshold: 0.5,
        evCalculationMethod: 'worst-odds',
        useAlgoFairline: false
      },
      scrapingRules: {
        drawKeywords: ['draw', 'tie', 'x', 'empate'],
        teamOrganization: 'auto',
        oddsColumnDetection: 'hybrid',
        outlierOddsThreshold: 10000,
        autoFixDrawPosition: true,
        validateTeamNames: true
      },
      dataManagement: {
        retentionPeriod: 7,   // days
        autoCleanup: true
      }
    };

    this.init();
  }

  async init() {
    // Set up tab switching first
    this.setupTabs();
    
    // Load current configuration
    await this.loadConfig();
    
    // Load league mappings
    await this.loadLeagueMappings();
    
    // Set up event listeners
    this.setupEventListeners();
  }

  setupTabs() {
    // Tab switching functionality
    const tabs = document.querySelectorAll('.config-tab');
    const tabContents = document.querySelectorAll('.config-tab-content');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;
        
        // Remove active class from all tabs and content
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding content
        tab.classList.add('active');
        const targetContent = document.getElementById(`${targetTab}-tab`);
        if (targetContent) {
          targetContent.classList.add('active');
        }
      });
    });
  }

  async loadConfig() {
    try {
      const result = await chrome.storage.local.get(['scraperConfig']);
      const config = result.scraperConfig || this.defaultConfig;
      
      // Apply config to form
      this.applyConfigToForm(config);
    } catch (error) {
      console.error('Error loading config:', error);
      this.showError('Failed to load configuration');
    }
  }

  applyConfigToForm(config) {
    // Refresh settings
    document.getElementById('short-refresh').value = config.refresh.shortInterval;
    document.getElementById('full-refresh').value = config.refresh.fullInterval;
    document.getElementById('odds-window').value = config.refresh.oddsWindow;
    
    // Game matching
    document.getElementById('game-window').value = config.gameMatching.timeWindow;
    document.getElementById('match-teams').checked = config.gameMatching.matchTeams;
    document.getElementById('match-sport').checked = config.gameMatching.matchSport;
    
    // Analytics
    document.getElementById('enable-outlier').checked = config.analytics.enableOutlierFilter;
    document.getElementById('outlier-method').value = config.analytics.outlierMethod;
    document.getElementById('min-books').value = config.analytics.minBooksForOutlier;
    document.getElementById('ev-threshold').value = config.analytics.evThreshold;
    document.getElementById('ev-calculation').value = config.analytics.evCalculationMethod;
    document.getElementById('use-algo-fairline').checked = config.analytics.useAlgoFairline || false;
    
    // Scraping strategy (with defaults)
    const scrapingStrategy = config.scrapingStrategy || {};
    document.getElementById('scraping-method').value = scrapingStrategy.method || 'visual';
    document.getElementById('enable-api-detection').checked = scrapingStrategy.enableApiDetection !== false;
    document.getElementById('use-multi-tabs').checked = scrapingStrategy.useMultiTabs !== false;
    document.getElementById('api-refresh-interval').value = scrapingStrategy.apiRefreshInterval || 30;
    
    // Scraping rules (with defaults)
    const scrapingRules = config.scrapingRules || {};
    document.getElementById('draw-keywords').value = (scrapingRules.drawKeywords || ['draw', 'tie', 'x', 'empate']).join(', ');
    document.getElementById('team-organization').value = scrapingRules.teamOrganization || 'auto';
    document.getElementById('odds-column-detection').value = scrapingRules.oddsColumnDetection || 'hybrid';
    document.getElementById('outlier-odds-threshold').value = scrapingRules.outlierOddsThreshold || 10000;
    document.getElementById('auto-fix-draw-position').checked = scrapingRules.autoFixDrawPosition !== false;
    document.getElementById('validate-team-names').checked = scrapingRules.validateTeamNames !== false;
    
    // Data management
    document.getElementById('retention-period').value = config.dataManagement.retentionPeriod;
    document.getElementById('auto-cleanup').checked = config.dataManagement.autoCleanup;
  }

  getFormConfig() {
    return {
      refresh: {
        shortInterval: parseInt(document.getElementById('short-refresh').value),
        fullInterval: parseInt(document.getElementById('full-refresh').value),
        oddsWindow: parseInt(document.getElementById('odds-window').value)
      },
      gameMatching: {
        timeWindow: parseInt(document.getElementById('game-window').value),
        matchTeams: document.getElementById('match-teams').checked,
        matchSport: document.getElementById('match-sport').checked
      },
      analytics: {
        enableOutlierFilter: document.getElementById('enable-outlier').checked,
        outlierMethod: document.getElementById('outlier-method').value,
        minBooksForOutlier: parseInt(document.getElementById('min-books').value),
        evThreshold: parseFloat(document.getElementById('ev-threshold').value),
        evCalculationMethod: document.getElementById('ev-calculation').value,
        useAlgoFairline: document.getElementById('use-algo-fairline').checked
      },
      scrapingStrategy: {
        method: document.getElementById('scraping-method').value,
        enableApiDetection: document.getElementById('enable-api-detection').checked,
        useMultiTabs: document.getElementById('use-multi-tabs').checked,
        apiRefreshInterval: parseInt(document.getElementById('api-refresh-interval').value)
      },
      scrapingRules: {
        drawKeywords: document.getElementById('draw-keywords').value.split(',').map(k => k.trim()).filter(k => k),
        teamOrganization: document.getElementById('team-organization').value,
        oddsColumnDetection: document.getElementById('odds-column-detection').value,
        outlierOddsThreshold: parseInt(document.getElementById('outlier-odds-threshold').value),
        autoFixDrawPosition: document.getElementById('auto-fix-draw-position').checked,
        validateTeamNames: document.getElementById('validate-team-names').checked
      },
      dataManagement: {
        retentionPeriod: parseInt(document.getElementById('retention-period').value),
        autoCleanup: document.getElementById('auto-cleanup').checked
      }
    };
  }

  async loadLeagueMappings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LEAGUE_MAPPINGS' });
      if (response && response.success) {
        this.currentMappings = response.mappings;
        this.renderLeagueMappings();
      } else {
        console.error('Failed to load league mappings');
        this.showError('Failed to load league mappings');
      }
    } catch (error) {
      console.error('Error loading league mappings:', error);
      this.showError('Failed to load league mappings');
    }
  }

  renderLeagueMappings() {
    const container = document.getElementById('league-mappings-container');
    
    // Add form for new sport
    const addSportForm = document.createElement('div');
    addSportForm.className = 'add-sport-form';
    addSportForm.innerHTML = `
      <h3>Add New Sport</h3>
      <div class="form-row">
        <input type="text" id="new-sport-name" placeholder="Sport name (e.g., SOCCER)" style="text-transform: uppercase;">
        <select id="new-sport-outcomes">
          <option value="2">2 outcomes (Home/Away)</option>
          <option value="3">3 outcomes (Home/Draw/Away)</option>
        </select>
        <button type="button" id="add-sport-btn">Add Sport</button>
      </div>
    `;
    container.appendChild(addSportForm);

    // Render existing sports
    for (const [sport, leagues] of Object.entries(this.currentMappings)) {
      const sportSection = this.createSportSection(sport, leagues);
      container.appendChild(sportSection);
    }
  }

  createSportSection(sport, leagues) {
    const section = document.createElement('div');
    section.className = 'sport-section';
    
    const outcomes = sport === 'SOCCER' ? 3 : 2;
    
    section.innerHTML = `
      <div class="sport-header" onclick="this.parentElement.classList.toggle('collapsed')">
        <div class="sport-title">
          <span>${sport}</span>
          <span class="sport-meta">(${outcomes} outcomes)</span>
        </div>
        <div class="sport-meta">
          ${leagues.length} leagues
          <span class="expand-icon">▼</span>
        </div>
      </div>
      <div class="sport-content">
        <div class="leagues-grid">
          ${leagues.map(league => `
            <div class="league-tag">
              <span>${league}</span>
              <button class="remove-league" onclick="this.parentElement.parentElement.removeChild(this.parentElement); event.stopPropagation();">×</button>
            </div>
          `).join('')}
        </div>
        <div class="add-league-form">
          <input type="text" placeholder="Add new league..." class="league-input">
          <button type="button" onclick="this.previousElementSibling.value && this.parentElement.previousElementSibling.appendChild(this.createLeagueTag(this.previousElementSibling.value)) && (this.previousElementSibling.value = '')" 
                  class="add-league-btn">Add</button>
        </div>
        <button type="button" class="secondary-button" style="margin-top: 1rem;" onclick="this.closest('.sport-section').remove()">
          Delete Sport
        </button>
      </div>
    `;
    
    return section;
  }

  setupEventListeners() {
    // Save button
    document.getElementById('save-config').addEventListener('click', () => this.saveConfig());
    
    // Reset button
    document.getElementById('reset-defaults').addEventListener('click', () => this.resetToDefaults());
    
    // Enable/disable outlier method based on checkbox
    document.getElementById('enable-outlier').addEventListener('change', (e) => {
      document.getElementById('outlier-method').disabled = !e.target.checked;
      document.getElementById('min-books').disabled = !e.target.checked;
    });

    // League mapping buttons
    document.getElementById('reset-mappings').addEventListener('click', () => this.resetMappings());
    document.getElementById('export-mappings').addEventListener('click', () => this.exportMappings());
    document.getElementById('import-mappings').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', (e) => this.importMappings(e));

    // Add sport button (delegated event listener)
    document.addEventListener('click', (e) => {
      if (e.target.id === 'add-sport-btn') {
        this.addNewSport();
      } else if (e.target.classList.contains('add-league-btn')) {
        this.addLeagueToSport(e.target);
      }
    });
  }

  addNewSport() {
    const nameInput = document.getElementById('new-sport-name');
    const outcomesSelect = document.getElementById('new-sport-outcomes');
    
    const sportName = nameInput.value.trim().toUpperCase();
    if (!sportName) {
      this.showError('Please enter a sport name');
      return;
    }

    if (this.currentMappings[sportName]) {
      this.showError('Sport already exists');
      return;
    }

    this.currentMappings[sportName] = [];
    
    const container = document.getElementById('league-mappings-container');
    const addForm = container.querySelector('.add-sport-form');
    const newSection = this.createSportSection(sportName, []);
    container.insertBefore(newSection, addForm.nextSibling);
    
    nameInput.value = '';
    this.showSuccess('Sport added successfully');
  }

  addLeagueToSport(button) {
    const input = button.previousElementSibling;
    const leagueName = input.value.trim().toLowerCase();
    
    if (!leagueName) return;
    
    const leaguesGrid = button.parentElement.previousElementSibling;
    const sportSection = button.closest('.sport-section');
    const sportName = sportSection.querySelector('.sport-title span').textContent;
    
    // Check if league already exists
    if (this.currentMappings[sportName].includes(leagueName)) {
      this.showError('League already exists in this sport');
      return;
    }
    
    // Add to current mappings
    this.currentMappings[sportName].push(leagueName);
    
    // Add to UI
    const leagueTag = document.createElement('div');
    leagueTag.className = 'league-tag';
    leagueTag.innerHTML = `
      <span>${leagueName}</span>
      <button class="remove-league" onclick="this.parentElement.remove();">×</button>
    `;
    leaguesGrid.appendChild(leagueTag);
    
    input.value = '';
    
    // Update league count
    const countSpan = sportSection.querySelector('.sport-meta');
    const currentCount = this.currentMappings[sportName].length;
    countSpan.textContent = `${currentCount} leagues`;
  }

  async saveConfig() {
    try {
      const config = this.getFormConfig();
      
      // Validate config
      if (!this.validateConfig(config)) {
        return;
      }
      
      // Save to storage
      await chrome.storage.local.set({ scraperConfig: config });
      
      // Save league mappings if they exist
      if (this.currentMappings) {
        // Collect current mappings from UI
        const updatedMappings = this.collectCurrentMappings();
        await chrome.runtime.sendMessage({ 
          type: 'UPDATE_LEAGUE_MAPPINGS', 
          mappings: updatedMappings 
        });
      }
      
      // Notify background script of config change
      await chrome.runtime.sendMessage({ 
        type: 'CONFIG_UPDATED', 
        config: config 
      });
      
      this.showSuccess('Configuration saved successfully!');
    } catch (error) {
      console.error('Error saving config:', error);
      this.showError('Failed to save configuration');
    }
  }

  collectCurrentMappings() {
    const mappings = {};
    const sportSections = document.querySelectorAll('.sport-section');
    
    sportSections.forEach(section => {
      const sportName = section.querySelector('.sport-title span').textContent;
      const leagueTags = section.querySelectorAll('.league-tag span');
      mappings[sportName] = Array.from(leagueTags).map(tag => tag.textContent);
    });
    
    return mappings;
  }

  async resetMappings() {
    if (confirm('Are you sure you want to reset league mappings to defaults? This will remove any custom mappings.')) {
      try {
        // Get default mappings from background
        await chrome.runtime.sendMessage({ 
          type: 'UPDATE_LEAGUE_MAPPINGS', 
          mappings: null // null triggers default reset
        });
        
        // Reload mappings
        await this.loadLeagueMappings();
        this.showSuccess('League mappings reset to defaults');
      } catch (error) {
        console.error('Error resetting mappings:', error);
        this.showError('Failed to reset mappings');
      }
    }
  }

  exportMappings() {
    const mappings = this.collectCurrentMappings();
    const blob = new Blob([JSON.stringify(mappings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'league-mappings.json';
    a.click();
    
    URL.revokeObjectURL(url);
    this.showSuccess('League mappings exported');
  }

  async importMappings(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const mappings = JSON.parse(text);
      
      // Validate the structure
      if (typeof mappings !== 'object' || mappings === null) {
        throw new Error('Invalid file format');
      }
      
      // Update background storage
      await chrome.runtime.sendMessage({ 
        type: 'UPDATE_LEAGUE_MAPPINGS', 
        mappings: mappings 
      });
      
      // Reload mappings in UI
      this.currentMappings = mappings;
      const container = document.getElementById('league-mappings-container');
      container.innerHTML = '';
      this.renderLeagueMappings();
      
      this.showSuccess('League mappings imported successfully');
    } catch (error) {
      console.error('Error importing mappings:', error);
      this.showError('Failed to import mappings: ' + error.message);
    }
    
    // Clear the file input
    event.target.value = '';
  }

  validateConfig(config) {
    // Validate refresh intervals
    if (config.refresh.shortInterval < 1 || config.refresh.shortInterval > 60) {
      this.showError('Short refresh interval must be between 1 and 60 seconds');
      return false;
    }
    
    if (config.refresh.fullInterval < 1 || config.refresh.fullInterval > 60) {
      this.showError('Full refresh interval must be between 1 and 60 minutes');
      return false;
    }
    
    if (config.refresh.oddsWindow < 5 || config.refresh.oddsWindow > 120) {
      this.showError('Odds window must be between 5 and 120 minutes');
      return false;
    }
    
    // Validate game matching
    if (config.gameMatching.timeWindow < 1 || config.gameMatching.timeWindow > 24) {
      this.showError('Game time window must be between 1 and 24 hours');
      return false;
    }
    
    // Validate analytics
    if (config.analytics.minBooksForOutlier < 3 || config.analytics.minBooksForOutlier > 10) {
      this.showError('Minimum books for outlier detection must be between 3 and 10');
      return false;
    }
    
    if (config.analytics.evThreshold < 0 || config.analytics.evThreshold > 10) {
      this.showError('EV threshold must be between 0 and 10%');
      return false;
    }
    
    // Validate scraping rules
    if (config.scrapingRules.outlierOddsThreshold < 5000 || config.scrapingRules.outlierOddsThreshold > 50000) {
      this.showError('Outlier odds threshold must be between 5,000 and 50,000');
      return false;
    }
    
    if (!config.scrapingRules.drawKeywords || config.scrapingRules.drawKeywords.length === 0) {
      this.showError('At least one draw keyword must be specified');
      return false;
    }
    
    // Validate data management
    if (config.dataManagement.retentionPeriod < 1 || config.dataManagement.retentionPeriod > 30) {
      this.showError('Retention period must be between 1 and 30 days');
      return false;
    }
    
    return true;
  }

  async resetToDefaults() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      this.applyConfigToForm(this.defaultConfig);
      await this.saveConfig();
    }
  }

  showSuccess(message) {
    const successEl = document.getElementById('success-message');
    successEl.textContent = message;
    successEl.style.display = 'block';
    
    setTimeout(() => {
      successEl.style.display = 'none';
    }, 3000);
  }

  showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    
    setTimeout(() => {
      errorEl.style.display = 'none';
    }, 5000);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ConfigController();
});