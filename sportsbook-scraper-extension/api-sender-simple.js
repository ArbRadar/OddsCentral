/**
 * Simplified API Sender for testing - no external dependencies
 */

window.APISenderSimple = class APISenderSimple {
  constructor() {
    this.config = {
      apiBaseUrl: 'https://arb-general-api-1.onrender.com',
      apiToken: '8044652f46c0ed50756a3a22d72f0c7b582b8b',
      sourceId: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5'
    };
  }

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

      const responseText = await response.text();
      console.log('API Response:', response.status, responseText);

      if (!response.ok) {
        throw new Error(`API Error ${response.status}: ${responseText}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        result = { message: responseText };
      }

      console.log('✅ API connection test successful');
      return result;
      
    } catch (error) {
      console.error('❌ API connection test failed:', error);
      throw error;
    }
  }
};