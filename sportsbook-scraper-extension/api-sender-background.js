/**
 * API Sender for Background Script - Service Worker Compatible
 * No ES6 imports, works in Chrome extension service worker context
 */

class BackgroundAPISender {
  constructor() {
    this.config = {
      supabaseUrl: 'http://localhost:54320',
      supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      apiBaseUrl: 'https://arb-general-api-1.onrender.com',
      apiToken: '8044652f46c0ed50756a3a22d72f0c7b582b8b',
      sourceId: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
      batchSize: 10,
      retryAttempts: 3,
      retryDelay: 1000
    };

    // Statistics
    this.stats = {
      sent: 0,
      failed: 0,
      errors: []
    };

    // Bookmaker mapping
    this.bookmakerUUIDs = {
      'DraftKings': 'fe6bc0f8-e8a9-4083-9401-766d30817009',
      'FanDuel': 'd0f4c753-b2a3-4f02-ace3-f23d6987184a', 
      'BetMGM': 'a4fb81f8-ba8c-4012-bd74-10f78846d6ea',
      'BetRivers': 'd543b534-8a9c-403c-bcbf-ab64a9cb6767',
      'Fanatics': '52c379c7-d293-448b-bb0e-3d97235e5973',
      'Bovada': '5d096137-fba9-45bd-bbad-6865d86f6582',
      'bet365': 'ce996a90-c4bf-40b3-803f-daffe6c19b4f',
      'pinnacle': '41a3c468-e086-4dd5-883a-d740d802c629',
      'betway': '834c26c6-1eed-48f7-afc3-22f3b2518809',
      'unibet': '5e02c81a-c435-442f-bd6e-c42cd73383d5',
      '1xbet': '9d8d5f66-2a8c-4da1-9143-cf9dd557b50b',
      'stake': 'b36c6d2a-306e-48ae-9e6b-0fe8767e52db',
      'unknown': '17a7de9a-c23b-49eb-9816-93ebc3bba1c5'
    };
  }

  getBookmakerUUID(bookmakerName) {
    if (!bookmakerName) return this.bookmakerUUIDs['unknown'];
    
    const normalized = bookmakerName.toLowerCase().trim();
    
    // Direct mapping first
    for (const [name, uuid] of Object.entries(this.bookmakerUUIDs)) {
      if (name.toLowerCase() === normalized) {
        return uuid;
      }
    }
    
    // Partial matches
    if (normalized.includes('draftkings') || normalized.includes('dk')) {
      return this.bookmakerUUIDs['DraftKings'];
    }
    if (normalized.includes('fanduel') || normalized.includes('fd')) {
      return this.bookmakerUUIDs['FanDuel'];
    }
    if (normalized.includes('betmgm') || normalized.includes('mgm')) {
      return this.bookmakerUUIDs['BetMGM'];
    }
    
    return this.bookmakerUUIDs['unknown'];
  }

  americanToDecimal(americanOdds) {
    if (!americanOdds || americanOdds === 0) return null;
    
    const odds = parseInt(americanOdds);
    if (odds > 0) {
      return (odds / 100) + 1;
    } else {
      return (100 / Math.abs(odds)) + 1;
    }
  }

  async fetchOddsFromSupabase(limit = 10, gameIds = null) {
    try {
      let url = `${this.config.supabaseUrl}/rest/v1/games?select=*,odds(*)`;
      
      if (gameIds && gameIds.length > 0) {
        url += `&game_id=in.(${gameIds.map(id => `"${id}"`).join(',')})`;
      }
      
      if (limit && !gameIds) {
        url += `&limit=${limit}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'apikey': this.config.supabaseKey,
          'Authorization': `Bearer ${this.config.supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Supabase error: ${response.status}`);
      }
      
      const games = await response.json();
      
      // Filter games that have odds
      const gamesWithOdds = games.filter(game => game.odds && game.odds.length > 0);
      
      console.log(`📊 Fetched ${gamesWithOdds.length} games with odds`);
      return gamesWithOdds;
      
    } catch (error) {
      console.error('Error fetching from Supabase:', error);
      throw error;
    }
  }

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
      
      // Add odds for each outcome
      if (odds.home_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Home',
          outcome_team: game.home_team,
          american_price: odds.home_odds,
          price: this.americanToDecimal(odds.home_odds),
          format: 'decimal',
          bookmaker: odds.sportsbook
        });
      }
      
      if (odds.away_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Away',
          outcome_team: game.away_team,
          american_price: odds.away_odds,
          price: this.americanToDecimal(odds.away_odds),
          format: 'decimal',
          bookmaker: odds.sportsbook
        });
      }
      
      if (odds.draw_odds) {
        groupedOdds[key].odds.push({
          outcome: 'Draw',
          outcome_team: 'Draw',
          american_price: odds.draw_odds,
          price: this.americanToDecimal(odds.draw_odds),
          format: 'decimal',
          bookmaker: odds.sportsbook
        });
      }
    });
    
    markets.push(...Object.values(groupedOdds));
    
    // Get event source UUID
    const firstBookmaker = oddsData[0]?.sportsbook;
    const eventSourceId = this.getBookmakerUUID(firstBookmaker);
    
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
      
      console.log(`✅ Sent: ${record.name} (${record.markets.total_markets} markets)`);
      return result;

    } catch (error) {
      console.error(`❌ Send failed (attempt ${attempt}):`, error.message);
      
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

  async sendAll(limit = 50) {
    try {
      console.log('🚀 Starting send operation...');
      
      const games = await this.fetchOddsFromSupabase(limit);
      
      if (games.length === 0) {
        console.log('ℹ️ No games with odds found');
        return { successful: 0, failed: 0 };
      }
      
      let successful = 0;
      let failed = 0;
      
      for (const game of games) {
        try {
          const record = this.transformToAPIFormat(game, game.odds);
          await this.sendRecord(record);
          successful++;
        } catch (error) {
          console.error(`Failed to send game ${game.game_id}:`, error.message);
          failed++;
        }
      }
      
      console.log(`✅ Send complete: ${successful} successful, ${failed} failed`);
      
      return {
        successful,
        failed,
        stats: this.getStats()
      };
      
    } catch (error) {
      console.error('Error in send operation:', error);
      throw error;
    }
  }

  async sendByGameIds(gameIds) {
    try {
      const games = await this.fetchOddsFromSupabase(null, gameIds);
      
      let successful = 0;
      let failed = 0;
      
      for (const game of games) {
        try {
          const record = this.transformToAPIFormat(game, game.odds);
          await this.sendRecord(record);
          successful++;
        } catch (error) {
          failed++;
        }
      }
      
      return { successful, failed };
      
    } catch (error) {
      console.error('Error sending specific games:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const testRecord = {
        source_id: this.config.sourceId,
        event_source: this.config.sourceId,
        name: 'Background API Test vs Test Opponent',
        home_team: 'Background Test Home',
        away_team: 'Background Test Away',
        event_datetime: new Date().toISOString(),
        league: 'Background Test League',
        sport: 'Background Test Sport',
        status: 'background_test',
        markets: null
      };
      
      console.log('🧪 Testing API connection from background...');
      const result = await this.sendRecord(testRecord);
      console.log('✅ Background API test successful');
      return result;
      
    } catch (error) {
      console.error('❌ Background API test failed:', error);
      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.sent + this.stats.failed > 0 ? 
        (this.stats.sent / (this.stats.sent + this.stats.failed) * 100).toFixed(2) + '%' : 
        '0%'
    };
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make available globally in background script
if (typeof globalThis !== 'undefined') {
  globalThis.BackgroundAPISender = BackgroundAPISender;
}