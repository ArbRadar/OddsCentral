// Wrap entire script in IIFE to allow early returns
(function() {
  'use strict';
  
  // Check if extension context is valid
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      return false;
    }
  }

  // Global flag to track if extension is invalidated
  let extensionInvalidated = false;

  // Early exit if extension context is invalid
  if (!isExtensionContextValid()) {
    console.log('Extension context invalid at load time - not initializing scraper');
    return;
  }

  // Listen for extension context invalidation
  try {
    chrome.runtime.onMessage.addListener(() => {
      // This will throw if context is invalidated
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      extensionInvalidated = true;
      console.log('Extension context invalidated - cleaning up');
      cleanup();
      return;
    }
  }

  // Immediate debug to verify extension is loading
  console.log('Sportsbook scraper extension loaded at:', window.location.href);

// Configuration moved inline since content scripts don't support ES6 imports
const SPORT_CONFIGS = {
  MLB: {
    displayName: 'Major League Baseball',
    terminology: {
      score: 'runs',
      period: 'inning',
      periods: 'innings'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      runline: {
        name: 'Run Line',
        outcomes: 2,
        description: 'Point spread for baseball'
      },
      total: {
        name: 'Total Runs',
        outcomes: 2,
        description: 'Over/Under total runs scored'
      }
    }
  },
  NFL: {
    displayName: 'National Football League',
    terminology: {
      score: 'points',
      period: 'quarter',
      periods: 'quarters'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      spread: {
        name: 'Point Spread',
        outcomes: 2,
        description: 'Point spread betting'
      },
      total: {
        name: 'Total Points',
        outcomes: 2,
        description: 'Over/Under total points scored'
      }
    }
  },
  NBA: {
    displayName: 'National Basketball Association',
    terminology: {
      score: 'points',
      period: 'quarter',
      periods: 'quarters'
    },
    markets: {
      moneyline: {
        name: 'Moneyline',
        outcomes: 2,
        description: 'Win/Loss betting'
      },
      spread: {
        name: 'Point Spread',
        outcomes: 2,
        description: 'Point spread betting'
      },
      total: {
        name: 'Total Points',
        outcomes: 2,
        description: 'Over/Under total points scored'
      }
    }
  },
  SOCCER: {
    displayName: 'Soccer',
    terminology: {
      score: 'goals',
      period: 'half',
      periods: 'halves'
    },
    markets: {
      moneyline: {
        name: '1X2',
        outcomes: 3,
        description: 'Win/Draw/Win betting'
      },
      total: {
        name: 'Total Goals',
        outcomes: 2,
        description: 'Over/Under total goals scored'
      }
    }
  }
};

const LAYOUT_CONFIGS = {
  // OddsJam AG Grid layout (current)
  oddsjam_aggrid: {
    name: 'OddsJam AG Grid',
    urlPatterns: ['oddsjam.com'],
    selectors: {
      grid: {
        root: 'div.ag-root',
        rows: 'div[role="row"]',
        cell: 'div.ag-cell',
        containers: {
          left: '.ag-pinned-left-cols-container',
          center: '.ag-center-cols-container, .ag-body-viewport',
          right: '.ag-pinned-right-cols-container'
        }
      },
      columns: {
        startTime: '[col-id="startTime"]',
        rotationNumber: '[col-id="rotationNumber"]',
        teamName: '[col-id="teamName"]',
        bestPrice: '[col-id="bestPrice"]',
        averagePrice: '[col-id="averagePrice"]'
      },
      elements: {
        teamText: 'p.text-inherit.__className_19640c.truncate.text-sm.font-medium',
        rotationText: 'p.text-inherit.__className_15aff7.text-center.text-sm.font-bold',
        oddsText: 'p.__className_15aff7.text-sm.w-full.text-center.font-semibold.text-brand-gray-9',
        gameLink: 'a[href^="/game/"]'
      }
    },
    features: {
      multiContainer: true,
      dynamicColumns: true,
      bestOdds: true,
      averageOdds: true,
      rotationNumbers: true
    }
  },
  
  // Generic table layout for other sportsbooks
  generic_table: {
    name: 'Generic Table',
    urlPatterns: ['*'],
    selectors: {
      grid: {
        root: 'table, .table, [role="table"]',
        rows: 'tr, [role="row"]',
        cell: 'td, th, [role="cell"]'
      },
      columns: {
        startTime: '.time, .start-time, [data-col="time"]',
        teamName: '.teams, .team-name, [data-col="teams"]',
        bestPrice: '.best, .best-odds, [data-col="best"]',
        averagePrice: '.avg, .average, [data-col="average"]'
      },
      elements: {
        teamText: 'span, div, p',
        oddsText: 'span, div, p',
        gameLink: 'a'
      }
    },
    features: {
      multiContainer: false,
      dynamicColumns: false,
      bestOdds: false,
      averageOdds: false,
      rotationNumbers: false
    }
  }
};

// Current layout configuration
let currentLayout = null;
let currentSportConfig = null;

let lastDataHash = '';
let observer = null;
let scrapeInterval = null;

// Detect and configure layout based on current page
function detectLayout() {
  const currentUrl = window.location.href;
  
  // Try to match URL patterns to layout configs
  for (const [layoutKey, config] of Object.entries(LAYOUT_CONFIGS)) {
    for (const pattern of config.urlPatterns) {
      if (pattern === '*' || currentUrl.includes(pattern)) {
        console.log(`Detected layout: ${config.name} for URL: ${currentUrl}`);
        currentLayout = config;
        return config;
      }
    }
  }
  
  // Default to OddsJam layout
  console.log(`No specific layout detected, using default OddsJam layout`);
  currentLayout = LAYOUT_CONFIGS.oddsjam_aggrid;
  return currentLayout;
}

// Detect sport and market configuration
function detectSportConfig(url, marketHints = {}) {
  let sport = 'MLB'; // Default
  let market = 'moneyline'; // Default
  
  // Detect sport from URL
  if (url.includes('/mlb/') || url.includes('baseball')) {
    sport = 'MLB';
  } else if (url.includes('/nfl/') || url.includes('football')) {
    sport = 'NFL';
  } else if (url.includes('/nba/') || url.includes('basketball')) {
    sport = 'NBA';
  } else if (url.includes('/soccer/') || url.includes('/football/')) {
    sport = 'SOCCER';
  }
  
  // Detect market type from URL
  if (url.includes('moneyline')) {
    market = 'moneyline';
  } else if (url.includes('spread') || url.includes('runline')) {
    market = sport === 'MLB' ? 'runline' : 'spread';
  } else if (url.includes('total') || url.includes('over-under')) {
    market = 'total';
  }
  
  const sportConfig = SPORT_CONFIGS[sport];
  if (sportConfig && sportConfig.markets[market]) {
    currentSportConfig = { 
      sport, 
      market, 
      config: sportConfig,
      marketConfig: sportConfig.markets[market]
    };
    console.log(`Detected sport: ${sport}, market: ${market}, outcomes: ${sportConfig.markets[market].outcomes}`);
    return currentSportConfig;
  }
  
  // Default fallback
  currentSportConfig = {
    sport: 'MLB',
    market: 'moneyline',
    config: SPORT_CONFIGS.MLB,
    marketConfig: SPORT_CONFIGS.MLB.markets.moneyline
  };
  return currentSportConfig;
}

// Get current selectors based on detected layout
function getSelectors() {
  if (!currentLayout) {
    detectLayout();
  }
  return currentLayout.selectors;
}

// Generate hash of data for change detection
function generateDataHash(data) {
  return JSON.stringify(data);
}

// Extract sport and league from URL using configuration
function extractSportLeague(url) {
  // Use the sport detection system
  const sportConfig = detectSportConfig(url);
  
  return { 
    sport: sportConfig.sport, 
    league: sportConfig.sport, // For most cases, league = sport
    betType: sportConfig.marketConfig.name,
    marketType: sportConfig.market,
    outcomes: sportConfig.marketConfig.outcomes,
    terminology: sportConfig.config.terminology
  };
}

// Parse odds text and return both original and converted formats
function parseOdds(oddsText) {
  if (!oddsText) return null;
  const cleaned = oddsText.trim();
  
  // Check for American odds format (+150, -110)
  const americanMatch = cleaned.match(/^([+-]?\d+)$/);
  if (americanMatch) {
    const american = parseInt(americanMatch[1]);
    // Convert American odds to percentage
    let percentage;
    if (american > 0) {
      // Underdog: percentage = 100 / (american + 100) * 100
      percentage = 100 / (american + 100) * 100;
    } else {
      // Favorite: percentage = (-american) / (-american + 100) * 100
      percentage = (-american) / (-american + 100) * 100;
    }
    return {
      american: american,
      percentage: Math.round(percentage * 100) / 100, // Round to 2 decimal places
      format: 'american'
    };
  }
  
  // Check for percentage format (65.5%)
  const percentMatch = cleaned.match(/^(\d+\.?\d*)%$/);
  if (percentMatch) {
    const percentage = parseFloat(percentMatch[1]);
    // Convert implied probability to American odds
    let american;
    if (percentage >= 50) {
      // Favorite: -(probability / (100 - probability) * 100)
      american = Math.round(-(percentage / (100 - percentage) * 100));
    } else {
      // Underdog: +((100 - probability) / probability * 100)
      american = Math.round(((100 - percentage) / percentage) * 100);
    }
    return {
      american: american,
      percentage: percentage,
      format: 'percentage'
    };
  }
  
  // Check for decimal format (1.65, 2.50)
  const decimalMatch = cleaned.match(/^(\d+\.?\d*)$/);
  if (decimalMatch) {
    const decimal = parseFloat(decimalMatch[1]);
    if (decimal >= 1.01) { // Valid decimal odds are > 1
      // Convert decimal to percentage
      const percentage = (1 / decimal) * 100;
      // Convert decimal to American
      let american;
      if (decimal >= 2.0) {
        american = Math.round((decimal - 1) * 100);
      } else {
        american = Math.round(-100 / (decimal - 1));
      }
      return {
        american: american,
        percentage: Math.round(percentage * 100) / 100,
        format: 'decimal'
      };
    }
  }
  
  return null;
}

// Parse start time and determine game status
function parseStartTime(startTimeText, createdAt) {
  if (!startTimeText) return { 
    originalTime: null, 
    parsedTime: null, 
    gameStatus: 'unknown', 
    inningInfo: null 
  };
  
  const cleaned = startTimeText.trim();
  
  // Check for live game indicators (inning info like "7 Top", "3 Bottom")
  const inningMatch = cleaned.match(/^(\d+)\s+(Top|Bottom)$/i);
  if (inningMatch) {
    return {
      originalTime: cleaned,
      parsedTime: createdAt, // Use created date for live games
      gameStatus: 'live',
      inningInfo: cleaned
    };
  }
  
  // Check for final game indicators
  if (cleaned.toLowerCase().includes('final')) {
    return {
      originalTime: cleaned,
      parsedTime: createdAt,
      gameStatus: 'final',
      inningInfo: null
    };
  }
  
  // Try to parse scheduled time (e.g., "8/19 • 4:40PM")
  const dateTimeMatch = cleaned.match(/^(\d+\/\d+)\s*•\s*(\d+:\d+\s*[AP]M)$/i);
  if (dateTimeMatch) {
    try {
      const currentYear = new Date().getFullYear();
      const dateStr = `${dateTimeMatch[1]}/${currentYear} ${dateTimeMatch[2]}`;
      const parsedDate = new Date(dateStr);
      
      if (!isNaN(parsedDate.getTime())) {
        return {
          originalTime: cleaned,
          parsedTime: parsedDate.toISOString(),
          gameStatus: 'scheduled',
          inningInfo: null
        };
      }
    } catch (e) {
      console.log('Error parsing date:', e);
    }
  }
  
  // Default case - use original text and created time
  return {
    originalTime: cleaned,
    parsedTime: createdAt,
    gameStatus: 'scheduled',
    inningInfo: null
  };
}

// Extract team data from a row
function extractTeamData(row) {
  const SELECTORS = getSelectors();
  const teamCell = row.querySelector(SELECTORS.columns.teamName);
  const rotationCell = row.querySelector(SELECTORS.columns.rotationNumber);
  
  const teams = [];
  
  if (teamCell) {
    console.log(`extractTeamData: teamCell found, innerHTML preview:`, teamCell.innerHTML.substring(0, 300));
    
    // Each team cell contains multiple divs, each with a team name
    const teamDivs = teamCell.querySelectorAll('div.box-border');
    console.log(`extractTeamData: found ${teamDivs.length} div.box-border elements`);
    
    if (teamDivs.length === 0) {
      // Try alternative selectors if box-border doesn't work
      const altDivs = teamCell.querySelectorAll('div') || [];
      console.log(`extractTeamData: trying alternative - found ${altDivs.length} div elements total`);
      
      // Filter divs that contain paragraph elements (likely team containers)
      const teamContainerDivs = Array.from(altDivs).filter(div => {
        const p = div.querySelector('p');
        return p && p.textContent && p.textContent.trim().length > 0;
      });
      console.log(`extractTeamData: found ${teamContainerDivs.length} divs with paragraph content`);
      
      teamContainerDivs.forEach((teamDiv, index) => {
        console.log(`extractTeamData: processing alt div ${index}, innerHTML:`, teamDiv.innerHTML.substring(0, 200));
        
        const teamNameElement = teamDiv.querySelector(SELECTORS.elements.teamText) || 
                               teamDiv.querySelector('p.truncate') || 
                               teamDiv.querySelector('p[class*="truncate"]') ||
                               teamDiv.querySelector('p');
        
        const teamText = teamNameElement?.textContent?.trim();
        console.log(`extractTeamData: alt div ${index} team text: "${teamText}"`);
        
        if (teamText && teamText.length > 0) {
          // Get corresponding rotation number
          let rotation = null;
          if (rotationCell) {
            const rotationDivs = rotationCell.querySelectorAll('div.box-border') || rotationCell.querySelectorAll('div');
            const rotationElement = rotationDivs[index]?.querySelector(SELECTORS.elements.rotationText) ||
                                   rotationDivs[index]?.querySelector('p');
            rotation = rotationElement?.textContent?.trim() || null;
          }
          
          teams.push({
            name: teamText,
            rotation: rotation
          });
        }
      });
    } else {
      teamDivs.forEach((teamDiv, index) => {
        console.log(`extractTeamData: processing box-border div ${index}, innerHTML:`, teamDiv.innerHTML.substring(0, 200));
        
        // Use the precise selector from config, with fallbacks
        const teamNameElement = teamDiv.querySelector(SELECTORS.elements.teamText) || 
                               teamDiv.querySelector('p.truncate') || 
                               teamDiv.querySelector('p[class*="truncate"]') ||
                               teamDiv.querySelector('p');
        
        const teamText = teamNameElement?.textContent?.trim();
        console.log(`extractTeamData: box-border div ${index} team text: "${teamText}"`);
        
        if (teamText && teamText.length > 0) {
          // Get corresponding rotation number using precise selector
          let rotation = null;
          if (rotationCell) {
            const rotationDivs = rotationCell.querySelectorAll('div.box-border');
            const rotationElement = rotationDivs[index]?.querySelector(SELECTORS.elements.rotationText) ||
                                   rotationDivs[index]?.querySelector('p');
            rotation = rotationElement?.textContent?.trim() || null;
          }
          
          teams.push({
            name: teamText,
            rotation: rotation
          });
        }
      });
    }
  } else {
    console.log(`extractTeamData: no teamCell found with selector: ${SELECTORS.columns.teamName}`);
  }
  
  console.log(`extractTeamData: returning ${teams.length} teams:`, teams.map(t => t.name));
  return teams;
}

// Extract odds for all sportsbooks from a row
function extractOddsData(row) {
  const SELECTORS = getSelectors();
  const oddsData = {};
  const rowIndex = row.getAttribute('row-index');
  
  console.log(`extractOddsData: extracting odds for row ${rowIndex}`);
  
  // Check if this layout supports multi-container structure
  const grid = document.querySelector(SELECTORS.grid.root);
  
  if (!currentLayout.features.multiContainer) {
    // Simple single-container extraction
    return extractOddsSimple(row, SELECTORS);
  }
  if (!grid) {
    console.log(`extractOddsData: no grid found`);
    return oddsData;
  }
  
  // Find all row containers in the grid
  const leftContainer = grid.querySelector('.ag-pinned-left-cols-container');
  const rightContainer = grid.querySelector('.ag-pinned-right-cols-container');
  
  // Try multiple ways to find the center container where sportsbook columns are located
  let centerContainer = grid.querySelector('.ag-center-cols-container');
  if (!centerContainer) {
    centerContainer = grid.querySelector('.ag-body-viewport .ag-center-cols-container');
  }
  if (!centerContainer) {
    // Look for any rowgroup that's not left or right pinned
    centerContainer = grid.querySelector('[role="rowgroup"]:not(.ag-pinned-left-cols-container):not(.ag-pinned-right-cols-container)');
  }
  if (!centerContainer) {
    // Try to find the body viewport itself if it contains rows
    const bodyViewport = grid.querySelector('.ag-body-viewport');
    if (bodyViewport && bodyViewport.querySelector('[role="row"]')) {
      centerContainer = bodyViewport;
    }
  }
  if (!centerContainer) {
    // Last resort: look for any container with sportsbook columns
    const allContainers = grid.querySelectorAll('[role="rowgroup"], .ag-body-viewport');
    for (const container of allContainers) {
      if (container.querySelector('[col-id="BetMGM"], [col-id="22bet"], [col-id="4Cx"]')) {
        centerContainer = container;
        break;
      }
    }
  }
  
  console.log(`extractOddsData: found containers - left: ${!!leftContainer}, center: ${!!centerContainer}, right: ${!!rightContainer}`);
  
  // Debug: If no center container found, try to find ALL possible containers
  if (!centerContainer) {
    console.log(`extractOddsData: DEBUG - No center container found, searching for all containers in grid`);
    const allRowGroups = grid.querySelectorAll('[role="rowgroup"]');
    const allViewports = grid.querySelectorAll('.ag-body-viewport, .ag-center-cols-viewport, .ag-center-cols-container');
    const allContainersWithRows = Array.from(grid.querySelectorAll('*')).filter(el => el.querySelector('[role="row"]'));
    
    console.log(`extractOddsData: DEBUG - Found ${allRowGroups.length} rowgroups, ${allViewports.length} viewports, ${allContainersWithRows.length} containers with rows`);
    
    // Try to find container with the most columns for this specific row
    let bestContainer = null;
    let maxCells = 0;
    
    [...allRowGroups, ...allViewports, ...allContainersWithRows].forEach((container, i) => {
      const testRow = container.querySelector(`[row-index="${rowIndex}"]`) || container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
      if (testRow) {
        const cellCount = testRow.querySelectorAll('[col-id]').length;
        console.log(`extractOddsData: DEBUG container ${i} has ${cellCount} cells for row ${rowIndex}`);
        if (cellCount > maxCells) {
          maxCells = cellCount;
          bestContainer = container;
        }
      }
    });
    
    if (bestContainer && maxCells > 3) {
      console.log(`extractOddsData: DEBUG - Using best container with ${maxCells} cells`);
      centerContainer = bestContainer;
    }
  }
  
  // Get all possible row containers to search for sportsbook columns
  const containers = [leftContainer, centerContainer, rightContainer].filter(Boolean);
  
  let totalCells = 0;
  let sportsbookCount = 0;
  
  containers.forEach((container, containerIndex) => {
    if (!container) return;
    
    // Find the corresponding row in this container
    const correspondingRow = container.querySelector(`[row-index="${rowIndex}"]`) ||
                            container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
    
    if (!correspondingRow) {
      console.log(`extractOddsData: no corresponding row found in container ${containerIndex} for row ${rowIndex}`);
      return;
    }
    
    // Get all cells with col-id in this row
    const cells = correspondingRow.querySelectorAll('[col-id]');
    totalCells += cells.length;
    console.log(`extractOddsData: found ${cells.length} cells in container ${containerIndex}`);
    
    cells.forEach(cell => {
      const colId = cell.getAttribute('col-id');
      
      // Skip non-sportsbook columns
      if (['startTime', 'rotationNumber', 'teamName', 'bestPrice', 'averagePrice'].includes(colId)) {
        console.log(`extractOddsData: skipping non-sportsbook column: ${colId}`);
        return;
      }
      
      sportsbookCount++;
      console.log(`extractOddsData: processing sportsbook column: ${colId} in container ${containerIndex}`);
      console.log(`extractOddsData: ${colId} cell innerHTML preview:`, cell.innerHTML.substring(0, 200));
      
      // Extract odds text from cell using precise selector
      const oddsElements = cell.querySelectorAll(SELECTORS.elements.oddsText);
      console.log(`extractOddsData: ${colId} found ${oddsElements.length} odds elements with precise selector`);
      
      if (oddsElements.length === 0) {
        // Try fallback selectors
        const fallbackElements1 = cell.querySelectorAll('p.font-semibold');
        const fallbackElements2 = cell.querySelectorAll('p[class*="font-semibold"]');
        const fallbackElements3 = cell.querySelectorAll('p');
        
        console.log(`extractOddsData: ${colId} fallback selectors found:`, {
          'p.font-semibold': fallbackElements1.length,
          'p[class*="font-semibold"]': fallbackElements2.length,
          'p': fallbackElements3.length
        });
        
        if (fallbackElements1.length > 0) {
          console.log(`extractOddsData: ${colId} using p.font-semibold fallback`);
          fallbackElements1.forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback1 element ${i}: "${elem.textContent?.trim()}"`);
          });
        } else if (fallbackElements2.length > 0) {
          console.log(`extractOddsData: ${colId} using p[class*="font-semibold"] fallback`);
          fallbackElements2.forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback2 element ${i}: "${elem.textContent?.trim()}"`);
          });
        } else if (fallbackElements3.length > 0) {
          console.log(`extractOddsData: ${colId} using p fallback (first 3)`);
          Array.from(fallbackElements3).slice(0, 3).forEach((elem, i) => {
            console.log(`extractOddsData: ${colId} fallback3 element ${i}: "${elem.textContent?.trim()}"`);
          });
        }
      }
      
      const finalOddsElements = oddsElements.length > 0 ? oddsElements :
                               (cell.querySelectorAll('p.font-semibold').length > 0 ? cell.querySelectorAll('p.font-semibold') :
                               (cell.querySelectorAll('p[class*="font-semibold"]').length > 0 ? cell.querySelectorAll('p[class*="font-semibold"]') :
                               cell.querySelectorAll('p')));
      
      if (finalOddsElements.length > 0) {
        const odds = [];
        finalOddsElements.forEach(elem => {
          const oddsText = elem.textContent?.trim();
          console.log(`extractOddsData: ${colId} processing odds text: "${oddsText}"`);
          const oddsValue = parseOdds(oddsText);
          console.log(`extractOddsData: ${colId} parsed odds:`, oddsValue);
          if (oddsValue !== null) {
            odds.push(oddsValue);
          }
        });
        
        if (odds.length > 0) {
          console.log(`extractOddsData: ${colId} final odds array:`, odds);
          oddsData[colId] = {
            home: odds[0] || null,
            away: odds[1] || null,
            format: odds[0]?.format || 'unknown'
          };
        }
      } else {
        console.log(`extractOddsData: ${colId} no odds elements found at all`);
      }
    });
  });
  
  console.log(`extractOddsData: processed ${totalCells} total cells, ${sportsbookCount} sportsbook columns, found odds for ${Object.keys(oddsData).length} sportsbooks`);
  
  // Enhanced debugging - always show sportsbook names found
  if (Object.keys(oddsData).length > 0) {
    console.log(`extractOddsData: Found odds for sportsbooks: ${Object.keys(oddsData).join(', ')}`);
  }
  
  // Debug: Log all found col-ids to understand what columns exist
  if (totalCells > 0 && Object.keys(oddsData).length < 10) { // Show debug if we found fewer than 10 sportsbooks
    console.log(`extractOddsData: DEBUG - Found fewer than expected sportsbooks (${Object.keys(oddsData).length}). All col-ids found:`);
    containers.forEach((container, containerIndex) => {
      if (!container) return;
      const correspondingRow = container.querySelector(`[row-index="${rowIndex}"]`) || container.querySelector(`[row-id="${row.getAttribute('row-id')}"]`);
      if (correspondingRow) {
        const cells = correspondingRow.querySelectorAll('[col-id]');
        console.log(`extractOddsData: Container ${containerIndex} has ${cells.length} cells:`);
        cells.forEach(cell => {
          const colId = cell.getAttribute('col-id');
          const isSkipped = ['startTime', 'rotationNumber', 'teamName', 'bestPrice', 'averagePrice'].includes(colId);
          console.log(`  col-id: "${colId}" ${isSkipped ? '(SKIPPED)' : '(PROCESSED)'}`);
        });
      }
    });
  }
  return oddsData;
}

