/**
 * Biblical Genealogy Debug Utilities
 * 
 * A specialized module for debugging, testing, and development support
 * for the Biblical Genealogy Visualization project.
 * 
 * @module DebugUtils
 * @version 1.0.0
 * @requires GenealogyDataUtils
 */

// Import the GenealogyDataUtils if in a module environment
let GenealogyDataUtils;
try {
  if (typeof require !== 'undefined') {
    GenealogyDataUtils = require('./genealogy-data-utils.js');
  } else if (typeof window !== 'undefined' && window.GenealogyDataUtils) {
    GenealogyDataUtils = window.GenealogyDataUtils;
  }
} catch (error) {
  console.warn('Failed to import GenealogyDataUtils, some features may be limited:', error);
}

/**
 * Debug configuration settings
 */
const DEBUG_CONFIG = {
  enabled: true,
  traceEnabled: false,
  breakpointEnabled: false,
  debugPanelId: 'debug-panel',
  consoleEnabled: true,
  performanceTracking: true,
  visualDebugging: true,
  dataInspectionDepth: 3,
  logHistory: {
    enabled: true,
    maxEntries: 100
  },
  mockDataSource: null
};

/**
 * Performance metrics storage
 * @private
 */
const performanceMetrics = {
  timers: new Map(),
  measurements: []
};

/**
 * Log history storage
 * @private
 */
const logHistory = [];

/**
 * Debug state information
 * @private
 */
const debugState = {
  breakpoints: new Set(),
  watches: new Map(),
  selectedNode: null,
  inspectionPath: [],
  visualDebuggingEnabled: false,
  mockMode: false
};

/**
 * Creates or returns the debug panel DOM element
 * @returns {HTMLElement} - The debug panel element
 * @private
 */
function getDebugPanel() {
  let panel = document.getElementById(DEBUG_CONFIG.debugPanelId);
  
  if (!panel) {
    panel = document.createElement('div');
    panel.id = DEBUG_CONFIG.debugPanelId;
    panel.className = 'genealogy-debug-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 0;
      right: 0;
      width: 350px;
      height: 300px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: monospace;
      font-size: 12px;
      padding: 10px;
      overflow: auto;
      z-index: 10000;
      border-top-left-radius: 8px;
      display: ${DEBUG_CONFIG.enabled ? 'block' : 'none'};
    `;
    
    // Add header with controls
    const header = document.createElement('div');
    header.className = 'debug-panel-header';
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #333;
    `;
    
    const title = document.createElement('div');
    title.textContent = 'Genealogy Debug Panel';
    title.style.fontWeight = 'bold';
    
    const controls = document.createElement('div');
    
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear';
    clearBtn.style.marginRight = '5px';
    clearBtn.style.cursor = 'pointer';
    clearBtn.onclick = () => clearDebugPanel();
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cursor = 'pointer';
    closeBtn.onclick = () => toggleDebugPanel(false);
    
    controls.appendChild(clearBtn);
    controls.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(controls);
    panel.appendChild(header);
    
    // Create sections
    const logSection = document.createElement('div');
    logSection.className = 'debug-log-section';
    logSection.id = 'debug-log-section';
    
    const infoSection = document.createElement('div');
    infoSection.className = 'debug-info-section';
    infoSection.id = 'debug-info-section';
    infoSection.style.borderTop = '1px solid #333';
    infoSection.style.marginTop = '10px';
    infoSection.style.paddingTop = '10px';
    
    panel.appendChild(logSection);
    panel.appendChild(infoSection);
    
    document.body.appendChild(panel);
    
    // Make panel draggable
    makeElementDraggable(panel);
  }
  
  return panel;
}

/**
 * Make an element draggable
 * @param {HTMLElement} element - The element to make draggable
 * @private
 */
function makeElementDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  
  // Create handle for dragging at the top of the element
  const handle = document.createElement('div');
  handle.style.cssText = `
    cursor: move;
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 20px;
  `;
  element.appendChild(handle);
  
  handle.onmousedown = dragMouseDown;
  
  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call a function whenever the cursor moves
    document.onmousemove = elementDrag;
  }
  
  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = (element.offsetTop - pos2) + "px";
    element.style.left = (element.offsetLeft - pos1) + "px";
    element.style.bottom = "auto";
    element.style.right = "auto";
  }
  
  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

/**
 * Toggles the debug panel visibility
 * @param {boolean} [show] - Whether to show or hide the panel
 */
function toggleDebugPanel(show) {
  const panel = getDebugPanel();
  
  if (typeof show === 'boolean') {
    panel.style.display = show ? 'block' : 'none';
    DEBUG_CONFIG.enabled = show;
  } else {
    // Toggle
    const newState = panel.style.display === 'none';
    panel.style.display = newState ? 'block' : 'none';
    DEBUG_CONFIG.enabled = newState;
  }
  
  if (DEBUG_CONFIG.enabled) {
    updateDebugInfo();
  }
  
  // Log the state change but don't display in panel to avoid recursion
  consoleLog(`Debug panel ${DEBUG_CONFIG.enabled ? 'enabled' : 'disabled'}`);
}

/**
 * Logs a message to the debug panel
 * @param {string} message - The message to log
 * @param {string} [level='info'] - The log level (debug, info, warn, error)
 * @param {Object} [data] - Optional data to include
 */
function debugLog(message, level = 'info', data = null) {
  if (!DEBUG_CONFIG.enabled && !DEBUG_CONFIG.consoleEnabled) return;
  
  // Get timestamp
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  
  // Format message
  const formattedMessage = `[${timestamp}][${level.toUpperCase()}] ${message}`;
  
  // Log to console if enabled
  if (DEBUG_CONFIG.consoleEnabled) {
    consoleLog(formattedMessage, level, data);
  }
  
  // Save to history if enabled
  if (DEBUG_CONFIG.logHistory.enabled) {
    logHistory.push({
      timestamp: new Date(),
      level,
      message,
      data: data ? deepClone(data, 1) : null
    });
    
    // Trim history if needed
    if (logHistory.length > DEBUG_CONFIG.logHistory.maxEntries) {
      logHistory.shift();
    }
  }
  
  // Log to panel if enabled
  if (DEBUG_CONFIG.enabled) {
    const panel = getDebugPanel();
    const logSection = panel.querySelector('#debug-log-section');
    
    if (logSection) {
      const logEntry = document.createElement('div');
      logEntry.className = `debug-log-entry debug-level-${level}`;
      
      // Set color based on level
      let color;
      switch (level) {
        case 'error': color = '#ff5555'; break;
        case 'warn': color = '#ffff55'; break;
        case 'debug': color = '#55ffff'; break;
        case 'info':
        default: color = '#55ff55';
      }
      
      logEntry.style.color = color;
      logEntry.textContent = formattedMessage;
      
      // Add data toggle if data is provided
      if (data) {
        logEntry.style.cursor = 'pointer';
        logEntry.title = 'Click to expand/collapse data';
        
        const dataElement = document.createElement('pre');
        dataElement.className = 'debug-log-data';
        dataElement.style.display = 'none';
        dataElement.style.marginLeft = '10px';
        dataElement.style.marginTop = '5px';
        dataElement.style.whiteSpace = 'pre-wrap';
        dataElement.style.fontSize = '11px';
        dataElement.style.color = '#cccccc';
        dataElement.style.background = 'rgba(0,0,0,0.3)';
        dataElement.style.padding = '5px';
        dataElement.style.borderRadius = '3px';
        
        try {
          dataElement.textContent = formatObjectForDisplay(data);
        } catch (e) {
          dataElement.textContent = `[Error formatting data: ${e.message}]`;
        }
        
        logEntry.addEventListener('click', () => {
          dataElement.style.display = dataElement.style.display === 'none' ? 'block' : 'none';
        });
        
        logEntry.appendChild(dataElement);
      }
      
      logSection.appendChild(logEntry);
      
      // Auto-scroll to bottom
      logSection.scrollTop = logSection.scrollHeight;
    }
  }
  
  // Check for breakpoints
  if (DEBUG_CONFIG.breakpointEnabled && message && debugState.breakpoints.size > 0) {
    for (const breakpoint of debugState.breakpoints) {
      if (message.includes(breakpoint)) {
        debugBreak(`Breakpoint triggered: "${breakpoint}" in message "${message}"`);
        break;
      }
    }
  }
}

