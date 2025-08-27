// Wrap entire script in IIFE to allow early returns
(function() {
  'use strict';
  
  // DISABLE VISUAL SCRAPING - Using API-only scraping via Scrapy
  const VISUAL_SCRAPING_ENABLED = false;
  
  // Early exit if visual scraping is disabled
  if (!VISUAL_SCRAPING_ENABLED) {
    console.log('Visual scraping is disabled - using API-only scraping');
    return;
  }
  
  // Check if this is a sportsbook domain we should scrape
  const SPORTSBOOK_DOMAINS = [
    'oddsjam.com',
    'fanduel.com', 
    'draftkings.com',
    'caesars.com',
    'betmgm.com',
    'pointsbet.com',
    'barstoolsportsbook.com',
    'bet365.com',
    'unibet.com',
    'williamhill.com'
  ];
  
  const currentDomain = window.location.hostname.toLowerCase();
  const isSportsbookDomain = SPORTSBOOK_DOMAINS.some(domain => currentDomain.includes(domain));
  
  // Early exit if not on a sportsbook domain
  if (!isSportsbookDomain) {
    return;
  }
  
  // Check if extension context is valid
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      return false;
    }
  }

  // Global flag to track if extension is invalidated
  let extensionInvalidated = false;

  // Early exit if extension context is invalid
  if (!isExtensionContextValid()) {
    console.log('Extension context invalid at load time - not initializing scraper');
    return;
  }

  // Listen for extension context invalidation
  try {
    chrome.runtime.onMessage.addListener(() => {
      // This will throw if context is invalidated
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      extensionInvalidated = true;
      console.log('Extension context invalidated - cleaning up');
      cleanup();
      return;
    }
  }

  // Immediate debug to verify extension is loading
  console.log('🚀🚀🚀 SPORTSBOOK SCRAPER V1.0.6 LOADED 🚀🚀🚀');
  console.log('URL:', window.location.href);
  console.log('Time:', new Date().toISOString());
  console.log('DEBUG: initializeScrapers will run');
  
  // Register this tab with background script immediately
  try {
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_LOADED',
      url: window.location.href,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Failed to register tab with background script:', error);
  }
  
  // Configuration for scraping approach - will be loaded from storage
  let SCRAPING_CONFIG = {
    approach: 'visual', // Default fallback
    apiInterception: true,
    useMultipleTabs: true,
    detectAPIs: true  // Enable API detection
  };
  
  // Load configuration from storage and initialize
  (async () => {
    try {
      console.log('🔧 Loading configuration from storage...');
      const result = await chrome.storage.local.get('scraperConfig');
      if (result.scraperConfig && result.scraperConfig.scrapingStrategy) {
        SCRAPING_CONFIG.approach = result.scraperConfig.scrapingStrategy.method || 'visual';
        console.log('📋 Loaded scraping configuration:', SCRAPING_CONFIG.approach);
      } else {
        console.log('📋 Using default scraping configuration:', SCRAPING_CONFIG.approach);
      }
      
      // Now load API scraper and interceptor if configured
      console.log('🔧 Starting scraper initialization...');
      await initializeScrapers();
    } catch (error) {
      console.error('❌ Failed to load scraping configuration:', error);
      // Still initialize with defaults
      console.log('🔧 Initializing with defaults due to error...');
      await initializeScrapers();
    }
  })();
  
  async function initializeScrapers() {
    console.log('🔧 Initializing scrapers with approach:', SCRAPING_CONFIG.approach);
    
    // Always load API interceptor to detect endpoints, regardless of mode
    // This prevents endpoint discovery from breaking when switching modes
    if (true) { // Always load for endpoint discovery
      // Try loading API scraper with different approach
    console.log('💡 Attempting to load API scraper...');
    
    // Simple approach: just load the script
    const script1 = document.createElement('script');
    script1.src = chrome.runtime.getURL('api-scraper.js');
    script1.async = true;
    document.head.appendChild(script1);
    console.log('📄 API scraper script injected');
    
    // Then load API interceptor
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('api-interceptor.js');
    script.onload = function() {
      console.log('API interceptor injected into page context');
    };
    script.onerror = function() {
      console.error('Failed to load API interceptor');
    };
    
    // Need to inject early before page makes requests
    if (document.head) {
      document.head.appendChild(script);
    } else {
      // If head not ready, wait for it
      const observer = new MutationObserver((mutations, obs) => {
        if (document.head) {
          document.head.appendChild(script);
          obs.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    }
    
    // Set up message passing from page context to content script
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      if (event.data.type === 'API_ENDPOINT_CAPTURED') {
        console.log('Forwarding API capture to background:', event.data);
        // Forward to background script
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage(event.data);
        }
      } else if (event.data.type === 'REQUEST_API_ENDPOINTS') {
        console.log('API scraper requesting endpoints for:', event.data.domain);
        // Request endpoints from background script
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'GET_DISCOVERED_ENDPOINTS',
            domain: event.data.domain
          }).then(response => {
            // Forward response back to page context
            window.postMessage({
              type: 'API_ENDPOINTS_RESPONSE',
              success: response?.success || false,
              endpoints: response?.endpoints || []
            }, '*');
          }).catch(error => {
            console.error('Error getting endpoints:', error);
            window.postMessage({
              type: 'API_ENDPOINTS_RESPONSE',
              success: false,
              endpoints: []
            }, '*');
          });
        }
      }
    });
    } // End of if statement for loading API scripts
    
    // Simple initialization for API/hybrid modes
    if (SCRAPING_CONFIG.approach === 'api' || SCRAPING_CONFIG.approach === 'hybrid') {
      console.log('⏳ API mode enabled - checking for APIScraper in 2 seconds...');
      setTimeout(() => {
        // Direct check without CSP violation
        console.log('🧪 API test:', typeof window.APIScraper);
        if (typeof window.APIScraper !== 'undefined') {
          console.log('✅ APIScraper is available');
        } else {
          console.log('⚠️ APIScraper not available');
        }
      }, 2000);
    }
  } // End of initializeScrapers function
  
  // Initialize API scraper instance variables
  let apiScraper = null;
  let apiScraperAvailable = false;

// Configuration moved inline since content scripts don't support ES6 imports
const SPORT_CONFIGS = {
  BASEBALL: {
    displayName: 'Baseball',
    terminology: {
      score: 'runs',
      period: 'inning',
      periods: 'innings'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      runline: {
        name: 'Run Line',
        outcomes: 2,
        description: 'Point spread for baseball'
      },
      total: {
        name: 'Total Runs',
        outcomes: 2,
        description: 'Over/Under total runs scored'
      }
    }
  },
  FOOTBALL: {
    displayName: 'American Football',
    terminology: {
      score: 'points',
      period: 'quarter',
      periods: 'quarters'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      spread: {
        name: 'Point Spread',
        outcomes: 2,
        description: 'Point spread betting'
      },
      total: {
        name: 'Total Points',
        outcomes: 2,
        description: 'Over/Under total points scored'
      }
    }
  },
  BASKETBALL: {
    displayName: 'Basketball',
    terminology: {
      score: 'points',
      period: 'quarter',
      periods: 'quarters'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      spread: {
        name: 'Point Spread',
        outcomes: 2,
        description: 'Point spread betting'
      },
      total: {
        name: 'Total Points',
        outcomes: 2,
        description: 'Over/Under total points scored'
      }
    }
  },
  HOCKEY: {
    displayName: 'Hockey',
    terminology: {
      score: 'goals',
      period: 'period',
      periods: 'periods'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      spread: {
        name: 'Puck Line',
        outcomes: 2,
        description: 'Point spread for hockey'
      },
      total: {
        name: 'Total Goals',
        outcomes: 2,
        description: 'Over/Under total goals scored'
      }
    }
  },
  SOCCER: {
    displayName: 'Soccer',
    terminology: {
      score: 'goals',
      period: 'half',
      periods: 'halves'
    },
    markets: {
      moneyline: {
        name: '1X2',
        outcomes: 3,
        description: 'Win/Draw/Win betting'
      },
      total: {
        name: 'Total Goals',
        outcomes: 2,
        description: 'Over/Under total goals scored'
      }
    }
  }
};

const LAYOUT_CONFIGS = {
  // OddsJam AG Grid layout (current)
  oddsjam_aggrid: {
    name: 'OddsJam AG Grid',
    urlPatterns: ['oddsjam.com'],
    selectors: {
      grid: {
        root: 'div.ag-root',
        rows: 'div[role="row"]',
        cell: 'div.ag-cell',
        containers: {
          left: '.ag-pinned-left-cols-container',
          center: '.ag-center-cols-container, .ag-body-viewport',
          right: '.ag-pinned-right-cols-container'
        }
      },
      columns: {
        startTime: '[col-id="startTime"]',
        rotationNumber: '[col-id="rotationNumber"]',
        teamName: '[col-id="teamName"]',
        bestPrice: '[col-id="bestPrice"]',
        averagePrice: '[col-id="averagePrice"]'
      },
      elements: {
        teamText: 'p.text-inherit.__className_19640c.truncate.text-sm.font-medium',
        rotationText: 'p.text-inherit.__className_15aff7.text-center.text-sm.font-bold',
        oddsText: 'p.__className_15aff7.text-sm.w-full.text-center.font-semibold.text-brand-gray-9',
        gameLink: 'a[href^="/game/"]'
      }
    },
    features: {
      multiContainer: true,
      dynamicColumns: true,
      bestOdds: true,
      averageOdds: true,
      rotationNumbers: true
    }
  },
  
  // Generic table layout for other sportsbooks
  generic_table: {
    name: 'Generic Table',
    urlPatterns: ['*'],
    selectors: {
      grid: {
        root: 'table, .table, [role="table"]',
        rows: 'tr, [role="row"]',
        cell: 'td, th, [role="cell"]'
      },
      columns: {
        startTime: '.time, .start-time, [data-col="time"]',
        teamName: '.teams, .team-name, [data-col="teams"]',
        bestPrice: '.best, .best-odds, [data-col="best"]',
        averagePrice: '.avg, .average, [data-col="average"]'
      },
      elements: {
        teamText: 'span, div, p',
        oddsText: 'span, div, p',
        gameLink: 'a'
      }
    },
    features: {
      multiContainer: false,
      dynamicColumns: false,
      bestOdds: false,
      averageOdds: false,
      rotationNumbers: false
    }
  }
};

// Current layout configuration
let currentLayout = null;
let currentSportConfig = null;

let lastDataHash = '';
let observer = null;
let scrapeInterval = null;
let fullRefreshInterval = null;

// Detect and configure layout based on current page
function detectLayout() {
  const currentUrl = window.location.href;
  
  // Try to match URL patterns to layout configs
  for (const [layoutKey, config] of Object.entries(LAYOUT_CONFIGS)) {
    for (const pattern of config.urlPatterns) {
      if (pattern === '*' || currentUrl.includes(pattern)) {
        console.log(`Detected layout: ${config.name} for URL: ${currentUrl}`);
        currentLayout = config;
        return config;
      }
    }
  }
  
  // Default to OddsJam layout
  console.log(`No specific layout detected, using default OddsJam layout`);
  currentLayout = LAYOUT_CONFIGS.oddsjam_aggrid;
  return currentLayout;
}

// Detect sport and market configuration
function detectSportConfig(url, marketHints = {}, teamNames = []) {
  let sport = 'BASEBALL'; // Default sport (NOT league)
  let league = 'MLB'; // Default league
  let market = 'moneyline'; // Default market
  
  // First try to detect from URL patterns with comprehensive league mapping
  const urlPath = url.toLowerCase();
  
  // Baseball leagues
  if (urlPath.includes('/mlb/') || urlPath.includes('baseball')) {
    sport = 'BASEBALL';
    league = 'MLB';
  }
  // Football leagues  
  else if (urlPath.includes('/nfl/') || urlPath.includes('_nfl_') || urlPath.includes('american_football')) {
    sport = 'FOOTBALL';
    league = 'NFL';
  }
  // Basketball leagues
  else if (urlPath.includes('/nba/') || urlPath.includes('_nba_') || urlPath.includes('basketball')) {
    sport = 'BASKETBALL';
    league = 'NBA';
  }
  // Hockey leagues
  else if (urlPath.includes('/nhl/') || urlPath.includes('_nhl_') || urlPath.includes('hockey')) {
    sport = 'HOCKEY';
    league = 'NHL';
  }
  // Soccer leagues (comprehensive mapping)
  else if (urlPath.includes('brazil_serie') || urlPath.includes('argentina_primera') || 
           urlPath.includes('premier_league') || urlPath.includes('la_liga') || 
           urlPath.includes('bundesliga') || urlPath.includes('serie_a') || 
           urlPath.includes('ligue_1') || urlPath.includes('champions_league') || 
           urlPath.includes('europa_league') || urlPath.includes('world_cup') ||
           urlPath.includes('copa_america') || urlPath.includes('euros') ||
           urlPath.includes('mls') || urlPath.includes('usl') ||
           urlPath.includes('eredivisie') || urlPath.includes('primeira_liga') ||
           urlPath.includes('scottish_premiership') || urlPath.includes('jupiler_pro') ||
           urlPath.includes('liga_mx') || urlPath.includes('copa_libertadores') ||
           urlPath.includes('concacaf') || urlPath.includes('fifa') ||
           urlPath.includes('euro_2024') || urlPath.includes('conmebol') ||
           urlPath.includes('/soccer/') || urlPath.includes('/football/')) {
    sport = 'SOCCER';
    
    // Extract specific league from URL
    if (urlPath.includes('brazil_serie_a')) league = 'Brazil - Serie A';
    else if (urlPath.includes('brazil_serie_b')) league = 'Brazil - Serie B'; 
    else if (urlPath.includes('argentina_primera')) league = 'Argentina - Primera Division';
    else if (urlPath.includes('premier_league')) league = 'England - Premier League';
    else if (urlPath.includes('la_liga')) league = 'Spain - La Liga';
    else if (urlPath.includes('bundesliga')) league = 'Germany - Bundesliga';
    else if (urlPath.includes('serie_a')) league = 'Italy - Serie A';
    else if (urlPath.includes('ligue_1')) league = 'France - Ligue 1';
    else if (urlPath.includes('mls')) league = 'MLS';
    else if (urlPath.includes('champions_league')) league = 'UEFA Champions League';
    else if (urlPath.includes('europa_league')) league = 'UEFA Europa League';
    else league = 'Soccer'; // Generic fallback
  }
  // Prediction markets
  else if (url.includes('polymarket.com')) {
    sport = 'Prediction Markets';
    league = 'Polymarket';
    market = 'binary';
    console.log('Detected Polymarket prediction market');
  }
  // Fallback: detect soccer from team names
  else if (teamNames.length > 0) {
    const soccerIndicators = [
      'FC', 'CF', 'SC', 'EC', 'AF', 'FBC', // Common soccer suffixes
      'Clube', 'Grêmio', 'Atlético', 'Chapecoense', 'Criciuma', 'Coritiba', 
      'América', 'Goiás', 'Athletico', 'Paranaense', 'Regatas', 'Operário',
      'Ferroviário', 'Paysandu', 'Volta Redonda', 'Ferroviaria', 'Goianiense',
      'Cuiabá', 'Vila Nova', 'Botafogo', 'Ribeirão', 'Amazonas', 'Avai',
      // Additional Argentine/Brazilian indicators from our database
      'Defensa y Justicia', 'CSD', 'CS', 'CA', 'Independiente', 'Instituto',
      'Newell', 'Old Boys', 'Talleres', 'Córdoba', 'Gimnasia', 'Esgrima',
      'Huracán', 'Racing Club', 'Avellaneda', 'Banfield', 'Platense',
      'Sarmiento', 'Vélez Sarsfield', 'Central Córdoba', 'Santiago del Estero',
      'Aldosivi', 'River Plate', 'Barracas Central', 'Tigre', 'San Lorenzo',
      'Almagro', 'San Martin'
    ];
    
    const teamText = teamNames.join(' ');
    if (soccerIndicators.some(indicator => teamText.includes(indicator))) {
      sport = 'SOCCER';
      league = 'International Soccer';
      console.log('Detected SOCCER based on team names:', teamNames);
    }
  }
  
  // Detect market type from URL
  if (url.includes('moneyline')) {
    market = 'moneyline';
  } else if (url.includes('spread') || url.includes('runline')) {
    market = sport === 'BASEBALL' ? 'runline' : 'spread';
  } else if (url.includes('total') || url.includes('over-under')) {
    market = 'total';
  }
  
  // Use corrected sport names for config lookup
  const sportConfig = SPORT_CONFIGS[sport];
  if (sportConfig && sportConfig.markets[market]) {
    currentSportConfig = { 
      sport, 
      league,
      market, 
      config: sportConfig,
      marketConfig: sportConfig.markets[market]
    };
    console.log(`Detected sport: ${sport}, league: ${league}, market: ${market}, outcomes: ${sportConfig.markets[market].outcomes}`);
    return currentSportConfig;
  }
  
  // Default fallback
  currentSportConfig = {
    sport: 'BASEBALL',
    league: 'MLB',
    market: 'moneyline',
    config: SPORT_CONFIGS.BASEBALL,
    marketConfig: SPORT_CONFIGS.BASEBALL.markets.moneyline
  };
  return currentSportConfig;
}

