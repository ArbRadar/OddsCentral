// Track which tabs are enabled for scraping
let enabledTabs = new Set();
let currentTab = null;

// Check if a tab looks like a sportsbook page
function isSportsbookTab(tab) {
  const url = tab.url || '';
  const title = tab.title || '';
  return url.includes('odds') || url.includes('sportsbook') || 
         url.includes('betting') || url.includes('mlb') ||
         url.includes('nfl') || url.includes('nba') ||
         url.includes('nhl') || url.includes('soccer') ||
         title.includes('odds') || title.includes('betting');
}

// Get a readable name for a tab
function getTabDisplayName(tab) {
  try {
    const url = new URL(tab.url);
    const hostname = url.hostname.replace('www.', '');
    
    // Extract meaningful path info
    const pathParts = url.pathname.split('/').filter(p => p && p !== 'odds');
    const pathInfo = pathParts.length > 0 ? ` - ${pathParts.slice(0, 2).join('/')}` : '';
    
    return `${hostname}${pathInfo}`;
  } catch (error) {
    return tab.title || 'Unknown Page';
  }
}

// Get current active tab
async function getCurrentTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  } catch (error) {
    console.error('Error getting current tab:', error);
    return null;
  }
}

async function updateStatus() {
  try {
    // Get current tab
    currentTab = await getCurrentTab();
    
    // Get status from background script
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
    
    // Update Supabase status
    const supabaseStatus = document.getElementById('supabase-status');
    if (response.initialized) {
      supabaseStatus.textContent = 'Connected';
      supabaseStatus.className = 'status-value active';
    } else {
      supabaseStatus.textContent = 'Disconnected';
      supabaseStatus.className = 'status-value inactive';
    }
    
    // Update games count
    document.getElementById('games-count').textContent = response.gamesCount || 0;
    
    // Update current tab section
    const currentTabDiv = document.getElementById('current-tab');
    if (currentTab && isSportsbookTab(currentTab)) {
      const isEnabled = enabledTabs.has(currentTab.id);
      const activeTabs = response.activeTabs || [];
      const isActive = activeTabs.some(t => t.id === currentTab.id);
      const activeTab = activeTabs.find(t => t.id === currentTab.id);
      const timeSince = activeTab ? Date.now() - activeTab.lastUpdate : null;
      const seconds = timeSince ? Math.floor(timeSince / 1000) : null;
      
      currentTabDiv.innerHTML = `
        <div class="tab-item ${isActive ? 'active' : ''}">
          <div class="tab-header">
            <div class="tab-title">${getTabDisplayName(currentTab)}</div>
            <button class="tab-toggle ${isEnabled ? 'active' : ''}" 
                    data-tab-id="${currentTab.id}" id="current-tab-toggle">
              ${isEnabled ? 'Stop' : 'Start'}
            </button>
          </div>
          <div class="tab-url">${currentTab.url}</div>
          ${isActive && seconds !== null ? `
            <div class="tab-stats">
              <span>Last update: ${seconds}s ago</span>
              <span>Status: Scraping</span>
            </div>
          ` : isEnabled ? `
            <div class="tab-stats">
              <span>Status: Starting...</span>
            </div>
          ` : ''}
        </div>
      `;
      
      // Add click handler for current tab toggle
      document.getElementById('current-tab-toggle').addEventListener('click', handleTabToggle);
    } else {
      currentTabDiv.innerHTML = `
        <div class="empty-state">
          ${currentTab ? 'Not on a sportsbook page' : 'No active tab'}
        </div>
      `;
    }
    
    // Update active scraping tabs count
    const activeTabs = response.activeTabs || [];
    const activeScrapingTabs = activeTabs.filter(tab => enabledTabs.has(tab.id));
    document.getElementById('active-count').textContent = activeScrapingTabs.length;
    
    // Update active tabs list (exclude current tab)
    const activeTabsList = document.getElementById('active-tabs-list');
    const otherActiveTabs = activeScrapingTabs.filter(tab => 
      !currentTab || tab.id !== currentTab.id
    );
    
    if (otherActiveTabs.length === 0) {
      activeTabsList.innerHTML = '<div class="empty-state">No other tabs currently scraping</div>';
    } else {
      // Get tab details for active tabs
      const allTabs = await chrome.tabs.query({});
      const tabsMap = new Map(allTabs.map(tab => [tab.id, tab]));
      
      activeTabsList.innerHTML = otherActiveTabs.map(activeTab => {
        const tab = tabsMap.get(activeTab.id);
        if (!tab) return ''; // Tab might have been closed
        
        const timeSince = Date.now() - activeTab.lastUpdate;
        const seconds = Math.floor(timeSince / 1000);
        
        return `
          <div class="tab-item active">
            <div class="tab-header">
              <div class="tab-title">${getTabDisplayName(tab)}</div>
              <button class="tab-toggle active" data-tab-id="${tab.id}">
                Stop
              </button>
            </div>
            <div class="tab-url">${tab.url}</div>
            <div class="tab-stats">
              <span>Last update: ${seconds}s ago</span>
              <span>Status: Scraping</span>
            </div>
          </div>
        `;
      }).join('');
      
      // Add click handlers to stop buttons
      document.querySelectorAll('#active-tabs-list .tab-toggle').forEach(button => {
        button.addEventListener('click', handleTabToggle);
      });
    }
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// Handle tab toggle
async function handleTabToggle(event) {
  const button = event.target;
  const tabId = parseInt(button.getAttribute('data-tab-id'));
  const isEnabled = enabledTabs.has(tabId);
  
  if (isEnabled) {
    // Stop scraping
    enabledTabs.delete(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'STOP_SCRAPING' });
      console.log(`Stopped scraping on tab ${tabId}`);
    } catch (error) {
      console.error('Error stopping scraping:', error);
    }
  } else {
    // Start scraping
    enabledTabs.add(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'START_SCRAPING' });
      console.log(`Started scraping on tab ${tabId}`);
    } catch (error) {
      console.error('Error starting scraping:', error);
      // If tab doesn't have content script, inject it
      if (error.message.includes('Could not establish connection')) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          });
          // Try again after injection
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tabId, { type: 'START_SCRAPING' });
              console.log(`Started scraping on tab ${tabId} after injection`);
            } catch (retryError) {
              console.error('Error starting scraping after injection:', retryError);
              enabledTabs.delete(tabId); // Remove from enabled if failed
            }
          }, 500);
        } catch (injectionError) {
          console.error('Error injecting content script:', injectionError);
          enabledTabs.delete(tabId); // Remove from enabled if failed
        }
      } else {
        enabledTabs.delete(tabId); // Remove from enabled if failed
      }
    }
  }
  
  // Update UI immediately
  setTimeout(updateStatus, 100);
}

