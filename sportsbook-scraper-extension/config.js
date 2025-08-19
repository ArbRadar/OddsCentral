export const SUPABASE_CONFIG = {
  url: 'http://localhost:54320',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
};

export const SCRAPER_CONFIG = {
  updateInterval: 5000, // Check for updates every 5 seconds
  retryAttempts: 3,
  retryDelay: 1000
};

// Sport-specific configuration
export const SPORT_CONFIGS = {
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

// Sportsbook layout configurations
export const LAYOUT_CONFIGS = {
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

// Default selector configuration (backwards compatibility)
export const SELECTORS = LAYOUT_CONFIGS.oddsjam_aggrid.selectors;