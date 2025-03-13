/**
 * Biblical Genealogy Debug Utilities
 * 
 * Provides debugging tools for the Biblical Genealogy application including:
 * - Console and UI logging with configurable levels
 * - Performance testing and benchmarking
 * - Mock data generation for testing
 * - Data integrity validation
 * - Debug state export for troubleshooting
 */

// Import dependencies based on environment
let GenealogyDataUtils, DataProcessor;

try { 
  if (typeof require !== 'undefined') {
    GenealogyDataUtils = require('./genealogy-data-utils.js');
    DataProcessor = require('./DataProcessor.js');
  } else if (typeof window !== 'undefined') {
    GenealogyDataUtils = window.GenealogyDataUtils || {};
    DataProcessor = window.DataProcessor || {};
  }
} catch (error) {
  console.warn('Failed to import dependencies, some features may be limited:', error);
}

/**
 * Debug configuration object
 * Controls behavior of debugging utilities
 */
const DEBUG_CONFIG = {
  enabled: true,               // Master toggle for debugging
  consoleEnabled: true,        // Enable console output
  logLevel: 'info',            // Current log level (debug, info, warn, error)
  panelEnabled: false,         // Enable debug panel in UI
  mockEnabled: false,          // Enable mock data mode
  performanceLogging: true,    // Log performance metrics
  dataValidation: true,        // Validate data integrity
  logToStorage: false,         // Save logs to localStorage
  maxLogEntries: 500,          // Maximum number of log entries to keep
  exportIncludeData: false,    // Include full data in exports (can be large)
  breakOnError: false,         // Pause execution (debugger) on errors
  colorOutput: true,           // Use colors in console output
};

// Original GenealogyDataUtils reference for mock mode
let originalLoadGenealogyData = null;

// Store for log entries
const logStore = [];

// Performance tracking
const performanceMarks = {};

// Log level definitions and colors
const LOG_LEVELS = {
  debug: { value: 0, color: '#6c757d' },
  info: { value: 1, color: '#0275d8' },
  warn: { value: 2, color: '#f0ad4e' },
  error: { value: 3, color: '#d9534f' }
};

/**
 * Log a debug message to console and/or debug panel
 * @param {string} message - The message to log
 * @param {string} level - Log level (debug, info, warn, error)
 * @param {any} data - Optional data to include with the log
 */
function debugLog(message, level = 'info', data = null) {
  // Skip if debugging is disabled
  if (!DEBUG_CONFIG.enabled && !DEBUG_CONFIG.consoleEnabled) return;
  
  // Skip if log level is below configuration
  if (LOG_LEVELS[level].value < LOG_LEVELS[DEBUG_CONFIG.logLevel].value) return;
  
  const timestamp = new Date();
  const logEntry = {
    timestamp,
    level,
    message,
    data: data ? deepClone(data) : null
  };
  
  // Add to log store
  logStore.push(logEntry);
  
  // Trim log if it exceeds maximum size
  if (logStore.length > DEBUG_CONFIG.maxLogEntries) {
    logStore.shift();
  }
  
  // Console output
  if (DEBUG_CONFIG.consoleEnabled && typeof console !== 'undefined') {
    const formattedTime = timestamp.toISOString().substring(11, 19);
    const consoleMethod = level === 'debug' ? 'log' : level;
    
    if (DEBUG_CONFIG.colorOutput && typeof window !== 'undefined') {
      const style = `color: ${LOG_LEVELS[level].color}; font-weight: bold;`;
      
      if (data) {
        console[consoleMethod](`%c[${formattedTime}] [${level.toUpperCase()}] ${message}`, style, data);
      } else {
        console[consoleMethod](`%c[${formattedTime}] [${level.toUpperCase()}] ${message}`, style);
      }
    } else {
      if (data) {
        console[consoleMethod](`[${formattedTime}] [${level.toUpperCase()}] ${message}`, data);
      } else {
        console[consoleMethod](`[${formattedTime}] [${level.toUpperCase()}] ${message}`);
      }
    }
  }
  
  // Update debug panel if enabled
  if (DEBUG_CONFIG.panelEnabled) {
    updateDebugPanel(logEntry);
  }
  
  // Save to localStorage if enabled
  if (DEBUG_CONFIG.logToStorage && typeof localStorage !== 'undefined') {
    try {
      const storedLogs = JSON.parse(localStorage.getItem('debug_logs') || '[]');
      storedLogs.push({
        timestamp: timestamp.toISOString(),
        level,
        message,
        data: data ? JSON.stringify(data).substring(0, 500) : null // Truncate for storage
      });
      
      // Keep only last 100 entries in storage
      if (storedLogs.length > 100) {
        storedLogs.splice(0, storedLogs.length - 100);
      }
      
      localStorage.setItem('debug_logs', JSON.stringify(storedLogs));
    } catch (error) {
      console.error('Failed to save log to localStorage:', error);
    }
  }
  
  // Break execution on errors if configured
  if (DEBUG_CONFIG.breakOnError && level === 'error') {
    debugger; // eslint-disable-line no-debugger
  }
}

