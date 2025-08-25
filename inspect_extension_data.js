// Browser script to inspect captured API data and find real game endpoints
// Run this in browser console on OddsJam pages after the extension has been running

console.log('🔍 Inspecting Extension API Capture Data...');

// Check if the API interceptor has captured any data
if (window.__capturedAPIs) {
    const apis = window.__capturedAPIs;
    
    console.log('📊 API Capture Summary:');
    console.log('XHR requests:', apis.xhr.size);
    console.log('Fetch requests:', apis.fetch.size);
    console.log('GraphQL requests:', apis.graphql.size);
    console.log('WebSocket connections:', apis.websocket.size);
    
    // Analyze each type of captured request
    function analyzeRequests(requests, type) {
        console.log(`\n🔍 Analyzing ${type} requests:`);
        
        requests.forEach((details, url) => {
            console.log(`\n📡 ${type}: ${url}`);
            console.log('Method:', details.method);
            console.log('Response Type:', details.responseType);
            
            if (details.responseStructure) {
                const structure = details.responseStructure;
                console.log('Structure:', structure.type);
                console.log('Keys:', structure.keys);
                
                // Check for game data patterns
                const hasGameData = structure.patterns?.hasEvents || 
                                  structure.patterns?.hasMarkets ||
                                  structure.keys?.includes('games') ||
                                  structure.keys?.includes('events') ||
                                  structure.keys?.includes('odds');
                
                if (hasGameData) {
                    console.log('🎯 POTENTIAL GAME DATA ENDPOINT!');
                    console.log('Patterns:', structure.patterns);
                    
                    if (details.sampleData) {
                        console.log('Sample data:', details.sampleData);
                    }
                } else {
                    console.log('📋 Configuration/metadata endpoint');
                }
            }
            
            // Check timing patterns for real-time data
            if (apis.timing.has(url.split('?')[0])) {
                const timings = apis.timing.get(url.split('?')[0]);
                if (timings.length > 3) {
                    const intervals = [];
                    for (let i = 1; i < timings.length; i++) {
                        intervals.push(timings[i] - timings[i-1]);
                    }
                    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                    console.log(`⏰ Polling detected: ${Math.round(avgInterval/1000)}s average interval`);
                    console.log('🔄 This is likely a real-time data endpoint!');
                }
            }
        });
    }
    
    analyzeRequests(apis.xhr, 'XHR');
    analyzeRequests(apis.fetch, 'Fetch');
    analyzeRequests(apis.graphql, 'GraphQL');
    
    // Special handling for WebSocket
    if (apis.websocket.size > 0) {
        console.log('\n🔌 Analyzing WebSocket connections:');
        apis.websocket.forEach((details, url) => {
            console.log(`\nWebSocket: ${url}`);
            console.log('Messages captured:', details.messages.length);
            
            if (details.messages.length > 0) {
                const latestMessage = details.messages[details.messages.length - 1];
                console.log('Latest message structure:', latestMessage.structure);
                console.log('Sample data:', latestMessage.data);
                console.log('🔄 WebSocket likely provides real-time game updates!');
            }
        });
    }
    
    // Look for endpoints that might be game-related but not yet triggered
    console.log('\n💡 Recommendations for finding real game data:');
    console.log('1. Navigate between different sports and betting markets');
    console.log('2. Wait for live games to start (real-time data will flow)');
    console.log('3. Check if any endpoints are polling at regular intervals');
    console.log('4. Look for WebSocket connections that push live updates');
    
    // Export findings for external analysis
    const findings = {
        timestamp: new Date().toISOString(),
        xhr_endpoints: Array.from(apis.xhr.entries()),
        fetch_endpoints: Array.from(apis.fetch.entries()),
        graphql_endpoints: Array.from(apis.graphql.entries()),
        websocket_endpoints: Array.from(apis.websocket.entries()),
        timing_patterns: Array.from(apis.timing.entries())
    };
    
    console.log('\n💾 Exporting findings to window.apiFindings for download');
    window.apiFindings = findings;
    
    // Provide download function
    window.downloadFindings = function() {
        const blob = new Blob([JSON.stringify(findings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `oddsjam_api_findings_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    console.log('📥 Run window.downloadFindings() to download the analysis');
    
} else {
    console.log('❌ No captured API data found.');
    console.log('Make sure the API interceptor extension is loaded and active.');
    console.log('Try refreshing the page and waiting for network activity.');
}

// Also check for any Next.js router data that might contain endpoints
if (window.__NEXT_DATA__) {
    console.log('\n🔍 Checking Next.js data...');
    const nextData = window.__NEXT_DATA__;
    console.log('Build ID:', nextData.buildId);
    console.log('Page props keys:', Object.keys(nextData.props?.pageProps || {}));
    
    // Look for any API URLs in the Next.js data
    const dataStr = JSON.stringify(nextData);
    const urlPattern = /https?:\/\/[^\s"]+(?:api|data|games|odds|events)[^\s"]*/gi;
    const foundUrls = dataStr.match(urlPattern);
    
    if (foundUrls) {
        console.log('🔗 Found potential API URLs in Next.js data:');
        foundUrls.forEach(url => console.log('  ', url));
    }
}

console.log('\n✅ Analysis complete. Check the console output above for findings.');