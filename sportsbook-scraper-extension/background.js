// Import configuration directly since ES6 modules work in service workers
// Database schema initialized and ready
const SUPABASE_CONFIG = {
  url: 'http://localhost:54320',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
};

const SCRAPER_CONFIG = {
  updateInterval: 5000, // Check for updates every 5 seconds
  retryAttempts: 3,
  retryDelay: 1000
};

let activeTabs = new Map();
let supabaseClient = null;

// Initialize Supabase client
async function initSupabase() {
  try {
    console.log('Attempting to connect to Supabase at:', SUPABASE_CONFIG.url);
    
    const response = await fetch(`${SUPABASE_CONFIG.url}/`, {
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`
      }
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    if (response.status >= 200 && response.status < 300) {
      supabaseClient = {
        url: SUPABASE_CONFIG.url,
        headers: {
          'apikey': SUPABASE_CONFIG.anonKey,
          'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        }
      };
      console.log('Supabase client initialized successfully');
      return true;
    } else {
      console.error('Supabase response not ok:', response.status, response.statusText);
      
      // Try a simple test without authentication
      try {
        const simpleTest = await fetch(`${SUPABASE_CONFIG.url}/`);
        console.log('Simple test response:', simpleTest.status);
        if (simpleTest.status >= 200 && simpleTest.status < 300) {
          // Connection works but auth might be the issue
          supabaseClient = {
            url: SUPABASE_CONFIG.url,
            headers: {
              'apikey': SUPABASE_CONFIG.anonKey,
              'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            }
          };
          console.log('Supabase client initialized with basic connection');
          return true;
        }
      } catch (e) {
        console.error('Simple test also failed:', e);
      }
    }
  } catch (error) {
    console.error('Failed to initialize Supabase:', error);
  }
  return false;
}

// Send data to Supabase with retry logic
async function sendToSupabase(tableName, data, retryCount = 0) {
  if (!supabaseClient) {
    console.error('Supabase client not initialized');
    return false;
  }

  try {
    const url = `${supabaseClient.url}/${tableName}`;
    
    // Only log send attempts, not full data
    if (retryCount === 0) {
      console.log(`Sending to ${tableName}:`, data.game_id || data.sportsbook || 'record');
    } else {
      console.log(`Retry ${retryCount}: Sending to ${tableName}`);
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: supabaseClient.headers,
      body: JSON.stringify(data)
    });

    // Only log successful responses or non-409 errors
    if (response.ok || response.status !== 409) {
      console.log(`Response status for ${tableName}:`, response.status, response.statusText);
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Handle duplicate key errors gracefully
      if (response.status === 409 && errorText.includes('duplicate key')) {
        console.log(`Record already exists in ${tableName}, skipping insert`);
        return true; // Consider it successful since the record exists
      }
      
      // Only log non-duplicate errors
      console.error(`HTTP error! status: ${response.status}, body:`, errorText);
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    console.log(`Successfully inserted into ${tableName}`);
    return true;
  } catch (error) {
    // Handle network errors with exponential backoff
    if (error.name === 'TypeError' && error.message === 'Failed to fetch' && retryCount < 3) {
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000); // 1s, 2s, 4s (max 8s)
      console.log(`Network error, retrying in ${backoffDelay/1000}s (attempt ${retryCount + 1}/3)...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return sendToSupabase(tableName, data, retryCount + 1);
    }
    
    // Don't log duplicate key errors as errors
    if (!error.message.includes('duplicate key')) {
      console.error('Error sending to Supabase:', error);
    }
    return false;
  }
}

// Update existing data in Supabase with retry logic
async function updateInSupabase(tableName, id, data, retryCount = 0) {
  if (!supabaseClient) return false;

  try {
    const url = `${supabaseClient.url}/${tableName}?id=eq.${id}`;
    
    if (retryCount === 0) {
      console.log(`Updating ${tableName} record ${id}`);
    }
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: supabaseClient.headers,
      body: JSON.stringify(data)
    });

    if (response.ok || response.status !== 503) {
      console.log(`Update response for ${tableName}:`, response.status, response.statusText);
    }
    return response.ok;
  } catch (error) {
    // Handle network errors with exponential backoff
    if (error.name === 'TypeError' && error.message === 'Failed to fetch' && retryCount < 3) {
      const backoffDelay = Math.min(1000 * Math.pow(2, retryCount), 8000);
      console.log(`Network error on update, retrying in ${backoffDelay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return updateInSupabase(tableName, id, data, retryCount + 1);
    }
    
    console.error('Error updating in Supabase:', error);
    return false;
  }
}

// Check if record exists with retry logic
async function checkExistsInSupabase(tableName, filters, retryCount = 0) {
  if (!supabaseClient) return null;

  try {
    const queryParams = Object.entries(filters)
      .map(([key, value]) => `${key}=eq.${encodeURIComponent(value)}`)
      .join('&');

    const url = `${supabaseClient.url}/${tableName}?${queryParams}&select=*&limit=1`;
    
    // Reduced logging for existence checks
    if (retryCount === 0) {
      console.log(`Checking ${tableName}:`, Object.values(filters)[0].substring(0, 50) + '...');
    }
    
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseClient.headers.apikey,
        'Authorization': supabaseClient.headers.Authorization,
        'Prefer': 'count=exact'
      }
    });

    if (!response.ok) {
      console.error(`Failed to check existence in ${tableName}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.length > 0 ? data[0] : null;
  } catch (error) {
    // Handle network errors with exponential backoff
    if (error.name === 'TypeError' && error.message === 'Failed to fetch' && retryCount < 3) {
      const backoffDelay = Math.min(500 * Math.pow(2, retryCount), 4000); // 500ms, 1s, 2s
      console.log(`Network error on check, retrying in ${backoffDelay/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      return checkExistsInSupabase(tableName, filters, retryCount + 1);
    }
    
    console.error('Error checking existence:', error);
    // Return null on error, which will cause insert attempt
    // The insert will handle duplicate key errors gracefully
    return null;
  }
}

// Get analytics data from database
async function getAnalyticsData() {
  if (!supabaseClient) {
    throw new Error('Database not connected');
  }

  try {
    // Get games data
    const gamesResponse = await fetch(`${supabaseClient.url}/games?select=*`, {
      headers: {
        'apikey': supabaseClient.headers.apikey,
        'Authorization': supabaseClient.headers.Authorization
      }
    });

    if (!gamesResponse.ok) {
      throw new Error(`Failed to fetch games: ${gamesResponse.status}`);
    }

    const games = await gamesResponse.json();

    // Get odds data
    const oddsResponse = await fetch(`${supabaseClient.url}/odds?select=*`, {
      headers: {
        'apikey': supabaseClient.headers.apikey,
        'Authorization': supabaseClient.headers.Authorization
      }
    });

    if (!oddsResponse.ok) {
      throw new Error(`Failed to fetch odds: ${oddsResponse.status}`);
    }

    const odds = await oddsResponse.json();

    return {
      games: games || [],
      odds: odds || [],
      evOpportunities: [], // Will be calculated on frontend
      arbOpportunities: [] // Will be calculated on frontend
    };
  } catch (error) {
    console.error('Error getting analytics data:', error);
    throw error;
  }
}

// Get games count from database
async function getGamesCount() {
  if (!supabaseClient) return 0;

  try {
    const url = `${supabaseClient.url}/games?select=count`;
    const response = await fetch(url, {
      headers: {
        'apikey': supabaseClient.headers.apikey,
        'Authorization': supabaseClient.headers.Authorization,
        'Prefer': 'count=exact'
      }
    });

    if (!response.ok) return 0;
    
    const countHeader = response.headers.get('content-range');
    if (countHeader) {
      const match = countHeader.match(/\/(\d+)$/);
      return match ? parseInt(match[1]) : 0;
    }
    
    return 0;
  } catch (error) {
    console.error('Error getting games count:', error);
    return 0;
  }
}

// Process scraped data
async function processScrapedData(data, tabId, url) {
  const timestamp = new Date().toISOString();
  console.log('processScrapedData: Processing', data.games.length, 'games');
  
  // Calculate total odds across all games
  let totalOddsEntries = 0;
  let gamesWithOdds = 0;
  let oddsBreakdown = {};
  
  data.games.forEach((game, index) => {
    const gameOddsCount = Object.keys(game.odds).length;
    totalOddsEntries += gameOddsCount;
    if (gameOddsCount > 0) gamesWithOdds++;
    
    console.log(`Game ${index + 1}: ${game.homeTeam} vs ${game.awayTeam} - ${gameOddsCount} sportsbooks`);
    
    // Log sportsbook names for first few games
    if (index < 3) {
      console.log(`  Sportsbooks: ${Object.keys(game.odds).join(', ')}`);
    }
    
    // Track sportsbook frequency
    Object.keys(game.odds).forEach(sportsbook => {
      oddsBreakdown[sportsbook] = (oddsBreakdown[sportsbook] || 0) + 1;
    });
  });
  
  console.log(`Total odds entries across all games: ${totalOddsEntries}`);
  console.log(`Games with odds: ${gamesWithOdds}/${data.games.length}`);
  console.log('Sportsbook frequency:', oddsBreakdown);
  console.log('processScrapedData: Sample game data structure:', JSON.stringify(data.games[0], null, 2));
  
  // Process games sequentially with a small delay between each
  for (let i = 0; i < data.games.length; i++) {
    const game = data.games[i];
    
    // Add a small delay between processing games to avoid overwhelming the database
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Create unique game identifier
    const gameId = `${game.sport}_${game.league}_${game.homeTeam}_${game.awayTeam}_${game.startTime}`.replace(/\s+/g, '_');
    console.log(`Processing game ${i + 1}/${data.games.length}: ${game.homeTeam} vs ${game.awayTeam}, odds count: ${Object.keys(game.odds).length}`);
    
    // Check if game exists
    const existingGame = await checkExistsInSupabase('games', { game_id: gameId });
    
    if (!existingGame) {
      // Insert new game
      const gameInserted = await sendToSupabase('games', {
        game_id: gameId,
        sport: game.sport,
        league: game.league,
        bet_type: game.betType,
        market_info: `${game.marketType} (${game.outcomes} outcomes)`,
        home_team: game.homeTeam,
        away_team: game.awayTeam,
        home_rotation: game.homeRotation,
        away_rotation: game.awayRotation,
        start_time: game.startTime,
        start_time_parsed: game.startTimeParsed,
        game_status: game.gameStatus,
        inning_info: game.inningInfo,
        game_url: game.gameUrl,
        created_at: timestamp
      });
    } else {
      // Update existing game with latest status
      await updateInSupabase('games', existingGame.id, {
        game_status: game.gameStatus,
        inning_info: game.inningInfo,
        updated_at: timestamp
      });
    }
    
    // Process odds for each sportsbook
    console.log(`Processing odds for game ${gameId}:`, game.odds);
    for (const [sportsbook, odds] of Object.entries(game.odds)) {
      if (odds && (odds.home || odds.away)) {
        console.log(`Processing odds for ${sportsbook}:`, odds);
        const oddsData = {
          game_id: gameId,
          sportsbook: sportsbook,
          home_odds: odds.home?.american || null,
          away_odds: odds.away?.american || null,
          home_odds_percent: odds.home?.percentage || null,
          away_odds_percent: odds.away?.percentage || null,
          odds_format: odds.format || 'unknown',
          best_home_odds: game.bestHomeOdds?.american || null,
          best_away_odds: game.bestAwayOdds?.american || null,
          avg_home_odds: game.avgHomeOdds?.american || null,
          avg_away_odds: game.avgAwayOdds?.american || null,
          timestamp: timestamp,
          url: url
        };
        
        // Check if this specific odds entry exists
        const existingOdds = await checkExistsInSupabase('odds', {
          game_id: gameId,
          sportsbook: sportsbook
        });
        
        if (existingOdds) {
          // Check if odds have changed (compare both American and percentage)
          const americanChanged = existingOdds.home_odds !== oddsData.home_odds || existingOdds.away_odds !== oddsData.away_odds;
          const percentChanged = existingOdds.home_odds_percent !== oddsData.home_odds_percent || existingOdds.away_odds_percent !== oddsData.away_odds_percent;
          
          if (americanChanged || percentChanged) {
            // Store historical record
            await sendToSupabase('odds_history', {
              ...oddsData,
              previous_home_odds: existingOdds.home_odds,
              previous_away_odds: existingOdds.away_odds,
              previous_home_odds_percent: existingOdds.home_odds_percent,
              previous_away_odds_percent: existingOdds.away_odds_percent
            });
            
            // Update current odds
            await updateInSupabase('odds', existingOdds.id, oddsData);
          }
        } else {
          // Insert new odds
          await sendToSupabase('odds', oddsData);
        }
      }
    }
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.type);
  
  if (request.type === 'SCRAPED_DATA') {
    const tabId = sender.tab.id;
    const url = sender.tab.url;
    
    console.log('Processing scraped data from tab', tabId, 'with', request.data.games.length, 'games');
    console.log('Total odds entries:', 
      request.data.games.reduce((sum, game) => sum + Object.keys(game.odds).length, 0));
    
    // Store tab as active
    activeTabs.set(tabId, {
      url: url,
      lastUpdate: Date.now()
    });
    
    // Process the data
    processScrapedData(request.data, tabId, url)
      .then(() => {
        console.log('Data processing completed successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error processing data:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'GET_STATUS') {
    // Get games count from database
    getGamesCount().then(gamesCount => {
      sendResponse({
        initialized: !!supabaseClient,
        activeTabs: Array.from(activeTabs.entries()).map(([id, data]) => ({
          id,
          ...data
        })),
        gamesCount
      });
    }).catch(error => {
      console.error('Error getting games count:', error);
      sendResponse({
        initialized: !!supabaseClient,
        activeTabs: Array.from(activeTabs.entries()).map(([id, data]) => ({
          id,
          ...data
        })),
        gamesCount: 0
      });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'GET_ANALYTICS_DATA') {
    // Get analytics data from database
    getAnalyticsData().then(data => {
      sendResponse({
        success: true,
        data: data
      });
    }).catch(error => {
      console.error('Error getting analytics data:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    
    return true; // Keep message channel open for async response
  }
});

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  initSupabase();
});

// Also initialize when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  initSupabase();
});

// Initialize immediately
initSupabase();