// Convenience logging methods
const debug = (message, data) => debugLog(message, 'debug', data);
const info = (message, data) => debugLog(message, 'info', data);
const warn = (message, data) => debugLog(message, 'warn', data);
const error = (message, data) => debugLog(message, 'error', data);

/**
 * Initialize the debug utilities
 * @param {Object} options - Configuration options to override defaults
 */
function initialize(options = {}) {
  // Apply configuration
  Object.assign(DEBUG_CONFIG, options);
  
  info('Debug utilities initialized', DEBUG_CONFIG);
  
  // Setup debug panel if enabled
  if (DEBUG_CONFIG.panelEnabled && typeof document !== 'undefined') {
    setupDebugPanel();
  }
  
  // Setup mock mode if enabled
  if (DEBUG_CONFIG.mockEnabled) {
    enableMockMode();
  }
  
  // Connect to DataProcessor if available
  if (DataProcessor && typeof DataProcessor.initialize === 'function') {
    DataProcessor.initialize({
      errorCallback: (error) => {
        debugLog(`DataProcessor error: ${error.message}`, 'error', error);
      },
      performanceCallback: (metric) => {
        if (DEBUG_CONFIG.performanceLogging) {
          debugLog(`Performance: ${metric.operation} completed in ${metric.duration}ms`, 'debug', metric);
        }
      }
    });
  }
  
  return DEBUG_CONFIG;
}

/**
 * Create a deep clone of an object
 * @param {any} obj - The object to clone
 * @returns {any} - The cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  try {
    // Fast path for simple objects
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    // Fallback for circular references or other issues
    const clone = Array.isArray(obj) ? [] : {};
    
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clone[key] = deepClone(obj[key]);
      }
    }
    
    return clone;
  }
}

/**
 * Clear all stored logs
 */
function clearLogs() {
  logStore.length = 0;
  info('Logs cleared');
  
  if (DEBUG_CONFIG.logToStorage && typeof localStorage !== 'undefined') {
    localStorage.removeItem('debug_logs');
  }
  
  if (DEBUG_CONFIG.panelEnabled) {
    updateDebugPanel();
  }
}

/**
 * Get all stored logs
 * @param {string} level - Optional filter by log level
 * @returns {Array} - Array of log entries
 */
function getLogs(level = null) {
  if (level && LOG_LEVELS[level]) {
    return logStore.filter(entry => entry.level === level);
  }
  return [...logStore];
}

/**
 * Enable mock data mode
 * Overrides GenealogyDataUtils.loadGenealogyData with mock implementation
 */
function enableMockMode() {
  if (!GenealogyDataUtils) {
    warn('Cannot enable mock mode - GenealogyDataUtils not available');
    return false;
  }
  
  // Store original for restoration
  if (!originalLoadGenealogyData && GenealogyDataUtils.loadGenealogyData) {
    originalLoadGenealogyData = GenealogyDataUtils.loadGenealogyData;
  }
  
  // Override with mock implementation
  GenealogyDataUtils.loadGenealogyData = async function(options = {}) {
    const mockOptions = {
      persons: options.persons || 100,
      generations: options.generations || 5,
      ...options
    };
    
    debug('Using mock data instead of loading from source', mockOptions);
    return createMockData(mockOptions);
  };
  
  DEBUG_CONFIG.mockEnabled = true;
  info('Enabled mock mode - GenealogyDataUtils.loadGenealogyData has been overridden');
  
  return true;
}

/**
 * Disable mock data mode
 * Restores original GenealogyDataUtils.loadGenealogyData
 */
function disableMockMode() {
  if (!GenealogyDataUtils || !originalLoadGenealogyData) {
    warn('Cannot disable mock mode - original function not available');
    return false;
  }
  
  GenealogyDataUtils.loadGenealogyData = originalLoadGenealogyData;
  DEBUG_CONFIG.mockEnabled = false;
  info('Disabled mock mode - GenealogyDataUtils.loadGenealogyData has been restored');
  
  return true;
}

