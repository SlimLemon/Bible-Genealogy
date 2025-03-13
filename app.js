/**
 * Biblical Genealogy Visualization Application
 * 
 * Main application entry point that initializes the visualization,
 * loads data, and sets up user interactions.
 * 
 * @version 2.0.0
 */
window.BiblicalGenealogyApp = window.BiblicalGenealogyApp || (function() {
  'use strict';

  // Application state
  const state = {
    data: null,
    visualization: null,
    renderer: null,
    ui: {
      isLoading: false,
      loadingMessage: '',
      activeTab: 'visualization',
      searchTerm: '',
      filters: {},
      selectedNode: null,
      error: null
    },
    settings: {
      dataLoadingLevel: 3,
      theme: 'light',
      layout: 'force-directed',
      performance: {
        useCache: true,
        simplifyForInteraction: true,
        debounceDelay: 250
      },
      visualization: {
        nodeSize: 8,
        linkWidth: 1.5,
        highlightColor: '#e74c3c',
        showLabels: true,
        labelSize: 12
      }
    },
    // Track history for undo/redo functionality
    history: {
      past: [],
      future: []
    },
    // Performance metrics
    metrics: {
      initTime: 0,
      loadTime: 0,
      renderTime: 0,
      lastInteraction: 0,
      frameRate: 0
    }
  };

  /**
   * Performance utility functions
   */
  const Performance = {
    timers: {},
    
    /**
     * Start timing a specific action
     * @param {string} label - Identifier for the timing
     */
    startTimer: function(label) {
      this.timers[label] = performance.now();
      if (window.DebugUtils) {
        window.DebugUtils.startTimer(label);
      }
    },
    
    /**
     * End timing and return duration
     * @param {string} label - Identifier for the timing
     * @return {number} Duration in milliseconds
     */
    endTimer: function(label) {
      const duration = performance.now() - (this.timers[label] || 0);
      if (window.DebugUtils) {
        window.DebugUtils.endTimer(label);
      }
      return duration;
    },
    
    /**
     * Log performance metric
     * @param {string} label - Metric name
     * @param {number} value - Metric value
     */
    logMetric: function(label, value) {
      state.metrics[label] = value;
      if (window.DebugUtils) {
        window.DebugUtils.logPerformance(label, value);
      }
    }
  };

  /**
   * Utility functions
   */
  const Utils = {
    /**
     * Debounce function to limit execution frequency
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @return {Function} Debounced function
     */
    debounce: function(func, wait = 250) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
      };
    },
    
    /**
     * Throttle function to limit execution frequency
     * @param {Function} func - Function to throttle
     * @param {number} limit - Minimum time between executions
     * @return {Function} Throttled function
     */
    throttle: function(func, limit = 100) {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    },
    
    /**
     * Deep merge objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @return {Object} Merged object
     */
    deepMerge: function(target, source) {
      const isObject = obj => obj && typeof obj === 'object';
      
      if (!isObject(target) || !isObject(source)) {
        return source;
      }
      
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!target[key]) Object.assign(target, { [key]: {} });
          this.deepMerge(target[key], source[key]);
        } else {
          Object.assign(target, { [key]: source[key] });
        }
      });
      
      return target;
    },
    
    /**
     * Check if it's the user's first visit
     * @return {boolean} True if first visit
     */
    isFirstTimeUser: function() {
      return !localStorage.getItem('app_visited');
    },
    
    /**
     * Set user as having visited the app
     */
    markUserVisited: function() {
      localStorage.setItem('app_visited', 'true');
    },
    
    /**
     * Generate a unique ID
     * @return {string} Unique ID
     */
    generateId: function() {
      return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
  };

  /**
   * State management functions
   */
  const StateManager = {
    /**
     * Update application state with changes
     * @param {Object} changes - Object with changes to apply
     * @param {boolean} addToHistory - Whether to add this change to history
     */
    updateState: function(changes, addToHistory = true) {
      // Add current state to history if needed
      if (addToHistory) {
        state.history.past.push(JSON.parse(JSON.stringify(state)));
        state.history.future = [];
        
        // Limit history size
        if (state.history.past.length > 20) {
          state.history.past.shift();
        }
      }
      
      // Apply changes
      Utils.deepMerge(state, changes);
      
      // Trigger UI updates based on state changes
      this.notifyStateChanged(changes);
    },
    
    /**
     * Undo last state change
     */
    undo: function() {
      if (state.history.past.length === 0) return;
      
      // Save current state to future
      state.history.future.push(JSON.parse(JSON.stringify(state)));
      
      // Restore previous state
      const previousState = state.history.past.pop();
      Object.assign(state, previousState);
      
      // Update UI
      this.notifyStateChanged({});
    },
    
    /**
     * Redo previously undone state change
     */
    redo: function() {
      if (state.history.future.length === 0) return;
      
      // Save current state to past
      state.history.past.push(JSON.parse(JSON.stringify(state)));
      
      // Apply future state
      const futureState = state.history.future.pop();
      Object.assign(state, futureState);
      
      // Update UI
      this.notifyStateChanged({});
    },
    
    /**
     * Notify that state has changed, triggering UI updates
     * @param {Object} changes - The changes that were applied
     */
    notifyStateChanged: function(changes) {
      // Update UI components based on what changed
      if (changes.ui) {
        updateUI();
      }
      
      if (changes.data) {
        updateDataDisplay();
      }
      
      if (changes.settings) {
        applySettings(state.settings);
      }
      
      // Dispatch custom event for other components
      const event = new CustomEvent('app:stateChanged', { 
        detail: { state, changes } 
      });
      document.dispatchEvent(event);
    }
  };
  /**
   * Initialize the application
   */
  async function initialize() {
    try {
      // Track initialization start time
      Performance.startTimer('app-init');
      
      // Show loading state
      updateLoadingState(true, 'Initializing application...');
      
      // Load application settings
      await loadSettings();
      
      // Register service worker for offline capabilities if supported
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(error => {
          console.warn('Service worker registration failed:', error);
        });
      }
      
      // Initialize debugging tools if in development mode
      if (window.DebugUtils) {
        window.DebugUtils.init({
          level: process.env.NODE_ENV === 'development' ? 'debug' : 'warn',
          enablePerformanceTracking: state.settings.performance.trackPerformance
        });
      }
      
      // Check for first-time users and show welcome/tutorial
      if (Utils.isFirstTimeUser()) {
        showWelcomeTutorial();
        Utils.markUserVisited();
      }
      
      // Load genealogy data
      updateLoadingState(true, 'Loading genealogy data...');
      const rawData = await GenealogyDataUtils.loadGenealogyData('./Genealogy-dataset.json', state.settings.dataLoadingLevel);
      
      // Process and transform the data
      updateLoadingState(true, 'Processing data...');
      const transformedData = GenealogyDataUtils.processGenealogyData(rawData);
      if (!transformedData) {
        throw new Error('Data transformation failed');
      }
      
      // Further enrich the dataset with additional metadata
      updateLoadingState(true, 'Enriching dataset...');
      const enrichedData = GenealogyDataUtils.enrichDataset(transformedData);
      
      // Store the data in application state
      state.data = enrichedData;
      
      // Initialize the visualization with the data
      updateLoadingState(true, 'Initializing visualization...');
      initializeVisualization(enrichedData);
      
      // Set up UI event handlers
      setupEventHandlers();
      
      // Optional: Perform initial data analysis
      analyzeDataset(enrichedData);
      
      // Complete initialization
      Performance.endTimer('app-init');
      Performance.logMetric('initTime', Performance.endTimer('app-init'));
      
      // Update UI state
      updateLoadingState(false);
      
      console.log('Application initialized successfully.');
    } catch (error) {
      console.error('Error during initialization:', error);
      updateLoadingState(false);
      showError('Failed to initialize the application: ' + error.message);
    }
  }

  /**
   * Load application settings from settings.json
   */
  async function loadSettings() {
    try {
      updateLoadingState(true, 'Loading settings...');
      
      const response = await fetch('./settings.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const settingsData = await response.json();
      
      // Merge with default settings
      StateManager.updateState({
        settings: Utils.deepMerge(state.settings, settingsData)
      }, false);
      
      // Apply theme immediately
      document.documentElement.setAttribute('data-theme', state.settings.theme);
      
      return state.settings;
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
      return state.settings; // Return defaults if loading fails
    }
  }

  /**
   * Initialize the visualization component
   * @param {Object} data - Processed genealogy data
   */
  function initializeVisualization(data) {
    Performance.startTimer('visualization-init');
    
    const container = document.getElementById('visualization-container');
    if (!container) {
      throw new Error('Visualization container not found');
    }
    
    // Create visualization instance
    state.visualization = new GenealogyVisualization({
      container: container,
      data: data,
      settings: state.settings.visualization
    });
    
    // Initialize renderer (D3)
    state.renderer = D3Renderer.createGenealogy(
      container, 
      data, 
      {
        width: container.clientWidth,
        height: container.clientHeight,
        nodeSize: state.settings.visualization.nodeSize,
        linkWidth: state.settings.visualization.linkWidth,
        showLabels: state.settings.visualization.showLabels,
        labelSize: state.settings.visualization.labelSize,
        theme: state.settings.theme
      }
    );
    
    // Setup visualization event listeners
    state.visualization.on('nodeSelected', handleNodeSelected);
    state.visualization.on('nodeHovered', handleNodeHovered);
    state.visualization.on('viewChanged', handleViewChanged);
    
    Performance.endTimer('visualization-init');
  }

  /**
   * Analyze the dataset to extract interesting patterns and statistics
   * @param {Object} data - The processed genealogy dataset
   */
  function analyzeDataset(data) {
    Performance.startTimer('data-analysis');
    
    // Extract basic statistics
    const stats = {
      totalPeople: data.nodes.length,
      totalRelationships: data.links.length,
      generations: new Set(data.nodes.map(n => n.generation)).size,
      earliestYear: Math.min(...data.nodes.filter(n => n.birthYear).map(n => n.birthYear)),
      latestYear: Math.max(...data.nodes.filter(n => n.deathYear).map(n => n.deathYear)),
      genderDistribution: {
        male: data.nodes.filter(n => n.gender === 'male').length,
        female: data.nodes.filter(n => n.gender === 'female').length,
        unknown: data.nodes.filter(n => n.gender !== 'male' && n.gender !== 'female').length
      },
      keyFigures: data.nodes.filter(n => n.isKeyFigure).length,
      tribes: {}
    };
    
    // Count people by tribe
    data.nodes.forEach(node => {
      if (node.tribe) {
        stats.tribes[node.tribe] = (stats.tribes[node.tribe] || 0) + 1;
      }
    });
    
    // Store statistics in state
    state.data.statistics = stats;
    
    Performance.endTimer('data-analysis');
    console.log('Dataset analysis complete:', stats);
    
    // Update statistics panel in UI
    updateStatisticsDisplay(stats);
  }
  
  /**
   * Set up event handlers for UI interactions
   */
  function setupEventHandlers() {
    // Search functionality
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(function(e) {
        const searchTerm = e.target.value.trim();
        StateManager.updateState({
          ui: { searchTerm: searchTerm }
        });
        
        if (searchTerm.length >= 2) {
          performSearch(searchTerm);
        } else {
          clearSearchResults();
        }
      }, 300));
    }
    
    // Filter handlers
    document.querySelectorAll('.filter-control').forEach(control => {
      control.addEventListener('change', handleFilterChange);
    });
    
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(tab => {
      tab.addEventListener('click', function() {
        const tabId = this.getAttribute('data-tab');
        switchTab(tabId);
      });
    });
    
    // Export buttons
    document.getElementById('export-svg-button')?.addEventListener('click', exportSVG);
    document.getElementById('export-png-button')?.addEventListener('click', exportPNG);
    document.getElementById('export-data-button')?.addEventListener('click', exportData);
    
    // Visualization controls
    document.getElementById('zoom-in-button')?.addEventListener('click', () => zoomVisualization(1.2));
    document.getElementById('zoom-out-button')?.addEventListener('click', () => zoomVisualization(0.8));
    document.getElementById('reset-view-button')?.addEventListener('click', resetVisualization);
    
    // Layout switcher
    document.querySelectorAll('.layout-option').forEach(option => {
      option.addEventListener('click', function() {
        const layoutType = this.getAttribute('data-layout');
        changeLayout(layoutType);
      });
    });
    
    // Settings panel
    document.getElementById('settings-button')?.addEventListener('click', toggleSettingsPanel);
    document.getElementById('settings-form')?.addEventListener('change', handleSettingsChange);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Window resize handler
    window.addEventListener('resize', Utils.debounce(handleWindowResize, state.settings.performance.debounceDelay));
  }
  /**
   * Handle keyboard shortcuts
   * @param {KeyboardEvent} event - Keyboard event
   */
  function handleKeyboardShortcuts(event) {
    // Ignore keyboard shortcuts when in input fields
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }
    
    // Common keyboard shortcuts
    const shortcutHandlers = {
      // Search - Ctrl+/
      '/': (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          document.getElementById('search-input')?.focus();
        }
      },
      // Zoom in - +
      '+': () => zoomVisualization(1.2),
      // Zoom out - -
      '-': () => zoomVisualization(0.8),
      // Reset view - 0
      '0': () => resetVisualization(),
      // Settings - Ctrl+,
      ',': (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          toggleSettingsPanel();
        }
      },
      // Undo - Ctrl+Z
      'z': (e) => {
        if (e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          StateManager.undo();
        }
      },
      // Redo - Ctrl+Shift+Z or Ctrl+Y
      'Z': (e) => {
        if (e.ctrlKey && e.shiftKey) {
          e.preventDefault();
          StateManager.redo();
        }
      },
      'y': (e) => {
        if (e.ctrlKey) {
          e.preventDefault();
          StateManager.redo();
        }
      },
      // Help - F1 or ?
      'F1': (e) => {
        e.preventDefault();
        showHelp();
      },
      '?': () => showHelp()
    };
    
    // Execute the handler if it exists
    const handler = shortcutHandlers[event.key];
    if (handler) {
      handler(event);
    }
  }

  /**
   * Handle window resize events
   */
  function handleWindowResize() {
    // Only resize if visualization exists
    if (!state.visualization || !state.renderer) return;
    
    const container = document.getElementById('visualization-container');
    if (!container) return;
    
    // Get new dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Update renderer with new dimensions
    state.renderer.resize(width, height);
    
    // Update state
    StateManager.updateState({
      ui: {
        containerDimensions: { width, height }
      }
    }, false); // Don't add resize to history
  }

  /**
   * Update the loading state and message
   * @param {boolean} isLoading - Whether the app is loading
   * @param {string} message - Optional loading message
   */
  function updateLoadingState(isLoading, message = '') {
    StateManager.updateState({
      ui: {
        isLoading: isLoading,
        loadingMessage: message
      }
    }, false); // Don't add loading states to history
    
    // Update UI elements
    const loader = document.getElementById('loader');
    const loadingMessage = document.getElementById('loading-message');
    
    if (loader) {
      loader.style.display = isLoading ? 'block' : 'none';
      loader.setAttribute('aria-hidden', !isLoading);
    }
    
    if (loadingMessage) {
      loadingMessage.textContent = message;
      loadingMessage.style.display = isLoading && message ? 'block' : 'none';
    }
    
    // Update page title to indicate loading state
    document.title = isLoading ? 
      `Loading... | Biblical Genealogy Visualizer` : 
      `Biblical Genealogy Visualizer`;
      
    // Disable UI interactions during loading
    const interactiveElements = document.querySelectorAll('button, input, select');
    interactiveElements.forEach(el => {
      el.disabled = isLoading;
    });
  }

  /**
   * Show error message to the user
   * @param {string|Object} error - Error message or object with details
   */
  function showError(error) {
    let errorMessage, errorType, errorDetails, isRecoverable;
    
    // Process error parameter based on type
    if (typeof error === 'string') {
      errorMessage = error;
      errorType = 'general';
      errorDetails = '';
      isRecoverable = true;
    } else {
      errorMessage = error.message || 'An unknown error occurred';
      errorType = error.type || 'general';
      errorDetails = error.details || '';
      isRecoverable = error.recoverable !== undefined ? error.recoverable : true;
    }
    
    // Update state with error info
    StateManager.updateState({
      ui: {
        error: {
          message: errorMessage,
          type: errorType,
          details: errorDetails,
          timestamp: Date.now(),
          recoverable: isRecoverable
        }
      }
    }, false); // Don't add errors to history
    
    // Show error UI
    const errorContainer = document.getElementById('error-container');
    const errorMessageEl = document.getElementById('error-message');
    const errorDetailsEl = document.getElementById('error-details');
    const errorRetryBtn = document.getElementById('error-retry-button');
    
    if (errorContainer && errorMessageEl) {
      errorMessageEl.textContent = errorMessage;
      
      if (errorDetailsEl) {
        errorDetailsEl.textContent = errorDetails;
        errorDetailsEl.style.display = errorDetails ? 'block' : 'none';
      }
      
      if (errorRetryBtn) {
        errorRetryBtn.style.display = isRecoverable ? 'block' : 'none';
      }
      
      // Add error type as class for styling
      errorContainer.className = 'error-container';
      errorContainer.classList.add(`error-${errorType}`);
      
      // Show the container
      errorContainer.style.display = 'block';
      
      // Auto-hide for warnings after 5 seconds
      if (errorType === 'warning') {
        setTimeout(() => {
          errorContainer.style.display = 'none';
        }, 5000);
      }
    }
    
    // Log to console
    console.error(`${errorType.toUpperCase()} ERROR:`, errorMessage, errorDetails);
  }

  /**
   * Schedule a retry for a failed operation
   * @param {Function} operation - The operation to retry
   * @param {number} delay - Delay in milliseconds before retry
   */
  function scheduleRetry(operation, delay = 5000) {
    console.log(`Scheduling retry in ${delay}ms`);
    
    const retryInfo = {
      operation: operation.name,
      scheduledTime: Date.now() + delay,
      attempt: (state.ui.retryAttempt || 0) + 1
    };
    
    // Update retry state
    StateManager.updateState({
      ui: {
        retryScheduled: true,
        retryInfo: retryInfo,
        retryAttempt: retryInfo.attempt
      }
    }, false);
    
    // Show retry notification
    const retryMessage = document.getElementById('retry-message');
    if (retryMessage) {
      retryMessage.textContent = `Retrying in ${delay / 1000} seconds... (Attempt ${retryInfo.attempt})`;
      retryMessage.style.display = 'block';
      
      // Update countdown
      let countdown = delay / 1000;
      const intervalId = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearInterval(intervalId);
          retryMessage.style.display = 'none';
        } else {
          retryMessage.textContent = `Retrying in ${countdown} seconds... (Attempt ${retryInfo.attempt})`;
        }
      }, 1000);
    }
    
    // Schedule the retry
    setTimeout(() => {
      // Clear retry state
      StateManager.updateState({
        ui: {
          retryScheduled: false,
          retryInfo: null
        }
      }, false);
      
      // Execute the operation
      operation();
    }, delay);
  }

  /**
   * Perform search on the genealogy data
   * @param {string} term - Search term
   */
  function performSearch(term) {
    Performance.startTimer('search');
    
    if (!state.data || !state.data.nodes) {
      console.warn('Cannot search: Data not loaded');
      return;
    }
    
    const results = GenealogyDataUtils.searchGenealogyData(state.data, term);
    
    // Update search results in state
    StateManager.updateState({
      ui: {
        searchResults: results,
        searchResultsVisible: results.length > 0
      }
    });
    
    // Update UI with search results
    displaySearchResults(results);
    
    // Highlight matching nodes in visualization
    if (state.visualization) {
      const matchingIds = results.map(result => result.id);
      state.visualization.highlightNodes(matchingIds);
    }
    
    Performance.endTimer('search');
  }

  /**
   * Display search results in the UI
   * @param {Array} results - Search results
   */
  function displaySearchResults(results) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    // Clear previous results
    resultsContainer.innerHTML = '';
    
    if (results.length === 0) {
      resultsContainer.innerHTML = '<p class="no-results">No results found</p>';
      resultsContainer.style.display = 'block';
      return;
    }
    
    // Create results list
    const resultsList = document.createElement('ul');
    resultsList.className = 'search-results-list';
    
    // Add each result to the list
    results.forEach(result => {
      const listItem = document.createElement('li');
      listItem.className = 'search-result-item';
      listItem.setAttribute('data-id', result.id);
      
      const nameElement = document.createElement('strong');
      nameElement.textContent = result.name;
      
      const detailsElement = document.createElement('span');
      detailsElement.className = 'search-result-details';
      
      // Add relevant details based on available data
      const details = [];
      if (result.birthYear) details.push(`Born: ${result.birthYear}`);
      if (result.deathYear) details.push(`Died: ${result.deathYear}`);
      if (result.tribe) details.push(`Tribe: ${result.tribe}`);
      if (result.role) details.push(`Role: ${result.role}`);
      
      detailsElement.textContent = details.join(' | ');
      
      // Append elements to list item
      listItem.appendChild(nameElement);
      listItem.appendChild(document.createElement('br'));
      listItem.appendChild(detailsElement);
      
      // Add click handler to select this node
      listItem.addEventListener('click', () => {
        selectNode(result.id);
        clearSearchResults();
        document.getElementById('search-input').value = '';
      });
      
      resultsList.appendChild(listItem);
    });
    
    // Append list to container
    resultsContainer.appendChild(resultsList);
    resultsContainer.style.display = 'block';
  }
  /**
   * Clear search results
   */
  function clearSearchResults() {
    const resultsContainer = document.getElementById('search-results');
    if (resultsContainer) {
      resultsContainer.innerHTML = '';
      resultsContainer.style.display = 'none';
    }
    
    // Clear highlighting in visualization
    if (state.visualization) {
      state.visualization.clearHighlights();
    }
    
    // Update state
    StateManager.updateState({
      ui: {
        searchResults: [],
        searchResultsVisible: false,
        searchTerm: ''
      }
    });
  }

  /**
   * Switch between application tabs
   * @param {string} tabId - ID of the tab to switch to
   */
  function switchTab(tabId) {
    // Update active tab in state
    StateManager.updateState({
      ui: { activeTab: tabId }
    });
    
    // Update tab UI
    document.querySelectorAll('.tab-button').forEach(button => {
      const isActive = button.getAttribute('data-tab') === tabId;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', isActive);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
      const isActive = content.getAttribute('id') === `${tabId}-tab`;
      content.classList.toggle('active', isActive);
      content.style.display = isActive ? 'block' : 'none';
      content.setAttribute('aria-hidden', !isActive);
    });
    
    // Special handling for each tab
    switch (tabId) {
      case 'visualization':
        // Ensure visualization is properly sized on tab switch
        handleWindowResize();
        break;
      case 'statistics':
        // Refresh statistics on tab switch
        updateStatisticsDisplay(state.data.statistics);
        break;
      case 'timeline':
        // Initialize timeline if needed
        initializeTimeline();
        break;
      case 'map':
        // Initialize map if needed
        initializeMap();
        break;
    }
  }

  /**
   * Update statistics display with current data
   * @param {Object} stats - Statistics object
   */
  function updateStatisticsDisplay(stats) {
    const statsContainer = document.getElementById('statistics-content');
    if (!statsContainer || !stats) return;
    
    // Create statistics HTML
    const statsHTML = `
      <div class="statistics-overview">
        <div class="stat-box">
          <h3>People</h3>
          <div class="stat-value">${stats.totalPeople}</div>
        </div>
        <div class="stat-box">
          <h3>Relationships</h3>
          <div class="stat-value">${stats.totalRelationships}</div>
        </div>
        <div class="stat-box">
          <h3>Generations</h3>
          <div class="stat-value">${stats.generations}</div>
        </div>
        <div class="stat-box">
          <h3>Time Span</h3>
          <div class="stat-value">${stats.earliestYear} to ${stats.latestYear}</div>
        </div>
      </div>
      
      <div class="statistics-details">
        <div class="stat-section">
          <h3>Gender Distribution</h3>
          <div class="gender-chart" id="gender-chart"></div>
          <div class="gender-legend">
            <div class="legend-item">
              <span class="color-box male-color"></span>
              <span>Male: ${stats.genderDistribution.male} (${Math.round(stats.genderDistribution.male / stats.totalPeople * 100)}%)</span>
            </div>
            <div class="legend-item">
              <span class="color-box female-color"></span>
              <span>Female: ${stats.genderDistribution.female} (${Math.round(stats.genderDistribution.female / stats.totalPeople * 100)}%)</span>
            </div>
            <div class="legend-item">
              <span class="color-box unknown-color"></span>
              <span>Unknown: ${stats.genderDistribution.unknown} (${Math.round(stats.genderDistribution.unknown / stats.totalPeople * 100)}%)</span>
            </div>
          </div>
        </div>
        
        <div class="stat-section">
          <h3>Tribes of Israel</h3>
          <div class="tribes-chart" id="tribes-chart"></div>
          <div class="tribes-list">
            ${Object.entries(stats.tribes)
              .sort((a, b) => b[1] - a[1])
              .map(([tribe, count]) => `
                <div class="tribe-item">
                  <span class="tribe-name">${tribe}:</span>
                  <span class="tribe-count">${count}</span>
                </div>
              `).join('')}
          </div>
        </div>
      </div>
    `;
    
    // Update container
    statsContainer.innerHTML = statsHTML;
    
    // Initialize charts if D3 is available
    if (window.d3) {
      createGenderChart(stats.genderDistribution);
      createTribesChart(stats.tribes);
    }
  }

  /**
   * Create gender distribution chart using D3
   * @param {Object} genderData - Gender distribution data
   */
  function createGenderChart(genderData) {
    const chartContainer = document.getElementById('gender-chart');
    if (!chartContainer || !window.d3) return;
    
    // Convert data to format expected by D3
    const data = [
      { gender: 'Male', value: genderData.male },
      { gender: 'Female', value: genderData.female },
      { gender: 'Unknown', value: genderData.unknown }
    ];
    
    // Clear existing chart
    chartContainer.innerHTML = '';
    
    // Set up dimensions
    const width = chartContainer.clientWidth;
    const height = 250;
    const radius = Math.min(width, height) / 2;
    
    // Create SVG
    const svg = d3.select(chartContainer)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);
    
    // Set up colors
    const color = d3.scaleOrdinal()
      .domain(['Male', 'Female', 'Unknown'])
      .range(['#3498db', '#e74c3c', '#95a5a6']);
    
    // Create pie chart
    const pie = d3.pie()
      .value(d => d.value);
    
    const arc = d3.arc()
      .innerRadius(0)
      .outerRadius(radius);
    
    // Generate the arcs
    const arcs = svg.selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc');
    
    // Draw arc paths
    arcs.append('path')
      .attr('d', arc)
      .attr('fill', d => color(d.data.gender));
    
    // Add labels
    arcs.append('text')
      .attr('transform', d => {
        const pos = arc.centroid(d);
        const x = pos[0] * 1.5;
        const y = pos[1] * 1.5;
        return `translate(${x}, ${y})`;
      })
      .attr('text-anchor', 'middle')
      .text(d => d.data.value > 0 ? `${d.data.gender}` : '');
  }

  /**
   * Create tribes distribution chart using D3
   * @param {Object} tribesData - Tribes distribution data
   */
  function createTribesChart(tribesData) {
    const chartContainer = document.getElementById('tribes-chart');
    if (!chartContainer || !window.d3) return;
    
    // Convert data to format expected by D3
    const data = Object.entries(tribesData)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    
    // Clear existing chart
    chartContainer.innerHTML = '';
    
    // Set up dimensions
    const margin = { top: 20, right: 20, bottom: 60, left: 40 };
    const width = chartContainer.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    // Create SVG
    const svg = d3.select(chartContainer)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // X scale
    const x = d3.scaleBand()
      .domain(data.map(d => d.name))
      .range([0, width])
      .padding(0.1);
    
    // Y scale
    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value)])
      .range([height, 0]);
    
    // Color scale
    const color = d3.scaleOrdinal()
      .domain(data.map(d => d.name))
      .range(d3.schemeCategory10);
    
    // Draw the bars
    svg.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.name))
      .attr('width', x.bandwidth())
      .attr('y', d => y(d.value))
      .attr('height', d => height - y(d.value))
      .attr('fill', d => color(d.name));
    
    // Add the x-axis
    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x))
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');
    
    // Add the y-axis
    svg.append('g')
      .call(d3.axisLeft(y));
    
    // Add a title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 0)
      .attr('text-anchor', 'middle')
      .text('Number of People by Tribe');
  }
  /**
   * Initialize timeline visualization
   */
  function initializeTimeline() {
    if (!state.data || !state.data.nodes) return;
    
    const timelineContainer = document.getElementById('timeline-container');
    if (!timelineContainer) return;
    
    // Check if timeline is already initialized
    if (timelineContainer.getAttribute('data-initialized') === 'true') {
      return;
    }
    
    Performance.startTimer('timeline-init');
    
    // Show loading indicator
    updateLoadingState(true, 'Initializing timeline...');
    
    setTimeout(() => {
      try {
        // Extract timeline data from nodes
        const timelineEvents = state.data.nodes
          .filter(n => n.birthYear || n.deathYear)
          .map(person => {
            const events = [];
            
            if (person.birthYear) {
              events.push({
                id: `birth-${person.id}`,
                person: person.id,
                name: person.name,
                type: 'birth',
                year: person.birthYear,
                description: `Birth of ${person.name}`,
                importance: person.isKeyFigure ? 'high' : 'normal'
              });
            }
            
            if (person.deathYear) {
              events.push({
                id: `death-${person.id}`,
                person: person.id,
                name: person.name,
                type: 'death',
                year: person.deathYear,
                description: `Death of ${person.name}`,
                importance: person.isKeyFigure ? 'high' : 'normal'
              });
            }
            
            return events;
          })
          .flat()
          .sort((a, b) => a.year - b.year);
        
        // Create timeline
        if (window.d3) {
          createTimelineVisualization(timelineContainer, timelineEvents);
        } else {
          createSimpleTimeline(timelineContainer, timelineEvents);
        }
        
        // Mark as initialized
        timelineContainer.setAttribute('data-initialized', 'true');
      } catch (error) {
        console.error('Error initializing timeline:', error);
        showError({
          message: 'Failed to initialize timeline',
          type: 'visualization',
          details: error.message,
          recoverable: true
        });
      } finally {
        updateLoadingState(false);
        Performance.endTimer('timeline-init');
      }
    }, 0); // Using setTimeout to not block the UI
  }

  /**
   * Create a timeline visualization using D3
   * @param {HTMLElement} container - Container element
   * @param {Array} events - Timeline events
   */
  function createTimelineVisualization(container, events) {
    // Setup dimensions
    const margin = { top: 50, right: 20, bottom: 50, left: 50 };
    const width = container.clientWidth - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;
    
    // Clear container
    container.innerHTML = '';
    
    // Create SVG
    const svg = d3.select(container)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Extract years range
    const years = events.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    
    // X scale (time)
    const x = d3.scaleLinear()
      .domain([minYear, maxYear])
      .range([0, width]);
    
    // Draw x-axis
    svg.append('g')
      .attr('transform', `translate(0, ${height})`)
      .call(d3.axisBottom(x).tickFormat(d => d));
    
    // Add timeline line
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', height / 2)
      .attr('y2', height / 2)
      .attr('stroke', '#aaa')
      .attr('stroke-width', 2);
    
    // Event circles
    const eventGroups = svg.selectAll('.event-group')
      .data(events)
      .enter()
      .append('g')
      .attr('class', 'event-group')
      .attr('transform', d => `translate(${x(d.year)}, ${height / 2})`);
    
    // Add event circles
    eventGroups.append('circle')
      .attr('r', d => d.importance === 'high' ? 8 : 5)
      .attr('fill', d => d.type === 'birth' ? '#2ecc71' : '#e74c3c')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1)
      .attr('class', 'timeline-event')
      .attr('data-id', d => d.person);
    
    // Add event labels
    eventGroups.append('text')
      .attr('y', d => d.type === 'birth' ? -15 : 20)
      .attr('text-anchor', 'middle')
      .attr('font-size', d => d.importance === 'high' ? '12px' : '10px')
      .attr('font-weight', d => d.importance === 'high' ? 'bold' : 'normal')
      .text(d => d.name)
      .each(function(d) {
        // Wrap text if too long
        const textElement = d3.select(this);
        const words = d.name.split(/\s+/);
        if (words.length > 1) {
          textElement.text(words[0]);
          textElement.append('tspan')
            .attr('x', 0)
            .attr('dy', '1.2em')
            .text(words.slice(1).join(' '));
        }
      });
    
    // Year labels for important events
    eventGroups.filter(d => d.importance === 'high')
      .append('text')
      .attr('y', -30)
      .attr('text-anchor', 'middle')
      .attr('font-size', '10px')
      .text(d => d.year);
    
    // Add interactivity
    eventGroups.on('click', function(event, d) {
      selectNode(d.person);
    }).on('mouseover', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d.importance === 'high' ? 10 : 7);
        
      // Show tooltip
      const tooltip = document.getElementById('timeline-tooltip');
      if (tooltip) {
        tooltip.innerHTML = `
          <strong>${d.name}</strong><br>
          ${d.type === 'birth' ? 'Born' : 'Died'}: ${d.year}<br>
          ${d.description}
        `;
        tooltip.style.display = 'block';
        tooltip.style.left = `${event.pageX + 10}px`;
        tooltip.style.top = `${event.pageY - 20}px`;
      }
    }).on('mouseout', function(event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d.importance === 'high' ? 8 : 5);
        
      // Hide tooltip
      const tooltip = document.getElementById('timeline-tooltip');
      if (tooltip) {
        tooltip.style.display = 'none';
      }
    });
    
    // Add zoom functionality
    const zoom = d3.zoom()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        svg.attr('transform', event.transform);
      });
    
    d3.select(container).select('svg').call(zoom);
    
    // Add tooltip div if not exists
    if (!document.getElementById('timeline-tooltip')) {
      const tooltipDiv = document.createElement('div');
      tooltipDiv.id = 'timeline-tooltip';
      tooltipDiv.className = 'tooltip';
      tooltipDiv.style.display = 'none';
      tooltipDiv.style.position = 'absolute';
      tooltipDiv.style.padding = '8px';
      tooltipDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
      tooltipDiv.style.color = '#fff';
      tooltipDiv.style.borderRadius = '4px';
      tooltipDiv.style.pointerEvents = 'none';
      tooltipDiv.style.zIndex = '1000';
      document.body.appendChild(tooltipDiv);
    }
  }

  /**
   * Create a simple timeline for browsers without D3
   * @param {HTMLElement} container - Container element
   * @param {Array} events - Timeline events
   */
  function createSimpleTimeline(container, events) {
    // Clear container
    container.innerHTML = '';
    
    // Create timeline container
    const timelineEl = document.createElement('div');
    timelineEl.className = 'simple-timeline';
    
    // Create timeline header
    const header = document.createElement('h3');
    header.textContent = 'Biblical Timeline';
    timelineEl.appendChild(header);
    
    // Extract years range
    const years = events.map(d => d.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    
    // Create timeline axis
    const axisContainer = document.createElement('div');
    axisContainer.className = 'timeline-axis-container';
    
    const axisLine = document.createElement('div');
    axisLine.className = 'timeline-axis';
    axisContainer.appendChild(axisLine);
    
    // Add year markers
    const range = maxYear - minYear;
    const stepSize = range <= 500 ? 50 : range <= 1000 ? 100 : 200;
    
    for (let year = Math.floor(minYear / stepSize) * stepSize; year <= maxYear; year += stepSize) {
      const marker = document.createElement('div');
      marker.className = 'timeline-marker';
      
      // Position marker along the timeline
      const position = ((year - minYear) / (maxYear - minYear)) * 100;
      marker.style.left = `${position}%`;
      
      // Add year label
      const label = document.createElement('span');
      label.className = 'year-label';
      label.textContent = year;
      marker.appendChild(label);
      
      axisLine.appendChild(marker);
    }
    
    timelineEl.appendChild(axisContainer);
    
    // Create events container
    const eventsContainer = document.createElement('div');
    eventsContainer.className = 'timeline-events-container';
    
    // Group events by year for better visualization
    const eventsByYear = {};
    events.forEach(event => {
      if (!eventsByYear[event.year]) {
        eventsByYear[event.year] = [];
      }
      eventsByYear[event.year].push(event);
    });
    
    // Add events to timeline
    Object.keys(eventsByYear).forEach(year => {
      const yearEvents = eventsByYear[year];
      
      // Create event marker
      const eventGroup = document.createElement('div');
      eventGroup.className = 'event-group';
      
      // Position event along the timeline
      const position = ((parseInt(year) - minYear) / (maxYear - minYear)) * 100;
      eventGroup.style.left = `${position}%`;
      
      // Add year label for group
      const yearLabel = document.createElement('div');
      yearLabel.className = 'year-label';
      yearLabel.textContent = year;
      eventGroup.appendChild(yearLabel);
      
      // Add events
      yearEvents.forEach(event => {
        const eventEl = document.createElement('div');
        eventEl.className = `timeline-event ${event.type} ${event.importance}`;
        eventEl.setAttribute('data-id', event.person);
        
        const dot = document.createElement('span');
        dot.className = 'event-dot';
        eventEl.appendChild(dot);
        
        const nameEl = document.createElement('span');
        nameEl.className = 'event-name';
        nameEl.textContent = event.name;
        eventEl.appendChild(nameEl);
        
        // Add event listeners
        eventEl.addEventListener('click', () => {
          selectNode(event.person);
        });
        
        eventEl.addEventListener('mouseover', (e) => {
          // Show tooltip
          const tooltip = document.getElementById('timeline-tooltip');
          if (tooltip) {
            tooltip.innerHTML = `
              <strong>${event.name}</strong><br>
              ${event.type === 'birth' ? 'Born' : 'Died'}: ${event.year}<br>
              ${event.description}
            `;
            tooltip.style.display = 'block';
            tooltip.style.left = `${e.pageX + 10}px`;
            tooltip.style.top = `${e.pageY - 20}px`;
          }
        });
        
        eventEl.addEventListener('mouseout', () => {
          // Hide tooltip
          const tooltip = document.getElementById('timeline-tooltip');
          if (tooltip) {
            tooltip.style.display = 'none';
          }
        });
        
        eventGroup.appendChild(eventEl);
      });
      
      eventsContainer.appendChild(eventGroup);
    });
    
    timelineEl.appendChild(eventsContainer);
    
    // Create timeline controls
    const controls = document.createElement('div');
    controls.className = 'timeline-controls';
    
    const zoomInBtn = document.createElement('button');
    zoomInBtn.className = 'zoom-btn zoom-in';
    zoomInBtn.innerHTML = '&#43;'; // Plus sign
    zoomInBtn.setAttribute('aria-label', 'Zoom in timeline');
    
    const zoomOutBtn = document.createElement('button');
    zoomOutBtn.className = 'zoom-btn zoom-out';
    zoomOutBtn.innerHTML = '&#8722;'; // Minus sign
    zoomOutBtn.setAttribute('aria-label', 'Zoom out timeline');
    
    const resetBtn = document.createElement('button');
    resetBtn.className = 'reset-btn';
    resetBtn.textContent = 'Reset';
    resetBtn.setAttribute('aria-label', 'Reset timeline');
    
    controls.appendChild(zoomOutBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(zoomInBtn);
    
    // Add event listeners for controls
    let zoomLevel = 1;
    const MAX_ZOOM = 3;
    const MIN_ZOOM = 0.5;
    
    zoomInBtn.addEventListener('click', () => {
      if (zoomLevel < MAX_ZOOM) {
        zoomLevel *= 1.2;
        eventsContainer.style.transform = `scaleX(${zoomLevel})`;
        axisLine.style.transform = `scaleX(${zoomLevel})`;
      }
    });
    
    zoomOutBtn.addEventListener('click', () => {
      if (zoomLevel > MIN_ZOOM) {
        zoomLevel *= 0.8;
        eventsContainer.style.transform = `scaleX(${zoomLevel})`;
        axisLine.style.transform = `scaleX(${zoomLevel})`;
      }
    });
    
    resetBtn.addEventListener('click', () => {
      zoomLevel = 1;
      eventsContainer.style.transform = '';
      axisLine.style.transform = '';
      eventsContainer.scrollLeft = 0;
    });
    
    timelineEl.appendChild(controls);
    
    // Add scroll hint
    const scrollHint = document.createElement('div');
    scrollHint.className = 'scroll-hint';
    scrollHint.textContent = '← Scroll to navigate timeline →';
    timelineEl.appendChild(scrollHint);
    
    // Add timeline to container
    container.appendChild(timelineEl);
    
    // Add tooltip div if not exists
    if (!document.getElementById('timeline-tooltip')) {
      const tooltipDiv = document.createElement('div');
      tooltipDiv.id = 'timeline-tooltip';
      tooltipDiv.className = 'tooltip';
      tooltipDiv.style.display = 'none';
      tooltipDiv.style.position = 'absolute';
      tooltipDiv.style.padding = '8px';
      tooltipDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
      tooltipDiv.style.color = '#fff';
      tooltipDiv.style.borderRadius = '4px';
      tooltipDiv.style.pointerEvents = 'none';
      tooltipDiv.style.zIndex = '1000';
      document.body.appendChild(tooltipDiv);
    }
    
    // Hide scroll hint after 5 seconds
    setTimeout(() => {
      scrollHint.style.opacity = '0';
      setTimeout(() => {
        scrollHint.style.display = 'none';
      }, 1000);
    }, 5000);
  }

  /**
   * Zoom the main visualization
   * @param {number} scale - Zoom scale factor
   */
  function zoomVisualization(scale) {
    if (!state.renderer || typeof state.renderer.zoom !== 'function') {
      console.warn('Zoom not available');
      return;
    }
    
    state.renderer.zoom(scale);
    
    // Update zoom level in state
    const currentZoom = state.ui.zoomLevel || 1;
    StateManager.updateState({
      ui: {
        zoomLevel: currentZoom * scale
      }
    }, false); // Don't add zoom to history
  }

  /**
   * Reset visualization to default view
   */
  function resetVisualization() {
    if (!state.renderer || typeof state.renderer.resetView !== 'function') {
      console.warn('Reset view not available');
      return;
    }
    
    state.renderer.resetView();
    
    // Reset zoom level in state
    StateManager.updateState({
      ui: {
        zoomLevel: 1
      }
    }, false); // Don't add reset to history
  }

  /**
   * Toggle settings panel visibility
   */
  function toggleSettingsPanel() {
    const settingsPanel = document.getElementById('settings-panel');
    if (!settingsPanel) return;
    
    const isVisible = settingsPanel.classList.contains('visible');
    
    if (isVisible) {
      settingsPanel.classList.remove('visible');
      settingsPanel.setAttribute('aria-hidden', 'true');
    } else {
      settingsPanel.classList.add('visible');
      settingsPanel.setAttribute('aria-hidden', 'false');
      
      // Focus first input in settings panel
      setTimeout(() => {
        const firstInput = settingsPanel.querySelector('input, select, button');
        if (firstInput) firstInput.focus();
      }, 100);
    }
    
    // Update state
    StateManager.updateState({
      ui: {
        settingsPanelOpen: !isVisible
      }
    }, false); // Don't add panel toggle to history
  }

  /**
   * Show help dialog
   */
  function showHelp() {
    const helpDialog = document.getElementById('help-dialog');
    if (!helpDialog) return;
    
    helpDialog.style.display = 'block';
    helpDialog.setAttribute('aria-hidden', 'false');
    
    // Focus close button
    const closeBtn = helpDialog.querySelector('.close-btn');
    if (closeBtn) closeBtn.focus();
    
    // Update state
    StateManager.updateState({
      ui: {
        helpDialogOpen: true
      }
    }, false); // Don't add dialog toggle to history
  }

  /**
   * Hide help dialog
   */
  function hideHelp() {
    const helpDialog = document.getElementById('help-dialog');
    if (!helpDialog) return;
    
    helpDialog.style.display = 'none';
    helpDialog.setAttribute('aria-hidden', 'true');
    
    // Update state
    StateManager.updateState({
      ui: {
        helpDialogOpen: false
      }
    }, false); // Don't add dialog toggle to history
  }

  /**
   * Select a node in the visualization
   * @param {string} nodeId - ID of the node to select
   */
  function selectNode(nodeId) {
    if (!state.visualization || typeof state.visualization.selectNode !== 'function') {
      console.warn('Node selection not available');
      return;
    }
    
    state.visualization.selectNode(nodeId);
    
    // Highlight node in timeline too
    highlightTimelineNode(nodeId);
    
    // Update state
    StateManager.updateState({
      ui: {
        selectedNode: nodeId
      }
    }, true); // Add selection to history
  }

  /**
   * Highlight a node in the timeline
   * @param {string} nodeId - ID of the node to highlight
   */
  function highlightTimelineNode(nodeId) {
    // Remove highlighting from all timeline events
    const allEvents = document.querySelectorAll('.timeline-event');
    allEvents.forEach(event => event.classList.remove('selected'));
    
    // Add highlighting to matching events
    const matchingEvents = document.querySelectorAll(`.timeline-event[data-id="${nodeId}"]`);
    matchingEvents.forEach(event => event.classList.add('selected'));
    
    // Scroll to event if it exists
    if (matchingEvents.length > 0) {
      const firstEvent = matchingEvents[0];
      const container = firstEvent.closest('.timeline-events-container');
      
      if (container) {
        // Calculate scroll position to center the event
        const eventRect = firstEvent.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        
        const scrollLeft = firstEvent.offsetLeft - (containerRect.width / 2) + (eventRect.width / 2);
        
        // Smooth scroll to the event
        container.scrollTo({
          left: scrollLeft,
          behavior: 'smooth'
        });
      }
    }
  }

  /**
   * Initialize event listeners for the application
   */
  function initEventListeners() {
    // Window resize event
    window.addEventListener('resize', debounce(handleWindowResize, 250));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Search form
    const searchForm = document.getElementById('search-form');
    if (searchForm) {
      searchForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const searchInput = document.getElementById('search-input');
        if (searchInput && searchInput.value.trim()) {
          performSearch(searchInput.value.trim());
        }
      });
    }
    
    // Settings form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', function(event) {
        event.preventDefault();
        saveSettings();
      });
    }
    
    // Settings toggle button
    const settingsToggle = document.getElementById('settings-toggle');
    if (settingsToggle) {
      settingsToggle.addEventListener('click', toggleSettingsPanel);
    }
    
    // Help dialog
    const helpToggle = document.getElementById('help-toggle');
    if (helpToggle) {
      helpToggle.addEventListener('click', showHelp);
    }
    
    const helpCloseBtn = document.querySelector('#help-dialog .close-btn');
    if (helpCloseBtn) {
      helpCloseBtn.addEventListener('click', hideHelp);
    }
    
    // Error retry button
    const errorRetryBtn = document.getElementById('error-retry-button');
    if (errorRetryBtn) {
      errorRetryBtn.addEventListener('click', function() {
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
          errorContainer.style.display = 'none';
        }
        
        // Retry last failed operation
        if (state.lastFailedOperation) {
          state.lastFailedOperation();
        } else {
          initializeApplication();
        }
      });
    }
    
    // Timeline container
    const timelineContainer = document.getElementById('timeline-container');
    if (timelineContainer) {
      timelineContainer.addEventListener('scroll', function() {
        // Hide scroll hint when user scrolls
        const scrollHint = document.querySelector('.scroll-hint');
        if (scrollHint) {
          scrollHint.style.opacity = '0';
          setTimeout(() => {
            scrollHint.style.display = 'none';
          }, 1000);
        }
      });
    }
  }

  /**
   * Save settings from the settings form
   */
  function saveSettings() {
    // Get settings from form
    const theme = document.getElementById('setting-theme')?.value || 'light';
    const language = document.getElementById('setting-language')?.value || 'en';
    const animationsEnabled = document.getElementById('setting-animations')?.checked || false;
    const autoZoom = document.getElementById('setting-auto-zoom')?.checked || false;
    const biblicalModel = document.getElementById('setting-biblical-model')?.value || 'hebrew';
    const initialView = document.getElementById('setting-initial-view')?.value || 'generational';
    
    // Create settings object
    const settings = {
      theme,
      language,
      animationsEnabled,
      autoZoom,
      biblicalModel,
      initialView,
      showControls: document.getElementById('setting-show-controls')?.checked || false,
      enableTimeline: document.getElementById('setting-enable-timeline')?.checked || false,
      enableSearch: document.getElementById('setting-enable-search')?.checked || false,
      enableExport: document.getElementById('setting-enable-export')?.checked || false
    };
    
    // Save settings
    StateManager.updateState({
      settings
    }, true);
    
    // Apply settings
    applySettings(settings);
    
    // Close settings panel
    toggleSettingsPanel();
    
    // Show confirmation
    showNotification('Settings saved successfully');
  }

  /**
   * Apply settings to the application
   * @param {Object} settings - Settings object
   */
  function applySettings(settings) {
    // Apply theme
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${settings.theme}-theme`);
    
    // Apply language
    document.documentElement.setAttribute('lang', settings.language);
    
    // Apply animations setting
    if (settings.animationsEnabled) {
      document.body.classList.remove('no-animations');
    } else {
      document.body.classList.add('no-animations');
    }
    
    // Apply other settings to visualization
    if (state.visualization) {
      state.visualization.updateSettings(settings);
    }
    
    // Show/hide controls
    const controlsContainer = document.getElementById('controls-container');
    if (controlsContainer) {
      controlsContainer.style.display = settings.showControls ? 'flex' : 'none';
    }
    
    // Show/hide timeline
    const timelineContainer = document.getElementById('timeline-container');
    if (timelineContainer) {
      timelineContainer.style.display = settings.enableTimeline ? 'block' : 'none';
    }
    
    // Show/hide search
    const searchContainer = document.getElementById('search-container');
    if (searchContainer) {
      searchContainer.style.display = settings.enableSearch ? 'flex' : 'none';
    }
    
    // Show/hide export
    const exportButton = document.getElementById('export-button');
    if (exportButton) {
      exportButton.style.display = settings.enableExport ? 'inline-block' : 'none';
    }
  }

  /**
   * Show notification to the user
   * @param {string} message - Notification message
   * @param {string} type - Type of notification ('info', 'success', 'warning', 'error')
   * @param {number} duration - Duration in milliseconds
   */
  function showNotification(message, type = 'info', duration = 3000) {
    let notificationContainer = document.getElementById('notification-container');
    
    // Create container if it doesn't exist
    if (!notificationContainer) {
      notificationContainer = document.createElement('div');
      notificationContainer.id = 'notification-container';
      document.body.appendChild(notificationContainer);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.addEventListener('click', () => {
      notification.classList.add('notification-hiding');
      setTimeout(() => {
        notification.remove();
      }, 300);
    });
    
    notification.appendChild(closeBtn);
    
    // Add to container
    notificationContainer.appendChild(notification);
    
    // Auto remove after duration
    setTimeout(() => {
      notification.classList.add('notification-hiding');
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, duration);
  }

  /**
   * Utility function to debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @return {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  // Initialize the application when the DOM is ready
  document.addEventListener('DOMContentLoaded', initializeApplication);

  // Export public API
  return {
    init: initializeApplication,
    refresh: refreshVisualization,
    selectNode,
    search: performSearch,
    zoomIn: () => zoomVisualization(1.2),
    zoomOut: () => zoomVisualization(0.8),
    resetView: resetVisualization,
    showSettings: toggleSettingsPanel,
    showHelp,
    getState: () => ({...state})
  };
})();