/**
 * Logs to the browser console with color
 * @param {string} message - The message to log
 * @param {string} level - The log level
 * @param {Object} [data] - Optional data to include
 * @private
 */
function consoleLog(message, level = 'info', data = null) {
  const styles = {
    debug: 'color: #00BFFF',
    info: 'color: #00FF00',
    warn: 'color: #FFFF00',
    error: 'color: #FF0000'
  };
  
  const style = styles[level] || styles.info;
  
  if (data) {
    console.groupCollapsed(`%c${message}`, style);
    console.dir(data);
    console.groupEnd();
  } else {
    console.log(`%c${message}`, style);
  }
}

/**
 * Clears the debug panel
 */
function clearDebugPanel() {
  const panel = getDebugPanel();
  const logSection = panel.querySelector('#debug-log-section');
  
  if (logSection) {
    logSection.innerHTML = '';
  }
  
  debugLog('Debug panel cleared');
}

/**
 * Updates the debug information panel
 * @private
 */
function updateDebugInfo() {
  if (!DEBUG_CONFIG.enabled) return;
  
  const panel = getDebugPanel();
  const infoSection = panel.querySelector('#debug-info-section');
  
  if (infoSection) {
    // Gather system information
    const systemInfo = {
      'Memory': getMemoryUsage(),
      'Debug Mode': DEBUG_CONFIG.enabled ? 'Enabled' : 'Disabled',
      'Trace': DEBUG_CONFIG.traceEnabled ? 'Enabled' : 'Disabled',
      'Mock Data': debugState.mockMode ? 'Enabled' : 'Disabled',
      'Visual Debug': debugState.visualDebuggingEnabled ? 'Enabled' : 'Disabled',
      'Selected Node': debugState.selectedNode || 'None',
      'Breakpoints': debugState.breakpoints.size,
      'Watches': debugState.watches.size
    };
    
    // Create or update info display
    infoSection.innerHTML = '<h4 style="margin: 0 0 5px 0">System Status</h4>';
    
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.fontSize = '11px';
    
    for (const [key, value] of Object.entries(systemInfo)) {
      const row = table.insertRow();
      const cell1 = row.insertCell(0);
      const cell2 = row.insertCell(1);
      
      cell1.textContent = key;
      cell1.style.fontWeight = 'bold';
      cell1.style.paddingRight = '10px';
      
      cell2.textContent = value;
    }
    
    infoSection.appendChild(table);
  }
}

/**
 * Gets a formatted string of current memory usage
 * @returns {string} - Formatted memory usage
 * @private
 */
function getMemoryUsage() {
  if (performance && performance.memory) {
    const memory = performance.memory;
    return `${Math.round(memory.usedJSHeapSize / 1048576)} MB / ${Math.round(memory.jsHeapSizeLimit / 1048576)} MB`;
  }
  return 'Unavailable';
}

/**
 * Formats an object for display in the debug panel
 * @param {Object} obj - The object to format
 * @param {number} [depth=0] - Current recursion depth
 * @param {number} [maxDepth=DEBUG_CONFIG.dataInspectionDepth] - Maximum recursion depth
 * @returns {string} - Formatted string representation
 * @private
 */
function formatObjectForDisplay(obj, depth = 0, maxDepth = DEBUG_CONFIG.dataInspectionDepth) {
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  
  const type = typeof obj;
  
  // Handle primitive types
  if (type !== 'object' && type !== 'function') {
    if (type === 'string') return `"${obj}"`;
    return String(obj);
  }
  
  // Handle maximum depth
  if (depth >= maxDepth) {
    if (Array.isArray(obj)) {
      return `Array(${obj.length}) [...]`;
    }
    return `${obj.constructor.name} {...}`;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    
    let result = '[\n';
    const indent = ' '.repeat((depth + 1) * 2);
    
    // Limit array items for display
    const displayLimit = 50;
    const displayItems = obj.length > displayLimit ? obj.slice(0, displayLimit) : obj;
    
    for (let i = 0; i < displayItems.length; i++) {
      result += `${indent}${formatObjectForDisplay(displayItems[i], depth + 1, maxDepth)}`;
      if (i < displayItems.length - 1) {
        result += ',';
      }
      result += '\n';
    }
    
    if (obj.length > displayLimit) {
      result += `${indent}... ${obj.length - displayLimit} more items\n`;
    }
    
    result += ' '.repeat(depth * 2) + ']';
    return result;
  }
  
  // Handle other objects
  try {
    if (obj instanceof Date) {
      return obj.toISOString();
    }
    
    if (obj instanceof Error) {
      return `${obj.name}: ${obj.message}`;
    }
    
    if (obj instanceof RegExp || obj instanceof String || obj instanceof Number || obj instanceof Boolean) {
      return String(obj);
    }
    
    // Handle DOM nodes
    if (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement) {
      return `<${obj.tagName.toLowerCase()}${obj.id ? ` id="${obj.id}"` : ''}${obj.className ? ` class="${obj.className}"` : ''}>`;
    }
    
    // Handle Maps and Sets
    if (obj instanceof Map) {
      return `Map(${obj.size}) {...}`;
    }
    
    if (obj instanceof Set) {
      return `Set(${obj.size}) {...}`;
    }
    
    // Handle plain objects
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    
    let result = '{\n';
    const indent = ' '.repeat((depth + 1) * 2);
    
    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i];
      result += `${indent}${key}: ${formatObjectForDisplay(value, depth + 1, maxDepth)}`;
      if (i < entries.length - 1) {
        result += ',';
      }
      result += '\n';
    }
    
    result += ' '.repeat(depth * 2) + '}';
    return result;
  } catch (e) {
    return `[Error formatting object: ${e.message}]`;
  }
}

/**
 * Creates a deep clone of an object with limited depth
 * @param {Object} obj - The object to clone
 * @param {number} [maxDepth=1] - The maximum recursion depth
 * @returns {Object} - A deep clone of the object
 * @private
 */
function deepClone(obj, maxDepth = 1) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  // Stop at max depth and return a placeholder
  if (maxDepth <= 0) {
    if (Array.isArray(obj)) {
      return `[Array(${obj.length})]`;
    }
    return `[Object ${obj.constructor.name}]`;
  }
  
  try {
    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => deepClone(item, maxDepth - 1));
    }
    
    // Handle special types
    if (obj instanceof Date) {
      return new Date(obj);
    }
    
    // Handle plain objects
    const clone = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clone[key] = deepClone(obj[key], maxDepth - 1);
      }
    }
    return clone;
  } catch (e) {
    return `[Error cloning: ${e.message}]`;
  }
}

/**
 * Starts a performance timer
 * @param {string} label - Label for the timer
 */
function startTimer(label) {
  if (!DEBUG_CONFIG.performanceTracking) return;
  
  if (!label) {
    label = `Timer_${performanceMetrics.timers.size}`;
  }
  
  if (performanceMetrics.timers.has(label)) {
    debugLog(`Restarting timer: ${label}`, 'debug');
  } else {
    debugLog(`Starting timer: ${label}`, 'debug');
  }
  
  performanceMetrics.timers.set(label, {
    start: performance.now(),
    splits: []
  });
}