/**
 * Create mock genealogy data for testing
 * @param {Object} options - Configuration for mock data
 * @returns {Object} - Generated mock data
 */
function createMockData(options = {}) {
  const defaults = {
    persons: 100,      // Number of people to generate
    generations: 5,    // Number of generations
    startYear: -4000,  // Start year (BC is negative)
    endYear: 100,      // End year
    avgChildren: 3,    // Average children per person
    avgLifespan: 70,   // Average lifespan
    missingData: 0.1,  // Probability of missing data
    seed: Date.now(),  // Random seed
  };
  
  const config = { ...defaults, ...options };
  debug('Creating mock data with config', config);
  
  // Seed random number generator for reproducible results
  let seed = config.seed;
  function random() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  
  // Generate unique ID
  let nextId = 1;
  function generateId() {
    return `p${nextId++}`;
  }
  
  // Generate random name
  function generateName(gender) {
    const maleNames = ['Abraham', 'Isaac', 'Jacob', 'Judah', 'Joseph', 'Moses', 'Aaron', 'David', 'Solomon'];
    const femaleNames = ['Sarah', 'Rebekah', 'Leah', 'Rachel', 'Miriam', 'Deborah', 'Ruth', 'Esther'];
    
    const names = gender === 'female' ? femaleNames : maleNames;
    return names[Math.floor(random() * names.length)];
  }
  
  // Generate birth/death years
  function generateLifespan(generation) {
    const generationSpan = (config.endYear - config.startYear) / config.generations;
    const birthYear = Math.floor(config.startYear + (generation * generationSpan) + (random() * generationSpan * 0.8));
    const lifespan = Math.floor(config.avgLifespan * (0.7 + random() * 0.6)); // 70% to 130% of avg lifespan
    const deathYear = birthYear + lifespan;
    
    return {
      birthYear,
      deathYear: deathYear > config.endYear ? null : deathYear
    };
  }
  
  // Generate nodes and links
  const nodes = [];
  const links = [];
  const generations = Array(config.generations).fill().map(() => []);
  
  // Create root generation
  for (let i = 0; i < Math.ceil(config.persons / config.generations); i++) {
    const gender = random() > 0.5 ? 'male' : 'female';
    const lifespan = generateLifespan(0);
    
    const person = {
      id: generateId(),
      name: generateName(gender),
      gender,
      birthYear: lifespan.birthYear,
      deathYear: lifespan.deathYear,
      generation: 0
    };
    
    // Add some missing data 
    if (random() < config.missingData) {
      if (random() > 0.5) {
        person.birthYear = null;
      } else {
        person.deathYear = null;
      }
    }
    
    nodes.push(person);
    generations[0].push(person);
  }
  
  // Create subsequent generations
  for (let gen = 1; gen < config.generations; gen++) {
    const prevGenCount = generations[gen-1].length;
    const thisGenCount = Math.ceil(config.persons / config.generations);
    
    for (let i = 0; i < thisGenCount; i++) {
      const gender = random() > 0.5 ? 'male' : 'female';
      const lifespan = generateLifespan(gen);
      
      const person = {
        id: generateId(),
        name: generateName(gender),
        gender,
        birthYear: lifespan.birthYear,
        deathYear: lifespan.deathYear,
        generation: gen
      };
      
      // Add some missing data
      if (random() < config.missingData) {
        if (random() > 0.5) {
          person.birthYear = null;
        } else {
          person.deathYear = null;
        }
      }
      
      nodes.push(person);
      generations[gen].push(person);
      
      // Create parent relationships
      const parentCount = 1 + Math.floor(random() * 2); // 1 or 2 parents
      const possibleParents = [...generations[gen-1]];
      
      for (let p = 0; p < parentCount && possibleParents.length > 0; p++) {
        const parentIndex = Math.floor(random() * possibleParents.length);
        const parent = possibleParents[parentIndex];
        possibleParents.splice(parentIndex, 1); // Remove to avoid duplicate
        
        links.push({
          source: parent.id,
          target: person.id,
          type: 'parent-child'
        });
      }
    }
  }
  
  // Add some sibling and spouse relationships
  for (let gen = 0; gen < config.generations; gen++) {
    const genPersons = generations[gen];
    
    // Spouse relationships
    for (let i = 0; i < genPersons.length; i++) {
      const person = genPersons[i];
      
      // ~70% chance of having a spouse if adult
      if (random() < 0.7) {
        // Find spouse candidate of opposite gender
        const spouseCandidates = genPersons.filter(p => 
          p.id !== person.id && 
          p.gender !== person.gender &&
          !links.some(l => 
            (l.source === person.id && l.target === p.id && l.type === 'spouse') ||
            (l.source === p.id && l.target === person.id && l.type === 'spouse')
          )
        );
        
        if (spouseCandidates.length > 0) {
          const spouse = spouseCandidates[Math.floor(random() * spouseCandidates.length)];
          
          links.push({
            source: person.id,
            target: spouse.id,
            type: 'spouse'
          });
        }
      }
    }
  }
  
  // Final data object
  const mockData = {
    nodes,
    links,
    metadata: {
      title: 'Mock Biblical Genealogy Data',
      description: 'Generated for testing purposes',
      generatedAt: new Date().toISOString(),
      config: config
    }
  };
  
  info(`Created mock data with ${nodes.length} people and ${links.length} relationships`);
  return mockData;
}

