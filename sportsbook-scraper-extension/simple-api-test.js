/**
 * Simple API Test - Just call the endpoint directly
 */

// Simple test function
async function testAPI() {
    try {
        console.log('🧪 Testing API directly...');
        
        const testData = {
            source_id: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
            event_source: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
            name: 'Simple Test Game vs Simple Test Opponent',
            home_team: 'Simple Test Home',
            away_team: 'Simple Test Away',
            event_datetime: new Date().toISOString(),
            league: 'Simple Test League',
            sport: 'Simple Test Sport',
            status: 'simple_test',
            markets: null
        };
        
        const response = await fetch('https://arb-general-api-1.onrender.com/raw-bets/upsert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 8044652f46c0ed50756a3a22d72f0c7b582b8b'
            },
            body: JSON.stringify(testData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log('✅ API test successful:', result);
        return result;
        
    } catch (error) {
        console.error('❌ API test failed:', error);
        throw error;
    }
}

// Simple function to send odds data
async function sendOddsData(oddsData) {
    try {
        console.log('🚀 Sending odds data...');
        
        const results = [];
        
        for (const record of oddsData) {
            try {
                const response = await fetch('https://arb-general-api-1.onrender.com/raw-bets/upsert', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer 8044652f46c0ed50756a3a22d72f0c7b582b8b'
                    },
                    body: JSON.stringify(record)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    results.push({ success: true, result });
                    console.log(`✅ Sent: ${record.name}`);
                } else {
                    const errorText = await response.text();
                    results.push({ success: false, error: `${response.status}: ${errorText}` });
                    console.error(`❌ Failed to send ${record.name}: ${response.status}`);
                }
                
                // Small delay between requests
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } catch (error) {
                results.push({ success: false, error: error.message });
                console.error(`❌ Error sending ${record.name}:`, error.message);
            }
        }
        
        const successful = results.filter(r => r.success).length;
        const failed = results.filter(r => !r.success).length;
        
        console.log(`✅ Batch complete: ${successful} successful, ${failed} failed`);
        
        return { successful, failed, results };
        
    } catch (error) {
        console.error('❌ Batch send failed:', error);
        throw error;
    }
}

// Simplified version - recommend using Python script instead
async function fetchAndSendOdds(limit = 10) {
    try {
        console.log('⚠️ Note: Due to Supabase REST API configuration issues, this JavaScript version may not work reliably.');
        console.log('💡 Recommended: Use the Python script instead: python direct_db_test.py');
        
        throw new Error('JavaScript Supabase access is unreliable. Use Python script: python direct_db_test.py');
        
    } catch (error) {
        console.error('❌ Error in fetchAndSendOdds:', error);
        throw error;
    }
}

// Make functions available globally
window.simpleAPI = {
    test: testAPI,
    sendOdds: sendOddsData,
    fetchAndSend: fetchAndSendOdds
};