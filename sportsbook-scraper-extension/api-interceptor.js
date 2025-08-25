// API Interceptor - Captures network requests to reverse engineer endpoints
(function() {
  'use strict';
  
  console.log('🔍 API Interceptor initialized at', window.location.href);
  
  // Inject visible indicator that API detection is active
  const indicator = document.createElement('div');
  indicator.style.cssText = 'position:fixed;top:10px;right:10px;background:#8b5cf6;color:white;padding:5px 10px;border-radius:20px;font-size:12px;z-index:99999';
  indicator.textContent = '🔍 API Detection Active';
  document.body.appendChild(indicator);
  setTimeout(() => indicator.remove(), 3000);
  
  // Store for captured API calls with timing
  const capturedAPIs = {
    xhr: new Map(),
    fetch: new Map(),
    graphql: new Map(),
    websocket: new Map(),
    timing: new Map() // Track request timing patterns
  };
  
  // Patterns that indicate odds/betting data
  const ODDS_PATTERNS = [
    /odds/i,
    /lines/i,
    /markets/i,
    /events/i,
    /games/i,
    /sports/i,
    /betting/i,
    /prices/i,
    /spreads/i,
    /moneyline/i,
    /totals/i,
    /props/i,
    /live/i,
    /pregame/i
  ];
  
  // Check if we're on a sportsbook domain
  function isSportsbookDomain() {
    const sportsbookDomains = [
      'oddsjam.com',
      'fanduel.com', 
      'draftkings.com',
      'caesars.com',
      'betmgm.com',
      'pointsbet.com',
      'barstoolsportsbook.com'
    ];
    
    return sportsbookDomains.some(domain => 
      window.location.hostname.includes(domain)
    );
  }
  
  // Check if URL should be captured based on current mode
  async function shouldCaptureURL(url) {
    try {
      // Get current API capture mode
      const { apiCaptureMode = 'sportsbook_only' } = await chrome.storage.local.get('apiCaptureMode');
      
      // If disabled, don't capture anything
      if (apiCaptureMode === 'off') {
        return false;
      }
      
      // If manual only, only capture when user explicitly enables (not implemented yet)
      if (apiCaptureMode === 'manual_only') {
        // TODO: Check if capture is manually enabled for current page
        return false;
      }
      
      // Default: sportsbook_only mode
      if (!isSportsbookDomain()) {
        return false;
      }
      
      return ODDS_PATTERNS.some(pattern => pattern.test(url));
      
    } catch (error) {
      console.error('Error checking capture mode:', error);
      // Fallback to sportsbook-only behavior
      return isSportsbookDomain() && ODDS_PATTERNS.some(pattern => pattern.test(url));
    }
  }
  
  // Wrapper function for backward compatibility
  function isOddsRelated(url) {
    // This will be replaced with async calls below
    return isSportsbookDomain() && ODDS_PATTERNS.some(pattern => pattern.test(url));
  }
  
  // Track request timing patterns
  function trackRequestTiming(url, timestamp = Date.now()) {
    if (!isOddsRelated(url)) return;
    
    const baseUrl = url.split('?')[0]; // Remove query params for grouping
    if (!capturedAPIs.timing.has(baseUrl)) {
      capturedAPIs.timing.set(baseUrl, []);
    }
    
    const timings = capturedAPIs.timing.get(baseUrl);
    timings.push(timestamp);
    
    // Keep only last 20 requests for analysis
    if (timings.length > 20) {
      timings.shift();
    }
    
    // Calculate intervals if we have enough data
    if (timings.length >= 3) {
      const intervals = [];
      for (let i = 1; i < timings.length; i++) {
        intervals.push(timings[i] - timings[i-1]);
      }
      
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      console.log(`🕒 ${baseUrl}: Avg interval ${Math.round(avgInterval/1000)}s (${timings.length} requests)`);
      
      // Report to background script if pattern detected
      if (intervals.length >= 5 && avgInterval > 1000 && avgInterval < 300000) { // 1s-5min
        chrome.runtime.sendMessage({
          type: 'POLLING_PATTERN_DETECTED',
          endpoint: baseUrl,
          avgIntervalMs: avgInterval,
          requestCount: timings.length,
          intervals: intervals.slice(-5) // Last 5 intervals
        });
      }
    }
  }
  
  // Extract API details from response
  function extractAPIDetails(url, response, requestData) {
    const urlObj = new URL(url, window.location.origin);
    
    return {
      url: url,
      method: requestData?.method || 'GET',
      host: urlObj.host,
      path: urlObj.pathname,
      query: Object.fromEntries(urlObj.searchParams),
      headers: requestData?.headers || {},
      body: requestData?.body,
      timestamp: new Date().toISOString(),
      responseType: response?.headers?.get?.('content-type') || 'unknown'
    };
  }
  
  // Override XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  const XHRSend = originalXHR.prototype.send;
  const XHROpen = originalXHR.prototype.open;
  const XHRSetRequestHeader = originalXHR.prototype.setRequestHeader;
  
  // Track XHR details
  originalXHR.prototype.open = function(method, url, ...args) {
    this._requestDetails = { method, url, headers: {} };
    return XHROpen.call(this, method, url, ...args);
  };
  
  originalXHR.prototype.setRequestHeader = function(header, value) {
    if (this._requestDetails) {
      this._requestDetails.headers[header] = value;
    }
    return XHRSetRequestHeader.call(this, header, value);
  };
  
  originalXHR.prototype.send = function(body) {
    const requestDetails = this._requestDetails;
    if (requestDetails) {
      requestDetails.body = body;
      
      // Track timing for odds-related requests
      trackRequestTiming(requestDetails.url);
      
      this.addEventListener('load', function() {
        if (this.status >= 200 && this.status < 300 && isOddsRelated(requestDetails.url)) {
          try {
            const responseData = this.responseText;
            const apiDetails = extractAPIDetails(requestDetails.url, this, requestDetails);
            
            // Parse response to understand structure
            let parsedResponse;
            try {
              parsedResponse = JSON.parse(responseData);
              apiDetails.responseStructure = analyzeDataStructure(parsedResponse);
              apiDetails.sampleData = extractSampleData(parsedResponse);
            } catch (e) {
              apiDetails.responseFormat = 'non-json';
            }
            
            // Store captured API
            capturedAPIs.xhr.set(requestDetails.url, apiDetails);
            
            console.log('📡 XHR API Captured:', apiDetails);
            
            // Flash indicator
            const flash = document.createElement('div');
            flash.style.cssText = 'position:fixed;top:50px;right:10px;background:#22c55e;color:white;padding:5px 10px;border-radius:20px;font-size:12px;z-index:99999';
            flash.textContent = `✓ API Captured: ${requestDetails.method} ${requestDetails.url.split('?')[0]}`;
            document.body.appendChild(flash);
            setTimeout(() => flash.remove(), 2000);
            
            // Send to content script via postMessage (we're in page context)
            window.postMessage({
              type: 'API_ENDPOINT_CAPTURED',
              source: 'xhr',
              details: apiDetails
            }, '*');
          } catch (error) {
            console.error('Error capturing XHR:', error);
          }
        }
      });
    }
    
    return XHRSend.call(this, body);
  };
  
  // Override fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const [resource, config] = args;
    const url = typeof resource === 'string' ? resource : resource.url;
    
    // Track timing for odds-related requests
    trackRequestTiming(url);
    
    // Call original fetch
    const response = await originalFetch.apply(this, args);
    
    // Clone response to read it without consuming
    const clonedResponse = response.clone();
    
    if (response.ok && isOddsRelated(url)) {
      try {
        const responseData = await clonedResponse.text();
        const apiDetails = extractAPIDetails(url, response, {
          method: config?.method || 'GET',
          headers: config?.headers || {},
          body: config?.body
        });
        
        // Parse response
        try {
          const parsedResponse = JSON.parse(responseData);
          apiDetails.responseStructure = analyzeDataStructure(parsedResponse);
          apiDetails.sampleData = extractSampleData(parsedResponse);
          
          // Detect GraphQL
          if (parsedResponse.data && parsedResponse.data.__typename) {
            apiDetails.type = 'graphql';
            apiDetails.query = config?.body;
            capturedAPIs.graphql.set(url, apiDetails);
          }
        } catch (e) {
          apiDetails.responseFormat = 'non-json';
        }
        
        capturedAPIs.fetch.set(url, apiDetails);
        
        console.log('📡 Fetch API Captured:', apiDetails);
        
        // Flash indicator
        const flash = document.createElement('div');
        flash.style.cssText = 'position:fixed;top:50px;right:10px;background:#3b82f6;color:white;padding:5px 10px;border-radius:20px;font-size:12px;z-index:99999';
        flash.textContent = `✓ Fetch Captured: ${config?.method || 'GET'} ${url.split('?')[0]}`;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 2000);
        
        // Send to content script via postMessage (we're in page context)
        window.postMessage({
          type: 'API_ENDPOINT_CAPTURED',
          source: 'fetch',
          details: apiDetails
        }, '*');
      } catch (error) {
        console.error('Error capturing fetch:', error);
      }
    }
    
    return response;
  };
  
  // Monitor WebSocket connections
  const originalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    console.log('🔌 WebSocket connection detected:', url);
    
    const ws = new originalWebSocket(url, protocols);
    
    if (isOddsRelated(url)) {
      const wsDetails = {
        url: url,
        protocols: protocols,
        messages: [],
        opened: new Date().toISOString()
      };
      
      ws.addEventListener('message', function(event) {
        try {
          const data = JSON.parse(event.data);
          wsDetails.messages.push({
            timestamp: new Date().toISOString(),
            data: data,
            structure: analyzeDataStructure(data)
          });
          
          // Keep only last 10 messages
          if (wsDetails.messages.length > 10) {
            wsDetails.messages.shift();
          }
          
          capturedAPIs.websocket.set(url, wsDetails);
          
          console.log('📡 WebSocket message captured:', data);
        } catch (e) {
          // Not JSON
        }
      });
    }
    
    return ws;
  };
  
  // Analyze data structure to understand API format
  function analyzeDataStructure(data) {
    const structure = {
      type: Array.isArray(data) ? 'array' : typeof data,
      keys: [],
      patterns: {}
    };
    
    if (typeof data === 'object' && data !== null) {
      structure.keys = Object.keys(data);
      
      // Look for common patterns
      if (data.data) structure.patterns.hasDataWrapper = true;
      if (data.events || data.games) structure.patterns.hasEvents = true;
      if (data.markets || data.odds) structure.patterns.hasMarkets = true;
      if (data.outcomes || data.selections) structure.patterns.hasOutcomes = true;
      
      // Check for nested structures
      structure.keys.forEach(key => {
        const value = data[key];
        if (Array.isArray(value) && value.length > 0) {
          structure.patterns[key] = {
            type: 'array',
            length: value.length,
            itemStructure: analyzeDataStructure(value[0])
          };
        }
      });
    }
    
    return structure;
  }
  
  // Extract sample data for analysis
  function extractSampleData(data) {
    if (Array.isArray(data)) {
      return data.slice(0, 2); // First 2 items
    } else if (typeof data === 'object' && data !== null) {
      const sample = {};
      Object.keys(data).forEach(key => {
        const value = data[key];
        if (Array.isArray(value)) {
          sample[key] = value.slice(0, 1); // First item of arrays
        } else if (typeof value === 'object') {
          sample[key] = '...object...';
        } else {
          sample[key] = value;
        }
      });
      return sample;
    }
    return data;
  }
  
  // Expose captured APIs for debugging
  window.__capturedAPIs = capturedAPIs;
  
  // Report captured APIs periodically
  setInterval(() => {
    const summary = {
      xhr: Array.from(capturedAPIs.xhr.entries()),
      fetch: Array.from(capturedAPIs.fetch.entries()),
      graphql: Array.from(capturedAPIs.graphql.entries()),
      websocket: Array.from(capturedAPIs.websocket.entries())
    };
    
    if (summary.xhr.length > 0 || summary.fetch.length > 0) {
      console.log('📊 API Capture Summary:', summary);
    }
  }, 30000); // Every 30 seconds
  
})();