// Handle stop all button
async function handleStopAll() {
  const tabsToStop = Array.from(enabledTabs);
  for (const tabId of tabsToStop) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'STOP_SCRAPING' });
      console.log(`Stopped scraping on tab ${tabId}`);
    } catch (error) {
      console.error(`Error stopping tab ${tabId}:`, error);
    }
  }
  enabledTabs.clear();
  await updateStatus();
}

// Load saved enabled tabs from storage
async function loadEnabledTabs() {
  try {
    const result = await chrome.storage.local.get('enabledTabs');
    if (result.enabledTabs) {
      enabledTabs = new Set(result.enabledTabs);
    }
  } catch (error) {
    console.error('Error loading enabled tabs:', error);
  }
}

// Save enabled tabs to storage
async function saveEnabledTabs() {
  try {
    await chrome.storage.local.set({ 
      enabledTabs: Array.from(enabledTabs) 
    });
  } catch (error) {
    console.error('Error saving enabled tabs:', error);
  }
}

// Handle analytics button
async function handleAnalytics() {
  try {
    // Get the analytics.html file URL
    const analyticsUrl = chrome.runtime.getURL('analytics.html');
    
    // Open in new tab
    await chrome.tabs.create({ url: analyticsUrl });
    
    // Close popup
    window.close();
  } catch (error) {
    console.error('Error opening analytics:', error);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadEnabledTabs();
  await updateStatus();
  
  // Set up button handlers
  document.getElementById('analytics-btn').addEventListener('click', handleAnalytics);
  document.getElementById('refresh-btn').addEventListener('click', updateStatus);
  document.getElementById('stop-all-btn').addEventListener('click', handleStopAll);
});

// Save enabled tabs whenever they change
setInterval(saveEnabledTabs, 1000);

// Auto-refresh every 2 seconds
setInterval(updateStatus, 2000);