/**
 * Start a performance timer
 * @param {string} label - Timer label
 */
function startPerformanceTimer(label) {
  if (!DEBUG_CONFIG.performanceLogging) return;
  
  const startTime = performance ? performance.now() : Date.now();
  performanceMarks[label] = {
    startTime,
    label
  };
  
  debug(`Performance timing started: ${label}`);
  
  // Also use DataProcessor's tracking if available
  if (DataProcessor && typeof DataProcessor.startPerformanceTracking === 'function') {
    DataProcessor.startPerformanceTracking(label);
  }
}

/**
 * End a performance timer and get duration
 * @param {string} label - Timer label
 * @param {boolean} logResult - Whether to log the result
 * @returns {number|null} - Duration in milliseconds or null if not found
 */
function endPerformanceTimer(label, logResult = true) {
  if (!DEBUG_CONFIG.performanceLogging) return null;
  
  const endTime = performance ? performance.now() : Date.now();
  const mark = performanceMarks[label];
  
  if (!mark) {
    warn(`Performance timer "${label}" not found`);
    return null;
  }
  
  const duration = endTime - mark.startTime;
  
  // Update mark with end time and duration
  performanceMarks[label] = {
    ...mark,
    endTime,
    duration
  };
  
  // Also use DataProcessor's tracking if available
  if (DataProcessor && typeof DataProcessor.endPerformanceTracking === 'function') {
    DataProcessor.endPerformanceTracking(label);
  }
  
  if (logResult) {
    info(`Performance: ${label} completed in ${duration.toFixed(2)}ms`);
  }
  
  return duration;
}
/**
 * Run a performance test on a function
 * @param {Function} fn - Function to test
 * @param {Array} args - Arguments to pass to the function
 * @param {Object} options - Test options
 * @returns {Object} - Test results
 */