// Simple odds extraction for single-container layouts
function extractOddsSimple(row, SELECTORS) {
  const oddsData = {};
  
  // Find all cells with odds data
  const cells = row.querySelectorAll(SELECTORS.grid.cell);
  console.log(`extractOddsSimple: found ${cells.length} cells`);
  
  cells.forEach(cell => {
    // Look for sportsbook indicators in the cell
    const sportsbookName = cell.getAttribute('data-sportsbook') || 
                          cell.getAttribute('data-col') ||
                          cell.className.match(/sportsbook-(\w+)/)?.[1];
    
    if (sportsbookName && !['time', 'teams', 'best', 'average'].includes(sportsbookName)) {
      const oddsElements = cell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          cell.querySelectorAll('span, div, p');
      
      if (oddsElements.length >= 2) {
        const homeOdds = parseOdds(oddsElements[0].textContent);
        const awayOdds = parseOdds(oddsElements[1].textContent);
        
        if (homeOdds !== null || awayOdds !== null) {
          oddsData[sportsbookName] = {
            home: homeOdds,
            away: awayOdds
          };
        }
      }
    }
  });
  
  return oddsData;
}

// Extract best and average odds from a row
function extractBestAvgOdds(row) {
  const SELECTORS = getSelectors();
  const result = {
    bestHome: null,
    bestAway: null,
    avgHome: null,
    avgAway: null
  };
  
  // Only extract if layout supports these features
  if (!currentLayout.features.bestOdds && !currentLayout.features.averageOdds) {
    return result;
  }
  
  // Extract best odds
  if (currentLayout.features.bestOdds && SELECTORS.columns.bestPrice) {
    const bestPriceCell = row.querySelector(SELECTORS.columns.bestPrice);
    if (bestPriceCell) {
      const oddsElements = bestPriceCell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          bestPriceCell.querySelectorAll('p.font-semibold') ||
                          bestPriceCell.querySelectorAll('p');
      
      if (oddsElements.length >= 2) {
        result.bestHome = parseOdds(oddsElements[0].textContent);
        result.bestAway = parseOdds(oddsElements[1].textContent);
      }
    }
  }
  
  // Extract average odds
  if (currentLayout.features.averageOdds && SELECTORS.columns.averagePrice) {
    const avgPriceCell = row.querySelector(SELECTORS.columns.averagePrice);
    if (avgPriceCell) {
      const oddsElements = avgPriceCell.querySelectorAll(SELECTORS.elements.oddsText) ||
                          avgPriceCell.querySelectorAll('p.font-semibold') ||
                          avgPriceCell.querySelectorAll('p');
      
      if (oddsElements.length >= 2) {
        result.avgHome = parseOdds(oddsElements[0].textContent);
        result.avgAway = parseOdds(oddsElements[1].textContent);
      }
    }
  }
  
  console.log(`extractBestAvgOdds: best(${result.bestHome}/${result.bestAway}) avg(${result.avgHome}/${result.avgAway})`);
  return result;
}