// Get current selectors based on detected layout
function getSelectors() {
  if (!currentLayout) {
    detectLayout();
  }
  return currentLayout.selectors;
}

// Generate hash of data for change detection (excluding timestamps and volatile fields)
function generateDataHash(data) {
  // Create a deep copy and remove volatile fields that always change
  const dataForHashing = JSON.parse(JSON.stringify(data));
  
  // Remove timestamp fields that change on every scrape
  delete dataForHashing.timestamp;
  delete dataForHashing.scrapedAt;
  
  // Remove timestamps from individual games
  if (dataForHashing.games) {
    dataForHashing.games.forEach(game => {
      delete game.timestamp;
      delete game.scrapedAt;
    });
  }
  
  // Create stable hash focusing only on actual odds and game data
  const stableData = {
    gameCount: dataForHashing.games ? dataForHashing.games.length : 0,
    sport: dataForHashing.sport,
    league: dataForHashing.league,
    url: dataForHashing.url,
    games: dataForHashing.games ? dataForHashing.games.map(game => ({
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      startTime: game.startTime,
      gameStatus: game.gameStatus,
      odds: game.odds, // This is the key data we care about
      bestHomeOdds: game.bestHomeOdds,
      bestAwayOdds: game.bestAwayOdds,
      avgHomeOdds: game.avgHomeOdds,
      avgAwayOdds: game.avgAwayOdds
    })) : []
  };
  
  return JSON.stringify(stableData);
}

// Helper function to properly organize teams for 3-way markets
function organizeTeams(teams) {
  console.log(`🔍 organizeTeams: input teams=`, teams.map(t => t.name));
  
  // Find draw team
  const drawIndex = teams.findIndex(t => t.name === 'Draw' || t.name?.toLowerCase() === 'draw');
  
  if (drawIndex !== -1 && teams.length >= 3) {
    // This is a 3-way market - reorganize so teams are in correct positions
    const actualTeams = teams.filter((t, i) => i !== drawIndex);
    const drawTeam = teams[drawIndex];
    
    console.log(`🔍 organizeTeams: Found Draw at position ${drawIndex}, organizing as 3-way`);
    console.log(`🔍 organizeTeams: Actual teams:`, actualTeams.map(t => t.name));
    
    // Return organized teams: [home, draw, away]
    return [
      actualTeams[0] || { name: 'Unknown Team 1', rotation: null },
      drawTeam,
      actualTeams[1] || { name: 'Unknown Team 2', rotation: null }
    ];
  }
  
  console.log(`🔍 organizeTeams: No Draw found, returning teams as-is`);
  return teams;
}

// Helper function to get away team based on market type
function getAwayTeam(teams, outcomes) {
  console.log(`🔍 getAwayTeam: outcomes=${outcomes}, teams.length=${teams.length}`);
  console.log(`🔍 getAwayTeam: teams=`, teams.map(t => t.name));
  
  // Check if we have a Draw team (indicates 3-way market)
  const hasDrawTeam = teams.some(t => t.name === 'Draw' || t.name?.toLowerCase() === 'draw');
  
  if ((outcomes === 3 || hasDrawTeam) && teams.length >= 3) {
    // Organize teams properly for 3-way market
    const organized = organizeTeams(teams);
    console.log(`🔍 getAwayTeam: Organized teams:`, organized.map(t => t.name));
    console.log(`🔍 getAwayTeam: Using 3-way logic, returning organized[2]: "${organized[2]?.name}"`);
    return organized[2]?.name || 'Unknown Team 2';
  } else if (teams.length >= 2) {
    // 2-way market: teams[0] = home, teams[1] = away
    console.log(`🔍 getAwayTeam: Using 2-way logic, returning teams[1]: "${teams[1]?.name}"`);
    return teams[1]?.name || 'Unknown Team 2';
  }
  console.log(`🔍 getAwayTeam: Fallback to Unknown Team 2`);
  return 'Unknown Team 2';
}

// Helper function to get away team rotation
function getAwayTeamRotation(teams, outcomes) {
  // Check if we have a Draw team (indicates 3-way market)
  const hasDrawTeam = teams.some(t => t.name === 'Draw' || t.name?.toLowerCase() === 'draw');
  
  if ((outcomes === 3 || hasDrawTeam) && teams.length >= 3) {
    // 3-way market: organize teams and get away rotation
    const organized = organizeTeams(teams);
    return organized[2]?.rotation;
  } else if (teams.length >= 2) {
    // 2-way market: teams[0] = home, teams[1] = away
    return teams[1]?.rotation;
  }
  return null;
}

// Extract league from the combobox selector
function extractLeagueFromSelector() {
  // Try multiple possible selectors for the league combobox based on actual HTML structure
  // The league selector is the first combobox in the toolbar, so we need to be more specific
  const selectors = [
    // Most specific: Exact placeholder match for Argentina page
    'input[placeholder="Argentina - Primera Division"]',
    // More specific: Look for league-like placeholders first
    'input[placeholder*="Primera Division"]',
    'input[placeholder*="Argentina"]', 
    'input[placeholder*="Division"]',
    'input[placeholder*="Liga"]',
    'input[placeholder*="League"]',
    'input[placeholder*="Championship"]',
    'input[placeholder*="Cup"]',
    'input[placeholder*="Premier"]',
    'input[placeholder*="Bundesliga"]',
    'input[placeholder*="Serie"]',
    'input[placeholder*="MLB"]',
    'input[placeholder*="NFL"]',
    'input[placeholder*="NBA"]',
    // Structural selectors - find the first combobox in the toolbar
    '.dark-scroll input[role="combobox"]:first-of-type',
    'div.py-2:first-of-type input[role="combobox"]',
    // General fallbacks
    'input[id*="headlessui-combobox-input"]',
    'input[role="combobox"]'
  ];
  
  console.log('🏆 Searching for league selector...');
  
  for (const selector of selectors) {
    const inputs = document.querySelectorAll(selector);
    console.log(`🏆 Selector "${selector}" found ${inputs.length} elements`);
    
    // For the first few specific placeholder selectors, return immediately if found
    if (selector.includes('placeholder') && inputs.length > 0) {
      const input = inputs[0]; // Take the first match
      const placeholder = input.getAttribute('placeholder') || '';
      const value = input.value || '';
      const leagueText = value || placeholder;
      
      console.log(`🏆   Specific placeholder match: "${leagueText}"`);
      if (leagueText && leagueText.trim().length > 0) {
        console.log(`🏆 ✅ Found league selector via placeholder: "${leagueText}" using selector: ${selector}`);
        return leagueText.trim();
      }
    }
    
    // For structural selectors, examine each input
    for (const input of inputs) {
      const placeholder = input.getAttribute('placeholder') || '';
      const value = input.value || '';
      const leagueText = value || placeholder;
      
      console.log(`🏆   Element: placeholder="${placeholder}", value="${value}"`);
      
      if (leagueText && leagueText.trim().length > 0 && leagueText !== 'Search...') {
        // Skip obvious non-league selectors
        const skipPatterns = ['MX', 'US', 'CA', 'AU', 'UK', 'DE', 'FR', 'ES', 'IT', 'Moneyline', 'Games', 'All'];
        if (skipPatterns.includes(leagueText.trim())) {
          console.log(`🏆   Skipping non-league selector: "${leagueText}"`);
          continue;
        }
        
        // For structural selectors (like .dark-scroll), prefer the first valid element
        if (selector.includes('dark-scroll') || selector.includes('py-2')) {
          console.log(`🏆 ✅ Found league selector via structure: "${leagueText}" using selector: ${selector}`);
          return leagueText.trim();
        }
        
        // For general selectors, check if it looks like a league
        const leagueLower = leagueText.toLowerCase();
        const isLikelyLeague = leagueLower.includes('division') || leagueLower.includes('league') || 
                              leagueLower.includes('liga') || leagueLower.includes('cup') ||
                              leagueLower.includes('mlb') || leagueLower.includes('nfl') || 
                              leagueLower.includes('nba') || leagueLower.includes('argentina') ||
                              leagueLower.includes('primera') || leagueLower.includes('premier') ||
                              leagueLower.includes('bundesliga') || leagueLower.includes('serie') ||
                              leagueLower.includes('championship') || leagueLower.includes('ligue');
        
        if (isLikelyLeague) {
          console.log(`🏆 ✅ Found league selector: "${leagueText}" using selector: ${selector}`);
          return leagueText.trim();
        } else {
          console.log(`🏆   Found element but doesn't look like a league: "${leagueText}"`);
        }
      }
    }
  }
  
  // Fallback: if no obvious league found, try any non-country element
  console.log(`🏆 No obvious league found, trying any non-country element...`);
  for (const selector of selectors) {
    const inputs = document.querySelectorAll(selector);
    for (const input of inputs) {
      const placeholder = input.getAttribute('placeholder') || '';
      const value = input.value || '';
      const leagueText = value || placeholder;
      
      if (leagueText && leagueText.trim().length > 0 && leagueText !== 'Search...') {
        const skipPatterns = ['MX', 'US', 'CA', 'AU', 'UK', 'DE', 'FR', 'ES', 'IT'];
        if (!skipPatterns.includes(leagueText.trim())) {
          console.log(`🏆 ✅ Using fallback league selector: "${leagueText}" using selector: ${selector}`);
          return leagueText.trim();
        }
      }
    }
  }
  
  // Additional debugging: check all combobox elements
  const allComboboxes = document.querySelectorAll('[role="combobox"]');
  console.log(`🏆 Total combobox elements found: ${allComboboxes.length}`);
  allComboboxes.forEach((el, index) => {
    console.log(`🏆   Combobox ${index}:`, {
      placeholder: el.getAttribute('placeholder'),
      value: el.value,
      id: el.id,
      classList: el.className
    });
  });
  
  console.log('🏆 ❌ No valid league selector found, falling back to URL detection');
  return null;
}

// Map leagues to sports based on the complete league list provided
// Global variable to store current league mappings
let currentLeagueMappings = null;

// Load league mappings from background script
async function loadLeagueMappings() {
  if (!isExtensionContextValid()) {
    console.log('Extension context invalid - using fallback mappings');
    return getDefaultLeagueMappings();
  }
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_LEAGUE_MAPPINGS' });
    if (response && response.success) {
      currentLeagueMappings = response.mappings;
      console.log('🏆 League mappings loaded from storage');
      return currentLeagueMappings;
    } else {
      console.warn('Failed to load league mappings, using defaults');
      return getDefaultLeagueMappings();
    }
  } catch (error) {
    console.error('Error loading league mappings:', error);
    return getDefaultLeagueMappings();
  }
}

