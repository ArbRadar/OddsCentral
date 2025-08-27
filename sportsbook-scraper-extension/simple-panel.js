// Set up event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('test-btn').addEventListener('click', testConnection);
    document.getElementById('fetch-btn').addEventListener('click', fetchAndSend);
    document.getElementById('clear-btn').addEventListener('click', clearResults);
});

function showResult(message, isSuccess = true) {
    const div = document.createElement('div');
    div.className = `result ${isSuccess ? 'success' : 'error'}`;
    div.textContent = message;
    document.getElementById('results').appendChild(div);
}

async function testConnection() {
    try {
        showResult('🧪 Testing API connection...', true);
        const result = await window.simpleAPI.test();
        showResult(`✅ Connection successful!\nResponse: ${JSON.stringify(result, null, 2)}`, true);
    } catch (error) {
        showResult(`❌ Connection failed: ${error.message}`, false);
    }
}

async function fetchAndSend() {
    try {
        const limit = parseInt(document.getElementById('limit').value) || 5;
        showResult(`🚀 Fetching and sending ${limit} records...`, true);
        
        const result = await window.simpleAPI.fetchAndSend(limit);
        
        showResult(`✅ Batch complete: ${result.successful} successful, ${result.failed} failed`, true);
        
        if (result.results) {
            const details = result.results
                .filter(r => !r.success)
                .map(r => `Error: ${r.error}`)
                .slice(0, 3) // Show first 3 errors
                .join('\n');
            
            if (details) {
                showResult(`Recent errors:\n${details}`, false);
            }
        }
        
    } catch (error) {
        showResult(`❌ Fetch and send failed: ${error.message}`, false);
    }
}

function clearResults() {
    document.getElementById('results').innerHTML = '';
}