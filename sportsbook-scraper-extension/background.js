// Import configuration directly since ES6 modules work in service workers
// Database schema initialized and ready
const SUPABASE_CONFIG = {
  url: 'http://localhost:54320',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
};

const SCRAPER_CONFIG = {
  updateInterval: 5000, // Check for updates every 5 seconds
  retryAttempts: 3,
  retryDelay: 1000,
  freezeDetection: {
    timeout: 300000, // 5 minutes without updates = frozen
    checkInterval: 60000 // Check every minute
  }
};

let activeTabs = new Map();
let supabaseClient = null;

// Configuration management
let currentConfig = null;

// Data ingestion tracking
let dataIngestionHistory = [];
let lastDataIngestion = null;
let perUrlIngestionStats = new Map(); // Track stats per URL
let lastCleanupTime = null;

// Data quality tracking
let globalDataQuality = {
  totalOddsProcessed: 0,
  completeOddsInserted: 0,
  incompleteOddsSkipped: 0,
  gamesWithIncompleteData: 0,
  lastQualityCheck: null,
  incompleteByReason: new Map(),
  incompleteByBook: new Map()
};

// Multi-tab coordination tracking
let tabPositionRegistry = new Map(); // url -> { nextPosition, tabs: Map(tabId -> position) }

// API endpoint discovery storage
let discoveredEndpoints = new Map(); // domain -> { endpoints: [], lastUpdated: Date }

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