// Default league mappings as fallback
function getDefaultLeagueMappings() {
  return {
    // SOCCER (3-way markets) - All soccer leagues from the list
    'SOCCER': [
      // UEFA & FIFA competitions
      'uefa european championship', 'uefa european championship women', 'fifa world cup', 'afc champions league',
      'uefa champions league', 'uefa champions league women', 'uefa europa conference league', 'uefa europa league',
      'uefa nations league', 'uefa super cup', 'fifa club world cup', 'fifa world cup qualifiers', 'fifa world cup women',
      'concacaf gold cup', 'concacaf nations league', 'conmebol copa america', 'conmebol copa libertadores', 'conmebol copa sudamericana',
      
      // Argentina
      'argentina copa argentina', 'argentina primera division', 'argentina primera nacional',
      
      // Australia  
      'australia a league', 'australia capital', 'australia northern', 'australia queensland', 'australia queensland premier league',
      'australia south australia', 'australia tasmania', 'australia victoria', 'australia victoria premier league', 'australia cup',
      
      // Europe
      'austria bundesliga', 'belarus premier league', 'belgium cup', 'belgium jupiler pro league',
      'croatia hnl', 'czech republic first league', 'czech republic superliga', 'denmark division', 'denmark superisligaen',
      'england championship', 'england community shield', 'efl cup', 'efl trophy', 'fa cup', 'fa league',
      'england national league', 'england premier league', 'estonia esiliiga', 'estonia meistriliiga women',
      'finland suomen cup', 'finland veikkausliiga', 'finland ykkonen', 'finland ykkosliiga',
      'france ligue 1', 'france ligue 2', 'france super cup', 'germany bundesliga', 'germany bundesliga 2',
      'greece super league', 'hungary', 'ireland premier league', 'ireland division',
      'israel premier league', 'israel cup', 'italy serie a', 'italy serie b', 'italy serie c',
      'latvia virsliga', 'lithuania a lyga', 'netherlands eredivisie', 'netherlands eerste divisie',
      'norway divisjon', 'norway eliteserien', 'poland cup', 'poland ekstraklasa', 'poland i liga',
      'portugal primeira liga', 'portugal segunda liga', 'romania liga i', 'russia premier league', 'russia second league',
      'scotland championship', 'scotland premiership', 'serbia super liga', 'spain copa del rey', 'spain la liga',
      'sweden allsvenskan', 'sweden superettan', 'sweden ettan', 'switzerland challenge league', 'switzerland super league',
      'turkey cup', 'turkey super lig', 'ukraine premier league',
      
      // Americas
      'brazil baiano', 'brazil copa brasil', 'brazil gaucho', 'brazil serie a', 'brazil serie b', 'brazil serie c',
      'chile cup', 'chile primera division', 'colombia primera', 'ecuador serie a', 'ecuador serie b',
      'guatemala liga nacional', 'guatemala primera division', 'mexico liga mx', 'mexico liga expansion',
      'peru primera division', 'peru segunda division', 'uruguay primera division', 'uruguay segunda division',
      'venezuela copa venezuela', 'usa major league soccer', 'mls next pro', 'usl championship', 'usl league one', 'usl league two',
      'north america leagues cup',
      
      // Asia & Africa  
      'china league one', 'china league two', 'china super league', 'india calcutta premier division', 'india super league',
      'iraq stars league', 'japan j league 1', 'japan j league 2', 'japan j league 3',
      'kazakhstan first division', 'kazakhstan premier league', 'korea k league 1', 'korea k league 2',
      'malaysia super league', 'singapore premier league', 'vietnam v league',
      'egypt premier league', 'egypt second division', 'ethiopia premier league', 'kenya super league',
      'saudi arabia division', 'saudi arabia saudi league', 'zimbabwe premier league',
      
      // Other regions
      'uzbekistan professional league', 'uzbekistan super league', 'international club friendlies',
      'olympics soccer men', 'olympics soccer women', 'caf africa cup of nations', 'caf african nations championship',
      'cosafa cup', 'bulgaria parva liga', 'paraguay primera division', 'puerto rico superliga'
    ],
    
    // BASEBALL (2-way markets)
    'BASEBALL': [
      'baseball', 'mlb all star', 'mlb world baseball classic', 'mlb mexico', 'baseball england', 'baseball cpbl', 'baseball kbo', 'baseball npb', 'mlb'
    ],
    
    // BASKETBALL (2-way markets) 
    'BASKETBALL': [
      'basketball women', 'olympics basketball men', 'olympics basketball women', 'usa unrivaled', 'fiba world cup',
      'wnba all star', 'lnb pro', 'lega basket serie', 'korea kbl league', 'korea kbl cup', 'korea kbl mexico',
      'new zealand nbl', 'leb oro', 'nba all star', 'nba summer league', 'nba eurocup', 'nba eurocup women',
      'nba euroleague', 'fiba afrobasket', 'fiba asia cup', 'fiba americup', 'fiba eurobasket', 'fiba eurobasket women',
      'australia nbl', 'china cba', 'ncaa basketball', 'big east', 'nba'
    ],
    
    // AMERICAN FOOTBALL (2-way markets)
    'FOOTBALL': [
      'nfl', 'american football', 'ncaa football'
    ],
    
    // MMA/COMBAT SPORTS (2-way markets)
    'UFC': [
      'ufc', 'mma', 'pfl', 'boxing super lightweight', 'boxing lightweight', 'boxing heavyweight',
      'boxing cruiserweight', 'boxing welterweight', 'boxing matches', 'boxing catchweight'
    ],
    
    // HOCKEY (2-way markets)
    'HOCKEY': [
      'hockey champions hockey league', 'czech republic extraliga', 'russia khl', 'france ligue magnus',
      'iihf world championship', 'finland sm liiga', 'denmark superisligaen', 'usa nations faceoff', 'nhl'
    ],
    
    // TENNIS (2-way markets)
    'TENNIS': [
      'tennis', 'atp', 'wta'
    ],
    
    // OTHER SPORTS (2-way markets)
    'GOLF': ['golf dp world tour', 'golf korn ferry tour', 'golf lpga', 'golf pga', 'golf liv'],
    'CRICKET': ['cricket asia cup', 'cricket big bash league', 'cricket county championship', 'cricket hundred', 'cricket ipl', 'cricket world cup'],
    'DARTS': ['darts pdc world championship', 'darts modus super series'],
    'SNOOKER': ['snooker world championship', 'snooker masters'],
    'RUGBY': ['rugby league', 'rugby union'],
    'CYCLING': ['cycling tour de france', 'cycling vuelta espana', 'olympics cycling'],
    'MOTORSPORTS': ['formula 1', 'nascar cup series', 'nascar xfinity series', 'nascar truck series']
  };
}

async function mapLeagueToSport(leagueText) {
  if (!leagueText) return { sport: 'BASEBALL', league: 'MLB', outcomes: 2 }; // Default fallback
  
  const leagueLower = leagueText.toLowerCase();
  
  // Ensure we have league mappings loaded
  const leagueMappings = currentLeagueMappings || await loadLeagueMappings();
  
  // Check each sport category
  for (const [sport, leagues] of Object.entries(leagueMappings)) {
    if (leagues.some(league => leagueLower.includes(league.toLowerCase()))) {
      const outcomes = sport === 'SOCCER' ? 3 : 2;
      
      // Determine league name
      let leagueName = leagueText;
      if (sport === 'BASEBALL' && leagueLower.includes('mlb')) {
        leagueName = 'MLB';
      } else if (sport === 'FOOTBALL' && leagueLower.includes('nfl')) {
        leagueName = 'NFL';  
      } else if (sport === 'BASKETBALL' && leagueLower.includes('nba')) {
        leagueName = 'NBA';
      } else if (sport === 'HOCKEY' && leagueLower.includes('nhl')) {
        leagueName = 'NHL';
      }
      
      console.log(`🏆 Detected ${sport} from league: "${leagueText}"`);
      return { sport: sport, league: leagueName, outcomes: outcomes };
    }
  }
  
  // Additional keyword-based detection for missed cases
  if (leagueLower.includes('soccer') || leagueLower.includes('football') || leagueLower.includes('copa') || 
      leagueLower.includes('liga') || leagueLower.includes('primera') || leagueLower.includes('division')) {
    console.log(`🏆 Detected SOCCER from keywords in: "${leagueText}"`);
    return { sport: 'SOCCER', league: leagueText, outcomes: 3 };
  }
  
  console.log(`🏆 Unknown league: "${leagueText}", defaulting to BASEBALL`);
  return { sport: 'BASEBALL', league: 'MLB', outcomes: 2 };
}

// Extract sport and league from URL and page selectors
async function extractSportLeague(url) {
  console.log(`🏆 === SPORT DETECTION START for URL: ${url} ===`);
  
  // First try to get league from the selector
  const leagueText = extractLeagueFromSelector();
  
  if (leagueText) {
    const leagueMapping = await mapLeagueToSport(leagueText);
    const sport = leagueMapping.sport;
    const outcomes = leagueMapping.outcomes;
    
    const sportConfig = SPORT_CONFIGS[sport];
    const market = 'moneyline'; // Default market type
    
    if (sportConfig && sportConfig.markets[market]) {
      // Override outcomes from league detection
      const marketConfig = { ...sportConfig.markets[market], outcomes: outcomes };
      
      console.log(`🏆 ✅ SUCCESS: ${sport} (${outcomes} outcomes) from league: "${leagueText}"`);
      
      return { 
        sport: sport, 
        league: leagueText,
        betType: marketConfig.name,
        marketType: market,
        outcomes: outcomes,
        terminology: sportConfig.terminology
      };
    }
  }
  
  // Enhanced URL pattern detection as fallback
  console.log('🏆 League selector failed, trying enhanced URL detection...');
  
  // Check URL for sport patterns
  let sport = 'BASEBALL'; // Default
  let league = 'MLB'; // Default  
  let outcomes = 2;
  
  if (url.includes('soccer') || url.includes('football') || url.includes('primera') || url.includes('liga') || 
      url.includes('argentina') || url.includes('champions') || url.includes('europa') || url.includes('bundesliga')) {
    sport = 'SOCCER';
    league = 'Soccer';
    outcomes = 3;
    console.log('🏆 Detected SOCCER from URL patterns');
  } else if (url.includes('mlb') || url.includes('baseball')) {
    sport = 'BASEBALL';
    league = 'MLB';
    outcomes = 2;
    console.log('🏆 Detected BASEBALL from URL patterns');
  } else if (url.includes('nfl') || url.includes('american-football')) {
    sport = 'FOOTBALL';
    league = 'NFL';
    outcomes = 2;
    console.log('🏆 Detected FOOTBALL from URL patterns');
  } else if (url.includes('nba') || url.includes('basketball')) {
    sport = 'BASKETBALL';
    league = 'NBA';
    outcomes = 2;
    console.log('🏆 Detected BASKETBALL from URL patterns');
  }
  
  // Also check page title as additional hint
  const pageTitle = document.title.toLowerCase();
  if (pageTitle.includes('soccer') || pageTitle.includes('primera') || pageTitle.includes('argentina')) {
    sport = 'SOCCER';
    league = 'Soccer';
    outcomes = 3;
    console.log('🏆 Detected SOCCER from page title');
  }
  
  const sportConfig = SPORT_CONFIGS[sport];
  const market = 'moneyline';
  
  if (sportConfig && sportConfig.markets[market]) {
    const marketConfig = { ...sportConfig.markets[market], outcomes: outcomes };
    
    console.log(`🏆 FALLBACK: ${sport} (${outcomes} outcomes) from URL/title patterns`);
    
    return { 
      sport: sport, 
      league: league,
      betType: marketConfig.name,
      marketType: market,
      outcomes: outcomes,
      terminology: sportConfig.terminology
    };
  }
  
  // Ultimate fallback
  console.log('🏆 Using ultimate fallback: BASEBALL');
  return { 
    sport: 'BASEBALL', 
    league: 'MLB',
    betType: 'Moneyline',
    marketType: 'moneyline',
    outcomes: 2,
    terminology: SPORT_CONFIGS.BASEBALL.terminology
  };
}

// Parse odds text and return both original and converted formats
function parseOdds(oddsText) {
  if (!oddsText) return null;
  const cleaned = oddsText.trim();
  
  // Check for American odds format (+150, -110)
  const americanMatch = cleaned.match(/^([+-]?\d+)$/);
  if (americanMatch) {
    const american = parseInt(americanMatch[1]);
    // Convert American odds to percentage
    let percentage;
    if (american > 0) {
      // Underdog: percentage = 100 / (american + 100) * 100
      percentage = 100 / (american + 100) * 100;
    } else {
      // Favorite: percentage = (-american) / (-american + 100) * 100
      percentage = (-american) / (-american + 100) * 100;
    }
    return {
      american: american,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      format: 'american'
    };
  }
  
  // Check for percentage format (65.5%)
  const percentMatch = cleaned.match(/^(\d+\.?\d*)%$/);
  if (percentMatch) {
    const percentage = parseFloat(percentMatch[1]);
    // Convert implied probability to American odds
    let american;
    if (percentage >= 50) {
      // Favorite: -(probability / (100 - probability) * 100)
      american = Math.round(-(percentage / (100 - percentage) * 100));
    } else {
      // Underdog: +((100 - probability) / probability * 100)
      american = Math.round(((100 - percentage) / percentage) * 100);
    }
    return {
      american: american,
      percentage: percentage,
      format: 'percentage'
    };
  }
  
  
  // Check for decimal format (1.65, 2.50)
  const decimalMatch = cleaned.match(/^(\d+\.?\d*)$/);
  if (decimalMatch) {
    const decimal = parseFloat(decimalMatch[1]);
    if (decimal >= 1.01) { // Valid decimal odds are > 1
      // Convert decimal to percentage
      const percentage = (1 / decimal) * 100;
      // Convert decimal to American
      let american;
      if (decimal >= 2.0) {
        american = Math.round((decimal - 1) * 100);
      } else {
        american = Math.round(-100 / (decimal - 1));
      }
      return {
        american: american,
        percentage: Math.round(percentage * 100) / 100,
        format: 'decimal'
      };
    }
  }
  
  return null;
}

// Parse start time and determine game status
function parseStartTime(startTimeText, createdAt) {
  if (!startTimeText) return { 
    originalTime: null, 
    parsedTime: null, 
    gameStatus: 'unknown', 
    inningInfo: null 
  };
  
  const cleaned = startTimeText.trim();
  
  // Check for live game indicators (inning info like "7 Top", "3 Bottom")
  const inningMatch = cleaned.match(/^(\d+)\s+(Top|Bottom)$/i);
  if (inningMatch) {
    // For live games, use current time with a unique offset based on inning
    const liveGameTime = new Date();
    const inning = parseInt(inningMatch[1]);
    const isTop = inningMatch[2].toLowerCase() === 'top';
    // Add a small offset to differentiate live games (inning * 100 + (top=0, bottom=50) milliseconds)
    liveGameTime.setMilliseconds(liveGameTime.getMilliseconds() + (inning * 100) + (isTop ? 0 : 50));
    
    return {
      originalTime: cleaned,
      parsedTime: liveGameTime.toISOString(),
      gameStatus: 'live',
      inningInfo: cleaned
    };
  }
  
  // Check for final game indicators
  if (cleaned.toLowerCase().includes('final')) {
    // For final games, use a time in the recent past to differentiate from live games
    const finalGameTime = new Date(createdAt);
    finalGameTime.setHours(finalGameTime.getHours() - 1); // 1 hour ago
    
    return {
      originalTime: cleaned,
      parsedTime: finalGameTime.toISOString(),
      gameStatus: 'final',
      inningInfo: null
    };
  }
  
  // Try to parse scheduled time (e.g., "8/19 • 4:40PM")
  // Debug: log the exact characters for troubleshooting  
  if (cleaned.includes('•') || cleaned.includes('/')) {
    console.log(`parseStartTime debug: "${cleaned}" (length: ${cleaned.length}, chars: ${Array.from(cleaned).map(c => c.charCodeAt(0)).join(',')})`);
  }
  
  // Match date/time with various bullet characters (• = 8226, · = 183, and other variants)
  const dateTimeMatch = cleaned.match(/^(\d+\/\d+)\s*[•·\u2022\u00B7\u2219\u25CF]\s*(\d+:\d+\s*[AP]M)$/i);
  if (dateTimeMatch) {
    try {
      const currentYear = new Date().getFullYear();
      const dateStr = `${dateTimeMatch[1]}/${currentYear} ${dateTimeMatch[2]}`;
      const parsedDate = new Date(dateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        return {
          originalTime: cleaned,
          parsedTime: parsedDate.toISOString(),
          gameStatus: 'scheduled',
          inningInfo: null
        };
      }
    } catch (e) {
      console.log('Error parsing date:', e);
    }
  }
  
  // Try to parse other common time formats
  // Format: "Today 8:00 PM" or "Tomorrow 3:30 PM"
  const todayTomorrowMatch = cleaned.match(/^(Today|Tomorrow)\s+(\d+:\d+\s*[AP]M)$/i);
  if (todayTomorrowMatch) {
    try {
      const isToday = todayTomorrowMatch[1].toLowerCase() === 'today';
      const timeStr = todayTomorrowMatch[2];
      
      const baseDate = new Date();
      if (!isToday) {
        baseDate.setDate(baseDate.getDate() + 1); // Tomorrow
      }
      
      const [time, ampm] = timeStr.split(/\s+/);
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      
      if (ampm.toLowerCase() === 'pm' && hours !== 12) {
        hour24 += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hour24 = 0;
      }
      
      baseDate.setHours(hour24, minutes, 0, 0);
      
      if (!isNaN(baseDate.getTime())) {
        return {
          originalTime: cleaned,
          parsedTime: baseDate.toISOString(),
          gameStatus: 'scheduled',
          inningInfo: null
        };
      }
    } catch (e) {
      console.log('Error parsing today/tomorrow date:', e);
    }
  }
  
  // Try additional common formats before falling back
  
  // Format: "8:00 PM" (time only)
  const timeOnlyMatch = cleaned.match(/^(\d+:\d+\s*[AP]M)$/i);
  if (timeOnlyMatch) {
    try {
      const timeStr = timeOnlyMatch[1];
      const baseDate = new Date();
      
      const [time, ampm] = timeStr.split(/\s+/);
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;
      
      if (ampm.toLowerCase() === 'pm' && hours !== 12) {
        hour24 += 12;
      } else if (ampm.toLowerCase() === 'am' && hours === 12) {
        hour24 = 0;
      }
      
      baseDate.setHours(hour24, minutes, 0, 0);
      
      if (!isNaN(baseDate.getTime())) {
        return {
          originalTime: cleaned,
          parsedTime: baseDate.toISOString(),
          gameStatus: 'scheduled',
          inningInfo: null
        };
      }
    } catch (e) {
      // Continue to fallback
    }
  }
  
  // Format: "8/19" (date only)
  const dateOnlyMatch = cleaned.match(/^(\d+\/\d+)$/);
  if (dateOnlyMatch) {
    try {
      const currentYear = new Date().getFullYear();
      const dateStr = `${dateOnlyMatch[1]}/${currentYear}`;
      const parsedDate = new Date(dateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        return {
          originalTime: cleaned,
          parsedTime: parsedDate.toISOString(),
          gameStatus: 'scheduled',
          inningInfo: null
        };
      }
    } catch (e) {
      // Continue to fallback
    }
  }
  
  // Format: relative times like "in 2 hours", "in 30 minutes"
  const relativeMatch = cleaned.match(/^in\s+(\d+)\s+(hour|minute|day)s?$/i);
  if (relativeMatch) {
    try {
      const amount = parseInt(relativeMatch[1]);
      const unit = relativeMatch[2].toLowerCase();
      const futureTime = new Date();
      
      switch (unit) {
        case 'hour':
          futureTime.setHours(futureTime.getHours() + amount);
          break;
        case 'minute':
          futureTime.setMinutes(futureTime.getMinutes() + amount);
          break;
        case 'day':
          futureTime.setDate(futureTime.getDate() + amount);
          break;
      }
      
      return {
        originalTime: cleaned,
        parsedTime: futureTime.toISOString(),
        gameStatus: 'scheduled',
        inningInfo: null
      };
    } catch (e) {
      // Continue to fallback
    }
  }
  
  // Default case - use original text and created time as fallback
  // Only log unique unparsed formats to reduce noise
  if (!window.unparsedTimeFormats) {
    window.unparsedTimeFormats = new Set();
  }
  
  if (!window.unparsedTimeFormats.has(cleaned)) {
    window.unparsedTimeFormats.add(cleaned);
    console.warn(`parseStartTime: New unparsed time format: "${cleaned}"`);
  }
  
  return {
    originalTime: cleaned,
    parsedTime: createdAt,
    gameStatus: 'scheduled',
    inningInfo: null
  };
}

