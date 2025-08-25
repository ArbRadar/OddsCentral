// API Scraper Initialization Script (runs in page context)
// This script initializes the API scraper and notifies the content script

(function() {
  // Wait for APIScraper to be available
  function initializeAPIScraperWhenReady() {
    if (window.APIScraper) {
      try {
        window.apiScraperInstance = new window.APIScraper();
        window.apiScraperInstance.initialize();
        console.log('🚀 API scraper initialized successfully in page context');
        window.postMessage({type: 'API_SCRAPER_INITIALIZED', success: true}, '*');
      } catch (error) {
        console.error('❌ Failed to initialize API scraper:', error);
        window.postMessage({type: 'API_SCRAPER_INITIALIZED', success: false, error: error.message}, '*');
      }
    } else {
      // Retry after a short delay
      setTimeout(initializeAPIScraperWhenReady, 100);
    }
  }
  
  // Start initialization
  initializeAPIScraperWhenReady();
})();