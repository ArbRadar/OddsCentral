// API-based scraper that uses discovered endpoints instead of DOM scraping
console.log('🔧 api-scraper.js loading...');
class APIScraper {
  constructor() {
    this.endpoints = new Map();
    this.activePolling = new Map(); // url -> intervalId
    this.config = {
      method: 'visual', // 'visual', 'api', 'hybrid'
      apiRefreshInterval: 30,
      enableApiDetection: true
    };
  }
  
  async initialize() {
    // Note: Chrome APIs not available in page context, use defaults
    console.log('🔧 API scraper initializing with default config (page context)');
    
    // Load discovered endpoints
    await this.loadEndpoints();
    
    console.log('🚀 API Scraper initialized:', {
      method: this.config.method,
      endpoints: this.endpoints.size,
      refreshInterval: this.config.apiRefreshInterval
    });
  }
  
  async loadEndpoints() {
    try {
      const domain = window.location.hostname;
      console.log(`📡 Requesting endpoints for domain: ${domain}`);
      
      // Request endpoints from content script via postMessage
      window.postMessage({
        type: 'REQUEST_API_ENDPOINTS',
        domain: domain
      }, '*');
      
      // Listen for response
      const endpointListener = (event) => {
        if (event.source === window && event.data.type === 'API_ENDPOINTS_RESPONSE') {
          if (event.data.success && event.data.endpoints.length > 0) {
            event.data.endpoints.forEach(endpoint => {
              const key = `${endpoint.method}:${endpoint.path}`;
              this.endpoints.set(key, endpoint);
            });
            console.log(`📡 Loaded ${event.data.endpoints.length} API endpoints for ${domain}`);
          } else {
            console.log(`📡 No endpoints available for ${domain}`);
          }
          window.removeEventListener('message', endpointListener);
        }
      };
      window.addEventListener('message', endpointListener);
      
    } catch (error) {
      console.error('Error loading endpoints:', error);
    }
  }
  
  // Start API-based scraping
  async startAPIScraping() {
    if (this.endpoints.size === 0) {
      console.log('❌ No API endpoints discovered. Falling back to visual scraping.');
      return false;
    }
    
    console.log('🎯 Starting API-based scraping with', this.endpoints.size, 'endpoints');
    
    // Find odds-related endpoints
    const oddsEndpoints = this.findOddsEndpoints();
    
    if (oddsEndpoints.length === 0) {
      console.log('❌ No odds-related endpoints found. Falling back to visual scraping.');
      return false;
    }
    
    // Start polling each endpoint
    for (const endpoint of oddsEndpoints) {
      this.pollEndpoint(endpoint);
    }
    
    return true;
  }
  
  // Find endpoints that likely contain odds data
  findOddsEndpoints() {
    const oddsPatterns = [
      /odds/i, /lines/i, /markets/i, /events/i, /games/i,
      /betting/i, /prices/i, /moneyline/i, /spread/i, /total/i
    ];
    
    const relevantEndpoints = [];
    
    this.endpoints.forEach((endpoint, key) => {
      const isRelevant = oddsPatterns.some(pattern => 
        pattern.test(endpoint.path) || 
        (endpoint.responseStructure?.patterns?.hasMarkets) ||
        (endpoint.responseStructure?.patterns?.hasEvents)
      );
      
      if (isRelevant) {
        relevantEndpoints.push(endpoint);
      }
    });
    
    console.log(`📊 Found ${relevantEndpoints.length} odds-related endpoints`);
    return relevantEndpoints;
  }
  
  // Poll a specific endpoint
  async pollEndpoint(endpoint) {
    const key = `${endpoint.method}:${endpoint.path}`;
    
    // Clear existing interval if any
    if (this.activePolling.has(key)) {
      clearInterval(this.activePolling.get(key));
    }
    
    // Initial fetch
    await this.fetchEndpoint(endpoint);
    
    // Set up polling
    const intervalId = setInterval(() => {
      this.fetchEndpoint(endpoint);
    }, this.config.apiRefreshInterval * 1000);
    
    this.activePolling.set(key, intervalId);
  }
  
  // Fetch data from endpoint
  async fetchEndpoint(endpoint) {
    try {
      console.log(`🔄 Fetching ${endpoint.method} ${endpoint.path}`);
      
      // Reconstruct full URL
      const url = new URL(endpoint.path, window.location.origin);
      
      // Add query parameters if they exist
      if (endpoint.query) {
        Object.entries(endpoint.query).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }
      
      // Make the request through background script to avoid CORS
      const response = await chrome.runtime.sendMessage({
        type: 'MAKE_API_REQUEST',
        url: url.toString(),
        method: endpoint.method,
        headers: endpoint.headers || {}
      });
      
      if (response.success) {
        console.log(`✅ API data received from ${endpoint.path}`);
        
        // Parse and process the odds data
        const oddsData = this.parseAPIResponse(response.data, endpoint);
        
        if (oddsData.length > 0) {
          // Send to background for storage
          await this.sendOddsData(oddsData);
        }
      } else {
        console.error(`❌ API request failed for ${endpoint.path}:`, response.error);
      }
    } catch (error) {
      console.error('Error fetching endpoint:', error);
    }
  }
  
