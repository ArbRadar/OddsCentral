// Analytics page JavaScript
class AnalyticsController {
  constructor() {
    this.data = {
      games: [],
      odds: [],
      evOpportunities: [],
      arbOpportunities: []
    };
    this.filters = {
      sport: 'all',
      minEv: 0,
      minProfit: 0,
      maxStake: 1000
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
    setInterval(() => this.refreshData(), 30000);
  }

  setupEventListeners() {
    // Filter changes
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

    // Refresh buttons
    document.querySelectorAll('#refresh-btn').forEach(btn => {
      btn.addEventListener('click', () => this.refreshData());
    });
  }

  async refreshData() {
    try {
      // Check if database is connected first
      const statusResponse = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
      
      if (!statusResponse || !statusResponse.initialized) {
        console.log('Database not initialized yet, will retry...');
        this.showError('Database connecting... Please wait');
        
        // Retry in 3 seconds
        setTimeout(() => this.refreshData(), 3000);
        return;
      }
      
      // Get data from extension background script
      const response = await chrome.runtime.sendMessage({ type: 'GET_ANALYTICS_DATA' });
      
      if (response && response.success) {
        this.data = response.data;
        this.lastUpdated = new Date();
        
        console.log('Analytics data loaded:', this.data.games.length, 'games,', this.data.odds.length, 'odds');
        
        // Calculate opportunities
        this.calculateOpportunities();
        
        // Update UI
        this.updateStats();
        this.renderTables();
        this.updateLastUpdated();
      } else {
        console.error('Failed to get analytics data:', response?.error);
        this.showError(response?.error || 'Failed to load data');
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      this.showError('Connection error: ' + error.message);
    }
  }

  calculateOpportunities() {
    this.data.evOpportunities = this.calculateEVOpportunities();
    this.data.arbOpportunities = this.calculateArbitrageOpportunities();
  }

  calculateEVOpportunities() {
    const opportunities = [];
    
    console.log('Calculating EV opportunities from:', this.data.games.length, 'games');
    
    this.data.games.forEach(game => {
      const gameOdds = this.data.odds.filter(o => o.game_id === game.game_id);
      
      if (gameOdds.length < 3) return; // Need at least 3 books for meaningful comparison
      
      // Check if this is a 3-way market (soccer) by looking for "Draw" in team names
      const isThreeWayMarket = game.sport === 'soccer' || 
                               game.home_team === 'Draw' || 
                               game.away_team === 'Draw' ||
                               gameOdds.some(o => o.sportsbook?.includes('Draw'));
      
      if (isThreeWayMarket) {
        console.warn(`Skipping 3-way market: ${game.away_team} @ ${game.home_team} - 3-way markets not yet supported`);
        return;
      }
      
      // Get all valid odds
      const homeOdds = gameOdds.map(o => ({ sportsbook: o.sportsbook, odds: o.home_odds })).filter(o => o.odds);
      const awayOdds = gameOdds.map(o => ({ sportsbook: o.sportsbook, odds: o.away_odds })).filter(o => o.odds);
      
      if (homeOdds.length === 0 || awayOdds.length === 0) return;
      
      // Find the BEST (highest) odds for each side - these represent the sharpest lines
      // Note: Using findBestOdds method below for correct American odds handling
      
      const bestHomeOdds = this.findBestOdds(homeOdds.map(o => o.odds), 'home');
      const bestAwayOdds = this.findBestOdds(awayOdds.map(o => o.odds), 'away');
      
      console.log(`Game: ${game.away_team} @ ${game.home_team}`);
      console.log(`Best odds - Home: ${bestHomeOdds}, Away: ${bestAwayOdds}`);
      
      // Convert best odds to probabilities (these are closest to "fair" odds)
      const bestHomeProbRaw = this.oddsToImpliedProbability(bestHomeOdds);
      const bestAwayProbRaw = this.oddsToImpliedProbability(bestAwayOdds);
      
      console.log(`Raw probabilities - Home: ${(bestHomeProbRaw*100).toFixed(1)}%, Away: ${(bestAwayProbRaw*100).toFixed(1)}%`);
      
      // Normalize probabilities to remove vig (they should sum to 1)
      const totalProb = bestHomeProbRaw + bestAwayProbRaw;
      const fairHomeProb = bestHomeProbRaw / totalProb;
      const fairAwayProb = bestAwayProbRaw / totalProb;
      
      console.log(`Fair probabilities - Home: ${(fairHomeProb*100).toFixed(1)}%, Away: ${(fairAwayProb*100).toFixed(1)}%`);
      
      // Find +EV bets by comparing each book's odds to fair probabilities
      gameOdds.forEach(bookOdds => {
        if (bookOdds.home_odds) {
          const impliedProb = this.oddsToImpliedProbability(bookOdds.home_odds);
          const decimalOdds = this.americanToDecimal(bookOdds.home_odds);
          const ev = ((fairHomeProb * decimalOdds) - 1) * 100;
          
          console.log(`${bookOdds.sportsbook} ${game.home_team}: ${bookOdds.home_odds} -> Fair: ${(fairHomeProb*100).toFixed(1)}%, Implied: ${(impliedProb*100).toFixed(1)}%, EV: ${ev.toFixed(1)}%`);
          
          // Sanity check: EV should rarely exceed 15% for reputable books
          if (ev > 15) {
            console.warn(`SUSPICIOUS HIGH +EV: ${ev.toFixed(1)}% for ${bookOdds.sportsbook} on ${game.home_team}`);
          }
          
          if (ev > 0.5 && ev <= 50) { // Cap at 50% to filter out calculation errors
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              bet: `${game.home_team} ML`,
              sportsbook: bookOdds.sportsbook,
              odds: bookOdds.home_odds,
              impliedProb: impliedProb,
              fairProb: fairHomeProb,
              ev: ev,
              kelly: this.calculateKelly(fairHomeProb, bookOdds.home_odds)
            });
          }
        }
        
        if (bookOdds.away_odds) {
          const impliedProb = this.oddsToImpliedProbability(bookOdds.away_odds);
          const decimalOdds = this.americanToDecimal(bookOdds.away_odds);
          const ev = ((fairAwayProb * decimalOdds) - 1) * 100;
          
          console.log(`${bookOdds.sportsbook} ${game.away_team}: ${bookOdds.away_odds} -> Fair: ${(fairAwayProb*100).toFixed(1)}%, Implied: ${(impliedProb*100).toFixed(1)}%, EV: ${ev.toFixed(1)}%`);
          
          if (ev > 15) {
            console.warn(`SUSPICIOUS HIGH +EV: ${ev.toFixed(1)}% for ${bookOdds.sportsbook} on ${game.away_team}`);
          }
          
          if (ev > 0.5 && ev <= 50) { // Cap at 50% to filter out calculation errors
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              bet: `${game.away_team} ML`,
              sportsbook: bookOdds.sportsbook,
              odds: bookOdds.away_odds,
              impliedProb: impliedProb,
              fairProb: fairAwayProb,
              ev: ev,
              kelly: this.calculateKelly(fairAwayProb, bookOdds.away_odds)
            });
          }
        }
      });
    });
    
    return opportunities.sort((a, b) => b.ev - a.ev);
  }

  calculateArbitrageOpportunities() {
    const opportunities = [];
    
    this.data.games.forEach(game => {
      const gameOdds = this.data.odds.filter(o => o.game_id === game.game_id);
      
      if (gameOdds.length < 2) return;
      
      // Check if this is a 3-way market (soccer) - skip for now
      const isThreeWayMarket = game.sport === 'soccer' || 
                               game.home_team === 'Draw' || 
                               game.away_team === 'Draw' ||
                               gameOdds.some(o => o.sportsbook?.includes('Draw'));
      
      if (isThreeWayMarket) {
        return; // Skip 3-way markets for arbitrage calculation
      }
      
      // Find best odds for each side
      let bestHome = null;
      let bestAway = null;
      
      gameOdds.forEach(odds => {
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
        // Calculate arbitrage profit
        const homeImplied = this.oddsToImpliedProbability(bestHome.odds);
        const awayImplied = this.oddsToImpliedProbability(bestAway.odds);
        const totalImplied = homeImplied + awayImplied;
        
        if (totalImplied < 1) { // Arbitrage opportunity exists
          const profit = ((1 / totalImplied) - 1) * 100;
          
          console.log(`Arbitrage: ${game.away_team} @ ${game.home_team}`);
          console.log(`  Home: ${bestHome.sportsbook} ${bestHome.odds} (${(homeImplied*100).toFixed(1)}%)`);
          console.log(`  Away: ${bestAway.sportsbook} ${bestAway.odds} (${(awayImplied*100).toFixed(1)}%)`);
          console.log(`  Total Implied: ${(totalImplied*100).toFixed(1)}%, Profit: ${profit.toFixed(2)}%`);
          
          // Sanity check: Arbitrage profit should rarely exceed 5% for reputable books
          if (profit > 5) {
            console.warn(`SUSPICIOUS HIGH ARBITRAGE: ${profit.toFixed(2)}% for ${game.away_team} @ ${game.home_team}`);
          }
          
          if (profit > 0.1 && profit <= 20) { // Only show if profit between 0.1% and 20% to filter calculation errors
            const totalStake = 1000; // Assume $1000 total stake
            const homeStake = totalStake * (homeImplied / totalImplied);
            const awayStake = totalStake * (awayImplied / totalImplied);
            
            opportunities.push({
              game: `${game.away_team} @ ${game.home_team}`,
              gameId: game.game_id,
              sport: game.sport,
              sideA: {
                team: bestHome.team,
                sportsbook: bestHome.sportsbook,
                odds: bestHome.odds,
                stake: homeStake
              },
              sideB: {
                team: bestAway.team,
                sportsbook: bestAway.sportsbook,
                odds: bestAway.odds,
                stake: awayStake
              },
              profit: profit,
              expectedProfit: totalStake * (profit / 100)
            });
          }
        }
      }
    });
    
    return opportunities.sort((a, b) => b.profit - a.profit);
  }

  oddsToImpliedProbability(americanOdds) {
    if (americanOdds > 0) {
      return 100 / (americanOdds + 100);
    } else {
      return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
    }
  }

  americanToDecimal(americanOdds) {
    if (americanOdds > 0) {
      return (americanOdds / 100) + 1;
    } else {
      return (100 / Math.abs(americanOdds)) + 1;
    }
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

  calculateKelly(trueProbability, americanOdds) {
    const decimalOdds = americanOdds > 0 ? 
      (americanOdds / 100) + 1 : 
      (100 / Math.abs(americanOdds)) + 1;
    
    const kelly = ((trueProbability * decimalOdds) - 1) / (decimalOdds - 1);
    return Math.max(0, kelly * 100); // Return as percentage, min 0
  }

  updateStats() {
    // Total games
    document.getElementById('total-games').textContent = this.data.games.length;
    document.getElementById('games-change').textContent = `${this.data.odds.length} odds entries`;
    
    // +EV opportunities
    const evCount = this.data.evOpportunities.length;
    document.getElementById('ev-opportunities').textContent = evCount;
    const avgEv = evCount > 0 ? 
      (this.data.evOpportunities.reduce((sum, opp) => sum + opp.ev, 0) / evCount).toFixed(1) + '% avg' : 
      'None found';
    document.getElementById('ev-change').textContent = avgEv;
    
    // Arbitrage opportunities
    const arbCount = this.data.arbOpportunities.length;
    document.getElementById('arb-opportunities').textContent = arbCount;
    const avgProfit = arbCount > 0 ? 
      (this.data.arbOpportunities.reduce((sum, opp) => sum + opp.profit, 0) / arbCount).toFixed(2) + '% avg' : 
      'None found';
    document.getElementById('arb-change').textContent = avgProfit;
    
    // Sportsbooks count
    const sportsbooks = new Set(this.data.odds.map(o => o.sportsbook));
    document.getElementById('sportsbooks-count').textContent = sportsbooks.size;
    document.getElementById('sportsbooks-change').textContent = Array.from(sportsbooks).join(', ');
  }

  renderTables() {
    this.renderEVTable();
    this.renderArbTable();
  }

  renderEVTable() {
    const tbody = document.getElementById('ev-table-body');
    const filtered = this.data.evOpportunities.filter(opp => {
      if (this.filters.sport !== 'all' && opp.sport !== this.filters.sport) return false;
      if (opp.ev < this.filters.minEv) return false;
      return true;
    });
    
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            <h3>No +EV opportunities found</h3>
            <p>Try adjusting your filters or check back later</p>
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
        </td>
        <td><strong>${opp.bet}</strong></td>
        <td><span class="sportsbook-logo">${opp.sportsbook}</span></td>
        <td><strong>${this.formatOdds(opp.odds)}</strong></td>
        <td>${(opp.impliedProb * 100).toFixed(1)}%</td>
        <td>${(opp.fairProb * 100).toFixed(1)}%</td>
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
      return true;
    });
    
    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
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

  formatOdds(americanOdds) {
    return americanOdds > 0 ? `+${americanOdds}` : `${americanOdds}`;
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

  showError(message) {
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
    
    evTbody.innerHTML = errorHtml;
    arbTbody.innerHTML = errorHtml.replace('colspan="8"', 'colspan="6"');
  }
}

// Tab switching functionality
function switchTab(evt, tabName) {
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
}

// Initialize analytics when page loads
document.addEventListener('DOMContentLoaded', () => {
  window.analytics = new AnalyticsController();
});