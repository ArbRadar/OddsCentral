/**
 * API Sender Module - Sends odds data to external API endpoint
 * Transforms local Supabase data to match /raw-bets/upsert API format
 */

// Use dynamic import for Supabase to avoid module loading issues
// import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js@2';

class APISender {
  constructor() {
    // Configuration
    this.config = {
      supabaseUrl: 'http://localhost:54320',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      apiBaseUrl: 'https://arb-general-api-1.onrender.com',
      apiToken: '8044652f46c0ed50756a3a22d72f0c7b582b8b',
      sourceId: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5', // odds_central
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 1000
    };

    // Initialize Supabase client (will be loaded dynamically)
    this.supabase = null;
    
    // Bookmaker UUID mapping from bookmakers.csv
    this.bookmakerUUIDs = this.initBookmakerMapping();
    
    // Statistics tracking
    this.stats = {
      sent: 0,
      failed: 0,
      errors: []
    };
  }

  /**
   * Initialize bookmaker name to UUID mapping
   */
  initBookmakerMapping() {
    return {
      // Major US Sportsbooks
      'DraftKings': 'fe6bc0f8-e8a9-4083-9401-766d30817009',
      'FanDuel': 'd0f4c753-b2a3-4f02-ace3-f23d6987184a', 
      'BetMGM': 'a4fb81f8-ba8c-4012-bd74-10f78846d6ea',
      'BetRivers': 'd543b534-8a9c-403c-bcbf-ab64a9cb6767',
      'Fanatics': '52c379c7-d293-448b-bb0e-3d97235e5973',
      'Bovada': '5d096137-fba9-45bd-bbad-6865d86f6582',
      'BetOnline.ag': 'caf5646d-678b-4935-a86f-0cbc4a74f6df',
      'MyBookie.ag': 'c1ad3b2d-166d-4f5e-9528-ff42e8137241',
      'BetUS': 'de5429d4-3158-448d-9cd6-e94f828b45c3',
      'LowVig.ag': 'f6848e0e-03a2-4784-a731-39549631f77e',
      
      // International Sportsbooks  
      'bet365': 'ce996a90-c4bf-40b3-803f-daffe6c19b4f',
      'bet365.de': '39f3c2ae-b7aa-4a14-98df-0b936556e683',
      'pinnacle': '41a3c468-e086-4dd5-883a-d740d802c629',
      'betway': '834c26c6-1eed-48f7-afc3-22f3b2518809',
      'bwin': '75976014-7243-4b15-906d-c72e3a65b638',
      'bwin.de': '911c7dfd-eabf-4161-8ab3-b64dd7920855',
      'bwin.es': '4bc6d0d5-4237-45c5-8839-9acee4b963e2',
      'bwin.fr': 'fca09a68-76ce-480d-9665-84de7be63d51',
      'bwin.it': 'b7f8b77b-7d78-4c7c-8835-4926b6897ff6',
      'bwin.pt': '119abab6-ca30-4829-b7cd-13259fe000f9',
      'unibet': '5e02c81a-c435-442f-bd6e-c42cd73383d5',
      'unibet.com.au': '29db14b0-00bf-4173-8128-40659fda0691',
      'unibet.co.uk': '4931d85d-90a9-46fc-8c84-b9cc0355032c',
      'unibet.dk': '2e8d9d72-3d21-472a-99d0-c23124494729',
      'unibet.fr': '6ffe081e-e196-44ec-ac67-630c8256cd37',
      'unibet.it': '9a59d23a-c3e6-45e6-857a-7e944bd4661a',
      'unibet.nl': '0cd7ccd5-b5ec-49e3-8a02-8624fc6e838b',
      'unibet.se': '28098d89-097d-4349-9e52-dcf47619f27b',
      'betano': '038dac19-98af-47aa-87e1-a1597ae5176e',
      'betsson': '6381430b-fbbe-415f-be0a-f424e99900f2',
      'leovegas': '79be5d8d-6bae-4915-9e52-dbcbe2696669',
      '888sport': 'd52aec0b-069d-46cc-8a80-16ce20cec489',
      'paddy power': 'a5b8c855-6063-419f-98dd-87236b932629',
      'ladbrokes': 'ef8c7868-2f37-45a7-b20b-e76d0f99a421',
      'betfair-ex': '3ff7931d-210a-435d-b1d8-bb8a0c0530e2',
      '1xbet': '9d8d5f66-2a8c-4da1-9143-cf9dd557b50b',
      '22bet': 'bb9a1a51-3b1f-4ad8-867e-b51c3b9a3e49',
      'stake': 'b36c6d2a-306e-48ae-9e6b-0fe8767e52db',
      
      // Default fallback for unknown bookmakers
      'unknown': '17a7de9a-c23b-49eb-9816-93ebc3bba1c5' // Use odds_central as fallback
    };
  }

