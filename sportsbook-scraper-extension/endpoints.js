// Endpoints page JavaScript
let allEndpoints = new Map();
let filterText = '';

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
  await loadEndpoints();
  setupEventListeners();
  
  // Auto-refresh every 5 seconds
  setInterval(loadEndpoints, 5000);
});

// Load endpoints from all tabs
async function loadEndpoints() {
  try {
    // Get all tabs
    const tabs = await chrome.tabs.query({});
    const endpointsByDomain = new Map();
    
    // Query each tab for discovered endpoints
    for (const tab of tabs) {
      if (!tab.url || tab.url.startsWith('chrome://')) continue;
      
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_DISCOVERED_ENDPOINTS',
          domain: new URL(tab.url).hostname
        });
        
        if (response.success && response.endpoints.length > 0) {
          if (!endpointsByDomain.has(response.domain)) {
            endpointsByDomain.set(response.domain, {
              endpoints: [],
              lastUpdated: response.lastUpdated
            });
          }
          
          const domainData = endpointsByDomain.get(response.domain);
          
          // Merge endpoints, avoiding duplicates
          response.endpoints.forEach(endpoint => {
            const exists = domainData.endpoints.some(e => 
              e.method === endpoint.method && e.path === endpoint.path
            );
            if (!exists) {
              domainData.endpoints.push(endpoint);
            }
          });
        }
      } catch (error) {
        // Tab might not have our content script
      }
    }
    
    // Also get stored endpoints from background script
    const allDomains = new Set([...endpointsByDomain.keys()]);
    
    // Get unique domains from current tabs
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://')) {
        try {
          const domain = new URL(tab.url).hostname;
          allDomains.add(domain);
        } catch (e) {}
      }
    });
    
    // Query background script for each domain
    for (const domain of allDomains) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_DISCOVERED_ENDPOINTS',
          domain: domain
        });
        
        if (response.success && response.endpoints.length > 0) {
          if (!endpointsByDomain.has(domain)) {
            endpointsByDomain.set(domain, {
              endpoints: response.endpoints,
              lastUpdated: response.lastUpdated
            });
          } else {
            // Merge with existing
            const domainData = endpointsByDomain.get(domain);
            response.endpoints.forEach(endpoint => {
              const exists = domainData.endpoints.some(e => 
                e.method === endpoint.method && e.path === endpoint.path
              );
              if (!exists) {
                domainData.endpoints.push(endpoint);
              }
            });
          }
        }
      } catch (error) {
        console.error(`Error getting endpoints for ${domain}:`, error);
      }
    }
    
    allEndpoints = endpointsByDomain;
    renderEndpoints();
    updateStats();
  } catch (error) {
    console.error('Error loading endpoints:', error);
  }
}