// Extract team data from a row
function extractTeamData(row) {
  const SELECTORS = getSelectors();
  const teamCell = row.querySelector(SELECTORS.columns.teamName);
  const rotationCell = row.querySelector(SELECTORS.columns.rotationNumber);
  
  const teams = [];
  
  if (teamCell) {
    console.log(`extractTeamData: teamCell found, innerHTML preview:`, teamCell.innerHTML.substring(0, 300));
    
    // Each team cell contains multiple divs, each with a team name
    const teamDivs = teamCell.querySelectorAll('div.box-border');
    console.log(`extractTeamData: found ${teamDivs.length} div.box-border elements`);
    
    if (teamDivs.length === 0) {
      // Try alternative selectors if box-border doesn't work
      const altDivs = teamCell.querySelectorAll('div') || [];
      console.log(`extractTeamData: trying alternative - found ${altDivs.length} div elements total`);
      
      // Filter divs that contain paragraph elements (likely team containers)
      const teamContainerDivs = Array.from(altDivs).filter(div => {
        const p = div.querySelector('p');
        return p && p.textContent && p.textContent.trim().length > 0;
      });
      console.log(`extractTeamData: found ${teamContainerDivs.length} divs with paragraph content`);
      
      teamContainerDivs.forEach((teamDiv, index) => {
        console.log(`extractTeamData: processing alt div ${index}, innerHTML:`, teamDiv.innerHTML.substring(0, 200));
        
        const teamNameElement = teamDiv.querySelector(SELECTORS.elements.teamText) || 
                               teamDiv.querySelector('p.truncate') || 
                               teamDiv.querySelector('p[class*="truncate"]') ||
                               teamDiv.querySelector('p');
        
        const teamText = teamNameElement?.textContent?.trim();
        console.log(`extractTeamData: alt div ${index} team text: "${teamText}"`);
        
        if (teamText && teamText.length > 0) {
          // Get corresponding rotation number
          let rotation = null;
          if (rotationCell) {
            const rotationDivs = rotationCell.querySelectorAll('div.box-border') || rotationCell.querySelectorAll('div');
            const rotationElement = rotationDivs[index]?.querySelector(SELECTORS.elements.rotationText) ||
                                   rotationDivs[index]?.querySelector('p');
            rotation = rotationElement?.textContent?.trim() || null;
          }
          
          teams.push({
            name: teamText,
            rotation: rotation
          });
        }
      });
    } else {
      teamDivs.forEach((teamDiv, index) => {
        console.log(`extractTeamData: processing box-border div ${index}, innerHTML:`, teamDiv.innerHTML.substring(0, 200));
        
        // Use the precise selector from config, with fallbacks
        const teamNameElement = teamDiv.querySelector(SELECTORS.elements.teamText) || 
                               teamDiv.querySelector('p.truncate') || 
                               teamDiv.querySelector('p[class*="truncate"]') ||
                               teamDiv.querySelector('p');
        
        const teamText = teamNameElement?.textContent?.trim();
        console.log(`extractTeamData: box-border div ${index} team text: "${teamText}"`);
        
        if (teamText && teamText.length > 0) {
          // Get corresponding rotation number using precise selector
          let rotation = null;
          if (rotationCell) {
            const rotationDivs = rotationCell.querySelectorAll('div.box-border');
            const rotationElement = rotationDivs[index]?.querySelector(SELECTORS.elements.rotationText) ||
                                   rotationDivs[index]?.querySelector('p');
            rotation = rotationElement?.textContent?.trim() || null;
          }
          
          teams.push({
            name: teamText,
            rotation: rotation
          });
        }
      });
    }
  } else {
    console.log(`extractTeamData: no teamCell found with selector: ${SELECTORS.columns.teamName}`);
  }
  
  console.log(`extractTeamData: returning ${teams.length} teams:`, teams.map(t => t.name));
  return teams;
}

