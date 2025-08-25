// Sportsbook page JavaScript
class SportsbookController {
  constructor() {
    this.data = {
      games: [],
      odds: []
    };
    
    // Load saved filters or use defaults
    this.filters = this.loadSavedFilters() || {
      sport: 'all',
      league: 'all',
      bookmaker: 'all',
      date: '',
      freshness: '24hours',
      oddsFormat: 'american'
    };
    this.pagination = {
      currentPage: 1,
      itemsPerPage: 10,
      totalItems: 0,
      totalPages: 0
    };
    this.filteredData = [];
    
    this.init();
  }

  loadSavedFilters() {
    try {
      const saved = localStorage.getItem('sportsbook-filters');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.warn('Error loading saved filters:', e);
      return null;
    }
  }

  saveFilters() {
    try {
      localStorage.setItem('sportsbook-filters', JSON.stringify(this.filters));
    } catch (e) {
      console.warn('Error saving filters:', e);
    }
  }

  restoreFilterUI() {
    try {
      document.getElementById('sport-filter').value = this.filters.sport;
      document.getElementById('league-filter').value = this.filters.league;
      document.getElementById('bookmaker-filter').value = this.filters.bookmaker;
      document.getElementById('date-filter').value = this.filters.date;
      document.getElementById('freshness-filter').value = this.filters.freshness;
      document.getElementById('odds-format').value = this.filters.oddsFormat;
    } catch (e) {
      console.warn('Error restoring filter UI:', e);
    }
  }

  async init() {
    // Set up event listeners
    this.setupEventListeners();
    
    // Load initial data
    await this.loadData();
    
    // Auto-refresh every 60 seconds
    setInterval(() => this.loadData(), 60000);
  }