async function runPerformanceTest(fn, args = [], options = {}) {
  const settings = {
    iterations: 5,
    warmup: 1,
    useMockData: false,
    mockDataOptions: { persons: 100, generations: 5 },
    ...options
  };
  
  if (!fn || typeof fn !== 'function') {
    error('Invalid function provided for performance test');
    return { success: false, error: 'Invalid function' };
  }
  
  info(`Running performance test for ${fn.name || 'anonymous function'}`, settings);
  
  // Prepare test data if needed
  let testData;
  if (settings.useMockData) {
    testData = createMockData(settings.mockDataOptions);
  } else if (GenealogyDataUtils) {
    try {
      testData = await GenealogyDataUtils.loadGenealogyData();
    } catch (error) {
      warn(`Error loading data for performance test: ${error.message}`, error);
      testData = createMockData(settings.mockDataOptions);
    }
  }
  
  // Run warmup iterations
  info(`Running ${settings.warmup} warmup iterations...`);
  for (let i = 0; i < settings.warmup; i++) {
    try {
      const testArgs = args.length > 0 ? args : testData ? [testData] : [];
      await fn(...testArgs);
    } catch (error) {
      warn(`Error during warmup: ${error.message}`, error);
    }
  }
  
  // Run timed iterations
  const results = [];
  info(`Running ${settings.iterations} test iterations...`);
  
  for (let i = 0; i < settings.iterations; i++) {
    try {
      const testArgs = args.length > 0 ? args : testData ? [testData] : [];
      
      const startTime = performance ? performance.now() : Date.now();
      const result = await fn(...testArgs);
      const endTime = performance ? performance.now() : Date.now();
      
      const duration = endTime - startTime;
      results.push({
        iteration: i + 1,
        duration,
        timestamp: new Date().toISOString()
      });
      
      debug(`Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    } catch (error) {
      error(`Error during test iteration ${i + 1}: ${error.message}`, error);
      results.push({
        iteration: i + 1,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Calculate statistics
  const durations = results.filter(r => !r.error).map(r => r.duration);
  const stats = {
    min: durations.length ? Math.min(...durations) : null,
    max: durations.length ? Math.max(...durations) : null,
    mean: durations.length ? durations.reduce((sum, d) => sum + d, 0) / durations.length : null,
    median: durations.length ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)] : null,
    successful: durations.length,
    failed: results.length - durations.length,
    total: results.length
  };
  
  info(`Performance test completed for ${fn.name || 'anonymous function'}`, stats);
  
  return {
    success: true,
    function: fn.name || 'anonymous',
    settings,
    results,
    stats,
    timestamp: new Date().toISOString()
  };
}

/**
 * Create a data integrity report for genealogy data
 * @param {Object} data - Genealogy data to validate
 * @returns {Object} - Validation report
 */
function createDataIntegrityReport(data) {
  if (!data) {
    error('No data provided for integrity check');
    return {
      valid: false,
      errors: ['No data provided for integrity check']
    };
  }
  
  info('Creating data integrity report');
  
  // Use GenealogyDataUtils validation if available
  if (GenealogyDataUtils && typeof GenealogyDataUtils.validateGenealogyData === 'function') {
    try {
      startPerformanceTimer('validateGenealogyData');
      const validation = GenealogyDataUtils.validateGenealogyData(data);
      endPerformanceTimer('validateGenealogyData');
      
      if (!validation.valid) {
        warn('GenealogyDataUtils validation failed', validation);
      } else {
        debug('GenealogyDataUtils validation passed');
      }
      
      return validation;
    } catch (error) {
      warn(`Error using GenealogyDataUtils validation: ${error.message}`, error);
      // Continue with fallback validation
    }
  }
  
  // Fallback validation
  const report = {
    valid: true,
    errors: [],
    warnings: [],
    statistics: {},
    missingRequired: [],
    invalidValues: [],
    referencesCheck: { valid: true, errors: [] },
    timestamp: new Date().toISOString()
  };
  
  // Check for required top-level properties
  const requiredProperties = ['nodes', 'links'];
  for (const prop of requiredProperties) {
    if (!data[prop]) {
      report.valid = false;
      report.errors.push(`Missing required property: ${prop}`);
      report.missingRequired.push(prop);
    }
  }
  
  // Check nodes
  if (data.nodes) {
    // Validate nodes array
    if (!Array.isArray(data.nodes)) {
      report.valid = false;
      report.errors.push('nodes property must be an array');
    } else {
      report.statistics.nodeCount = data.nodes.length;
      
      // Count by gender and check required properties
      const genderStats = {};
      const nodesWithoutId = [];
      const invalidNodes = [];
      
      for (let i = 0; i < data.nodes.length; i++) {
        const node = data.nodes[i];
        
        // Check for ID
        if (!node.id) {
          nodesWithoutId.push(i);
          report.valid = false;
          report.errors.push(`Node at index ${i} is missing required 'id' property`);
        }
        
        // Track gender stats
        const gender = node.gender || 'unknown';
        genderStats[gender] = (genderStats[gender] || 0) + 1;
        
        // Check for invalid birth/death years
        if (node.birthYear && node.deathYear && node.birthYear > node.deathYear) {
          invalidNodes.push(i);
          report.valid = false;
          report.errors.push(`Node ${node.id || i} has birthYear > deathYear (${node.birthYear} > ${node.deathYear})`);
        }
      }
      
      report.statistics.genderDistribution = genderStats;
      
      if (nodesWithoutId.length > 0) {
        report.warnings.push(`${nodesWithoutId.length} nodes missing IDs`);
      }
      
      if (invalidNodes.length > 0) {
        report.invalidValues.push({
          property: 'nodes',
          count: invalidNodes.length,
          indexes: invalidNodes
        });
      }
    }
  }
  
  // Check links
  if (data.links) {
    // Validate links array
    if (!Array.isArray(data.links)) {
      report.valid = false;
      report.errors.push('links property must be an array');
    } else {
      report.statistics.linkCount = data.links.length;
      
      // Count by type
      const typeStats = {};
      const linksWithMissingProperties = [];
      const invalidLinks = [];
      
      for (let i = 0; i < data.links.length; i++) {
        const link = data.links[i];
        
        // Check required properties
        if (!link.source || !link.target) {
          linksWithMissingProperties.push(i);
          report.valid = false;
          report.errors.push(`Link at index ${i} is missing required 'source' or 'target' property`);
        }
        
        // Track type stats
        const type = link.type || 'unknown';
        typeStats[type] = (typeStats[type] || 0) + 1;
        
        // Check for self-references
        if (link.source === link.target) {
          invalidLinks.push(i);
          report.warnings.push(`Link at index ${i} is a self-reference (${link.source} -> ${link.target})`);
        }
      }
      
      report.statistics.relationshipDistribution = typeStats;
      
      if (linksWithMissingProperties.length > 0) {
        report.invalidValues.push({
          property: 'links',
          count: linksWithMissingProperties.length,
          indexes: linksWithMissingProperties
        });
      }
    }
  }
  
  // Check references if both nodes and links exist
  if (Array.isArray(data.nodes) && Array.isArray(data.links)) {
    const nodeIds = new Set(data.nodes.map(node => node.id));
    const brokenLinks = [];
    
    for (let i = 0; i < data.links.length; i++) {
      const link = data.links[i];
      
      if (link.source && link.target) {
        if (!nodeIds.has(link.source)) {
          brokenLinks.push({ index: i, reason: `source '${link.source}' not found` });
        }
        
        if (!nodeIds.has(link.target)) {
          brokenLinks.push({ index: i, reason: `target '${link.target}' not found` });
        }
      }
    }
    
    if (brokenLinks.length > 0) {
      report.referencesCheck.valid = false;
      report.referencesCheck.brokenLinks = brokenLinks;
      report.warnings.push(`${brokenLinks.length} links reference non-existent nodes`);
    }
  }
  
  // Check for metadata
  if (!data.metadata) {
    report.warnings.push('Missing metadata property');
  }
  
  return report;
}

/**
 * Export the current debug state including logs and configuration
 * @param {Object} options - Export options
 * @returns {Object} - Debug state
 */
function exportDebugState(options = {}) {
  const settings = {
    includeLogs: true,
    includeConfig: true,
    includePerformance: true,
    includeData: DEBUG_CONFIG.exportIncludeData,
    format: 'json',
    maxLogEntries: 1000,
    ...options
  };
  
  info('Exporting debug state', settings);
  
  const state = {
    timestamp: new Date().toISOString(),
    application: 'Biblical Genealogy Visualization',
    version: window.APP_VERSION || '1.0.0',
    environment: typeof process !== 'undefined' && process.env.NODE_ENV ? process.env.NODE_ENV : 'browser',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    screenSize: typeof window !== 'undefined' ? {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    } : 'unknown'
  };
  
  // Include configuration if requested
  if (settings.includeConfig) {
    state.configuration = {
      debug: deepClone(DEBUG_CONFIG),
      application: typeof window !== 'undefined' && window.AppSettings ? 
        deepClone(window.AppSettings) : 'not available'
    };
  }
  
  // Include performance metrics if requested
  if (settings.includePerformance) {
    state.performance = {
      timers: Array.from(performanceTimers.entries()).map(([key, value]) => ({
        name: key,
        ...value
      })),
      marks: deepClone(performanceMarks),
      memory: typeof window !== 'undefined' && window.performance && window.performance.memory ? 
        {
          usedJSHeapSize: window.performance.memory.usedJSHeapSize,
          totalJSHeapSize: window.performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
        } : 'not available',
      resourceTiming: typeof window !== 'undefined' && window.performance ? 
        extractResourceTiming() : 'not available'
    };
  }
  
  // Include logs if requested
  if (settings.includeLogs) {
    // Get the most recent logs up to the specified limit
    const maxEntries = Math.min(settings.maxLogEntries, logStore.length);
    state.logs = logStore.slice(-maxEntries).map(entry => ({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      message: entry.message,
      data: entry.data
    }));
  }
  
  // Include application data if requested
  if (settings.includeData) {
    try {
      state.data = {
        nodesCount: 0,
        linksCount: 0,
        selectedNode: null,
        visibleNodes: 0,
        filters: {}
      };
      
      // Try to get data from various possible sources
      if (typeof window !== 'undefined') {
        // From global state
        if (window.AppState && window.AppState.data) {
          const appData = window.AppState.data;
          state.data.nodesCount = appData.nodes ? appData.nodes.length : 0;
          state.data.linksCount = appData.links ? appData.links.length : 0;
          state.data.selectedNode = appData.selectedNode || null;
          state.data.filters = appData.filters || {};
        }
        
        // From D3 visualization if available
        if (window.visualization && window.visualization.getState) {
          const visState = window.visualization.getState();
          state.data.visibleNodes = visState.visibleNodes || 0;
          state.data.zoomLevel = visState.zoomLevel || 1;
          state.data.transform = visState.transform || null;
        }
      }
    } catch (err) {
      warn('Failed to include application data in debug export', err);
      state.data = { error: 'Failed to collect data: ' + err.message };
    }
  }
  
  // Save export to file if requested
  if (settings.saveToFile && typeof window !== 'undefined') {
    const fileName = `debug-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    saveToFile(state, fileName);
  }
  
  return state;
}

/**
 * Helper function to extract resource timing information
 * @returns {Array} Resource timing entries
 */
function extractResourceTiming() {
  if (typeof window === 'undefined' || !window.performance || !window.performance.getEntriesByType) {
    return [];
  }
  
  try {
    // Get resource timing entries
    const resources = window.performance.getEntriesByType('resource');
    
    // Map to a more manageable format
    return resources.map(resource => ({
      name: resource.name.split('/').pop(), // Just the filename
      type: resource.initiatorType,
      duration: Math.round(resource.duration),
      size: resource.transferSize || 0,
      startTime: Math.round(resource.startTime)
    })).sort((a, b) => b.duration - a.duration); // Sort by duration (longest first)
  } catch (err) {
    warn('Failed to extract resource timing', err);
    return [];
  }
}

/**
 * Save data to a file
 * @param {Object} data - Data to save
 * @param {string} fileName - Name of the file
 */
function saveToFile(data, fileName) {
  try {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
    
    info(`Debug state exported to ${fileName}`);
  } catch (err) {
    error('Failed to save debug state to file', err);
  }
}

/**
 * Utility function for deep cloning objects
 * @param {*} obj - Object to clone
 * @returns {*} - Cloned object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Handle special cases
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Map) {
    const clone = new Map();
    obj.forEach((value, key) => {
      clone.set(key, deepClone(value));
    });
    return clone;
  }
  
  if (obj instanceof Set) {
    const clone = new Set();
    obj.forEach(value => {
      clone.add(deepClone(value));
    });
    return clone;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  // Handle regular objects
  const clone = {};
  Object.keys(obj).forEach(key => {
    clone[key] = deepClone(obj[key]);
  });
  
  return clone;
}

/**
 * Performance tracking utilities
 */
const performanceTimers = new Map();

/**
 * Start a performance timer
 * @param {string} label - Timer label
 * @returns {number} - Start time
 */
function startPerformanceTimer(label) {
  const startTime = performance.now();
  performanceTimers.set(label, {
    startTime,
    endTime: null,
    duration: null,
    active: true
  });
  
  debug(`Performance timer started: ${label}`);
  return startTime;
}

/**
 * End a performance timer
 * @param {string} label - Timer label
 * @returns {number} - Duration in milliseconds
 */
function endPerformanceTimer(label) {
  const timer = performanceTimers.get(label);
  
  if (!timer) {
    warn(`Attempted to end unknown timer: ${label}`);
    return 0;
  }
  
  if (!timer.active) {
    warn(`Timer already ended: ${label}`);
    return timer.duration;
  }
  
  const endTime = performance.now();
  const duration = endTime - timer.startTime;
  
  performanceTimers.set(label, {
    startTime: timer.startTime,
    endTime,
    duration,
    active: false
  });
  
  debug(`Performance timer ended: ${label} (${duration.toFixed(2)}ms)`);
  return duration;
}

/**
 * Create a performance mark
 * @param {string} name - Mark name
 * @param {Object} [data] - Additional data
 */
function setPerformanceMark(name, data = null) {
  const timestamp = performance.now();
  performanceMarks[name] = {
    timestamp,
    data: data ? deepClone(data) : null
  };
  
  // Also create a browser performance mark if available
  if (typeof performance !== 'undefined' && performance.mark) {
    try {
      performance.mark(name);
    } catch (e) {
      // Ignore errors
    }
  }
  
  debug(`Performance mark set: ${name}`);
}

/**
 * Measure time between two marks
 * @param {string} name - Measure name
 * @param {string} startMark - Start mark name
 * @param {string} endMark - End mark name
 * @returns {number} - Duration in milliseconds
 */
function measurePerformance(name, startMark, endMark) {
  const startData = performanceMarks[startMark];
  const endData = performanceMarks[endMark];
  
  if (!startData) {
    warn(`Start mark not found: ${startMark}`);
    return 0;
  }
  
  if (!endData) {
    warn(`End mark not found: ${endMark}`);
    return 0;
  }
  
  const duration = endData.timestamp - startData.timestamp;
  
  // Record as a timer for consistency
  performanceTimers.set(name, {
    startTime: startData.timestamp,
    endTime: endData.timestamp,
    duration,
    active: false,
    isMeasure: true
  });
  
  // Also create a browser performance measure if available
  if (typeof performance !== 'undefined' && performance.measure) {
    try {
      performance.measure(name, startMark, endMark);
    } catch (e) {
      // Ignore errors
    }
  }
  
  info(`Performance measure: ${name} = ${duration.toFixed(2)}ms`);
  return duration;
}

/**
 * Clear all performance data
 */
function clearPerformanceData() {
  performanceTimers.clear();
  Object.keys(performanceMarks).forEach(key => delete performanceMarks[key]);
  
  // Clear browser performance data if available
  if (typeof performance !== 'undefined') {
    if (performance.clearMarks) performance.clearMarks();
    if (performance.clearMeasures) performance.clearMeasures();
  }
  
  debug('Performance data cleared');
}

// Export the public API
const DebugUtils = {
  // Core functionality
  initialize,
  getConfig: () => deepClone(DEBUG_CONFIG),
  setConfig: (config = {}) => {
    Object.assign(DEBUG_CONFIG, config);
    debug('Debug configuration updated', DEBUG_CONFIG);
    return deepClone(DEBUG_CONFIG);
  },
  
  // Logging
  log: debugLog,
  debug,
  info,
  warn,
  error,
  clearLogs: () => {
    logStore.length = 0;
    debug('Logs cleared');
  },
  getLogs: () => logStore.map(entry => ({
    timestamp: entry.timestamp.toISOString(),
    level: entry.level,
    message: entry.message,
    data: entry.data
  })),
  
  // Performance tracking
  startTimer: startPerformanceTimer,
  endTimer: endPerformanceTimer,
  mark: setPerformanceMark,
  measure: measurePerformance,
  clearPerformance: clearPerformanceData,
  getPerformanceData: () => ({
    timers: Array.from(performanceTimers.entries()).map(([key, value]) => ({
      name: key,
      ...value
    })),
    marks: deepClone(performanceMarks)
  }),
  
  // Data validation
  validateData,
  
  // Debug state management
  exportDebugState,
  
  // Mock data handling
  enableMockMode: () => {
    if (!DEBUG_CONFIG.mockEnabled) {
      if (GenealogyDataUtils && GenealogyDataUtils.loadGenealogyData) {
        originalLoadGenealogyData = GenealogyDataUtils.loadGenealogyData;
        GenealogyDataUtils.loadGenealogyData = generateMockData;
        DEBUG_CONFIG.mockEnabled = true;
        info('Mock mode enabled');
      } else {
        warn('Cannot enable mock mode - GenealogyDataUtils not available');
      }
    }
  },
  disableMockMode: () => {
    if (DEBUG_CONFIG.mockEnabled && originalLoadGenealogyData) {
      GenealogyDataUtils.loadGenealogyData = originalLoadGenealogyData;
      DEBUG_CONFIG.mockEnabled = false;
      info('Mock mode disabled');
    }
  }
};

// Initialize debug panel in UI if we're in a browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('load', () => {
    // Only initialize if configured to do so
    if (DEBUG_CONFIG.panelEnabled) {
      initDebugPanel();
    }
    
    // Add keyboard shortcut (Alt+D) to toggle debug panel
    document.addEventListener('keydown', (event) => {
      if (event.altKey && event.key === 'd') {
        DEBUG_CONFIG.panelEnabled = !DEBUG_CONFIG.panelEnabled;
        if (DEBUG_CONFIG.panelEnabled) {
          initDebugPanel();
        } else {
          const panel = document.getElementById('debug-panel');
          if (panel) panel.style.display = 'none';
        }
      }
    });
  });
}

// Make DebugUtils available in global scope for browser environments
if (typeof window !== 'undefined') {
  window.DebugUtils = DebugUtils;
}

// Export for module environments
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = DebugUtils;
}

// Return the public API
return DebugUtils;