// Extract odds for all sportsbooks from a row
function extractOddsData(row, outcomes = 2) {
  const SELECTORS = getSelectors();
  const oddsData = {};
  const rowIndex = row.getAttribute('row-index');
  
  console.log(`extractOddsData: extracting odds for row ${rowIndex} with ${outcomes} outcomes`);
  
  // Check if this layout supports multi-container structure
  const grid = document.querySelector(SELECTORS.grid.root);
  
  if (!currentLayout.features.multiContainer) {
    // Simple single-container extraction
    return extractOddsSimple(row, SELECTORS, outcomes);
  }
  if (!grid) {
    console.log(`extractOddsData: no grid found`);
    return oddsData;
  }
  
  // Find all row containers in the grid
  const leftContainer = grid.querySelector('.ag-pinned-left-cols-container');
  const rightContainer = grid.querySelector('.ag-pinned-right-cols-container');
  
  // Try multiple ways to find the center container where sportsbook columns are located
  let centerContainer = grid.querySelector('.ag-center-cols-container');
  if (!centerContainer) {
    centerContainer = grid.querySelector('.ag-body-viewport .ag-center-cols-container');
  }
  if (!centerContainer) {
    // Look for any rowgroup that's not left or right pinned
    centerContainer = grid.querySelector('[role="rowgroup"]:not(.ag-pinned-left-cols-container):not(.ag-pinned-right-cols-container)');
  }
  if (!centerContainer) {
    // Try to find the body viewport itself if it contains rows
    const bodyViewport = grid.querySelector('.ag-body-viewport');
    if (bodyViewport && bodyViewport.querySelector('[role="row"]')) {
      centerContainer = bodyViewport;
    }
  }
  if (!centerContainer) {
    // Last resort: look for any container with sportsbook columns
    const allContainers = grid.querySelectorAll('[role="rowgroup"], .ag-body-viewport');
    for (const container of allContainers) {
      if (container.querySelector('[col-id="BetMGM"], [col-id="22bet"], [col-id="4Cx"]')) {
        centerContainer = container;
        break;
      }
    }
  }
  
  console.log(`extractOddsData: found containers - left: ${!!leftContainer}, center: ${!!centerContainer}, right: ${!!rightContainer}`);
  
  // Debug: If no center container found, try to find ALL possible containers
  if (!centerContainer) {
    console.log(`extractOddsData: DEBUG - No center container found, searching for all containers in grid`);
    const allRowGroups = grid.querySelectorAll('[role="rowgroup"]');
    const allViewports = grid.querySelectorAll('.ag-body-viewport, .ag-center-cols-viewport, .ag-center-cols-container');
    const allContainersWithRows = Array.from(grid.querySelectorAll('*')).filter(el => el.querySelector('[role="row"]'));
    
    console.log(`extractOddsData: DEBUG - Found ${allRowGroups.length} rowgroups, ${allViewports.length} viewports, ${allContainersWithRows.length} containers with rows`);
    
    // Try to find container with the most columns for this specific row
    let bestContainer = null;
    let maxCells = 0;
    
    [...allRowGroups, ...allViewports, ...allContainersWithRows].forEach((container, i) => {
      const testRow = container.querySelector(`[row-index="${rowIndex}"]`) || container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
      if (testRow) {
        const cellCount = testRow.querySelectorAll('[col-id]').length;
        console.log(`extractOddsData: DEBUG container ${i} has ${cellCount} cells for row ${rowIndex}`);
        if (cellCount > maxCells) {
          maxCells = cellCount;
          bestContainer = container;
        }
      }
    });
    
    if (bestContainer && maxCells > 3) {
      console.log(`extractOddsData: DEBUG - Using best container with ${maxCells} cells`);
      centerContainer = bestContainer;
    }
  }
  
  // Get all possible row containers to search for sportsbook columns
  const containers = [leftContainer, centerContainer, rightContainer].filter(Boolean);
  
  let totalCells = 0;
  let sportsbookCount = 0;
  
  containers.forEach((container, containerIndex) => {
    if (!container) return;
    
    // Find the corresponding row in this container
    const correspondingRow = container.querySelector(`[row-index="${rowIndex}"]`) ||
                            container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
    
    if (!correspondingRow) {
      console.log(`extractOddsData: no corresponding row found in container ${containerIndex} for row ${rowIndex}`);
      return;
    }
    
    // Get all cells with col-id in this row
    const cells = correspondingRow.querySelectorAll('[col-id]');
    totalCells += cells.length;
    console.log(`extractOddsData: found ${cells.length} cells in container ${containerIndex}`);
    
    cells.forEach(cell => {
      const colId = cell.getAttribute('col-id');
      
      // Skip non-sportsbook columns
      if (['startTime', 'rotationNumber', 'teamName', 'bestPrice', 'averagePrice'].includes(colId)) {
        console.log(`extractOddsData: skipping non-sportsbook column: ${colId}`);
        return;
      }
      
      // Get sportsbook name from mapping
      const sportsbookName = colIdToSportsbookName.get(colId) || colId;
      const cellText = cell.textContent?.trim() || '';
      const cellHTML = cell.innerHTML;
      
      // Enhanced logging for Polymarket detection using mapped name
      if (sportsbookName.toLowerCase().includes('polymarket')) {
        console.log(`🟢 POLYMARKET DETECTED: col-id="${colId}" → sportsbook="${sportsbookName}"`);
        console.log(`🟢 POLYMARKET cell text: "${cellText}"`);
        console.log(`🟢 POLYMARKET cell HTML:`, cellHTML);
        console.log(`🟢 POLYMARKET container index: ${containerIndex}`);
        console.log(`🟢 POLYMARKET row index: ${rowIndex}`);
        console.log(`🟢 POLYMARKET cell position:`, cell.getBoundingClientRect());
      }
      
      sportsbookCount++;
      console.log(`extractOddsData: processing sportsbook column: ${colId} in container ${containerIndex}`);
      console.log(`extractOddsData: ${colId} cell innerHTML preview:`, cell.innerHTML.substring(0, 200));
      
      // Extract odds text from cell using precise selector
      const oddsElements = cell.querySelectorAll(SELECTORS.elements.oddsText);
      console.log(`extractOddsData: ${colId} found ${oddsElements.length} odds elements with precise selector`);
      
      if (oddsElements.length === 0) {
        // Try fallback selectors
        const fallbackElements1 = cell.querySelectorAll('p.font-semibold');
        const fallbackElements2 = cell.querySelectorAll('p[class*="font-semibold"]');
        const fallbackElements3 = cell.querySelectorAll('p');
        
        console.log(`extractOddsData: ${colId} fallback selectors found:`, {
          'p.font-semibold': fallbackElements1.length,
          'p[class*="font-semibold"]': fallbackElements2.length,
          'p': fallbackElements3.length
        });
        
        if (fallbackElements1.length > 0) {
          console.log(`extractOddsData: ${colId} using p.font-semibold fallback`);
          fallbackElements1.forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback1 element ${i}: "${elem.textContent?.trim()}"`);
          });
        } else if (fallbackElements2.length > 0) {
          console.log(`extractOddsData: ${colId} using p[class*="font-semibold"] fallback`);
          fallbackElements2.forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback2 element ${i}: "${elem.textContent?.trim()}"`);
          });
        } else if (fallbackElements3.length > 0) {
          console.log(`extractOddsData: ${colId} using p fallback (first 3)`);
          Array.from(fallbackElements3).slice(0, 3).forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback3 element ${i}: "${elem.textContent?.trim()}"`);
          });
        }
      }
      
      const finalOddsElements = oddsElements.length > 0 ? oddsElements :
                               (cell.querySelectorAll('p.font-semibold').length > 0 ? cell.querySelectorAll('p.font-semibold') :
                               (cell.querySelectorAll('p[class*="font-semibold"]').length > 0 ? cell.querySelectorAll('p[class*="font-semibold"]') :
                               cell.querySelectorAll('p')));
      
      if (finalOddsElements.length > 0) {
        const odds = [];
        finalOddsElements.forEach(elem => {
          const fullText = elem.textContent?.trim();
          console.log(`extractOddsData: ${colId} processing full odds text: "${fullText}"`);
          
          // First, try to find percentage spans specifically (for Polymarket and similar formats)
          const percentageSpans = elem.querySelectorAll('span');
          let foundPercentageInSpans = false;
          
          percentageSpans.forEach(span => {
            const spanText = span.textContent?.trim();
            if (spanText && spanText.includes('%') && !spanText.includes('$')) {
              console.log(`extractOddsData: ${colId} found percentage span: "${spanText}"`);
              const oddsValue = parseOdds(spanText);
              console.log(`extractOddsData: ${colId} parsed odds from span:`, oddsValue);
              if (oddsValue !== null) {
                odds.push(oddsValue);
                foundPercentageInSpans = true;
              }
            } else if (spanText && spanText.includes('$')) {
              console.log(`extractOddsData: ${colId} found liquidity span: "${spanText}"`);
            }
          });
          
          // If no percentage spans found, try the regex approach on full text
          if (!foundPercentageInSpans) {
            console.log(`extractOddsData: ${colId} no percentage spans found, trying regex on full text`);
            const percentageMatches = fullText.match(/(\d+\.?\d*)%/g);
            const dollarMatches = fullText.match(/\$[\d,]+/g);
            
            if (percentageMatches && percentageMatches.length > 0) {
              console.log(`extractOddsData: ${colId} found percentage matches:`, percentageMatches);
              if (dollarMatches) {
                console.log(`extractOddsData: ${colId} found dollar amounts (liquidity):`, dollarMatches);
              }
              
              // Parse each percentage found
              percentageMatches.forEach((percentText, index) => {
                console.log(`extractOddsData: ${colId} processing percentage text: "${percentText}"`);
                const oddsValue = parseOdds(percentText);
                console.log(`extractOddsData: ${colId} parsed odds:`, oddsValue);
                if (oddsValue !== null) {
                  odds.push(oddsValue);
                }
              });
            } else {
              // Final fallback to original parsing for non-percentage formats
              console.log(`extractOddsData: ${colId} no percentage found, trying original parsing: "${fullText}"`);
              const oddsValue = parseOdds(fullText);
              console.log(`extractOddsData: ${colId} parsed odds:`, oddsValue);
              if (oddsValue !== null) {
                odds.push(oddsValue);
              }
            }
          }
        });
        
        if (odds.length > 0) {
          console.log(`extractOddsData: ${colId} (${sportsbookName}) final odds array:`, odds);
          // Use the proper sportsbook name instead of col-id
          oddsData[sportsbookName] = {
            home: odds[0] || null,
            away: odds[1] || null,
            draw: outcomes === 3 ? (odds[2] || null) : null,
            format: odds[0]?.format || 'unknown'
          };
        }
      } else {
        console.log(`extractOddsData: ${colId} no odds elements found at all`);
      }
    });
  });
  
  console.log(`extractOddsData: processed ${totalCells} total cells, ${sportsbookCount} sportsbook columns, found odds for ${Object.keys(oddsData).length} sportsbooks`);
  
  // Enhanced debugging - always show sportsbook names found
  if (Object.keys(oddsData).length > 0) {
    console.log(`extractOddsData: Found odds for sportsbooks: ${Object.keys(oddsData).join(', ')}`);
  }
  
  // Debug: Log all found col-ids to understand what columns exist
  if (totalCells > 0 && Object.keys(oddsData).length < 10) { // Show debug if we found fewer than 10 sportsbooks
    console.log(`extractOddsData: DEBUG - Found fewer than expected sportsbooks (${Object.keys(oddsData).length}). All col-ids found:`);
    containers.forEach((container, containerIndex) => {
      if (!container) return;
      const correspondingRow = container.querySelector(`[row-index="${rowIndex}"]`) || container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
      if (correspondingRow) {
        const cells = correspondingRow.querySelectorAll('[col-id]');
        console.log(`extractOddsData: Container ${containerIndex} has ${cells.length} cells:`);
        cells.forEach(cell => {
          const colId = cell.getAttribute('col-id');
          const isSkipped = ['startTime', 'rotationNumber', 'teamName', 'bestPrice', 'averagePrice'].includes(colId);
          console.log(`  col-id: "${colId}" ${isSkipped ? '(SKIPPED)' : '(PROCESSED)'}`);
        });
      }
    });
  }
  return oddsData;
}

// Simple odds extraction for single-container layouts
function extractOddsSimple(row, SELECTORS, outcomes = 2) {
  const oddsData = {};
  
  // Find all cells with odds data
  const cells = row.querySelectorAll(SELECTORS.grid.cell);
  console.log(`extractOddsSimple: found ${cells.length} cells`);
  
  cells.forEach(cell => {
    // Look for sportsbook indicators in the cell
    const sportsbookName = cell.getAttribute('data-sportsbook') || 
                          cell.getAttribute('data-col') ||
                          cell.className.match(/sportsbook-(\w+)/)?.[1];
    
    if (sportsbookName && !['time', 'teams', 'best', 'average'].includes(sportsbookName)) {
      const oddsElements = cell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          cell.querySelectorAll('span, div, p');
      
      if (oddsElements.length >= 2) {
        const homeOdds = parseOdds(oddsElements[0].textContent);
        const awayOdds = parseOdds(oddsElements[1].textContent);
        const drawOdds = outcomes === 3 && oddsElements.length >= 3 ? parseOdds(oddsElements[2].textContent) : null;
        
        if (homeOdds !== null || awayOdds !== null || drawOdds !== null) {
          oddsData[sportsbookName] = {
            home: homeOdds,
            away: awayOdds,
            draw: drawOdds
          };
        }
      }
    }
  });
  
  return oddsData;
}

// Extract best and average odds from a row
function extractBestAvgOdds(row) {
  const SELECTORS = getSelectors();
  const outcomes = currentSportConfig?.marketConfig?.outcomes || 2;
  const result = {
    bestHome: null,
    bestAway: null,
    bestDraw: outcomes === 3 ? null : undefined,
    avgHome: null,
    avgAway: null,
    avgDraw: outcomes === 3 ? null : undefined
  };
  
  // Only extract from columns if layout supports these features
  const extractFromColumns = currentLayout.features.bestOdds || currentLayout.features.averageOdds;
  
  // Extract best odds
  if (currentLayout.features.bestOdds && SELECTORS.columns.bestPrice) {
    const bestPriceCell = row.querySelector(SELECTORS.columns.bestPrice);
    if (bestPriceCell) {
      const oddsElements = bestPriceCell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          bestPriceCell.querySelectorAll('p.font-semibold') ||
                          bestPriceCell.querySelectorAll('p');
      
      if (oddsElements.length >= 2) {
        result.bestHome = parseOdds(oddsElements[0].textContent);
        result.bestAway = parseOdds(oddsElements[1].textContent);
        if (outcomes === 3 && oddsElements.length >= 3) {
          result.bestDraw = parseOdds(oddsElements[2].textContent);
        }
      }
    }
  }
  
  // Extract average odds
  if (currentLayout.features.averageOdds && SELECTORS.columns.averagePrice) {
    const avgPriceCell = row.querySelector(SELECTORS.columns.averagePrice);
    if (avgPriceCell) {
      const oddsElements = avgPriceCell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          avgPriceCell.querySelectorAll('p.font-semibold') ||
                          avgPriceCell.querySelectorAll('p');
      
      if (oddsElements.length >= 2) {
        result.avgHome = parseOdds(oddsElements[0].textContent);
        result.avgAway = parseOdds(oddsElements[1].textContent);
        if (outcomes === 3 && oddsElements.length >= 3) {
          result.avgDraw = parseOdds(oddsElements[2].textContent);
        }
      }
    }
  }
  
  // If no best/avg odds were extracted from columns, calculate from odds data
  if (!extractFromColumns || (result.bestHome === null && result.avgHome === null)) {
    const oddsData = extractOddsData(row);
    const allHomeOdds = [];
    const allAwayOdds = [];
    const allDrawOdds = [];
    
    // Collect all valid odds
    for (const [sportsbook, odds] of Object.entries(oddsData)) {
      if (odds.home?.american) allHomeOdds.push(odds.home.american);
      if (odds.away?.american) allAwayOdds.push(odds.away.american);
      if (odds.draw?.american) allDrawOdds.push(odds.draw.american);
    }
    
    // Calculate best odds (highest for positive, closest to 0 for negative)
    if (allHomeOdds.length > 0) {
      result.bestHome = allHomeOdds.reduce((best, current) => {
        if (current > 0 && best > 0) return Math.max(best, current);
        if (current < 0 && best < 0) return Math.max(best, current); // closer to 0
        if (current > 0 && best < 0) return current; // positive beats negative
        if (current < 0 && best > 0) return best; // positive beats negative
        return best;
      });
    }
    
    if (allAwayOdds.length > 0) {
      result.bestAway = allAwayOdds.reduce((best, current) => {
        if (current > 0 && best > 0) return Math.max(best, current);
        if (current < 0 && best < 0) return Math.max(best, current);
        if (current > 0 && best < 0) return current;
        if (current < 0 && best > 0) return best;
        return best;
      });
    }
    
    if (allDrawOdds.length > 0 && outcomes === 3) {
      result.bestDraw = allDrawOdds.reduce((best, current) => {
        if (current > 0 && best > 0) return Math.max(best, current);
        if (current < 0 && best < 0) return Math.max(best, current);
        if (current > 0 && best < 0) return current;
        if (current < 0 && best > 0) return best;
        return best;
      });
    }
    
    // Calculate average odds
    if (allHomeOdds.length > 0) {
      result.avgHome = Math.round(allHomeOdds.reduce((sum, odds) => sum + odds, 0) / allHomeOdds.length);
    }
    
    if (allAwayOdds.length > 0) {
      result.avgAway = Math.round(allAwayOdds.reduce((sum, odds) => sum + odds, 0) / allAwayOdds.length);
    }
    
    if (allDrawOdds.length > 0 && outcomes === 3) {
      result.avgDraw = Math.round(allDrawOdds.reduce((sum, odds) => sum + odds, 0) / allDrawOdds.length);
    }
    
    console.log(`extractBestAvgOdds: calculated from ${Object.keys(oddsData).length} sportsbooks`);
  }
  
  console.log(`extractBestAvgOdds: best(${result.bestHome}/${result.bestAway}) avg(${result.avgHome}/${result.avgAway})`);
  return result;
}

// Main scraping function
async function scrapeData() {
  // Initialize layout and sport detection
  detectLayout();
  const SELECTORS = getSelectors();
  
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) {
    console.log('Grid not found, trying alternative selectors...');
    
    // Try alternative selectors based on layout
    const altSelectors = ['table', '.table', '[role="table"]', '.ag-root-wrapper', '.ag-theme-alpine', '[class*="ag-"]'];
    let altGrid = null;
    
    for (const selector of altSelectors) {
      altGrid = document.querySelector(selector);
      if (altGrid) {
        console.log('Found alternative grid with selector:', selector);
        break;
      }
    }
    
    if (!altGrid) {
      console.log('No grid found at all');
      return null;
    }
  }
  
  const rows = grid ? grid.querySelectorAll(SELECTORS.grid.rows) : 
               document.querySelectorAll('[role="row"], tr');
  
  console.log('Found', rows.length, 'rows total');
  
  const games = [];
  const { sport, league, betType, marketType, outcomes, terminology } = await extractSportLeague(window.location.href);
  const timestamp = new Date().toISOString();
  
  console.log(`Scraping ${sport} ${betType} with ${outcomes} outcomes using layout: ${currentLayout.name}`);
  
  rows.forEach((row, index) => {
    const rowId = row.getAttribute('row-id');
    const rowIndex = row.getAttribute('row-index');
    console.log(`Row ${index}: rowId=${rowId}, rowIndex=${rowIndex}, classes=${row.className}`);
    
    // Skip header rows, group rows, or rows without proper IDs
    if (!rowId || rowId === 'header' || row.getAttribute('role') !== 'row') {
      console.log(`Skipping row ${index}: no rowId or header or not a data row`);
      return;
    }
    
    // Skip rows that look like separators or group headers
    if (row.classList.contains('ag-row-group') || row.classList.contains('ag-group-row')) {
      console.log(`Skipping row ${index}: group row`);
      return;
    }
    
    // Skip duplicate rows (common issue with virtual scrolling in AG Grid)
    // Look for unique game IDs to avoid processing the same game multiple times
    const existingGame = games.find(game => game.rowId === rowId);
    if (existingGame) {
      console.log(`Skipping row ${index}: duplicate rowId ${rowId}`);
      return;
    }
    
    // Extract start time
    const startTimeCell = row.querySelector(SELECTORS.columns.startTime);
    let startTimeText = null;
    if (startTimeCell) {
      // Try multiple selectors for start time
      const timeElement = startTimeCell.querySelector('span') ||
                         startTimeCell.querySelector('.text-xs') ||
                         startTimeCell.querySelector('div a span') ||
                         startTimeCell.querySelector('span[class*="__className"]');
      startTimeText = timeElement?.textContent?.trim();
      
      if (!startTimeText) {
        console.log(`Row ${index}: no start time found, startTimeCell innerHTML:`, startTimeCell.innerHTML.substring(0, 200));
      }
    } else {
      console.log(`Row ${index}: no startTimeCell found with selector: ${SELECTORS.columns.startTime}`);
    }
    // Parse start time
    const timeInfo = parseStartTime(startTimeText, timestamp);
    console.log(`Row ${index}: startTime=${startTimeText}, status=${timeInfo.gameStatus}, inning=${timeInfo.inningInfo}`);
    
    // Extract teams
    const teams = extractTeamData(row);
    console.log(`Row ${index}: found ${teams.length} teams:`, teams.map(t => t.name));
    if (teams.length < 2) {
      console.log(`Row ${index}: insufficient teams (${teams.length}), skipping. Teams found:`, teams);
      
      // Debug: Check what's in the team cell
      const teamCell = row.querySelector(SELECTORS.columns.teamName);
      if (teamCell) {
        console.log(`Row ${index}: teamCell innerHTML:`, teamCell.innerHTML.substring(0, 200));
        const teamDivs = teamCell.querySelectorAll('div.box-border');
        console.log(`Row ${index}: found ${teamDivs.length} team divs`);
      } else {
        console.log(`Row ${index}: no team cell found`);
      }
      return;
    }
    
    // Debug: Log team extraction for different market types
    const teamNames = teams.map(t => t.name);
    console.log(`🏈 Row ${index}: Team extraction - Found ${teams.length} teams for ${outcomes}-outcome ${sport} market`);
    console.log(`🏈 Row ${index}: Teams:`, teamNames);
    
    // Properly organize teams for 3-way markets
    const hasDrawTeam = teams.some(t => t.name === 'Draw' || t.name?.toLowerCase() === 'draw');
    let finalHomeTeam, finalAwayTeam;
    
    if ((outcomes === 3 || hasDrawTeam) && teams.length >= 3) {
      const organized = organizeTeams(teams);
      finalHomeTeam = organized[0]?.name || 'Unknown Team 1';
      finalAwayTeam = organized[2]?.name || 'Unknown Team 2';
    } else {
      finalHomeTeam = teams[0]?.name || 'Unknown Team 1';
      finalAwayTeam = getAwayTeam(teams, outcomes);
    }
    console.log(`🏈 Row ${index}: Final assignment - Home: "${finalHomeTeam}", Away: "${finalAwayTeam}"`);
    
    // Debug: Check if we have Draw as a team name (should not happen now)
    if (finalAwayTeam === 'Draw') {
      console.warn(`🚨 Row ${index}: 'Draw' still assigned as away team!`);
      console.warn(`🚨 Row ${index}: Teams array:`, teams);
      console.warn(`🚨 Row ${index}: Sport: ${sport}, Outcomes: ${outcomes}, teams.length: ${teams.length}`);
    }
    
    // Extract odds with sport context
    const odds = extractOddsData(row, outcomes);
    console.log(`Row ${index}: odds for ${Object.keys(odds).length} sportsbooks`);
    
    // Extract best and average odds
    const bestAvgOdds = extractBestAvgOdds(row);
    
    // Extract game link if available
    const gameLink = row.querySelector(SELECTORS.elements.gameLink);
    const gameUrl = gameLink ? gameLink.getAttribute('href') : null;
    
    games.push({
      rowId: rowId,
      sport: sport,
      league: league,
      betType: betType,
      marketType: marketType,
      outcomes: outcomes,
      terminology: terminology,
      homeTeam: finalHomeTeam,
      awayTeam: finalAwayTeam,
      homeRotation: hasDrawTeam && teams.length >= 3 ? organizeTeams(teams)[0]?.rotation : teams[0]?.rotation,
      awayRotation: getAwayTeamRotation(teams, outcomes),
      startTime: timeInfo.originalTime || 'TBD',
      startTimeParsed: timeInfo.parsedTime,
      gameStatus: timeInfo.gameStatus,
      inningInfo: timeInfo.inningInfo,
      bestHomeOdds: bestAvgOdds.bestHome,
      bestAwayOdds: bestAvgOdds.bestAway,
      bestDrawOdds: bestAvgOdds.bestDraw,
      avgHomeOdds: bestAvgOdds.avgHome,
      avgAwayOdds: bestAvgOdds.avgAway,
      avgDrawOdds: bestAvgOdds.avgDraw,
      gameUrl: gameUrl,
      odds: odds,
      timestamp: timestamp
    });
  });
  
  return {
    url: window.location.href,
    sport: sport,
    league: league,
    games: games,
    scrapedAt: new Date().toISOString()
  };
}

// Send data to background script
function sendData(data) {
  // Check if extension has been invalidated
  if (extensionInvalidated || !isExtensionContextValid()) {
    console.log('Extension context invalid - not sending data');
    cleanup();
    return;
  }
  
  console.log('sendData called with', data.games.length, 'games');
  console.log('Total odds found across all games:', 
    data.games.reduce((sum, game) => sum + Object.keys(game.odds).length, 0));
  
  try {
    chrome.runtime.sendMessage({
      type: 'SCRAPED_DATA',
      data: data
    }, response => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
          console.log('Extension was reloaded - stopping scraper to avoid errors');
          cleanup();
          return;
        }
        console.error('Error sending data:', chrome.runtime.lastError);
      } else if (response && response.success) {
        console.log('Data sent successfully to background script');
      } else {
        console.log('Background script response:', response);
      }
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.log('Extension was reloaded - stopping scraper gracefully');
      cleanup();
      return;
    }
    console.error('Error in sendData:', error);
  }
}

// Check for changes and send updates
// Track if we've already done initial column loading
let hasLoadedAllColumns = false;

// Try to access AG Grid API directly
function getAGGridApi() {
  // Try various ways to access AG Grid API
  const possibleAPIs = [
    window.agGrid,
    window.AG_GRID_GLOBALS,
    document.querySelector('.ag-root-wrapper')?.__agGridApi,
    document.querySelector('.ag-root')?.__agGridApi,
    document.querySelector('[ref="gridPanel"]')?.__agGridApi
  ];
  
  for (const api of possibleAPIs) {
    if (api && (api.gridApi || api.api)) {
      console.log('Found AG Grid API!');
      return api.gridApi || api.api;
    }
  }
  
  // Try to find React props
  const gridElement = document.querySelector('.ag-root-wrapper, .ag-root');
  if (gridElement) {
    const reactKey = Object.keys(gridElement).find(key => key.startsWith('__react'));
    if (reactKey && gridElement[reactKey]) {
      const api = gridElement[reactKey].memoizedProps?.api || 
                  gridElement[reactKey].return?.memoizedProps?.api;
      if (api) {
        console.log('Found AG Grid API via React!');
        return api;
      }
    }
  }
  
  return null;
}

// Wrapper function for visual scraping
async function performVisualScraping() {
  // Perform aggressive content loading to capture ALL data
  if (!hasLoadedAllColumns) {
    await implementMultiTabStrategy();
    hasLoadedAllColumns = true;
  }
  
  // Multiple-pass scraping to catch any newly loaded content
  return await performMultiPassScraping();
}

// Multi-tab content loading strategy to capture data across virtual grids
async function implementMultiTabStrategy() {
  console.log('🚀 Starting multi-tab content loading strategy...');
  
  // Step 1: Optimize current tab with zoom
  await optimizeCurrentTabForMaxContent();
  
  // Step 2: Register this tab's position and coordinate with background script  
  const tabPosition = await registerTabPosition();
  
  // Step 3: Position this tab at designated scroll location
  await positionTabAtDesignatedLocation(tabPosition);
  
  // Step 4: Wait for content to settle and scrape visible area
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log(`🚀 Tab positioned at location ${tabPosition}, content loaded`);
}

// Open additional tabs automatically for coordinated scraping
async function openAdditionalTabs() {
  console.log('🚀 Opening additional tabs for coordinated scraping...');
  
  try {
    const currentUrl = window.location.href;
    
    // Use the optimal tab count calculated earlier
    const optimalTabCount = window.OPTIMAL_TAB_COUNT || 2;
    const additionalTabsNeeded = Math.max(0, optimalTabCount - 1); // -1 because current tab is already open
    
    console.log(`🚀 Opening ${additionalTabsNeeded} additional tabs for total of ${optimalTabCount}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'OPEN_COORDINATED_TABS',
      url: currentUrl,
      count: additionalTabsNeeded
    });
    
    if (response?.success) {
      console.log(`🚀 Successfully requested ${response.tabsOpened} additional tabs`);
    } else {
      console.log('🚀 Additional tab opening failed, proceeding with single tab');
    }
  } catch (error) {
    console.log('🚀 Could not open additional tabs, proceeding with single tab');
  }
  
  // Wait a moment for tabs to load
  await new Promise(resolve => setTimeout(resolve, 2000));
}