// Main scraping function
function scrapeData() {
  // Initialize layout and sport detection
  detectLayout();
  const SELECTORS = getSelectors();
  
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) {
    console.log('Grid not found, trying alternative selectors...');
    
    // Try alternative selectors based on layout
    const altSelectors = ['table', '.table', '[role="table"]', '.ag-root-wrapper', '.ag-theme-alpine', '[class*="ag-"]'];
    let altGrid = null;
    
    for (const selector of altSelectors) {
      altGrid = document.querySelector(selector);
      if (altGrid) {
        console.log('Found alternative grid with selector:', selector);
        break;
      }
    }
    
    if (!altGrid) {
      console.log('No grid found at all');
      return null;
    }
  }
  
  const rows = grid ? grid.querySelectorAll(SELECTORS.grid.rows) : 
               document.querySelectorAll('[role="row"], tr');
  
  console.log('Found', rows.length, 'rows total');
  
  const games = [];
  const { sport, league, betType, marketType, outcomes, terminology } = extractSportLeague(window.location.href);
  const timestamp = new Date().toISOString();
  
  console.log(`Scraping ${sport} ${betType} with ${outcomes} outcomes using layout: ${currentLayout.name}`);
  
  rows.forEach((row, index) => {
    const rowId = row.getAttribute('row-id');
    const rowIndex = row.getAttribute('row-index');
    console.log(`Row ${index}: rowId=${rowId}, rowIndex=${rowIndex}, classes=${row.className}`);
    
    // Skip header rows, group rows, or rows without proper IDs
    if (!rowId || rowId === 'header' || row.getAttribute('role') !== 'row') {
      console.log(`Skipping row ${index}: no rowId or header or not a data row`);
      return;
    }
    
    // Skip rows that look like separators or group headers
    if (row.classList.contains('ag-row-group') || row.classList.contains('ag-group-row')) {
      console.log(`Skipping row ${index}: group row`);
      return;
    }
    
    // Skip duplicate rows (common issue with virtual scrolling in AG Grid)
    // Look for unique game IDs to avoid processing the same game multiple times
    const existingGame = games.find(game => game.rowId === rowId);
    if (existingGame) {
      console.log(`Skipping row ${index}: duplicate rowId ${rowId}`);
      return;
    }
    
    // Extract start time
    const startTimeCell = row.querySelector(SELECTORS.columns.startTime);
    let startTimeText = null;
    if (startTimeCell) {
      // Try multiple selectors for start time
      const timeElement = startTimeCell.querySelector('span') ||
                         startTimeCell.querySelector('.text-xs') ||
                         startTimeCell.querySelector('div a span') ||
                         startTimeCell.querySelector('span[class*="__className"]');
      startTimeText = timeElement?.textContent?.trim();
      
      if (!startTimeText) {
        console.log(`Row ${index}: no start time found, startTimeCell innerHTML:`, startTimeCell.innerHTML.substring(0, 200));
      }
    } else {
      console.log(`Row ${index}: no startTimeCell found with selector: ${SELECTORS.columns.startTime}`);
    }
    // Parse start time
    const timeInfo = parseStartTime(startTimeText, timestamp);
    console.log(`Row ${index}: startTime=${startTimeText}, status=${timeInfo.gameStatus}, inning=${timeInfo.inningInfo}`);
    
    // Extract teams
    const teams = extractTeamData(row);
    console.log(`Row ${index}: found ${teams.length} teams:`, teams.map(t => t.name));
    if (teams.length < 2) {
      console.log(`Row ${index}: insufficient teams (${teams.length}), skipping. Teams found:`, teams);
      
      // Debug: Check what's in the team cell
      const teamCell = row.querySelector(SELECTORS.columns.teamName);
      if (teamCell) {
        console.log(`Row ${index}: teamCell innerHTML:`, teamCell.innerHTML.substring(0, 200));
        const teamDivs = teamCell.querySelectorAll('div.box-border');
        console.log(`Row ${index}: found ${teamDivs.length} team divs`);
      } else {
        console.log(`Row ${index}: no team cell found`);
      }
      return;
    }
    
    // Extract odds
    const odds = extractOddsData(row);
    console.log(`Row ${index}: odds for ${Object.keys(odds).length} sportsbooks`);
    
    // Extract best and average odds
    const bestAvgOdds = extractBestAvgOdds(row);
    
    // Extract game link if available
    const gameLink = row.querySelector(SELECTORS.elements.gameLink);
    const gameUrl = gameLink ? gameLink.getAttribute('href') : null;
    
    games.push({
      rowId: rowId,
      sport: sport,
      league: league,
      betType: betType,
      marketType: marketType,
      outcomes: outcomes,
      terminology: terminology,
      homeTeam: teams[0].name,
      awayTeam: teams[1].name,
      homeRotation: teams[0].rotation,
      awayRotation: teams[1].rotation,
      startTime: timeInfo.originalTime || 'TBD',
      startTimeParsed: timeInfo.parsedTime,
      gameStatus: timeInfo.gameStatus,
      inningInfo: timeInfo.inningInfo,
      bestHomeOdds: bestAvgOdds.bestHome,
      bestAwayOdds: bestAvgOdds.bestAway,
      avgHomeOdds: bestAvgOdds.avgHome,
      avgAwayOdds: bestAvgOdds.avgAway,
      gameUrl: gameUrl,
      odds: odds,
      timestamp: timestamp
    });
  });
  
  return {
    url: window.location.href,
    sport: sport,
    league: league,
    games: games,
    scrapedAt: new Date().toISOString()
  };
}