/**
 * Adds a split time to an ongoing timer
 * @param {string} label - Label for the timer
 * @param {string} splitLabel - Label for the split point
 */
function splitTimer(label, splitLabel) {
  if (!DEBUG_CONFIG.performanceTracking) return;
  
  const timer = performanceMetrics.timers.get(label);
  
  if (!timer) {
    debugLog(`Cannot split non-existent timer: ${label}`, 'warn');
    return;
  }
  
  const splitTime = performance.now();
  const elapsed = splitTime - timer.start;
  
  timer.splits.push({
    label: splitLabel || `Split ${timer.splits.length + 1}`,
    time: splitTime,
    elapsed
  });
  
  debugLog(`Timer ${label} split: ${splitLabel || 'Split'} @ ${elapsed.toFixed(2)}ms`, 'debug');
}

/**
 * Stops a performance timer and records the result
 * @param {string} label - Label for the timer
 * @param {boolean} [log=true] - Whether to log the result
 * @returns {Object|null} - The timer result object or null if timer not found
 */
function stopTimer(label, log = true) {
  if (!DEBUG_CONFIG.performanceTracking) return null;
  
  const timer = performanceMetrics.timers.get(label);
  
  if (!timer) {
    debugLog(`Cannot stop non-existent timer: ${label}`, 'warn');
    return null;
  }
  
  const endTime = performance.now();
  const elapsed = endTime - timer.start;
  
  const result = {
    label,
    start: timer.start,
    end: endTime,
    elapsed,
    splits: timer.splits
  };
  
  performanceMetrics.measurements.push(result);
  performanceMetrics.timers.delete(label);
  
  if (log) {
    debugLog(`Timer ${label} stopped: ${elapsed.toFixed(2)}ms`, 'info', result);
  }
  
  return result;
}

/**
 * Gets all recorded performance measurements
 * @returns {Array} - Array of performance measurements
 */
function getPerformanceMetrics() {
  return [...performanceMetrics.measurements];
}

/**
 * Clears all performance metrics
 */
function clearPerformanceMetrics() {
  performanceMetrics.measurements = [];
  debugLog('Performance metrics cleared', 'debug');
}

/**
 * Enables visual debugging of DOM elements
 * @param {boolean} [enable=true] - Whether to enable visual debugging
 */
function enableVisualDebugging(enable = true) {
  debugState.visualDebuggingEnabled = enable;
  
  debugLog(`Visual debugging ${enable ? 'enabled' : 'disabled'}`, 'info');
  
  if (enable) {
    // Add diagnostic styles if not present
    let styleElement = document.getElementById('debug-visual-styles');
    
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'debug-visual-styles';
      styleElement.textContent = `
        .debug-highlight {
          outline: 2px solid red !important;
          background-color: rgba(255, 0, 0, 0.1) !important;
        }
        
        .debug-node-selected {
          outline: 3px solid blue !important;
          background-color: rgba(0, 0, 255, 0.1) !important;
        }
      `;
      document.head.appendChild(styleElement);
    }
  } else {
    // Clean up any existing highlights
    clearNodeHighlights();
    
    // Remove diagnostic styles
    const styleElement = document.getElementById('debug-visual-styles');
    if (styleElement) {
      styleElement.remove();
    }
  }
}

/**
 * Highlights a DOM element for visual debugging
 * @param {string|HTMLElement} selector - CSS selector or DOM element
 * @param {Object} [options] - Highlighting options
 * @param {string} [options.className='debug-highlight'] - CSS class to apply
 * @param {boolean} [options.select=false] - Whether to select this node
 */
function highlightNode(selector, options = {}) {
  if (!debugState.visualDebuggingEnabled) {
    debugLog('Visual debugging is disabled. Enable it first with enableVisualDebugging()', 'warn');
    return;
  }
  
  const defaults = {
    className: 'debug-highlight',
    select: false
  };
  
  const settings = { ...defaults, ...options };
  
  // Find the element
  let element;
  if (typeof selector === 'string') {
    element = document.querySelector(selector);
  } else if (selector instanceof HTMLElement) {
    element = selector;
  }
  
  if (!element) {
    debugLog(`Element not found: ${selector}`, 'warn');
    return;
  }
  
  // Apply highlight class
  element.classList.add(settings.className);
  
  // If selecting, update selected node
  if (settings.select) {
    clearNodeSelection();
    element.classList.add('debug-node-selected');
    debugState.selectedNode = getNodeDescription(element);
    updateDebugInfo();
  }
  
  debugLog(`Highlighted element: ${getNodeDescription(element)}`, 'debug');
}

/**
 * Gets a descriptive string for a DOM node
 * @param {HTMLElement} node - The node to describe
 * @returns {string} - Node description
 * @private
 */
function getNodeDescription(node) {
  if (!node) return 'null';
  
  let desc = node.tagName.toLowerCase();
  
  if (node.id) {
    desc += `#${node.id}`;
  }
  
  if (node.className && typeof node.className === 'string') {
    desc += `.${node.className.replace(/\s+/g, '.')}`;
  }
  
  return desc;
}

/**
 * Clears all highlighted nodes
 */
function clearNodeHighlights() {
  document.querySelectorAll('.debug-highlight').forEach(element => {
    element.classList.remove('debug-highlight');
  });
  
  debugLog('Cleared all node highlights', 'debug');
}

/**
 * Clears the selected node
 */
function clearNodeSelection() {
  document.querySelectorAll('.debug-node-selected').forEach(element => {
    element.classList.remove('debug-node-selected');
  });
  
  debugState.selectedNode = null;
  updateDebugInfo();
  
  debugLog('Cleared node selection', 'debug');
}

/**
 * Simulates a debugger breakpoint
 * @param {string} [reason='Manual breakpoint'] - Reason for the breakpoint
 */
function debugBreak(reason = 'Manual breakpoint') {
  if (!DEBUG_CONFIG.breakpointEnabled) {
    debugLog('Breakpoints are disabled. Enable them in DEBUG_CONFIG', 'warn');
    return;
  }
  
  debugLog(`BREAKPOINT: ${reason}`, 'error');
  
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert(`Debug breakpoint: ${reason}\n\nCheck the console for more information.`);
  }
  
  if (typeof console !== 'undefined') {
    console.trace('Debug breakpoint trace:');
  }
}

/**
 * Adds a breakpoint for a specific message pattern
 * @param {string} pattern - The message pattern to break on
 */
function addBreakpoint(pattern) {
  if (!pattern) {
    debugLog('Cannot add empty breakpoint pattern', 'warn');
    return;
  }
  
  debugState.breakpoints.add(pattern);
  debugLog(`Added breakpoint for pattern: "${pattern}"`, 'info');
  updateDebugInfo();
}

/**
 * Removes a breakpoint
 * @param {string} pattern - The pattern to remove
 */
function removeBreakpoint(pattern) {
  if (debugState.breakpoints.has(pattern)) {
    debugState.breakpoints.delete(pattern);
    debugLog(`Removed breakpoint for pattern: "${pattern}"`, 'info');
    updateDebugInfo();
  } else {
    debugLog(`Breakpoint not found: "${pattern}"`, 'warn');
  }
}

/**
 * Clears all breakpoints
 */
function clearBreakpoints() {
  debugState.breakpoints.clear();
  debugLog('Cleared all breakpoints', 'info');
  updateDebugInfo();
}

/**
 * Adds a watch for a specific data property
 * @param {string} name - The watch name
 * @param {Function} getter - Function that returns the current value
 */
