/**
 * Biblical Genealogy Data Processor
 * 
 * Handles loading, processing, and validating genealogical data for visualization.
 * Works with GenealogyDataUtils for core data processing functions.
 */

// Import dependencies
let GenealogyDataUtils;

// Try to import GenealogyDataUtils based on environment
try {
  if (typeof require !== 'undefined') {
    GenealogyDataUtils = require('./genealogy-data-utils.js');
  } else if (typeof window !== 'undefined' && window.GenealogyDataUtils) {
    GenealogyDataUtils = window.GenealogyDataUtils;
  } else {
    console.warn('GenealogyDataUtils not found, some functionality may be limited');
  }
} catch (error) {
  console.error('Failed to import GenealogyDataUtils:', error);
}

const DataProcessor = (function() {
  // Constants for error types
  const ERROR_TYPES = {
    DATA_LOADING: 'data-loading-error',
    DATA_PROCESSING: 'data-processing-error',
    DATA_VALIDATION: 'data-validation-error',
    CONFIGURATION: 'configuration-error',
    FILE_PROCESSING: 'file-processing-error'
  };

  // Default configuration
  const DEFAULT_CONFIG = {
    dataSource: 'Genealogy-dataset.json',
    fallbackSource: 'fallback-data.json',
    useCache: true,
    cacheKey: 'biblical-genealogy-data',
    cacheTTL: 3600000, // 1 hour in milliseconds
    validateData: true,
    enrichData: true,
    fetchTimeout: 8000,
    progressCallback: null,
    errorCallback: null,
    performanceTracking: true
  };

  // In-memory cache storage
  let dataCache = null;
  let cacheTimestamp = 0;
  
  // Performance tracking
  const performanceMetrics = new Map();

  /**
   * Handles errors consistently throughout the application
   * @param {string} type - Error type from ERROR_TYPES
   * @param {string} message - Human-readable error message
   * @param {Object} details - Additional error details
   */
  function handleError(type, message, details = {}) {
    // Log the error to console
    console.error(`${type}: ${message}`, details);
    
    // Call configured error callback if available
    if (typeof DEFAULT_CONFIG.errorCallback === 'function') {
      DEFAULT_CONFIG.errorCallback({
        type,
        message,
        details,
        timestamp: new Date().toISOString()
      });
    }
    
    // Log error to monitoring system if available
    if (typeof window.logErrorToMonitoring === 'function') {
      window.logErrorToMonitoring(type, message, details);
    }
    
    // Return a standardized error object
    return {
      error: true,
      type,
      message,
      details
    };
  }

  /**
   * Start tracking performance for a specific operation
   * @param {string} operation - Name of the operation to track
   */
  function startPerformanceTracking(operation) {
    if (!DEFAULT_CONFIG.performanceTracking) return;
    
    performanceMetrics.set(operation, {
      startTime: performance.now(),
      completed: false
    });
    
    // If utility has its own tracking, use it as well
    if (GenealogyDataUtils && typeof GenealogyDataUtils.startPerformanceTracking === 'function') {
      GenealogyDataUtils.startPerformanceTracking(operation);
    }
  }

  /**
   * End tracking performance for a specific operation
   * @param {string} operation - Name of the operation to track
   * @returns {number|null} - Duration in milliseconds or null if tracking disabled
   */
  function endPerformanceTracking(operation) {
    if (!DEFAULT_CONFIG.performanceTracking) return null;
    
    const metric = performanceMetrics.get(operation);
    if (!metric) return null;
    
    const endTime = performance.now();
    const duration = endTime - metric.startTime;
    
    performanceMetrics.set(operation, {
      ...metric,
      endTime,
      duration,
      completed: true
    });
    
    // If utility has its own tracking, use it as well
    if (GenealogyDataUtils && typeof GenealogyDataUtils.endPerformanceTracking === 'function') {
      GenealogyDataUtils.endPerformanceTracking(operation);
    }
    
    console.debug(`${operation} completed in ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * Get all performance metrics
   * @returns {Object} - Map of all performance metrics
   */
  function getPerformanceMetrics() {
    return Object.fromEntries(performanceMetrics);
  }

  /**
   * Wrap a function with performance tracking
   * @param {Function} fn - Function to wrap
   * @param {string} label - Performance label
   * @returns {Function} - Wrapped function
   */
  function withPerformanceTracking(fn, label) {
    return async function(...args) {
      startPerformanceTracking(label);
      try {
        return await fn.apply(this, args);
      } finally {
        endPerformanceTracking(label);
      }
    };
  }

  /**
   * Checks if cached data is valid
   * @returns {boolean} - Whether cache is valid
   */
  function isCacheValid() {
    return (
      dataCache !== null &&
      cacheTimestamp > 0 &&
      Date.now() - cacheTimestamp < DEFAULT_CONFIG.cacheTTL
    );
  }

  /**
   * Gets data from cache if available and valid
   * @returns {Object|null} - Cached data or null
   */
  function getFromCache() {
    // Check in-memory cache first
    if (isCacheValid()) {
      console.debug('Using in-memory cached data');
      return dataCache;
    }
    
    // Check session storage if browser environment
    if (DEFAULT_CONFIG.useCache && 
        typeof sessionStorage !== 'undefined' && 
        DEFAULT_CONFIG.cacheKey) {
      try {
        const cachedData = sessionStorage.getItem(DEFAULT_CONFIG.cacheKey);
        if (cachedData) {
          const parsedData = JSON.parse(cachedData);
          
          // If the data has a timestamp, check TTL
          if (parsedData._cacheTimestamp && 
              Date.now() - parsedData._cacheTimestamp < DEFAULT_CONFIG.cacheTTL) {
            console.debug('Using session storage cached data');
            
            // Update in-memory cache
            dataCache = parsedData;
            cacheTimestamp = parsedData._cacheTimestamp;
            
            return parsedData;
          }
        }
      } catch (error) {
        console.warn('Failed to read from cache:', error);
      }
    }
    
    return null;
  }

  /**
   * Saves data to cache
   * @param {Object} data - Data to cache
   */
  function saveToCache(data) {
    if (!data || !DEFAULT_CONFIG.useCache) return;
    
    // Add timestamp to data
    const timestampedData = {
      ...data,
      _cacheTimestamp: Date.now()
    };
    
    // Update in-memory cache
    dataCache = timestampedData;
    cacheTimestamp = timestampedData._cacheTimestamp;
    
    // Store in session storage if available
    if (typeof sessionStorage !== 'undefined' && DEFAULT_CONFIG.cacheKey) {
      try {
        sessionStorage.setItem(
          DEFAULT_CONFIG.cacheKey, 
          JSON.stringify(timestampedData)
        );
      } catch (error) {
        console.warn('Failed to cache data:', error);
      }
    }
  }
  /**
   * Loads genealogy data from a source
   * @param {string} source - URL or path to data source
   * @param {Object} options - Loading options
   * @returns {Promise<Object>} - Loaded data
   */
  async function loadGenealogyData(source, options = {}) {
    startPerformanceTracking('loadGenealogyData');
    
    // Apply options over defaults
    const config = { ...DEFAULT_CONFIG, ...options };
    source = source || config.dataSource;
    
    try {
      // Check cache first if enabled
      if (config.useCache) {
        const cachedData = getFromCache();
        if (cachedData) {
          endPerformanceTracking('loadGenealogyData');
          return cachedData;
        }
      }
      
      // Progress callback for loading step
      if (typeof config.progressCallback === 'function') {
        config.progressCallback({ 
          loaded: 0, 
          total: 100, 
          status: 'Loading data...' 
        });
      }
      
      let data;
      
      // Check if source is a URL or a file path
      if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('/'))) {
        // Create a fetch request with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.fetchTimeout);
        
        try {
          const response = await fetch(source, { 
            signal: controller.signal,
            headers: config.headers || {}
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
          }
          
          data = await response.json();
        } catch (fetchError) {
          if (fetchError.name === 'AbortError') {
            throw new Error(`Fetch request timed out after ${config.fetchTimeout}ms`);
          }
          throw fetchError;
        }
      } else if (GenealogyDataUtils && typeof GenealogyDataUtils.loadLocalData === 'function') {
        // Use utility's local data loading function
        data = await GenealogyDataUtils.loadLocalData(source);
      } else {
        throw new Error(`Unsupported data source: ${source}`);
      }
      
      // Call progress callback with successful load
      if (typeof config.progressCallback === 'function') {
        config.progressCallback({ 
          loaded: 50, 
          total: 100, 
          status: 'Processing data...' 
        });
      }
      
      // Process the data (validation, enrichment)
      const processedData = await processGenealogyData(data, config);
      
      // Cache the processed data if caching is enabled
      if (config.useCache) {
        saveToCache(processedData);
      }
      
      // Call progress callback with completion
      if (typeof config.progressCallback === 'function') {
        config.progressCallback({ 
          loaded: 100, 
          total: 100, 
          status: 'Data ready.' 
        });
      }
      
      endPerformanceTracking('loadGenealogyData');
      return processedData;
    } catch (error) {
      endPerformanceTracking('loadGenealogyData');
      
      // Create detailed error information
      const errorDetails = {
        source,
        options: config,
        message: error.message
      };
      
      // Handle the error
      handleError(ERROR_TYPES.DATA_LOADING, `Failed to load genealogy data: ${error.message}`, errorDetails);
      
      // Try to use fallback data if appropriate
      if (config.useFallbackOnError && GenealogyDataUtils && 
          typeof GenealogyDataUtils.getFallbackData === 'function') {
        console.warn('Using fallback data due to loading error');
        return GenealogyDataUtils.getFallbackData();
      }
      
      // Re-throw to allow caller to handle
      throw error;
    }
  }
  
  /**
   * Process genealogy data into a format usable by the application
   * @param {Object} data - Raw genealogy data
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} - Processed genealogy data
   */
  async function processGenealogyData(data, options = {}) {
    startPerformanceTracking('processGenealogyData');
    
    try {
      // Apply options over defaults
      const config = { ...DEFAULT_CONFIG, ...options };
      
      // Use GenealogyDataUtils processing if available (preferred)
      if (GenealogyDataUtils && typeof GenealogyDataUtils.processGenealogyData === 'function') {
        const processedData = GenealogyDataUtils.processGenealogyData(data);
        
        // Apply any application-specific processing 
        const enhancedData = applyCustomProcessing(processedData, config);
        
        endPerformanceTracking('processGenealogyData');
        return enhancedData;
      }
      
      // Fallback to local processing if utility not available
      console.warn('GenealogyDataUtils not available, using local processing');
      
      // Make a deep copy to avoid modifying the original data
      const processedData = JSON.parse(JSON.stringify(data));
      
      // Validate the data structure if requested
      if (config.validateData) {
        if (!isValidDataStructure(processedData)) {
          throw new Error('Invalid data structure');
        }
      }
      
      // Perform standard transformations
      if (processedData.people && !processedData.nodes) {
        processedData.nodes = processedData.people.map(person => ({
          id: person.id,
          name: person.fullName || person.name,
          gender: person.gender,
          birthYear: person.birthYear,
          deathYear: person.deathYear,
          significance: person.significance || 'minor',
          era: determineEra(person.birthYear) || config.defaultEra,
          isKeyFigure: isKeyBiblicalFigure(person.id),
          generation: calculateGeneration(person.birthYear),
          tribe: person.tribe,
          occupation: person.occupation,
          ...person
        }));
      }
      
      // Perform enrichment if requested
      if (config.enrichData) {
        enrichDataset(processedData);
      }
      
      endPerformanceTracking('processGenealogyData');
      return processedData;
    } catch (error) {
      endPerformanceTracking('processGenealogyData');
      
      // Handle the error
      handleError(
        ERROR_TYPES.DATA_PROCESSING,
        `Failed to process genealogy data: ${error.message}`,
        { error }
      );
      
      // Re-throw for caller
      throw error;
    }
  }
  /**
   * Apply application-specific processing beyond what the utility provides
   * @param {Object} data - Data that has been processed by GenealogyDataUtils
   * @param {Object} options - Custom processing options
   * @returns {Object} - Enhanced data with app-specific additions
   */
  function applyCustomProcessing(data, options = {}) {
    if (!data) return data;
    
    try {
      // Add application metadata
      data.appMetadata = {
        ...(data.appMetadata || {}),
        processingTimestamp: new Date().toISOString(),
        processingVersion: '2.0',
        options: { ...options }
      };
      
      // Apply any custom filters if specified
      if (options.filters && Array.isArray(options.filters)) {
        options.filters.forEach(filter => {
          if (typeof filter === 'function' && data.nodes) {
            data.nodes = data.nodes.filter(filter);
          }
        });
      }
      
      // Apply any transformations if specified
      if (options.transformations && Array.isArray(options.transformations)) {
        options.transformations.forEach(transform => {
          if (typeof transform === 'function') {
            transform(data);
          }
        });
      }
      
      // Add calculated fields for UI display
      if (data.nodes) {
        data.nodes.forEach(node => {
          // Add display name for UI
          node.displayName = node.displayName || 
                             node.fullName || 
                             node.name || 
                             `Person ${node.id}`;
          
          // Add lifespan string
          if (node.birthYear) {
            node.lifespanText = node.deathYear ? 
              `${node.birthYear} - ${node.deathYear}` : 
              `${node.birthYear} - Unknown`;
          }
          
          // Add summary text
          node.summary = node.summary || generatePersonSummary(node);
        });
      }
      
      // Calculate network statistics if needed for the UI
      if (!data.statistics && data.nodes && data.links) {
        data.statistics = {
          nodeCount: data.nodes.length,
          linkCount: data.links.length,
          density: calculateNetworkDensity(data.nodes.length, data.links.length),
          communityCount: detectCommunities(data).length
        };
      }
      
      return data;
    } catch (error) {
      console.error('Error in custom processing:', error);
      // Return original data if custom processing fails
      return data;
    }
  }
  
  /**
   * Helper to generate a summary description for a person
   * @param {Object} person - Person node object
   * @returns {string} - Generated summary
   */
  function generatePersonSummary(person) {
    if (!person) return '';
    
    const parts = [];
    
    if (person.significance === 'major') {
      parts.push('Major biblical figure');
    }
    
    if (person.tribe) {
      parts.push(`of the tribe of ${person.tribe}`);
    }
    
    if (person.occupation) {
      parts.push(person.occupation);
    }
    
    if (person.birthYear && person.deathYear) {
      parts.push(`(${person.birthYear} - ${person.deathYear})`);
    }
    
    return parts.join(', ');
  }
  
  /**
   * Calculate network density (ratio of actual connections to possible connections)
   * @param {number} nodeCount - Number of nodes in the network
   * @param {number} linkCount - Number of links in the network
   * @returns {number} - Network density value
   */
  function calculateNetworkDensity(nodeCount, linkCount) {
    if (nodeCount <= 1) return 0;
    const possibleConnections = (nodeCount * (nodeCount - 1)) / 2;
    return linkCount / possibleConnections;
  }
  
  /**
   * Simple community detection (placeholder - would use more sophisticated algorithm)
   * @param {Object} data - Network data with nodes and links
   * @returns {Array} - Array of community assignments
   */
  function detectCommunities(data) {
    // This is a simplified placeholder - a real implementation would use
    // a proper community detection algorithm
    return [{ id: 'community-1', nodes: data.nodes.map(n => n.id) }];
  }
  
  /**
   * Read genealogy data from a local file
   * @param {File} file - File object to read
   * @returns {Promise<Object>} - The parsed data
   */
  function readGenealogyFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      // Verify file type
      if (!file.name.endsWith('.json') && file.type !== 'application/json') {
        reject(new Error('File must be JSON format'));
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(event) {
        try {
          const data = JSON.parse(event.target.result);
          resolve(data);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      };
      
      reader.onerror = function() {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    });
  }
  
  /**
   * Initialize the data processor with configuration
   * @param {Object} config - Configuration options
   */
  function initialize(config = {}) {
    // Update default configuration
    Object.assign(DEFAULT_CONFIG, config);
    
    // Initialize performance metrics
    performanceMetrics.clear();
    
    // Load the GenealogyDataUtils module if not already loaded
    if (!GenealogyDataUtils && typeof config.utilityPath === 'string') {
      try {
        if (typeof require !== 'undefined') {
          GenealogyDataUtils = require(config.utilityPath);
        } else if (typeof importScripts !== 'undefined') {
          importScripts(config.utilityPath);
        } else {
          console.warn('Cannot dynamically load GenealogyDataUtils');
        }
      } catch (error) {
        console.error('Failed to load GenealogyDataUtils:', error);
      }
    }
    
    console.debug('DataProcessor initialized with config:', DEFAULT_CONFIG);
  }
  
  // Public API
  return {
    initialize,
    loadGenealogyData: withPerformanceTracking(loadGenealogyData, 'loadGenealogyData'),
    processGenealogyData: withPerformanceTracking(processGenealogyData, 'processGenealogyData'),
    readGenealogyFile: withPerformanceTracking(readGenealogyFile, 'readGenealogyFile'),
    getPerformanceMetrics,
    ERROR_TYPES
  };
})();

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataProcessor;
} else if (typeof define === 'function' && define.amd) {
  define([], function() { return DataProcessor; });
} else if (typeof window !== 'undefined') {
  window.DataProcessor = DataProcessor;
}