  setupEventListeners() {
    // Filter changes
    document.getElementById('sport-filter').addEventListener('change', (e) => {
      this.filters.sport = e.target.value;
      this.saveFilters();
      this.applyFilters();
    });

    document.getElementById('league-filter').addEventListener('change', (e) => {
      this.filters.league = e.target.value;
      this.saveFilters();
      this.applyFilters();
    });

    document.getElementById('bookmaker-filter').addEventListener('change', (e) => {
      this.filters.bookmaker = e.target.value;
      this.saveFilters();
      this.applyFilters();
    });

    document.getElementById('date-filter').addEventListener('change', (e) => {
      this.filters.date = e.target.value;
      this.saveFilters();
      this.applyFilters();
    });
    
    document.getElementById('freshness-filter').addEventListener('change', (e) => {
      this.filters.freshness = e.target.value;
      this.saveFilters();
      this.loadData(); // Reload data with new freshness filter
    });

    document.getElementById('odds-format').addEventListener('change', (e) => {
      this.filters.oddsFormat = e.target.value;
      this.saveFilters();
      this.renderGames(); // Re-render to update odds display format
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadData();
    });

    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
      if (this.pagination.currentPage > 1) {
        this.pagination.currentPage--;
        this.renderGames();
      }
    });

    document.getElementById('next-page').addEventListener('click', () => {
      if (this.pagination.currentPage < this.pagination.totalPages) {
        this.pagination.currentPage++;
        this.renderGames();
      }
    });
    
    // Game expansion - single persistent event listener
    document.getElementById('games-container').addEventListener('click', (e) => {
      const gameHeader = e.target.closest('.game-header');
      if (gameHeader) {
        const gameId = gameHeader.getAttribute('data-game-id');
        if (gameId) {
          this.toggleGameExpansion(gameId);
        }
      }
    });
  }

  async loadData() {
    try {
      document.getElementById('loading').style.display = 'block';
      document.getElementById('games-container').innerHTML = '';
      document.getElementById('pagination').style.display = 'none';
      
      // Get data from extension background script with freshness filter
      const hoursBack = this.getFreshnessHours(this.filters.freshness);
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_ANALYTICS_DATA',
        hoursBack: hoursBack
      });
      
      if (response && response.success) {
        this.data = response.data;
        console.log('Sportsbook data loaded:', this.data.games.length, 'games,', this.data.odds.length, 'odds');
        
        // Combine games with their odds
        this.processData();
        
        // Update filter options
        this.updateFilterOptions();
        
        // Restore saved filter UI state
        this.restoreFilterUI();
        
        // Apply filters and render
        this.applyFilters();
        
        document.getElementById('loading').style.display = 'none';
      } else {
        console.error('Failed to load sportsbook data:', response?.error);
        this.showError(response?.error || 'Failed to load data');
        document.getElementById('loading').style.display = 'none';
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.showError('Connection error: ' + error.message);
      document.getElementById('loading').style.display = 'none';
    }
  }

  processData() {
    // Group odds by game_id
    const oddsByGame = new Map();
    for (const odds of this.data.odds) {
      if (!oddsByGame.has(odds.game_id)) {
        oddsByGame.set(odds.game_id, []);
      }
      oddsByGame.get(odds.game_id).push(odds);
    }

    // Combine games with odds
    this.processedData = this.data.games.map(game => ({
      ...game,
      odds: oddsByGame.get(game.game_id) || []
    }));

    // Sort games: 
    // 1. Games that have already started or recently finished (within last 3 hours) - sorted by most recent
    // 2. Future games - sorted by soonest first
    const now = new Date();
    const threeHoursAgo = new Date(now - 3 * 60 * 60 * 1000);
    
    this.processedData.sort((a, b) => {
      const timeA = new Date(a.start_time_parsed || a.start_time);
      const timeB = new Date(b.start_time_parsed || b.start_time);
      
      // Check if games are past/ongoing (started before now)
      const isPastA = timeA <= now;
      const isPastB = timeB <= now;
      
      // Check if games are recent (started within last 3 hours)
      const isRecentA = timeA > threeHoursAgo;
      const isRecentB = timeB > threeHoursAgo;
      
      // Both are past/ongoing games
      if (isPastA && isPastB) {
        // Sort by most recent first (descending)
        return timeB - timeA;
      }
      
      // Both are future games
      if (!isPastA && !isPastB) {
        // Sort by soonest first (ascending)
        return timeA - timeB;
      }
      
      // One is past/ongoing, one is future
      // Past/ongoing games come first
      return isPastA ? -1 : 1;
    });
  }

  updateFilterOptions() {
    // Get unique sports
    const sports = new Set(this.processedData.map(game => game.sport_display || game.sport).filter(Boolean));
    const sportFilter = document.getElementById('sport-filter');
    sportFilter.innerHTML = '<option value="all">All Sports</option>';
    Array.from(sports).sort().forEach(sport => {
      const option = document.createElement('option');
      option.value = sport;
      option.textContent = sport;
      sportFilter.appendChild(option);
    });

    // Get unique leagues
    const leagues = new Set(this.processedData.map(game => game.league_display || game.league).filter(Boolean));
    const leagueFilter = document.getElementById('league-filter');
    leagueFilter.innerHTML = '<option value="all">All Leagues</option>';
    Array.from(leagues).sort().forEach(league => {
      const option = document.createElement('option');
      option.value = league;
      option.textContent = league;
      leagueFilter.appendChild(option);
    });

    // Get unique event dates
    const eventDates = new Set();
    this.processedData.forEach(game => {
      const gameDate = new Date(game.start_time_parsed || game.start_time);
      if (!isNaN(gameDate.getTime())) {
        const dateStr = gameDate.toISOString().split('T')[0];
        eventDates.add(dateStr);
      }
    });
    const dateFilter = document.getElementById('date-filter');
    dateFilter.innerHTML = '<option value="">All Dates</option>';
    Array.from(eventDates).sort().forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      const dateObj = new Date(date + 'T00:00:00'); // Ensure proper timezone handling
      
      // Get today's date in local timezone for comparison
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Convert comparison dates to YYYY-MM-DD format
      const todayStr = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      let displayText = dateObj.toLocaleDateString('en-US', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
      });
      
      // Add relative labels based on corrected comparison
      if (date === todayStr) {
        displayText += ' (Today)';
      } else if (date === tomorrowStr) {
        displayText += ' (Tomorrow)';
      }
      
      option.textContent = displayText;
      dateFilter.appendChild(option);
    });

    // Get unique bookmakers
    const bookmakers = new Set();
    this.processedData.forEach(game => {
      game.odds.forEach(odds => {
        if (odds.sportsbook) {
          bookmakers.add(odds.sportsbook);
        }
      });
    });
    const bookmakerFilter = document.getElementById('bookmaker-filter');
    bookmakerFilter.innerHTML = '<option value="all">All Bookmakers</option>';
    Array.from(bookmakers).sort().forEach(bookmaker => {
      const option = document.createElement('option');
      option.value = bookmaker;
      option.textContent = bookmaker;
      bookmakerFilter.appendChild(option);
    });
  }

  applyFilters() {
    this.filteredData = this.processedData.filter(game => {
      // Sport filter
      if (this.filters.sport !== 'all' && game.sport_display !== this.filters.sport && game.sport !== this.filters.sport) {
        return false;
      }

      // League filter
      if (this.filters.league !== 'all' && game.league_display !== this.filters.league && game.league !== this.filters.league) {
        return false;
      }

      // Bookmaker filter
      if (this.filters.bookmaker !== 'all') {
        const hasBookmaker = game.odds.some(odds => odds.sportsbook === this.filters.bookmaker);
        if (!hasBookmaker) {
          return false;
        }
      }

      // Date filter
      if (this.filters.date) {
        const gameDate = new Date(game.start_time_parsed || game.start_time).toISOString().split('T')[0];
        if (gameDate !== this.filters.date) {
          return false;
        }
      }

      return true;
    });

    // Update pagination
    this.pagination.totalItems = this.filteredData.length;
    this.pagination.totalPages = Math.ceil(this.pagination.totalItems / this.pagination.itemsPerPage);
    this.pagination.currentPage = Math.min(this.pagination.currentPage, this.pagination.totalPages || 1);

    // Update count
    document.getElementById('games-count').textContent = `(${this.filteredData.length} games)`;

    // Render games
    this.renderGames();
  }

  renderGames() {
    const container = document.getElementById('games-container');
    const noDataEl = document.getElementById('no-data');
    const paginationEl = document.getElementById('pagination');

    if (this.filteredData.length === 0) {
      container.innerHTML = '';
      noDataEl.style.display = 'block';
      paginationEl.style.display = 'none';
      return;
    }

    noDataEl.style.display = 'none';

    // Calculate pagination
    const startIndex = (this.pagination.currentPage - 1) * this.pagination.itemsPerPage;
    const endIndex = Math.min(startIndex + this.pagination.itemsPerPage, this.filteredData.length);
    const pageData = this.filteredData.slice(startIndex, endIndex);

    // Render games
    container.innerHTML = pageData.map(game => this.renderGameCard(game)).join('');
    
    // Event delegation is already set up in setupEventListeners()

    // Update pagination controls
    this.updatePagination();
  }

  renderGameCard(game) {
    const gameTime = new Date(game.start_time_parsed || game.start_time);
    const isLive = game.game_status && game.game_status.toLowerCase().includes('live');
    const filteredOdds = this.getFilteredOdds(game.odds);
    const hasOdds = filteredOdds.length > 0;
    const gameCardId = `game-${game.game_id || game.id}`;
    
    return `
      <div class="game-card ${hasOdds ? 'has-odds' : 'no-odds'}">
        <div class="game-header clickable" data-game-id="${gameCardId}">
          <div class="game-title">
            <span class="expand-icon" id="icon-${gameCardId}">▶</span>
            ${game.name || `${game.home_team} vs ${game.away_team}`}
            ${isLive ? '<span class="live-indicator">🔴 LIVE</span>' : ''}
          </div>
          <div class="game-info">
            <span><strong>Sport:</strong> ${game.sport_display || game.sport}</span>
            <span><strong>League:</strong> ${game.league_display || game.league}</span>
            <span><strong>Time:</strong> ${gameTime.toLocaleString()}</span>
            ${game.game_status ? `<span><strong>Status:</strong> ${game.game_status}</span>` : ''}
            <span><strong>Odds:</strong> ${filteredOdds.length} bookmaker${filteredOdds.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        
        <div class="game-content collapsed" id="content-${gameCardId}">
          ${hasOdds ? `
            <table class="odds-table">
              <thead>
                <tr>
                  <th>Bookmaker</th>
                  <th>Home</th>
                  <th>Away</th>
                  ${game.odds.some(o => o.draw_odds) ? '<th>Draw</th>' : ''}
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                ${filteredOdds.map(odds => this.renderOddsRow(odds, game.odds.some(o => o.draw_odds))).join('')}
              </tbody>
            </table>
          ` : '<p style="padding: 1rem; color: #6b7280; font-style: italic;">No odds data available</p>'}
        </div>
      </div>
    `;
  }

  getFilteredOdds(gameOdds) {
    // If a specific bookmaker is selected, show only that bookmaker's odds
    if (this.filters.bookmaker !== 'all') {
      return gameOdds.filter(odds => odds.sportsbook === this.filters.bookmaker);
    }
    // Otherwise show all odds
    return gameOdds;
  }

  renderOddsRow(odds, hasDraw) {
    return `
      <tr>
        <td class="sportsbook-cell">${odds.sportsbook}</td>
        <td class="odds-cell ${this.getOddsClass(odds.home_odds)}">${this.formatOdds(odds.home_odds)}</td>
        <td class="odds-cell ${this.getOddsClass(odds.away_odds)}">${this.formatOdds(odds.away_odds)}</td>
        ${hasDraw ? `<td class="odds-cell ${this.getOddsClass(odds.draw_odds)}">${this.formatOdds(odds.draw_odds)}</td>` : ''}
        <td>${odds.created_at ? new Date(odds.created_at).toLocaleString() : 'N/A'}</td>
      </tr>
    `;
  }

  formatOdds(odds) {
    if (!odds || odds === null) return 'N/A';
    if (odds === -11011) return 'Suspended';
    
    if (typeof odds !== 'number') return odds.toString();
    
    const format = this.filters.oddsFormat;
    const american = odds > 0 ? `+${odds}` : `${odds}`;
    
    switch (format) {
      case 'american':
        return american;
      case 'percentage':
        return this.americanToPercentage(odds) + '%';
      case 'both':
        return `${this.americanToPercentage(odds)}% / ${american}`;
      default:
        return american;
    }
  }

  americanToPercentage(americanOdds) {
    if (americanOdds > 0) {
      // Positive odds: percentage = 100 / (odds + 100) * 100
      return (100 / (americanOdds + 100) * 100).toFixed(1);
    } else {
      // Negative odds: percentage = (-odds) / (-odds + 100) * 100
      return ((-americanOdds) / (-americanOdds + 100) * 100).toFixed(1);
    }
  }

  getOddsClass(odds) {
    if (!odds || odds === null || odds === -11011) return '';
    return odds > 0 ? 'positive-odds' : 'negative-odds';
  }

  updatePagination() {
    const paginationEl = document.getElementById('pagination');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');

    if (this.pagination.totalPages <= 1) {
      paginationEl.style.display = 'none';
      return;
    }

    paginationEl.style.display = 'flex';
    prevBtn.disabled = this.pagination.currentPage === 1;
    nextBtn.disabled = this.pagination.currentPage === this.pagination.totalPages;
    pageInfo.textContent = `Page ${this.pagination.currentPage} of ${this.pagination.totalPages}`;
  }

  // Convert freshness filter value to hours
  getFreshnessHours(freshness) {
    const mapping = {
      'all': null,        // No time limit - will default to 24 hours in backend
      '1hour': 1,
      '6hours': 6, 
      '12hours': 12,
      '24hours': 24,
      '48hours': 48,
      '7days': 168        // 7 * 24 = 168 hours
    };
    return mapping[freshness] || 24; // Default to 24 hours
  }

  toggleGameExpansion(gameCardId) {
    const content = document.getElementById(`content-${gameCardId}`);
    const icon = document.getElementById(`icon-${gameCardId}`);
    
    if (content && icon) {
      if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        icon.textContent = '▼';
      } else {
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        icon.textContent = '▶';
      }
    }
  }

  showError(message) {
    console.error('Sportsbook error:', message);
    const container = document.getElementById('games-container');
    container.innerHTML = `
      <div style="text-align: center; color: #ef4444; padding: 2rem;">
        <h3>Error Loading Data</h3>
        <p>${message}</p>
        <p style="margin-top: 1rem; color: #6b7280; font-size: 14px;">
          This might mean there are no recent games (within the selected time period) 
          or there's a connection issue with the database.
        </p>
        <button id="refresh-error-btn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
          Refresh Page
        </button>
      </div>
    `;
    
    // Add event listener for refresh button
    setTimeout(() => {
      const refreshBtn = document.getElementById('refresh-error-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => location.reload());
      }
    }, 100);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.sportsbookController = new SportsbookController();
});