function addWatch(name, getter) {
  if (typeof getter !== 'function') {
    debugLog('Watch getter must be a function', 'warn');
    return;
  }
  
  debugState.watches.set(name, getter);
  debugLog(`Added watch for: ${name}`, 'info');
  updateDebugInfo();
}

/**
 * Removes a watch
 * @param {string} name - The watch to remove
 */
function removeWatch(name) {
  if (debugState.watches.has(name)) {
    debugState.watches.delete(name);
    debugLog(`Removed watch: ${name}`, 'info');
    updateDebugInfo();
  } else {
    debugLog(`Watch not found: ${name}`, 'warn');
  }
}

/**
 * Gets all current watch values
 * @returns {Object} - Object with all watch values
 */
function getWatchValues() {
  const values = {};
  
  for (const [name, getter] of debugState.watches.entries()) {
    try {
      values[name] = getter();
    } catch (e) {
      values[name] = `[Error: ${e.message}]`;
    }
  }
  
  return values;
}

/**
 * Adds DOM event listeners for debugging
 * @param {string} selector - CSS selector for elements to monitor
 * @param {string[]} [events=['click', 'mouseover']] - Events to listen for
 */
function monitorEvents(selector, events = ['click', 'mouseover']) {
  const elements = document.querySelectorAll(selector);
  
  if (elements.length === 0) {
    debugLog(`No elements found for selector: ${selector}`, 'warn');
    return;
  }
  
  elements.forEach(element => {
    events.forEach(eventName => {
      element.addEventListener(eventName, event => {
        debugLog(`Event ${eventName} on ${getNodeDescription(element)}`, 'debug', {
          event: {
            type: event.type,
            target: getNodeDescription(event.target),
            timestamp: event.timeStamp
          }
        });
      });
    });
  });
  
  debugLog(`Monitoring ${events.join(', ')} events on ${elements.length} elements matching ${selector}`, 'info');
}

/**
 * Creates mock genealogy data for testing
 * @param {Object} [options] - Options for creating mock data
 * @param {number} [options.persons=10] - Number of persons to generate
 * @param {number} [options.generations=3] - Number of generations
 * @returns {Object} - Mock genealogy dataset
 */
function createMockData(options = {}) {
  const defaults = {
    persons: 10,
    generations: 3
  };
  
  const settings = { ...defaults, ...options };
  
  const names = ['Abraham', 'Isaac', 'Jacob', 'Joseph', 'Moses', 'Aaron', 'Joshua', 'Samuel', 'David', 'Solomon',
                'Ruth', 'Naomi', 'Esther', 'Deborah', 'Sarah', 'Rebecca', 'Rachel', 'Leah'];
                
  const lineages = ['sethite', 'adamite', 'messianic', 'davidic', 'levitical'];
  
  const dataset = {
    metadata: {
      title: "Mock Biblical Genealogy Dataset",
      description: "Generated mock data for testing purposes",
      version: "1.0.0",
      generated: new Date().toISOString()
    },
    nodes: [],
    links: []
  };
  
  // Create root person
  const rootPerson = {
    id: 'p1',
    name: names[Math.floor(Math.random() * names.length)],
    description: 'Root person',
    lineage: lineages[Math.floor(Math.random() * lineages.length)],
    birth: '4000 BCE',
    death: '3830 BCE',
    age: 170
  };
  
  dataset.nodes.push(rootPerson);
  
  // Generate remaining persons
  let currentGeneration = [rootPerson];
  let nextGeneration = [];
  let idCounter = 2;
  
  for (let gen = 1; gen < settings.generations; gen++) {
    // For each person in current generation, create children
    for (const parent of currentGeneration) {
      // How many children
      const childCount = Math.floor(Math.random() * 4) + 1;
      
      for (let i = 0; i < childCount; i++) {
        // Create child
        const childId = `p${idCounter++}`;
        const child = {
          id: childId,
          name: names[Math.floor(Math.random() * names.length)],
          description: `Child of ${parent.name}`,
          lineage: parent.lineage,
          parents: [parent.id],
          birth: `${3900 - (gen * 30)} BCE`,
          death: `${3900 - (gen * 30) - Math.floor(Math.random() * 80) - 50} BCE`,
        };
        
        // Calculate age
        const birthYear = parseInt(child.birth.replace(/\D/g, ''));
        const deathYear = parseInt(child.death.replace(/\D/g, ''));
        child.age = birthYear - deathYear;
        
        dataset.nodes.push(child);
        dataset.links.push({
          source: parent.id,
          target: childId,
          type: 'parent-child'
        });
        
        nextGeneration.push(child);
        
        // Add spouse if applicable
        if (Math.random() > 0.3) {
          const spouseId = `p${idCounter++}`;
          const spouse = {
            id: spouseId,
            name: names[Math.floor(Math.random() * names.length)],
            description: `Spouse of ${child.name}`,
            lineage: lineages[Math.floor(Math.random() * lineages.length)],
            birth: `${3900 - (gen * 30) - Math.floor(Math.random() * 10)} BCE`,
            death: `${3900 - (gen * 30) - Math.floor(Math.random() * 70) - 40} BCE`,
          };
          
          // Calculate age
          const spouseBirthYear = parseInt(spouse.birth.replace(/\D/g, ''));
          const spouseDeathYear = parseInt(spouse.death.replace(/\D/g, ''));
          spouse.age = spouseBirthYear - spouseDeathYear;
          
          dataset.nodes.push(spouse);
          dataset.links.push({
            source: childId,
            target: spouseId,
            type: 'spouse'
          });
          
          // Update child's parents to include the spouse
          child.parents.push(spouseId);
        }
      }
    }
    
    currentGeneration = nextGeneration;
    nextGeneration = [];
  }
  
  // Ensure we have at least the specified number of persons
  while (dataset.nodes.length < settings.persons) {
    const randomParent = dataset.nodes[Math.floor(Math.random() * dataset.nodes.length)];
    
    const childId = `p${idCounter++}`;
    const child = {
      id: childId,
      name: names[Math.floor(Math.random() * names.length)],
      description: `Additional child of ${randomParent.name}`,
      lineage: randomParent.lineage,
      parents: [randomParent.id],
      birth: randomParent.birth.replace(/(\d+)/, match => parseInt(match) - 25),
      death: randomParent.birth.replace(/(\d+)/, match => parseInt(match) - 25 - 50 - Math.floor(Math.random() * 30)),
    };
    
    // Calculate age
    const birthYear = parseInt(child.birth.replace(/\D/g, ''));
    const deathYear = parseInt(child.death.replace(/\D/g, ''));
    child.age = birthYear - deathYear;
    
    dataset.nodes.push(child);
    dataset.links.push({
      source: randomParent.id,
      target: childId,
      type: 'parent-child'
    });
  }
  
  debugLog(`Created mock dataset with ${dataset.nodes.length} persons and ${dataset.links.length} relationships`, 'info');
  return dataset;
}

/**
 * Enables mock data mode for testing
 * @param {Object} [mockData] - Custom mock data or null to generate new data
 * @param {Object} [mockOptions] - Options for generating mock data
 */
function enableMockMode(mockData = null, mockOptions = {}) {
  // Generate or use provided mock data
  DEBUG_CONFIG.mockDataSource = mockData || createMockData(mockOptions);
  debugState.mockMode = true;
  
  // Override the loadGenealogyData function if GenealogyDataUtils is available
  if (GenealogyDataUtils && typeof GenealogyDataUtils.loadGenealogyData === 'function') {
    // Store the original function
    if (!GenealogyDataUtils._originalLoadGenealogyData) {
      GenealogyDataUtils._originalLoadGenealogyData = GenealogyDataUtils.loadGenealogyData;
    }
    
    // Replace with mock version
    GenealogyDataUtils.loadGenealogyData = async () => {
      debugLog('Using mock data instead of loading from source', 'info');
      return structuredClone(DEBUG_CONFIG.mockDataSource);
    };
    
    debugLog('Enabled mock mode - GenealogyDataUtils.loadGenealogyData has been overridden', 'info');
  } else {
    debugLog('Enabled mock mode with mock data, but GenealogyDataUtils not available for override', 'warn');
  }
  
  updateDebugInfo();
}