// Default league mappings
const DEFAULT_LEAGUE_MAPPINGS = {
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

// Load configuration from storage
async function loadConfig() {
  try {
    const result = await chrome.storage.local.get(['scraperConfig', 'leagueMappings']);
    currentConfig = result.scraperConfig || {
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
        evCalculationMethod: 'worst-odds'
      },
      dataManagement: {
        retentionPeriod: 7,   // days
        autoCleanup: true
      }
    };
    
    // Load league mappings or use defaults
    currentConfig.leagueMappings = result.leagueMappings || DEFAULT_LEAGUE_MAPPINGS;
    
    console.log('Configuration loaded:', currentConfig);
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

// Game matching function - checks if two games are the same
function isGameMatch(game1, game2, config) {
  if (!config.gameMatching.matchTeams || !config.gameMatching.matchSport) {
    return false;
  }
  
  // Check team matching
  if (config.gameMatching.matchTeams) {
    if (game1.home_team !== game2.home_team || game1.away_team !== game2.away_team) {
      return false;
    }
  }
  
  // Check sport/league matching
  if (config.gameMatching.matchSport) {
    if (game1.sport !== game2.sport || game1.league !== game2.league) {
      return false;
    }
  }
  
  // Check time window (configurable hours)
  const time1 = new Date(game1.game_time);
  const time2 = new Date(game2.game_time);
  const timeDiff = Math.abs(time1 - time2) / (1000 * 60 * 60); // hours
  
  return timeDiff <= config.gameMatching.timeWindow;
}

// Check if game exists and get its ID
async function findExistingGame(gameData) {
  if (!supabaseClient || !currentConfig) {
    return null;
  }
  
  try {
    // Query for games with same teams within time window
    const timeWindow = currentConfig.gameMatching.timeWindow;
    const gameTime = new Date(gameData.game_time);
    const startTime = new Date(gameTime.getTime() - (timeWindow * 60 * 60 * 1000));
    const endTime = new Date(gameTime.getTime() + (timeWindow * 60 * 60 * 1000));
    
    const response = await fetch(
      `${supabaseClient.url}/games?` +
      `home_team=eq.${encodeURIComponent(gameData.home_team)}&` +
      `away_team=eq.${encodeURIComponent(gameData.away_team)}&` +
      `game_time=gte.${startTime.toISOString()}&` +
      `game_time=lte.${endTime.toISOString()}`,
      {
        headers: supabaseClient.headers
      }
    );
    
    if (response.ok) {
      const games = await response.json();
      if (games && games.length > 0) {
        // Find best match using game matching logic
        for (const existingGame of games) {
          if (isGameMatch(gameData, existingGame, currentConfig)) {
            return existingGame.game_id;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error finding existing game:', error);
  }
  
  return null;
}

// Clean up old odds data based on configuration
async function cleanupOldOdds() {
  if (!supabaseClient || !currentConfig) {
    return;
  }
  
  try {
    const cutoffMinutes = currentConfig.refresh.oddsWindow || 30;
    const cutoffTime = new Date(Date.now() - (cutoffMinutes * 60 * 1000));
    
    console.log(`Cleaning up odds older than ${cutoffMinutes} minutes (before ${cutoffTime.toISOString()})`);
    
    const response = await fetch(
      `${supabaseClient.url}/odds?created_at=lt.${cutoffTime.toISOString()}`,
      {
        method: 'DELETE',
        headers: supabaseClient.headers
      }
    );
    
    if (response.ok) {
      console.log('Old odds data cleaned up successfully');
    } else {
      console.error('Failed to cleanup old odds:', response.status);
    }
  } catch (error) {
    console.error('Error cleaning up old odds:', error);
  }
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
        ...supabaseClient.headers,
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

// Get data quality summary
function getDataQualitySummary() {
  const total = globalDataQuality.totalOddsProcessed;
  const complete = globalDataQuality.completeOddsInserted;
  const incomplete = globalDataQuality.incompleteOddsSkipped;
  
  return {
    totalOddsProcessed: total,
    completeOddsInserted: complete,
    incompleteOddsSkipped: incomplete,
    completionRate: total > 0 ? ((complete / total) * 100).toFixed(2) : '100.00',
    dataLossRate: total > 0 ? ((incomplete / total) * 100).toFixed(2) : '0.00',
    gamesWithIncompleteData: globalDataQuality.gamesWithIncompleteData,
    lastQualityCheck: globalDataQuality.lastQualityCheck,
    incompleteReasons: Array.from(globalDataQuality.incompleteByReason.entries()).map(([reason, count]) => ({
      reason,
      count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(2) : '0.00'
    })),
    problematicSportsbooks: Array.from(globalDataQuality.incompleteByBook.entries()).map(([book, count]) => ({
      sportsbook: book,
      incompleteCount: count,
      percentage: total > 0 ? ((count / total) * 100).toFixed(2) : '0.00'
    })).sort((a, b) => b.incompleteCount - a.incompleteCount)
  };
}

// Log periodic data quality summary
function logDataQualitySummary() {
  const summary = getDataQualitySummary();
  
  console.log(`📊 DATA QUALITY SUMMARY:`);
  console.log(`   Total odds processed: ${summary.totalOddsProcessed}`);
  console.log(`   Complete odds inserted: ${summary.completeOddsInserted}`);
  console.log(`   Incomplete odds skipped: ${summary.incompleteOddsSkipped}`);
  console.log(`   Completion rate: ${summary.completionRate}%`);
  console.log(`   Data loss rate: ${summary.dataLossRate}%`);
  console.log(`   Games with incomplete data: ${summary.gamesWithIncompleteData}`);
  
  if (summary.incompleteReasons.length > 0) {
    console.log(`   Common incomplete reasons:`, summary.incompleteReasons);
  }
  
  if (summary.problematicSportsbooks.length > 0) {
    console.log(`   Sportsbooks with incomplete data:`, summary.problematicSportsbooks.slice(0, 5));
  }
}

// Get analytics data from database
async function getAnalyticsData(hoursBack = 24) {
  if (!supabaseClient) {
    throw new Error('Database not connected');
  }

  try {
    // Calculate cutoff time based on provided hours (in UTC to match database)
    const cutoffTime = new Date(Date.now() - (hoursBack * 60 * 60 * 1000));
    console.log(`Filtering to show games from last ${hoursBack} hours`);
    console.log(`Cutoff time (UTC): ${cutoffTime.toISOString()}`);
    console.log(`Current time (UTC): ${new Date().toISOString()}`);
    
    // Get ONLY the latest games per game_id to avoid duplicates
    console.log('Fetching latest games data (deduplicating by game_id)');
    
    let games;
    
    // First get game_ids from odds within the time period
    const oddsGameIdsResponse = await fetch(`${supabaseClient.url}/odds?select=game_id&created_at=gte.${cutoffTime.toISOString()}`, {
      headers: supabaseClient.headers
    });
    
    if (!oddsGameIdsResponse.ok) {
      throw new Error(`Failed to fetch game IDs from odds: ${oddsGameIdsResponse.status}`);
    }
    
    const oddsRecords = await oddsGameIdsResponse.json();
    const uniqueGameIds = [...new Set(oddsRecords.map(record => record.game_id))];
    
    if (uniqueGameIds.length === 0) {
      console.log('No games found with odds in the specified time period');
      games = [];
    } else {
      // Fetch games for these IDs
      const gameIdFilter = uniqueGameIds.map(id => `"${id}"`).join(',');
      const fallbackResponse = await fetch(`${supabaseClient.url}/games?select=*&game_id=in.(${gameIdFilter})&order=created_at.desc`, {
        headers: supabaseClient.headers
      });
      
      if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch games: ${fallbackResponse.status}`);
      }
      
      const allGames = await fallbackResponse.json();
      console.log(`📦 Fetched ${allGames.length} total game records from database`);
      
      // Deduplicate in JavaScript - keep only latest game per game_id
      const latestGamesMap = new Map();
      const duplicateCounts = new Map();
      
      allGames.forEach(game => {
        // Count duplicates per game_id
        duplicateCounts.set(game.game_id, (duplicateCounts.get(game.game_id) || 0) + 1);
        
        if (!latestGamesMap.has(game.game_id) || new Date(game.created_at) > new Date(latestGamesMap.get(game.game_id).created_at)) {
          latestGamesMap.set(game.game_id, game);
        }
      });
      
      games = Array.from(latestGamesMap.values());
      console.log(`✅ DEDUPLICATION: ${allGames.length} games → ${games.length} unique games`);
      
      // Log duplicate stats
      const totalDuplicates = allGames.length - games.length;
      if (totalDuplicates > 0) {
        console.log(`🔄 Removed ${totalDuplicates} duplicate game records`);
        
        // Find games with most duplicates
        const topDuplicates = Array.from(duplicateCounts.entries())
          .filter(([_, count]) => count > 5)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
          
        if (topDuplicates.length > 0) {
          console.log('Top duplicated games:', topDuplicates.map(([id, count]) => `${id}: ${count}x`).join(', '));
        }
      }
    }
    
    // Map database fields to expected frontend fields  
    const deduplicatedGames = games.map(game => ({
      ...game,
      game_time: game.start_time_parsed || game.start_time
    }));

    // Get ONLY the latest odds per game_id/sportsbook combination to avoid duplicates
    // Use a window function to get only the most recent odds for each unique combination
    console.log('Fetching latest odds data (deduplicating by game_id/sportsbook)');
    const oddsQuery = `
      select distinct on (game_id, sportsbook) *
      from odds 
      where created_at >= '${cutoffTime.toISOString()}'
      order by game_id, sportsbook, created_at desc
    `;
    
    const oddsResponse = await fetch(`${supabaseClient.url}/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        ...supabaseClient.headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: oddsQuery })
    });

    let odds;
    if (!oddsResponse.ok) {
      console.warn('RPC query failed, falling back to basic odds fetch');
      // Fallback to basic fetch and deduplicate in JavaScript
      const fallbackResponse = await fetch(`${supabaseClient.url}/odds?select=*&created_at=gte.${cutoffTime.toISOString()}&order=created_at.desc`, {
        headers: supabaseClient.headers
      });
      
      if (!fallbackResponse.ok) {
        throw new Error(`Failed to fetch odds: ${fallbackResponse.status}`);
      }
      
      const allOdds = await fallbackResponse.json();
      
      // Deduplicate in JavaScript - keep only latest odds per game_id/sportsbook
      const latestOddsMap = new Map();
      allOdds.forEach(odd => {
        const key = `${odd.game_id}-${odd.sportsbook}`;
        if (!latestOddsMap.has(key) || new Date(odd.created_at) > new Date(latestOddsMap.get(key).created_at)) {
          latestOddsMap.set(key, odd);
        }
      });
      
      odds = Array.from(latestOddsMap.values());
      console.log(`Deduplicated ${allOdds.length} odds records to ${odds.length} latest records`);
    } else {
      odds = await oddsResponse.json();
      console.log(`Retrieved ${odds.length} deduplicated odds records from last ${hoursBack} hours`);
    }
    
    console.log(`Using latest odds only - ${odds.length} records after deduplication`);

    return {
      games: deduplicatedGames || [],
      odds: odds || [],
      filteredSince: cutoffTime.toISOString(),
      evOpportunities: [], // Will be calculated on frontend
      arbOpportunities: [], // Will be calculated on frontend
      dataQuality: getDataQualitySummary(),
      ingestionData: {
        history: dataIngestionHistory,
        lastIngestion: lastDataIngestion,
        activeTabs: Array.from(activeTabs.entries()).map(([tabId, data]) => ({
          tabId,
          url: data.url,
          lastUpdate: data.lastUpdate,
          lastDataReceived: data.lastDataReceived,
          consecutiveFailures: data.consecutiveFailures || 0,
          totalDataReceived: data.totalDataReceived || 0,
          lastReload: data.lastReload || null
        })),
        perUrlStats: Array.from(perUrlIngestionStats.values())
      }
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
        ...supabaseClient.headers,
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
  
  // Periodic cleanup and quality reporting (every 10 minutes)
  const now = Date.now();
  if (!lastCleanupTime || (now - lastCleanupTime) > 10 * 60 * 1000) {
    console.log('Running periodic odds cleanup...');
    cleanupOldOdds();
    logDataQualitySummary();
    lastCleanupTime = now;
  }
  
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
    
    // Create unique game identifier with normalized sport
    // Normalize sport to avoid MLB vs BASEBALL inconsistency
    const normalizedSport = game.league === 'MLB' ? 'BASEBALL' : game.sport;
    const gameId = `${normalizedSport}_${game.league}_${game.homeTeam}_${game.awayTeam}_${game.startTime}`.replace(/\s+/g, '_');
    console.log(`Processing game ${i + 1}/${data.games.length}: ${game.homeTeam} vs ${game.awayTeam}, odds count: ${Object.keys(game.odds).length}`);
    
    // Prepare game data for matching
    const gameData = {
      game_id: gameId,
      sport: normalizedSport,
      league: game.league,
      home_team: game.homeTeam,
      away_team: game.awayTeam,
      game_time: game.startTimeParsed || game.startTime,
      name: `${game.homeTeam} vs ${game.awayTeam}`,
      sport_display: normalizedSport,
      league_display: game.league
    };
    
    // Check if matching game exists using configuration rules
    let existingGameId = await findExistingGame(gameData);
    let shouldInsertGame = !existingGameId;
    
    // If no matching game found, use the new gameId
    if (!existingGameId) {
      existingGameId = gameId;
    }
    
    if (shouldInsertGame) {
      // Insert new game
      const gameInserted = await sendToSupabase('games', {
        game_id: gameId,
        sport: normalizedSport,
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
        name: `${game.homeTeam} vs ${game.awayTeam}`,
        sport_display: normalizedSport,
        league_display: game.league,
        created_at: timestamp
      });
      console.log(`Inserted new game: ${gameId}`);
    } else {
      // Update existing game with latest status (using the matched game ID)
      console.log(`Updating existing game: ${existingGameId}`);
      // Note: We could add update logic here if needed
    }
    
    // Process odds for each sportsbook (using the existing or matched game ID)
    console.log(`Processing odds for game ${existingGameId}:`, game.odds);
    
    // Track incomplete data for monitoring
    let completeOddsCount = 0;
    let incompleteOddsCount = 0;
    let incompleteDetails = [];
    
    for (const [sportsbook, odds] of Object.entries(game.odds)) {
      // Process odds with complete markets:
      // 2-way markets: home + away required
      // 3-way markets: any combination with at least 2 outcomes (home+draw, away+draw, or home+away+draw)
      const hasHome = odds && odds.home;
      const hasAway = odds && odds.away; 
      const hasDraw = odds && odds.draw;
      const outcomeCount = (hasHome ? 1 : 0) + (hasAway ? 1 : 0) + (hasDraw ? 1 : 0);
      
      const isValidMarket = outcomeCount >= 2 && (
        (hasHome && hasAway) || // 2-way market
        (hasHome && hasDraw) || // 3-way partial: home + draw
        (hasAway && hasDraw) || // 3-way partial: away + draw  
        (hasHome && hasAway && hasDraw) // 3-way complete
      );
      
      if (isValidMarket) {
        completeOddsCount++;
        console.log(`Processing complete odds for ${sportsbook}:`, odds);
        const oddsData = {
          game_id: existingGameId,
          sportsbook: sportsbook,
          home_odds: odds.home?.american || null,
          away_odds: odds.away?.american || null,
          draw_odds: odds.draw?.american || null,
          home_odds_percent: odds.home?.percentage || null,
          away_odds_percent: odds.away?.percentage || null,
          draw_odds_percent: odds.draw?.percentage || null,
          odds_format: odds.format || 'unknown',
          timestamp: timestamp,
          url: url,
          scraping_source: 'browser_extension',
          scraping_method: currentConfig?.scrapingStrategy?.method || 'visual_dom'
        };
        
        // Check if this specific odds entry exists
        const existingOdds = await checkExistsInSupabase('odds', {
          game_id: existingGameId,
          sportsbook: sportsbook
        });
        
        if (existingOdds) {
          // Check if odds have changed (compare both American and percentage)
          const americanChanged = existingOdds.home_odds !== oddsData.home_odds || 
                                  existingOdds.away_odds !== oddsData.away_odds ||
                                  existingOdds.draw_odds !== oddsData.draw_odds;
          const percentChanged = existingOdds.home_odds_percent !== oddsData.home_odds_percent || 
                                existingOdds.away_odds_percent !== oddsData.away_odds_percent ||
                                existingOdds.draw_odds_percent !== oddsData.draw_odds_percent;
          
          if (americanChanged || percentChanged) {
            // Store historical record
            await sendToSupabase('odds_history', {
              ...oddsData,
              previous_home_odds: existingOdds.home_odds,
              previous_away_odds: existingOdds.away_odds,
              previous_draw_odds: existingOdds.draw_odds,
              previous_home_odds_percent: existingOdds.home_odds_percent,
              previous_away_odds_percent: existingOdds.away_odds_percent,
              previous_draw_odds_percent: existingOdds.draw_odds_percent
            });
            
            // Update current odds
            await updateInSupabase('odds', existingOdds.id, oddsData);
          }
        } else {
          // Insert new odds
          await sendToSupabase('odds', oddsData);
        }
      } else {
        // Track incomplete odds for monitoring
        incompleteOddsCount++;
        const incompleteReason = [];
        if (!odds) {
          incompleteReason.push('no odds object');
        } else {
          incompleteReason.push(`insufficient outcomes (${outcomeCount}/2 minimum)`);
          if (!hasHome) incompleteReason.push('missing home odds');
          if (!hasAway) incompleteReason.push('missing away odds');
          if (!hasDraw) incompleteReason.push('missing draw odds');
        }
        
        incompleteDetails.push({
          sportsbook: sportsbook,
          reason: incompleteReason.join(', '),
          data: odds
        });
        
        console.warn(`⚠️ SKIPPING incomplete odds for ${sportsbook}: ${incompleteReason.join(', ')}`);
        console.warn(`   Raw data:`, odds);
      }
    }
    
    // Update global data quality tracking
    globalDataQuality.totalOddsProcessed += (completeOddsCount + incompleteOddsCount);
    globalDataQuality.completeOddsInserted += completeOddsCount;
    globalDataQuality.incompleteOddsSkipped += incompleteOddsCount;
    if (incompleteOddsCount > 0) {
      globalDataQuality.gamesWithIncompleteData++;
    }
    globalDataQuality.lastQualityCheck = new Date();
    
    // Track incomplete reasons and sportsbooks
    incompleteDetails.forEach(detail => {
      const reason = detail.reason;
      const book = detail.sportsbook;
      
      globalDataQuality.incompleteByReason.set(reason, 
        (globalDataQuality.incompleteByReason.get(reason) || 0) + 1);
      globalDataQuality.incompleteByBook.set(book, 
        (globalDataQuality.incompleteByBook.get(book) || 0) + 1);
    });
    
    // Log summary of data quality for this game
    if (incompleteOddsCount > 0) {
      console.warn(`🚨 DATA QUALITY ALERT for ${game.homeTeam} vs ${game.awayTeam}:`);
      console.warn(`   Complete odds: ${completeOddsCount}`);
      console.warn(`   Incomplete odds: ${incompleteOddsCount}`);
      console.warn(`   Data loss percentage: ${((incompleteOddsCount / (completeOddsCount + incompleteOddsCount)) * 100).toFixed(1)}%`);
      console.warn(`   Incomplete details:`, incompleteDetails);
    }
  }
}

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background script received message:', request.type);
  
  // Debug: log all message types we're looking for
  if (request.type === 'TEST_API_CONNECTION') {
    console.log('🎯 TEST_API_CONNECTION case reached!');
  }
  if (request.type === 'SEND_ODDS_TO_API') {
    console.log('🎯 SEND_ODDS_TO_API case reached!');
  }
  if (request.type === 'GET_API_SENDER_STATS') {
    console.log('🎯 GET_API_SENDER_STATS case reached!');
  }
  
  if (request.type === 'CONTENT_SCRIPT_LOADED') {
    // Register tab when content script loads
    const tabId = sender.tab?.id;
    const url = request.url || sender.tab?.url;
    
    if (tabId && url) {
      console.warn('⛔ CONTENT SCRIPT LOADED - Visual scraping is disabled, content script should only be used for API discovery');
      console.log('📋 Content script loaded on tab:', tabId, url);
      // Don't add to activeTabs - visual scraping is disabled
    }
    
    return; // No response needed
  }
  
  if (request.type === 'VISUAL_SCRAPING_ATTEMPTED') {
    console.error('🚨 VISUAL SCRAPING ATTEMPTED - This should not happen!');
    console.error('🚨 URL:', request.url);
    console.error('🚨 System configured for API-only scraping via Scrapy');
    return;
  }
  
  if (request.type === 'SCRAPED_DATA') {
    const tabId = sender.tab.id;
    const url = sender.tab.url;
    const now = new Date();
    
    console.log('Processing scraped data from tab', tabId, 'with', request.data.games.length, 'games');
    console.log('Total odds entries:', 
      request.data.games.reduce((sum, game) => sum + Object.keys(game.odds).length, 0));
    
    // Track data ingestion
    const totalOdds = request.data.games.reduce((sum, game) => sum + Object.keys(game.odds).length, 0);
    const ingestionEntry = {
      timestamp: now,
      tabId: tabId,
      url: url,
      gamesCount: request.data.games.length,
      oddsCount: totalOdds
    };
    
    dataIngestionHistory.push(ingestionEntry);
    lastDataIngestion = now;
    
    // Update per-URL stats
    const baseUrl = new URL(url).origin + new URL(url).pathname;
    if (!perUrlIngestionStats.has(baseUrl)) {
      perUrlIngestionStats.set(baseUrl, {
        url: baseUrl,
        totalIngestions: 0,
        totalGames: 0,
        totalOdds: 0,
        lastIngestion: null,
        avgGamesPerIngestion: 0,
        avgOddsPerIngestion: 0,
        ingestionHistory: []
      });
    }
    
    const urlStats = perUrlIngestionStats.get(baseUrl);
    urlStats.totalIngestions++;
    urlStats.totalGames += request.data.games.length;
    urlStats.totalOdds += totalOdds;
    urlStats.lastIngestion = now;
    urlStats.avgGamesPerIngestion = urlStats.totalGames / urlStats.totalIngestions;
    urlStats.avgOddsPerIngestion = urlStats.totalOdds / urlStats.totalIngestions;
    urlStats.ingestionHistory.push(ingestionEntry);
    
    // Keep only last 10 ingestions per URL
    urlStats.ingestionHistory = urlStats.ingestionHistory.slice(-10);
    
    // Keep only last 5 minutes of global ingestion history
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    dataIngestionHistory = dataIngestionHistory.filter(entry => entry.timestamp > fiveMinutesAgo);
    
    // Clean up old per-URL stats (keep only URLs that had activity in last hour)
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    for (const [url, stats] of perUrlIngestionStats.entries()) {
      if (stats.lastIngestion < oneHourAgo) {
        perUrlIngestionStats.delete(url);
      }
    }
    
    // Store tab as active with enhanced tracking
    activeTabs.set(tabId, {
      url: url,
      lastUpdate: Date.now(),
      lastDataReceived: now,
      consecutiveFailures: 0,
      totalDataReceived: (activeTabs.get(tabId)?.totalDataReceived || 0) + 1
    });
    
    // Process the data
    processScrapedData(request.data, tabId, url)
      .then(async (processedGameIds) => {
        console.log('Data processing completed successfully');
        
        // Auto-send to API after successful data processing (if enabled)
        try {
          const config = await chrome.storage.local.get(['apiAutoSendEnabled']);
          if (config.apiAutoSendEnabled !== false) { // Default to enabled
            console.log('🚀 Auto-sending processed data to API...');
            
            // Use service-worker compatible sender
            if (!globalThis.backgroundSender) {
              await import('./api-sender-background.js');
              globalThis.backgroundSender = new globalThis.BackgroundAPISender();
            }
            const sender = globalThis.backgroundSender;
            
            // Send recently processed games if we have their IDs
            if (processedGameIds && processedGameIds.length > 0) {
              await sender.sendByGameIds(processedGameIds);
              console.log(`✅ Auto-sent ${processedGameIds.length} games to API`);
            } else {
              // Fallback: send recent data
              const result = await sender.sendAll(10);
              console.log(`✅ Auto-sent batch to API: ${result.successful} successful, ${result.failed} failed`);
            }
          }
        } catch (apiError) {
          console.warn('⚠️ Auto API send failed (non-critical):', apiError.message);
        }
        
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error processing data:', error);
        sendResponse({ success: false, error: error.message });
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'POLLING_PATTERN_DETECTED') {
    console.log('📊 Polling pattern detected:', {
      endpoint: request.endpoint,
      avgIntervalSec: Math.round(request.avgIntervalMs / 1000),
      requestCount: request.requestCount,
      intervals: request.intervals.map(i => Math.round(i/1000))
    });
    
    // Store pattern for analysis
    if (!globalThis.pollingPatterns) {
      globalThis.pollingPatterns = new Map();
    }
    globalThis.pollingPatterns.set(request.endpoint, {
      avgIntervalMs: request.avgIntervalMs,
      lastUpdate: Date.now(),
      requestCount: request.requestCount,
      intervals: request.intervals
    });
    
    return;
  }
  
  if (request.type === 'GET_POLLING_PATTERNS') {
    const patterns = globalThis.pollingPatterns || new Map();
    const patternData = Array.from(patterns.entries()).map(([endpoint, data]) => ({
      endpoint,
      avgIntervalSec: Math.round(data.avgIntervalMs / 1000),
      requestCount: data.requestCount,
      lastUpdate: new Date(data.lastUpdate).toLocaleTimeString()
    }));
    
    sendResponse({ patterns: patternData });
    return;
  }
  
  if (request.type === 'GET_STATUS') {
    // Get games count from database
    getGamesCount().then(gamesCount => {
      // Calculate total API endpoints across all domains
      let totalEndpoints = 0;
      for (const domainData of discoveredEndpoints.values()) {
        totalEndpoints += domainData.endpoints.length;
      }
      
      // Determine scraping method based on active tabs and endpoints
      let scrapingMethod = 'Visual DOM';
      const activeTabsArray = Array.from(activeTabs.entries()).map(([id, data]) => ({
        id,
        ...data
      }));
      
      // Check if any active tabs are using API scraping
      const hasApiScraping = activeTabsArray.some(tab => tab.scrapingMethod === 'API');
      const hasVisualScraping = activeTabsArray.some(tab => !tab.scrapingMethod || tab.scrapingMethod === 'Visual');
      
      if (hasApiScraping && hasVisualScraping) {
        scrapingMethod = 'Hybrid';
      } else if (hasApiScraping) {
        scrapingMethod = 'API';
      }
      
      sendResponse({
        initialized: !!supabaseClient,
        activeTabs: activeTabsArray,
        gamesCount,
        scrapingMethod,
        apiEndpoints: totalEndpoints
      });
    }).catch(error => {
      console.error('Error getting games count:', error);
      
      // Calculate total API endpoints even if games count fails
      let totalEndpoints = 0;
      for (const domainData of discoveredEndpoints.values()) {
        totalEndpoints += domainData.endpoints.length;
      }
      
      sendResponse({
        initialized: !!supabaseClient,
        activeTabs: Array.from(activeTabs.entries()).map(([id, data]) => ({
          id,
          ...data
        })),
        gamesCount: 0,
        scrapingMethod: 'Visual DOM',
        apiEndpoints: totalEndpoints
      });
    });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'GET_ACTIVE_TABS') {
    // Return information about all active sportsbook tabs
    const activeTabsArray = Array.from(activeTabs.entries()).map(([id, data]) => {
      let domain = 'Unknown';
      try {
        if (data.url) {
          domain = new URL(data.url).hostname;
        }
      } catch (e) {
        // Keep default 'Unknown' for invalid URLs
      }
      
      return {
        id,
        url: data.url,
        domain: domain,
        lastUpdate: data.lastUpdate,
        lastDataReceived: data.lastDataReceived,
        totalDataReceived: data.totalDataReceived || 0,
        status: data.consecutiveFailures > 2 ? 'error' : 'active'
      };
    });
    
    sendResponse({
      success: true,
      tabs: activeTabsArray,
      count: activeTabsArray.length
    });
    
    return true;
  }
  
  if (request.type === 'GET_ANALYTICS_DATA') {
    // Get analytics data from database with optional freshness filter
    const hoursBack = request.hoursBack || 24; // Default to 24 hours
    getAnalyticsData(hoursBack).then(data => {
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
  
  if (request.type === 'GET_FLAGGED_OPPORTUNITIES') {
    // Return flagged opportunities from storage
    chrome.storage.local.get(['flaggedOpportunities']).then(result => {
      sendResponse({
        success: true,
        data: result.flaggedOpportunities || []
      });
    }).catch(error => {
      console.error('Error getting flagged opportunities:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    
    return true;
  }
  
  if (request.type === 'STORE_FLAGGED_OPPORTUNITIES') {
    // Store flagged opportunities
    chrome.storage.local.set({ 
      flaggedOpportunities: request.opportunities 
    }).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error storing flagged opportunities:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    
    return true;
  }
  
  if (request.type === 'REGISTER_TAB_POSITION') {
    // Register tab for multi-tab coordination
    const tabId = sender.tab.id;
    const url = request.url;
    const optimalTabCount = request.optimalTabCount || 2; // Get optimal tab count from content script
    const baseUrl = new URL(url).origin + new URL(url).pathname;
    
    // Initialize URL registry if needed
    if (!tabPositionRegistry.has(baseUrl)) {
      tabPositionRegistry.set(baseUrl, {
        nextPosition: 0,
        tabs: new Map(),
        lastAssignment: Date.now(),
        optimalTabCount: optimalTabCount
      });
    }
    
    const urlRegistry = tabPositionRegistry.get(baseUrl);
    
    // Update optimal tab count if provided
    if (optimalTabCount) {
      urlRegistry.optimalTabCount = optimalTabCount;
    }
    
    // Assign position to this tab
    const maxTabs = urlRegistry.optimalTabCount || 2;
    const position = urlRegistry.nextPosition % maxTabs;
    urlRegistry.tabs.set(tabId, position);
    urlRegistry.nextPosition++;
    urlRegistry.lastAssignment = Date.now();
    
    console.log(`🚀 Tab ${tabId} registered for position ${position} on ${baseUrl}`);
    console.log(`🚀 Total tabs for this URL: ${urlRegistry.tabs.size}`);
    
    // Clean up old registrations (older than 10 minutes)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    for (const [registryUrl, registry] of tabPositionRegistry.entries()) {
      if (registry.lastAssignment < tenMinutesAgo) {
        tabPositionRegistry.delete(registryUrl);
      }
    }
    
    sendResponse({ 
      success: true, 
      position: position,
      totalTabs: urlRegistry.tabs.size
    });
    
    return true;
  }
  
  if (request.type === 'OPEN_COORDINATED_TABS') {
    // Open additional tabs for coordinated scraping
    const url = request.url;
    const count = request.count || 3;
    
    console.log(`🚀 Opening ${count} additional tabs for coordinated scraping`);
    
    let tabsOpened = 0;
    const promises = [];
    
    for (let i = 0; i < count; i++) {
      promises.push(
        chrome.tabs.create({ 
          url: url,
          active: false // Don't focus the new tabs
        })
        .then(tab => {
          console.log(`🚀 Opened coordinated tab ${tab.id} for position ${i + 1}`);
          tabsOpened++;
          return tab;
        })
        .catch(error => {
          console.error(`🚀 Failed to open coordinated tab ${i + 1}:`, error);
          return null;
        })
      );
    }
    
    // Wait for all tabs to be created (or fail)
    Promise.all(promises).then(tabs => {
      const successfulTabs = tabs.filter(Boolean);
      console.log(`🚀 Successfully opened ${successfulTabs.length}/${count} coordinated tabs`);
      
      sendResponse({ 
        success: true, 
        tabsOpened: successfulTabs.length,
        tabIds: successfulTabs.map(tab => tab.id)
      });
    }).catch(error => {
      console.error('🚀 Error in coordinated tab opening:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        tabsOpened: tabsOpened
      });
    });
    
    return true; // Keep message channel open for async response
  }
  
  // Handle API endpoint discovery
  if (request.type === 'API_ENDPOINT_CAPTURED') {
    try {
      const { source, details } = request;
      
      // Validate URL before parsing
      let domain;
      try {
        domain = new URL(details.url).hostname;
      } catch (urlError) {
        // If URL is invalid, try to extract domain from path or use sender tab
        if (sender.tab?.url) {
          domain = new URL(sender.tab.url).hostname;
        } else {
          console.error('Invalid URL in API endpoint capture:', details.url);
          sendResponse({ success: false, error: 'Invalid URL: ' + details.url });
          return true;
        }
      }
      
      if (!discoveredEndpoints.has(domain)) {
        discoveredEndpoints.set(domain, {
          endpoints: [],
          lastUpdated: new Date()
        });
        console.log(`📡 New domain added to endpoint discovery: ${domain}`);
      }
      
      const domainEndpoints = discoveredEndpoints.get(domain);
      
      // Check for duplicates
      const existingEndpoint = domainEndpoints.endpoints.find(ep => 
        ep.path === details.path && ep.method === details.method
      );
      
      if (!existingEndpoint) {
        domainEndpoints.endpoints.push({
          ...details,
          source,
          capturedAt: new Date()
        });
        console.log(`📡 New API endpoint discovered for ${domain}: ${details.method} ${details.path} (total: ${domainEndpoints.endpoints.length})`);
        // Auto-sync to Supabase
        syncEndpointToSupabase(domain, details);
      } else {
        console.log(`📡 Duplicate endpoint ignored for ${domain}: ${details.method} ${details.path}`);
      }
      
      // Keep only unique endpoints
      const uniqueEndpoints = domainEndpoints.endpoints.reduce((acc, endpoint) => {
        const key = `${endpoint.method}:${endpoint.path}`;
        if (!acc.has(key) || endpoint.capturedAt > acc.get(key).capturedAt) {
          acc.set(key, endpoint);
        }
        return acc;
      }, new Map());
      
      domainEndpoints.endpoints = Array.from(uniqueEndpoints.values());
      
      console.log(`📡 API endpoint discovered for ${domain}:`, details.path);
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error storing API endpoint:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }
  
  // Handle direct API requests (bypass CORS)
  if (request.type === 'MAKE_API_REQUEST') {
    const { url, method = 'GET', headers = {}, body } = request;
    
    fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
    .then(response => response.json())
    .then(data => {
      sendResponse({ success: true, data });
    })
    .catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Will respond asynchronously
  }
  
  // Export functionality removed - now using automated sync to database
  
  // Get discovered endpoints for a domain
  if (request.type === 'GET_DISCOVERED_ENDPOINTS') {
    const domain = request.domain || (sender.tab?.url ? new URL(sender.tab.url).hostname : null);
    const endpoints = domain ? discoveredEndpoints.get(domain) : null;
    
    sendResponse({
      success: true,
      domain,
      endpoints: endpoints ? endpoints.endpoints : [],
      lastUpdated: endpoints ? endpoints.lastUpdated : null
    });
    
    return true;
  }
  
  // Clear all discovered endpoints
  if (request.type === 'CLEAR_ENDPOINTS') {
    const endpointCount = discoveredEndpoints.size;
    discoveredEndpoints.clear();
    console.log(`🗑️ Cleared ${endpointCount} discovered endpoints from ${Array.from(discoveredEndpoints.keys()).join(', ')}`);
    sendResponse({ success: true });
    return true;
  }
  
  if (request.type === 'SET_TAB_ZOOM') {
    // Set browser zoom level for the sender tab
    const tabId = sender.tab.id;
    const zoomFactor = request.zoomFactor || 0.6;
    
    console.log(`🔧 Setting zoom to ${zoomFactor * 100}% for tab ${tabId}`);
    
    chrome.tabs.setZoom(tabId, zoomFactor)
      .then(() => {
        console.log(`🔧 Successfully set zoom to ${zoomFactor * 100}%`);
        sendResponse({ 
          success: true, 
          zoomLevel: zoomFactor 
        });
      })
      .catch(error => {
        console.error('🔧 Error setting zoom:', error);
        sendResponse({ 
          success: false, 
          error: error.message 
        });
      });
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'CONFIG_UPDATED') {
    // Handle configuration updates
    currentConfig = request.config;
    console.log('Configuration updated:', currentConfig);
    
    // Apply new refresh intervals if needed
    if (currentConfig.refresh) {
      // Update any active intervals here if needed
      console.log('New refresh intervals:', currentConfig.refresh);
    }
    
    sendResponse({ success: true });
    return true;
  }
  
  if (request.type === 'GET_SCRAPING_TARGETS') {
    // Fetch scraping targets from database
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    fetch(`${supabaseClient.url}/scraping_targets?select=*&order=priority`, {
      headers: supabaseClient.headers
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      // Parse the config JSON strings and show all targets (not just enabled)
      const parsedData = data.map(target => ({
        ...target,
        config: typeof target.config === 'string' ? JSON.parse(target.config) : target.config
      }));
      sendResponse({ success: true, data: parsedData });
    })
    .catch(error => {
      console.error('Error fetching scraping targets:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.type === 'GET_SPORT_MAPPINGS') {
    // Fetch sport mappings from database
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    fetch(`${supabaseClient.url}/sports_mapping?select=*&order=oddsjam_sport`, {
      headers: supabaseClient.headers
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      sendResponse({ success: true, data: data });
    })
    .catch(error => {
      console.error('Error fetching sport mappings:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.type === 'GET_LEAGUE_MAPPINGS') {
    // Fetch league mappings + all available leagues for dropdowns
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    // Get both mappings and available leagues
    Promise.all([
      fetch(`${supabaseClient.url}/leagues_mapping?select=*&order=oddsjam_league`, {
        headers: supabaseClient.headers
      }).then(r => r.json()),
      fetch(`${supabaseClient.url}/leagues_reference?select=id,name&active=eq.true&order=name`, {
        headers: supabaseClient.headers
      }).then(r => r.json())
    ])
    .then(([mappings, omenizerLeagues]) => {
      sendResponse({ 
        success: true, 
        data: mappings,
        omenizerLeagues: omenizerLeagues
      });
    })
    .catch(error => {
      console.error('Error fetching league mappings:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'UPDATE_LEAGUE_MAPPINGS') {
    // Update league mappings and save to storage
    const mappingsToSave = request.mappings === null ? DEFAULT_LEAGUE_MAPPINGS : request.mappings;
    chrome.storage.local.set({ 'leagueMappings': mappingsToSave })
      .then(() => {
        currentConfig.leagueMappings = mappingsToSave;
        console.log('League mappings updated successfully');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Failed to update league mappings:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'SAVE_SCRAPING_TARGETS') {
    // Save scraping targets to database
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    const targets = request.targets || [];
    const deletedIds = request.deletedIds || [];
    const promises = [];

    // Handle deletions first
    deletedIds.forEach(id => {
      console.log(`Deleting scraping target with ID: ${id}`);
      promises.push(
        fetch(`${supabaseClient.url}/scraping_targets?id=eq.${id}`, {
          method: 'DELETE',
          headers: supabaseClient.headers
        })
      );
    });

    // Handle saves/updates
    targets.forEach(target => {
      const targetData = {
        platform_id: 1, // OddsJam platform
        target_type: 'sport_league',
        name: target.name,
        config: JSON.stringify({ 
          sport: target.sport.toLowerCase(), 
          league: target.league.toLowerCase(),
          market: target.market
        }),
        enabled: target.enabled,
        priority: target.priority
      };

      if (target.id) {
        // Update existing
        console.log(`Updating scraping target with ID: ${target.id}`);
        promises.push(
          fetch(`${supabaseClient.url}/scraping_targets?id=eq.${target.id}`, {
            method: 'PATCH',
            headers: supabaseClient.headers,
            body: JSON.stringify(targetData)
          })
        );
      } else {
        // Insert new
        console.log(`Inserting new scraping target: ${target.name}`);
        promises.push(
          fetch(`${supabaseClient.url}/scraping_targets`, {
            method: 'POST',
            headers: supabaseClient.headers,
            body: JSON.stringify(targetData)
          })
        );
      }
    });

    Promise.all(promises)
      .then(responses => {
        // Check if all responses were successful
        const failures = responses.filter(response => !response.ok);
        if (failures.length > 0) {
          console.error(`${failures.length} operations failed out of ${responses.length}`);
          throw new Error(`${failures.length} database operations failed`);
        }
        
        console.log(`Successfully processed ${deletedIds.length} deletions and ${targets.length} saves/updates`);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error saving scraping targets:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'SAVE_SPORT_MAPPINGS') {
    // Save sport mappings to database
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    const mappings = request.mappings || [];
    const deletedIds = request.deletedIds || [];
    const promises = [];

    // Handle deletions first
    deletedIds.forEach(id => {
      console.log(`Deleting sport mapping with ID: ${id}`);
      promises.push(
        fetch(`${supabaseClient.url}/sports_mapping?id=eq.${id}`, {
          method: 'DELETE',
          headers: supabaseClient.headers
        })
      );
    });

    // Handle saves/updates
    mappings.forEach(mapping => {
      const mappingData = {
        oddsjam_sport: mapping.oddsjam_sport.toUpperCase(),
        omenizer_sport: mapping.omenizer_sport,
        confidence_score: 1.0,
        last_verified: new Date().toISOString()
      };

      if (mapping.id) {
        // Update existing
        console.log(`Updating sport mapping with ID: ${mapping.id}`);
        promises.push(
          fetch(`${supabaseClient.url}/sports_mapping?id=eq.${mapping.id}`, {
            method: 'PATCH',
            headers: supabaseClient.headers,
            body: JSON.stringify(mappingData)
          })
        );
      } else {
        // Insert new
        console.log(`Inserting new sport mapping: ${mapping.oddsjam_sport} -> ${mapping.omenizer_sport}`);
        promises.push(
          fetch(`${supabaseClient.url}/sports_mapping`, {
            method: 'POST',
            headers: supabaseClient.headers,
            body: JSON.stringify(mappingData)
          })
        );
      }
    });

    Promise.all(promises)
      .then(responses => {
        // Check if all responses were successful
        const failures = responses.filter(response => !response.ok);
        if (failures.length > 0) {
          console.error(`${failures.length} operations failed out of ${responses.length}`);
          throw new Error(`${failures.length} database operations failed`);
        }
        
        console.log(`Successfully processed ${deletedIds.length} deletions and ${mappings.length} saves/updates`);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error saving sport mappings:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.type === 'SAVE_LEAGUE_MAPPINGS') {
    // Save league mappings to database
    if (!supabaseClient) {
      sendResponse({ success: false, error: 'Database not connected' });
      return true;
    }

    const mappings = request.mappings || [];
    const deletedIds = request.deletedIds || [];
    const promises = [];

    // Handle deletions first
    deletedIds.forEach(id => {
      console.log(`Deleting league mapping with ID: ${id}`);
      promises.push(
        fetch(`${supabaseClient.url}/leagues_mapping?id=eq.${id}`, {
          method: 'DELETE',
          headers: supabaseClient.headers
        })
      );
    });

    // Handle saves/updates
    mappings.forEach(mapping => {
      const mappingData = {
        oddsjam_league: mapping.oddsjam_league,
        omenizer_league: mapping.omenizer_league,
        oddsjam_sport: mapping.oddsjam_sport || '',
        omenizer_sport: mapping.omenizer_sport || '',
        confidence_score: 1.0,
        last_verified: new Date().toISOString()
      };

      if (mapping.id) {
        // Update existing
        console.log(`Updating league mapping with ID: ${mapping.id}`);
        promises.push(
          fetch(`${supabaseClient.url}/leagues_mapping?id=eq.${mapping.id}`, {
            method: 'PATCH',
            headers: supabaseClient.headers,
            body: JSON.stringify(mappingData)
          })
        );
      } else {
        // Insert new
        console.log(`Inserting new league mapping: ${mapping.oddsjam_league} -> ${mapping.omenizer_league}`);
        promises.push(
          fetch(`${supabaseClient.url}/leagues_mapping`, {
            method: 'POST',
            headers: supabaseClient.headers,
            body: JSON.stringify(mappingData)
          })
        );
      }
    });

    Promise.all(promises)
      .then(async responses => {
        // Check if all responses were successful
        const failures = responses.filter(response => !response.ok);
        if (failures.length > 0) {
          console.error(`${failures.length} operations failed out of ${responses.length}`);
          
          // Collect detailed error information from each failed response
          const errorDetails = [];
          for (let i = 0; i < responses.length; i++) {
            const response = responses[i];
            if (!response.ok) {
              try {
                const errorText = await response.text();
                let errorData;
                try {
                  errorData = JSON.parse(errorText);
                } catch {
                  errorData = { message: errorText };
                }
                
                const operation = i < deletedIds.length ? 
                  `DELETE league mapping ID ${deletedIds[i]}` : 
                  `${mappings[i - deletedIds.length].id ? 'UPDATE' : 'INSERT'} league mapping: ${mappings[i - deletedIds.length].oddsjam_league} -> ${mappings[i - deletedIds.length].omenizer_league}`;
                
                errorDetails.push({
                  operation,
                  status: response.status,
                  statusText: response.statusText,
                  error: errorData
                });
                
                console.error(`Failed ${operation}:`, {
                  status: response.status,
                  statusText: response.statusText,
                  error: errorData
                });
              } catch (readError) {
                console.error(`Failed to read error response for operation ${i}:`, readError);
                errorDetails.push({
                  operation: `Operation ${i}`,
                  status: response.status,
                  statusText: response.statusText,
                  error: 'Could not read error details'
                });
              }
            }
          }
          
          const detailedErrorMessage = `${failures.length} database operations failed:\n` + 
            errorDetails.map(detail => `- ${detail.operation}: ${detail.status} ${detail.statusText} - ${JSON.stringify(detail.error)}`).join('\n');
          
          throw new Error(detailedErrorMessage);
        }
        
        console.log(`Successfully processed ${deletedIds.length} deletions and ${mappings.length} saves/updates`);
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('Error saving league mappings:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  // Test API endpoint for verification
  if (request.type === 'TEST_ENDPOINT') {
    const { url, headers } = request;
    
    fetch(url, {
      method: 'GET',
      headers: headers
    })
    .then(response => {
      return response.json().then(data => ({
        status: response.status,
        data: data
      }));
    })
    .then(result => {
      sendResponse(result);
    })
    .catch(error => {
      sendResponse({ error: error.message });
    });
    
    return true; // Will respond asynchronously
  }
  
  // URL Manager handlers
  if (request.type === 'GET_STORED_URLS') {
    getStoredURLs().then(urls => {
      sendResponse({ success: true, data: urls });
    }).catch(error => {
      console.error('Failed to get stored URLs:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'SAVE_URL') {
    saveURL(request.data).then(result => {
      sendResponse({ success: true, data: result });
    }).catch(error => {
      console.error('Failed to save URL:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'DELETE_URLS') {
    deleteURLs(request.data.urlIds).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Failed to delete URLs:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'TOGGLE_URL') {
    toggleURL(request.data.urlId).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Failed to toggle URL:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'START_BATCH_SCRAPING') {
    startBatchScraping(request.data).then(result => {
      sendResponse({ success: true, data: result });
    }).catch(error => {
      console.error('Failed to start batch scraping:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'GET_ANALYTICS_DATA') {
    console.log('Getting analytics data with hoursBack:', request.hoursBack);
    getAnalyticsData(request.hoursBack || 24).then(data => {
      console.log('Analytics data retrieved:', data.games.length, 'games,', data.odds.length, 'odds');
      sendResponse({ success: true, data: data });
    }).catch(error => {
      console.error('Failed to get analytics data:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  if (request.type === 'GET_STATUS') {
    sendResponse({ 
      success: true, 
      initialized: !!supabaseClient,
      connected: !!supabaseClient
    });
    return true;
  }
  
  if (request.type === 'CHECK_URL_ACTIVE') {
    console.log('Checking URL status for:', request.url);
    
    if (!supabaseClient) {
      sendResponse({ active: false, error: 'Database not connected' });
      return true;
    }
    
    // Check if this URL exists and is active in the database
    fetch(`${supabaseClient.url}/sportsbook_urls?url=eq.${encodeURIComponent(request.url)}&select=active,preferred_scraping_method`, {
      headers: supabaseClient.headers
    }).then(response => response.json()).then(data => {
      if (data && data.length > 0) {
        const urlData = data[0];
        console.log('URL status:', urlData);
        sendResponse({ 
          active: urlData.active, 
          preferredMethod: urlData.preferred_scraping_method 
        });
      } else {
        console.log('URL not found in database');
        sendResponse({ active: false, preferredMethod: null });
      }
    }).catch(error => {
      console.error('Error checking URL status:', error);
      sendResponse({ active: false, error: error.message });
    });
    
    return true;
  }
  
  // API Sender Integration
  if (request.type === 'SEND_ODDS_TO_API') {
    (async () => {
      try {
        // Use service-worker compatible sender
        if (!globalThis.backgroundSender) {
          // Import the background API sender
          await import('./api-sender-background.js');
          globalThis.backgroundSender = new globalThis.BackgroundAPISender();
        }
        
        const sender = globalThis.backgroundSender;
        
        let result;
        if (request.gameIds && request.gameIds.length > 0) {
          // Send specific games
          result = await sender.sendByGameIds(request.gameIds);
        } else {
          // Send all recent data
          result = await sender.sendAll(request.limit || 50);
        }
        
        sendResponse({
          success: true,
          result: result,
          stats: sender.getStats()
        });
      } catch (error) {
        console.error('Error sending odds to API:', error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
  
  if (request.type === 'TEST_API_CONNECTION') {
    console.log('📨 Received TEST_API_CONNECTION request');
    
    // Handle async response properly
    (async () => {
      try {
        console.log('🧪 Testing API connection directly...');
        
        const testRecord = {
          source_id: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
          event_source: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
          name: 'Background Script Test vs Test Opponent',
          home_team: 'Background Test Home',
          away_team: 'Background Test Away',
          event_datetime: new Date().toISOString(),
          league: 'Background Test League',
          sport: 'Background Test Sport',
          status: 'background_test',
          markets: null
        };
        
        console.log('📤 Sending request to API...');
        const response = await fetch('https://arb-general-api-1.onrender.com/raw-bets/upsert', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer 8044652f46c0ed50756a3a22d72f0c7b582b8b'
          },
          body: JSON.stringify(testRecord)
        });

        console.log('📥 API response status:', response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.log('❌ API error response:', errorText);
          throw new Error(`API Error ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ API connection test successful:', result);
        
        const successResponse = {
          success: true,
          result: result
        };
        
        console.log('📤 Sending success response:', successResponse);
        sendResponse(successResponse);
        
      } catch (error) {
        console.error('❌ API connection test failed:', error);
        
        const errorResponse = {
          success: false,
          error: error.message
        };
        
        console.log('📤 Sending error response:', errorResponse);
        sendResponse(errorResponse);
      }
    })().catch(error => {
      console.error('❌ Async handler error:', error);
      sendResponse({
        success: false,
        error: error.message
      });
    });
    
    return true; // Keep message port open for async response
  }
  
  if (request.type === 'GET_API_SENDER_STATS') {
    (async () => {
      try {
        // Use service-worker compatible sender
        if (!globalThis.backgroundSender) {
          await import('./api-sender-background.js');
          globalThis.backgroundSender = new globalThis.BackgroundAPISender();
        }
        
        sendResponse({
          success: true,
          stats: globalThis.backgroundSender.getStats()
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    
    return true;
  }
});

// Function to sync endpoint to Supabase for automated Scrapy consumption
async function syncEndpointToSupabase(domain, endpoint) {
  try {
    const endpointData = {
      domain: domain,
      method: endpoint.method || 'GET',
      path: endpoint.path,
      headers: endpoint.headers || {},
      // Remove fields that don't exist in database table
      active: true,
      created_at: new Date().toISOString()
    };
    
    // Use upsert to handle duplicates
    const response = await fetch(`${SUPABASE_CONFIG.url}/discovered_endpoints`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_CONFIG.anonKey,
        'Authorization': `Bearer ${SUPABASE_CONFIG.anonKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(endpointData)
    });
    
    if (response.ok) {
      console.log(`✅ Endpoint synced to Supabase: ${domain}${endpoint.path}`);
    } else {
      console.error(`❌ Failed to sync endpoint: ${response.status}`, await response.text());
    }
  } catch (error) {
    console.error('❌ Error syncing endpoint to Supabase:', error);
  }
}

// Export function removed - endpoints now automatically sync to database via syncEndpointToSupabase()

// Freeze detection and auto-reload functionality
function checkForFrozenTabs() {
  const now = new Date();
  const freezeThreshold = new Date(now - SCRAPER_CONFIG.freezeDetection.timeout);
  
  for (const [tabId, tabData] of activeTabs.entries()) {
    // Check if tab hasn't received data in the freeze timeout period
    if (tabData.lastDataReceived && tabData.lastDataReceived < freezeThreshold) {
      console.log(`Tab ${tabId} appears frozen - last data received ${Math.round((now - tabData.lastDataReceived) / 1000)}s ago`);
      
      // Attempt to reload the tab
      chrome.tabs.reload(tabId)
        .then(() => {
          console.log(`Successfully reloaded frozen tab ${tabId} (${tabData.url})`);
          // Reset tracking data for the reloaded tab
          activeTabs.set(tabId, {
            url: tabData.url,
            lastUpdate: Date.now(),
            lastDataReceived: now,
            consecutiveFailures: (tabData.consecutiveFailures || 0) + 1,
            totalDataReceived: tabData.totalDataReceived || 0,
            lastReload: now
          });
        })
        .catch(error => {
          console.error(`Failed to reload tab ${tabId}:`, error);
          // If reload fails, the tab might be closed or invalid
          activeTabs.delete(tabId);
        });
    }
  }
}

// Start freeze detection monitoring
function startFreezeDetection() {
  console.log('Starting freeze detection monitoring...');
  setInterval(checkForFrozenTabs, SCRAPER_CONFIG.freezeDetection.checkInterval);
}

// Clean up closed tabs
chrome.tabs.onRemoved.addListener((tabId) => {
  activeTabs.delete(tabId);
  console.log(`Cleaned up data for closed tab ${tabId}`);
});

// Initialize on startup
chrome.runtime.onStartup.addListener(() => {
  initSupabase();
  startFreezeDetection();
});

// Also initialize when extension is installed/updated
chrome.runtime.onInstalled.addListener(() => {
  initSupabase();
  loadConfig();
  startFreezeDetection();
});

// Initialize immediately
initSupabase();
loadConfig();
startFreezeDetection();

// URL Manager functions
async function getStoredURLs() {
  if (!supabaseClient) {
    throw new Error('Database not initialized');
  }
  
  const response = await fetch(`${supabaseClient.url}/sportsbook_urls?order=created_at.desc`, {
    headers: supabaseClient.headers
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function saveURL(urlData) {
  if (!supabaseClient) {
    throw new Error('Database not initialized');
  }
  
  // Get discovered endpoints for this domain to associate with the URL
  const domain = urlData.domain;
  const domainEndpoints = discoveredEndpoints.get(domain);
  const associatedEndpoints = domainEndpoints ? domainEndpoints.endpoints : [];
  
  // Match the actual database schema (remove non-existent column)
  const urlDataWithEndpoints = {
    url: urlData.url,
    domain: urlData.domain,
    sport: urlData.sport,
    league: urlData.league,
    market_type: 'moneyline', // Default market type, could extract from URL
    title: urlData.title,
    description: urlData.description,
    active: true,
    tags: Array.isArray(urlData.tags) ? urlData.tags : [],
    created_by: 'browser_extension'
    // Note: preferred_scraping_method column doesn't exist in actual database
  };
  
  console.log(`💾 Saving URL data:`, urlDataWithEndpoints);
  
  // Check if URL already exists to prevent duplicates
  const existingCheck = await fetch(`${supabaseClient.url}/sportsbook_urls?url=eq.${encodeURIComponent(urlData.url)}`, {
    method: 'GET',
    headers: supabaseClient.headers
  });
  
  if (existingCheck.ok) {
    const existing = await existingCheck.json();
    if (existing.length > 0) {
      console.log(`📍 URL already exists in database:`, urlData.url);
      return existing[0]; // Return existing record instead of creating duplicate
    }
  }
  
  const response = await fetch(`${supabaseClient.url}/sportsbook_urls`, {
    method: 'POST',
    headers: {
      ...supabaseClient.headers,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(urlDataWithEndpoints)
  });
  
  if (!response.ok) {
    let errorText;
    try {
      errorText = await response.text();
      console.error(`❌ Save URL error details:`, errorText);
    } catch (e) {
      errorText = 'Could not read error response';
      console.error(`❌ Save URL error - could not read response`);
    }
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

async function deleteURLs(urlIds) {
  if (!supabaseClient) {
    throw new Error('Database not initialized');
  }
  
  const response = await fetch(`${supabaseClient.url}/sportsbook_urls?id=in.(${urlIds.join(',')})`, {
    method: 'DELETE',
    headers: supabaseClient.headers
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
}

async function toggleURL(urlId) {
  if (!supabaseClient) {
    throw new Error('Database not initialized');
  }
  
  // First get the current status
  const getResponse = await fetch(`${supabaseClient.url}/sportsbook_urls?id=eq.${urlId}`, {
    headers: supabaseClient.headers
  });
  
  if (!getResponse.ok) {
    throw new Error(`HTTP ${getResponse.status}: ${getResponse.statusText}`);
  }
  
  const urls = await getResponse.json();
  if (urls.length === 0) {
    throw new Error('URL not found');
  }
  
  const currentStatus = urls[0].active;
  
  // Toggle the status
  const updateResponse = await fetch(`${supabaseClient.url}/sportsbook_urls?id=eq.${urlId}`, {
    method: 'PATCH',
    headers: supabaseClient.headers,
    body: JSON.stringify({ active: !currentStatus })
  });
  
  if (!updateResponse.ok) {
    throw new Error(`HTTP ${updateResponse.status}: ${updateResponse.statusText}`);
  }
}

async function startBatchScraping(jobData) {
  if (!supabaseClient) {
    throw new Error('Database not initialized');
  }
  
  // Create batch job record
  const jobRecord = {
    job_name: jobData.jobName,
    url_ids: jobData.urlIds,
    status: 'pending',
    created_by: 'browser_extension'
  };
  
  const response = await fetch(`${supabaseClient.url}/batch_scraping_jobs`, {
    method: 'POST',
    headers: {
      ...supabaseClient.headers,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(jobRecord)
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const result = await response.json();
  console.log(`✅ Batch scraping job created: ${jobData.jobName} (${jobData.urlIds.length} URLs)`);
  
  return result;
}