// Optimize zoom and density to show more content per viewport
async function optimizeCurrentTabForMaxContent() {
  console.log('🔧 Optimizing zoom level to fit more content...');
  
  // Analyze sportsbook size to determine optimal zoom level
  const optimalZoom = await calculateOptimalZoomLevel();
  
  // Request background script to set browser zoom level
  // This uses Chrome's actual zoom API instead of CSS zoom
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'SET_TAB_ZOOM',
      zoomFactor: optimalZoom.factor
    });
    
    if (response?.success) {
      console.log(`🔧 Browser zoom set to ${response.zoomLevel * 100}%`);
      
      // Wait for zoom to take effect
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Trigger resize event to make AG Grid recalculate visible rows
      window.dispatchEvent(new Event('resize'));
      
      // Additional resize triggers for AG Grid
      const resizeEvent = new CustomEvent('resize', { bubbles: true });
      document.dispatchEvent(resizeEvent);
      
      // Try to trigger AG Grid's own resize if available
      const gridApi = getAGGridApi();
      if (gridApi && gridApi.sizeColumnsToFit) {
        gridApi.sizeColumnsToFit();
      }
    } else {
      console.log('🔧 Failed to set browser zoom, falling back to viewport manipulation');
      // Fallback: try viewport width manipulation
      await fallbackViewportExpansion();
    }
  } catch (error) {
    console.log('🔧 Error setting zoom:', error);
    await fallbackViewportExpansion();
  }
}

// Fallback method using viewport manipulation
async function fallbackViewportExpansion() {
  console.log('🔧 Using viewport expansion fallback...');
  
  // Try to manipulate viewport to simulate zoom out
  const style = document.createElement('style');
  style.textContent = `
    html {
      width: 166.67%; /* 1 / 0.6 = 1.667 */
      transform-origin: top left;
    }
    body {
      width: 60%;
      transform: scale(1.667);
      transform-origin: top left;
    }
  `;
  document.head.appendChild(style);
  
  // Trigger resize
  window.dispatchEvent(new Event('resize'));
}

// Calculate optimal zoom level based on sportsbook content size
async function calculateOptimalZoomLevel() {
  console.log('🔍 Analyzing sportsbook size for optimal zoom...');
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  
  if (!grid) {
    console.log('🔍 No grid found, using default zoom');
    return { factor: 0.5, tabCount: 2, reason: 'No grid detected' };
  }
  
  const viewport = grid.querySelector('.ag-body-viewport') || grid.querySelector('.ag-center-cols-viewport');
  if (!viewport) {
    console.log('🔍 No viewport found, using default zoom');
    return { factor: 0.5, tabCount: 2, reason: 'No viewport detected' };
  }
  
  // Measure content dimensions
  const contentHeight = viewport.scrollHeight;
  const contentWidth = viewport.scrollWidth;
  const viewportHeight = viewport.clientHeight;
  const viewportWidth = viewport.clientWidth;
  
  // Count visible rows/games for size estimation
  const gameRows = grid.querySelectorAll('.ag-row, [data-rowindex], .game-row, .event-row');
  const totalRows = gameRows.length;
  
  // Estimate total content from scrollable area
  const verticalScrollRatio = contentHeight / viewportHeight;
  const horizontalScrollRatio = contentWidth / viewportWidth;
  
  console.log(`🔍 Content analysis:`, {
    contentHeight,
    contentWidth,
    viewportHeight,
    viewportWidth,
    visibleRows: totalRows,
    verticalScrollRatio: verticalScrollRatio.toFixed(2),
    horizontalScrollRatio: horizontalScrollRatio.toFixed(2)
  });
  
  // Determine zoom and tab strategy based on content size
  let zoomFactor, tabCount, reason;
  
  if (verticalScrollRatio > 10 || totalRows > 100) {
    // Very large sportsbook - aggressive zoom out, need many tabs
    zoomFactor = 0.25;
    tabCount = Math.min(Math.ceil(verticalScrollRatio / 2), 8); // Up to 8 tabs for huge sportsbooks
    reason = `Very large sportsbook detected (${totalRows} games, ${verticalScrollRatio.toFixed(1)}x scroll)`;
  } else if (verticalScrollRatio > 5 || totalRows > 50) {
    // Large sportsbook - moderate zoom out, need several tabs
    zoomFactor = 0.4;
    tabCount = Math.min(Math.ceil(verticalScrollRatio / 1.5), 4); // Up to 4 tabs
    reason = `Large sportsbook detected (${totalRows} games, ${verticalScrollRatio.toFixed(1)}x scroll)`;
  } else if (verticalScrollRatio > 2 || totalRows > 20) {
    // Medium sportsbook - light zoom out
    zoomFactor = 0.6;
    tabCount = 2;
    reason = 'Medium sportsbook detected (20+ games or 2x scroll)';
  } else {
    // Small sportsbook - minimal zoom
    zoomFactor = 0.8;
    tabCount = 1;
    reason = 'Small sportsbook detected (<20 games)';
  }
  
  console.log(`🔍 Optimal strategy: ${(zoomFactor * 100)}% zoom, ${tabCount} tabs - ${reason}`);
  
  // Store tab count for use in positioning
  window.OPTIMAL_TAB_COUNT = tabCount;
  
  return { factor: zoomFactor, tabCount, reason };
}

// Register this tab's position in the multi-tab coordination
async function registerTabPosition() {
  try {
    const currentUrl = window.location.href;
    const response = await chrome.runtime.sendMessage({
      type: 'REGISTER_TAB_POSITION',
      url: currentUrl,
      timestamp: Date.now()
    });
    
    const position = response?.position || 0;
    console.log(`📋 Registered as tab position ${position}`);
    return position;
  } catch (error) {
    console.log('📋 Tab registration failed, defaulting to position 0');
    return 0;
  }
}

// Position tab at designated scroll location based on its assigned position
async function positionTabAtDesignatedLocation(position) {
  console.log(`📍 Positioning tab at location ${position}...`);
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) {
    console.log('📍 No grid found for positioning');
    return;
  }
  
  const viewport = grid.querySelector('.ag-body-viewport') || grid.querySelector('.ag-center-cols-viewport');
  if (!viewport) {
    console.log('📍 No viewport found for positioning');
    return;
  }
  
  // Calculate target position based on tab number
  const maxScroll = Math.max(viewport.scrollHeight - viewport.clientHeight, 0);
  const tabCount = window.OPTIMAL_TAB_COUNT || 2; // Use dynamic tab count or default to 2
  const sectionHeight = maxScroll / tabCount;
  const targetY = Math.min(position * sectionHeight, maxScroll);
  
  // Also handle horizontal scrolling if needed
  const maxScrollX = Math.max(viewport.scrollWidth - viewport.clientWidth, 0);
  const sectionWidth = maxScrollX; // Full width per tab at 25% zoom
  const targetX = 0; // No horizontal sectioning needed at this zoom level
  
  console.log(`📍 Scrolling to position Y:${targetY}, X:${targetX} (section ${position}/${tabCount})`);
  
  // Smooth scroll to position
  viewport.scrollTo({
    top: targetY,
    left: targetX,
    behavior: 'smooth'
  });
  
  // Also scroll main window if needed
  window.scrollTo({
    top: targetY * 0.5, // Proportional scroll for main window
    left: 0,
    behavior: 'smooth'
  });
  
  // Wait for scroll to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Trigger any lazy loading in this section
  await triggerLazyLoadingInCurrentSection();
}

// Trigger lazy loading for content currently in viewport
async function triggerLazyLoadingInCurrentSection() {
  console.log('🔄 Triggering lazy loading for current section...');
  
  // Trigger intersection observers by creating fake scroll events
  const scrollEvent = new Event('scroll', { bubbles: true });
  const resizeEvent = new Event('resize', { bubbles: true });
  
  document.dispatchEvent(scrollEvent);
  window.dispatchEvent(scrollEvent);
  window.dispatchEvent(resizeEvent);
  
  // Trigger mouse movement to activate hover-based loading
  const mouseEvent = new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    clientX: window.innerWidth / 2,
    clientY: window.innerHeight / 2
  });
  document.dispatchEvent(mouseEvent);
  
  // Small delay for lazy loading to trigger
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log('🔄 Lazy loading triggers sent');
}

// Perform comprehensive scrolling to load all content
async function performAggressiveScrolling() {
  console.log('🚀 Performing aggressive scrolling...');
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  // Find all scrollable containers
  const scrollContainers = [
    grid.querySelector('.ag-body-viewport'),
    grid.querySelector('.ag-center-cols-viewport'), 
    grid.querySelector('.ag-center-cols-container'),
    grid,
    document.documentElement,
    document.body
  ].filter(Boolean);
  
  console.log(`🚀 Found ${scrollContainers.length} scrollable containers`);
  
  for (const container of scrollContainers) {
    await scrollContainerComprehensively(container);
  }
  
  // Additional aggressive techniques
  await forceTableCellsIntoView();
}

