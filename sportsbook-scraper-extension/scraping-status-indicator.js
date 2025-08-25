// Visual status indicator to show current scraping method and status
class ScrapingStatusIndicator {
  constructor() {
    this.indicator = null;
    this.method = 'Visual DOM';
    this.status = 'Stopped';
    this.apiEndpoints = 0;
    this.lastUpdate = null;
  }
  
  // Create and show the indicator
  show() {
    if (this.indicator) return; // Already showing
    
    this.indicator = document.createElement('div');
    this.indicator.id = 'scraping-status-indicator';
    this.indicator.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      color: white;
      padding: 12px 16px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 999999;
      min-width: 200px;
      transition: all 0.3s ease;
      cursor: pointer;
    `;
    
    document.body.appendChild(this.indicator);
    this.update();
    
    // Add click handler to toggle details
    let showingDetails = false;
    this.indicator.addEventListener('click', () => {
      showingDetails = !showingDetails;
      this.update(showingDetails);
    });
  }
  
  // Update indicator content
  update(showDetails = false) {
    if (!this.indicator) return;
    
    const statusColor = this.getStatusColor();
    const methodIcon = this.getMethodIcon();
    
    this.indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor}; animation: pulse 2s infinite;"></div>
        <span style="font-weight: 600;">${methodIcon} ${this.method}</span>
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
        ${this.status}
      </div>
      ${showDetails ? `
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px; color: #cbd5e1;">
          <div>API Endpoints: ${this.apiEndpoints}</div>
          ${this.lastUpdate ? `<div>Last Update: ${this.formatTime(this.lastUpdate)}</div>` : ''}
        </div>
      ` : ''}
    `;
    
    // Add pulse animation
    if (!document.getElementById('scraping-status-styles')) {
      const styles = document.createElement('style');
      styles.id = 'scraping-status-styles';
      styles.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        #scraping-status-indicator:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
        }
      `;
      document.head.appendChild(styles);
    }
  }
  
  // Set scraping method
  setMethod(method) {
    this.method = method;
    this.update();
  }
  
  // Set scraping status
  setStatus(status) {
    this.status = status;
    this.lastUpdate = new Date();
    this.update();
  }
  
  // Set API endpoints count
  setApiEndpoints(count) {
    this.apiEndpoints = count;
    this.update();
  }
  
  // Get status color
  getStatusColor() {
    if (this.status.includes('Running') || this.status.includes('Polling')) {
      return '#22c55e'; // Green
    } else if (this.status.includes('Starting') || this.status.includes('Loading')) {
      return '#f59e0b'; // Yellow
    } else if (this.status.includes('Error') || this.status.includes('Failed')) {
      return '#ef4444'; // Red
    } else {
      return '#64748b'; // Gray
    }
  }
  
  // Get method icon
  getMethodIcon() {
    switch (this.method) {
      case 'API': return '🚀';
      case 'Hybrid': return '🔄';
      case 'Visual DOM': return '👁️';
      default: return '📊';
    }
  }
  
  // Format time for display
  formatTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return date.toLocaleTimeString();
  }
  
  // Hide indicator
  hide() {
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
  }
  
  // Flash notification
  flash(message, type = 'info') {
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: fixed;
      top: 20px;
      right: 240px;
      background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      z-index: 999998;
      transform: translateX(100px);
      opacity: 0;
      transition: all 0.3s ease;
    `;
    flash.textContent = message;
    
    document.body.appendChild(flash);
    
    // Animate in
    setTimeout(() => {
      flash.style.transform = 'translateX(0)';
      flash.style.opacity = '1';
    }, 100);
    
    // Animate out and remove
    setTimeout(() => {
      flash.style.transform = 'translateX(100px)';
      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 300);
    }, 3000);
  }
}

// Create global instance
window.scrapingStatusIndicator = new ScrapingStatusIndicator();