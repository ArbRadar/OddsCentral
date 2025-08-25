// Scraping Dashboard JavaScript

const SUPABASE_URL = 'http://localhost:54320';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

let scrapingEnabled = false;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
  console.log('🎯 Initializing Scraping Dashboard');
  loadDashboardData();
  setInterval(loadDashboardData, 5000); // Refresh every 5 seconds
  
  // Set up event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Control panel buttons
  document.getElementById('toggle-scraping-btn').addEventListener('click', toggleScraping);
  document.getElementById('refresh-dashboard-btn').addEventListener('click', refreshDashboard);
  document.getElementById('view-config-btn').addEventListener('click', viewConfig);
  document.getElementById('clear-failed-btn').addEventListener('click', clearFailedURLs);
  
  // Scraping method controls
  document.getElementById('toggle-scrapy-btn').addEventListener('click', toggleScrapy);
  document.getElementById('toggle-visual-btn').addEventListener('click', toggleVisual);
  document.getElementById('default-method-select').addEventListener('change', updateDefaultMethod);
  
  // Delegate retry button clicks
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('retry-url-btn')) {
      const urlId = e.target.getAttribute('data-url-id');
      if (urlId) {
        retryURL(parseInt(urlId));
      }
    }
  });
}

async function loadDashboardData() {
  try {
    // Load multiple data sources in parallel
    const [config, endpoints, jobs] = await Promise.all([
      getScrapingConfig(),
      getEndpointsStats(),
      getRecentJobs()
    ]);
    
    updateMonitorStatus(config);
    updateEndpointStats(endpoints);
    updateJobHistory(jobs);
    
  } catch (error) {
    console.error('Error loading dashboard:', error);
  }
}