// Send data to background script
function sendData(data) {
  // Check if extension has been invalidated
  if (extensionInvalidated || !isExtensionContextValid()) {
    console.log('Extension context invalid - not sending data');
    cleanup();
    return;
  }
  
  console.log('sendData called with', data.games.length, 'games');
  console.log('Total odds found across all games:', 
    data.games.reduce((sum, game) => sum + Object.keys(game.odds).length, 0));
  
  try {
    chrome.runtime.sendMessage({
      type: 'SCRAPED_DATA',
      data: data
    }, response => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message.includes('Extension context invalidated')) {
          console.log('Extension was reloaded - stopping scraper to avoid errors');
          cleanup();
          return;
        }
        console.error('Error sending data:', chrome.runtime.lastError);
      } else if (response && response.success) {
        console.log('Data sent successfully to background script');
      } else {
        console.log('Background script response:', response);
      }
    });
  } catch (error) {
    if (error.message.includes('Extension context invalidated')) {
      console.log('Extension was reloaded - stopping scraper gracefully');
      cleanup();
      return;
    }
    console.error('Error in sendData:', error);
  }
}

// Check for changes and send updates
function checkAndSendUpdates() {
  // Check if extension context is still valid
  if (extensionInvalidated || !isExtensionContextValid()) {
    console.log('Extension context invalidated - stopping scraper');
    cleanup();
    return;
  }
  
  console.log('checkAndSendUpdates called');
  const data = scrapeData();
  if (!data || data.games.length === 0) {
    console.log('No data scraped or no games found');
    return;
  }
  
  console.log('Scraped data:', data.games.length, 'games');
  
  // Log details about first game to see what odds we have
  if (data.games.length > 0) {
    const firstGame = data.games[0];
    console.log('First game details:', {
      teams: `${firstGame.homeTeam} vs ${firstGame.awayTeam}`,
      sport: firstGame.sport,
      betType: firstGame.betType,
      oddsCount: Object.keys(firstGame.odds).length,
      odds: firstGame.odds,
      bestOdds: `${firstGame.bestHomeOdds}/${firstGame.bestAwayOdds}`,
      avgOdds: `${firstGame.avgHomeOdds}/${firstGame.avgAwayOdds}`
    });
  }
  
  const currentHash = generateDataHash(data);
  
  if (currentHash !== lastDataHash) {
    console.log('Data changed, sending update with', data.games.length, 'games');
    lastDataHash = currentHash;
    sendData(data);
  } else {
    console.log('Data unchanged');
  }
}