/**
 * Disables mock data mode
 */
function disableMockMode() {
  debugState.mockMode = false;
  DEBUG_CONFIG.mockDataSource = null;
  
  // Restore the original loadGenealogyData function if it was overridden
  if (GenealogyDataUtils && GenealogyDataUtils._originalLoadGenealogyData) {
    GenealogyDataUtils.loadGenealogyData = GenealogyDataUtils._originalLoadGenealogyData;
    delete GenealogyDataUtils._originalLoadGenealogyData;
    
    debugLog('Disabled mock mode - GenealogyDataUtils.loadGenealogyData has been restored', 'info');
  } else {
    debugLog('Disabled mock mode', 'info');
  }
  
  updateDebugInfo();
}

/**
 * Tests data loading and processing
 * @param {string} [dataPath] - Path to test data
 * @returns {Promise<Object>} - Test results
 */
async function testDataLoading(dataPath) {
  debugLog('Starting data loading test', 'info');
  
  const results = {
    success: false,
    loadTime: 0,
    processingTime: 0,
    errors: [],
    data: null
  };
  
  startTimer('dataLoadTest');
  
  try {
    if (!GenealogyDataUtils) {
      throw new Error('GenealogyDataUtils not available');
    }
    
    splitTimer('dataLoadTest', 'Initial setup');
    
    // Test data loading
    const loadData = await GenealogyDataUtils.loadGenealogyData(dataPath);
    splitTimer('dataLoadTest', 'Data loading');
    
    results.data = {
      nodeCount: loadData.nodes.length,
      linkCount: loadData.links.length,
      metadata: loadData.metadata || {},
      dataFormat: loadData.nodes && loadData.links ? 'standard' : 'sectional'
    };
    
    // Test data validation
    if (GenealogyDataUtils.validateRawData) {
      const validationResult = GenealogyDataUtils.validateRawData(loadData);
      if (!validationResult.valid) {
        results.errors.push(`Validation failures: ${validationResult.errors.join(', ')}`);
      }
    }
    
    splitTimer('dataLoadTest', 'Data validation');
    
    // Test data processing if available
    if (GenealogyDataUtils.processDataForVisualization) {
      const processedData = GenealogyDataUtils.processDataForVisualization(loadData);
      results.processedData = {
        nodeCount: processedData.nodes.length,
        linkCount: processedData.links.length
      };
    }
    
    splitTimer('dataLoadTest', 'Data processing');
    
    results.success = true;
  } catch (error) {
    results.success = false;
    results.errors.push(error.message);
    debugLog(`Data loading test error: ${error.message}`, 'error', error);
  }
  
  const timer = stopTimer('dataLoadTest');
  
  // Calculate timing details
  results.loadTime = timer.splits[1] ? timer.splits[1].elapsed - timer.splits[0].elapsed : 0;
  results.processingTime = timer.splits[2] ? timer.splits[2].elapsed - timer.splits[1].elapsed : 0;
  results.totalTime = timer.elapsed;
  
  debugLog('Data loading test completed', 'info', results);
  return results;
}

/**
 * Runs a performance test on data processing functions
 * @param {Object} [options] - Test options
 * @param {number} [options.iterations=5] - Number of iterations
 * @param {boolean} [options.useMockData=true] - Whether to use mock data
 * @returns {Promise<Object>} - Performance test results
 */
async function runPerformanceTest(options = {}) {
  const defaults = {
    iterations: 5,
    useMockData: true
  };
  
  const settings = { ...defaults, ...options };
  
  debugLog(`Starting performance test with ${settings.iterations} iterations`, 'info');
  
  const results = {
    iterations: settings.iterations,
    usedMockData: settings.useMockData,
    tests: {},
    averages: {}
  };
  
  // Test data
  let testData;
  if (settings.useMockData) {
    testData = createMockData({
      persons: 100,
      generations: 5
    });
  } else if (GenealogyDataUtils) {
    try {
      testData = await GenealogyDataUtils.loadGenealogyData();
    } catch (error) {
      debugLog(`Error loading data for performance test: ${error.message}`, 'error');
      testData = createMockData();
    }
  } else {
    testData = createMockData();
  }
  
  const functions = [];
  
  // Add test functions if GenealogyDataUtils is available
  if (GenealogyDataUtils) {
    if (GenealogyDataUtils.validateRawData) {
      functions.push({
        name: 'validateRawData',
        fn: () => GenealogyDataUtils.validateRawData(testData)
      });
    }
    
    if (GenealogyDataUtils.processDataForVisualization) {
      functions.push({
        name: 'processDataForVisualization',
        fn: () => GenealogyDataUtils.processDataForVisualization(testData)
      });
    }
    
    if (GenealogyDataUtils.transformGenealogyData) {
      functions.push({
        name: 'transformGenealogyData',
        fn: () => GenealogyDataUtils.transformGenealogyData(testData)
      });
    }
    
    if (GenealogyDataUtils.enrichDataset) {
      functions.push({
        name: 'enrichDataset',
        fn: () => GenealogyDataUtils.enrichDataset(testData)
      });
    }
  }
  
  // Always test some utility functions from this module
  functions.push({
    name: 'createMockData',
    fn: () => createMockData({persons: 50, generations: 3})
  });
  
  functions.push({
    name: 'deepClone',
    fn: () => deepClone(testData, 2)
  });
  
  functions.push({
    name: 'formatObjectForDisplay',
    fn: () => formatObjectForDisplay(testData, 0, 2)
  });
  
  // Run the tests
  for (const func of functions) {
    results.tests[func.name] = [];
    
    for (let i = 0; i < settings.iterations; i++) {
      startTimer(`perfTest_${func.name}_${i}`);
      
      try {
        const result = func.fn();
        results.tests[func.name].push({
          iteration: i + 1,
          success: true,
          time: 0 // Will be updated after stopTimer
        });
      } catch (error) {
        results.tests[func.name].push({
          iteration: i + 1,
          success: false,
          error: error.message,
          time: 0 // Will be updated after stopTimer
        });
      }
      
      const timer = stopTimer(`perfTest_${func.name}_${i}`, false);
      results.tests[func.name][i].time = timer.elapsed;
    }
    
// Calculate average
const successfulRuns = results.tests[func.name].filter(test => test.success);
if (successfulRuns.length > 0) {
  const avg = successfulRuns.reduce((sum, test) => sum + test.time, 0) / successfulRuns.length;
  results.averages[func.name] = {
    avgTime: avg,
    successRate: (successfulRuns.length / settings.iterations) * 100
  };
} else {
  results.averages[func.name] = {
    avgTime: 0,
    successRate: 0
  };
}
}

debugLog('Performance test completed', 'info', results);
return results;
}