// Scroll a single container in all directions comprehensively
async function scrollContainerComprehensively(container) {
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  const maxScrollTop = container.scrollHeight - container.clientHeight;
  
  if (maxScrollLeft <= 0 && maxScrollTop <= 0) return;
  
  console.log(`🚀 Scrolling container: ${maxScrollLeft}px horizontal, ${maxScrollTop}px vertical`);
  
  const originalScrollLeft = container.scrollLeft;
  const originalScrollTop = container.scrollTop;
  
  // Horizontal scrolling strategy - multiple passes
  const horizontalSteps = Math.min(20, Math.max(5, Math.ceil(maxScrollLeft / 200)));
  for (let i = 0; i <= horizontalSteps; i++) {
    const scrollLeft = (i / horizontalSteps) * maxScrollLeft;
    container.scrollLeft = scrollLeft;
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // At each horizontal position, do vertical scrolling
    const verticalSteps = Math.min(10, Math.max(3, Math.ceil(maxScrollTop / 300)));
    for (let j = 0; j <= verticalSteps; j++) {
      const scrollTop = (j / verticalSteps) * maxScrollTop;
      container.scrollTop = scrollTop;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  
  // Return to original position
  container.scrollLeft = originalScrollLeft;
  container.scrollTop = originalScrollTop;
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Force individual table cells into view to trigger rendering
async function forceTableCellsIntoView() {
  console.log('🚀 Forcing table cells into view...');
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  // Find all cells with col-id attributes (these are sportsbook columns)
  const allCells = grid.querySelectorAll('[col-id]');
  console.log(`🚀 Found ${allCells.length} cells to check`);
  
  // Process in batches to avoid overwhelming the browser
  const batchSize = 50;
  for (let i = 0; i < allCells.length; i += batchSize) {
    const batch = Array.from(allCells).slice(i, i + batchSize);
    
    for (const cell of batch) {
      try {
        // Force the cell into view
        cell.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
        
        // Trigger any observers or lazy loading
        const rect = cell.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // Simulate interaction to trigger updates
          cell.dispatchEvent(new Event('mouseenter', { bubbles: true }));
          cell.dispatchEvent(new Event('focus', { bubbles: true }));
        }
      } catch (e) {
        // Ignore errors for individual cells
      }
    }
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

// Trigger lazy loading mechanisms
async function triggerLazyLoading() {
  console.log('🚀 Triggering lazy loading mechanisms...');
  
  // Create intersection observer events for all elements
  const allElements = document.querySelectorAll('*');
  const observedElements = Array.from(allElements).filter(el => {
    return el.offsetParent !== null || // visible elements
           el.tagName === 'TR' ||       // table rows
           el.hasAttribute('col-id') || // grid columns  
           el.hasAttribute('row-id') || // grid rows
           el.getAttribute('class')?.includes('ag-'); // AG Grid elements
  });
  
  console.log(`🚀 Triggering intersection events for ${observedElements.length} elements`);
  
  // Batch process to avoid performance issues
  const batchSize = 100;
  for (let i = 0; i < observedElements.length; i += batchSize) {
    const batch = observedElements.slice(i, i + batchSize);
    
    batch.forEach(el => {
      try {
        // Simulate intersection observer entry
        const rect = el.getBoundingClientRect();
        const intersectionEvent = new CustomEvent('intersection', {
          detail: {
            isIntersecting: true,
            intersectionRatio: 1,
            boundingClientRect: rect,
            target: el
          }
        });
        el.dispatchEvent(intersectionEvent);
        
        // Also trigger scroll events that might load content
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
        
      } catch (e) {
        // Ignore individual element errors
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  // Wait for any async loading to complete
  await new Promise(resolve => setTimeout(resolve, 500));
}

// Multi-pass scraping to catch newly loaded content
async function performMultiPassScraping() {
  console.log('🚀 Starting multi-pass scraping strategy...');
  
  let bestData = { games: [] };
  const maxPasses = 3;
  
  for (let pass = 1; pass <= maxPasses; pass++) {
    console.log(`🚀 Scraping pass ${pass}/${maxPasses}...`);
    
    // Quick additional scrolling before each pass
    if (pass > 1) {
      await quickRefreshScroll();
    }
    
    const data = await scrapeData();
    
    if (data && data.games.length > 0) {
      const totalOdds = data.games.reduce((sum, game) => sum + Object.keys(game.odds || {}).length, 0);
      const previousBestOdds = bestData.games.reduce((sum, game) => sum + Object.keys(game.odds || {}).length, 0);
      
      console.log(`🚀 Pass ${pass}: Found ${data.games.length} games, ${totalOdds} total odds`);
      
      // Keep the data with the most odds
      if (totalOdds > previousBestOdds) {
        bestData = data;
        console.log(`🚀 Pass ${pass}: New best data! (${totalOdds} odds vs ${previousBestOdds})`);
      }
    }
    
    // Small delay between passes
    if (pass < maxPasses) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  console.log(`🚀 Multi-pass complete: Final result has ${bestData.games.length} games`);
  return bestData;
}

// Force AG Grid virtual rows to render by manipulating the grid API
async function forceAGGridVirtualRowsToRender() {
  console.log('🚀 Forcing AG Grid virtual rows to render...');
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  try {
    // Try to access AG Grid API from the DOM element
    const gridApi = grid.gridApi || grid.__agGridApi || grid._gridApi;
    
    if (gridApi) {
      console.log('🚀 Found AG Grid API, forcing row model refresh...');
      
      // Force refresh of the row model
      if (gridApi.refreshInfiniteCache) {
        gridApi.refreshInfiniteCache();
      }
      if (gridApi.purgeInfiniteCache) {
        gridApi.purgeInfiniteCache();
      }
      if (gridApi.onRowDataChanged) {
        gridApi.onRowDataChanged();
      }
      if (gridApi.refreshView) {
        gridApi.refreshView();
      }
      if (gridApi.redrawRows) {
        gridApi.redrawRows();
      }
      if (gridApi.ensureIndexVisible) {
        // Try to ensure all rows are visible by scrolling through row indices
        const rowCount = gridApi.getDisplayedRowCount();
        if (rowCount > 0) {
          console.log(`🚀 AG Grid has ${rowCount} rows, ensuring all are rendered...`);
          
          // Force render chunks of rows
          const chunkSize = 20;
          for (let i = 0; i < rowCount; i += chunkSize) {
            gridApi.ensureIndexVisible(i, 'top');
            await new Promise(resolve => setTimeout(resolve, 50));
          }
          
          // Ensure last row is visible
          gridApi.ensureIndexVisible(rowCount - 1, 'bottom');
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Go back to top
          gridApi.ensureIndexVisible(0, 'top');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } else {
      console.log('🚀 No AG Grid API found, using alternative virtual scroll forcing...');
      await forceVirtualScrollWithoutAPI();
    }
    
  } catch (error) {
    console.log('🚀 Error accessing AG Grid API, falling back to manual methods:', error);
    await forceVirtualScrollWithoutAPI();
  }
}

// Alternative method when AG Grid API is not available
async function forceVirtualScrollWithoutAPI() {
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  // Find the virtual scrolling viewport
  const viewport = grid.querySelector('.ag-body-viewport') || grid.querySelector('.ag-center-cols-viewport');
  if (!viewport) return;
  
  console.log('🚀 Using manual virtual scroll forcing...');
  
  const originalScrollTop = viewport.scrollTop;
  const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
  
  if (maxScrollTop > 0) {
    console.log(`🚀 Scrolling through ${maxScrollTop}px of virtual content...`);
    
    // Scroll through the entire virtual content in steps
    const steps = Math.min(50, Math.max(10, Math.ceil(maxScrollTop / 100)));
    
    for (let i = 0; i <= steps; i++) {
      const scrollTop = (i / steps) * maxScrollTop;
      viewport.scrollTop = scrollTop;
      
      // Wait for virtual rows to render
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    
    // Return to original position
    viewport.scrollTop = originalScrollTop;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}

// Quick refresh scroll to load any new content
async function quickRefreshScroll() {
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  const viewport = grid.querySelector('.ag-body-viewport') || grid.querySelector('.ag-center-cols-viewport');
  if (!viewport) return;
  
  // Quick horizontal scroll to refresh columns
  const originalScrollLeft = viewport.scrollLeft;
  const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
  
  if (maxScrollLeft > 0) {
    viewport.scrollLeft = Math.min(maxScrollLeft, originalScrollLeft + 100);
    await new Promise(resolve => setTimeout(resolve, 50));
    viewport.scrollLeft = Math.max(0, originalScrollLeft - 100);
    await new Promise(resolve => setTimeout(resolve, 50));
    viewport.scrollLeft = originalScrollLeft;
  }
}

// Ensure all columns are loaded - only scroll once on initial load
async function ensureAllColumnsLoaded() {
  // Only do this once per page load to avoid detection
  if (hasLoadedAllColumns) {
    console.log('ensureAllColumnsLoaded: Already loaded all columns once');
    return;
  }
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  
  if (!grid || !currentLayout.features.multiContainer) {
    console.log('ensureAllColumnsLoaded: Grid not found or not multi-container layout');
    return;
  }
  
  // First, try to get column info from AG Grid API
  const gridApi = getAGGridApi();
  if (gridApi && gridApi.getAllColumns) {
    try {
      const allColumns = gridApi.getAllColumns();
      console.log(`Found ${allColumns.length} columns via AG Grid API`);
      const columnIds = allColumns.map(col => col.getColId());
      console.log('All column IDs from API:', columnIds);
      hasLoadedAllColumns = true;
      return;
    } catch (e) {
      console.log('Failed to get columns from API:', e);
    }
  }
  
  // Find the center viewport that contains scrollable columns
  const centerViewport = grid.querySelector('.ag-body-viewport, .ag-center-cols-viewport');
  if (!centerViewport) {
    console.log('ensureAllColumnsLoaded: No scrollable viewport found');
    return;
  }
  
  console.log('ensureAllColumnsLoaded: Performing one-time column discovery...');
  
  // Get scroll dimensions
  const scrollWidth = centerViewport.scrollWidth;
  const clientWidth = centerViewport.clientWidth;
  const originalScrollLeft = centerViewport.scrollLeft;
  
  console.log(`ensureAllColumnsLoaded: Viewport ${clientWidth}px wide, content ${scrollWidth}px wide`);
  
  if (scrollWidth <= clientWidth) {
    console.log('ensureAllColumnsLoaded: All content already visible');
    hasLoadedAllColumns = true;
    return;
  }
  
  // Perform a single smooth scroll to discover columns
  console.log('ensureAllColumnsLoaded: Performing one-time scroll to discover columns...');
  
  // Scroll smoothly to the end
  centerViewport.scrollTo({ left: scrollWidth, behavior: 'smooth' });
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // Scroll back to original position
  centerViewport.scrollTo({ left: originalScrollLeft, behavior: 'smooth' });
  await new Promise(resolve => setTimeout(resolve, 800));
  
  console.log('ensureAllColumnsLoaded: One-time column discovery complete');
  hasLoadedAllColumns = true;
  
  // Build the col-id to sportsbook name mapping after columns are loaded
  buildSportsbookMapping();
  
  // Log all discovered columns after loading with cell content preview
  const allColumns = [];
  const containers = ['.ag-pinned-left-cols-container', '.ag-center-cols-container', '.ag-pinned-right-cols-container'];
  containers.forEach((containerSelector, index) => {
    const container = grid.querySelector(containerSelector);
    if (container) {
      const firstRow = container.querySelector('[role="row"]');
      if (firstRow) {
        const cells = firstRow.querySelectorAll('[col-id]');
        cells.forEach(cell => {
          const colId = cell.getAttribute('col-id');
          const cellText = cell.textContent?.trim() || '';
          const cellHTML = cell.innerHTML.substring(0, 100);
          
          allColumns.push(`${colId} (container ${index})`);
          
          // Log detailed info for each column
          console.log(`🔍 Column: ${colId} | Container: ${index} | Text: "${cellText}" | HTML: ${cellHTML}`);
          
          // Check if this might be Polymarket based on content
          if (cellText.toLowerCase().includes('polymarket') || 
              cellHTML.toLowerCase().includes('polymarket') ||
              colId.toLowerCase().includes('poly')) {
            console.log(`🟢 POTENTIAL POLYMARKET COLUMN: ${colId} - Content: "${cellText}"`);
          }
        });
      }
    }
  });
  
  console.log(`🔍 All discovered columns after loading: [${allColumns.join(', ')}]`);
  
  // Check specifically for Polymarket (broader search)
  const polymarketColumns = allColumns.filter(col => 
    col.toLowerCase().includes('polymarket') || 
    col.toLowerCase().includes('poly')
  );
  if (polymarketColumns.length > 0) {
    console.log(`🟢 POLYMARKET COLUMNS FOUND: ${polymarketColumns.join(', ')}`);
  } else {
    console.log(`⚠️  NO POLYMARKET COLUMNS FOUND in discovered columns`);
  }
}

// Track discovered sportsbook columns and their names
const discoveredSportsbooks = new Set();
const colIdToSportsbookName = new Map();

// Build mapping from col-id to sportsbook name using header images
function buildSportsbookMapping() {
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  console.log('🗺️ Building col-id to sportsbook name mapping...');
  
  // Find all header cells
  const headerCells = grid.querySelectorAll('.ag-header-cell[col-id]');
  console.log(`Found ${headerCells.length} header cells with col-id`);
  
  headerCells.forEach(headerCell => {
    const colId = headerCell.getAttribute('col-id');
    
    // Look for img with alt attribute in this header cell
    const img = headerCell.querySelector('img[alt]');
    if (img) {
      const sportsbookName = img.getAttribute('alt');
      colIdToSportsbookName.set(colId, sportsbookName);
      console.log(`🗺️ Mapped: col-id="${colId}" → sportsbook="${sportsbookName}"`);
      
      // Special alert for Polymarket
      if (sportsbookName.toLowerCase().includes('polymarket')) {
        console.log(`🟢 POLYMARKET MAPPING FOUND: col-id="${colId}" → "${sportsbookName}"`);
      }
    } else {
      // Try to find alt text in any nested image
      const nestedImg = headerCell.querySelector('img');
      if (nestedImg && nestedImg.hasAttribute('alt')) {
        const sportsbookName = nestedImg.getAttribute('alt');
        colIdToSportsbookName.set(colId, sportsbookName);
        console.log(`🗺️ Mapped (nested): col-id="${colId}" → sportsbook="${sportsbookName}"`);
      }
    }
  });
  
  console.log(`🗺️ Mapping complete: ${colIdToSportsbookName.size} sportsbooks mapped`);
  console.log('🗺️ All mappings:', Array.from(colIdToSportsbookName.entries()));
}

// Monitor for new columns appearing in the DOM
function monitorNewColumns() {
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) return;
  
  // Check all containers for new columns
  const containers = [
    grid.querySelector('.ag-pinned-left-cols-container'),
    grid.querySelector('.ag-center-cols-container'),
    grid.querySelector('.ag-pinned-right-cols-container')
  ].filter(Boolean);
  
  containers.forEach(container => {
    const firstRow = container.querySelector('[role="row"]');
    if (!firstRow) return;
    
    const cells = firstRow.querySelectorAll('[col-id]');
    cells.forEach(cell => {
      const colId = cell.getAttribute('col-id');
      
      // Skip non-sportsbook columns
      if (['startTime', 'rotationNumber', 'teamName', 'bestPrice', 'averagePrice'].includes(colId)) {
        return;
      }
      
      // Check if this is a new sportsbook we haven't seen
      if (!discoveredSportsbooks.has(colId)) {
        discoveredSportsbooks.add(colId);
        
        // Get sportsbook name from mapping
        const sportsbookName = colIdToSportsbookName.get(colId) || 'Unknown';
        console.log(`📊 New sportsbook column discovered: ${colId} (${sportsbookName})`);
        
        // Enhanced alert for Polymarket using the mapped name
        if (sportsbookName.toLowerCase().includes('polymarket')) {
          const cellText = cell.textContent?.trim() || '';
          const cellHTML = cell.innerHTML;
          console.log(`🟢 POLYMARKET COLUMN NOW AVAILABLE: ${colId} → "${sportsbookName}"`);
          console.log(`🟢 POLYMARKET cell content: "${cellText}"`);
          console.log(`🟢 POLYMARKET cell HTML:`, cellHTML.substring(0, 200));
        }
      }
    });
  });
  
  return discoveredSportsbooks.size;
}

async function checkAndSendUpdates() {
  console.warn('⛔ VISUAL SCRAPING DISABLED - Content script should not be running active scraping');
  console.warn('⛔ This system now uses ONLY API scraping via Scrapy unified monitor');
  console.warn('⛔ If you see this, visual scraping was incorrectly triggered');
  
  // Send message to background to log this should not happen
  try {
    await chrome.runtime.sendMessage({
      type: 'VISUAL_SCRAPING_ATTEMPTED',
      url: window.location.href,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Could not notify background of visual scraping attempt:', error);
  }
  
  return; // EXIT IMMEDIATELY - NO VISUAL SCRAPING
  
  // ========== DISABLED VISUAL SCRAPING CODE BELOW ==========
  // Check if extension context is still valid
  if (extensionInvalidated || !isExtensionContextValid()) {
    console.log('Extension context invalidated - stopping scraper');
    cleanup();
    return;
  }
  
  console.log('checkAndSendUpdates called');
  
  // First, check if this URL is active in the database
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_URL_ACTIVE',
      url: window.location.href
    });
    
    if (!response || !response.active) {
      console.log('🛑 URL is not active in database - stopping visual scraper');
      return;
    }
    
    if (response.preferredMethod === 'scrapy') {
      console.log('🛑 URL is set to scrapy method - stopping visual scraper');
      return;
    }
    
    console.log('✅ URL is active for visual scraping');
  } catch (error) {
    console.error('Error checking URL status:', error);
    // Continue with scraping if database check fails
  }
  
  // Rebuild mapping in case new columns appeared
  buildSportsbookMapping();
  
  // Monitor for new columns without scrolling
  const columnCount = monitorNewColumns();
  console.log(`Currently tracking ${columnCount} sportsbook columns`);
  
  // Choose scraping method based on configuration
  let data = null;
  
  // Detailed diagnostics for method selection
  console.log('🔍 SCRAPING METHOD DIAGNOSTICS:');
  console.log('   Configuration approach:', SCRAPING_CONFIG.approach);
  console.log('   API scraper loaded:', !!apiScraper);
  console.log('   API scraper available:', apiScraper ? apiScraper.isAvailable() : false);
  console.log('   API endpoints discovered:', apiScraper ? apiScraper.endpoints.size : 0);
  
  if (apiScraper) {
    console.log('   API endpoints details:');
    apiScraper.endpoints.forEach((endpoint, key) => {
      console.log('     -', key, endpoint.path);
    });
    
    const oddsEndpoints = apiScraper.findOddsEndpoints();
    console.log('   Odds-related endpoints:', oddsEndpoints.length);
    oddsEndpoints.forEach(endpoint => {
      console.log('     - ODDS:', endpoint.method, endpoint.path);
    });
  } else {
    console.log('   ❌ API scraper not loaded - check for errors above');
  }
  
  if (SCRAPING_CONFIG.approach === 'api' && apiScraper && apiScraper.isAvailable()) {
    console.log('🎯 Using API-based scraping');
    
    // Update status indicator
    if (window.scrapingStatusIndicator) {
      window.scrapingStatusIndicator.setMethod('API');
      window.scrapingStatusIndicator.setStatus('API polling active');
      window.scrapingStatusIndicator.setApiEndpoints(apiScraper.endpoints.size);
    }
    
    // API scraper handles its own data sending
    if (!apiScraper.activePolling || apiScraper.activePolling.size === 0) {
      const success = await apiScraper.startAPIScraping();
      if (!success) {
        console.log('⚠️ API scraping failed, falling back to visual scraping');
        data = await performVisualScraping();
      } else {
        return; // API scraper will handle data sending
      }
    } else {
      return; // API scraping already active
    }
  } else if (SCRAPING_CONFIG.approach === 'hybrid' && apiScraper && apiScraper.isAvailable()) {
    console.log('🔄 Using hybrid scraping (API + Visual)');
    
    // Update status indicator
    if (window.scrapingStatusIndicator) {
      window.scrapingStatusIndicator.setMethod('Hybrid');
      window.scrapingStatusIndicator.setStatus('Hybrid mode active');
      window.scrapingStatusIndicator.setApiEndpoints(apiScraper.endpoints.size);
    }
    
    // Try API first, fall back to visual if needed
    const apiSuccess = await apiScraper.startAPIScraping();
    if (!apiSuccess) {
      console.log('⚠️ API unavailable, using visual scraping');
      data = await performVisualScraping();
    } else {
      return; // API scraper will handle data sending
    }
  } else {
    // Explain why we're using visual scraping
    let reason = 'Configuration set to Visual DOM';
    if (SCRAPING_CONFIG.approach === 'api' || SCRAPING_CONFIG.approach === 'hybrid') {
      if (!apiScraper) {
        reason = 'API scraper failed to load';
      } else if (!apiScraper.isAvailable()) {
        if (apiScraper.endpoints.size === 0) {
          reason = 'No API endpoints discovered on this site';
        } else {
          const oddsEndpoints = apiScraper.findOddsEndpoints();
          if (oddsEndpoints.length === 0) {
            reason = `Found ${apiScraper.endpoints.size} endpoints but none contain odds data`;
          } else {
            reason = 'API endpoints available but scraper reports unavailable';
          }
        }
      }
    }
    
    console.log('👁️ Using visual DOM scraping - Reason:', reason);
    
    // Update status indicator with diagnostic info
    if (window.scrapingStatusIndicator) {
      window.scrapingStatusIndicator.setMethod('Visual DOM');
      window.scrapingStatusIndicator.setStatus(reason);
      
      if (SCRAPING_CONFIG.approach === 'api' || SCRAPING_CONFIG.approach === 'hybrid') {
        window.scrapingStatusIndicator.flash(`API unavailable: ${reason}`, 'error');
      }
    }
    
    data = await performVisualScraping();
    
    // Update status indicator
    if (window.scrapingStatusIndicator) {
      window.scrapingStatusIndicator.setMethod('Visual DOM');
      window.scrapingStatusIndicator.setStatus(data && data.games.length > 0 ? 
        `Found ${data.games.length} games` : 'No games found');
      window.scrapingStatusIndicator.setApiEndpoints(0);
    }
  }
  
  if (!data || data.games.length === 0) {
    console.log('No data scraped or no games found');
    return;
  }
  
  console.log('Scraped data:', data.games.length, 'games');
  
  // Log details about first game to see what odds we have
  if (data.games.length > 0) {
    const firstGame = data.games[0];
    console.log('First game details:', {
      teams: `${firstGame.homeTeam} vs ${firstGame.awayTeam}`,
      sport: firstGame.sport,
      betType: firstGame.betType,
      oddsCount: Object.keys(firstGame.odds).length,
      odds: firstGame.odds,
      bestOdds: `${firstGame.bestHomeOdds}/${firstGame.bestAwayOdds}`,
      avgOdds: `${firstGame.avgHomeOdds}/${firstGame.avgAwayOdds}`
    });
  }
  
  const currentHash = generateDataHash(data);
  
  if (currentHash !== lastDataHash || lastDataHash === null) {
    const isForced = lastDataHash === null;
    console.log(`${isForced ? '🔄 FORCED' : '📊 DATA CHANGED'}: Sending update with ${data.games.length} games`);
    if (isForced) {
      console.log('📡 Full refresh - sending all data regardless of changes');
    }
    lastDataHash = currentHash;
    sendData(data);
  } else {
    console.log('📋 Data unchanged - using cached version');
  }
}

// Set up mutation observer for dynamic content
function setupObserver() {
  if (observer) observer.disconnect();
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) {
    // Try again in a second
    setTimeout(setupObserver, 1000);
    return;
  }
  
  observer = new MutationObserver((mutations) => {
    // Debounce updates
    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(async () => {
      await checkAndSendUpdates();
    }, 500);
  });
  
  observer.observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['col-id', 'row-id']
  });
  
  console.log('Observer set up successfully');
}

// Initialize scraping
async function initialize() {
  console.log('Initializing sportsbook scraper');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);
  
  // Load league mappings first
  await loadLeagueMappings();
  
  // Set up observer
  setupObserver();
  
  // Initial scrape
  setTimeout(async () => {
    console.log('Running initial scrape...');
    await checkAndSendUpdates();
  }, 2000);
  
  // Set up periodic checks
  if (scrapeInterval) clearInterval(scrapeInterval);
  scrapeInterval = setInterval(async () => {
    await checkAndSendUpdates();
  }, 5000);
  
  // Set up forced full refresh every 5 minutes to ensure we don't miss data
  if (fullRefreshInterval) clearInterval(fullRefreshInterval);
  fullRefreshInterval = setInterval(async () => {
    console.log('🔄 FORCED FULL REFRESH: Clearing cache and forcing complete data resend');
    lastDataHash = null; // Clear cache to force sending data even if unchanged
    await checkAndSendUpdates();
  }, 5 * 60 * 1000); // 5 minutes
}

// Cleanup function for extension invalidation
function cleanup() {
  console.log('Cleaning up scraper resources');
  extensionInvalidated = true;
  
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
  }
  
  if (fullRefreshInterval) {
    clearInterval(fullRefreshInterval);
    fullRefreshInterval = null;
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', cleanup);

// Check if we're on a sportsbook page
function initializeIfApplicable() {
  // Check if extension context is valid before initializing
  if (!isExtensionContextValid()) {
    console.log('Extension context invalid - not initializing scraper');
    return;
  }
  
  // Detect layout first
  const layout = detectLayout();
  const SELECTORS = getSelectors();
  
  if (window.location.href.includes('odds') || document.querySelector(SELECTORS.grid.root)) {
    console.log(`Initializing scraper with layout: ${layout.name}`);
    initialize();
  } else {
    console.log('Not a sportsbook page, scraper not initialized');
  }
}

// Message listener for popup controls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (extensionInvalidated) {
    sendResponse({ success: false, error: 'Extension invalidated' });
    return;
  }
  
  try {
    if (request.type === 'START_SCRAPING') {
      console.log('Starting scraping via popup control');
      if (!scrapeInterval) {
        initialize();
      }
      sendResponse({ success: true });
    } else if (request.type === 'STOP_SCRAPING') {
      console.log('Stopping scraping via popup control');
      cleanup();
      sendResponse({ success: true });
    } else if (request.type === 'CHECK_API_STATUS') {
      // Return API scraper status for diagnostics
      sendResponse({
        success: true,
        apiScraperLoaded: !!apiScraper,
        apiScraperAvailable: apiScraper ? apiScraper.isAvailable() : false,
        endpointsCount: apiScraper ? apiScraper.endpoints.size : 0,
        configApproach: SCRAPING_CONFIG.approach
      });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeIfApplicable);
} else {
  initializeIfApplicable();
}

// Global debug function for browser console access
window.debugAllColumns = function() {
  console.log('🔧 MANUAL COLUMN DEBUG - Starting comprehensive inspection...');
  
  const grid = document.querySelector('.ag-root, div.ag-root');
  if (!grid) {
    console.log('❌ No AG Grid found');
    return;
  }
  
  console.log('✅ AG Grid found:', grid);
  
  // First, build the sportsbook mapping
  if (typeof buildSportsbookMapping === 'function') {
    console.log('🗺️ Building sportsbook mapping...');
    // Call the function from the extension scope if available
    try {
      buildSportsbookMapping();
    } catch (e) {
      console.log('Could not call buildSportsbookMapping from debug function');
    }
  }
  
  // Show current mapping if available
  if (typeof colIdToSportsbookName !== 'undefined' && colIdToSportsbookName.size > 0) {
    console.log('🗺️ Current col-id to sportsbook mapping:');
    Array.from(colIdToSportsbookName.entries()).forEach(([colId, name]) => {
      console.log(`  ${colId} → ${name}`);
      if (name.toLowerCase().includes('polymarket')) {
        console.log(`    🟢 *** POLYMARKET FOUND IN MAPPING ***`);
      }
    });
  }
  
  // Check all possible containers
  const containerSelectors = [
    '.ag-pinned-left-cols-container',
    '.ag-center-cols-container', 
    '.ag-pinned-right-cols-container',
    '.ag-body-viewport',
    '.ag-center-cols-viewport'
  ];
  
  containerSelectors.forEach((selector, index) => {
    const container = grid.querySelector(selector);
    if (container) {
      console.log(`📦 Container ${index} (${selector}):`, container);
      
      // Get all rows
      const rows = container.querySelectorAll('[role="row"]');
      console.log(`  Found ${rows.length} rows`);
      
      if (rows.length > 0) {
        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('[col-id]');
        console.log(`  Found ${cells.length} cells with col-id in first row`);
        
        cells.forEach((cell, cellIndex) => {
          const colId = cell.getAttribute('col-id');
          const text = cell.textContent?.trim() || '';
          const html = cell.innerHTML.substring(0, 150);
          
          console.log(`    Cell ${cellIndex}: col-id="${colId}" | text="${text}" | html=${html}`);
          
          // Check for Polymarket indicators
          const isPolymarket = colId.toLowerCase().includes('polymarket') || 
                              colId.toLowerCase().includes('poly') ||
                              text.toLowerCase().includes('polymarket') ||
                              html.toLowerCase().includes('polymarket');
          
          if (isPolymarket) {
            console.log(`    🟢 *** POLYMARKET DETECTED IN CELL ${cellIndex} ***`);
          }
        });
      }
    } else {
      console.log(`❌ Container ${index} (${selector}) not found`);
    }
  });
  
  // Also check for any elements containing "polymarket" anywhere
  const allPolyElements = document.querySelectorAll('*');
  let polyCount = 0;
  Array.from(allPolyElements).forEach(el => {
    if (el.textContent?.toLowerCase().includes('polymarket') ||
        el.innerHTML?.toLowerCase().includes('polymarket') ||
        el.getAttribute('col-id')?.toLowerCase().includes('poly')) {
      polyCount++;
      if (polyCount <= 5) { // Only log first 5 to avoid spam
        console.log(`🔍 Element containing 'polymarket':`, el, 'Text:', el.textContent?.substring(0, 100));
      }
    }
  });
  console.log(`🔍 Found ${polyCount} elements containing 'polymarket'`);
  
  console.log('🔧 Manual column debug complete');
};

console.log('🔧 Debug function available: Run window.debugAllColumns() in console to inspect all columns');

})(); // End of IIFE