  // Parse API response into standardized odds format
  parseAPIResponse(data, endpoint) {
    const odds = [];
    
    try {
      // Different parsing strategies based on endpoint structure
      if (data.events && Array.isArray(data.events)) {
        // Common pattern: { events: [...] }
        data.events.forEach(event => {
          const gameOdds = this.parseEvent(event);
          if (gameOdds) odds.push(gameOdds);
        });
      } else if (data.games && Array.isArray(data.games)) {
        // Alternative pattern: { games: [...] }
        data.games.forEach(game => {
          const gameOdds = this.parseGame(game);
          if (gameOdds) odds.push(gameOdds);
        });
      } else if (data.data) {
        // Wrapped response: { data: {...} }
        return this.parseAPIResponse(data.data, endpoint);
      } else if (Array.isArray(data)) {
        // Direct array of events/games
        data.forEach(item => {
          const gameOdds = this.parseEvent(item) || this.parseGame(item);
          if (gameOdds) odds.push(gameOdds);
        });
      }
      
      console.log(`📊 Parsed ${odds.length} games from API response`);
    } catch (error) {
      console.error('Error parsing API response:', error);
    }
    
    return odds;
  }
  
  // Parse individual event/game
  parseEvent(event) {
    try {
      // Extract basic game info
      const gameData = {
        homeTeam: event.homeTeam || event.home || event.team1,
        awayTeam: event.awayTeam || event.away || event.team2,
        startTime: event.startTime || event.gameTime || event.scheduledTime,
        sport: event.sport || this.detectSport(event),
        league: event.league || event.competition,
        markets: []
      };
      
      // Extract markets/odds
      if (event.markets) {
        gameData.markets = this.parseMarkets(event.markets);
      } else if (event.odds) {
        gameData.markets = this.parseOdds(event.odds);
      } else if (event.lines) {
        gameData.markets = this.parseLines(event.lines);
      }
      
      // Only return if we found valid odds
      if (gameData.markets.length > 0 && gameData.homeTeam && gameData.awayTeam) {
        return gameData;
      }
    } catch (error) {
      console.error('Error parsing event:', error);
    }
    
    return null;
  }
  
  // Parse markets array
  parseMarkets(markets) {
    const parsedMarkets = [];
    
    if (Array.isArray(markets)) {
      markets.forEach(market => {
        const marketData = {
          type: this.normalizeMarketType(market.type || market.name),
          outcomes: []
        };
        
        // Parse outcomes
        if (market.outcomes) {
          market.outcomes.forEach(outcome => {
            marketData.outcomes.push({
              name: outcome.name || outcome.team,
              odds: this.normalizeOdds(outcome.odds || outcome.price),
              line: outcome.line || outcome.handicap
            });
          });
        } else if (market.selections) {
          market.selections.forEach(selection => {
            marketData.outcomes.push({
              name: selection.name,
              odds: this.normalizeOdds(selection.price),
              line: selection.line
            });
          });
        }
        
        if (marketData.outcomes.length > 0) {
          parsedMarkets.push(marketData);
        }
      });
    }
    
    return parsedMarkets;
  }
  
  // Normalize market type names
  normalizeMarketType(type) {
    const normalizedType = type.toLowerCase();
    
    if (normalizedType.includes('moneyline') || normalizedType.includes('winner')) {
      return 'moneyline';
    } else if (normalizedType.includes('spread') || normalizedType.includes('handicap')) {
      return 'spread';
    } else if (normalizedType.includes('total') || normalizedType.includes('over')) {
      return 'total';
    }
    
    return type;
  }
  
  // Convert odds to American format if needed
  normalizeOdds(odds) {
    if (typeof odds === 'string') {
      odds = parseFloat(odds);
    }
    
    // If decimal odds (1.5 - 10.0 range), convert to American
    if (odds > 1 && odds < 10) {
      if (odds >= 2) {
        return Math.round((odds - 1) * 100);
      } else {
        return Math.round(-100 / (odds - 1));
      }
    }
    
    return odds;
  }
  
  // Detect sport from event data
  detectSport(event) {
    // Check various fields that might indicate sport
    const sportIndicators = [
      event.sportId,
      event.category,
      event.tournament?.sport,
      event.league?.sport
    ].filter(Boolean);
    
    for (const indicator of sportIndicators) {
      const sport = indicator.toString().toUpperCase();
      if (['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER', 'FOOTBALL'].includes(sport)) {
        return sport;
      }
    }
    
    return 'UNKNOWN';
  }
  
  // Send parsed odds data to background script
  async sendOddsData(oddsData) {
    try {
      const message = {
        type: 'SCRAPED_DATA',
        source: 'api',
        url: window.location.href,
        data: oddsData,
        timestamp: new Date().toISOString()
      };
      
      await chrome.runtime.sendMessage(message);
      console.log(`📤 Sent ${oddsData.length} games to background script`);
    } catch (error) {
      console.error('Error sending odds data:', error);
    }
  }
  
  // Stop API scraping
  stopAPIScraping() {
    console.log('🛑 Stopping API scraping');
    
    // Clear all polling intervals
    this.activePolling.forEach((intervalId, key) => {
      clearInterval(intervalId);
    });
    
    this.activePolling.clear();
  }
  
  // Check if API scraping is available
  isAvailable() {
    return this.endpoints.size > 0 && this.findOddsEndpoints().length > 0;
  }
}

// Export for use in content script
window.APIScraper = APIScraper;
console.log('✅ APIScraper class exported to window.APIScraper');