// Set up mutation observer for dynamic content
function setupObserver() {
  if (observer) observer.disconnect();
  
  const SELECTORS = getSelectors();
  const grid = document.querySelector(SELECTORS.grid.root);
  if (!grid) {
    // Try again in a second
    setTimeout(setupObserver, 1000);
    return;
  }
  
  observer = new MutationObserver((mutations) => {
    // Debounce updates
    clearTimeout(observer.debounceTimer);
    observer.debounceTimer = setTimeout(() => {
      checkAndSendUpdates();
    }, 500);
  });
  
  observer.observe(grid, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['col-id', 'row-id']
  });
  
  console.log('Observer set up successfully');
}

// Initialize scraping
function initialize() {
  console.log('Initializing sportsbook scraper');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);
  
  // Set up observer
  setupObserver();
  
  // Initial scrape
  setTimeout(() => {
    console.log('Running initial scrape...');
    checkAndSendUpdates();
  }, 2000);
  
  // Set up periodic checks
  if (scrapeInterval) clearInterval(scrapeInterval);
  scrapeInterval = setInterval(checkAndSendUpdates, 5000);
}

// Cleanup function for extension invalidation
function cleanup() {
  console.log('Cleaning up scraper resources');
  extensionInvalidated = true;
  
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
  }
}

// Clean up on page unload
window.addEventListener('beforeunload', cleanup);

// Check if we're on a sportsbook page
function initializeIfApplicable() {
  // Check if extension context is valid before initializing
  if (!isExtensionContextValid()) {
    console.log('Extension context invalid - not initializing scraper');
    return;
  }
  
  // Detect layout first
  const layout = detectLayout();
  const SELECTORS = getSelectors();
  
  if (window.location.href.includes('odds') || document.querySelector(SELECTORS.grid.root)) {
    console.log(`Initializing scraper with layout: ${layout.name}`);
    initialize();
  } else {
    console.log('Not a sportsbook page, scraper not initialized');
  }
}

// Message listener for popup controls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (extensionInvalidated) {
    sendResponse({ success: false, error: 'Extension invalidated' });
    return;
  }
  
  try {
    if (request.type === 'START_SCRAPING') {
      console.log('Starting scraping via popup control');
      if (!scrapeInterval) {
        initialize();
      }
      sendResponse({ success: true });
    } else if (request.type === 'STOP_SCRAPING') {
      console.log('Stopping scraping via popup control');
      cleanup();
      sendResponse({ success: true });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeIfApplicable);
} else {
  initializeIfApplicable();
}

})(); // End of IIFE