/**
 * visualization.js - Core visualization logic for Biblical Genealogy data
 * 
 * Handles transformation of processed genealogy data into visualizable structures,
 * manages layouts, and prepares data for rendering with D3 or other renderers.
 * 
 * @version 2.0.0
 */

// Prevent redeclaration by checking if the class already exists
if (!window.GenealogyVisualization) {
  // Define the class if it doesn't exist yet
  window.GenealogyVisualization = class GenealogyVisualization {
      /**
       * Constructor for Genealogy Visualization
       * @param {Object} options - Configuration options
       */
      constructor(options = {}) {
          // Initialize with default settings, overridden by provided options
          this.settings = this._mergeSettings(options);
          
          // Setup core properties
          this.data = {
              originalNodes: [],
              originalLinks: [],
              nodes: [],
              links: [],
              filteredNodes: [],
              filteredLinks: [],
              visibleNodes: [],
              visibleLinks: [],
              nodeMap: new Map(),
              layoutCache: new Map()
          };
         

      
      // Track view state
      this.viewState = {
        transform: { x: 0, y: 0, k: 1 },
        selectedNodes: new Set(),
        highlightedNodes: new Set(),
        expandedNodes: new Set(),
        collapsedNodes: new Set(),
        filters: {},
        activeLayout: this.settings.visualization.layout.type,
        lastRenderTime: 0,
        isAnimating: false,
        isDragging: false,
        isZooming: false
      };
      
      // Setup event handling
      this.events = {
        handlers: new Map(),
        queue: []
      };
      
      // Performance tracking
      this.performance = {
        lastRenderTime: 0,
        frameTime: 0,
        layoutTime: 0,
        filterTime: 0,
        renderCount: 0
      };
      
      // Initialize performance tracking
      if (window.DebugUtils) {
        window.DebugUtils.startTimer('visualization-init');
      }
      
      // Register standard event handlers
      this._registerEventHandlers();
      
      // Register window resize handler
      window.addEventListener('resize', this._debounce(this.resize.bind(this), 250));
      
      // Finish initialization
      if (window.DebugUtils) {
        window.DebugUtils.endTimer('visualization-init');
        window.DebugUtils.info('Genealogy Visualization initialized', this.settings);
      }
    }
    
    /**
     * Load and process data for visualization
     * @param {Object|Array} data - Raw or processed genealogy data
     * @returns {Promise} - Promise that resolves when data is loaded and processed
     */
    async loadData(data) {
      // Start performance tracking
      if (window.DebugUtils) {
        window.DebugUtils.startTimer('visualization-load-data');
        window.DebugUtils.info('Loading visualization data', { dataSize: typeof data === 'object' ? Object.keys(data).length : 'unknown' });
      }
      
      try {
        // Reset data state
        this._resetDataState();
        
        // Process incoming data based on its format
        if (Array.isArray(data)) {
          // Assume data is already in nodes/links format
          if (data.length > 0 && 'nodes' in data[0] && 'links' in data[0]) {
            // Collection of graph datasets
            this.data.originalNodes = data.flatMap(d => d.nodes || []);
            this.data.originalLinks = data.flatMap(d => d.links || []);
          } else if (data.length > 0 && ('id' in data[0] || 'source' in data[0])) {
            // Direct nodes or links array
            if ('id' in data[0]) {
              this.data.originalNodes = [...data];
            } else {
              this.data.originalLinks = [...data];
              // Extract nodes from links
              this._extractNodesFromLinks();
            }
          } else {
            throw new Error('Unrecognized data array format');
          }
        } else if (typeof data === 'object') {
          // Object format with nodes and links
          if ('nodes' in data && Array.isArray(data.nodes)) {
            this.data.originalNodes = [...data.nodes];
          }
          if ('links' in data && Array.isArray(data.links)) {
            this.data.originalLinks = [...data.links];
          }
          if (this.data.originalNodes.length === 0 && this.data.originalLinks.length === 0) {
            throw new Error('No usable nodes or links found in data object');
          }
          
          // Extract nodes from links if needed
          if (this.data.originalNodes.length === 0 && this.data.originalLinks.length > 0) {
            this._extractNodesFromLinks();
          }
        } else {
          throw new Error('Unsupported data format');
        }
        
        // Build node map for faster lookups
        this._buildNodeMap();
        
        // Process nodes and links into visualization-ready format
        await this._processData();
        
        // Calculate initial layout
        await this.applyLayout(this.settings.visualization.layout.type);
        
        // Apply initial filters
        this.applyFilters(this.viewState.filters);
        
        // Trigger data loaded event
        this.trigger('dataLoaded', {
          nodeCount: this.data.nodes.length,
          linkCount: this.data.links.length,
          visibleNodeCount: this.data.visibleNodes.length,
          visibleLinkCount: this.data.visibleLinks.length
        });
        
        if (window.DebugUtils) {
          window.DebugUtils.endTimer('visualization-load-data');
          window.DebugUtils.info('Visualization data loaded', {
            nodeCount: this.data.nodes.length,
            linkCount: this.data.links.length
          });
        }
        
        return {
          nodes: this.data.visibleNodes,
          links: this.data.visibleLinks
        };
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to load visualization data', error);
          window.DebugUtils.endTimer('visualization-load-data');
        }
        this.trigger('error', { message: 'Failed to load data', error });
        throw error;
      }
    }
    
    /**
     * Apply a specific layout algorithm to the data
     * @param {string} layoutType - Type of layout to apply
     * @param {Object} options - Layout-specific options
     * @returns {Promise} - Resolves when layout is complete
     */
    async applyLayout(layoutType, options = {}) {
      // Start performance tracking
      if (window.DebugUtils) {
        window.DebugUtils.startTimer(`layout-${layoutType}`);
      }
      
      try {
        // Check for valid layout type
        const availableLayouts = [
          this.settings.visualization.layout.type,
          ...this.settings.visualization.layout.alternativeLayouts
        ];
        
        if (!availableLayouts.includes(layoutType)) {
          throw new Error(`Unsupported layout type: ${layoutType}`);
        }
        
        // Update active layout
        this.viewState.activeLayout = layoutType;
        
        // Check if we have a cached layout
        const cacheKey = this._getLayoutCacheKey(layoutType, options);
        if (this.data.layoutCache.has(cacheKey)) {
          const cachedLayout = this.data.layoutCache.get(cacheKey);
          // Apply cached positions to current nodes
          this.data.nodes.forEach(node => {
            if (cachedLayout.positions.has(node.id)) {
              const position = cachedLayout.positions.get(node.id);
              node.x = position.x;
              node.y = position.y;
              node.targetX = position.x;
              node.targetY = position.y;
            }
          });
          
          if (window.DebugUtils) {
            window.DebugUtils.info('Applied cached layout', { 
              layoutType, 
              nodeCount: this.data.nodes.length,
              cacheHit: true
            });
            window.DebugUtils.endTimer(`layout-${layoutType}`);
          }
          
          this.trigger('layoutApplied', { 
            layoutType, 
            nodeCount: this.data.nodes.length,
            fromCache: true
          });
          
          return;
        }
        
        // Apply the appropriate layout algorithm
        let layoutResult;
        switch (layoutType) {
          case 'hierarchical':
            layoutResult = await this._applyHierarchicalLayout(options);
            break;
          case 'force-directed':
            layoutResult = await this._applyForceDirectedLayout(options);
            break;
          case 'radial':
            layoutResult = await this._applyRadialLayout(options);
            break;
          case 'timeline':
            layoutResult = await this._applyTimelineLayout(options);
            break;
          default:
            layoutResult = await this._applyHierarchicalLayout(options);
        }
        
        // Cache the layout result
        if (layoutResult && layoutResult.positions) {
          this.data.layoutCache.set(cacheKey, layoutResult);
        }
        
        // Update filter state after layout to ensure visibility rules are applied
        this._updateFilteredData();
        
        // Trigger layout applied event
        this.trigger('layoutApplied', { 
          layoutType, 
          nodeCount: this.data.nodes.length,
          fromCache: false
        });
        
        if (window.DebugUtils) {
          window.DebugUtils.endTimer(`layout-${layoutType}`);
          window.DebugUtils.info('Applied layout', { 
            layoutType, 
            nodeCount: this.data.nodes.length,
            duration: window.DebugUtils.getPerformanceData().timers.find(t => t.name === `layout-${layoutType}`)?.duration || 0
          });
        }
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to apply layout', { layoutType, error });
          window.DebugUtils.endTimer(`layout-${layoutType}`);
        }
        this.trigger('error', { message: `Failed to apply ${layoutType} layout`, error });
        throw error;
      }
    }
    
    /**
     * Apply filters to the dataset
     * @param {Object} filters - Filter criteria
     * @returns {Object} - Filtered data
     */
    applyFilters(filters = {}) {
      if (window.DebugUtils) {
        window.DebugUtils.startTimer('apply-filters');
        window.DebugUtils.info('Applying filters', filters);
      }
      
      try {
        // Store the filters
        this.viewState.filters = { ...filters };
        
        // Update filtered data
        this._updateFilteredData();
        
        // Update visible data based on filters and view state
        this._updateVisibleData();
        
        // Trigger filters applied event
        this.trigger('filtersApplied', {
          filters: this.viewState.filters,
          nodeCount: this.data.filteredNodes.length,
          linkCount: this.data.filteredLinks.length,
          visibleNodeCount: this.data.visibleNodes.length,
          visibleLinkCount: this.data.visibleLinks.length
        });
        
        if (window.DebugUtils) {
          window.DebugUtils.endTimer('apply-filters');
        }
        
        return {
          nodes: this.data.visibleNodes,
          links: this.data.visibleLinks
        };
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to apply filters', error);
          window.DebugUtils.endTimer('apply-filters');
        }
        this.trigger('error', { message: 'Failed to apply filters', error });
        throw error;
      }
    }
    
    /**
     * Select one or more nodes by ID
     * @param {string|Array} nodeIds - Node ID(s) to select
     * @param {boolean} exclusive - Whether to clear previous selection
     * @returns {Set} - Set of selected node IDs
     */
    selectNodes(nodeIds, exclusive = true) {
      if (window.DebugUtils) {
        window.DebugUtils.debug('Selecting nodes', { nodeIds, exclusive });
      }
      
      try {
        // Convert single ID to array
        const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        
        // Clear previous selection if exclusive
        if (exclusive) {
          this.viewState.selectedNodes.clear();
        }
        
        // Add new selected nodes
        ids.forEach(id => {
          this.viewState.selectedNodes.add(id);
        });
        
        // Reset highlights
        this.viewState.highlightedNodes.clear();
        
        // Highlight related nodes if configured
        if (this.settings.visualization.interaction.selection.highlightRelated) {
          const depth = this.settings.visualization.interaction.selection.highlightDepth || 1;
          this._highlightRelatedNodes(Array.from(this.viewState.selectedNodes), depth);
        }
        
        // Update visible data to reflect selection changes
        this._updateVisibleData();
        
        // Trigger selection event
        this.trigger('nodeSelected', {
          selectedNodes: Array.from(this.viewState.selectedNodes),
          highlightedNodes: Array.from(this.viewState.highlightedNodes)
        });
        
        return this.viewState.selectedNodes;
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to select nodes', error);
        }
        this.trigger('error', { message: 'Failed to select nodes', error });
        throw error;
      }
    }
    
    /**
     * Expand a node to show its connections
     * @param {string} nodeId - ID of node to expand
     * @returns {Array} - New visible nodes
     */
    expandNode(nodeId) {
      if (window.DebugUtils) {
        window.DebugUtils.debug('Expanding node', { nodeId });
      }
      
      try {
        // Add to expanded nodes set
        this.viewState.expandedNodes.add(nodeId);
        
        // Remove from collapsed nodes if present
        this.viewState.collapsedNodes.delete(nodeId);
        
        // Find connected nodes
        const connectedNodes = this._findConnectedNodes(nodeId);
        
        // Update visible data
        this._updateVisibleData();
        
        // Trigger event
        this.trigger('nodeExpanded', {
          nodeId,
          connectedNodes
        });
        
        return connectedNodes;
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to expand node', error);
        }
        this.trigger('error', { message: 'Failed to expand node', error });
        throw error;
      }
    }
    
    /**
     * Collapse a node to hide its connections
     * @param {string} nodeId - ID of node to collapse
     * @returns {Array} - Hidden nodes
     */
    collapseNode(nodeId) {
      if (window.DebugUtils) {
        window.DebugUtils.debug('Collapsing node', { nodeId });
      }
      
      try {
        // Add to collapsed nodes set
        this.viewState.collapsedNodes.add(nodeId);
        
        // Remove from expanded nodes if present
        this.viewState.expandedNodes.delete(nodeId);
        
        // Find nodes that will be hidden
        const connectedNodes = this._findConnectedNodes(nodeId);
        const hiddenNodes = connectedNodes.filter(id => {
          // Node is hidden if no other visible node connects to it
          const otherConnections = this._findConnectedNodes(id).filter(
            connId => connId !== nodeId && !this.viewState.collapsedNodes.has(connId)
          );
          return otherConnections.length === 0;
        });
        
        // Update visible data
        this._updateVisibleData();
        
        // Trigger event
        this.trigger('nodeCollapsed', {
          nodeId,
          hiddenNodes
        });
        
        return hiddenNodes;
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to collapse node', error);
        }
        this.trigger('error', { message: 'Failed to collapse node', error });
        throw error;
      }
    }
    
    /**
     * Focus the view on specific node(s)
     * @param {string|Array} nodeIds - Node ID(s) to focus on
     * @param {Object} options - Focus options
     * @returns {Object} - New transform
     */
    focusNodes(nodeIds, options = {}) {
      if (window.DebugUtils) {
        window.DebugUtils.debug('Focusing on nodes', { nodeIds, options });
      }
      
      try {
        // Convert single ID to array
        const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds];
        
        // Find nodes in current dataset
        const nodesToFocus = this.data.visibleNodes.filter(node => ids.includes(node.id));
        
        if (nodesToFocus.length === 0) {
          if (window.DebugUtils) {
            window.DebugUtils.warn('No visible nodes found to focus on', { requestedIds: ids });
          }
          return this.viewState.transform;
        }
        
        // Calculate bounding box of nodes
        const bounds = this._calculateNodesBounds(nodesToFocus);
        
        // Calculate new transform
        const viewportWidth = this.settings.width || window.innerWidth;
        const viewportHeight = this.settings.height || window.innerHeight;
        
        // Add padding
        const padding = options.padding || 50;
        bounds.x1 -= padding;
        bounds.y1 -= padding;
        bounds.x2 += padding;
        bounds.y2 += padding;
        
        // Calculate scale to fit
        const scaleX = viewportWidth / (bounds.x2 - bounds.x1);
        const scaleY = viewportHeight / (bounds.y2 - bounds.y1);
        let scale = Math.min(scaleX, scaleY);
        
        // Enforce min/max scale limits
        const minScale = this.settings.visualization.interaction.zoom.minScale || 0.1;
        const maxScale = this.settings.visualization.interaction.zoom.maxScale || 10;
        scale = Math.max(minScale, Math.min(maxScale, scale));
        
        // Calculate center position
        const centerX = (bounds.x1 + bounds.x2) / 2;
        const centerY = (bounds.y1 + bounds.y2) / 2;
        
        // Calculate transform
        const transform = {
          x: viewportWidth / 2 - centerX * scale,
          y: viewportHeight / 2 - centerY * scale,
          k: scale
        };
        
        // Update view state
        this.viewState.transform = transform;
        
        // Trigger transform event
        this.trigger('transformChanged', {
          transform: this.viewState.transform,
          reason: 'focus',
          animated: options.animate !== false
        });
        
        return transform;
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error('Failed to focus on nodes', error);
        }
        this.trigger('error', { message: 'Failed to focus on nodes', error });
        throw error;
      }
    }
    
    /**
     * Handle window or container resize
     * @param {Object} dimensions - New dimensions
     */
    resize(dimensions = {}) {
      const width = dimensions.width || window.innerWidth;
      const height = dimensions.height || window.innerHeight;
      
      if (window.DebugUtils) {
        window.DebugUtils.debug('Resizing visualization', { width, height });
      }
      
      // Update settings
      this.settings.width = width;
      this.settings.height = height;
      
      // Trigger resize event
      this.trigger('resize', { width, height });
    }
  /**
   * Register an event handler
   * @param {string} eventName - Name of event
   * @param {Function} handler - Event handler function
   * @returns {GenealogyVisualization} - For chaining
   */
  on(eventName, handler) {
    if (!this.events.handlers.has(eventName)) {
      this.events.handlers.set(eventName, []);
    }
    this.events.handlers.get(eventName).push(handler);
    return this;
  }
  
  /**
   * Remove an event handler
   * @param {string} eventName - Name of event
   * @param {Function} handler - Event handler function to remove
   * @returns {GenealogyVisualization} - For chaining
   */
  off(eventName, handler) {
    if (!this.events.handlers.has(eventName)) {
      return this;
    }
    
    const handlers = this.events.handlers.get(eventName);
    const index = handlers.indexOf(handler);
    
    if (index !== -1) {
      handlers.splice(index, 1);
    }
    
    return this;
  }
  
  /**
   * Trigger an event
   * @param {string} eventName - Name of event
   * @param {Object} data - Event data
   */
  trigger(eventName, data = {}) {
    // Queue event if no handlers are registered yet
    if (!this.events.handlers.has(eventName) || this.events.handlers.get(eventName).length === 0) {
      this.events.queue.push({ eventName, data });
      return;
    }
    
    // Execute handlers
    const handlers = this.events.handlers.get(eventName);
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        if (window.DebugUtils) {
          window.DebugUtils.error(`Error in event handler for ${eventName}`, error);
        }
        console.error(`Error in visualization event handler for ${eventName}:`, error);
      }
    });
  }
  
  /**
   * Get current visualization data
   * @returns {Object} - Current data state
   */
  getData() {
    return {
      nodes: this.data.visibleNodes,
      links: this.data.visibleLinks,
      filteredCount: {
        nodes: this.data.filteredNodes.length - this.data.visibleNodes.length,
        links: this.data.filteredLinks.length - this.data.visibleLinks.length
      },
      totalCount: {
        nodes: this.data.nodes.length,
        links: this.data.links.length
      }
    };
  }
  
  /**
   * Get current view state
   * @returns {Object} - Current view state
   */
  getViewState() {
    return { ...this.viewState };
  }
  
  /**
   * Export current visualization to specified format
   * @param {string} format - Export format (png, svg, json, csv)
   * @param {Object} options - Export options
   * @returns {Promise} - Resolves with export data
   */
  async exportVisualization(format, options = {}) {
    if (window.DebugUtils) {
      window.DebugUtils.startTimer(`export-${format}`);
      window.DebugUtils.info(`Exporting visualization as ${format}`, options);
    }
    
    try {
      let result;
      
      switch (format.toLowerCase()) {
        case 'json':
          result = this._exportToJson(options);
          break;
        case 'csv':
          result = this._exportToCsv(options);
          break;
        case 'png':
        case 'svg':
          // These generally handled by the renderer
          this.trigger('exportRequested', { format, options });
          return null;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
      
      this.trigger('exported', { format, result });
      
      if (window.DebugUtils) {
        window.DebugUtils.endTimer(`export-${format}`);
      }
      
      return result;
    } catch (error) {
      if (window.DebugUtils) {
        window.DebugUtils.error(`Failed to export as ${format}`, error);
        window.DebugUtils.endTimer(`export-${format}`);
      }
      this.trigger('error', { message: `Failed to export as ${format}`, error });
      throw error;
    }
  }
  
  /**
   * Update the rendering settings
   * @param {Object} settings - New settings
   */
  updateSettings(settings = {}) {
    this.settings = this._mergeSettings(settings);
    this.trigger('settingsUpdated', { settings: this.settings });
    
    // Re-apply layout and filters if needed
    if (settings.visualization && (settings.visualization.layout || settings.visualization.nodes || settings.visualization.links)) {
      this.applyLayout(this.viewState.activeLayout);
    }
    
    if (settings.visualization && settings.visualization.filters) {
      this.applyFilters(this.viewState.filters);
    }
  }
  
  /**
   * Search for nodes matching criteria
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Array} - Matching nodes
   */
  search(query, options = {}) {
    if (!query || query.trim() === '') {
      return [];
    }
    
    if (window.DebugUtils) {
      window.DebugUtils.startTimer('search');
      window.DebugUtils.debug('Searching nodes', { query, options });
    }
    
    try {
      const searchOptions = {
        fields: this.settings.visualization.interaction.search.searchFields || ['name', 'description'],
        fuzzy: this.settings.visualization.interaction.search.fuzzyMatch !== false,
        maxResults: this.settings.visualization.interaction.search.maxResults || 20,
        ...options
      };
      
      // Case insensitive search
      const normalizedQuery = query.toLowerCase().trim();
      
      // Track scores for each node
      const scoreMap = new Map();
      
      // Search implementation
      for (const node of this.data.nodes) {
        let score = 0;
        
        for (const field of searchOptions.fields) {
          if (node[field]) {
            const value = String(node[field]).toLowerCase();
            
            // Exact match has highest score
            if (value === normalizedQuery) {
              score += 10;
              continue;
            }
            
            // Contains match
            if (value.includes(normalizedQuery)) {
              // Higher score for shorter fields (more precise match)
              score += 5 * (normalizedQuery.length / value.length);
              continue;
            }
            
            // Fuzzy match if enabled
            if (searchOptions.fuzzy) {
              // Simple fuzzy match - calculate Levenshtein distance
              const distance = this._levenshteinDistance(value, normalizedQuery);
              if (distance < normalizedQuery.length / 2) {
                // Score inversely proportional to distance
                score += Math.max(0, 3 - (distance / normalizedQuery.length) * 3);
              }
            }
          }
        }
        
        // Save non-zero scores
        if (score > 0) {
          scoreMap.set(node.id, score);
        }
      }
      
      // Sort by score and limit results
      const results = Array.from(scoreMap.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by score descending
        .slice(0, searchOptions.maxResults) // Limit to max results
        .map(([id, score]) => {
          const node = this.data.nodeMap.get(id);
          return { 
            ...node, 
            score,
            visible: this.data.visibleNodes.some(n => n.id === id) 
          };
        });
      
      if (window.DebugUtils) {
        window.DebugUtils.endTimer('search');
        window.DebugUtils.debug('Search results', { 
          query, 
          resultsCount: results.length,
          duration: window.DebugUtils.getPerformanceData().timers.find(t => t.name === 'search')?.duration || 0
        });
      }
      
      this.trigger('searchResults', { 
        query, 
        results,
        resultsCount: results.length 
      });
      
      return results;
    } catch (error) {
      if (window.DebugUtils) {
        window.DebugUtils.error('Search failed', error);
        window.DebugUtils.endTimer('search');
      }
      this.trigger('error', { message: 'Search failed', error });
      return [];
    }
  }
  
  /**
   * Get statistics about the current visualization
   * @returns {Object} - Visualization statistics
   */
  getStatistics() {
    // Calculate various statistics about the dataset
    const stats = {
      nodes: {
        total: this.data.nodes.length,
        filtered: this.data.filteredNodes.length,
        visible: this.data.visibleNodes.length,
        selected: this.viewState.selectedNodes.size,
        expanded: this.viewState.expandedNodes.size,
        collapsed: this.viewState.collapsedNodes.size,
        byAttribute: {}
      },
      links: {
        total: this.data.links.length,
        filtered: this.data.filteredLinks.length,
        visible: this.data.visibleLinks.length,
        byType: {}
      },
      layout: {
        type: this.viewState.activeLayout,
        performance: {
          lastLayoutTime: this.performance.layoutTime,
          averageFrameTime: this.performance.frameTime
        }
      },
      performance: { ...this.performance }
    };
    
    // Calculate node distributions
    this._calculateAttributeDistribution(stats);
    
    return stats;
  }
  
  /** PRIVATE METHODS **/
  
  /**
   * Merges provided settings with defaults
   * @param {Object} options - User provided settings
   * @returns {Object} - Complete settings object
   * @private
   */
  _mergeSettings(options) {
    // Get default settings either from global config or use sensible defaults
    const defaultSettings = window.appSettings?.visualization || {
      width: window.innerWidth,
      height: window.innerHeight,
      visualization: {
        layout: {
          type: 'hierarchical',
          alternativeLayouts: ['force-directed', 'radial', 'timeline'],
          orientation: 'horizontal',
          nodeSeparation: 150,
          levelSeparation: 200
        },
        nodes: {
          defaultSize: 10,
          sizeRange: [5, 20],
          defaultColor: '#3498db'
        },
        links: {
          defaultWidth: 1.5,
          style: 'curved'
        },
        interaction: {
          zoom: {
            enabled: true,
            minScale: 0.1,
            maxScale: 10
          },
          selection: {
            enabled: true,
            highlightRelated: true,
            highlightDepth: 1
          }
        },
        filters: {}
      }
    };
    
    // Deep merge settings
    return this._deepMerge(defaultSettings, options);
  }
  
  /**
   * Deep merge two objects
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} - Merged object
   * @private
   */
  _deepMerge(target, source) {
    if (!source) return target;
    
    const output = { ...target };
    
    for (const key in source) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        output[key] = this._deepMerge(target[key], source[key]);
      } else {
        output[key] = source[key];
      }
    }
    
    return output;
  }
  
  /**
   * Reset data state to defaults
   * @private
   */
  _resetDataState() {
    this.data.originalNodes = [];
    this.data.originalLinks = [];
    this.data.nodes = [];
    this.data.links = [];
    this.data.filteredNodes = [];
    this.data.filteredLinks = [];
    this.data.visibleNodes = [];
    this.data.visibleLinks = [];
    this.data.nodeMap.clear();
    
    // Keep layout cache
    
    // Reset view state
    this.viewState.selectedNodes.clear();
    this.viewState.highlightedNodes.clear();
    this.viewState.expandedNodes.clear();
    this.viewState.collapsedNodes.clear();
    this.viewState.filters = {};
  }
  
  /**
   * Extract nodes from links
   * @private
   */
  _extractNodesFromLinks() {
    const nodeSet = new Set();
    
    // Extract unique node IDs from links
    this.data.originalLinks.forEach(link => {
      nodeSet.add(link.source);
      nodeSet.add(link.target);
    });
    
    // Create basic node objects
    this.data.originalNodes = Array.from(nodeSet).map(id => ({
      id,
      name: id
    }));
    
    if (window.DebugUtils) {
      window.DebugUtils.info('Extracted nodes from links', { nodeCount: this.data.originalNodes.length });
    }
  }
  
  /**
   * Build node map for fast lookups
   * @private
   */
  _buildNodeMap() {
    this.data.nodeMap.clear();
    
    for (const node of this.data.originalNodes) {
      this.data.nodeMap.set(node.id, node);
    }
  }
  
  /**
   * Process data into visualization-ready format
   * @private
   */
  async _processData() {
    if (window.DebugUtils) {
      window.DebugUtils.startTimer('process-data');
    }
    
    try {
      // Process nodes
      this.data.nodes = this.data.originalNodes.map(node => ({
        // Copy original properties
        ...node,
        // Add required visualization properties
        size: node.size || this._calculateNodeSize(node),
        color: node.color || this._calculateNodeColor(node),
        // Position placeholders (will be set by layout)
        x: node.x || 0,
        y: node.y || 0,
        targetX: node.x || 0,
        targetY: node.y || 0,
        // Visibility flag
        visible: true
      }));
      
      // Process links
      this.data.links = this.data.originalLinks.map(link => {
        // Ensure source and target are objects, not just IDs
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        return {
          // Copy original properties
          ...link,
          // Ensure source and target are consistent
          source: sourceId,
          target: targetId,
          // Add required visualization properties
          width: link.width || this._calculateLinkWidth(link),
          color: link.color || this._calculateLinkColor(link),
          // Visibility flag
          visible: true
        };
      });
      
      // Calculate node degrees for sizing
      this._calculateNodeDegrees();
      
      // Initialize filtered and visible data
      this.data.filteredNodes = [...this.data.nodes];
      this.data.filteredLinks = [...this.data.links];
      this.data.visibleNodes = [...this.data.filteredNodes];
      this.data.visibleLinks = [...this.data.filteredLinks];
      
      if (window.DebugUtils) {
        window.DebugUtils.endTimer('process-data');
        window.DebugUtils.info('Data processed', {
          nodeCount: this.data.nodes.length,
          linkCount: this.data.links.length,
          duration: window.DebugUtils.getPerformanceData().timers.find(t => t.name === 'process-data')?.duration || 0
        });
      }
    } catch (error) {
      if (window.DebugUtils) {
        window.DebugUtils.error('Failed to process data', error);
        window.DebugUtils.endTimer('process-data');
      }
      throw error;
    }
  }
  
  /**
   * Calculate node degrees (in/out connections)
   * @private
   */
  _calculateNodeDegrees() {
    // Initialize degree counters
    for (const node of this.data.nodes) {
      node.inDegree = 0;
      node.outDegree = 0;
      node.degree = 0;
    }
    
    // Count connections
    for (const link of this.data.links) {
      const sourceNode = this.data.nodeMap.get(link.source);
      const targetNode = this.data.nodeMap.get(link.target);
      
      if (sourceNode) {
        sourceNode.outDegree = (sourceNode.outDegree || 0) + 1;
        sourceNode.degree = (sourceNode.outDegree || 0) + (sourceNode.inDegree || 0);
      }
      
      if (targetNode) {
        targetNode.inDegree = (targetNode.inDegree || 0) + 1;
        targetNode.degree = (targetNode.outDegree || 0) + (targetNode.inDegree || 0);
      }
    }
  }
  
  /**
   * Calculate node size based on settings
   * @param {Object} node - Node to calculate size for
   * @returns {number} - Node size
   * @private
   */
  _calculateNodeSize(node) {
    const sizeCfg = this.settings.visualization.nodes;
    const defaultSize = sizeCfg.defaultSize || 10;
    
    // If no size attribute is defined, use default
    if (!sizeCfg.sizeAttribute) {
      return defaultSize;
    }
    
    // Get attribute value
    const value = node[sizeCfg.sizeAttribute];
    
    // If value doesn't exist, use default
    if (value === undefined || value === null) {
      return defaultSize;
    }
    
    // If attribute is 'degree', calculate now
    if (sizeCfg.sizeAttribute === 'degree' && !value) {
      // Calculated later in _calculateNodeDegrees
      return defaultSize;
    }
    
    // Map value to size range
    const sizeRange = sizeCfg.sizeRange || [5, 20];
    const minValue = this._getMinAttributeValue(sizeCfg.sizeAttribute) || 0;
    const maxValue = this._getMaxAttributeValue(sizeCfg.sizeAttribute) || 1;
    
    // Prevent division by zero
    if (minValue === maxValue) {
      return defaultSize;
    }
    
    // Linear mapping of value to size range
    const normalizedValue = (value - minValue) / (maxValue - minValue);
    const size = sizeRange[0] + normalizedValue * (sizeRange[1] - sizeRange[0]);
    
    return size;
  }
  
  /**
   * Calculate node color based on settings
   * @param {Object} node - Node to calculate color for
   * @returns {string} - CSS color value
   * @private
   */
  _calculateNodeColor(node) {
    const colorCfg = this.settings.visualization.nodes;
    const defaultColor = colorCfg.defaultColor || '#3498db';
    
    // If no color attribute is defined, use default
    if (!colorCfg.colorAttribute) {
      return defaultColor;
    }
    
    // Get attribute value
    const value = node[colorCfg.colorAttribute];
    
    // If value doesn't exist, use default
    if (value === undefined || value === null) {
      return defaultColor;
    }
    
    // If color scheme is defined, use it for categorical mapping
    if (colorCfg.colorScheme) {
      return this._getColorFromScheme(value, colorCfg.colorScheme) || defaultColor;
    }
    
    // If value is already a color, use it
    if (typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'))) {
      return value;
    }
    
    // Default to original color or default
    return defaultColor;
  }
  
  /**
   * Calculate link width based on settings
   * @param {Object} link - Link to calculate width for
   * @returns {number} - Link width
   * @private
   */
  _calculateLinkWidth(link) {
    const widthCfg = this.settings.visualization.links;
    const defaultWidth = widthCfg.defaultWidth || 1.5;
    
    // If no width attribute is defined, use default
    if (!widthCfg.widthAttribute) {
      return defaultWidth;
    }
    
    // Get attribute value
    const value = link[widthCfg.widthAttribute];
    
    // If value doesn't exist, use default
    if (value === undefined || value === null) {
      return defaultWidth;
    }
    
    // Map value to width range
    const widthRange = widthCfg.widthRange || [0.5, 4];
    const minValue = this._getMinLinkAttributeValue(widthCfg.widthAttribute) || 0;
    const maxValue = this._getMaxLinkAttributeValue(widthCfg.widthAttribute) || 1;
    
    // Prevent division by zero
    if (minValue === maxValue) {
      return defaultWidth;
    }
    
    // Linear mapping of value to width range
    const normalizedValue = (value - minValue) / (maxValue - minValue);
    const width = widthRange[0] + normalizedValue * (widthRange[1] - widthRange[0]);
    
    return width;
  }
  
  /**
   * Calculate link color based on settings
   * @param {Object} link - Link to calculate color for
   * @returns {string} - CSS color value
   * @private
   */
  _calculateLinkColor(link) {
    const colorCfg = this.settings.visualization.links;
    const defaultColor = colorCfg.defaultColor || '#95a5a6';
    
    // If no color attribute is defined, use default
    if (!colorCfg.colorAttribute) {
      return defaultColor;
    }
    
    // Get attribute value
    const value = link[colorCfg.colorAttribute];
    
    // If value doesn't exist, use default
    if (value === undefined || value === null) {
      return defaultColor;
    }
    
    // If color scheme is defined, use it for categorical mapping
    if (colorCfg.colorScheme) {
      return this._getColorFromScheme(value, colorCfg.colorScheme) || defaultColor;
    }
    
    // If value is already a color, use it
    if (typeof value === 'string' && (value.startsWith('#') || value.startsWith('rgb'))) {
      return value;
    }
    
    // Default to original color or default
    return defaultColor;
  }
  
  /**
   * Get color from a predefined color scheme
   * @param {*} value - Value to map to color
   * @param {string} schemeName - Name of color scheme
   * @returns {string} - CSS color
   * @private
   */
  _getColorFromScheme(value, schemeName) {
    // Biblical era color scheme
    const colorSchemes = {
      'biblical-era': {
        'creation': '#8BC34A',      // Green
        'patriarchs': '#CDDC39',    // Lime
        'exodus': '#FFC107',        // Amber
        'judges': '#FF9800',        // Orange
        'united-kingdom': '#F44336', // Red
        'divided-kingdom': '#E91E63', // Pink
        'exile': '#9C27B0',         // Purple
        'post-exile': '#673AB7',    // Deep Purple
        'intertestamental': '#3F51B5', // Indigo
        'new-testament': '#2196F3',  // Blue
        'default': '#607D8B'         // Blue Gray
      },
      'relationship-type': {
        'father': '#3498db',        // Blue
        'mother': '#e74c3c',        // Red
        'spouse': '#2ecc71',        // Green
        'child': '#f39c12',         // Orange
        'sibling': '#9b59b6',       // Purple
        'ancestor': '#1abc9c',      // Teal
        'descendant': '#d35400',    // Orange/Brown
        'default': '#95a5a6'        // Gray
      },
      'tribe': {
        'judah': '#c0392b',         // Red
        'benjamin': '#8e44ad',      // Purple
        'levi': '#2980b9',          // Blue
        'joseph': '#27ae60',        // Green
        'ephraim': '#16a085',       // Light Green
        'manasseh': '#2c3e50',      // Dark Blue
        'reuben': '#f39c12',        // Orange
        'simeon': '#d35400',        // Dark Orange
        'zebulun': '#7f8c8d',       // Gray
        'issachar': '#34495e',      // Darker Blue
        'dan': '#95a5a6',           // Light Gray
        'naphtali': '#e67e22',      // Light Orange
        'gad': '#1abc9c',           // Teal
        'asher': '#3498db',         // Blue
        'default': '#7f8c8d'        // Gray
      }
    };
    
    // Get the specified color scheme
    const scheme = colorSchemes[schemeName];
    
    if (!scheme) {
      return null;
    }
    
    // Convert value to string
    const key = String(value).toLowerCase();
    
    // Return color from scheme or default
    return scheme[key] || scheme.default;
  }
  /**
   * Get minimum value for a node attribute
   * @param {string} attribute - Node attribute name
   * @returns {number} - Minimum value
   * @private
   */
  _getMinAttributeValue(attribute) {
    let min = Infinity;
    for (const node of this.data.nodes) {
      const value = node[attribute];
      if (value !== undefined && typeof value === 'number' && value < min) {
        min = value;
      }
    }
    return min === Infinity ? 0 : min;
  }
  
  /**
   * Get maximum value for a node attribute
   * @param {string} attribute - Node attribute name
   * @returns {number} - Maximum value
   * @private
   */
  _getMaxAttributeValue(attribute) {
    let max = -Infinity;
    for (const node of this.data.nodes) {
      const value = node[attribute];
      if (value !== undefined && typeof value === 'number' && value > max) {
        max = value;
      }
    }
    return max === -Infinity ? 1 : max;
  }
  
  /**
   * Get minimum value for a link attribute
   * @param {string} attribute - Link attribute name
   * @returns {number} - Minimum value
   * @private
   */
  _getMinLinkAttributeValue(attribute) {
    let min = Infinity;
    for (const link of this.data.links) {
      const value = link[attribute];
      if (value !== undefined && typeof value === 'number' && value < min) {
        min = value;
      }
    }
    return min === Infinity ? 0 : min;
  }
  
  /**
   * Get maximum value for a link attribute
   * @param {string} attribute - Link attribute name
   * @returns {number} - Maximum value
   * @private
   */
  _getMaxLinkAttributeValue(attribute) {
    let max = -Infinity;
    for (const link of this.data.links) {
      const value = link[attribute];
      if (value !== undefined && typeof value === 'number' && value > max) {
        max = value;
      }
    }
    return max === -Infinity ? 1 : max;
  }
  
  /**
   * Apply the specified layout to the data
   * @param {string} layoutType - Name of layout to apply
   * @param {Object} options - Layout options
   * @returns {Promise} - Resolves when layout is complete
   * @private
   */
  async _applyLayout(layoutType, options = {}) {
    if (window.DebugUtils) {
      window.DebugUtils.startTimer(`layout-${layoutType}`);
      window.DebugUtils.info(`Applying ${layoutType} layout`, { nodeCount: this.data.filteredNodes.length, options });
    }
    
    try {
      const layoutOptions = {
        ...this.settings.visualization.layout,
        ...options
      };
      
      // Check if layout is cached and cache is still valid
      const cacheKey = `${layoutType}-${JSON.stringify(layoutOptions)}-${this.data.filteredNodes.length}`;
      
      if (this.data.layoutCache.has(cacheKey) && !options.forceRecalculate) {
        // Use cached layout
        const cachedLayout = this.data.layoutCache.get(cacheKey);
        
        // Apply cached positions
        for (const node of this.data.filteredNodes) {
          const cachedNode = cachedLayout.nodes.find(n => n.id === node.id);
          if (cachedNode) {
            node.x = cachedNode.x;
            node.y = cachedNode.y;
            node.targetX = cachedNode.x;
            node.targetY = cachedNode.y;
          }
        }
        
        if (window.DebugUtils) {
          window.DebugUtils.info('Using cached layout', { type: layoutType });
          window.DebugUtils.endTimer(`layout-${layoutType}`);
        }
        
        return;
      }
      
      // Choose layout algorithm
      let positionedNodes;
      
      switch (layoutType) {
        case 'hierarchical':
          positionedNodes = await this._applyHierarchicalLayout(layoutOptions);
          break;
        case 'radial':
          positionedNodes = await this._applyRadialLayout(layoutOptions);
          break;
        case 'force-directed':
          positionedNodes = await this._applyForceDirectedLayout(layoutOptions);
          break;
        case 'timeline':
          positionedNodes = await this._applyTimelineLayout(layoutOptions);
          break;
        default:
          positionedNodes = await this._applyDefaultLayout(layoutOptions);
      }
      
      // Cache layout result
      this.data.layoutCache.set(cacheKey, {
        nodes: this.data.filteredNodes.map(node => ({
          id: node.id,
          x: node.x,
          y: node.y
        })),
        timestamp: Date.now()
      });
      
      if (window.DebugUtils) {
        window.DebugUtils.endTimer(`layout-${layoutType}`);
        const duration = window.DebugUtils.getPerformanceData().timers.find(t => t.name === `layout-${layoutType}`)?.duration || 0;
        window.DebugUtils.info(`Layout ${layoutType} completed`, { duration });
        this.performance.layoutTime = duration;
      }
    } catch (error) {
      if (window.DebugUtils) {
        window.DebugUtils.error(`Layout ${layoutType} failed`, error);
        window.DebugUtils.endTimer(`layout-${layoutType}`);
      }
      this.trigger('error', { message: `Layout ${layoutType} failed`, error });
      throw error;
    }
  }
  
  /**
   * Apply hierarchical layout (tree-like)
   * @param {Object} options - Layout options
   * @returns {Array} - Positioned nodes
   * @private
   */
  async _applyHierarchicalLayout(options) {
    // Default values
    const levelSeparation = options.levelSeparation || 200;
    const nodeSeparation = options.nodeSeparation || 100;
    const orientation = options.orientation || 'horizontal';
    const direction = options.direction || 'down';
    
    // Extract family relationships to build hierarchy
    const familyTree = this._extractFamilyHierarchy();
    
    // Find root nodes (those without parents in the dataset)
    const rootNodes = this.data.filteredNodes.filter(node => 
      !this.data.filteredLinks.some(link => link.target === node.id)
    );
    
    let startX = 0;
    let startY = 0;
    
    // If no root nodes, use nodes with highest outdegree as roots
    const layoutNodes = rootNodes.length > 0 ? rootNodes : 
      [...this.data.filteredNodes]
        .sort((a, b) => (b.outDegree || 0) - (a.outDegree || 0))
        .slice(0, Math.max(1, Math.floor(this.data.filteredNodes.length / 10)));
    
    // Position nodes recursively
    for (const rootNode of layoutNodes) {
      await this._positionHierarchyNode(
        rootNode, 
        familyTree, 
        startX, 
        startY, 
        levelSeparation,
        nodeSeparation,
        orientation,
        direction,
        new Set()
      );
      
      // Update start position for next tree
      if (orientation === 'horizontal') {
        startX += this._getSubtreeWidth(rootNode, familyTree, nodeSeparation) + levelSeparation;
      } else {
        startY += this._getSubtreeHeight(rootNode, familyTree, nodeSeparation) + levelSeparation;
      }
    }
    
    // Center the layout
    this._centerLayout();
    
    return this.data.filteredNodes;
  }
  
  /**
   * Position a node and its children in a hierarchy
   * @param {Object} node - Node to position
   * @param {Object} familyTree - Family relationships
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} levelSep - Level separation
   * @param {number} nodeSep - Node separation
   * @param {string} orientation - Layout orientation
   * @param {string} direction - Layout direction
   * @param {Set} visited - Set of visited node IDs
   * @private
   */
  async _positionHierarchyNode(node, familyTree, x, y, levelSep, nodeSep, orientation, direction, visited) {
    if (visited.has(node.id)) {
      return { width: 0, height: 0 };
    }
    
    visited.add(node.id);
    
    // Get children from family tree
    const children = familyTree[node.id] || [];
    
    // Position this node
    node.x = x;
    node.y = y;
    node.targetX = x;
    node.targetY = y;
    
    if (children.length === 0) {
      return { width: nodeSep, height: nodeSep };
    }
    
    // Position all children
    let currentOffset = 0;
    let maxChildSize = 0;
    
    for (const childId of children) {
      const childNode = this.data.filteredNodes.find(n => n.id === childId);
      
      if (!childNode) continue;
      
      let childX = x;
      let childY = y;
      
      if (orientation === 'horizontal') {
        childX = direction === 'right' ? x + levelSep : x - levelSep;
        childY = y + currentOffset;
      } else {
        childX = x + currentOffset;
        childY = direction === 'down' ? y + levelSep : y - levelSep;
      }
      
      const childSize = await this._positionHierarchyNode(
        childNode,
        familyTree,
        childX,
        childY,
        levelSep,
        nodeSep,
        orientation,
        direction,
        visited
      );
      
      if (orientation === 'horizontal') {
        currentOffset += childSize.height;
        maxChildSize = Math.max(maxChildSize, childSize.width);
      } else {
        currentOffset += childSize.width;
        maxChildSize = Math.max(maxChildSize, childSize.height);
      }
    }
    
    // Center parent among children
    if (children.length > 0) {
      let totalChildrenSize = 0;
      let minPos = Infinity;
      let maxPos = -Infinity;
      
      for (const childId of children) {
        const childNode = this.data.filteredNodes.find(n => n.id === childId);
        if (!childNode) continue;
        
        const pos = orientation === 'horizontal' ? childNode.y : childNode.x;
        minPos = Math.min(minPos, pos);
        maxPos = Math.max(maxPos, pos);
      }
      
      totalChildrenSize = maxPos - minPos;
      
      if (orientation === 'horizontal') {
        node.y = minPos + totalChildrenSize / 2;
        node.targetY = node.y;
      } else {
        node.x = minPos + totalChildrenSize / 2;
        node.targetX = node.x;
      }
    }
    
    return {
      width: orientation === 'horizontal' ? levelSep + maxChildSize : currentOffset,
      height: orientation === 'horizontal' ? currentOffset : levelSep + maxChildSize
    };
  }
  
  /**
   * Get subtree width for a node
   * @param {Object} node - Root node
   * @param {Object} familyTree - Family relationships
   * @param {number} nodeSep - Node separation
   * @returns {number} - Subtree width
   * @private
   */
  _getSubtreeWidth(node, familyTree, nodeSep) {
    const children = familyTree[node.id] || [];
    
    if (children.length === 0) {
      return nodeSep;
    }
    
    let totalWidth = 0;
    
    for (const childId of children) {
      const childNode = this.data.filteredNodes.find(n => n.id === childId);
      if (childNode) {
        totalWidth += this._getSubtreeWidth(childNode, familyTree, nodeSep);
      }
    }
    
    return Math.max(nodeSep, totalWidth);
  }
  
  /**
   * Get subtree height for a node
   * @param {Object} node - Root node
   * @param {Object} familyTree - Family relationships
   * @param {number} nodeSep - Node separation
   * @returns {number} - Subtree height
   * @private
   */
  _getSubtreeHeight(node, familyTree, nodeSep) {
    const children = familyTree[node.id] || [];
    
    if (children.length === 0) {
      return nodeSep;
    }
    
    let totalHeight = 0;
    
    for (const childId of children) {
      const childNode = this.data.filteredNodes.find(n => n.id === childId);
      if (childNode) {
        totalHeight += this._getSubtreeHeight(childNode, familyTree, nodeSep);
      }
    }
    
    return Math.max(nodeSep, totalHeight);
  }
  
  /**
   * Extract family hierarchy from data
   * @returns {Object} - Map of parent IDs to arrays of child IDs
   * @private
   */
  _extractFamilyHierarchy() {
    const familyTree = {};
    
    // Process all parent-child links
    for (const link of this.data.filteredLinks) {
      // Consider only parent-child relationships
      if (link.type === 'parent-child' || link.type === 'father' || link.type === 'mother') {
        const parentId = link.source;
        const childId = link.target;
        
        if (!familyTree[parentId]) {
          familyTree[parentId] = [];
        }
        
        if (!familyTree[parentId].includes(childId)) {
          familyTree[parentId].push(childId);
        }
      }
    }
    
    return familyTree;
  }
  
  /**
   * Apply radial layout (circular arrangement)
   * @param {Object} options - Layout options
   * @returns {Array} - Positioned nodes
   * @private
   */
  async _applyRadialLayout(options) {
    // Default values
    const radius = options.radius || 
      Math.min(this.settings.width, this.settings.height) / 3;
    const startAngle = options.startAngle || 0;
    const endAngle = options.endAngle || 2 * Math.PI;
    const sortBy = options.sortBy || 'none';
    
    // Sort nodes if needed
    let sortedNodes = [...this.data.filteredNodes];
    
    if (sortBy !== 'none') {
      sortedNodes.sort((a, b) => {
        if (sortBy === 'id') {
          return a.id.localeCompare(b.id);
        } else if (sortBy === 'chronological' && a.birthYear && b.birthYear) {
          return a.birthYear - b.birthYear;
        } else if (a[sortBy] !== undefined && b[sortBy] !== undefined) {
          return a[sortBy] - b[sortBy];
        }
        return 0;
      });
    }
    
    // Position nodes in a circle
    const angleStep = (endAngle - startAngle) / sortedNodes.length;
    const centerX = 0;
    const centerY = 0;
    
    sortedNodes.forEach((node, index) => {
      const angle = startAngle + index * angleStep;
      node.x = centerX + radius * Math.cos(angle);
      node.y = centerY + radius * Math.sin(angle);
      node.targetX = node.x;
      node.targetY = node.y;
    });
    
    return sortedNodes;
  }
  
  /**
   * Apply force-directed layout
   * @param {Object} options - Layout options
   * @returns {Array} - Positioned nodes
   * @private
   */
  async _applyForceDirectedLayout(options) {
    // This is a simplified force-directed layout implementation
    // In a real application, consider using D3's force simulation
    
    // Default values
    const iterations = options.iterations || 100;
    const repulsionForce = options.repulsionForce || 100;
    const attractionForce = options.attractionForce || 0.1;
    const maxMovement = options.maxMovement || 5;
    
    // Initialize random positions if needed
    for (const node of this.data.filteredNodes) {
      if (!node.hasOwnProperty('x') || !node.hasOwnProperty('y')) {
        node.x = Math.random() * 1000 - 500;
        node.y = Math.random() * 1000 - 500;
      }
    }
    
    // Run iterations
    for (let i = 0; i < iterations; i++) {
      // Calculate repulsion forces between all nodes
      for (let a = 0; a < this.data.filteredNodes.length; a++) {
        const nodeA = this.data.filteredNodes[a];
        nodeA.fx = 0;
        nodeA.fy = 0;
        
        for (let b = 0; b < this.data.filteredNodes.length; b++) {
          if (a === b) continue;
          
          const nodeB = this.data.filteredNodes[b];
          const dx = nodeA.x - nodeB.x;
          const dy = nodeA.y - nodeB.y;
          const distanceSquared = dx * dx + dy * dy;
          const distance = Math.sqrt(distanceSquared);
          
          // Avoid division by zero
          if (distance === 0) continue;
          
          // Calculate repulsion force (inverse square law)
          const force = repulsionForce / distanceSquared;
          nodeA.fx += dx / distance * force;
          nodeA.fy += dy / distance * force;
        }
      }
      
      // Calculate attraction forces along links
      for (const link of this.data.filteredLinks) {
        const sourceNode = this.data.filteredNodes.find(n => n.id === link.source);
        const targetNode = this.data.filteredNodes.find(n => n.id === link.target);
        
        if (!sourceNode || !targetNode) continue;
        
        const dx = sourceNode.x - targetNode.x;
        const dy = sourceNode.y - targetNode.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Avoid division by zero
        if (distance === 0) continue;
        
        // Calculate attraction force (linear)
        const force = distance * attractionForce;
        const fx = dx / distance * force;
        const fy = dy / distance * force;
        
        sourceNode.fx -= fx;
        sourceNode.fy -= fy;
        targetNode.fx += fx;
        targetNode.fy += fy;
      }
      
      // Apply forces with damping as iterations progress
      const damping = 1 - (i / iterations);
      
      for (const node of this.data.filteredNodes) {
        // Calculate movement distance
        const dx = node.fx * damping;
        const dy = node.fy * damping;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Apply movement with max limit
        if (distance > maxMovement) {
          node.x += dx * maxMovement / distance;
          node.y += dy * maxMovement / distance;
        } else {
          node.x += dx;
          node.y += dy;
        }
      }
    }
    
    // Set target positions
    for (const node of this.data.filteredNodes) {
      node.targetX = node.x;
      node.targetY = node.y;
    }
    
    return this.data.filteredNodes;
  }
  
  /**
   * Apply timeline layout
   * @param {Object} options - Layout options
   * @returns {Array} - Positioned nodes
   * @private
   */
  async _applyTimelineLayout(options) {
    // Default values
    const orientation = options.orientation || 'horizontal';
    const timeField = options.timeField || 'birthYear';
    const rowHeight = options.rowHeight || 100;
    const padding = options.padding || 50;
    
    // Filter nodes that have the time field
    const timeNodes = this.data.filteredNodes.filter(node => node[timeField] !== undefined);
    const otherNodes = this.data.filteredNodes.filter(node => node[timeField] === undefined);
    
    if (timeNodes.length === 0) {
      // If no nodes have time data, fall back to force-directed layout
      return this._applyForceDirectedLayout(options);
    }
    
    // Find min and max time values
    let minTime = Infinity;
    let maxTime = -Infinity;
    
    for (const node of timeNodes) {
      const time = parseFloat(node[timeField]);
      if (!isNaN(time)) {
        minTime = Math.min(minTime, time);
        maxTime = Math.max(maxTime, time);
      }
    }
    
    // Add padding to time range
    const timeRange = maxTime - minTime;
    minTime -= timeRange * 0.05;
    maxTime += timeRange * 0.05;
    
    // Get available width/height
    const width = this.settings.width - 2 * padding;
    const height = this.settings.height - 2 * padding;
    
    // Calculate positions
    const timeScale = orientation === 'horizontal' ? 
      width / (maxTime - minTime) : 
      height / (maxTime - minTime);
    
    // Map to position time nodes
    const rowMap = new Map();
    
    for (const node of timeNodes) {
      const time = parseFloat(node[timeField]);
      if (isNaN(time)) continue;
      
      // Calculate position on timeline
      const timePosition = (time - minTime) * timeScale;
      
      // Find row with least overlap
      let row = 0;
      let found = false;
      
      while (!found) {
        found = true;
        
        // Check for collision with nodes in this row
        if (rowMap.has(row)) {
          for (const existingNode of rowMap.get(row)) {
            const existingTime = parseFloat(existingNode[timeField]);
            const existingPosition = (existingTime - minTime) * timeScale;
            const distance = Math.abs(timePosition - existingPosition);
            
            // If too close, try next row
            if (distance < 50) {
              found = false;
              break;
            }
          }
        }
        
        if (found) {
          if (!rowMap.has(row)) {
            rowMap.set(row, []);
          }
          rowMap.get(row).push(node);
        } else {
          row++;
        }
      }
      
      // Set node position
      if (orientation === 'horizontal') {
        node.x = padding + timePosition;
        node.y = padding + row * rowHeight;
      } else {
        node.x = padding + row * rowHeight;
        node.y = padding + timePosition;
      }
      
      node.targetX = node.x;
      node.targetY = node.y;
    }
    
    // Position other nodes with force-directed layout
    if (otherNodes.length > 0) {
      // Get bounds of timeline layout
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      for (const node of timeNodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x);
        maxY = Math.max(maxY, node.y);
      }
      
      // Add padding to bounds
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      
      // Initialize positions for other nodes
      for (const node of otherNodes) {
        node.x = minX + Math.random() * (maxX - minX);
        node.y = maxY + Math.random() * 300;
        node.targetX = node.x;
        node.targetY = node.y;
      }
    }
    
    return this.data.filteredNodes;
  }
  
  /**
   * Apply default layout (fallback)
   * @param {Object} options - Layout options
   * @returns {Array} - Positioned nodes
   * @private
   */
  async _applyDefaultLayout(options) {
    // Simple grid layout
    const sqrt = Math.ceil(Math.sqrt(this.data.filteredNodes.length));
    const spacing = options.spacing || 100;
    
    this.data.filteredNodes.forEach((node, index) => {
      const row = Math.floor(index / sqrt);
      const col = index % sqrt;
      
      node.x = col * spacing;
      node.y = row * spacing;
      node.targetX = node.x;
      node.targetY = node.y;
    });
    
    return this.data.filteredNodes;
  }
  
  /**
   * Center layout in viewport
   * @private
   */
  _centerLayout() {
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const node of this.data.filteredNodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }
    
    // Calculate center offset
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Shift all nodes to center
    const offsetX = -centerX;
    const offsetY = -centerY;
    
    for (const node of this.data.filteredNodes) {
      node.x += offsetX;
      node.y += offsetY;
      node.targetX = node.x;
      node.targetY = node.y;
    }
  }
  
  /**
   * Calculate bounds for a set of nodes
   * @param {Array} nodes - Nodes to calculate bounds for
   * @returns {Object} - Bounding box {x1, y1, x2, y2}
   * @private
   */
  _calculateNodesBounds(nodes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    }
    
    return { x1: minX, y1: minY, x2: maxX, y2: maxY };
  }
  
  /**
   * Calculate node attribute distribution for statistics
   * @param {Object} stats - Statistics object to update
   * @private
   */
  _calculateAttributeDistribution(stats) {
    // Calculate distributions for common attributes
    const attributes = ['tribe', 'gender', 'era', 'type'];
    
    for (const attr of attributes) {
      const distribution = {};
      
      for (const node of this.data.nodes) {
        const value = node[attr];
        if (value !== undefined) {
          distribution[value] = (distribution[value] || 0) + 1;
        }
      }
      
      if (Object.keys(distribution).length > 0) {
        stats.nodes.byAttribute[attr] = distribution;
      }
    }
    
    // Calculate link type distribution
    const linkTypes = {};
    
    for (const link of this.data.links) {
      const type = link.type || 'unknown';
      linkTypes[type] = (linkTypes[type] || 0) + 1;
    }
    
    stats.links.byType = linkTypes;
  }
  
  /**
   * Register standard event handlers
   * @private
   */
  _registerEventHandlers() {
    // Handle processing of queued events once handlers are registered
    this.on('handlersRegistered', () => {
      // Process any queued events
      if (this.events.queue.length > 0) {
        const queue = [...this.events.queue];
        this.events.queue = [];
        
        for (const event of queue) {
          this.trigger(event.eventName, event.data);
        }
      }
    });
  }
  
  /**
   * Simple Levenshtein distance calculation for fuzzy matching
   * @param {string} s1 - First string
   * @param {string} s2 - Second string
   * @returns {number} - Edit distance
   * @private
   */
  _levenshteinDistance(s1, s2) {
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;
    
    const matrix = [];
    
    // Initialize matrix
    for (let i = 0; i <= s1.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= s2.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1.charAt(i - 1) === s2.charAt(j - 1) ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost  // substitution
        );
      }
    }
    
    return matrix[s1.length][s2.length];
  }
  