async function getScrapingConfig() {
  const response = await fetch(`${SUPABASE_URL}/scraping_config`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  
  if (!response.ok) throw new Error('Failed to load config');
  
  const data = await response.json();
  const config = {};
  data.forEach(item => {
    config[item.key] = item.value;
  });
  
  return config;
}

async function getEndpointsStats() {
  // Get URL manager URLs instead of discovered endpoints
  const response = await fetch(`${SUPABASE_URL}/sportsbook_urls?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  
  if (!response.ok) throw new Error('Failed to load URLs');
  
  return response.json();
}

async function getRecentJobs() {
  const response = await fetch(
    `${SUPABASE_URL}/scraping_jobs?order=created_at.desc&limit=10`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );
  
  if (!response.ok) throw new Error('Failed to load jobs');
  
  return response.json();
}

function updateMonitorStatus(config) {
  scrapingEnabled = config.scraping_enabled === 'true';
  
  const statusIndicator = document.getElementById('monitor-status');
  const statusText = document.getElementById('monitor-status-text');
  const toggleButton = document.getElementById('scraping-toggle-text');
  
  if (scrapingEnabled) {
    statusIndicator.classList.add('active');
    statusIndicator.classList.remove('inactive');
    statusText.textContent = 'Active';
    toggleButton.textContent = 'Stop Scraping';
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('inactive');
    statusText.textContent = 'Inactive';
    toggleButton.textContent = 'Start Scraping';
  }
  
  // Calculate next scrape time
  const intervalSeconds = parseInt(config.scrape_interval_seconds || 300);
  const nextScrapeMinutes = Math.floor(intervalSeconds / 60);
  document.getElementById('next-scrape-time').textContent = `${nextScrapeMinutes}:00`;
}

function updateEndpointStats(urls) {
  const stats = {
    total: urls.length,
    success: 0,
    failed: 0,
    pending: 0,
    active: 0
  };
  
  const tbody = document.getElementById('endpoints-tbody');
  tbody.innerHTML = '';
  
  urls.forEach(url => {
    // Count active URLs as active workers
    if (url.active) {
      stats.active++;
    }
    
    // Categorize based on scraping success
    if (url.success_count > 0) {
      stats.success++;
    } else if (url.error_count > 0) {
      stats.failed++;
    } else {
      stats.pending++;
    }
    
    // Add to table
    const row = createURLRow(url);
    tbody.appendChild(row);
  });
  
  // Update stats display
  document.getElementById('total-endpoints').textContent = stats.total;
  document.getElementById('success-endpoints').textContent = stats.success;
  document.getElementById('failed-endpoints').textContent = stats.failed;
  document.getElementById('pending-endpoints').textContent = stats.pending;
  document.getElementById('active-workers').textContent = stats.active;
}

function createURLRow(url) {
  const row = document.createElement('tr');
  
  const successRate = url.scrape_count > 0 
    ? Math.round((url.success_count / url.scrape_count) * 100)
    : 0;
  
  const status = url.active ? (url.success_count > 0 ? 'success' : 'pending') : 'inactive';
  
  row.innerHTML = `
    <td>${url.domain}</td>
    <td><span class="endpoint-path">${url.url}</span></td>
    <td><span class="status-badge ${status}">${status}</span></td>
    <td class="timestamp">${formatTimestamp(url.last_scraped)}</td>
    <td>${successRate}%</td>
    <td>
      <button class="secondary retry-url-btn" style="padding: 4px 8px; font-size: 12px;" 
              data-url-id="${url.id}">Retry</button>
    </td>
  `;
  
  return row;
}

function updateJobHistory(jobs) {
  const container = document.getElementById('job-history');
  container.innerHTML = '';
  
  if (jobs.length === 0) {
    container.innerHTML = '<div class="job-item"><span>No jobs found</span></div>';
    return;
  }
  
  // Calculate 24h stats
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  let jobsCompleted = 0;
  let gamesScraped = 0;
  let oddsScraped = 0;
  
  jobs.forEach(job => {
    const jobDate = new Date(job.created_at);
    
    if (jobDate > yesterday && job.status === 'completed') {
      jobsCompleted++;
      gamesScraped += job.games_scraped || 0;
      oddsScraped += job.odds_scraped || 0;
    }
    
    const jobItem = createJobItem(job);
    container.appendChild(jobItem);
  });
  
  // Update stats
  document.getElementById('jobs-completed').textContent = jobsCompleted;
  document.getElementById('games-scraped').textContent = gamesScraped;
  document.getElementById('odds-scraped').textContent = oddsScraped;
}

function createJobItem(job) {
  const item = document.createElement('div');
  item.className = 'job-item';
  
  const statusIcon = {
    'completed': '✅',
    'failed': '❌',
    'running': '🔄',
    'pending': '⏳'
  }[job.status] || '❓';
  
  item.innerHTML = `
    <div>
      <span>${statusIcon}</span>
      <span>${job.job_type}</span>
      <span style="color: #666; margin-left: 10px;">
        ${job.endpoints_count || 0} endpoints, 
        ${job.games_scraped || 0} games
      </span>
    </div>
    <div class="timestamp">${formatTimestamp(job.created_at)}</div>
  `;
  
  return item;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  
  return date.toLocaleDateString();
}

async function toggleScraping() {
  try {
    const newValue = !scrapingEnabled;
    
    const response = await fetch(
      `${SUPABASE_URL}/scraping_config?key=eq.scraping_enabled`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: String(newValue) })
      }
    );
    
    if (response.ok) {
      console.log(`✅ Scraping ${newValue ? 'enabled' : 'disabled'}`);
      loadDashboardData();
    } else {
      console.error('Failed to toggle scraping');
    }
  } catch (error) {
    console.error('Error toggling scraping:', error);
  }
}

async function retryURL(urlId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/sportsbook_urls?id=eq.${urlId}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          active: true,
          error_count: 0,
          last_error: null
        })
      }
    );
    
    if (response.ok) {
      console.log(`✅ URL ${urlId} marked for retry`);
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error retrying URL:', error);
  }
}

async function clearFailedURLs() {
  if (!confirm('Clear all failed URLs?')) return;
  
  try {
    const response = await fetch(
      `${SUPABASE_URL}/sportsbook_urls?error_count=gt.0`,
      {
        method: 'PATCH',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          error_count: 0,
          last_error: null
        })
      }
    );
    
    if (response.ok) {
      console.log('✅ Failed URLs cleared');
      loadDashboardData();
    }
  } catch (error) {
    console.error('Error clearing URLs:', error);
  }
}

function refreshDashboard() {
  loadDashboardData();
}

function viewConfig() {
  chrome.tabs.create({ url: chrome.runtime.getURL('config.html') });
}

async function toggleScrapy() {
  try {
    const currentConfig = await getScrapingConfig();
    const scrapyEnabled = currentConfig.find(c => c.key === 'scrapy_enabled')?.value === 'true';
    const newValue = !scrapyEnabled;
    
    const response = await fetch(`${SUPABASE_URL}/scraping_config?key=eq.scrapy_enabled`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: newValue.toString() })
    });
    
    if (response.ok) {
      document.getElementById('scrapy-toggle-text').textContent = newValue ? 'Disable Scrapy' : 'Enable Scrapy';
      refreshDashboard();
    }
  } catch (error) {
    console.error('Error toggling Scrapy:', error);
  }
}

async function toggleVisual() {
  try {
    const currentConfig = await getScrapingConfig();
    const visualEnabled = currentConfig.find(c => c.key === 'visual_scraping_enabled')?.value === 'true';
    const newValue = !visualEnabled;
    
    const response = await fetch(`${SUPABASE_URL}/scraping_config?key=eq.visual_scraping_enabled`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: newValue.toString() })
    });
    
    if (response.ok) {
      document.getElementById('visual-toggle-text').textContent = newValue ? 'Disable Visual' : 'Enable Visual';
      refreshDashboard();
    }
  } catch (error) {
    console.error('Error toggling Visual:', error);
  }
}

async function updateDefaultMethod() {
  try {
    const selectedMethod = document.getElementById('default-method-select').value;
    
    const response = await fetch(`${SUPABASE_URL}/scraping_config?key=eq.scraping_method_priority`, {
      method: 'PATCH', 
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: selectedMethod })
    });
    
    if (response.ok) {
      refreshDashboard();
    }
  } catch (error) {
    console.error('Error updating default method:', error);
  }
}