  /**
   * Get bookmaker UUID by name (case-insensitive with fuzzy matching)
   */
  getBookmakerUUID(bookmakerName) {
    if (!bookmakerName) return this.bookmakerUUIDs['unknown'];
    
    const normalized = bookmakerName.toLowerCase().trim();
    
    // Exact match first
    for (const [name, uuid] of Object.entries(this.bookmakerUUIDs)) {
      if (name.toLowerCase() === normalized) {
        return uuid;
      }
    }
    
    // Partial match for common variations
    const partialMatches = {
      'draftkings': 'DraftKings',
      'draft kings': 'DraftKings', 
      'dk': 'DraftKings',
      'fanduel': 'FanDuel',
      'fan duel': 'FanDuel',
      'fd': 'FanDuel',
      'betmgm': 'BetMGM',
      'mgm': 'BetMGM',
      'bet365': 'bet365',
      'bet 365': 'bet365',
      'caesars': 'BetRivers', // Assuming BetRivers for now
      'pointsbet': 'BetRivers', // Assuming BetRivers for now
      'barstool': 'Fanatics', // Barstool became Fanatics
      'pinnacle': 'pinnacle',
      'bovada': 'Bovada',
      'betonline': 'BetOnline.ag',
      'mybookie': 'MyBookie.ag',
      'betus': 'BetUS'
    };
    
    for (const [pattern, bookmaker] of Object.entries(partialMatches)) {
      if (normalized.includes(pattern)) {
        return this.bookmakerUUIDs[bookmaker];
      }
    }
    
    console.warn(`Unknown bookmaker: ${bookmakerName}, using fallback`);
    return this.bookmakerUUIDs['unknown'];
  }

  /**
   * Convert American odds to decimal format
   */
  americanToDecimal(americanOdds) {
    if (!americanOdds || americanOdds === 0) return null;
    
    const odds = parseInt(americanOdds);
    if (odds > 0) {
      return (odds / 100) + 1;
    } else {
      return (100 / Math.abs(odds)) + 1;
    }
  }

  /**
   * Convert decimal odds to American format  
   */
  decimalToAmerican(decimalOdds) {
    if (!decimalOdds || decimalOdds <= 1) return null;
    
    if (decimalOdds >= 2) {
      return Math.round((decimalOdds - 1) * 100);
    } else {
      return Math.round(-100 / (decimalOdds - 1));
    }
  }