/**
   * Debounce function to limit execution frequency
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   * @private
   */
_debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }
  
  /**
   * Throttle function to limit execution frequency
   * @param {Function} func - Function to throttle
   * @param {number} limit - Time limit in milliseconds
   * @returns {Function} - Throttled function
   * @private
   */
  _throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  /**
   * Extract family relationships from links
   * @returns {Object} - Family hierarchy object
   * @private
   */
  _extractFamilyHierarchy() {
    const family = {};
    
    for (const link of this.data.filteredLinks) {
      if (link.source && link.target) {
        // Add child to parent's children list
        if (!family[link.source]) {
          family[link.source] = [];
        }
        if (!family[link.source].includes(link.target)) {
          family[link.source].push(link.target);
        }
      }
    }
    
    return family;
  }
  
  /**
   * Calculate the subtree width for hierarchical layout
   * @param {Object} node - Root node
   * @param {Object} familyTree - Family relationships
   * @param {number} nodeSep - Node separation
   * @returns {number} - Width of subtree
   * @private
   */
  _getSubtreeWidth(node, familyTree, nodeSep) {
    const children = familyTree[node.id] || [];
    
    if (children.length === 0) {
      return nodeSep;
    }
    
    let width = 0;
    for (const childId of children) {
      const childNode = this.data.filteredNodes.find(n => n.id === childId);
      if (childNode) {
        width += this._getSubtreeWidth(childNode, familyTree, nodeSep);
      }
    }
    
    return Math.max(width, nodeSep);
  }
  
  /**
   * Calculate the subtree height for hierarchical layout
   * @param {Object} node - Root node
   * @param {Object} familyTree - Family relationships
   * @param {number} nodeSep - Node separation
   * @returns {number} - Height of subtree
   * @private
   */
  _getSubtreeHeight(node, familyTree, nodeSep) {
    const children = familyTree[node.id] || [];
    
    if (children.length === 0) {
      return nodeSep;
    }
    
    let height = 0;
    for (const childId of children) {
      const childNode = this.data.filteredNodes.find(n => n.id === childId);
      if (childNode) {
        height = Math.max(height, this._getSubtreeHeight(childNode, familyTree, nodeSep));
      }
    }
    
    return height + nodeSep;
  }
  
  /**
   * Export visualization data to JSON
   * @param {Object} options - Export options
   * @returns {Object} - Exported data
   */
  exportData(options = {}) {
    const defaults = {
      includePositions: true,
      includeFilters: true,
      includeSettings: true,
      prettyPrint: false
    };
    
    const exportOptions = { ...defaults, ...options };
    const exportData = {
      version: this.version,
      timestamp: new Date().toISOString()
    };
    
    // Export nodes and links
    exportData.nodes = this.data.nodes.map(node => {
      const nodeData = { ...node };
      
      // Remove temporary properties
      delete nodeData.fx;
      delete nodeData.fy;
      delete nodeData.vx;
      delete nodeData.vy;
      
      if (!exportOptions.includePositions) {
        delete nodeData.x;
        delete nodeData.y;
        delete nodeData.targetX;
        delete nodeData.targetY;
      }
      
      return nodeData;
    });
    
    exportData.links = this.data.links.map(link => ({ ...link }));
    
    // Include filters
    if (exportOptions.includeFilters) {
      exportData.filters = { ...this.filters };
    }
    
    // Include settings
    if (exportOptions.includeSettings) {
      exportData.settings = { ...this.settings };
    }
    
    return exportOptions.prettyPrint ? 
      JSON.stringify(exportData, null, 2) : 
      exportData;
  }
  
  /**
   * Import visualization data from JSON
   * @param {Object|string} data - Data to import
   * @returns {boolean} - Success status
   */
  importData(data) {
    try {
      const importData = typeof data === 'string' ? JSON.parse(data) : data;
      
      if (!importData.nodes || !Array.isArray(importData.nodes)) {
        this.trigger('error', { message: 'Invalid import data: missing nodes array' });
        return false;
      }
      
      if (!importData.links || !Array.isArray(importData.links)) {
        this.trigger('error', { message: 'Invalid import data: missing links array' });
        return false;
      }
      
      // Import nodes and links
      this.data.nodes = importData.nodes.map(node => ({ ...node }));
      this.data.links = importData.links.map(link => ({ ...link }));
      
      // Import filters if available
      if (importData.filters) {
        this.filters = { ...importData.filters };
      }
      
      // Import settings if available
      if (importData.settings) {
        this.settings = this._mergeSettings(this.settings, importData.settings);
      }
      
      // Process data
      this._processData();
      
      // Trigger data update event
      this.trigger('dataUpdated', { source: 'import' });
      
      return true;
    } catch (error) {
      this.trigger('error', { message: 'Failed to import data', error });
      return false;
    }
  }
  
  /**
   * Record performance metrics
   * @param {string} action - Action being measured
   * @param {Function} callback - Function to execute and measure
   * @returns {*} - Result of callback
   * @private
   */
  _recordPerformance(action, callback) {
    if (!window.DebugUtils) {
      return callback();
    }
    
    window.DebugUtils.startTimer(action);
    try {
      const result = callback();
      window.DebugUtils.endTimer(action);
      return result;
    } catch (error) {
      window.DebugUtils.endTimer(action);
      throw error;
    }
  }
  
  /**
   * Clean up and destroy visualization
   */
  destroy() {
    // Remove event listeners
    this.off();
    
    // Clear data
    this.data = {
      nodes: [],
      links: [],
      filteredNodes: [],
      filteredLinks: [],
      layoutCache: new Map()
    };
    
    // Signal destruction
    this.trigger('destroyed');
    
    if (window.DebugUtils) {
      window.DebugUtils.info('Visualization destroyed');
    }
  }
}} // End of GenealogyVisualization class

// Export the GenealogyVisualization class
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GenealogyVisualization;
} else if (typeof define === 'function' && define.amd) {
  define([], function() { return GenealogyVisualization; });
} else {
  window.GenealogyVisualization = GenealogyVisualization;
}
