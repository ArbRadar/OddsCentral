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
    
    // Load OddsJam sports data
    await this.loadOddsJamData();
    
    // Load current configuration
    await this.loadConfig();
    
    // Load scraping targets and mappings
    await this.loadScrapingTargets();
    await this.loadSportMappings();
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

    // Updated mapping buttons (check if they exist first)
    const resetBtn = document.getElementById('reset-all-config');
    const exportBtn = document.getElementById('export-all-config');
    const importBtn = document.getElementById('import-all-config');
    const importFile = document.getElementById('import-config-file');
    
    if (resetBtn) resetBtn.addEventListener('click', () => this.resetAllConfig());
    if (exportBtn) exportBtn.addEventListener('click', () => this.exportAllConfig());
    if (importBtn) importBtn.addEventListener('click', () => importFile?.click());
    if (importFile) importFile.addEventListener('change', (e) => this.importAllConfig(e));

    // New scraping targets buttons
    const addTargetBtn = document.getElementById('add-scraping-target');
    const saveTargetsBtn = document.getElementById('save-targets');
    if (addTargetBtn) addTargetBtn.addEventListener('click', () => this.addScrapingTarget());
    if (saveTargetsBtn) saveTargetsBtn.addEventListener('click', () => this.saveScrapingTargets());

    // New sport mapping buttons
    const addSportMappingBtn = document.getElementById('add-sport-mapping');
    const saveSportMappingsBtn = document.getElementById('save-sport-mappings');
    if (addSportMappingBtn) addSportMappingBtn.addEventListener('click', () => this.addSportMapping());
    if (saveSportMappingsBtn) saveSportMappingsBtn.addEventListener('click', () => this.saveSportMappings());

    // New league mapping buttons
    const addLeagueMappingBtn = document.getElementById('add-league-mapping');
    const saveLeagueMappingsBtn = document.getElementById('save-league-mappings');
    if (addLeagueMappingBtn) addLeagueMappingBtn.addEventListener('click', () => this.addLeagueMapping());
    if (saveLeagueMappingsBtn) saveLeagueMappingsBtn.addEventListener('click', () => this.saveLeagueMappings());

    // Event delegation for dynamic elements
    document.addEventListener('click', (e) => {
      if (e.target.id === 'add-sport-btn') {
        this.addNewSport();
      } else if (e.target.classList.contains('add-league-btn')) {
        this.addLeagueToSport(e.target);
      } else if (e.target.classList.contains('remove-btn')) {
        const item = e.target.closest('.target-item, .mapping-item');
        const id = item.dataset.id;
        
        if (id) {
          // Mark existing item for deletion
          item.style.display = 'none';
          item.classList.add('deleted');
        } else {
          // Remove new item immediately
          item.remove();
        }
      }
    });

    // Event delegation for dropdown changes
    document.addEventListener('change', async (e) => {
      if (e.target.classList.contains('sport-select')) {
        this.updateTargetName(e.target);
        // Load markets for selected sport
        await this.updateMarketsForSport(e.target);
      } else if (e.target.classList.contains('market-select')) {
        this.updateTargetName(e.target);
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

  // New methods for scraping targets and mappings
  async loadScrapingTargets() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SCRAPING_TARGETS' });
      if (response.success) {
        this.currentTargets = response.data;
        this.renderScrapingTargets(response.data);
      } else {
        console.error('Failed to load scraping targets:', response.error);
        document.getElementById('scraping-targets-container').innerHTML = 
          '<div class="error">Failed to load scraping targets</div>';
      }
    } catch (error) {
      console.error('Error loading scraping targets:', error);
      document.getElementById('scraping-targets-container').innerHTML = 
        '<div class="error">Error loading scraping targets</div>';
    }
  }

  renderScrapingTargets(targets) {
    const container = document.getElementById('scraping-targets-container');
    if (!targets || targets.length === 0) {
      container.innerHTML = '<div class="help-text">No scraping targets configured</div>';
      return;
    }

    const html = targets.map(target => `
      <div class="target-item ${target.enabled ? 'enabled' : ''}" data-id="${target.id}">
        <input type="checkbox" class="toggle" ${target.enabled ? 'checked' : ''}>
        <span class="priority">${target.priority}</span>
        <span><strong>${target.config?.sport || 'Unknown'}</strong></span>
        <span>${target.config?.league || 'N/A'}</span>
        <span>${target.config?.market || 'N/A'}</span>
        <span>${target.name}</span>
        <button class="remove-btn">Remove</button>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  async loadSportMappings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SPORT_MAPPINGS' });
      if (response.success) {
        this.currentSportMappings = response.data;
        this.renderSportMappings(response.data);
      } else {
        console.error('Failed to load sport mappings:', response.error);
        document.getElementById('sport-mappings-container').innerHTML = 
          '<div class="error">Failed to load sport mappings</div>';
      }
    } catch (error) {
      console.error('Error loading sport mappings:', error);
      document.getElementById('sport-mappings-container').innerHTML = 
        '<div class="error">Error loading sport mappings</div>';
    }
  }

  renderSportMappings(mappings) {
    const container = document.getElementById('sport-mappings-container');
    if (!mappings || mappings.length === 0) {
      container.innerHTML = '<div class="help-text">No sport mappings configured</div>';
      return;
    }

    const html = mappings.map(mapping => `
      <div class="mapping-item" data-id="${mapping.id}">
        <input type="text" value="${mapping.oddsjam_sport}" placeholder="OddsJam Sport">
        <input type="text" value="${mapping.omenizer_sport}" placeholder="Omenizer Sport">
        <span class="confidence-score">${(mapping.confidence_score * 100).toFixed(1)}%</span>
        <button class="remove-btn">Remove</button>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  async loadLeagueMappings() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_LEAGUE_MAPPINGS' });
      if (response.success) {
        this.currentLeagueMappings = response.data;
        this.omenizerLeagues = response.omenizerLeagues || [];
        this.renderLeagueMappings(response.data);
      } else {
        console.error('Failed to load league mappings:', response.error);
        document.getElementById('league-mappings-container').innerHTML = 
          '<div class="error">Failed to load league mappings</div>';
      }
    } catch (error) {
      console.error('Error loading league mappings:', error);
      document.getElementById('league-mappings-container').innerHTML = 
        '<div class="error">Error loading league mappings</div>';
    }
  }

  renderLeagueMappings(mappings) {
    const container = document.getElementById('league-mappings-container');
    if (!mappings || mappings.length === 0) {
      container.innerHTML = '<div class="help-text">No league mappings configured</div>';
      return;
    }

    // Get dropdown options using comprehensive data
    const oddsJamLeagues = this.getOddsJamSports().map(sport => ({
      key: sport.league,  // Use the proper league code
      display: sport.display  // Use the formatted display name
    }));
    
    // Remove duplicates
    const uniqueLeagues = [];
    const seen = new Set();
    oddsJamLeagues.forEach(league => {
      if (!seen.has(league.key)) {
        seen.add(league.key);
        uniqueLeagues.push(league);
      }
    });
    
    const oddsJamOptions = uniqueLeagues
      .sort((a, b) => a.display.localeCompare(b.display))
      .map(league => 
        `<option value="${league.key}">${league.display}</option>`
      ).join('');
    
    const omenizerOptions = (this.omenizerLeagues || []).map(league => 
      `<option value="${league.name}">${league.name}</option>`
    ).join('');

    const html = mappings.map(mapping => `
      <div class="mapping-item" data-id="${mapping.id}">
        <select class="oddsjam-league-select">
          <option value="${mapping.oddsjam_league}" selected>${mapping.oddsjam_league}</option>
          ${oddsJamOptions}
        </select>
        <select class="omenizer-league-select">
          <option value="${mapping.omenizer_league}">${mapping.omenizer_league}</option>
          ${omenizerOptions}
        </select>
        <span class="confidence-score">${(mapping.confidence_score * 100).toFixed(1)}%</span>
        <button class="remove-btn">Remove</button>
      </div>
    `).join('');

    container.innerHTML = html;
  }

  // Actual implementation for button handlers
  addScrapingTarget() {
    const container = document.getElementById('scraping-targets-container');
    const newItem = document.createElement('div');
    newItem.className = 'target-item new-target';
    
    // Create dropdowns with actual OddsJam data
    const sportOptions = this.getOddsJamSports().map(sport => 
      `<option value="${sport.key}">${sport.display}</option>`
    ).join('');
    
    const marketOptions = this.getMarketTypes().map(market =>
      `<option value="${market.key}">${market.display}</option>`
    ).join('');
    
    newItem.innerHTML = `
      <input type="checkbox" class="toggle" checked>
      <input type="number" value="1" min="1" max="10" style="width: 60px;" title="Priority">
      <select class="sport-select" style="width: 180px;">
        <option value="">Select Sport...</option>
        ${sportOptions}
      </select>
      <select class="market-select" style="width: 120px;">
        <option value="">Select Market...</option>
        ${marketOptions}
      </select>
      <input type="text" class="target-name" placeholder="Auto-generated name" style="flex: 1;" readonly>
      <button class="remove-btn">Remove</button>
    `;
    container.appendChild(newItem);
  }

  updateTargetName(changedSelect) {
    const targetItem = changedSelect.closest('.target-item');
    const sportSelect = targetItem.querySelector('.sport-select');
    const marketSelect = targetItem.querySelector('.market-select');
    const nameInput = targetItem.querySelector('.target-name');
    
    if (sportSelect.value && marketSelect.value) {
      const sportText = sportSelect.options[sportSelect.selectedIndex].text;
      const marketText = marketSelect.options[marketSelect.selectedIndex].text;
      nameInput.value = `${sportText} ${marketText}`;
    }
  }

  async updateMarketsForSport(sportSelect) {
    const targetItem = sportSelect.closest('.target-item');
    const marketSelect = targetItem.querySelector('.market-select');
    
    if (!sportSelect.value) return;
    
    // Show loading state
    marketSelect.innerHTML = '<option value="">Loading markets...</option>';
    marketSelect.disabled = true;
    
    try {
      // Get markets for selected sport
      const markets = await this.loadMarketTypes(sportSelect.value);
      
      // Update market dropdown
      const marketOptions = markets.map(market =>
        `<option value="${market.key}">${market.display}</option>`
      ).join('');
      
      marketSelect.innerHTML = `
        <option value="">Select Market...</option>
        ${marketOptions}
      `;
      marketSelect.disabled = false;
    } catch (error) {
      console.error('Error loading markets:', error);
      // Fall back to default markets
      const markets = this.getDefaultMarkets();
      const marketOptions = markets.map(market =>
        `<option value="${market.key}">${market.display}</option>`
      ).join('');
      
      marketSelect.innerHTML = `
        <option value="">Select Market...</option>
        ${marketOptions}
      `;
      marketSelect.disabled = false;
    }
  }

  async loadOddsJamData() {
    try {
      const response = await fetch(chrome.runtime.getURL('docs/complete_oddsjam_mapping.json'));
      const data = await response.json();
      this.oddsJamSports = data.sports;
    } catch (error) {
      console.error('Failed to load complete OddsJam data:', error);
      // Fallback to hardcoded subset
      this.oddsJamSports = this.getDefaultSports();
    }
  }

  formatOddsJamSport(sportKey) {
    // Parse sport_league_country format
    const parts = sportKey.split('_');
    
    let sport, league, country = null;
    
    if (parts[0] === 'soccer') {
      sport = 'Soccer';
      if (parts.length >= 3) {
        country = parts[1];
        league = parts.slice(2).join(' ');
      } else {
        league = parts.slice(1).join(' ');
      }
    } else if (parts[0] === 'americanfootball') {
      sport = 'American Football';
      league = parts.slice(1).join(' ').toUpperCase();
    } else if (parts[0] === 'basketball') {
      sport = 'Basketball';
      league = parts.slice(1).join(' ').toUpperCase();
    } else if (parts[0] === 'baseball') {
      sport = 'Baseball'; 
      league = parts.slice(1).join(' ').toUpperCase();
    } else if (parts[0] === 'tennis') {
      sport = 'Tennis';
      league = parts.slice(1).join(' ');
    } else {
      sport = parts[0];
      league = parts.slice(1).join(' ');
    }
    
    // Create display name
    const countryDisplay = country ? `${country.toUpperCase()} ` : '';
    const leagueDisplay = league.charAt(0).toUpperCase() + league.slice(1);
    
    return {
      sport,
      league: league.toUpperCase(),
      country,
      display: `${countryDisplay}${leagueDisplay} (${sport})`
    };
  }

  getOddsJamSports() {
    return this.oddsJamSports || this.getDefaultSports();
  }

  getDefaultSports() {
    return [
      { key: 'baseball_mlb', display: 'MLB (Baseball)', sport: 'Baseball', league: 'MLB' },
      { key: 'americanfootball_nfl', display: 'NFL (Football)', sport: 'American Football', league: 'NFL' },
      { key: 'basketball_nba', display: 'NBA (Basketball)', sport: 'Basketball', league: 'NBA' },
      { key: 'soccer_epl', display: 'English Premier League (Soccer)', sport: 'Soccer', league: 'EPL' }
    ];
  }

  async loadMarketTypes(sport) {
    // Try to fetch markets from OddsJam API endpoint
    try {
      const response = await fetch(`https://oddsjam.com/api/backend/oddscreen/v2/game/markets?sport=${sport}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Parse market types from response
        if (data.markets) {
          return data.markets.map(market => ({
            key: market.key || market.name,
            display: market.display || market.name
          }));
        }
      }
    } catch (error) {
      console.log('Could not fetch markets from API:', error);
    }
    
    // Fallback to default market types
    return this.getDefaultMarkets();
  }

  getMarketTypes() {
    // This will be replaced dynamically when a sport is selected
    return this.getDefaultMarkets();
  }

  getDefaultMarkets() {
    return [
      { key: 'moneyline', display: 'Moneyline' },
      { key: 'spread', display: 'Point Spread' },
      { key: 'total', display: 'Over/Under Total' },
      { key: 'player_props', display: 'Player Props' },
      { key: 'team_props', display: 'Team Props' },
      { key: 'first_half_moneyline', display: 'First Half Moneyline' },
      { key: 'first_half_spread', display: 'First Half Spread' },  
      { key: 'first_half_total', display: 'First Half Total' },
      { key: 'game_props', display: 'Game Props' }
    ];
  }

  addSportMapping() {
    const container = document.getElementById('sport-mappings-container');
    const newItem = document.createElement('div');
    newItem.className = 'mapping-item new-mapping';
    newItem.innerHTML = `
      <input type="text" placeholder="OddsJam Sport (e.g., BASEBALL)">
      <input type="text" placeholder="Omenizer Sport (e.g., Baseball)">
      <span class="confidence-score">100.0%</span>
      <button class="remove-btn">Remove</button>
    `;
    container.appendChild(newItem);
  }

  addLeagueMapping() {
    const container = document.getElementById('league-mappings-container');
    const newItem = document.createElement('div');
    newItem.className = 'mapping-item new-mapping';
    
    // Use the comprehensive OddsJam data directly
    const oddsJamLeagues = this.getOddsJamSports().map(sport => ({
      key: sport.league,  // Use the properly formatted league code
      display: sport.display  // Use the formatted display name
    }));
    
    // Remove duplicates and sort
    const uniqueLeagues = [];
    const seen = new Set();
    oddsJamLeagues.forEach(league => {
      if (!seen.has(league.key)) {
        seen.add(league.key);
        uniqueLeagues.push(league);
      }
    });
    
    const oddsJamOptions = uniqueLeagues
      .sort((a, b) => a.display.localeCompare(b.display))
      .map(league => 
        `<option value="${league.key}">${league.display}</option>`
      ).join('');
    
    // Create Omenizer leagues dropdown
    const omenizerOptions = (this.omenizerLeagues || []).map(league => 
      `<option value="${league.name}">${league.name}</option>`
    ).join('');
    
    newItem.innerHTML = `
      <select class="oddsjam-league-select">
        <option value="">Select OddsJam League...</option>
        ${oddsJamOptions}
      </select>
      <select class="omenizer-league-select">
        <option value="">Select Omenizer League...</option>
        ${omenizerOptions}
      </select>
      <span class="confidence-score">100.0%</span>
      <button class="remove-btn">Remove</button>
    `;
    container.appendChild(newItem);
  }

  async saveScrapingTargets() {
    try {
      const targets = [];
      const deletedIds = [];
      const items = document.querySelectorAll('#scraping-targets-container .target-item');
      
      items.forEach(item => {
        if (item.classList.contains('deleted')) {
          // Collect IDs of items marked for deletion
          if (item.dataset.id) {
            deletedIds.push(item.dataset.id);
          }
          return;
        }
        
        const enabled = item.querySelector('.toggle')?.checked;
        const priority = parseInt(item.querySelector('input[type="number"]')?.value);
        const sportSelect = item.querySelector('.sport-select');
        const marketSelect = item.querySelector('.market-select');
        const nameInput = item.querySelector('.target-name');
        const id = item.dataset.id;
        
        if (sportSelect?.value && marketSelect?.value && nameInput?.value) {
          // Use the OddsJam sport data to get proper sport and league
          const sportData = this.getOddsJamSports().find(s => s.key === sportSelect.value);
          
          // Create config object using OddsJam API format that actually works
          const sportKey = sportData?.key || sportSelect.value;  // e.g., "soccer_spain_la_liga"
          const parts = sportKey.split('_');
          const sportType = parts[0];  // "soccer" 
          
          // Convert to correct OddsJam league format (spain_la_liga -> spain_-_la_liga)
          let leagueKey = parts.slice(1).join('_');  // "spain_la_liga"
          if (parts.length > 2) {
            // Multi-part leagues need _-_ format: spain_la_liga -> spain_-_la_liga
            leagueKey = parts[1] + '_-_' + parts.slice(2).join('_');
          }
          
          const config = {
            sport: sportType,  // "soccer" - what OddsJam endpoint expects
            state: "MX-MX",    // Required state parameter for OddsJam API
            league: leagueKey,  // "spain_-_la_liga" - what OddsJam endpoint expects  
            market: marketSelect.value,  // "moneyline" - maps to market_name in URL
            is_future: "0",    // Required parameter for OddsJam API
            game_status_filter: "All",  // Required parameter 
            opening_odds: "false"  // Required parameter
          };
          
          targets.push({
            id: id || null,
            enabled: enabled,
            priority: priority || 1,
            name: nameInput.value,
            config: JSON.stringify(config)
          });
        }
      });
      
      const response = await chrome.runtime.sendMessage({ 
        type: 'SAVE_SCRAPING_TARGETS', 
        targets: targets,
        deletedIds: deletedIds
      });
      
      if (response.success) {
        this.showSuccess('Scraping targets saved successfully');
        await this.loadScrapingTargets(); // Reload
      } else {
        this.showError('Failed to save scraping targets: ' + response.error);
      }
    } catch (error) {
      this.showError('Error saving scraping targets: ' + error.message);
    }
  }

  async saveSportMappings() {
    try {
      const mappings = [];
      const items = document.querySelectorAll('#sport-mappings-container .mapping-item');
      
      items.forEach(item => {
        const inputs = item.querySelectorAll('input');
        if (inputs.length >= 2) {
          mappings.push({
            id: item.dataset.id || null,
            oddsjam_sport: inputs[0].value,
            omenizer_sport: inputs[1].value
          });
        }
      });
      
      const response = await chrome.runtime.sendMessage({ 
        type: 'SAVE_SPORT_MAPPINGS', 
        mappings: mappings 
      });
      
      if (response.success) {
        this.showSuccess('Sport mappings saved successfully');
        await this.loadSportMappings(); // Reload
      } else {
        this.showError('Failed to save sport mappings: ' + response.error);
      }
    } catch (error) {
      this.showError('Error saving sport mappings: ' + error.message);
    }
  }

  async saveLeagueMappings() {
    try {
      const mappings = [];
      const deletedIds = [];
      const items = document.querySelectorAll('#league-mappings-container .mapping-item');
      
      items.forEach(item => {
        if (item.classList.contains('deleted')) {
          // Collect IDs of items marked for deletion
          if (item.dataset.id) {
            deletedIds.push(item.dataset.id);
          }
          return;
        }
        
        const oddsJamSelect = item.querySelector('.oddsjam-league-select, input[placeholder*="OddsJam"]');
        const omenizerSelect = item.querySelector('.omenizer-league-select, input[placeholder*="Omenizer"]');
        
        if (oddsJamSelect?.value && omenizerSelect?.value) {
          // Find the sport for this league to populate oddsjam_sport field
          const sport = this.getOddsJamSports().find(s => s.league === oddsJamSelect.value);
          
          mappings.push({
            id: item.dataset.id || null,
            oddsjam_league: oddsJamSelect.value,
            omenizer_league: omenizerSelect.value,
            oddsjam_sport: sport?.sport || '',
            omenizer_sport: sport?.sport || ''
          });
        }
      });
      
      const response = await chrome.runtime.sendMessage({ 
        type: 'SAVE_LEAGUE_MAPPINGS', 
        mappings: mappings,
        deletedIds: deletedIds
      });
      
      if (response.success) {
        this.showSuccess('League mappings saved successfully');
        await this.loadLeagueMappings(); // Reload
      } else {
        this.showError('Failed to save league mappings: ' + response.error);
      }
    } catch (error) {
      this.showError('Error saving league mappings: ' + error.message);
    }
  }

  resetAllConfig() {
    if (confirm('Reset all configuration to defaults? This will reload all data from the database.')) {
      this.loadScrapingTargets();
      this.loadSportMappings(); 
      this.loadLeagueMappings();
      this.showSuccess('Configuration reloaded from database');
    }
  }

  exportAllConfig() {
    const config = {
      scrapingTargets: this.currentTargets || [],
      sportMappings: this.currentSportMappings || [],
      leagueMappings: this.currentLeagueMappings || [],
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scraper-config.json';
    a.click();
    
    URL.revokeObjectURL(url);
    this.showSuccess('Configuration exported');
  }

  async importAllConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const config = JSON.parse(text);
      
      if (config.scrapingTargets) {
        this.currentTargets = config.scrapingTargets;
        this.renderScrapingTargets(config.scrapingTargets);
      }
      if (config.sportMappings) {
        this.currentSportMappings = config.sportMappings;
        this.renderSportMappings(config.sportMappings);
      }
      if (config.leagueMappings) {
        this.currentLeagueMappings = config.leagueMappings;
        this.renderLeagueMappings(config.leagueMappings);
      }
      
      this.showSuccess('Configuration imported successfully');
    } catch (error) {
      this.showError('Failed to import configuration: ' + error.message);
    }
    
    event.target.value = '';
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ConfigController();
});