// Troubleshooting page controller
class TroubleshootController {
  constructor() {
    this.flaggedOpportunities = [];
    this.filters = {
      type: 'all',
      flag: 'all',
      sport: 'all'
    };
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadFlaggedOpportunities();
    
    // Auto-refresh every 30 seconds
    setInterval(() => this.loadFlaggedOpportunities(), 30000);
  }

  setupEventListeners() {
    // Filter changes
    document.getElementById('type-filter').addEventListener('change', (e) => {
      this.filters.type = e.target.value;
      this.renderTable();
    });

    document.getElementById('flag-filter').addEventListener('change', (e) => {
      this.filters.flag = e.target.value;
      this.renderTable();
    });

    document.getElementById('sport-filter').addEventListener('change', (e) => {
      this.filters.sport = e.target.value;
      this.renderTable();
    });

    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
      this.loadFlaggedOpportunities();
    });

    // Row click handler for expandable details
    document.addEventListener('click', (e) => {
      if (e.target.closest('.expandable')) {
        const row = e.target.closest('tr');
        const detailsRow = row.nextElementSibling;
        if (detailsRow && detailsRow.classList.contains('details-row')) {
          detailsRow.classList.toggle('show');
        }
      }
    });
  }

  async loadFlaggedOpportunities() {
    try {
      const response = await chrome.runtime.sendMessage({ 
        type: 'GET_FLAGGED_OPPORTUNITIES' 
      });
      
      if (response && response.success) {
        this.flaggedOpportunities = response.data || [];
        this.updateStats();
        this.updateSportFilter();
        this.renderTable();
        
        document.getElementById('last-updated').textContent = 
          `Last updated: ${new Date().toLocaleTimeString()}`;
      } else {
        console.error('Failed to load flagged opportunities:', response?.error);
        this.showError('Failed to load data');
      }
    } catch (error) {
      console.error('Error loading flagged opportunities:', error);
      this.showError('Connection error');
    }
  }

  updateStats() {
    const stats = {
      total: this.flaggedOpportunities.length,
      rejectedEv: 0,
      suspiciousEv: 0,
      rejectedArb: 0,
      suspiciousArb: 0,
      dataErrors: 0
    };

    this.flaggedOpportunities.forEach((opp, index) => {
      if (opp.type === 'ev') {
        if (opp.flagType === 'rejected') stats.rejectedEv++;
        if (opp.flagType === 'suspicious') stats.suspiciousEv++;
      } else if (opp.type === 'arb') {
        if (opp.flagType === 'rejected') stats.rejectedArb++;
        if (opp.flagType === 'suspicious') stats.suspiciousArb++;
        if (opp.flagType === 'extreme') stats.rejectedArb++; // Also count extreme as rejected for display
      } else if (opp.flagType === 'data-error') {
        stats.dataErrors++;
      }
    });

    document.getElementById('total-flagged').textContent = stats.total;
    document.getElementById('rejected-ev').textContent = stats.rejectedEv;
    document.getElementById('suspicious-arb').textContent = stats.suspiciousArb + stats.rejectedArb; // Combined arb count
    document.getElementById('data-errors').textContent = stats.dataErrors;
  }

  updateSportFilter() {
    const sports = new Set(this.flaggedOpportunities.map(opp => opp.sport).filter(Boolean));
    const sportFilter = document.getElementById('sport-filter');
    
    // Keep current selection if possible
    const currentSelection = sportFilter.value;
    
    sportFilter.innerHTML = '<option value="all">All Sports</option>';
    Array.from(sports).sort().forEach(sport => {
      const option = document.createElement('option');
      option.value = sport;
      option.textContent = sport;
      sportFilter.appendChild(option);
    });
    
    // Restore selection
    if (currentSelection && Array.from(sports).includes(currentSelection)) {
      sportFilter.value = currentSelection;
    }
  }

  renderTable() {
    const tbody = document.getElementById('flagged-table-body');
    
    // Filter opportunities
    const filtered = this.flaggedOpportunities.filter(opp => {
      if (this.filters.type !== 'all' && opp.type !== this.filters.type) return false;
      if (this.filters.flag !== 'all' && opp.flagType !== this.filters.flag) return false;
      if (this.filters.sport !== 'all' && opp.sport !== this.filters.sport) return false;
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <h3>No flagged opportunities found</h3>
            <p>Try adjusting your filters or check back later</p>
          </td>
        </tr>
      `;
      return;
    }

    // Render main rows and detail rows
    tbody.innerHTML = filtered.map((opp, index) => `
      <tr class="expandable">
        <td>
          <span class="flag-badge flag-${opp.flagType}">
            ${this.getFlagLabel(opp.flagType)}
          </span>
        </td>
        <td>
          <div style="font-weight: 500;">${opp.game}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${opp.sport} • ${opp.league || 'Unknown League'}</div>
        </td>
        <td>
          <strong>${opp.type.toUpperCase()}</strong>
          ${opp.bet ? `<br><span style="font-size: 0.875rem;">${opp.bet}</span>` : ''}
          ${opp.type === 'arb' && opp.detailedData?.sideC ? '<br><span style="font-size: 0.75rem; color: #3b82f6;">3-WAY MARKET</span>' : ''}
        </td>
        <td>
          <div style="color: #dc2626; font-weight: 500;">${opp.issue}</div>
          <div style="font-size: 0.75rem; color: #64748b;">${opp.reason}</div>
        </td>
        <td>
          <strong style="font-size: 1.1rem; color: #dc2626;">
            ${opp.type === 'ev' ? `${opp.calculatedValue.toFixed(1)}% EV` : `${opp.calculatedValue.toFixed(1)}% Profit`}
          </strong>
        </td>
        <td>
          <div style="font-size: 0.875rem;">${new Date(opp.timestamp).toLocaleString()}</div>
        </td>
      </tr>
      <tr class="details-row" id="details-${index}">
        <td colspan="6" class="details-content">
          ${this.renderDetailedAnalysis(opp)}
        </td>
      </tr>
    `).join('');
  }

  renderDetailedAnalysis(opp) {
    if (opp.type === 'ev') {
      return this.renderEVAnalysis(opp);
    } else if (opp.type === 'arb') {
      return this.renderArbAnalysis(opp);
    } else {
      return this.renderDataErrorAnalysis(opp);
    }
  }

  renderEVAnalysis(opp) {
    const data = opp.detailedData || {};
    
    return `
      <div class="calculation-details">
        <h3 style="margin-bottom: 1rem;">+EV Calculation Breakdown</h3>
        
        <div class="odds-grid">
          <div class="odds-section">
            <h4>📊 Bookmaker Odds (${opp.sportsbook})</h4>
            <div class="bookmaker-odds">
              <span>Home (${data.homeTeam}):</span>
              <strong>${this.formatOdds(data.bookHomeOdds)}</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Away (${data.awayTeam}):</span>
              <strong>${this.formatOdds(data.bookAwayOdds)}</strong>
            </div>
            ${data.bookDrawOdds ? `
              <div class="bookmaker-odds">
                <span>Draw:</span>
                <strong>${this.formatOdds(data.bookDrawOdds)}</strong>
              </div>
            ` : ''}
          </div>
          
          <div class="odds-section">
            <h4>⚖️ Fair Odds (${data.fairlineSource || 'Calculated'})</h4>
            <div class="bookmaker-odds">
              <span>Home Fair Prob:</span>
              <strong>${(data.fairHomeProb * 100).toFixed(2)}%</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Away Fair Prob:</span>
              <strong>${(data.fairAwayProb * 100).toFixed(2)}%</strong>
            </div>
            ${data.fairDrawProb ? `
              <div class="bookmaker-odds">
                <span>Draw Fair Prob:</span>
                <strong>${(data.fairDrawProb * 100).toFixed(2)}%</strong>
              </div>
            ` : ''}
            <div class="bookmaker-odds" style="border-top: 1px solid #e2e8f0; margin-top: 0.5rem; padding-top: 0.5rem;">
              <span>Total:</span>
              <strong>${((data.fairHomeProb + data.fairAwayProb + (data.fairDrawProb || 0)) * 100).toFixed(2)}%</strong>
            </div>
          </div>
          
          <div class="odds-section">
            <h4>🎯 All Bookmaker Odds</h4>
            <div style="max-height: 200px; overflow-y: auto;">
              ${this.renderAllOdds(data.allOdds)}
            </div>
          </div>
        </div>
        
        <div class="calculation-step">
          <h4>📐 EV Calculation for ${opp.bet}:</h4>
          <div class="formula">
            EV = (Fair Probability × Decimal Odds) - 1
          </div>
          <div>
            Book Odds: <strong>${data.bookOdds}</strong> 
            → Decimal: <strong>${data.decimalOdds?.toFixed(3)}</strong>
            → Implied Prob: <strong>${(data.impliedProb * 100).toFixed(2)}%</strong>
          </div>
          <div>
            Fair Probability: <strong>${(data.fairProb * 100).toFixed(2)}%</strong>
          </div>
          <div class="formula">
            EV = (${data.fairProb?.toFixed(4)} × ${data.decimalOdds?.toFixed(3)}) - 1 = ${((data.fairProb * data.decimalOdds - 1) * 100).toFixed(2)}%
          </div>
        </div>
        
        <div class="calculation-step" style="background: #fee2e2; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <h4 style="color: #991b1b;">⚠️ Why This Was Flagged:</h4>
          <div>${opp.reason}</div>
          ${data.debugInfo ? `
            <div style="margin-top: 0.5rem; font-family: monospace; font-size: 0.75rem;">
              ${data.debugInfo}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  renderArbAnalysis(opp) {
    const data = opp.detailedData || {};
    
    return `
      <div class="calculation-details">
        <h3 style="margin-bottom: 1rem;">Arbitrage Calculation Breakdown</h3>
        
        <div class="odds-grid">
          <div class="odds-section">
            <h4>📊 Side A: ${data.sideA?.bet} @ ${data.sideA?.sportsbook}</h4>
            <div class="bookmaker-odds">
              <span>Odds:</span>
              <strong>${this.formatOdds(data.sideA?.odds)}</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Decimal:</span>
              <strong>${data.sideA?.decimal?.toFixed(3)}</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Implied Prob:</span>
              <strong>${(data.sideA?.impliedProb * 100).toFixed(2)}%</strong>
            </div>
          </div>
          
          <div class="odds-section">
            <h4>📊 Side B: ${data.sideB?.bet} @ ${data.sideB?.sportsbook}</h4>
            <div class="bookmaker-odds">
              <span>Odds:</span>
              <strong>${this.formatOdds(data.sideB?.odds)}</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Decimal:</span>
              <strong>${data.sideB?.decimal?.toFixed(3)}</strong>
            </div>
            <div class="bookmaker-odds">
              <span>Implied Prob:</span>
              <strong>${(data.sideB?.impliedProb * 100).toFixed(2)}%</strong>
            </div>
          </div>
          
          ${data.sideC ? `
            <div class="odds-section">
              <h4>📊 Side C: ${data.sideC?.bet} @ ${data.sideC?.sportsbook}</h4>
              <div class="bookmaker-odds">
                <span>Odds:</span>
                <strong>${this.formatOdds(data.sideC?.odds)}</strong>
              </div>
              <div class="bookmaker-odds">
                <span>Decimal:</span>
                <strong>${data.sideC?.decimal?.toFixed(3)}</strong>
              </div>
              <div class="bookmaker-odds">
                <span>Implied Prob:</span>
                <strong>${(data.sideC?.impliedProb * 100).toFixed(2)}%</strong>
              </div>
            </div>
          ` : ''}
        </div>
        
        <div class="calculation-step">
          <h4>💰 Arbitrage Calculation:</h4>
          <div>
            ${data.sideC ? '3-Way' : '2-Way'} Market Analysis:
          </div>
          
          ${this.renderCalculationMethod(data)}
          
          <div class="formula">
            Total Implied Prob = ${this.renderProbabilityCalculation(data)} = <strong>${(data.totalImpliedProb * 100).toFixed(2)}%</strong>
          </div>
          <div>
            ${data.totalImpliedProb < 1 ? '✅ < 100% = Arbitrage Opportunity!' : '❌ >= 100% = No Arbitrage'}
          </div>
          <div class="formula">
            Profit % = (1 / ${data.totalImpliedProb?.toFixed(4)} - 1) × 100 = ${data.profitPercent?.toFixed(2)}%
          </div>
        </div>
        
        <div class="calculation-step">
          <h4>💵 Optimal Stake Distribution (for $${data.totalStake || 1000}):</h4>
          <div class="formula" style="margin-bottom: 0.5rem;">
            ${data.sideC ? '3-Way' : '2-Way'} Stake Calculation:
          </div>
          <div>📊 <strong>${data.sideA?.bet || 'Side A'}</strong> @ ${data.sideA?.sportsbook}: $${data.stakeA?.toFixed(2)} → Returns $${data.returnA?.toFixed(2)}</div>
          <div>📊 <strong>${data.sideB?.bet || 'Side B'}</strong> @ ${data.sideB?.sportsbook}: $${data.stakeB?.toFixed(2)} → Returns $${data.returnB?.toFixed(2)}</div>
          ${data.sideC ? `<div>📊 <strong>${data.sideC?.bet || 'Side C'}</strong> @ ${data.sideC?.sportsbook}: $${data.stakeC?.toFixed(2)} → Returns $${data.returnC?.toFixed(2)}</div>` : ''}
          <div style="margin-top: 0.5rem; padding: 0.5rem; background: #d1fae5; border-radius: 4px;">
            <strong>🎯 Guaranteed Profit (any outcome): $${data.guaranteedProfit?.toFixed(2)}</strong>
            <div style="font-size: 0.875rem; color: #059669;">ROI: ${((data.guaranteedProfit / (data.totalStake || 1000)) * 100).toFixed(2)}%</div>
          </div>
        </div>
        
        <div class="calculation-step" style="background: #fef3c7; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <h4 style="color: #92400e;">⚠️ Why This Was Flagged:</h4>
          <div>${opp.reason}</div>
        </div>
      </div>
    `;
  }

  renderDataErrorAnalysis(opp) {
    const data = opp.detailedData || {};
    
    return `
      <div class="calculation-details">
        <h3 style="margin-bottom: 1rem;">Data Classification Error</h3>
        
        <div class="calculation-step">
          <h4>🔍 Detected Issues:</h4>
          <div><strong>Sport Classification:</strong> ${data.detectedSport} (Expected: ${data.expectedSport})</div>
          <div><strong>League:</strong> ${data.league}</div>
          <div><strong>Market Type:</strong> ${data.marketType} (${data.outcomes} outcomes)</div>
        </div>
        
        <div class="calculation-step">
          <h4>📊 Team Detection:</h4>
          <div><strong>Home Team:</strong> ${data.homeTeam}</div>
          <div><strong>Away Team:</strong> ${data.awayTeam}</div>
          ${data.hasDrawOutcome ? `<div><strong>Draw Option:</strong> Yes</div>` : ''}
          <div><strong>Team Organization:</strong> ${data.teamOrganization}</div>
        </div>
        
        ${data.oddsStructure ? `
          <div class="calculation-step">
            <h4>💱 Odds Structure:</h4>
            <pre style="background: #1e293b; color: #10b981; padding: 1rem; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(data.oddsStructure, null, 2)}
            </pre>
          </div>
        ` : ''}
        
        <div class="calculation-step" style="background: #ede9fe; padding: 1rem; border-radius: 8px; margin-top: 1rem;">
          <h4 style="color: #5b21b6;">🐛 Root Cause:</h4>
          <div>${opp.reason}</div>
          <div style="margin-top: 0.5rem;">
            <strong>Suggested Fix:</strong> ${data.suggestedFix || 'Review league mapping configuration'}
          </div>
        </div>
      </div>
    `;
  }

  renderAllOdds(allOdds) {
    if (!allOdds || Object.keys(allOdds).length === 0) {
      return '<div style="color: #64748b;">No odds data available</div>';
    }

    return Object.entries(allOdds).map(([bookmaker, odds]) => `
      <div class="bookmaker-odds">
        <span style="font-size: 0.75rem;">${bookmaker}:</span>
        <span style="font-family: monospace;">
          H: ${this.formatOdds(odds.home)} 
          ${odds.draw !== undefined ? `D: ${this.formatOdds(odds.draw)}` : ''} 
          A: ${this.formatOdds(odds.away)}
        </span>
      </div>
    `).join('');
  }

  formatOdds(odds) {
    if (!odds || odds === -11011) return 'N/A';
    if (typeof odds !== 'number') return odds;
    return odds > 0 ? `+${odds}` : `${odds}`;
  }

  getFlagLabel(flagType) {
    const labels = {
      'rejected': 'REJECTED',
      'suspicious': 'SUSPICIOUS',
      'extreme': 'EXTREME',
      'data-error': 'DATA ERROR'
    };
    return labels[flagType] || flagType.toUpperCase();
  }

  renderCalculationMethod(data) {
    if (!data.calculationMethod || !data.usedStoredPercentages) {
      return `<div class="formula">Method: Converting decimal odds to implied probability (legacy)</div>`;
    }
    
    const usedStored = data.usedStoredPercentages;
    const totalSides = data.sideC ? 3 : 2;
    const storedCount = Object.values(usedStored).filter(used => used).length;
    
    if (storedCount === totalSides) {
      return `
        <div class="formula" style="background: #d1fae5; padding: 0.5rem; border-radius: 4px; color: #065f46;">
          ✅ Method: Using stored implied probabilities directly (more accurate)
        </div>
      `;
    } else if (storedCount > 0) {
      return `
        <div class="formula" style="background: #fef3c7; padding: 0.5rem; border-radius: 4px; color: #92400e;">
          ⚠️ Method: Mixed - ${storedCount} stored, ${totalSides - storedCount} calculated from odds
        </div>
      `;
    } else {
      return `
        <div class="formula" style="background: #fee2e2; padding: 0.5rem; border-radius: 4px; color: #991b1b;">
          ⚠️ Method: Converting decimal odds to implied probability (fallback)
        </div>
      `;
    }
  }
  
  renderProbabilityCalculation(data) {
    if (!data.usedStoredPercentages) {
      // Legacy display
      return data.sideC ? 
        `1/${data.sideA?.decimal?.toFixed(3)} + 1/${data.sideB?.decimal?.toFixed(3)} + 1/${data.sideC?.decimal?.toFixed(3)}` :
        `1/${data.sideA?.decimal?.toFixed(3)} + 1/${data.sideB?.decimal?.toFixed(3)}`;
    }
    
    const renderSide = (side, position) => {
      const used = data.usedStoredPercentages[position];
      if (used && side.storedPercent !== null && side.storedPercent !== undefined) {
        return `${side.storedPercent}%`;
      } else {
        return `1/${side.decimal?.toFixed(3)}`;
      }
    };
    
    if (data.sideC) {
      return `${renderSide(data.sideA, 'home')} + ${renderSide(data.sideB, 'away')} + ${renderSide(data.sideC, 'draw')}`;
    } else {
      return `${renderSide(data.sideA, 'home')} + ${renderSide(data.sideB, 'away')}`;
    }
  }

  showError(message) {
    const tbody = document.getElementById('flagged-table-body');
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          <h3 style="color: #dc2626;">Error loading data</h3>
          <p>${message}</p>
        </td>
      </tr>
    `;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new TroubleshootController();
});