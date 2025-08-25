// Analytics page JavaScript
class AnalyticsController {
  constructor() {
    this.data = {
      games: [],
      odds: [],
      evOpportunities: [],
      arbOpportunities: []
    };
    this.processingTimeout = null;
    this.isProcessing = false;
    this.filters = {
      sport: 'all',
      minEv: 0,
      minProfit: 0,
      maxStake: 1000,
      evBookmakers: ['all'],
      arbBookmakers: ['all'],
      oddsFormat: 'american',
      dataFreshness: 1 // Default to 1 hour
    };
    this.flaggedOpportunities = [];
    this.refreshHistory = {
      ev: [],
      arbitrage: [],
      overall: []
    };
    this.lastRefresh = {
      ev: null,
      arbitrage: null
    };
    this.ingestionData = {
      history: [],
      lastIngestion: null,
      activeTabs: []
    };
    this.lastUpdated = null;
    
    this.init();
  }

  async init() {
    // Set up event listeners
    this.setupEventListeners();
    
    // Load initial data
    await this.refreshData();
    
    // Auto-refresh every 30 seconds
    setInterval(async () => await this.refreshData(), 30000);
  }

  setupEventListeners() {
    // Data freshness filter - this triggers data refresh
    document.getElementById('data-freshness').addEventListener('change', async (e) => {
      this.filters.dataFreshness = parseFloat(e.target.value);
      console.log('Data freshness changed to:', this.filters.dataFreshness, 'hours');
      await this.refreshData(); // Refresh data with new time filter
    });

    // Filter changes - these just re-render existing data
    document.getElementById('sport-filter').addEventListener('change', (e) => {
      this.filters.sport = e.target.value;
      this.renderTables();
    });

    document.getElementById('min-ev').addEventListener('change', (e) => {
      this.filters.minEv = parseFloat(e.target.value);
      this.renderTables();
    });

    document.getElementById('min-profit').addEventListener('change', (e) => {
      this.filters.minProfit = parseFloat(e.target.value);
      this.renderTables();
    });

    document.getElementById('max-stake').addEventListener('change', (e) => {
      this.filters.maxStake = parseFloat(e.target.value);
      this.renderTables();
    });

    // Bookmaker filters
    document.getElementById('ev-bookmakers').addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      if (selected.includes('all')) {
        this.filters.evBookmakers = ['all'];
        // Clear other selections if 'all' is selected
        Array.from(e.target.options).forEach(opt => {
          opt.selected = opt.value === 'all';
        });
      } else {
        this.filters.evBookmakers = selected;
      }
      this.renderTables();
    });

    document.getElementById('arb-bookmakers').addEventListener('change', (e) => {
      const selected = Array.from(e.target.selectedOptions).map(opt => opt.value);
      if (selected.includes('all')) {
        this.filters.arbBookmakers = ['all'];
        // Clear other selections if 'all' is selected
        Array.from(e.target.options).forEach(opt => {
          opt.selected = opt.value === 'all';
        });
      } else {
        this.filters.arbBookmakers = selected;
      }
      this.renderTables();
    });

    // Odds format filter
    document.getElementById('odds-format').addEventListener('change', (e) => {
      this.filters.oddsFormat = e.target.value;
      this.renderTables();
    });

    // Refresh buttons
    document.querySelectorAll('#refresh-btn, #live-refresh-btn, #arb-refresh-btn, #stats-refresh-btn').forEach(btn => {
      btn.addEventListener('click', async () => await this.refreshData());
    });

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchTab(e, tab.dataset.tab));
    });
  }

  async refreshData() {
    try {
      // Show loading state
      document.querySelectorAll('.loading-spinner').forEach(el => el.style.display = 'block');
      document.querySelectorAll('tbody').forEach(tbody => {
        tbody.innerHTML = '<tr><td colspan="10" class="loading"><div class="loading-spinner"></div>Loading data...</td></tr>';
      });
      
      // Check if database is connected first
      const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      
      if (!statusResponse || !statusResponse.initialized) {
        this.showError('Database connecting... Please wait');
        setTimeout(async () => await this.refreshData(), 3000);
        return;
      }
      
      // Get data from extension background script with freshness filter
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_ANALYTICS_DATA',
        hoursBack: this.filters.dataFreshness
      });
      
      if (response && response.success) {
        this.data = response.data;
        this.ingestionData = response.data.ingestionData || this.ingestionData;
        this.lastUpdated = new Date();
        
        // Reset flagged opportunities for this refresh
        this.flaggedOpportunities = [];
        
        // Validate data size before processing
        if (this.data.games.length > 100) {
          this.showError(`Too many games (${this.data.games.length}) - this suggests duplicate data. Please check your time filter.`);
          return;
        }
        
        if (this.data.odds.length > 5000) {
          this.showError(`Too many odds records (${this.data.odds.length}) - limiting to latest 5000 to prevent freezing.`);
          // Keep only the most recent 5000 odds
          this.data.odds = this.data.odds
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5000);
        }
        
        // Show processing status
        document.querySelectorAll('tbody').forEach(tbody => {
          tbody.innerHTML = '<tr><td colspan="10" class="loading">Processing ' + this.data.games.length + ' games...</td></tr>';
        });
        
        // Calculate opportunities with timeout
        const calculationTimeout = setTimeout(() => {
          this.showError('Calculation taking too long - stopping to prevent freeze');
        }, 30000); // 30 second timeout
        
        try {
          await this.calculateOpportunities();
          clearTimeout(calculationTimeout);
        } catch (error) {
          clearTimeout(calculationTimeout);
          throw error;
        }
        
        // Store flagged opportunities
        if (this.flaggedOpportunities.length > 0) {
          await this.storeFlaggedOpportunities();
        }
        
        // Track refresh times
        this.trackRefresh();
        
        // Update UI
        this.updateStats();
        this.updateBookmakerFilters();
        this.renderTables();
        this.updateLastUpdated();
      } else {
        console.error('Failed to get analytics data:', response?.error);
        this.showError(response?.error || 'Failed to load data');
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      if (error.message.includes('timeout')) {
        this.showError('Processing timeout - please try reducing your time range or refresh the page');
      } else {
        this.showError('Connection error: ' + error.message);
      }
    } finally {
      // Always hide loading spinners
      document.querySelectorAll('.loading-spinner').forEach(el => el.style.display = 'none');
    }
  }

  async calculateOpportunities() {
    if (this.isProcessing) {
      console.warn('Already processing opportunities - skipping');
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Set a global timeout for the entire calculation
      const timeoutPromise = new Promise((_, reject) => {
        this.processingTimeout = setTimeout(() => {
          reject(new Error('Calculation timeout - taking too long'));
        }, 60000); // 60 second total timeout
      });
      
      const calculationPromise = (async () => {
        this.data.evOpportunities = await this.calculateEVOpportunities();
        this.data.arbOpportunities = await this.calculateArbitrageOpportunities();
      })();
      
      await Promise.race([calculationPromise, timeoutPromise]);
      
      if (this.processingTimeout) {
        clearTimeout(this.processingTimeout);
        this.processingTimeout = null;
      }
    } catch (error) {
      if (this.processingTimeout) {
        clearTimeout(this.processingTimeout);
        this.processingTimeout = null;
      }
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  trackRefresh() {
    const now = new Date();
    
    // Track overall refresh
    this.refreshHistory.overall.push(now);
    
    // Track EV and arbitrage separately if they have results
    if (this.data.evOpportunities.length >= 0) {
      this.refreshHistory.ev.push(now);
      this.lastRefresh.ev = now;
    }
    
    if (this.data.arbOpportunities.length >= 0) {
      this.refreshHistory.arbitrage.push(now);
      this.lastRefresh.arbitrage = now;
    }
    
    // Keep only last hour of refresh history
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    this.refreshHistory.overall = this.refreshHistory.overall.filter(time => time > oneHourAgo);
    this.refreshHistory.ev = this.refreshHistory.ev.filter(time => time > oneHourAgo);
    this.refreshHistory.arbitrage = this.refreshHistory.arbitrage.filter(time => time > oneHourAgo);
  }

  getRefreshRate() {
    if (this.refreshHistory.overall.length < 2) return 0;
    
    const refreshes = this.refreshHistory.overall;
    const timeSpan = (refreshes[refreshes.length - 1] - refreshes[0]) / 1000; // in seconds
    const rate = (refreshes.length - 1) / timeSpan * 60; // refreshes per minute
    
    return Math.round(rate * 100) / 100; // round to 2 decimal places
  }

  getIngestionRate() {
    if (this.ingestionData.history.length < 2) return 0;
    
    // Filter to only last 5 minutes
    const now = new Date();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const recentIngestions = this.ingestionData.history
      .filter(h => new Date(h.timestamp) > fiveMinutesAgo)
      .map(h => new Date(h.timestamp));
    
    if (recentIngestions.length < 2) return 0;
    
    const timeSpan = (recentIngestions[recentIngestions.length - 1] - recentIngestions[0]) / 1000; // in seconds
    const rate = (recentIngestions.length - 1) / timeSpan * 60; // ingestions per minute
    
    return Math.round(rate * 100) / 100; // round to 2 decimal places
  }

  formatTimeAgo(date) {
    if (!date) return 'Never';
    
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${diffHours}h ${diffMins % 60}m ago`;
  }

  showError(message) {
    console.error('Analytics error:', message);
    
    // Show error in all table bodies
    document.querySelectorAll('tbody').forEach(tbody => {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; color: #ef4444; padding: 2rem;">
            <h3>Error Loading Data</h3>
            <p>${message}</p>
            <button onclick="window.analyticsController.refreshData()" 
                    style="margin-top: 1rem; padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Try Again
            </button>
          </td>
        </tr>
      `;
    });
    
    // Also show in stats cards
    document.getElementById('total-games').textContent = '-';
    document.getElementById('ev-opportunities').textContent = '-';
    document.getElementById('arb-opportunities').textContent = '-';
    document.getElementById('games-change').textContent = message;
  }

  formatGameDate(gameTime) {
    if (!gameTime) return 'TBD';
    
    const date = new Date(gameTime);
    
    // Check if date is invalid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 24*60*60*1000).toDateString();
    
    if (isToday) {
      return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else if (isTomorrow) {
      return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: 'numeric', 
        minute: '2-digit'
      });
    }
  }

  updateBookmakerFilters() {
    // Get all unique bookmakers from odds data
    const allBookmakers = [...new Set(this.data.odds.map(o => o.sportsbook))].sort();
    
    // Update EV bookmaker filter
    const evSelect = document.getElementById('ev-bookmakers');
    const currentEvSelection = this.filters.evBookmakers;
    evSelect.innerHTML = '<option value="all">All Bookmakers</option>' + 
      allBookmakers.map(bm => `<option value="${bm}">${bm}</option>`).join('');
    
    // Restore selection
    Array.from(evSelect.options).forEach(opt => {
      opt.selected = currentEvSelection.includes(opt.value);
    });
    
    // Update Arbitrage bookmaker filter  
    const arbSelect = document.getElementById('arb-bookmakers');
    const currentArbSelection = this.filters.arbBookmakers;
    arbSelect.innerHTML = '<option value="all">All Bookmakers</option>' + 
      allBookmakers.map(bm => `<option value="${bm}">${bm}</option>`).join('');
    
    // Restore selection
    Array.from(arbSelect.options).forEach(opt => {
      opt.selected = currentArbSelection.includes(opt.value);
    });
  }

  async calculateEVOpportunities() {
    const opportunities = [];
    
    // Process games in batches to avoid UI freezing
    let processedCount = 0;
    
    for (const game of this.data.games) {
      const gameOdds = this.data.odds.filter(o => o.game_id === game.game_id);
      
      if (gameOdds.length < 3) continue; // Need at least 3 books for meaningful comparison
      
      // Filter out stale odds (older than 30 minutes)
      const now = new Date();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
      const recentOdds = gameOdds.filter(o => {
        const oddsTime = new Date(o.timestamp);
        return oddsTime > thirtyMinutesAgo;
      });
      
      if (recentOdds.length < 3) continue; // Need at least 3 recent books
      
      // Separate live vs pre-game odds and fix data quality issues
      const { liveOdds, preGameOdds, cleanOdds } = await this.categorizeAndCleanOdds(recentOdds);
      
      if (cleanOdds.length < 3) continue; // Need at least 3 clean books after data quality filtering
      
      processedCount++;
      
      // Use clean odds for calculations (will include both live and pre-game)
      const gameOddsFiltered = cleanOdds;
      
      // Check if this is a 3-way market (soccer) by looking for draw odds
      // Use multiple detection methods since sport classification can be unreliable
      const hasSoccerTeamNames = (game.home_team?.includes('FC') || game.home_team?.includes('EC') || 
                                 game.away_team?.includes('FC') || game.away_team?.includes('EC') ||
                                 game.home_team?.includes('CF') || game.away_team?.includes('CF') ||
                                 game.home_team?.includes('Club') || game.away_team?.includes('Club'));
      const hasDrawOdds = gameOddsFiltered.some(o => o.draw_odds !== null && o.draw_odds !== undefined);
      const isSoccerSport = game.sport === 'SOCCER';
      
      const isThreeWayMarket = isSoccerSport || hasDrawOdds || hasSoccerTeamNames;
      
      // Get all valid odds for 2-way and 3-way markets
      const homeOddsRaw = gameOddsFiltered.map(o => ({ sportsbook: o.sportsbook, odds: o.home_odds })).filter(o => o.odds);
      const awayOddsRaw = gameOddsFiltered.map(o => ({ sportsbook: o.sportsbook, odds: o.away_odds })).filter(o => o.odds);
      const drawOddsRaw = isThreeWayMarket ? 
        gameOddsFiltered.map(o => ({ sportsbook: o.sportsbook, odds: o.draw_odds })).filter(o => o.odds) : 
        [];
      
      if (homeOddsRaw.length === 0 || awayOddsRaw.length === 0) continue;
      
      // Filter outliers using IQR method to improve EV calculation accuracy
      const homeOddsFiltered = this.filterOutlierOdds(homeOddsRaw, 'home');
      const awayOddsFiltered = this.filterOutlierOdds(awayOddsRaw, 'away');
      const drawOddsFiltered = isThreeWayMarket ? this.filterOutlierOdds(drawOddsRaw, 'draw') : [];
      
      // Use filtered odds for more accurate calculations
      const homeOdds = homeOddsFiltered;
      const awayOdds = awayOddsFiltered;
      const drawOdds = drawOddsFiltered;
      
      if (homeOdds.length === 0 || awayOdds.length === 0) {
        // Silently skip games where all odds are outliers
        continue;
      }
      
      // Calculate fair value using configurable fairline method for 2-way or 3-way markets
      const fairlineResult = isThreeWayMarket ? 
        await this.calculateFairline3Way(homeOdds, awayOdds, drawOdds) :
        await this.calculateFairline(homeOdds, awayOdds);
      
      if (!fairlineResult) {
        console.log(`${game.away_team} @ ${game.home_team}: No reliable fairline available, skipping`);
        continue;
      }
      
      const { homeOdds: fairHomeOdds, awayOdds: fairAwayOdds, drawOdds: fairDrawOdds, method: fairlineMethod } = fairlineResult;
      console.log(`Using fairline method: ${fairlineMethod} ${isThreeWayMarket ? '(3-way)' : '(2-way)'}`);
      
      // Convert fair odds to probabilities
      const fairHomeProbRaw = this.oddsToImpliedProbability(fairHomeOdds);
      const fairAwayProbRaw = this.oddsToImpliedProbability(fairAwayOdds);
      const fairDrawProbRaw = isThreeWayMarket ? this.oddsToImpliedProbability(fairDrawOdds) : 0;
      
      // Normalize probabilities to remove vig (they should sum to 1)
      const totalProb = fairHomeProbRaw + fairAwayProbRaw + fairDrawProbRaw;
      const fairHomeProb = fairHomeProbRaw / totalProb;
      const fairAwayProb = fairAwayProbRaw / totalProb;
      const fairDrawProb = isThreeWayMarket ? fairDrawProbRaw / totalProb : 0;
      
      console.log(`Fair home prob (normalized): ${(fairHomeProb*100).toFixed(3)}%`);
      console.log(`Fair away prob (normalized): ${(fairAwayProb*100).toFixed(3)}%`);
      if (isThreeWayMarket) {
        console.log(`Fair draw prob (normalized): ${(fairDrawProb*100).toFixed(3)}%`);
        console.log(`Normalization check: ${((fairHomeProb + fairAwayProb + fairDrawProb)*100).toFixed(3)}% (should be ~100%)`);
      } else {
        console.log(`Normalization check: ${((fairHomeProb + fairAwayProb)*100).toFixed(3)}% (should be ~100%)`);
      }
      
      // Check for suspicious probability calculations (adjust thresholds for 3-way markets)
      const minProb = isThreeWayMarket ? 0.05 : 0.1; // Lower threshold for 3-way markets
      const maxProb = isThreeWayMarket ? 0.8 : 0.9;  // Lower max for 3-way markets
      
      if (fairHomeProb < minProb || fairHomeProb > maxProb) {
        console.warn(`🚨 SUSPICIOUS FAIR PROBABILITY: Home ${(fairHomeProb*100).toFixed(1)}% seems extreme for ${isThreeWayMarket ? '3-way' : '2-way'} market`);
      }
      if (fairAwayProb < minProb || fairAwayProb > maxProb) {
        console.warn(`🚨 SUSPICIOUS FAIR PROBABILITY: Away ${(fairAwayProb*100).toFixed(1)}% seems extreme for ${isThreeWayMarket ? '3-way' : '2-way'} market`);
      }
      if (isThreeWayMarket && (fairDrawProb < minProb || fairDrawProb > maxProb)) {
        console.warn(`🚨 SUSPICIOUS FAIR PROBABILITY: Draw ${(fairDrawProb*100).toFixed(1)}% seems extreme for 3-way market`);
      }
      
      // Additional data quality checks
      if (fairHomeOdds === fairAwayOdds) {
        console.warn(`🚨 DATA QUALITY ISSUE: Fair home and away odds are identical (${fairHomeOdds})`);
      }
      
      // Check for extreme odds that might indicate different markets
      const extremeThreshold = 1000; // Odds greater than +1000 or less than -1000
      const hasExtremeOdds = Math.abs(fairHomeOdds) > extremeThreshold || Math.abs(fairAwayOdds) > extremeThreshold;
      if (hasExtremeOdds) {
        console.warn(`🚨 EXTREME ODDS DETECTED: Home ${fairHomeOdds}, Away ${fairAwayOdds} - Possible different market`);
        continue; // Skip games with extreme odds as they likely represent different markets
      }
      
      // Create filtered game odds by combining filtered home and away odds
      const finalFilteredOdds = gameOddsFiltered.filter(bookOdds => {
        const homeIncluded = !bookOdds.home_odds || homeOdds.some(h => h.sportsbook === bookOdds.sportsbook && h.odds === bookOdds.home_odds);
        const awayIncluded = !bookOdds.away_odds || awayOdds.some(a => a.sportsbook === bookOdds.sportsbook && a.odds === bookOdds.away_odds);
        return homeIncluded && awayIncluded;
      });
      
      // Only log if outliers were filtered
      if (gameOddsFiltered.length - finalFilteredOdds.length > 0) {
        console.log(`${game.away_team} @ ${game.home_team}: Filtered ${gameOddsFiltered.length - finalFilteredOdds.length} outliers`);
      }
      
      // Calculate best odds for debugging
      const bestHomeOdds = Math.max(...homeOdds.map(o => o.odds));
      const bestAwayOdds = Math.max(...awayOdds.map(o => o.odds));
      
      // Find +EV bets by comparing each book's odds to fair probabilities
      finalFilteredOdds.forEach(bookOdds => {
        if (bookOdds.home_odds) {
          const impliedProb = this.getImpliedProbability(bookOdds, 'home') || 
                             this.oddsToImpliedProbability(bookOdds.home_odds);
          const decimalOdds = this.americanToDecimal(bookOdds.home_odds);
          const ev = ((fairHomeProb * decimalOdds) - 1) * 100;
          
          // DEBUG: Detailed EV calculation breakdown
          console.log(`\n--- ${bookOdds.sportsbook} ${game.home_team} EV Calculation ---`);
          console.log(`Book odds: ${bookOdds.home_odds}`);
          console.log(`Book implied prob: ${(impliedProb*100).toFixed(3)}%`);
          console.log(`Book decimal odds: ${decimalOdds.toFixed(4)}`);
          console.log(`Fair probability: ${(fairHomeProb*100).toFixed(3)}%`);
          console.log(`EV formula: ((${fairHomeProb.toFixed(4)} × ${decimalOdds.toFixed(4)}) - 1) × 100`);
          console.log(`EV calculation: ((${(fairHomeProb * decimalOdds).toFixed(4)}) - 1) × 100 = ${ev.toFixed(2)}%`);
          
          // Validation checks
          if (Math.abs(ev) > 100) {
            console.error(`🚨 EXTREME EV DETECTED: ${ev.toFixed(1)}% - This indicates a calculation error!`);
          }
          if (ev > 25) {
            console.warn(`🚨 HIGH EV WARNING: ${ev.toFixed(1)}% for ${bookOdds.sportsbook}`);
            console.warn(`  This suggests either: 1) Data error, 2) Different market, 3) Calculation bug`);
          }
          
          // Only log if EV is significant (positive or very negative)
          if (ev > 5 || ev < -20) {
            console.log(`${bookOdds.sportsbook} ${game.home_team}: ${bookOdds.home_odds} -> EV: ${ev.toFixed(1)}%`);
          }
          
          // Enhanced debugging for suspicious EV
          if (ev > 15) {
            console.warn(`🚨 SUSPICIOUS HIGH +EV: ${ev.toFixed(1)}% for ${bookOdds.sportsbook} on ${game.home_team}`);
            console.warn(`  Book odds: ${bookOdds.home_odds} (decimal: ${decimalOdds})`);
            console.warn(`  Fair prob: ${(fairHomeProb*100).toFixed(3)}%, Implied prob: ${(impliedProb*100).toFixed(3)}%`);
            console.warn(`  Best home: ${bestHomeOdds}, Best away: ${bestAwayOdds}`);
            console.warn(`  All home odds: ${homeOdds.map(o => `${o.sportsbook}: ${o.odds}`).join(', ')}`);
          }
          
          // Validation: Reject impossible EV percentages  
          if (ev > 50) {
            console.error(`🚨 REJECTING IMPOSSIBLE EV: ${ev.toFixed(1)}% for ${bookOdds.sportsbook} on ${game.home_team} - likely data error`);
            console.error(`  Game: ${game.away_team} @ ${game.home_team} (sport: ${game.sport})`);
            
            // Track this flagged opportunity
            this.flaggedOpportunities.push({
              type: 'ev',
              flagType: 'rejected',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              bet: game.home_team,
              sportsbook: bookOdds.sportsbook,
              issue: 'Impossible EV',
              reason: `Calculated EV of ${ev.toFixed(1)}% exceeds maximum threshold of 50%`,
              calculatedValue: ev,
              timestamp: new Date().toISOString()
            });
            
            return;
          }
          
          // Flag suspicious high EV for review
          if (ev > 15) {
            this.flaggedOpportunities.push({
              type: 'ev',
              flagType: 'suspicious',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              bet: game.home_team,
              sportsbook: bookOdds.sportsbook,
              issue: 'High EV',
              reason: `Unusually high EV of ${ev.toFixed(1)}% requires investigation`,
              calculatedValue: ev,
              timestamp: new Date().toISOString()
            });
          }
          
          // Store meaningful EV opportunities (threshold: 1%)
          if (ev > 1.0) {
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              gameTime: game.game_time,
              bet: `${game.home_team} ML`,
              sportsbook: bookOdds.sportsbook,
              odds: bookOdds.home_odds,
              impliedProb: impliedProb,
              fairProb: fairHomeProb,
              ev: ev,
              kelly: this.calculateKelly(fairHomeProb, bookOdds.home_odds),
              isLive: bookOdds.isLive || false
            });
          }
        }
        
        if (bookOdds.away_odds) {
          const impliedProb = this.getImpliedProbability(bookOdds, 'away') || 
                             this.oddsToImpliedProbability(bookOdds.away_odds);
          const decimalOdds = this.americanToDecimal(bookOdds.away_odds);
          const ev = ((fairAwayProb * decimalOdds) - 1) * 100;
          
          // Skip excessive logging
            console.warn(`  Best home: ${bestHomeOdds}, Best away: ${bestAwayOdds}`);
            console.warn(`  All away odds: ${awayOdds.map(o => `${o.sportsbook}: ${o.odds}`).join(', ')}`);
          }
          
          // Validation: Reject impossible EV percentages
          if (ev > 50) {
            console.error(`🚨 REJECTING IMPOSSIBLE EV: ${ev.toFixed(1)}% for ${bookOdds.sportsbook} on ${game.away_team} - likely data error`);
            console.error(`  Game: ${game.away_team} @ ${game.home_team} (sport: ${game.sport})`);
            return; // Skip this bet due to data quality issues
          }
          
          // Store meaningful EV opportunities (threshold: 1%)
          if (ev > 1.0) {
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              gameTime: game.game_time,
              bet: `${game.away_team} ML`,
              sportsbook: bookOdds.sportsbook,
              odds: bookOdds.away_odds,
              impliedProb: impliedProb,
              fairProb: fairAwayProb,
              ev: ev,
              kelly: this.calculateKelly(fairAwayProb, bookOdds.away_odds),
              isLive: bookOdds.isLive || false
            });
          }
        }
        
        // Process draw odds for 3-way markets
        if (isThreeWayMarket && bookOdds.draw_odds) {
          const impliedProb = this.getImpliedProbability(bookOdds, 'draw') || 
                             this.oddsToImpliedProbability(bookOdds.draw_odds);
          const decimalOdds = this.americanToDecimal(bookOdds.draw_odds);
          const ev = ((fairDrawProb * decimalOdds) - 1) * 100;
          
          // Only log if EV is significant (positive or very negative)
          if (ev > 5 || ev < -20) {
            console.log(`${bookOdds.sportsbook} Draw: ${bookOdds.draw_odds} -> EV: ${ev.toFixed(1)}%`);
          }
          
          // Enhanced debugging for suspicious EV
          // Skip impossible EV percentages
          if (ev > 50) {
            return;
          }
          
          // Store meaningful EV opportunities (threshold: 1%)
          if (ev > 1.0) {
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              gameTime: game.game_time,
              bet: `Draw`,
              sportsbook: bookOdds.sportsbook,
              odds: bookOdds.draw_odds,
              impliedProb: impliedProb,
              fairProb: fairDrawProb,
              ev: ev,
              kelly: this.calculateKelly(fairDrawProb, bookOdds.draw_odds),
              isLive: bookOdds.isLive || false
            });
          }
        }
      });
    }
    
    // Return opportunities sorted by EV
    
    return opportunities.sort((a, b) => b.ev - a.ev);
  }

  async calculateArbitrageOpportunities() {
    const opportunities = [];
    
    for (const game of this.data.games) {
      const gameOdds = this.data.odds.filter(o => o.game_id === game.game_id);
      
      if (gameOdds.length < 2) continue;
      
      // Filter out stale odds (older than 30 minutes)
      const now = new Date();
      const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000);
      const recentOdds = gameOdds.filter(o => {
        const oddsTime = new Date(o.timestamp);
        return oddsTime > thirtyMinutesAgo;
      });
      
      if (recentOdds.length < 2) continue; // Need at least 2 recent books
      
      // Separate live vs pre-game odds and fix data quality issues
      const { liveOdds, preGameOdds, cleanOdds } = await this.categorizeAndCleanOdds(recentOdds);
      
      if (cleanOdds.length < 2) continue; // Need at least 2 clean books
      
      // Check if this is a 3-way market (soccer)
      // Use multiple detection methods since sport classification can be unreliable
      const hasSoccerTeamNames = (game.home_team?.includes('FC') || game.home_team?.includes('EC') || 
                                 game.away_team?.includes('FC') || game.away_team?.includes('EC') ||
                                 game.home_team?.includes('CF') || game.away_team?.includes('CF') ||
                                 game.home_team?.includes('Club') || game.away_team?.includes('Club'));
      const hasDrawOdds = cleanOdds.some(o => o.draw_odds !== null && o.draw_odds !== undefined);
      const isSoccerSport = game.sport === 'SOCCER';
      
      const isThreeWayMarket = isSoccerSport || hasDrawOdds || hasSoccerTeamNames;
      
      if (isThreeWayMarket) {
        // Handle 3-way arbitrage calculation
        const threeWayOpportunities = this.calculate3WayArbitrage(game, cleanOdds);
        opportunities.push(...threeWayOpportunities);
        continue;
      }
      
      // Find best odds for each side (2-way markets)
      let bestHome = null;
      let bestAway = null;
      
      cleanOdds.forEach(odds => {
        if (odds.home_odds) {
          if (!bestHome || this.americanToDecimal(odds.home_odds) > this.americanToDecimal(bestHome.odds)) {
            bestHome = { 
              sportsbook: odds.sportsbook, 
              odds: odds.home_odds, 
              team: game.home_team 
            };
          }
        }
        
        if (odds.away_odds) {
          if (!bestAway || this.americanToDecimal(odds.away_odds) > this.americanToDecimal(bestAway.odds)) {
            bestAway = { 
              sportsbook: odds.sportsbook, 
              odds: odds.away_odds, 
              team: game.away_team 
            };
          }
        }
      });
      
      if (bestHome && bestAway && bestHome.sportsbook !== bestAway.sportsbook) {
        // Calculate arbitrage profit using stored percentages for better accuracy
        const bestHomeData = cleanOdds.find(o => o.sportsbook === bestHome.sportsbook);
        const bestAwayData = cleanOdds.find(o => o.sportsbook === bestAway.sportsbook);
        
        const homeStoredProb = this.getImpliedProbability(bestHomeData, 'home');
        const awayStoredProb = this.getImpliedProbability(bestAwayData, 'away');
        
        const homeImplied = homeStoredProb || this.oddsToImpliedProbability(bestHome.odds);
        const awayImplied = awayStoredProb || this.oddsToImpliedProbability(bestAway.odds);
        const totalImplied = homeImplied + awayImplied;
        
        // Track if we used stored percentages
        const usedStoredPercentages = {
          home: !!homeStoredProb,
          away: !!awayStoredProb
        };
        const calculationMethod = (homeStoredProb && awayStoredProb) ? 'stored-percentages' : 
                                 (homeStoredProb || awayStoredProb) ? 'mixed' : 'market-based';
        
        if (totalImplied < 1) { // Arbitrage opportunity exists
          const profit = ((1 / totalImplied) - 1) * 100;
          
          // Flag extreme arbitrage for investigation
          if (profit > 10) {
            this.flaggedOpportunities.push({
              type: 'arb',
              flagType: 'extreme',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              issue: 'Extreme 2-way Arbitrage',
              reason: `2-way arbitrage profit of ${profit.toFixed(1)}% is extremely high and requires investigation`,
              calculatedValue: profit,
              timestamp: new Date().toISOString()
              }
            });
          } else if (profit > 5) {
            console.warn(`SUSPICIOUS HIGH ARBITRAGE: ${profit.toFixed(2)}% for ${game.away_team} @ ${game.home_team}`);
            
            // Flag suspicious arbitrage for review
            this.flaggedOpportunities.push({
              type: 'arb',
              flagType: 'suspicious',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              issue: 'High 2-way Arbitrage',
              reason: `2-way arbitrage profit of ${profit.toFixed(1)}% is unusually high for reputable books`,
              calculatedValue: profit,
              timestamp: new Date().toISOString(),
              calculationMethod: calculationMethod,
              usedStoredPercentages: usedStoredPercentages,
              detailedData: {
                homeTeam: game.home_team,
                awayTeam: game.away_team,
                sideA: {
                  bet: bestHome.team,
                  sportsbook: bestHome.sportsbook,
                  odds: bestHome.odds,
                  decimal: this.americanToDecimal(bestHome.odds),
                  impliedProb: homeImplied,
                  storedImpliedProb: homeStoredProb || null,
                  calculatedImpliedProb: this.oddsToImpliedProbability(bestHome.odds)
                },
                sideB: {
                  bet: bestAway.team,
                  sportsbook: bestAway.sportsbook,
                  odds: bestAway.odds,
                  decimal: this.americanToDecimal(bestAway.odds),
                  impliedProb: awayImplied,
                  storedImpliedProb: awayStoredProb || null,
                  calculatedImpliedProb: this.oddsToImpliedProbability(bestAway.odds)
                },
                totalImpliedProb: totalImplied,
                profitPercent: profit,
                totalStake: 1000,
                stakeA: 1000 * (homeImplied / totalImplied),
                stakeB: 1000 * (awayImplied / totalImplied),
                returnA: (1000 * (homeImplied / totalImplied)) * this.americanToDecimal(bestHome.odds),
                returnB: (1000 * (awayImplied / totalImplied)) * this.americanToDecimal(bestAway.odds),
                guaranteedProfit: 1000 * (profit / 100)
              }
            });
          }
          
          if (profit > 0.1 && profit <= 20) { // Only show if profit between 0.1% and 20% to filter calculation errors
            const totalStake = 1000; // Assume $1000 total stake
            const homeStake = totalStake * (homeImplied / totalImplied);
            const awayStake = totalStake * (awayImplied / totalImplied);
            
            // Get all bookmakers involved in this game
            const allGameBookmakers = [...new Set(cleanOdds.map(o => o.sportsbook))].sort();
            
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              gameTime: game.game_time,
              allBookmakers: allGameBookmakers,
              calculationMethod: calculationMethod,
              usedStoredPercentages: usedStoredPercentages,
              sideA: {
                team: bestHome.team,
                sportsbook: bestHome.sportsbook,
                odds: bestHome.odds,
                stake: homeStake,
                impliedProb: homeImplied,
                storedImpliedProb: homeStoredProb || null
              },
              sideB: {
                team: bestAway.team,
                sportsbook: bestAway.sportsbook,
                odds: bestAway.odds,
                stake: awayStake,
                impliedProb: awayImplied,
                storedImpliedProb: awayStoredProb || null
              },
              profit: profit,
              expectedProfit: totalStake * (profit / 100)
            });
          }
        }
      }
      
      // Yield control to UI between batches  
      if (i + batchSize < gamesToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return opportunities.sort((a, b) => b.profit - a.profit);
  }

  calculate3WayArbitrage(game, cleanOdds) {
    const opportunities = [];
    
    // Find best odds for each side in 3-way markets
    let bestHome = null;
    let bestAway = null;
    let bestDraw = null;
    
    cleanOdds.forEach(odds => {
      if (odds.home_odds) {
        if (!bestHome || this.americanToDecimal(odds.home_odds) > this.americanToDecimal(bestHome.odds)) {
          bestHome = { 
            sportsbook: odds.sportsbook, 
            odds: odds.home_odds, 
            team: game.home_team 
          };
        }
      }
      
      if (odds.away_odds) {
        if (!bestAway || this.americanToDecimal(odds.away_odds) > this.americanToDecimal(bestAway.odds)) {
          bestAway = { 
            sportsbook: odds.sportsbook, 
            odds: odds.away_odds, 
            team: game.away_team 
          };
        }
      }
      
      if (odds.draw_odds) {
        if (!bestDraw || this.americanToDecimal(odds.draw_odds) > this.americanToDecimal(bestDraw.odds)) {
          bestDraw = { 
            sportsbook: odds.sportsbook, 
            odds: odds.draw_odds, 
            team: 'Draw' 
          };
        }
      }
    });
    
    // Require all three outcomes and from different sportsbooks
    if (bestHome && bestAway && bestDraw) {
      const sportsbooks = new Set([bestHome.sportsbook, bestAway.sportsbook, bestDraw.sportsbook]);
      
      // Only proceed if we have at least 2 different sportsbooks (ideally 3)
      if (sportsbooks.size >= 2) {
        // Calculate 3-way arbitrage using stored percentages for better accuracy
        const bestHomeData = cleanOdds.find(o => o.sportsbook === bestHome.sportsbook);
        const bestAwayData = cleanOdds.find(o => o.sportsbook === bestAway.sportsbook);
        const bestDrawData = cleanOdds.find(o => o.sportsbook === bestDraw.sportsbook);
        
        const homeImplied = this.getImpliedProbability(bestHomeData, 'home') || 
                           this.oddsToImpliedProbability(bestHome.odds);
        const awayImplied = this.getImpliedProbability(bestAwayData, 'away') || 
                           this.oddsToImpliedProbability(bestAway.odds);
        const drawImplied = this.getImpliedProbability(bestDrawData, 'draw') || 
                           this.oddsToImpliedProbability(bestDraw.odds);
        const totalImplied = homeImplied + awayImplied + drawImplied;
        
        if (totalImplied < 1) { // 3-way arbitrage opportunity exists
          const profit = ((1 / totalImplied) - 1) * 100;
          
          // Calculate optimal stakes for 3-way arbitrage
          const totalStake = 1000;
          const stakeHome = totalStake * (homeImplied / totalImplied);
          const stakeAway = totalStake * (awayImplied / totalImplied);
          const stakeDraw = totalStake * (drawImplied / totalImplied);
          
          const returnHome = stakeHome * this.americanToDecimal(bestHome.odds);
          const returnAway = stakeAway * this.americanToDecimal(bestAway.odds);
          const returnDraw = stakeDraw * this.americanToDecimal(bestDraw.odds);
          const guaranteedProfit = totalStake * (profit / 100);
          
          // Flag extreme or suspicious 3-way arbitrage
          if (profit > 10) {
            this.flaggedOpportunities.push({
              type: 'arb',
              flagType: 'extreme',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              issue: 'Extreme 3-Way Arbitrage',
              reason: `3-way arbitrage profit of ${profit.toFixed(1)}% is extremely high and requires investigation`,
              calculatedValue: profit,
              timestamp: new Date().toISOString()
            });
          } else if (profit > 5) {
            this.flaggedOpportunities.push({
              type: 'arb',
              flagType: 'suspicious',
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              league: game.league,
              issue: 'High 3-Way Arbitrage',
              reason: `3-way arbitrage profit of ${profit.toFixed(1)}% is unusually high for reputable books`,
              calculatedValue: profit,
              timestamp: new Date().toISOString()
                sideB: {
                  bet: bestAway.team,
                  sportsbook: bestAway.sportsbook,
                  odds: bestAway.odds,
                  decimal: this.americanToDecimal(bestAway.odds),
                  impliedProb: awayImplied,
                  storedPercent: bestAwayData.away_odds_percent
                },
                sideC: {
                  bet: bestDraw.team,
                  sportsbook: bestDraw.sportsbook,
                  odds: bestDraw.odds,
                  decimal: this.americanToDecimal(bestDraw.odds),
                  impliedProb: drawImplied,
                  storedPercent: bestDrawData.draw_odds_percent
                },
                totalImpliedProb: totalImplied,
                profitPercent: profit,
                totalStake: totalStake,
                stakeA: stakeHome,
                stakeB: stakeAway,
                stakeC: stakeDraw,
                returnA: returnHome,
                returnB: returnAway,
                returnC: returnDraw,
                guaranteedProfit: guaranteedProfit
              }
            });
          }
          
          // Store valid arbitrage opportunities (above 0.5% threshold and up to 20% to filter errors)
          if (profit > 0.5 && profit <= 20) {
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              gameTime: game.game_time,
              allBookmakers: [...new Set([bestHome.sportsbook, bestAway.sportsbook, bestDraw.sportsbook])].sort(),
              sideA: {
                team: bestHome.team,
                sportsbook: bestHome.sportsbook,
                odds: bestHome.odds,
                stake: stakeHome
              },
              sideB: {
                team: bestAway.team,
                sportsbook: bestAway.sportsbook,
                odds: bestAway.odds,
                stake: stakeAway
              },
              sideC: {
                team: bestDraw.team,
                sportsbook: bestDraw.sportsbook,
                odds: bestDraw.odds,
                stake: stakeDraw
              },
              profit: profit,
              expectedProfit: guaranteedProfit,
              marketType: '3-way'
            });
          }
        }
      }
    }
    
    return opportunities;
  }

  oddsToImpliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  // New helper function to get implied probability from stored data
  getImpliedProbability(oddsData, position) {
    // First try to use stored percentage (more accurate)
    let percentage = null;
    let americanOdds = null;
    
    if (position === 'home') {
      percentage = oddsData.home_odds_percent;
      americanOdds = oddsData.home_odds;
    } else if (position === 'away') {
      percentage = oddsData.away_odds_percent;
      americanOdds = oddsData.away_odds;
    } else if (position === 'draw') {
      percentage = oddsData.draw_odds_percent;
      americanOdds = oddsData.draw_odds;
    }
    
    // Use stored percentage if available (convert from percentage to decimal)
    if (percentage !== null && percentage !== undefined) {
      return percentage / 100;
    }
    
    // Fallback to conversion from American odds
    if (americanOdds !== null && americanOdds !== undefined) {
      return this.oddsToImpliedProbability(americanOdds);
    }
    
    return null;
  }

  americanToDecimal(americanOdds) {
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    } else {
      return (100 / Math.abs(americanOdds)) + 1;
    }
  }

  extractAllOdds(game) {
    const allOdds = {};
    
    // Extract odds from the game's odds array
    if (game.odds && Array.isArray(game.odds)) {
      game.odds.forEach(bookOdds => {
        if (bookOdds.sportsbook) {
          allOdds[bookOdds.sportsbook] = {
            home: bookOdds.home_odds,
            away: bookOdds.away_odds,
            draw: bookOdds.draw_odds
          };
        }
      });
    }
    
    return allOdds;
  }

  filterOutliers(oddsArray, side) {
    if (oddsArray.length < 5) return oddsArray; // Need at least 5 odds to detect outliers safely
    
    // Convert to decimal odds for easier comparison
    const decimalOdds = oddsArray.map(o => ({
      ...o,
      decimal: this.americanToDecimal(o.odds)
    }));
    
    // Calculate median and interquartile range
    const sortedDecimals = decimalOdds.map(o => o.decimal).sort((a, b) => a - b);
    const median = sortedDecimals[Math.floor(sortedDecimals.length / 2)];
    
    // Calculate Q1 and Q3
    const q1Index = Math.floor(sortedDecimals.length / 4);
    const q3Index = Math.floor(3 * sortedDecimals.length / 4);
    const q1 = sortedDecimals[q1Index];
    const q3 = sortedDecimals[q3Index];
    const iqr = q3 - q1;
    
    // For sports betting, be much more conservative about removing favorable odds
    // Only remove extremely suspicious outliers (3 * IQR instead of 1.5 * IQR)
    const lowerBound = q1 - 3.0 * iqr;
    const upperBound = q3 + 3.0 * iqr;
    
    // Additional check: only remove odds if they're 50%+ different from median
    const medianThreshold = 0.5; // 50% difference threshold
    const medianLowerBound = median * (1 - medianThreshold);
    const medianUpperBound = median * (1 + medianThreshold);
    
    // Filter out outliers (must meet BOTH criteria to be removed)
    const outliers = [];
    const filtered = decimalOdds.filter(o => {
      const iqrOutlier = o.decimal < lowerBound || o.decimal > upperBound;
      const medianOutlier = o.decimal < medianLowerBound || o.decimal > medianUpperBound;
      
      // Only remove if it's an outlier by BOTH measures (very conservative)
      const isOutlier = iqrOutlier && medianOutlier;
      
      if (isOutlier) {
        outliers.push(`${o.sportsbook} ${o.odds}`);
      }
      return !isOutlier;
    });
    
    // Skip logging outliers
    
    // Return original format
    return filtered.map(o => ({ sportsbook: o.sportsbook, odds: o.odds }));
  }

  findBestOdds(oddsArray, side) {
    // For American odds, "best" means highest payout
    // For negative odds: -110 is better than -150 (closer to 0)
    // For positive odds: +150 is better than +110 (higher number)
    
    return oddsArray.reduce((best, current) => {
      // Convert to decimal to compare payouts
      const bestDecimal = this.americanToDecimal(best);
      const currentDecimal = this.americanToDecimal(current);
      
      // Higher decimal odds = better for bettor
      return currentDecimal > bestDecimal ? current : best;
    });
  }

  findWorstOdds(oddsArray, side) {
    // For American odds, "worst" means lowest payout (most conservative)
    // For negative odds: -150 is worse than -110 (further from 0)
    // For positive odds: +110 is worse than +150 (lower number)
    
    return oddsArray.reduce((worst, current) => {
      // Convert to decimal to compare payouts
      const worstDecimal = this.americanToDecimal(worst);
      const currentDecimal = this.americanToDecimal(current);
      
      // Lower decimal odds = worse for bettor (more conservative baseline)
      return currentDecimal < worstDecimal ? current : worst;
    });
  }

  async calculateFairline(homeOdds, awayOdds) {
    // Configurable fairline calculation
    // Priority: 1) OddsJam Algo (if configured), 2) Pinnacle, 3) Betfair, 4) Median with 7+ books
    
    // Check for OddsJam Algo Odds if configured
    const config = await this.getConfig();
    if (config.analytics?.useAlgoFairline) {
      const algoHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('oddsjam') && 
                                     o.sportsbook.toLowerCase().includes('algo'));
      const algoAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('oddsjam') && 
                                     o.sportsbook.toLowerCase().includes('algo'));
      
      if (algoHome && algoAway) {
        return {
          homeOdds: algoHome.odds,
          awayOdds: algoAway.odds,
          method: 'OddsJam Algo'
        };
      }
    }
    
    // Check for Pinnacle
    const pinnacleHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('pinnacle'));
    const pinnacleAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('pinnacle'));
    
    if (pinnacleHome && pinnacleAway) {
      return {
        homeOdds: pinnacleHome.odds,
        awayOdds: pinnacleAway.odds,
        method: 'Pinnacle'
      };
    }
    
    // Check for Betfair
    const betfairHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('betfair'));
    const betfairAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('betfair'));
    
    if (betfairHome && betfairAway) {
      return {
        homeOdds: betfairHome.odds,
        awayOdds: betfairAway.odds,
        method: 'Betfair'
      };
    }
    
    // Check if we have at least 7 books for median calculation
    if (homeOdds.length >= 7 && awayOdds.length >= 7) {
      const medianHome = this.calculateMedianOdds(homeOdds.map(o => o.odds));
      const medianAway = this.calculateMedianOdds(awayOdds.map(o => o.odds));
      
      // Skip logging median fairline
      return {
        homeOdds: medianHome,
        awayOdds: medianAway,
        method: `Median (${homeOdds.length} books)`
      };
    }
    
    // Fallback: use best odds if we don't meet criteria
    if (homeOdds.length >= 3 && awayOdds.length >= 3) {
      const bestHome = this.findBestOdds(homeOdds.map(o => o.odds), 'home');
      const bestAway = this.findBestOdds(awayOdds.map(o => o.odds), 'away');
      
      return {
        homeOdds: bestHome,
        awayOdds: bestAway,
        method: `Best Odds Fallback (${homeOdds.length} books)`
      };
    }
    
    // Not enough data
    return null;
  }

  async calculateFairline3Way(homeOdds, awayOdds, drawOdds) {
    // Configurable fairline calculation for 3-way markets
    // Priority: 1) OddsJam Algo (if configured), 2) Pinnacle, 3) Betfair, 4) Median with 7+ books
    
    // Check for OddsJam Algo Odds if configured
    const config = await this.getConfig();
    if (config.analytics?.useAlgoFairline) {
      const algoHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('oddsjam') && 
                                     o.sportsbook.toLowerCase().includes('algo'));
      const algoAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('oddsjam') && 
                                     o.sportsbook.toLowerCase().includes('algo'));
      const algoDraw = drawOdds.find(o => o.sportsbook.toLowerCase().includes('oddsjam') && 
                                     o.sportsbook.toLowerCase().includes('algo'));
      
      if (algoHome && algoAway && algoDraw) {
        return {
          homeOdds: algoHome.odds,
          awayOdds: algoAway.odds,
          drawOdds: algoDraw.odds,
          method: 'OddsJam Algo'
        };
      }
    }
    
    // Check for Pinnacle
    const pinnacleHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('pinnacle'));
    const pinnacleAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('pinnacle'));
    const pinnacleDraw = drawOdds.find(o => o.sportsbook.toLowerCase().includes('pinnacle'));
    
    if (pinnacleHome && pinnacleAway && pinnacleDraw) {
      return {
        homeOdds: pinnacleHome.odds,
        awayOdds: pinnacleAway.odds,
        drawOdds: pinnacleDraw.odds,
        method: 'Pinnacle'
      };
    }
    
    // Check for Betfair
    const betfairHome = homeOdds.find(o => o.sportsbook.toLowerCase().includes('betfair'));
    const betfairAway = awayOdds.find(o => o.sportsbook.toLowerCase().includes('betfair'));
    const betfairDraw = drawOdds.find(o => o.sportsbook.toLowerCase().includes('betfair'));
    
    if (betfairHome && betfairAway && betfairDraw) {
      return {
        homeOdds: betfairHome.odds,
        awayOdds: betfairAway.odds,
        drawOdds: betfairDraw.odds,
        method: 'Betfair'
      };
    }
    
    // Check if we have at least 7 books for median calculation
    if (homeOdds.length >= 7 && awayOdds.length >= 7 && drawOdds.length >= 7) {
      const medianHome = this.calculateMedianOdds(homeOdds.map(o => o.odds));
      const medianAway = this.calculateMedianOdds(awayOdds.map(o => o.odds));
      const medianDraw = this.calculateMedianOdds(drawOdds.map(o => o.odds));
      
      return {
        homeOdds: medianHome,
        awayOdds: medianAway,
        drawOdds: medianDraw,
        method: `Median (${homeOdds.length} books)`
      };
    }
    
    // Fallback: use best odds if we don't meet criteria but have enough data
    if (homeOdds.length >= 3 && awayOdds.length >= 3 && drawOdds.length >= 3) {
      const bestHome = this.findBestOdds(homeOdds.map(o => o.odds), 'home');
      const bestAway = this.findBestOdds(awayOdds.map(o => o.odds), 'away');
      const bestDraw = this.findBestOdds(drawOdds.map(o => o.odds), 'draw');
      
      return {
        homeOdds: bestHome,
        awayOdds: bestAway,
        drawOdds: bestDraw,
        method: `Best Odds Fallback (${homeOdds.length} books)`
      };
    }
    
    // Not enough data
    return null;
  }

  calculateMedianOdds(oddsArray) {
    // Convert to decimal for median calculation, then back to American
    const decimals = oddsArray.map(odds => this.americanToDecimal(odds)).sort((a, b) => a - b);
    const median = decimals.length % 2 === 0 
      ? (decimals[decimals.length / 2 - 1] + decimals[decimals.length / 2]) / 2
      : decimals[Math.floor(decimals.length / 2)];
    
    // Convert back to American odds
    return this.decimalToAmerican(median);
  }

  decimalToAmerican(decimal) {
    if (decimal >= 2) {
      return Math.round((decimal - 1) * 100);
    } else {
      return Math.round(-100 / (decimal - 1));
    }
  }

  calculateKelly(trueProbability, americanOdds) {
    const decimalOdds = americanOdds > 0 ? 
      (americanOdds / 100) + 1 : 
      (100 / Math.abs(americanOdds)) + 1;
    
    const kelly = ((trueProbability * decimalOdds) - 1) / (decimalOdds - 1);
    return Math.max(0, kelly * 100); // Return as percentage, min 0
  }

  // Extract OddsJam Algo Odds as potential fairline source
  extractAlgorithmicFairline(allOdds) {
    const algoOdds = allOdds.find(o => {
      const sportsbook = o.sportsbook?.toLowerCase() || '';
      return sportsbook.includes('algo') || sportsbook.includes('algorithm');
    });
    
    if (algoOdds) {
      return {
        source: algoOdds.sportsbook,
        home_odds: algoOdds.home_odds,
        away_odds: algoOdds.away_odds,
        draw_odds: algoOdds.draw_odds,
        home_percent: algoOdds.home_odds_percent,
        away_percent: algoOdds.away_odds_percent,
        draw_percent: algoOdds.draw_odds_percent
      };
    }
    
    return null;
  }

  async categorizeAndCleanOdds(odds) {
    const liveOdds = [];
    const preGameOdds = [];
    const cleanOdds = [];
    
    // Get configuration to check if algo odds should be preserved for fairline
    const config = await this.getConfig();
    const useAlgoFairline = config.analytics?.useAlgoFairline;
    
    odds.forEach(o => {
      // Skip algorithmic/reference odds that aren't real bookmakers
      // UNLESS they're configured as fairline source
      const sportsbook = o.sportsbook?.toLowerCase() || '';
      const isAlgorithmic = sportsbook.includes('algo') || sportsbook.includes('algorithm');
      
      if (isAlgorithmic && !useAlgoFairline) {
        return;
      }
      // Identify live vs pre-game by game status
      // Find the game data to check game_status
      const game = this.data.games.find(g => g.game_id === o.game_id);
      const isLive = game ? (game.game_status === 'live' || game.inning_info) : false;
      
      // Fix data quality issues based on sportsbook type
      const fixedOdds = this.fixOddsDataQuality(o);
      
      if (fixedOdds) {
        cleanOdds.push({...fixedOdds, isLive});
        
        if (isLive) {
          liveOdds.push({...fixedOdds, isLive: true});
        } else {
          preGameOdds.push({...fixedOdds, isLive: false});
        }
      }
    });
    
    return { liveOdds, preGameOdds, cleanOdds };
  }

  fixOddsDataQuality(odds) {
    // Handle Betfair Exchange suspended markets
    if (odds.sportsbook.includes('Betfair Exchange')) {
      // -11011 indicates suspended/no market - skip this entry
      if (odds.home_odds === -11011 || odds.away_odds === -11011) {
        console.log(`Skipping suspended Betfair market: ${odds.game_id}`);
        return null;
      }
    }
    
    // Handle Polymarket percentage format
    if (odds.sportsbook === 'Polymarket') {
      // For prediction markets, extreme odds during live events are normal
      // But validate they're reasonable for the context
      if (odds.home_odds_percent && odds.away_odds_percent) {
        // If percentages are available, ensure American odds conversion is correct
        const totalPercent = (odds.home_odds_percent || 0) + (odds.away_odds_percent || 0);
        if (totalPercent > 105 || totalPercent < 95) {
          // Skip suspicious percentages
        }
      }
    }
    
    // Validate odds are within reasonable bounds for context
    if (odds.home_odds && Math.abs(odds.home_odds) > 50000) {
      return null;
    }
    if (odds.away_odds && Math.abs(odds.away_odds) > 50000) {
      return null;
    }
    
    return odds;
  }

  filterOutlierOdds(oddsArray, type = 'unknown') {
    if (oddsArray.length < 4) {
      // Not enough data points to filter outliers, return all
      return oddsArray;
    }

    // Convert to numeric values for statistical analysis
    const values = oddsArray.map(item => Math.abs(item.odds || 0)).sort((a, b) => a - b);
    
    // Calculate quartiles
    const q1Index = Math.floor(values.length * 0.25);
    const q3Index = Math.floor(values.length * 0.75);
    const q1 = values[q1Index];
    const q3 = values[q3Index];
    const iqr = q3 - q1;
    
    // Define outlier bounds (using 1.5 * IQR method)
    const lowerBound = q1 - (1.5 * iqr);
    const upperBound = q3 + (1.5 * iqr);
    
    // Filter out outliers
    const filtered = oddsArray.filter(item => {
      const value = Math.abs(item.odds || 0);
      return value >= lowerBound && value <= upperBound;
    });
    
    // Skip logging outlier filtering
    
    // Ensure we don't remove too much data - keep at least 3 books if possible
    return filtered.length >= 3 ? filtered : oddsArray.slice(0, 3);
  }

  getTimeRangeText() {
    const hours = this.filters.dataFreshness;
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `last ${minutes} min`;
    } else if (hours === 1) {
      return 'last 1 hour';
    } else if (hours < 24) {
      return `last ${hours} hours`;
    } else {
      const days = Math.round(hours / 24);
      return `last ${days} day${days > 1 ? 's' : ''}`;
    }
  }

  updateStats() {
    // Get time range description
    const timeRangeText = this.getTimeRangeText();
    
    // Total games with time context
    document.getElementById('total-games').textContent = this.data.games.length;
    document.getElementById('games-change').textContent = `${this.data.odds.length} odds entries (${timeRangeText})`;
    
    // +EV opportunities
    const evCount = this.data.evOpportunities.length;
    document.getElementById('ev-opportunities').textContent = evCount;
    const avgEv = evCount > 0 ? 
      (this.data.evOpportunities.reduce((sum, opp) => sum + opp.ev, 0) / evCount).toFixed(1) + '% avg' : 
      `None found (${timeRangeText})`;
    document.getElementById('ev-change').textContent = avgEv;
    
    // +EV refresh info
    const evRefreshInfo = document.getElementById('ev-refresh-info');
    if (evRefreshInfo) {
      evRefreshInfo.textContent = `Last: ${this.formatTimeAgo(this.lastRefresh.ev)} • ${this.refreshHistory.ev.length} refreshes/hr`;
    }
    
    // Arbitrage opportunities
    const arbCount = this.data.arbOpportunities.length;
    document.getElementById('arb-opportunities').textContent = arbCount;
    const avgProfit = arbCount > 0 ? 
      (this.data.arbOpportunities.reduce((sum, opp) => sum + opp.profit, 0) / arbCount).toFixed(2) + '% avg' : 
      'None found';
    document.getElementById('arb-change').textContent = avgProfit;
    
    // Arbitrage refresh info
    const arbRefreshInfo = document.getElementById('arb-refresh-info');
    if (arbRefreshInfo) {
      arbRefreshInfo.textContent = `Last: ${this.formatTimeAgo(this.lastRefresh.arbitrage)} • ${this.refreshHistory.arbitrage.length} refreshes/hr`;
    }
    
    // Sportsbooks count
    const sportsbooks = new Set(this.data.odds.map(o => o.sportsbook));
    document.getElementById('sportsbooks-count').textContent = sportsbooks.size;
    const sportsbooksArray = Array.from(sportsbooks);
    document.getElementById('sportsbooks-change').textContent = 
      sportsbooksArray.length > 3 ? 
        `${sportsbooksArray.slice(0, 3).join(', ')} +${sportsbooksArray.length - 3} more` : 
        sportsbooksArray.join(', ');
    
    // Performance metrics
    const ingestionRate = this.getIngestionRate();
    document.getElementById('refresh-rate').textContent = ingestionRate > 0 ? `${ingestionRate}/min` : '-';
    document.getElementById('refresh-rate-change').textContent = 'Odds data ingestion rate';
    
    const performanceInfo = document.getElementById('performance-info');
    if (performanceInfo) {
      const totalIngestions = this.ingestionData.history.length;
      const activeTabs = this.ingestionData.activeTabs.length;
      const lastIngestion = this.ingestionData.lastIngestion ? 
        this.formatTimeAgo(new Date(this.ingestionData.lastIngestion)) : 'Never';
      
      // Count tabs that might be frozen (no data in last 5 minutes)
      const now = new Date();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const frozenTabs = this.ingestionData.activeTabs.filter(tab => 
        tab.lastDataReceived && new Date(tab.lastDataReceived) < fiveMinutesAgo
      ).length;
      
      // Get per-URL stats if available
      const perUrlStats = this.ingestionData.perUrlStats || [];
      const activeUrls = perUrlStats.length;
      
      // Calculate total reload count
      const totalReloads = this.ingestionData.activeTabs.reduce((sum, tab) => 
        sum + (tab.consecutiveFailures || 0), 0
      );
      
      performanceInfo.innerHTML = `
        <div>${totalIngestions} data updates in last 5 minutes</div>
        <div>${activeTabs} active tabs (${frozenTabs} potentially frozen)</div>
        <div>${activeUrls} unique URLs tracked</div>
        <div>Auto-reloads: ${totalReloads} total</div>
        <div>Last data: ${lastIngestion}</div>
      `;
    }
  }

  renderTables() {
    this.renderEVTable();
    this.renderArbTable();
    this.renderStatsTable();
  }

  renderEVTable() {
    // Separate opportunities into live and pre-game
    const allFiltered = this.data.evOpportunities.filter(opp => {
      if (this.filters.sport !== 'all' && opp.sport !== this.filters.sport) return false;
      if (opp.ev < this.filters.minEv) return false;
      if (!this.filters.evBookmakers.includes('all') && !this.filters.evBookmakers.includes(opp.sportsbook)) return false;
      return true;
    });
    
    const preGameOpps = allFiltered.filter(opp => !opp.isLive);
    const liveOpps = allFiltered.filter(opp => opp.isLive);
    
    // Render pre-game table
    this.renderEVTableSection('ev-pregame-table-body', preGameOpps, 'No pre-game +EV opportunities found');
    
    // Render live table  
    this.renderEVTableSection('ev-live-table-body', liveOpps, 'No live +EV opportunities found');
  }
  
  renderEVTableSection(tableBodyId, opportunities, emptyMessage) {
    const tbody = document.getElementById(tableBodyId);
    
    if (opportunities.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="empty-state">
            <h3>${emptyMessage}</h3>
            <p>Try adjusting your filters or check back later</p>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = opportunities.map(opp => `
      <tr>
        <td>
          <div style="font-weight: 500;">${opp.game}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${opp.sport}</div>
          <div style="font-size: 0.65rem; color: #94a3b8; font-family: monospace;">${opp.gameId}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${this.formatGameDate(opp.gameTime)}</div>
        </td>
        <td><strong>${opp.bet}</strong></td>
        <td><span class="sportsbook-logo">${opp.sportsbook}</span></td>
        <td><strong>${this.formatDisplayOdds(opp.odds, this.filters.oddsFormat)}</strong></td>
        <td><strong>${this.formatFairOdds(opp.fairProb, this.filters.oddsFormat)}</strong></td>
        <td>${this.formatProbability(opp.impliedProb, this.filters.oddsFormat)}</td>
        <td>${this.formatProbability(opp.fairProb, this.filters.oddsFormat)}</td>
        <td>
          <span class="ev-badge ${this.getEvClass(opp.ev)}">
            +${opp.ev.toFixed(1)}%
          </span>
        </td>
        <td>${opp.kelly.toFixed(1)}%</td>
      </tr>
    `).join('');
  }

  renderArbTable() {
    const tbody = document.getElementById('arb-table-body');
    const filtered = this.data.arbOpportunities.filter(opp => {
      if (opp.profit < this.filters.minProfit) return false;
      // Filter by bookmakers (check if any of the arbitrage bookmakers match the filter)
      if (!this.filters.arbBookmakers.includes('all')) {
        const arbBookmakers = [opp.sideA.sportsbook, opp.sideB.sportsbook];
        const hasMatchingBookmaker = this.filters.arbBookmakers.some(bm => arbBookmakers.includes(bm));
        if (!hasMatchingBookmaker) return false;
      }
      return true;
    });
    
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <h3>No arbitrage opportunities found</h3>
            <p>Arbitrage opportunities are rare - check back later</p>
          </td>
        </tr>
      `;
      return;
    }
    
    tbody.innerHTML = filtered.map(opp => `
      <tr>
        <td>
          <div style="font-weight: 500;">${opp.game}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${opp.sport}</div>
          <div style="font-size: 0.65rem; color: #94a3b8; font-family: monospace;">${opp.gameId}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${this.formatGameDate(opp.gameTime)}</div>
        </td>
        <td>
          <div><strong>${opp.sideA.team}</strong></div>
          <div style="font-size: 0.875rem;">
            <span class="sportsbook-logo">${opp.sideA.sportsbook}</span>
            ${this.formatOdds(opp.sideA.odds)}
          </div>
        </td>
        <td>
          <div><strong>${opp.sideB.team}</strong></div>
          <div style="font-size: 0.875rem;">
            <span class="sportsbook-logo">${opp.sideB.sportsbook}</span>
            ${this.formatOdds(opp.sideB.odds)}
          </div>
        </td>
        <td>
          <span class="ev-badge arb-badge">
            ${opp.profit.toFixed(2)}%
          </span>
        </td>
        <td>
          <div style="font-size: 0.875rem;">
            ${opp.sideA.team}: $${opp.sideA.stake.toFixed(0)}
          </div>
          <div style="font-size: 0.875rem;">
            ${opp.sideB.team}: $${opp.sideB.stake.toFixed(0)}
          </div>
        </td>
        <td><strong>$${opp.expectedProfit.toFixed(2)}</strong></td>
      </tr>
    `).join('');
  }

  renderStatsTable() {
    const tbody = document.getElementById('stats-table-body');
    const perUrlStats = this.ingestionData.perUrlStats || [];
    const activeTabs = this.ingestionData.activeTabs || [];
    
    if (perUrlStats.length === 0 && activeTabs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="empty-state">
            <h3>No URL statistics available</h3>
            <p>Start scraping some sportsbook pages to see statistics</p>
          </td>
        </tr>
      `;
      return;
    }
    
    // Combine per-URL stats with active tab info
    const combinedStats = [];
    
    // Add per-URL stats
    perUrlStats.forEach(urlStat => {
      const matchingTab = activeTabs.find(tab => {
        const tabBaseUrl = new URL(tab.url).origin + new URL(tab.url).pathname;
        return tabBaseUrl === urlStat.url;
      });
      
      combinedStats.push({
        url: urlStat.url,
        totalIngestions: urlStat.totalIngestions,
        avgGames: Math.round(urlStat.avgGamesPerIngestion * 10) / 10,
        avgOdds: Math.round(urlStat.avgOddsPerIngestion * 10) / 10,
        lastActivity: urlStat.lastIngestion,
        status: matchingTab ? 'Active' : 'Inactive',
        reloads: matchingTab ? (matchingTab.consecutiveFailures || 0) : 0,
        isActive: !!matchingTab
      });
    });
    
    // Add active tabs that don't have URL stats yet
    activeTabs.forEach(tab => {
      const tabBaseUrl = new URL(tab.url).origin + new URL(tab.url).pathname;
      const hasUrlStat = perUrlStats.some(urlStat => urlStat.url === tabBaseUrl);
      
      if (!hasUrlStat) {
        combinedStats.push({
          url: tabBaseUrl,
          totalIngestions: tab.totalDataReceived || 0,
          avgGames: 0,
          avgOdds: 0,
          lastActivity: tab.lastDataReceived,
          status: 'Active (New)',
          reloads: tab.consecutiveFailures || 0,
          isActive: true
        });
      }
    });
    
    // Sort by last activity (most recent first)
    combinedStats.sort((a, b) => {
      const timeA = a.lastActivity ? new Date(a.lastActivity).getTime() : 0;
      const timeB = b.lastActivity ? new Date(b.lastActivity).getTime() : 0;
      return timeB - timeA;
    });
    
    tbody.innerHTML = combinedStats.map(stat => {
      const statusClass = stat.isActive ? 'positive' : 'neutral';
      const urlDisplay = stat.url.length > 50 ? stat.url.substring(0, 47) + '...' : stat.url;
      const lastActivity = stat.lastActivity ? this.formatTimeAgo(new Date(stat.lastActivity)) : 'Never';
      
      return `
        <tr>
          <td title="${stat.url}">${urlDisplay}</td>
          <td><span class="${statusClass}">${stat.status}</span></td>
          <td>${stat.totalIngestions}</td>
          <td>${stat.avgGames}</td>
          <td>${stat.avgOdds}</td>
          <td>${lastActivity}</td>
          <td>${stat.reloads > 0 ? `<span class="negative">${stat.reloads}</span>` : '0'}</td>
        </tr>
      `;
    }).join('');
  }

  formatOdds(americanOdds) {
    return americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
  }

  formatDisplayOdds(odds, format) {
    if (!odds || odds === -11011) return 'Suspended';
    if (typeof odds !== 'number') return odds.toString();
    
    const american = odds > 0 ? `+${odds}` : `${odds}`;
    
    switch (format) {
      case 'american':
        return american;
      case 'decimal':
        return this.americanToDecimal(odds).toFixed(2);
      case 'percentage':
        return (this.oddsToImpliedProbability(odds) * 100).toFixed(1) + '%';
      case 'both':
        return `${(this.oddsToImpliedProbability(odds) * 100).toFixed(1)}% / ${american}`;
      default:
        return american;
    }
  }

  formatFairOdds(fairProb, format) {
    if (!fairProb || fairProb <= 0) return 'N/A';
    
    // Convert probability to American odds
    const americanOdds = this.probabilityToAmericanOdds(fairProb);
    const american = americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
    
    switch (format) {
      case 'american':
        return american;
      case 'decimal':
        return (1 / fairProb).toFixed(2);
      case 'percentage':
        return (fairProb * 100).toFixed(1) + '%';
      case 'both':
        return `${(fairProb * 100).toFixed(1)}% / ${american}`;
      default:
        return american;
    }
  }

  formatProbability(prob, format) {
    if (!prob || prob <= 0) return 'N/A';
    
    switch (format) {
      case 'american':
        const americanOdds = this.probabilityToAmericanOdds(prob);
        return americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
      case 'decimal':
        return (1 / prob).toFixed(2);
      case 'percentage':
        return (prob * 100).toFixed(1) + '%';
      case 'both':
        const american = this.probabilityToAmericanOdds(prob);
        const americanStr = american > 0 ? `+${american}` : `${american}`;
        return `${(prob * 100).toFixed(1)}% / ${americanStr}`;
      default:
        return (prob * 100).toFixed(1) + '%';
    }
  }

  probabilityToAmericanOdds(prob) {
    if (prob <= 0 || prob >= 1) return 0;
    
    if (prob > 0.5) {
      return Math.round(-100 / (1/prob - 1));
    } else {
      return Math.round(100 * (1/prob - 1));
    }
  }

  getEvClass(ev) {
    if (ev >= 10) return 'ev-high';
    if (ev >= 5) return 'ev-medium';
    return 'ev-low';
  }

  updateLastUpdated() {
    if (this.lastUpdated) {
      document.getElementById('last-updated').textContent = 
        this.lastUpdated.toLocaleTimeString();
    }
  }

  async storeFlaggedOpportunities() {
    try {
      await chrome.runtime.sendMessage({
        type: 'STORE_FLAGGED_OPPORTUNITIES',
        opportunities: this.flaggedOpportunities
      });
      console.log(`Stored ${this.flaggedOpportunities.length} flagged opportunities`);
    } catch (error) {
      console.error('Failed to store flagged opportunities:', error);
    }
  }

  showError(message) {
    console.error('Analytics error:', message);
    
    const evTbody = document.getElementById('ev-table-body');
    const arbTbody = document.getElementById('arb-table-body');
    
    const errorHtml = `
      <tr>
        <td colspan="8" class="empty-state">
          <h3>Error loading data</h3>
          <p>${message}</p>
        </td>
      </tr>
    `;
    
    if (evTbody) {
      evTbody.innerHTML = errorHtml;
    }
    if (arbTbody) {
      arbTbody.innerHTML = errorHtml.replace('colspan="8"', 'colspan="6"');
    }
  }

  switchTab(evt, tabName) {
    console.log('Switching to tab:', tabName);
    
    // Hide all tab contents
    const tabContents = document.getElementsByClassName('tab-content');
    for (let i = 0; i < tabContents.length; i++) {
      tabContents[i].classList.remove('active');
    }
    
    // Remove active class from all tabs
    const tabs = document.getElementsByClassName('tab');
    for (let i = 0; i < tabs.length; i++) {
      tabs[i].classList.remove('active');
    }
    
    // Show the selected tab content and mark the button as active
    document.getElementById(tabName).classList.add('active');
    evt.currentTarget.classList.add('active');
    
    console.log('Tab switch completed');
  }

  async getConfig() {
    try {
      const result = await chrome.storage.local.get(['scraperConfig']);
      return result.scraperConfig || {
        analytics: {
          useAlgoFairline: false
        }
      };
    } catch (error) {
      console.error('Error loading config:', error);
      return {
        analytics: {
          useAlgoFairline: false
        }
      };
    }
  }
}

// Tab switching is handled by the AnalyticsController class

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.analytics = new AnalyticsController();
  
  // Tab event listeners are already set up in the AnalyticsController class constructor
});