/**
* Creates mock genealogy data for testing
* @param {Object} [options] - Generation options
* @param {number} [options.persons=50] - Number of persons to generate
* @param {number} [options.generations=4] - Number of generations
* @param {number} [options.startYear=-4000] - Starting year
* @param {number} [options.endYear=100] - Ending year
* @returns {Object} - Mock genealogy data
*/
function createMockData(options = {}) {
const defaults = {
persons: 50,
generations: 4,
startYear: -4000, // BCE
endYear: 100,     // CE
probabilityOfMultipleChildren: 0.5,
maxChildrenPerParent: 5,
connectionTypes: ['parent', 'spouse', 'adoptive_parent']
};

const settings = { ...defaults, ...options };
debugLog('Creating mock data with settings', 'debug', settings);

const biblicalNames = [
'Abraham', 'Isaac', 'Jacob', 'Joseph', 'Moses', 'Aaron', 'Joshua', 'Samuel', 'David', 'Solomon',
'Elijah', 'Isaiah', 'Jeremiah', 'Daniel', 'Ezekiel', 'Hosea', 'Joel', 'Amos', 'Jonah', 'Micah',
'Sarah', 'Rebecca', 'Rachel', 'Leah', 'Miriam', 'Ruth', 'Naomi', 'Esther', 'Deborah', 'Hannah'
];

const tribes = ['Judah', 'Benjamin', 'Levi', 'Ephraim', 'Manasseh', 
             'Reuben', 'Simeon', 'Gad', 'Asher', 'Dan', 'Naphtali', 'Zebulun', 'Issachar'];
             
const locations = ['Jerusalem', 'Bethlehem', 'Nazareth', 'Galilee', 'Judea', 'Samaria', 
                'Egypt', 'Babylon', 'Ur', 'Eden', 'Canaan', 'Sinai'];

const mockData = {
nodes: [],
links: [],
metadata: {
  title: "Mock Biblical Genealogy Data",
  version: "1.0.0",
  description: "Automatically generated mock data for testing",
  timestamp: new Date().toISOString(),
  generationSettings: settings
}
};

// Generate persons
for (let i = 0; i < settings.persons; i++) {
// Calculate birth year, distributed across the time span
const birthYear = Math.floor(settings.startYear + (i / settings.persons) * 
                           (settings.endYear - settings.startYear));

// Get a random name
const nameIndex = Math.floor(Math.random() * biblicalNames.length);
const name = biblicalNames[nameIndex];

// Assign a tribe, location, and other attributes
const tribeIndex = Math.floor(Math.random() * tribes.length);
const locationIndex = Math.floor(Math.random() * locations.length);

// Calculate generation (roughly)
const generation = Math.floor((i / settings.persons) * settings.generations) + 1;

mockData.nodes.push({
  id: `p${i}`,
  name: `${name} ${i}`,
  gender: i % 2 === 0 ? "male" : "female",
  birthYear: birthYear,
  deathYear: birthYear + Math.floor(Math.random() * 80) + 20, // live 20-100 years
  tribe: tribes[tribeIndex],
  birthplace: locations[locationIndex],
  generation: generation,
  importance: Math.random() > 0.8 ? "high" : Math.random() > 0.5 ? "medium" : "low"
});
}

// Create parent-child relationships
const potentialParents = [...mockData.nodes];

// Sort by generation and birth year to ensure logical relationships
potentialParents.sort((a, b) => {
if (a.generation !== b.generation) return a.generation - b.generation;
return a.birthYear - b.birthYear;
});

// Create relationships ensuring logical consistency
for (let i = 0; i < mockData.nodes.length; i++) {
const person = mockData.nodes[i];

// Skip the first generation for child relationships
if (person.generation > 1) {
  // Find potential parents from earlier generations
  const possibleParents = potentialParents.filter(p => 
    p.generation < person.generation && 
    p.birthYear < person.birthYear - 15 && // Must be at least 15 years older
    p.deathYear > person.birthYear // Must be alive at birth
  );
  
  if (possibleParents.length > 0) {
    // Select 1 or 2 parents
    const parentCount = Math.min(possibleParents.length, Math.random() > 0.8 ? 1 : 2);
    
    for (let j = 0; j < parentCount; j++) {
      const parentIndex = Math.floor(Math.random() * possibleParents.length);
      const parent = possibleParents[parentIndex];
      
      // Remove selected parent to avoid duplicates
      possibleParents.splice(parentIndex, 1);
      
      // Create the relationship
      mockData.links.push({
        source: parent.id,
        target: person.id,
        type: Math.random() > 0.9 ? "adoptive_parent" : "parent"
      });
    }
  }
}

// Create spouse relationships (more common in later generations)
if (Math.random() < 0.3) {
  const possibleSpouses = mockData.nodes.filter(p => 
    p.id !== person.id &&
    p.gender !== person.gender && 
    Math.abs(p.birthYear - person.birthYear) < 20 && // Similar age
    p.generation === person.generation // Same generation
  );
  
  if (possibleSpouses.length > 0) {
    const spouseIndex = Math.floor(Math.random() * possibleSpouses.length);
    const spouse = possibleSpouses[spouseIndex];
    
    // Create the spouse relationship (only if it doesn't already exist)
    const existingRelationship = mockData.links.find(l => 
      (l.source === person.id && l.target === spouse.id) || 
      (l.source === spouse.id && l.target === person.id)
    );
    
    if (!existingRelationship) {
      mockData.links.push({
        source: person.id,
        target: spouse.id,
        type: "spouse",
        marriageYear: Math.max(person.birthYear, spouse.birthYear) + 
                     Math.floor(Math.random() * 10) + 15
      });
    }
  }
}
}

debugLog(`Created mock data with ${mockData.nodes.length} nodes and ${mockData.links.length} links`, 'debug');
return mockData;
}

/**
* Creates and displays visual indicators for debugging
* @param {Object} visualOptions - Options for visual debugging
*/
function enableVisualDebugging(visualOptions = {}) {
debugState.visualDebuggingEnabled = true;

const defaults = {
highlightNodes: true,
showLabels: true,
showCoordinates: true,
highlightLinks: true
};

const options = { ...defaults, ...visualOptions };

debugLog('Enabling visual debugging', 'info', options);

// Create or update the visual debugging styles
let styleElement = document.getElementById('genealogy-debug-styles');

if (!styleElement) {
styleElement = document.createElement('style');
styleElement.id = 'genealogy-debug-styles';
document.head.appendChild(styleElement);
}

styleElement.textContent = `
.genealogy-debug-node {
  stroke: red !important;
  stroke-width: 3px !important;
}

.genealogy-debug-link {
  stroke: orange !important;
  stroke-width: 3px !important;
  stroke-dasharray: 5,5 !important;
}

.genealogy-debug-label {
  background: rgba(0,0,0,0.7);
  color: #00ff00;
  padding: 2px 5px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 10px;
  pointer-events: none;
  z-index: 1000;
}

.genealogy-debug-coordinate {
  color: yellow;
  font-size: 9px;
}
`;

updateDebugInfo();
}

/**
* Disables visual debugging
*/
function disableVisualDebugging() {
debugState.visualDebuggingEnabled = false;

// Remove visual debugging styles
const styleElement = document.getElementById('genealogy-debug-styles');
if (styleElement) {
styleElement.remove();
}

// Remove any debug elements added to the DOM
const debugElements = document.querySelectorAll('.genealogy-debug-label');
debugElements.forEach(el => el.remove());

// Remove debug classes from nodes and links
const debugNodes = document.querySelectorAll('.genealogy-debug-node');
debugNodes.forEach(node => node.classList.remove('genealogy-debug-node'));

const debugLinks = document.querySelectorAll('.genealogy-debug-link');
debugLinks.forEach(link => link.classList.remove('genealogy-debug-link'));

debugLog('Visual debugging disabled', 'info');
updateDebugInfo();
}

/**
* Utility to deeply clone an object
* @param {*} obj - Object to clone
* @param {number} [maxDepth=10] - Maximum depth to clone
* @returns {*} - Cloned object
*/
function deepClone(obj, maxDepth = 10) {
if (maxDepth <= 0) return null;

if (obj === null || typeof obj !== 'object') {
return obj;
}

if (Array.isArray(obj)) {
return obj.map(item => deepClone(item, maxDepth - 1));
}

const clone = {};
for (const key in obj) {
if (Object.prototype.hasOwnProperty.call(obj, key)) {
  clone[key] = deepClone(obj[key], maxDepth - 1);
}
}

return clone;
}

