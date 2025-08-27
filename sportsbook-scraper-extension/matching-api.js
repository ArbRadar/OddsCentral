// Matching API for getting Omenizer event data and matching status

class MatchingAPI {
  constructor() {
    this.baseUrl = 'http://localhost:5555'; // Matching API server
  }

  async getMatchingStatus(gameIds) {
    try {
      const response = await fetch(`${this.baseUrl}/api/matching-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ game_ids: gameIds })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.matching_data || {};
      
    } catch (error) {
      console.error('Error getting matching status:', error);
      
      // Return fallback data for all games
      const fallbackData = {};
      gameIds.forEach(gameId => {
        fallbackData[gameId] = {
          status: 'api_error',
          omenizer_event_id: null,
          translated_teams: null,
          message: 'API unavailable',
          error: error.message
        };
      });
      
      return fallbackData;
    }
  }

  async checkGameMatching(gameId) {
    // First check if it's in our flagged_events table
    const flaggedStatus = await this.queryFlaggedEvents(gameId);
    if (flaggedStatus) {
      return flaggedStatus;
    }

    // If not flagged, try to find it in Omenizer
    const omenizerStatus = await this.checkOmenizerEvents(gameId);
    if (omenizerStatus) {
      return omenizerStatus;
    }

    // Default status if not found anywhere
    return {
      status: 'not_processed',
      omenizer_event_id: null,
      translated_teams: null,
      message: 'Not yet processed by matching engine'
    };
  }

  async queryFlaggedEvents(gameId) {
    try {
      // This would be replaced with actual database query in production
      // For now, we'll use a mock implementation
      
      // Mock data structure - in real implementation, this would query the database
      const mockFlaggedEvents = {
        'some-game-id-1': {
          status: 'ready_for_creation',
          omenizer_event_id: null,
          translated_teams: 'Chicago Cubs vs Los Angeles Angels',
          message: 'Ready to create in Omenizer'
        },
        'some-game-id-2': {
          status: 'pending',
          omenizer_event_id: null,
          translated_teams: 'Oakland Athletics vs Detroit Tigers',
          message: 'Missing team translation'
        }
      };

      return mockFlaggedEvents[gameId] || null;
    } catch (error) {
      console.error('Error querying flagged events:', error);
      return null;
    }
  }

  async checkOmenizerEvents(gameId) {
    try {
      // This would check if the event already exists in Omenizer
      // For now, mock implementation
      const response = await fetch('/api/check-omenizer-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ game_id: gameId })
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return {
        status: 'exists_in_omenizer',
        omenizer_event_id: data.event_id,
        translated_teams: data.teams,
        message: 'Already exists in Omenizer'
      };
    } catch (error) {
      // Omenizer API not available, that's okay
      return null;
    }
  }

  getStatusDisplay(status) {
    const statusConfigs = {
      'ready_for_creation': {
        badge: '✅ Ready',
        color: '#10b981',
        description: 'Ready to create in Omenizer',
        className: 'ready'
      },
      'pending': {
        badge: '⚠️ Pending',
        color: '#f59e0b',
        description: 'Requires manual review',
        className: 'pending'
      },
      'exists_in_omenizer': {
        badge: '🔗 Exists',
        color: '#6366f1',
        description: 'Already in Omenizer',
        className: 'exists'
      },
      'not_processed': {
        badge: '⏳ New',
        color: '#6b7280',
        description: 'Not yet processed',
        className: 'new'
      },
      'api_error': {
        badge: '❌ Error',
        color: '#dc2626',
        description: 'API unavailable',
        className: 'error'
      },
      'unknown': {
        badge: '❓ Unknown',
        color: '#dc2626',
        description: 'Status unknown',
        className: 'error'
      }
    };

    return statusConfigs[status] || statusConfigs['unknown'];
  }
}

// Initialize the matching API
const matchingAPI = new MatchingAPI();