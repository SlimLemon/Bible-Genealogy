// Check if BiblicalGenealogyApp is already defined
if (typeof BiblicalGenealogyApp === 'undefined') {
  /** 
   * Biblical Genealogy Application 
   * Main application module that coordinates data loading, UI, and visualization 
   */
  const BiblicalGenealogyApp = (function() {
    // Application state management
    const state = {
      data: null,
      loading: false,
      error: null,
      settings: {
        theme: 'light',
        language: 'en',
        animations: true,
        autoZoom: true,
        biblicalModel: 'hebrew',  // 'hebrew' or 'christian'
        initialView: 'generational', // 'generational', 'lineage', or 'timeline'
        showControls: true,
        enableTimeline: true,
        enableSearch: true,
        enableExport: true
      }
    };

    /**
     * Initialize the application
     */
    async function initialize() {
      console.log('Starting application initialization.');

      try {
        updateLoadingState(true, 'Loading data...');
        
        // Load settings first
        await loadSettings();
        
        // Load genealogy data
        console.log('About to load genealogy data...');
        const rawData = await GenealogyDataUtils.loadGenealogyData('./Genealogy-dataset.json', 3);
        
        // Process and transform the data
        console.log('Data loaded, transforming structure.');
        const transformedData = GenealogyDataUtils.processGenealogyData(rawData);
        if (!transformedData) {
          throw new Error('Data transformation failed');
        }
        
        // Further enrich the dataset with additional metadata
        console.log('Enriching dataset.');
        const enrichedData = GenealogyDataUtils.enrichDataset(transformedData);
        
        // Store the data in application state
        state.data = enrichedData;
        
        // Initialize the visualization with the data
        initializeVisualization(enrichedData);
        
        // Set up UI event handlers
        setupEventHandlers();
        
        // Optional: Perform initial data analysis
        analyzeDataset(enrichedData);
        
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
        const response = await fetch('./settings.json');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const settings = await response.json();
        state.settings = { ...state.settings, ...settings };
        applySettings(state.settings);
        return settings;
      } catch (error) {
        console.warn('Failed to load settings, using defaults:', error);
        return state.settings;
      }
    }

    /**
     * Apply settings to the application UI and behavior
     * @param {Object} settings - The settings to apply
     */
    function applySettings(settings) {
      // Apply theme
      document.body.setAttribute('data-theme', settings.theme);
      
      // Apply other settings
      document.documentElement.lang = settings.language;
      
      // Configure UI elements based on settings
      if (!settings.showControls) {
        document.getElementById('controls-panel').classList.add('hidden');
      }
      
      if (!settings.enableSearch) {
        document.getElementById('search-container').classList.add('hidden');
      }
      
      if (!settings.enableTimeline) {
        document.getElementById('timeline-container').classList.add('hidden');
      }
      
      if (!settings.enableExport) {
        document.getElementById('export-button').classList.add('hidden');
      }
      
      // Toggle animation settings
      if (settings.animations) {
        document.body.classList.add('enable-animations');
      } else {
        document.body.classList.remove('enable-animations');
      }
      
      // Set biblical model data attribute for CSS styling
      document.body.setAttribute('data-biblical-model', settings.biblicalModel);
      
      console.log('Settings applied:', settings);
    }

    /**
     * Initialize the visualization component
     * @param {Object} data - The processed data to visualize
     */
    function initializeVisualization(data) {
      try {
        // Check if the visualization module is available
        if (typeof BiblicalVisualization !== 'undefined' && BiblicalVisualization) {
          // Create a container for the visualization if it doesn't exist
          let visualizationContainer = document.getElementById('visualization-container');
          if (!visualizationContainer) {
            visualizationContainer = document.createElement('div');
            visualizationContainer.id = 'visualization-container';
            document.getElementById('main-content').appendChild(visualizationContainer);
          }
          
          // Get dimensions for the visualization
          const containerWidth = visualizationContainer.clientWidth;
          const containerHeight = visualizationContainer.clientHeight || 600; // Default height
          
          // Configure visualization options
          const visualizationOptions = {
            width: containerWidth,
            height: containerHeight,
            theme: state.settings.theme,
            biblical_model: state.settings.biblicalModel,
            animations: state.settings.animations,
            nodeRadius: 15,
            nodeLabelFontSize: 12,
            linkStrokeWidth: 2,
            highlightColor: '#ff5722',
            maleColor: '#2196f3',
            femaleColor: '#e91e63',
            unknownGenderColor: '#9e9e9e',
            generationGap: 100,
            tooltips: {
              enabled: true,
              showDelay: 300,
              hideDelay: 500,
              position: 'top',
              offsetX: 0,
              offsetY: -10,
              backgroundColor: 'rgba(50, 50, 50, 0.8)',
              textColor: '#ffffff',
              fontSize: 12,
              padding: 8,
              borderRadius: 4,
              maxWidth: 250
            }
          };
          
          // Initialize the visualization
          BiblicalVisualization.init(visualizationContainer, data, visualizationOptions);
          
          // Set the initial view mode
          BiblicalVisualization.setViewMode(state.settings.initialView);
          
          // If auto-zoom is enabled, fit the visualization to the screen
          if (state.settings.autoZoom) {
            BiblicalVisualization.fitToScreen();
          }
          
          // Add window resize handler to update visualization on window resize
          window.addEventListener('resize', debounce(() => {
            const newWidth = visualizationContainer.clientWidth;
            const newHeight = visualizationContainer.clientHeight || 600;
            
            if (BiblicalVisualization.updateDimensions) {
              BiblicalVisualization.updateDimensions(newWidth, newHeight);
            }
          }, 250));
          
          console.log('Visualization initialized with options:', visualizationOptions);
        } else {
          throw new Error('Visualization module not loaded');
        }
      } catch (error) {
        console.error('Failed to initialize visualization:', error);
        showError('Visualization initialization failed: ' + error.message);
      }
    }

    /**
     * Setup event handlers for UI controls
     */
    function setupEventHandlers() {
      // Theme switcher
      const themeSwitch = document.getElementById('theme-switch');
      if (themeSwitch) {
        themeSwitch.checked = state.settings.theme === 'dark';
        themeSwitch.addEventListener('change', (e) => {
          const newTheme = e.target.checked ? 'dark' : 'light';
          state.settings.theme = newTheme;
          document.body.setAttribute('data-theme', newTheme);
          
          // Update visualization theme if available
          if (BiblicalVisualization && BiblicalVisualization.updateTheme) {
            BiblicalVisualization.updateTheme(newTheme);
          }
        });
      }
      
      // View mode selector
      const viewModeSelect = document.getElementById('view-mode-select');
      if (viewModeSelect) {
        viewModeSelect.value = state.settings.initialView;
        viewModeSelect.addEventListener('change', (e) => {
          const viewMode = e.target.value;
          if (BiblicalVisualization && BiblicalVisualization.setViewMode) {
            BiblicalVisualization.setViewMode(viewMode);
          }
        });
      }
      
      // Biblical model selector
      const biblicalModelSelect = document.getElementById('biblical-model-select');
      if (biblicalModelSelect) {
        biblicalModelSelect.value = state.settings.biblicalModel;
        biblicalModelSelect.addEventListener('change', (e) => {
          const model = e.target.value;
          state.settings.biblicalModel = model;
          document.body.setAttribute('data-biblical-model', model);
          
          // Update visualization if needed
          if (BiblicalVisualization && BiblicalVisualization.updateBiblicalModel) {
            BiblicalVisualization.updateBiblicalModel(model);
          }
        });
      }
      
      // Search functionality
      const searchInput = document.getElementById('search-input');
      const searchButton = document.getElementById('search-button');
      
      if (searchInput && searchButton) {
        searchButton.addEventListener('click', () => {
          performSearch(searchInput.value);
        });
        
        searchInput.addEventListener('keyup', (e) => {
          if (e.key === 'Enter') {
            performSearch(searchInput.value);
          }
        });
      }
      
      // Reset view button
      const resetViewButton = document.getElementById('reset-view-button');
      if (resetViewButton) {
        resetViewButton.addEventListener('click', () => {
          if (BiblicalVisualization && BiblicalVisualization.resetView) {
            BiblicalVisualization.resetView();
          }
        });
      }
      
      // Export data button
      const exportButton = document.getElementById('export-button');
      if (exportButton) {
        exportButton.addEventListener('click', () => {
          exportData();
        });
      }
      
      // Animation toggle
      const animationToggle = document.getElementById('animation-toggle');
      if (animationToggle) {
        animationToggle.checked = state.settings.animations;
        animationToggle.addEventListener('change', (e) => {
          state.settings.animations = e.target.checked;
          if (e.target.checked) {
            document.body.classList.add('enable-animations');
          } else {
            document.body.classList.remove('enable-animations');
          }
          
          // Update visualization animation settings
          if (BiblicalVisualization && BiblicalVisualization.toggleAnimations) {
            BiblicalVisualization.toggleAnimations(e.target.checked);
          }
        });
      }
      
      // Filter controls
      setupFilterHandlers();
      
      // Advanced filter button
      const advancedFilterButton = document.getElementById('advanced-filter-button');
      const advancedFilterPanel = document.getElementById('advanced-filter-panel');
      
      if (advancedFilterButton && advancedFilterPanel) {
        advancedFilterButton.addEventListener('click', () => {
          advancedFilterPanel.classList.toggle('hidden');
        });
      }
      
      // Info panel toggle
      const infoPanelToggle = document.getElementById('info-panel-toggle');
      const infoPanel = document.getElementById('info-panel');
      
      if (infoPanelToggle && infoPanel) {
        infoPanelToggle.addEventListener('click', () => {
          infoPanel.classList.toggle('hidden');
          infoPanelToggle.textContent = infoPanel.classList.contains('hidden') ? 'Show Info' : 'Hide Info';
        });
      }
      
      console.log('Event handlers set up successfully');
    }

    /**
     * Set up filter event handlers
     */
    function setupFilterHandlers() {
      // Gender filter
      const genderFilters = document.querySelectorAll('input[name="gender-filter"]');
      genderFilters.forEach(filter => {
        filter.addEventListener('change', () => {
          applyFilters();
        });
      });
      
      // Generation filter
      const generationRangeMin = document.getElementById('generation-range-min');
      const generationRangeMax = document.getElementById('generation-range-max');
      
      if (generationRangeMin && generationRangeMax) {
        [generationRangeMin, generationRangeMax].forEach(input => {
          input.addEventListener('change', () => {
            applyFilters();
          });
        });
      }
      
      // Clear filters button
      const clearFiltersButton = document.getElementById('clear-filters-button');
      if (clearFiltersButton) {
        clearFiltersButton.addEventListener('click', () => {
          // Reset all filter controls
          genderFilters.forEach(filter => {
            filter.checked = filter.value === 'all';
          });
          
          if (generationRangeMin) generationRangeMin.value = '';
          if (generationRangeMax) generationRangeMax.value = '';
          
          // Clear any active filters in the visualization
          if (BiblicalVisualization && BiblicalVisualization.resetFilters) {
            BiblicalVisualization.resetFilters();
          }
          
          // Clear search
          const searchInput = document.getElementById('search-input');
          if (searchInput) searchInput.value = '';
          
          // Clear search results display
          const searchResults = document.getElementById('search-results');
          if (searchResults) searchResults.textContent = '';
          
          const searchResultsList = document.getElementById('search-results-list');
          if (searchResultsList) searchResultsList.innerHTML = '';
        });
      }
    }

    /**
     * Apply all active filters to the visualization
     */
    function applyFilters() {
      // Get active gender filter
      const genderFilter = document.querySelector('input[name="gender-filter"]:checked').value;
      
      // Get generation range
      const minGeneration = document.getElementById('generation-range-min').value;
      const maxGeneration = document.getElementById('generation-range-max').value;
      
      // Build the filter function
      const filterFunction = (node) => {
        // Apply gender filter
        if (genderFilter !== 'all' && node.gender !== genderFilter) {
          return false;
        }
        
        // Apply generation filter if specified
        if (minGeneration !== '' && node.generation < parseInt(minGeneration)) {
          return false;
        }
        
        if (maxGeneration !== '' && node.generation > parseInt(maxGeneration)) {
          return false;
        }
        
        return true;
      };
      
      // Apply filter to visualization
      if (BiblicalVisualization && BiblicalVisualization.filterNodes) {
        BiblicalVisualization.filterNodes(filterFunction);
      }
    }

    /**
     * Perform a search in the genealogy data
     * @param {string} query - The search query
     */
    function performSearch(query) {
      if (!query.trim()) {
        // If query is empty, reset any filters
        if (BiblicalVisualization && BiblicalVisualization.resetFilters) {
          BiblicalVisualization.resetFilters();
        }
        
        // Clear search results display
        const searchResults = document.getElementById('search-results');
        if (searchResults) searchResults.textContent = '';
        
        const searchResultsList = document.getElementById('search-results-list');
        if (searchResultsList) searchResultsList.innerHTML = '';
        
        return;
      }
      
      try {
        // Normalize the query
        const normalizedQuery = query.trim().toLowerCase();
        
        // Search through nodes
        const results = [];
        if (state.data && state.data.nodes) {
          state.data.nodes.forEach(node => {
            const name = node.name ? node.name.toLowerCase() : '';
            const description = node.description ? node.description.toLowerCase() : '';
            const biblical_reference = node.biblical_reference ? node.biblical_reference.toLowerCase() : '';
            
            if (name.includes(normalizedQuery) || 
                description.includes(normalizedQuery) || 
                biblical_reference.includes(normalizedQuery)) {
              results.push(node);
            }
          });
        }
        
        // Display results count
        const searchResultsElement = document.getElementById('search-results');
        if (searchResultsElement) {
          searchResultsElement.textContent = `Found ${results.length} matches`;
        }
        
        // Highlight matching nodes in the visualization
        if (BiblicalVisualization && BiblicalVisualization.highlightNodes) {
          BiblicalVisualization.highlightNodes(results);
        }
        
        // Populate search results list
        displaySearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        const searchResultsElement = document.getElementById('search-results');
        if (searchResultsElement) {
          searchResultsElement.textContent = 'Search failed: ' + error.message;
        }
      }
    }

    /**
     * Display search results in the UI
     * @param {Array} results - The search results to display
     */
    function displaySearchResults(results) {
      const resultsContainer = document.getElementById('search-results-list');
      if (!resultsContainer) return;
      
      resultsContainer.innerHTML = '';
      
      if (results.length === 0) {
        resultsContainer.innerHTML = '<p>No results found</p>';
        return;
      }
      
      const list = document.createElement('ul');
      list.className = 'search-results-list';
      
      results.forEach(result => {
        const item = document.createElement('li');
        item.className = 'search-result-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'result-name';
        nameSpan.textContent = result.name || 'Unknown';
        
        const detailsSpan = document.createElement('span');
        detailsSpan.className = 'result-details';
        
        // Add gender icon if available
        if (result.gender) {
          const genderIcon = document.createElement('span');
          genderIcon.className = `gender-icon gender-${result.gender}`;
          genderIcon.textContent = result.gender === 'male' ? '♂' : result.gender === 'female' ? '♀' : '?';
          detailsSpan.appendChild(genderIcon);
        }
        
        // Add generation if available
        if (result.generation !== undefined) {
          const generationSpan = document.createElement('span');
          generationSpan.className = 'generation-indicator';
          generationSpan.textContent = `Gen: ${result.generation}`;
          detailsSpan.appendChild(generationSpan);
        }
        
        // Add biblical reference if available
        if (result.biblical_reference) {
          const referenceSpan = document.createElement('span');
          referenceSpan.className = 'biblical-reference';
          referenceSpan.textContent = result.biblical_reference;
          detailsSpan.appendChild(referenceSpan);
        }
        
        item.appendChild(nameSpan);
        item.appendChild(detailsSpan);
        
        // Add click event to focus on this node
        item.addEventListener('click', () => {
          // Navigate to this node in the visualization
          if (BiblicalVisualization && BiblicalVisualization.focusNode) {
            BiblicalVisualization.focusNode(result.id);
          }
        });
        
        list.appendChild(item);
      });
      
      resultsContainer.appendChild(list);
    }

    /**
     * Export the current dataset to a downloadable file
     */
    function exportData() {
      try {
        if (!state.data) {
          throw new Error('No data available to export');
        }
        
        if (GenealogyDataUtils && GenealogyDataUtils.exportDataToJson) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          GenealogyDataUtils.exportDataToJson(state.data, `biblical-genealogy-export-${timestamp}.json`);
        } else {
          throw new Error('Export utility not available');
        }
      } catch (error) {
        console.error('Export failed:', error);
        showError('Failed to export data: ' + error.message);
      }
    }

    /**
     * Perform initial analysis on the dataset to gather statistics
     * @param {Object} data - The data to analyze
     */
    function analyzeDataset(data) {
      if (!data || !data.nodes || !data.links) {
        console.warn('Invalid data structure provided for analysis');
        return;
      }
      
      const stats = {
        totalPersons: data.nodes.length,
        totalRelationships: data.links.length,
        generations: new Set(),
        maleCount: 0,
        femaleCount: 0,
        unknownGenderCount: 0,
        withBiblicalReference: 0,
        withDescription: 0
      };
      
      // Get min and max years if available
      let minYear = Infinity;
      let maxYear = -Infinity;
      let personsWithYears = 0;
      
      // Count genders, generations, and other attributes
      data.nodes.forEach(node => {
        // Count by gender
        if (node.gender === 'male') stats.maleCount++;
        else if (node.gender === 'female') stats.femaleCount++;
        else stats.unknownGenderCount++;
        
        // Track generations
        if (node.generation !== undefined) {
          stats.generations.add(node.generation);
        }
        
        // Count nodes with biblical references
        if (node.biblical_reference) {
          stats.withBiblicalReference++;
        }
        
        // Count nodes with descriptions
        if (node.description && node.description.trim() !== '') {
          stats.withDescription++;
        }
        
        // Track year information if available
        if (node.birth_year) {
          personsWithYears++;
          minYear = Math.min(minYear, node.birth_year);
        }
        
        if (node.death_year) {
          personsWithYears++;
          maxYear = Math.max(maxYear, node.death_year);
        }
      });
      
      // Adjust year range if no years were found
      if (minYear === Infinity) minYear = null;
      if (maxYear === -Infinity) maxYear = null;
      
      // Get relationship types
      const relationshipTypes = {};
      data.links.forEach(link => {
        const type = link.relationship || 'unknown';
        relationshipTypes[type] = (relationshipTypes[type] || 0) + 1;
      });
      
      // Complete stats object
      stats.yearRange = minYear && maxYear ? `${minYear} to ${maxYear}` : 'Unknown';
      stats.personsWithYears = personsWithYears;
      stats.relationshipTypes = relationshipTypes;
      stats.generationCount = stats.generations.size;
      stats.generationsList = Array.from(stats.generations).sort((a, b) => a - b);
      
      // Log the statistics
      console.log('Dataset Analysis:', stats);
      
      // Update the UI with statistics if elements exist
      const updateStatElement = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      };
      
      updateStatElement('stat-total-persons', stats.totalPersons);
      updateStatElement('stat-total-relationships', stats.totalRelationships);
      updateStatElement('stat-generations', stats.generationCount);
      updateStatElement('stat-males', stats.maleCount);
      updateStatElement('stat-females', stats.femaleCount);
      updateStatElement('stat-year-range', stats.yearRange);
      updateStatElement('stat-biblical-references', stats.withBiblicalReference);
      
      // Populate relationship type breakdown if element exists
      const relationshipBreakdownElement = document.getElementById('relationship-breakdown');
      if (relationshipBreakdownElement) {
        let html = '<ul>';
        Object.entries(relationshipTypes)
          .sort((a, b) => b[1] - a[1]) // Sort by count descending
          .forEach(([type, count]) => {
            html += `<li><span class="relationship-type">${type}</span>: <span class="relationship-count">${count}</span></li>`;
          });
        html += '</ul>';
        relationshipBreakdownElement.innerHTML = html;
      }
      
      return stats;
    }

    /**
     * Update the loading state of the application
     * @param {boolean} isLoading - Whether the app is in a loading state
     * @param {string} message - Optional message to display
     */
    function updateLoadingState(isLoading, message = '') {
      state.loading = isLoading;
      const loadingElement = document.getElementById('loading-indicator');
      
      if (!loadingElement) {
        console.warn('Loading indicator element not found');
        return;
      }
      
      if (isLoading) {
        loadingElement.classList.remove('hidden');
        const messageElement = loadingElement.querySelector('.message');
        if (messageElement) {
          messageElement.textContent = message;
        }
      } else {
        loadingElement.classList.add('hidden');
      }
    }

    /**
     * Display an error message to the user
     * @param {string} message - The error message to display
     */
    function showError(message) {
      console.error('Application error:', message);
      const errorElement = document.getElementById('error-message');
      
      if (!errorElement) {
        console.warn('Error message element not found');
        return;
      }
      
      errorElement.textContent = message;
      errorElement.classList.remove('hidden');
      
      // Hide the error after a timeout
      setTimeout(() => {
        errorElement.classList.add('hidden');
      }, 7000);
    }

    /**
     * Creates a debounced function that delays invoking the provided function
     * @param {Function} func - The function to debounce
     * @param {number} wait - The delay in milliseconds
     * @return {Function} - The debounced function
     */
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // Return the public API
    return {
      init: initialize,
      loadSettings,
      performSearch,
      exportData,
      getState: () => ({ ...state }),
      applyFilters,
      resetFilters: () => {
        if (BiblicalVisualization && BiblicalVisualization.resetFilters) {
          BiblicalVisualization.resetFilters();
        }
      },
      updateVisualization: (newData) => {
        if (BiblicalVisualization && BiblicalVisualization.updateData) {
          BiblicalVisualization.updateData(newData);
        }
      }
    };
  })();
}

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BiblicalGenealogyApp;
}

// Initialize the application when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing application.');
  if (typeof BiblicalGenealogyApp !== 'undefined' && BiblicalGenealogyApp.init) {
    try {
      BiblicalGenealogyApp.init();
    } catch (error) {
      console.error('Error during BiblicalGenealogyApp initialization:', error);
    }
  } else {
    console.error('BiblicalGenealogyApp not properly initialized');
  }
});