/**
* Formats an object for readable display
* @param {*} obj - Object to format
* @param {number} [indent=0] - Current indentation level
* @param {number} [maxDepth=DEBUG_CONFIG.dataInspectionDepth] - Maximum depth to display
* @returns {string} - Formatted string
*/
function formatObjectForDisplay(obj, indent = 0, maxDepth = DEBUG_CONFIG.dataInspectionDepth) {
// Handle max depth
if (maxDepth <= 0) return ' [Max depth reached]';

// Handle primitives
if (obj === null) return ' null';
if (obj === undefined) return ' undefined';
if (typeof obj !== 'object') {
if (typeof obj === 'string') return ` "${obj}"`;
return ` ${obj}`;
}

// Handle arrays
if (Array.isArray(obj)) {
if (obj.length === 0) return ' []';

// For large arrays, show a summary
if (obj.length > 10) {
  return ` [Array(${obj.length}) ${formatObjectForDisplay(obj.slice(0, 3), 0, maxDepth - 1)} ... ]`;
}

const indentStr = ' '.repeat(indent + 2);
const itemsStr = obj.map(item => 
  `${indentStr}${formatObjectForDisplay(item, indent + 2, maxDepth - 1)}`
).join(',\n');

return ` [\n${itemsStr}\n${' '.repeat(indent)}]`;
}

// Handle objects
const keys = Object.keys(obj);
if (keys.length === 0) return ' {}';

// Special handling for DOM elements
if (obj instanceof Element) {
return ` [DOM Element: <${obj.tagName.toLowerCase()}${obj.id ? ' id="'+obj.id+'"' : ''}${obj.className ? ' class="'+obj.className+'"' : ''}>]`;
}

// Special handling for functions
if (typeof obj === 'function') {
return ` [Function: ${obj.name || 'anonymous'}]`;
}

// Regular object
const indentStr = ' '.repeat(indent + 2);
const propsStr = keys.map(key => {
const value = obj[key];
return `${indentStr}${key}:${formatObjectForDisplay(value, indent + 2, maxDepth - 1)}`;
}).join(',\n');

return ` {\n${propsStr}\n${' '.repeat(indent)}}`;
}

/**
* Creates a data integrity report
* @param {Object} data - Genealogy data to analyze
* @returns {Object} - Integrity report
*/
function createDataIntegrityReport(data) {
if (!data || !data.nodes || !data.links) {
return {
  valid: false,
  errors: ['Invalid data structure: missing nodes or links']
};
}

const report = {
valid: true,
errors: [],
warnings: [],
statistics: {
  nodeCount: data.nodes.length,
  linkCount: data.links.length,
  nodeTypes: {},
  linkTypes: {},
  genderDistribution: {
    male: 0,
    female: 0,
    unknown: 0
  },
  timePeriods: {}
},
anomalies: []
};

// Check for duplicate IDs
const nodeIds = new Set();
const duplicateIds = [];

data.nodes.forEach(node => {
if (nodeIds.has(node.id)) {
  duplicateIds.push(node.id);
} else {
  nodeIds.add(node.id);
}

// Collect gender statistics
if (node.gender) {
  const gender = node.gender.toLowerCase();
  if (gender === 'male' || gender === 'm') {
    report.statistics.genderDistribution.male++;
  } else if (gender === 'female' || gender === 'f') {
    report.statistics.genderDistribution.female++;
  } else {
    report.statistics.genderDistribution.unknown++;
  }
} else {
  report.statistics.genderDistribution.unknown++;
}

// Collect node type statistics
const nodeType = node.type || 'person';
report.statistics.nodeTypes[nodeType] = (report.statistics.nodeTypes[nodeType] || 0) + 1;

// Categorize by time period if birth year is available
if (node.birthYear !== undefined) {
  let period;
  
  if (node.birthYear < -1000) {
    period = 'Before 1000 BCE';
  } else if (node.birthYear < 0) {
    period = '1000 BCE to 1 CE';
  } else if (node.birthYear < 100) {
    period = '1 CE to 100 CE';
  } else {
    period = 'After 100 CE';
  }
  
  report.statistics.timePeriods[period] = (report.statistics.timePeriods[period] || 0) + 1;
}

// Check for anomalies
if (node.deathYear !== undefined && node.birthYear !== undefined) {
  if (node.deathYear < node.birthYear) {
    report.anomalies.push({
      type: 'timeline',
      description: `Node ${node.id} (${node.name}) has death year before birth year`,
      severity: 'error',
      node: node.id
    });
    report.valid = false;
  }
  
  const age = node.deathYear - node.birthYear;
  if (age > 200) {
    report.anomalies.push({
      type: 'timeline',
      description: `Node ${node.id} (${node.name}) has unusually long lifespan: ${age} years`,
      severity: 'warning',
      node: node.id
    });
  }
}
});

if (duplicateIds.length > 0) {
report.errors.push(`Found ${duplicateIds.length} duplicate node IDs: ${duplicateIds.join(', ')}`);
report.valid = false;
}

// Check for invalid link references
const invalidLinks = [];

data.links.forEach(link => {
// Collect link type statistics
const linkType = link.type || 'unknown';
report.statistics.linkTypes[linkType] = (report.statistics.linkTypes[linkType] || 0) + 1;

if (!nodeIds.has(link.source) || !nodeIds.has(link.target)) {
  invalidLinks.push(link);
  report.anomalies.push({
    type: 'reference',
    description: `Link references non-existent node: ${link.source} -> ${link.target}`,
    severity: 'error',
    link: link
  });
  report.valid = false;
}

// Check for self-references
if (link.source === link.target) {
  report.anomalies.push({
    type: 'self-reference',
    description: `Node ${link.source} has a relationship to itself of type ${link.type}`,
    severity: 'warning',
    link: link
  });
}
});

if (invalidLinks.length > 0) {
report.errors.push(`Found ${invalidLinks.length} links with invalid node references`);
}

// Check for orphan nodes (nodes with no connections)
const connectedNodes = new Set();

data.links.forEach(link => {
connectedNodes.add(link.source);
connectedNodes.add(link.target);
});

const orphanNodes = data.nodes.filter(node => !connectedNodes.has(node.id));

if (orphanNodes.length > 0) {
report.warnings.push(`Found ${orphanNodes.length} orphan nodes with no connections`);
report.anomalies.push({
  type: 'connectivity',
  description: `${orphanNodes.length} nodes have no connections`,
  severity: 'warning',
  nodes: orphanNodes.map(n => n.id)
});
}

debugLog('Data integrity report created', 'info', report);
return report;
}

/**
* Exports the entire debug state
* @returns {Object} - Debug state export
*/
function exportDebugState() {
const exportData = {
timestamp: new Date().toISOString(),
config: DEBUG_CONFIG,
state: deepClone(debugState),
performance: deepClone(performanceMetrics),
logs: logHistory.slice(-100) // last 100 logs
};

debugLog('Exporting debug state', 'info');

// Generate a file name
const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '_');
const fileName = `genealogy-debug-export_${timestamp}.json`;

// Create a download link
const json = JSON.stringify(exportData, null, 2);
const blob = new Blob([json], {type: 'application/json'});
const url = URL.createObjectURL(blob);

const link = document.createElement('a');
link.href = url;
link.download = fileName;

// Trigger the download
document.body.appendChild(link);
link.click();
document.body.removeChild(link);

// Clean up
setTimeout(() => URL.revokeObjectURL(url), 100);

return exportData;
}

