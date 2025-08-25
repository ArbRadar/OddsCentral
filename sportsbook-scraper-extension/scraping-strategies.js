// Multiple scraping strategies to avoid detection and maximize data capture

const SCRAPING_STRATEGIES = {
  // Strategy 1: Visual DOM scraping (current approach)
  visual: {
    name: 'Visual DOM Scraping',
    description: 'Scrolls through visible content and extracts from DOM',
    pros: ['Works on all sites', 'Captures exactly what users see'],
    cons: ['High RAM usage', 'Requires multiple tabs', 'Slow'],
    implementation: 'current'
  },
  
  // Strategy 2: API Interception
  apiInterception: {
    name: 'API Request Interception',
    description: 'Intercepts network requests to capture raw API data',
    pros: ['Fast', 'Low RAM', 'Gets complete data'],
    cons: ['Some sites detect modifications', 'May trigger security'],
    detect: async function() {
      // Passive detection - just observe without modifying
      return new Promise((resolve) => {
        const apis = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
              if (entry.name.match(/odds|lines|markets|events/i)) {
                apis.push({
                  url: entry.name,
                  duration: entry.duration,
                  size: entry.transferSize
                });
              }
            }
          }
        });
        
        observer.observe({ entryTypes: ['resource'] });
        
        // Observe for 10 seconds then report
        setTimeout(() => {
          observer.disconnect();
          resolve(apis);
        }, 10000);
      });
    }
  },
  
  // Strategy 3: Direct API Calls
  directAPI: {
    name: 'Direct API Access',
    description: 'Makes direct calls to discovered API endpoints',
    pros: ['Fastest', 'Lowest resource usage', 'No browser needed'],
    cons: ['Requires API discovery', 'May need auth tokens', 'CORS issues'],
    endpoints: new Map() // Store discovered endpoints per site
  },
  
  // Strategy 4: Service Worker Interception
  serviceWorker: {
    name: 'Service Worker Proxy',
    description: 'Registers service worker to intercept all requests',
    pros: ['Captures everything', 'Works with dynamic content'],
    cons: ['Detectable', 'Complex setup', 'May break site functionality'],
    implementation: async function() {
      // This would register a service worker to intercept requests
      // Not implementing due to detection concerns
    }
  },
  
  // Strategy 5: Browser DevTools Protocol
  devtools: {
    name: 'DevTools Protocol',
    description: 'Uses Chrome DevTools Protocol for network inspection',
    pros: ['Official API', 'Powerful', 'Less detectable'],
    cons: ['Requires separate connection', 'Complex'],
    implementation: 'requires-background-script'
  },
  
  // Strategy 6: Hybrid Approach
  hybrid: {
    name: 'Hybrid Multi-Strategy',
    description: 'Combines multiple strategies based on site detection',
    pros: ['Adaptive', 'Maximizes success rate'],
    cons: ['Complex', 'Requires per-site configuration'],
    implementation: async function(site) {
      // Detect best strategy for site
      const strategies = [];
      
      // Try API detection first (least invasive)
      const apis = await SCRAPING_STRATEGIES.apiInterception.detect();
      if (apis.length > 0) {
        strategies.push('apiInterception');
      }
      
      // Check if visual scraping is working
      const hasGrid = document.querySelector('.ag-grid, .ag-root, [data-sport]');
      if (hasGrid) {
        strategies.push('visual');
      }
      
      return strategies;
    }
  },
  
  // Strategy 7: Minimal Request Forgery
  requestForgery: {
    name: 'Request Forgery',
    description: 'Recreates API requests with minimal browser footprint',
    pros: ['Very low resource usage', 'Hard to detect'],
    cons: ['Requires request analysis', 'May need session tokens'],
    implementation: async function(apiDetails) {
      // Extract key request parameters
      const { url, headers, method, body } = apiDetails;
      
      // Clone important headers but remove telltale signs
      const cleanHeaders = { ...headers };
      delete cleanHeaders['sec-fetch-dest'];
      delete cleanHeaders['sec-fetch-mode'];
      delete cleanHeaders['sec-fetch-site'];
      
      // Make request from background script to avoid CORS
      return await chrome.runtime.sendMessage({
        type: 'MAKE_API_REQUEST',
        url,
        method,
        headers: cleanHeaders,
        body
      });
    }
  },
  
  // Strategy 8: Virtual Display Scraping
  virtualDisplay: {
    name: 'Virtual Display',
    description: 'Simulates different screen sizes to trigger responsive layouts',
    pros: ['Gets mobile/tablet specific data', 'Triggers different data loads'],
    cons: ['Still requires DOM scraping', 'May look suspicious'],
    implementation: async function() {
      // Simulate different viewports
      const viewports = [
        { width: 3840, height: 2160, zoom: 0.25 }, // 4K with zoom out
        { width: 768, height: 4000, zoom: 0.5 },   // Tall mobile
        { width: 1920, height: 1080, zoom: 0.4 }   // Standard with zoom
      ];
      
      for (const vp of viewports) {
        await chrome.runtime.sendMessage({
          type: 'SET_VIEWPORT',
          ...vp
        });
        
        // Wait for content to adjust
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Trigger scroll to load content
        window.scrollTo(0, document.body.scrollHeight);
      }
    }
  }
};

// Site-specific strategy configurations
const SITE_STRATEGIES = {
  'draftkings.com': {
    preferred: ['apiInterception', 'visual'],
    apiPatterns: ['/api/odds/v2/', '/api/events/'],
    notes: 'DK has good API but also anti-bot detection'
  },
  'fanduel.com': {
    preferred: ['visual', 'hybrid'],
    apiPatterns: ['/api/events', '/api/markets'],
    notes: 'FD is strict on API access'
  },
  'caesars.com': {
    preferred: ['visual'],
    notes: 'Heavy anti-scraping measures'
  },
  'default': {
    preferred: ['hybrid', 'visual'],
    notes: 'Try multiple approaches'
  }
};

// Get optimal strategy for current site
function getOptimalStrategy() {
  const hostname = window.location.hostname;
  const siteConfig = SITE_STRATEGIES[hostname] || SITE_STRATEGIES.default;
  
  console.log(`🎯 Strategy for ${hostname}:`, siteConfig);
  
  return {
    strategies: siteConfig.preferred.map(s => SCRAPING_STRATEGIES[s]),
    config: siteConfig
  };
}

// Export for use in content script
window.ScrapingStrategies = {
  STRATEGIES: SCRAPING_STRATEGIES,
  SITE_CONFIGS: SITE_STRATEGIES,
  getOptimalStrategy
};