  /**
   * Transform game and odds data to API format
   */
  transformToAPIFormat(game, oddsData) {
    const markets = [];
    
    // Group odds by bookmaker and bet type
    const groupedOdds = {};
    
    oddsData.forEach(odds => {
      const key = `${odds.sportsbook}_${game.bet_type}`;
      if (!groupedOdds[key]) {
        groupedOdds[key] = {
          bookmaker: odds.sportsbook,
          market_type: game.bet_type,
          is_live: game.game_status === 'live',
          last_updated: odds.timestamp,
          odds: []
        };
      }
      
      // Add home team odds
      if (odds.home_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Home',
          outcome_team: game.home_team,
          american_price: odds.home_odds,
          price: this.americanToDecimal(odds.home_odds),
          format: 'decimal',
          bookmaker: odds.sportsbook,
          probability: odds.home_odds_percent ? odds.home_odds_percent / 100 : null
        });
      }
      
      // Add away team odds  
      if (odds.away_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Away', 
          outcome_team: game.away_team,
          american_price: odds.away_odds,
          price: this.americanToDecimal(odds.away_odds),
          format: 'decimal',
          bookmaker: odds.sportsbook,
          probability: odds.away_odds_percent ? odds.away_odds_percent / 100 : null
        });
      }
      
      // Add draw odds for 3-way markets
      if (odds.draw_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Draw',
          outcome_team: 'Draw',
          american_price: odds.draw_odds,
          price: this.americanToDecimal(odds.draw_odds), 
          format: 'decimal',
          bookmaker: odds.sportsbook,
          probability: odds.draw_odds_percent ? odds.draw_odds_percent / 100 : null
        });
      }
    });
    
    // Convert grouped odds to markets array
    markets.push(...Object.values(groupedOdds));
    
    // Get event source UUID based on first bookmaker (or use odds_central if multiple)
    const firstBookmaker = oddsData[0]?.sportsbook;
    const eventSourceId = oddsData.length === 1 ? 
      this.getBookmakerUUID(firstBookmaker) : 
      this.config.sourceId;
    
    return {
      source_id: this.config.sourceId,
      event_source: eventSourceId,
      name: `${game.home_team} vs ${game.away_team}`,
      home_team: game.home_team,
      away_team: game.away_team,
      event_datetime: game.start_time_parsed || game.start_time,
      league: game.league,
      sport: game.sport,
      status: game.game_status,
      markets: {
        markets: markets,
        bookmakers: [...new Set(oddsData.map(o => o.sportsbook))],
        market_types: [game.bet_type],
        total_markets: markets.length,
        bookmaker_count: new Set(oddsData.map(o => o.sportsbook)).size
      }
    };
  }

  /**
   * Send single record to API with retry logic
   */
  async sendRecord(record, attempt = 1) {
    try {
      const response = await fetch(`${this.config.apiBaseUrl}/raw-bets/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        body: JSON.stringify(record)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      this.stats.sent++;
      
      console.log(`✅ Sent record: ${record.name} (${record.markets.total_markets} markets)`);
      return result;

    } catch (error) {
      console.error(`❌ Failed to send record (attempt ${attempt}):`, error.message);
      
      if (attempt < this.config.retryAttempts) {
        console.log(`⏱️ Retrying in ${this.config.retryDelay}ms...`);
        await this.sleep(this.config.retryDelay);
        return this.sendRecord(record, attempt + 1);
      } else {
        this.stats.failed++;
        this.stats.errors.push({
          record: record.name,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        throw error;
      }
    }
  }

  /**
   * Initialize Supabase client if not already done
   */
  async initSupabase() {
    if (!this.supabase) {
      try {
        const { createClient } = await import('https://cdn.skypack.dev/@supabase/supabase-js@2');
        this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseKey);
      } catch (error) {
        console.error('Failed to load Supabase client:', error);
        throw new Error('Cannot connect to database');
      }
    }
    return this.supabase;
  }

  /**
   * Fetch odds data from Supabase
   */
  async fetchOddsData(limit = null, gameIds = null) {
    await this.initSupabase();
    try {
      let gamesQuery = this.supabase
        .from('games')
        .select(`
          *,
          odds (*)
        `);
      
      if (gameIds && gameIds.length > 0) {
        gamesQuery = gamesQuery.in('game_id', gameIds);
      }
      
      if (limit) {
        gamesQuery = gamesQuery.limit(limit);
      }
      
      const { data: games, error } = await gamesQuery;
      
      if (error) {
        throw new Error(`Supabase error: ${error.message}`);
      }
      
      // Filter games that have odds data
      const gamesWithOdds = games.filter(game => game.odds && game.odds.length > 0);
      
      console.log(`📊 Fetched ${gamesWithOdds.length} games with odds data`);
      return gamesWithOdds;
      
    } catch (error) {
      console.error('Error fetching odds data:', error);
      throw error;
    }
  }

  /**
   * Send batch of records
   */
  async sendBatch(games) {
    const results = [];
    const errors = [];
    
    console.log(`🚀 Sending batch of ${games.length} games...`);
    
    for (const game of games) {
      try {
        const record = this.transformToAPIFormat(game, game.odds);
        const result = await this.sendRecord(record);
        results.push(result);
      } catch (error) {
        errors.push({
          game: game.game_id,
          error: error.message
        });
      }
    }
    
    return {
      successful: results.length,
      failed: errors.length,
      results,
      errors
    };
  }

  /**
   * Send all recent odds data
   */
  async sendAll(limit = 100) {
    try {
      console.log('🔄 Starting bulk send operation...');
      
      const games = await this.fetchOddsData(limit);
      
      if (games.length === 0) {
        console.log('ℹ️ No games with odds data found');
        return { successful: 0, failed: 0 };
      }
      
      // Process in batches
      const batches = [];
      for (let i = 0; i < games.length; i += this.config.batchSize) {
        batches.push(games.slice(i, i + this.config.batchSize));
      }
      
      console.log(`📦 Processing ${batches.length} batches of ${this.config.batchSize} games each`);
      
      let totalSuccessful = 0;
      let totalFailed = 0;
      
      for (let i = 0; i < batches.length; i++) {
        console.log(`📤 Processing batch ${i + 1}/${batches.length}...`);
        
        const result = await this.sendBatch(batches[i]);
        totalSuccessful += result.successful;
        totalFailed += result.failed;
        
        // Small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await this.sleep(500);
        }
      }
      
      console.log(`✅ Bulk send complete: ${totalSuccessful} successful, ${totalFailed} failed`);
      
      return {
        successful: totalSuccessful,
        failed: totalFailed,
        stats: this.getStats()
      };
      
    } catch (error) {
      console.error('Error in bulk send operation:', error);
      throw error;
    }
  }

  /**
   * Send specific games by IDs
   */
  async sendByGameIds(gameIds) {
    try {
      const games = await this.fetchOddsData(null, gameIds);
      return await this.sendBatch(games);
    } catch (error) {
      console.error('Error sending specific games:', error);
      throw error;
    }
  }

  /**
   * Get sending statistics
   */
  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.sent + this.stats.failed > 0 ? 
        (this.stats.sent / (this.stats.sent + this.stats.failed) * 100).toFixed(2) + '%' : 
        '0%'
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      sent: 0,
      failed: 0, 
      errors: []
    };
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test connection to API
   */
  async testConnection() {
    try {
      const testRecord = {
        source_id: this.config.sourceId,
        event_source: this.config.sourceId,
        name: "Test Game vs Test Opponent",
        home_team: "Test Home",
        away_team: "Test Away", 
        event_datetime: new Date().toISOString(),
        league: "Test League",
        sport: "Test Sport",
        status: "test",
        markets: null
      };
      
      console.log('🧪 Testing API connection...');
      
      const response = await fetch(`${this.config.apiBaseUrl}/raw-bets/upsert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiToken}`
        },
        body: JSON.stringify(testRecord)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('✅ API connection test successful');
      return result;
      
    } catch (error) {
      console.error('❌ API connection test failed:', error);
      throw error;
    }
  }
}

// Export the class
export default APISender;