// Render endpoints to the page
function renderEndpoints() {
  const grid = document.getElementById('domains-grid');
  
  if (allEndpoints.size === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No API Endpoints Discovered Yet</h3>
        <p>Navigate to sportsbook pages and the extension will automatically capture API calls.</p>
        <p>Make sure API detection is enabled in the extension settings.</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  
  allEndpoints.forEach((domainData, domain) => {
    const endpoints = domainData.endpoints.filter(endpoint => {
      if (!filterText) return true;
      const searchText = filterText.toLowerCase();
      return endpoint.path.toLowerCase().includes(searchText) ||
             endpoint.method.toLowerCase().includes(searchText) ||
             domain.toLowerCase().includes(searchText);
    });
    
    if (endpoints.length === 0 && filterText) return;
    
    html += `
      <div class="domain-card" data-domain="${domain}">
        <div class="domain-header" data-domain="${domain}">
          <div class="domain-name">
            <span class="chevron">▶</span>
            ${domain}
            <span class="endpoint-count">${endpoints.length}</span>
          </div>
          <div class="domain-meta">
            Last updated: ${new Date(domainData.lastUpdated).toLocaleTimeString()}
          </div>
        </div>
        <div class="endpoints-list">
          ${endpoints.map(endpoint => renderEndpoint(endpoint)).join('')}
        </div>
      </div>
    `;
  });
  
  grid.innerHTML = html;
  
  // Add click handlers to domain headers
  document.querySelectorAll('.domain-header').forEach(header => {
    header.addEventListener('click', () => {
      const domain = header.dataset.domain;
      toggleDomain(domain);
    });
  });
}

// Render individual endpoint
function renderEndpoint(endpoint) {
  const queryParams = Object.entries(endpoint.query || {});
  const hasStructure = endpoint.responseStructure;
  
  return `
    <div class="endpoint-item">
      <div class="endpoint-header">
        <span class="method ${endpoint.method}">${endpoint.method}</span>
        <span class="endpoint-path">${endpoint.path}</span>
      </div>
      <div class="endpoint-details">
        ${queryParams.length > 0 ? `
          <div class="detail-row">
            <span class="detail-label">Query:</span>
            <div class="query-params">
              ${queryParams.map(([key, value]) => 
                `<span class="query-param">${key}=${value}</span>`
              ).join('')}
            </div>
          </div>
        ` : ''}
        <div class="detail-row">
          <span class="detail-label">Source:</span>
          <span class="detail-value">${endpoint.source}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Response:</span>
          <span class="detail-value">${endpoint.responseType || 'unknown'}</span>
        </div>
        ${hasStructure ? `
          <div class="detail-row">
            <span class="detail-label">Structure:</span>
            <div class="structure-preview">
              ${formatStructure(endpoint.responseStructure)}
            </div>
          </div>
        ` : ''}
        ${endpoint.sampleData ? `
          <div class="detail-row">
            <span class="detail-label">Sample:</span>
            <div class="structure-preview">
              ${JSON.stringify(endpoint.sampleData, null, 2).substring(0, 200)}...
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Format response structure for display
function formatStructure(structure) {
  if (!structure) return 'N/A';
  
  let output = `Type: ${structure.type}\n`;
  if (structure.keys && structure.keys.length > 0) {
    output += `Keys: ${structure.keys.slice(0, 10).join(', ')}${structure.keys.length > 10 ? '...' : ''}\n`;
  }
  if (structure.patterns) {
    const patterns = [];
    if (structure.patterns.hasDataWrapper) patterns.push('data wrapper');
    if (structure.patterns.hasEvents) patterns.push('events/games');
    if (structure.patterns.hasMarkets) patterns.push('markets/odds');
    if (structure.patterns.hasOutcomes) patterns.push('outcomes');
    if (patterns.length > 0) {
      output += `Patterns: ${patterns.join(', ')}`;
    }
  }
  return output;
}

// Update statistics
function updateStats() {
  let totalEndpoints = 0;
  const uniquePaths = new Set();
  let apiCalls = 0;
  
  allEndpoints.forEach(domainData => {
    domainData.endpoints.forEach(endpoint => {
      totalEndpoints++;
      uniquePaths.add(endpoint.path);
      apiCalls++; // In real implementation, track actual call count
    });
  });
  
  document.getElementById('total-domains').textContent = allEndpoints.size;
  document.getElementById('total-endpoints').textContent = totalEndpoints;
  document.getElementById('unique-paths').textContent = uniquePaths.size;
  document.getElementById('api-calls').textContent = apiCalls;
}

// Toggle domain expansion
function toggleDomain(domain) {
  const card = document.querySelector(`.domain-card[data-domain="${domain}"]`);
  if (card) {
    card.classList.toggle('expanded');
  }
}

// Setup event listeners
function setupEventListeners() {
  // Filter input
  document.getElementById('filter').addEventListener('input', (e) => {
    filterText = e.target.value;
    renderEndpoints();
  });
  
  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', loadEndpoints);
  
  // Clear button
  document.getElementById('clear-btn').addEventListener('click', async () => {
    if (confirm('Clear all discovered endpoints?')) {
      // Send clear message to background script
      await chrome.runtime.sendMessage({ type: 'CLEAR_ENDPOINTS' });
      allEndpoints.clear();
      renderEndpoints();
      updateStats();
    }
  });
  
  // Export button
  document.getElementById('export-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = document.getElementById('export-dropdown');
    dropdown.classList.toggle('show');
  });
  
  // Export options
  document.querySelectorAll('.export-option').forEach(option => {
    option.addEventListener('click', (e) => {
      const format = e.target.dataset.format;
      exportEndpoints(format);
      document.getElementById('export-dropdown').classList.remove('show');
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', () => {
    document.getElementById('export-dropdown').classList.remove('show');
  });
}

// Export endpoints in various formats
function exportEndpoints(format) {
  let data;
  let filename;
  let mimeType;
  
  switch (format) {
    case 'json':
      data = exportAsJSON();
      filename = 'api-endpoints.json';
      mimeType = 'application/json';
      break;
      
    case 'har':
      data = exportAsHAR();
      filename = 'api-endpoints.har';
      mimeType = 'application/json';
      break;
      
    case 'postman':
      data = exportAsPostman();
      filename = 'api-endpoints-postman.json';
      mimeType = 'application/json';
      break;
      
    case 'curl':
      data = exportAsCurl();
      filename = 'api-endpoints.sh';
      mimeType = 'text/plain';
      break;
  }
  
  // Download file
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Export as JSON
function exportAsJSON() {
  const exportData = {};
  allEndpoints.forEach((domainData, domain) => {
    exportData[domain] = domainData;
  });
  return JSON.stringify(exportData, null, 2);
}

// Export as HAR (HTTP Archive)
function exportAsHAR() {
  const har = {
    log: {
      version: '1.2',
      creator: {
        name: 'Sportsbook Scraper',
        version: '1.0.0'
      },
      entries: []
    }
  };
  
  allEndpoints.forEach((domainData, domain) => {
    domainData.endpoints.forEach(endpoint => {
      har.log.entries.push({
        request: {
          method: endpoint.method,
          url: `https://${domain}${endpoint.path}`,
          headers: Object.entries(endpoint.headers || {}).map(([name, value]) => ({
            name,
            value
          })),
          queryString: Object.entries(endpoint.query || {}).map(([name, value]) => ({
            name,
            value
          }))
        }
      });
    });
  });
  
  return JSON.stringify(har, null, 2);
}

// Export for Postman
function exportAsPostman() {
  const collection = {
    info: {
      name: 'Sportsbook APIs',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    item: []
  };
  
  allEndpoints.forEach((domainData, domain) => {
    const folder = {
      name: domain,
      item: []
    };
    
    domainData.endpoints.forEach(endpoint => {
      folder.item.push({
        name: `${endpoint.method} ${endpoint.path}`,
        request: {
          method: endpoint.method,
          header: Object.entries(endpoint.headers || {}).map(([key, value]) => ({
            key,
            value
          })),
          url: {
            raw: `https://${domain}${endpoint.path}`,
            protocol: 'https',
            host: [domain],
            path: endpoint.path.split('/').filter(Boolean),
            query: Object.entries(endpoint.query || {}).map(([key, value]) => ({
              key,
              value
            }))
          }
        }
      });
    });
    
    collection.item.push(folder);
  });
  
  return JSON.stringify(collection, null, 2);
}

// Export as cURL commands
function exportAsCurl() {
  let output = '#!/bin/bash\n\n';
  output += '# Sportsbook API Endpoints - cURL Commands\n\n';
  
  allEndpoints.forEach((domainData, domain) => {
    output += `# ${domain}\n`;
    
    domainData.endpoints.forEach(endpoint => {
      output += `\n# ${endpoint.method} ${endpoint.path}\n`;
      output += `curl -X ${endpoint.method} \\\n`;
      output += `  'https://${domain}${endpoint.path}`;
      
      // Add query parameters
      const queryParams = Object.entries(endpoint.query || {});
      if (queryParams.length > 0) {
        output += '?' + queryParams.map(([k, v]) => `${k}=${v}`).join('&');
      }
      output += `' \\\n`;
      
      // Add headers
      Object.entries(endpoint.headers || {}).forEach(([key, value]) => {
        output += `  -H '${key}: ${value}' \\\n`;
      });
      
      output = output.slice(0, -3) + '\n'; // Remove last backslash
    });
    
    output += '\n';
  });
  
  return output;
}