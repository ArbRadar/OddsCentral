// Verify Deduplication JavaScript
document.addEventListener('DOMContentLoaded', () => {
    // Open background console to see logs
    document.getElementById('openConsole').addEventListener('click', () => {
        chrome.runtime.getBackgroundPage((bg) => {
            console.log('Check the background page console for deduplication logs');
        });
    });
    
    document.getElementById('test1hour').addEventListener('click', async () => {
        const resultsDiv = document.getElementById('results');
        resultsDiv.innerHTML = '<p>Testing...</p>';
        
        try {
            // Request data from background script
            console.log('Requesting analytics data for 1 hour...');
            const response = await chrome.runtime.sendMessage({ 
                type: 'GET_ANALYTICS_DATA',
                hoursBack: 1
            });
            
            if (response && response.success) {
                const data = response.data;
                
                // Count unique game_ids
                const uniqueGameIds = new Set(data.games.map(g => g.game_id));
                const duplicatesFound = data.games.length > uniqueGameIds.size;
                
                // Count unique odds by game_id + sportsbook
                const uniqueOddsKeys = new Set();
                const oddssDuplicates = [];
                
                data.odds.forEach(odd => {
                    const key = `${odd.game_id}-${odd.sportsbook}`;
                    if (uniqueOddsKeys.has(key)) {
                        oddssDuplicates.push(key);
                    }
                    uniqueOddsKeys.add(key);
                });
                
                resultsDiv.innerHTML = `
                    <div class="result ${duplicatesFound ? 'bad' : 'good'}">
                        <h2>Games Deduplication</h2>
                        <p><strong>Total games returned:</strong> ${data.games.length}</p>
                        <p><strong>Unique game_ids:</strong> ${uniqueGameIds.size}</p>
                        <p><strong>Status:</strong> ${duplicatesFound ? '❌ DUPLICATES FOUND!' : '✅ No duplicates - deduplication working!'}</p>
                    </div>
                    
                    <div class="result ${oddssDuplicates.length > 0 ? 'bad' : 'good'}">
                        <h2>Odds Deduplication</h2>
                        <p><strong>Total odds returned:</strong> ${data.odds.length}</p>
                        <p><strong>Unique game_id+sportsbook combos:</strong> ${uniqueOddsKeys.size}</p>
                        <p><strong>Duplicate odds found:</strong> ${oddssDuplicates.length}</p>
                        <p><strong>Status:</strong> ${oddssDuplicates.length > 0 ? '❌ DUPLICATES FOUND!' : '✅ No duplicates - deduplication working!'}</p>
                    </div>
                    
                    <div class="result">
                        <h2>Sample Games</h2>
                        <pre>${JSON.stringify(data.games.slice(0, 3).map(g => ({
                            game_id: g.game_id,
                            teams: `${g.away_team} @ ${g.home_team}`,
                            created_at: g.created_at
                        })), null, 2)}</pre>
                    </div>
                    
                    <p><strong>Check the console for deduplication logs from the background script!</strong></p>
                `;
                
                // Also log to console
                console.log('Full response:', response);
                console.log('Games data:', data.games);
                console.log('Unique game IDs:', Array.from(uniqueGameIds));
                
            } else {
                resultsDiv.innerHTML = `<div class="result bad">Error: ${response?.error || 'Unknown error'}</div>`;
            }
        } catch (error) {
            resultsDiv.innerHTML = `<div class="result bad">Error: ${error.message}</div>`;
        }
    });
});