// Export the public interface for the debug utilities
const DebugUtils = {
// Configuration
getConfig: () => deepClone(DEBUG_CONFIG),
setConfig: (config) => {
Object.assign(DEBUG_CONFIG, config);
debugLog('Debug configuration updated', 'info', DEBUG_CONFIG);
return DEBUG_CONFIG;
},

// Logging
log: debugLog,
trace: (message, ...args) => debugLog(message, 'trace', ...args),
info: (message, ...args) => debugLog(message, 'info', ...args),
warn: (message, ...args) => debugLog(message, 'warn', ...args),
error: (message, ...args) => debugLog(message, 'error', ...args),
clearLogs: () => clearDebugPanel(),

// Performance tracking
startTimer,
stopTimer,
splitTimer,
getTimers: () => deepClone(performanceMetrics.timers),
getMeasurements: () => deepClone(performanceMetrics.measurements),
clearTimers: () => {
performanceMetrics.timers.clear();
performanceMetrics.measurements = [];
},

// UI
toggleDebugPanel,
updateDebugInfo,

// Data tools
createMockData,
enableMockMode,
disableMockMode,
testDataLoading,
runPerformanceTest,
createDataIntegrityReport,

// Visual debugging
enableVisualDebugging,
disableVisualDebugging,
selectNode: (nodeId) => {
debugState.selectedNode = nodeId;
updateDebugInfo();
return nodeId;
},

// Utilities
deepClone,
formatObjectForDisplay,
exportDebugState,

// Direct state access (for advanced usage)
getDebugState: () => deepClone(debugState)
};

// Expose to the global scope or module exports
if (typeof window !== 'undefined') {
window.DebugUtils = DebugUtils;
}

if (typeof module !== 'undefined' && module.exports) {
module.exports = DebugUtils;
}

// Helper function implementations
/**
* Logs a debug message
* @param {string} message - The message to log
* @param {string} [level='debug'] - Log level (trace, debug, info, warn, error)
* @param {...*} args - Additional arguments to log
*/
function debugLog(message, level = 'debug', ...args) {
if (!DEBUG_CONFIG.enabled) return;

const timestamp = new Date().toISOString();
const logEntry = {
timestamp,
level,
message,
args: args.length > 0 ? deepClone(args) : undefined
};

// Add to history if enabled
if (DEBUG_CONFIG.logHistory.enabled) {
logHistory.push(logEntry);

// Trim history if it gets too long
if (logHistory.length > DEBUG_CONFIG.logHistory.maxEntries) {
  logHistory.shift();
}
}

// Output to console if enabled
if (DEBUG_CONFIG.consoleEnabled) {
const consoleMethod = {
  trace: console.trace,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
}[level] || console.log;

if (args.length > 0) {
  consoleMethod(`[Genealogy Debug] ${message}`, ...args);
} else {
  consoleMethod(`[Genealogy Debug] ${message}`);
}
}

// Output to debug panel if it exists
const panel = document.getElementById(DEBUG_CONFIG.debugPanelId);
if (panel) {
const logSection = document.getElementById('debug-log-section');
if (logSection) {
  const logElement = document.createElement('div');
  logElement.className = `debug-log debug-${level}`;
  
  const timeElement = document.createElement('span');
  timeElement.className = 'debug-time';
  timeElement.textContent = new Date().toLocaleTimeString();
  
  const levelElement = document.createElement('span');
  levelElement.className = `debug-level debug-level-${level}`;
  levelElement.textContent = level.toUpperCase();
  
  const messageElement = document.createElement('span');
  messageElement.className = 'debug-message';
  messageElement.textContent = message;
  
  logElement.appendChild(timeElement);
  logElement.appendChild(levelElement);
  logElement.appendChild(messageElement);
  
  // Add args if present
  if (args.length > 0) {
    const argsElement = document.createElement('div');
    argsElement.className = 'debug-args';
    argsElement.textContent = args.map(arg => 
      typeof arg === 'object' ? formatObjectForDisplay(arg) : String(arg)
    ).join(' ');
    
    logElement.appendChild(argsElement);
  }
  
  logSection.appendChild(logElement);
  
  // Auto-scroll to bottom
  logSection.scrollTop = logSection.scrollHeight;
}
}
}

/**
* Clears the debug panel
*/
function clearDebugPanel() {
const logSection = document.getElementById('debug-log-section');
if (logSection) {
logSection.innerHTML = '';
}

debugLog('Debug panel cleared', 'info');
}

/**
* Updates the debug info panel with current state
*/
function updateDebugInfo() {
const infoSection = document.getElementById('debug-info-section');
if (!infoSection) return;

infoSection.innerHTML = '';

// Create state summary
const stateElement = document.createElement('div');
stateElement.className = 'debug-state-summary';

const stateHTML = `
<h4>Debug State</h4>
<ul>
  <li>Enabled: ${DEBUG_CONFIG.enabled}</li>
  <li>Visual debugging: ${debugState.visualDebuggingEnabled}</li>
  <li>Mock mode: ${debugState.mockMode}</li>
  ${debugState.selectedNode ? `<li>Selected node: ${debugState.selectedNode}</li>` : ''}
  <li>Active timers: ${performanceMetrics.timers.size}</li>
  <li>Log entries: ${logHistory.length}</li>
</ul>
`;

stateElement.innerHTML = stateHTML;
infoSection.appendChild(stateElement);
}

/**
* Starts a new performance timer
* @param {string} name - Name of the timer
* @returns {Object} - Timer object
*/
function startTimer(name) {
const startTime = performance.now();

performanceMetrics.timers.set(name, {
name,
startTime,
endTime: null,
elapsed: 0,
running: true,
splits: [{
  name: 'start',
  time: startTime,
  elapsed: 0
}]
});

debugLog(`Timer started: ${name}`, 'trace');
return performanceMetrics.timers.get(name);
}

/**
* Stops a performance timer
* @param {string} name - Name of the timer
* @param {boolean} [addToMeasurements=true] - Whether to add to measurements
* @returns {Object} - Timer object
*/
function stopTimer(name, addToMeasurements = true) {
if (!performanceMetrics.timers.has(name)) {
debugLog(`Timer ${name} does not exist`, 'warn');
return { elapsed: 0, name, running: false };
}

const timer = performanceMetrics.timers.get(name);
const endTime = performance.now();

timer.endTime = endTime;
timer.elapsed = endTime - timer.startTime;
timer.running = false;

if (addToMeasurements) {
performanceMetrics.measurements.push({
  name,
  startTime: timer.startTime,
  endTime,
  elapsed: timer.elapsed,
  timestamp: new Date().toISOString()
});

debugLog(`Timer stopped: ${name} (${timer.elapsed.toFixed(2)}ms)`, 'trace');
}

return timer;
}

/**
* Adds a split time to a timer
* @param {string} name - Name of the timer
* @param {string} splitName - Name of the split
* @returns {Object} - Timer object with the new split
*/
function splitTimer(name, splitName) {
if (!performanceMetrics.timers.has(name)) {
debugLog(`Timer ${name} does not exist for split ${splitName}`, 'warn');
return null;
}

const timer = performanceMetrics.timers.get(name);
const splitTime = performance.now();

const split = {
name: splitName,
time: splitTime,
elapsed: splitTime - timer.startTime
};

timer.splits.push(split);

debugLog(`Timer split: ${name} - ${splitName} (${split.elapsed.toFixed(2)}ms)`, 'trace');

return timer;
}

// Initialize on load if we're in a browser environment
if (typeof window !== 'undefined') {
if (document.readyState === 'complete') {
debugLog('DebugUtils initialized', 'info');
} else {
window.addEventListener('load', () => {
  debugLog('DebugUtils initialized', 'info');
});
}
}