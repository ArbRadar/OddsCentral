const resultDiv = document.getElementById('result');
const logDiv = document.getElementById('log');

function log(message) {
    const timestamp = new Date().toLocaleTimeString();
    logDiv.textContent += `[${timestamp}] ${message}\n`;
    logDiv.scrollTop = logDiv.scrollHeight;
    console.log(message);
}

function showResult(success, message) {
    resultDiv.innerHTML = `<div class="result ${success ? 'success' : 'error'}">${message}</div>`;
}

// Test direct API call
document.getElementById('test-direct').addEventListener('click', async () => {
    const button = document.getElementById('test-direct');
    button.disabled = true;
    button.textContent = 'Testing...';
    
    try {
        log('🧪 Testing direct API call...');
        
        const testData = {
            source_id: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
            event_source: '17a7de9a-c23b-49eb-9816-93ebc3bba1c5',
            name: 'Direct Test Game vs Direct Test Opponent',
            home_team: 'Direct Test Home',
            away_team: 'Direct Test Away',
            event_datetime: new Date().toISOString(),
            league: 'Direct Test League',
            sport: 'Direct Test Sport',
            status: 'direct_test',
            markets: null
        };
        
        log('Sending request to: https://arb-general-api-1.onrender.com/raw-bets/upsert');
        log('Request data: ' + JSON.stringify(testData, null, 2));
        
        const response = await fetch('https://arb-general-api-1.onrender.com/raw-bets/upsert', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 8044652f46c0ed50756a3a22d72f0c7b582b8b'
            },
            body: JSON.stringify(testData)
        });
        
        log(`Response status: ${response.status} ${response.statusText}`);
        
        const responseText = await response.text();
        log('Response text: ' + responseText);
        
        if (response.ok) {
            showResult(true, `✅ Direct API test successful! Status: ${response.status}`);
            log('✅ Direct API test successful');
        } else {
            showResult(false, `❌ Direct API test failed: ${response.status} - ${responseText}`);
            log(`❌ Direct API test failed: ${response.status}`);
        }
        
    } catch (error) {
        log(`❌ Error: ${error.message}`);
        showResult(false, `❌ Error: ${error.message}`);
    }
    
    button.disabled = false;
    button.textContent = 'Test Direct API Call';
});

// Test simple sender
document.getElementById('test-simple').addEventListener('click', async () => {
    const button = document.getElementById('test-simple');
    button.disabled = true;
    button.textContent = 'Testing...';
    
    try {
        log('🧪 Testing simple sender...');
        
        const sender = new APISenderSimple();
        const result = await sender.testConnection();
        
        showResult(true, '✅ Simple sender test successful!');
        log('Simple sender result: ' + JSON.stringify(result, null, 2));
        
    } catch (error) {
        log(`❌ Simple sender error: ${error.message}`);
        showResult(false, `❌ Simple sender error: ${error.message}`);
    }
    
    button.disabled = false;
    button.textContent = 'Test Simple Sender';
});

// Clear log
document.getElementById('clear-log').addEventListener('click', () => {
    logDiv.textContent = '';
    resultDiv.innerHTML = '';
    log('Log cleared');
});

// Initial log message
log('Simple API test page loaded');