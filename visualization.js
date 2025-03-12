/**
 * Biblical Genealogy Visualization Library
 * A specialized D3-based network visualization library for displaying genealogical relationships
 * @version 1.0.0
 */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module
        define(['d3'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like environments that support module.exports
        module.exports = factory(require('d3'));
    } else {
        // Browser globals (root is window)
        root.BiblicalVisualization = factory(root.d3);
    }
}(typeof self !== 'undefined' ? self : this, function(d3) {
    'use strict';
    
    /**
     * Creates a new visualization instance
     * @param {Object} config - Configuration options
     * @return {Object} Public API for the visualization
     */
    function BiblicalVisualization(config) {
        // DOM references
        let containerElement = null;
        let svg = null;
        let tooltipDiv = null;
        let contextMenu = null;
        let zoomHandler = null;
        let loadingIndicator = null;
        
        // Visualization state
        let nodes = [];
        let links = [];
        let nodeRegistry = new Map();
        let linkRegistry = new Map();
        let rendererType = 'force';
        let selectedNode = null;
        let selectedLink = null;
        let highlightedNodes = new Set();
        let highlightedLinks = new Set();
        let width = 800;
        let height = 600;
        let transform = { k: 1, x: 0, y: 0 };
        let simulation = null;
        let nodeElements = null;
        let linkElements = null;
        let labelElements = null;
        let dataCache = null;
        let activeFilters = {};
        let savedStates = [];
        let currentStateIndex = -1;
        let lastRenderTime = Date.now();
        let performanceStats = {
            lastRenderTime: 0,
            frameRate: 0,
            nodeCount: 0,
            linkCount: 0,
            renderCount: 0
        };
        let colorScales = {};
        let isRendering = false;
        let renderQueue = [];
        let debugMode = false;
        let layoutCache = {};
        
        // Default configuration
        const defaultConfig = {
            container: '#visualization',
            width: '100%',
            height: '600px',
            backgroundColor: '#ffffff',
            textColor: '#333333',
            nodeSizeRange: [5, 20],
            nodeSizeAttribute: 'importance',
            nodeColorAttribute: 'type',
            linkDistanceRange: [30, 200],
            linkDistanceAttribute: 'strength',
            linkWidthRange: [1, 5],
            linkWidthAttribute: 'strength',
            fontFamily: 'Arial, sans-serif',
            fontSize: 12,
            showLabels: true,
            labelAttribute: 'name',
            renderLinks: true,
            renderNodes: true,
            interactive: true,
            animationDuration: 300,
            fixNodesOnDrag: true,
            colors: {
                node: '#6baed6',
                link: '#9ecae1',
                text: '#333333',
                highlight: '#fd8d3c',
                selection: '#e31a1c',
                background: '#ffffff'
            },
            nodeTypes: {
                person: { radius: 8, fill: '#6baed6', stroke: '#3182bd', strokeWidth: 1 },
                location: { radius: 6, fill: '#fd8d3c', stroke: '#e6550d', strokeWidth: 1 },
                event: { radius: 7, fill: '#31a354', stroke: '#006d2c', strokeWidth: 1 }
            },
            linkTypes: {
                'parent-child': { stroke: '#9ecae1', strokeWidth: 1, dasharray: null },
                'spouse': { stroke: '#e31a1c', strokeWidth: 1, dasharray: '5,5' },
                'sibling': { stroke: '#756bb1', strokeWidth: 1, dasharray: '1,1' }
            },
            highlight: {
                node: { fill: '#fd8d3c', stroke: '#e6550d', strokeWidth: 2 },
                link: { stroke: '#fd8d3c', strokeWidth: 2, dasharray: null },
                propagationLevels: 1
            },
            selection: {
                node: { fill: '#e31a1c', stroke: '#bd0026', strokeWidth: 2 },
                link: { stroke: '#e31a1c', strokeWidth: 2, dasharray: null }
            },
            simulation: {
                linkDistance: 150,
                linkStrength: 0.2,
                forceManyBody: -300,
                forceCollision: 20,
                forceX: 0.1,
                forceY: 0.1,
                alpha: 1,
                alphaDecay: 0.02,
                alphaMin: 0.001
            },
            zoom: {
                enabled: true,
                scaleExtent: [0.1, 10],
                initialScale: 1
            },
            eventHandlers: {
                nodeClick: null,
                nodeHover: null,
                nodeMouseEnter: null,
                nodeMouseLeave: null,
                linkClick: null,
                contextMenu: null,
                viewChanged: null,
                selectionChanged: null,
                dataChanged: null,
                renderStart: null,
                renderComplete: null
            },
            tooltip: {
                enabled: true,
                delay: 300,
                formatter: null
            },
            label: {
                enabled: true,
                fontSize: 12,
                fontFamily: 'Arial, sans-serif',
                textAnchor: 'middle',
                dy: '.35em',
                background: false,
                formatter: null
            },
            transitionDuration: 750,
            performance: {
                throttleSimulation: true,
                simplifyForInteraction: true,
                maxNodesByDefault: 1000
            },
            filters: {
                defaultEnabled: false,
                types: []
            },
            layout: {
                cacheEnabled: true,
                forceLayoutIterations: 300
            },
            debug: false
        };
        
        // Merge default config with user config
        const currentConfig = mergeDeep({}, defaultConfig, config || {});
        
        // Set debug mode
        debugMode = currentConfig.debug;
        
        // Event management
        let eventListeners = {};
        
        /**
         * Deep merge objects
         * @param {Object} target - Target object
         * @param {...Object} sources - Source objects
         * @return {Object} Merged object
         */
        function mergeDeep(target, ...sources) {
            if (!sources.length) return target;
            const source = sources.shift();
            
            if (isObject(target) && isObject(source)) {
                for (const key in source) {
                    if (isObject(source[key])) {
                        if (!target[key]) Object.assign(target, { [key]: {} });
                        mergeDeep(target[key], source[key]);
                    } else {
                        Object.assign(target, { [key]: source[key] });
                    }
                }
            }
            
            return mergeDeep(target, ...sources);
        }
        
        /**
         * Check if value is an object
         * @param {*} item - Value to check
         * @return {boolean} True if object
         */
        function isObject(item) {
            return (item && typeof item === 'object' && !Array.isArray(item));
        }
        
        /**
         * Log debug messages
         * @param {...*} args - Arguments to log
         */
        function debug(...args) {
            if (debugMode) {
                console.log('[Visualization]', ...args);
            }
        }
        
        /**
         * Register an event listener
         * @param {string} eventName - Name of the event
         * @param {Function} callback - Callback function
         * @return {Function} Unsubscribe function
         */
        function on(eventName, callback) {
            if (typeof eventName !== 'string' || typeof callback !== 'function') {
                throw new Error('Event name must be a string and callback must be a function');
            }
            
            // Initialize event array if not exists
            if (!eventListeners[eventName]) {
                eventListeners[eventName] = [];
            }
            
            // Add callback to listeners
            eventListeners[eventName].push(callback);
            
            // Return unsubscribe function
            return function unsubscribe() {
                const index = eventListeners[eventName].indexOf(callback);
                if (index !== -1) {
                    eventListeners[eventName].splice(index, 1);
                }
            };
        }
        
        /**
         * Triggers an event to all registered listeners
         * @param {string} eventName - Name of the event to trigger
         * @param {Object} data - Data to pass to the event handlers
         */
        function triggerEvent(eventName, data = {}) {
            if (!eventListeners[eventName]) return;
            
            eventListeners[eventName].forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in event listener for ${eventName}:`, error);
                }
            });
            
            // Also call the corresponding event handler if defined in config
            const handlerName = eventName.charAt(0).toLowerCase() + eventName.slice(1);
            if (currentConfig.eventHandlers[handlerName]) {
                try {
                    currentConfig.eventHandlers[handlerName](data);
                } catch (error) {
                    console.error(`Error in event handler for ${eventName}:`, error);
                }
            }
        }
        
        /**
         * Initialize the visualization
         * @param {string|Element} container - CSS selector or DOM element to render the visualization
         * @return {boolean} Success indicator
         */
        function initialize(container = currentConfig.container) {
            debug('Initializing visualization');
            
            // Get container element
            if (typeof container === 'string') {
                containerElement = document.querySelector(container);
            } else if (container instanceof Element) {
                containerElement = container;
            } else {
                console.error('Invalid container. Must be a CSS selector or DOM element.');
                return false;
            }
            
            if (!containerElement) {
                console.error('Container element not found.');
                return false;
            }
            
            // Store dimensions
            updateSize();
            
            // Create SVG element
            svg = d3.select(containerElement)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('class', 'visualization-svg')
                .style('background-color', currentConfig.colors.background);
            
            // Create defs for markers and patterns
            const defs = svg.append('defs');
            
            // Create arrow markers for different link types
            Object.entries(currentConfig.linkTypes).forEach(([type, style]) => {
                defs.append('marker')
                    .attr('id', `arrow-${type}`)
                    .attr('viewBox', '0 -5 10 10')
                    .attr('refX', 15)
                    .attr('refY', 0)
                    .attr('markerWidth', 6)
                    .attr('markerHeight', 6)
                    .attr('orient', 'auto')
                    .append('path')
                    .attr('d', 'M0,-5L10,0L0,5')
                    .attr('fill', style.stroke);
            });
            
            // Create zoom behavior
            if (currentConfig.zoom.enabled) {
                zoomHandler = d3.zoom()
                    .scaleExtent(currentConfig.zoom.scaleExtent)
                    .on('zoom', handleZoom);
                
                svg.call(zoomHandler);
                
                // Add zoom layer
                svg.append('g')
                    .attr('class', 'zoom-layer');
            }
            
            // Create loading indicator
            loadingIndicator = d3.select(containerElement)
                .append('div')
                .attr('class', 'visualization-loading')
                .style('position', 'absolute')
                .style('top', '50%')
                .style('left', '50%')
                .style('transform', 'translate(-50%, -50%)')
                .style('background-color', 'rgba(255, 255, 255, 0.8)')
                .style('padding', '20px')
                .style('border-radius', '4px')
                .style('box-shadow', '0 2px 10px rgba(0,0,0,0.2)')
                .style('z-index', '1000')
                .style('display', 'none')
                .text('Loading...');
            
            // Create tooltip
            if (currentConfig.tooltip.enabled) {
                tooltipDiv = d3.select('body').append('div')
                    .attr('class', 'visualization-tooltip')
                    .style('position', 'absolute')
                    .style('visibility', 'hidden')
                    .style('background-color', 'white')
                    .style('border', '1px solid #ddd')
                    .style('border-radius', '4px')
                    .style('padding', '10px')
                    .style('pointer-events', 'none')
                    .style('z-index', '10')
                    .style('font-family', currentConfig.fontFamily)
                    .style('font-size', '12px');
            }
            
            // Create context menu
            contextMenu = d3.select('body').append('div')
                .attr('class', 'visualization-context-menu')
                .style('position', 'absolute')
                .style('visibility', 'hidden')
                .style('background-color', 'white')
                .style('border', '1px solid #ddd')
                .style('border-radius', '4px')
                .style('padding', '4px 0')
                .style('box-shadow', '0 2px 10px rgba(0,0,0,0.2)')
                .style('z-index', '100')
                .style('font-family', currentConfig.fontFamily)
                .style('font-size', '14px');
            
            // Add global event listeners
            window.addEventListener('resize', updateSize);
            document.addEventListener('click', handleDocumentClick);
            document.addEventListener('keydown', handleKeyDown);
            
            // Initialize empty visualization
            createForceSimulation({ nodes: [], links: [] });
            
            // Set initial transformation
            if (currentConfig.zoom.enabled && currentConfig.zoom.initialScale !== 1) {
                const initialTransform = d3.zoomIdentity
                    .translate(width / 2, height / 2)
                    .scale(currentConfig.zoom.initialScale)
                    .translate(-width / 2, -height / 2);
                
                svg.call(zoomHandler.transform, initialTransform);
            }
            
            // Mark as initialized
            triggerEvent('initialized', { config: currentConfig });
            
            return true;
        }
        
        /**
         * Handle document clicks (used for closing menus)
         * @param {Event} event - The DOM event
         */
        function handleDocumentClick(event) {
            // Hide context menu if visible and click is outside
            if (contextMenu && contextMenu.style('visibility') === 'visible') {
                const menuNode = contextMenu.node();
                if (menuNode && !menuNode.contains(event.target)) {
                    hideContextMenu();
                }
            }
        }
        
        /**
         * Handle keyboard events
         * @param {KeyboardEvent} event - The keyboard event
         */
        function handleKeyDown(event) {
            // ESC key closes menus
            if (event.key === 'Escape') {
                hideContextMenu();
            }
            
            // Delete key removes selected node/link if allowed
            if (event.key === 'Delete' || event.key === 'Backspace') {
                if (selectedNode && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
                    removeNode(selectedNode.id);
                    event.preventDefault();
                } else if (selectedLink) {
                    removeLink(selectedLink.id);
                    event.preventDefault();
                }
            }
            
            // Ctrl+Z for undo
            if (event.ctrlKey && event.key === 'z') {
                undoState();
                event.preventDefault();
            }
            
            // Ctrl+Y for redo
            if (event.ctrlKey && event.key === 'y') {
                redoState();
                event.preventDefault();
            }
        }
        
        /**
         * Handle zoom events
         * @param {Event} event - The zoom event
         */
        function handleZoom(event) {
            // Update transform
            transform = event.transform;
            
            // Apply zoom transformation
            const zoomLayer = svg.select('.zoom-layer');
            zoomLayer.attr('transform', transform);
            
            // Update label visibility based on zoom level
            if (currentConfig.label.enabled && labelElements) {
                labelElements.style('visibility', transform.k > 0.5 ? 'visible' : 'hidden');
            }
            
            // Trigger event
            triggerEvent('viewChanged', { transform });
        }
        
        /**
         * Update container size and visualization dimensions
         */
        function updateSize() {
            if (!containerElement) return;
            
            // Get container dimensions
            const containerRect = containerElement.getBoundingClientRect();
            const newWidth = containerRect.width;
            const newHeight = containerRect.height;
            
            // Only update if dimensions changed
            if (width === newWidth && height === newHeight) return;
            
            width = newWidth;
            height = newHeight;
            
            // Update SVG size
            if (svg) {
                svg.attr('width', width)
                    .attr('height', height);
            }
            
            // Update force center if simulation exists
            if (simulation) {
                simulation.force('center', d3.forceCenter(width / 2, height / 2));
                simulation.alpha(0.3).restart();
            }
            
            // Update visualization
            updateVisualization();
            
            // Trigger event
            triggerEvent('resized', { width, height });
        }
        
        /**
         * Create D3 force simulation
         * @param {Object} data - Data with nodes and links
         */
        function createForceSimulation(data) {
            // Create new simulation
            simulation = d3.forceSimulation(data.nodes)
                .force('link', d3.forceLink(data.links)
                    .id(d => d.id)
                    .distance(link => {
                        if (typeof link[currentConfig.linkDistanceAttribute] === 'number') {
                            const range = currentConfig.linkDistanceRange;
                            return range[0] + (link[currentConfig.linkDistanceAttribute] * (range[1] - range[0]));
                        }
                        return currentConfig.simulation.linkDistance;
                    })
                    .strength(currentConfig.simulation.linkStrength))
                .force('charge', d3.forceManyBody()
                    .strength(currentConfig.simulation.forceManyBody))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide()
                    .radius(d => getNodeStyle(d).radius + 5))
                .force('x', d3.forceX().strength(currentConfig.simulation.forceX))
                .force('y', d3.forceY().strength(currentConfig.simulation.forceY))
                .alpha(currentConfig.simulation.alpha)
                .alphaDecay(currentConfig.simulation.alphaDecay)
                .alphaMin(currentConfig.simulation.alphaMin)
                .on('tick', updatePositions);
            
            // Throttle simulation for performance if needed
            if (currentConfig.performance.throttleSimulation && data.nodes.length > 100) {
                let skipTicks = 0;
                const originalTick = simulation.tick;
                
                simulation.tick = function() {
                    originalTick.call(this);
                    skipTicks++;
                    
                    if (skipTicks > 3) {
                        updatePositions();
                        skipTicks = 0;
                    }
                    
                    return this;
                };
            }
        }
        
        /**
         * Update positions of elements based on simulation
         */
        function updatePositions() {
            if (!nodeElements || !linkElements) return;
            
            // Measure render time for performance stats
            const startTime = Date.now();
            
            // Update link positions
            linkElements
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
            
            // Update node positions
            nodeElements
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
            
            // Update label positions
            if (labelElements) {
                labelElements
                    .attr('x', d => d.x)
                    .attr('y', d => d.y);
            }
            
            // Update performance stats
            const renderTime = Date.now() - startTime;
            performanceStats.lastRenderTime = renderTime;
            performanceStats.renderCount++;
            performanceStats.frameRate = Math.round(1000 / (Date.now() - lastRenderTime));
            lastRenderTime = Date.now();
        }
        
        /**
         * Render visualization with data
         * @param {Object} data - Data with nodes and links arrays
         */
        function renderVisualization(data) {
            if (!svg) return;
            
            debug('Rendering visualization', data.nodes.length, 'nodes,', data.links.length, 'links');
            
            // Check if already rendering
            if (isRendering) {
                debug('Already rendering, queuing request');
                renderQueue.push(data);
                return;
            }
            
            isRendering = true;
            triggerEvent('renderStart', { nodeCount: data.nodes.length, linkCount: data.links.length });
            
            // Show loading indicator for large datasets
            const isLargeDataset = data.nodes.length > 500 || data.links.length > 1000;
            
            if (isLargeDataset && loadingIndicator) {
                loadingIndicator.style('display', 'block');
            }
            
            // Process rendering in next frame for better UI responsiveness
            setTimeout(() => {
                try {
                    // Reference to visualization layer
                    const vizLayer = currentConfig.zoom.enabled 
                        ? svg.select('.zoom-layer') 
                        : svg;
                    
                    // Clear previous elements
                    vizLayer.selectAll('.link, .node, .label').remove();
                    
                    // Create link elements
                    linkElements = vizLayer.selectAll('.link')
                        .data(data.links, d => d.id)
                        .enter()
                        .append('line')
                        .attr('class', 'link')
                        .attr('stroke', d => getLinkStyle(d).stroke)
                        .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
                        .attr('stroke-dasharray', d => getLinkStyle(d).dasharray)
                        .style('pointer-events', 'stroke')
                        .style('cursor', 'pointer')
                        .on('mouseover', function(event, d) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', getLinkStyle(d).strokeWidth * 1.5);
                        })
                        .on('mouseout', function(event, d) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', getLinkStyle(d).strokeWidth);
                        })
                        .on('click', function(event, d) {
                            handleLinkClick(event, d);
                        });
                    
                    // Define drag behavior
                    const dragBehavior = d3.drag()
                        .on('start', dragStarted)
                        .on('drag', dragged)
                        .on('end', dragEnded);
                    
                    // Create node elements
                    nodeElements = vizLayer.selectAll('.node')
                        .data(data.nodes, d => d.id)
                        .enter()
                        .append('circle')
                        .attr('class', 'node')
                        .attr('r', d => getNodeStyle(d).radius)
                        .attr('fill', d => getNodeStyle(d).fill)
                        .attr('stroke', d => getNodeStyle(d).stroke)
                        .attr('stroke-width', d => getNodeStyle(d).strokeWidth)
                        .style('cursor', 'pointer')
                        .call(dragBehavior)
                        .on('mouseover', function(event, d) {
                            handleNodeMouseover(event, d, this);
                        })
                        .on('mouseout', function(event, d) {
                            handleNodeMouseout(event, d, this);
                        })
                        .on('click', function(event, d) {
                            handleNodeClick(event, d);
                        })
                        .on('contextmenu', function(event, d) {
                            // Prevent default context menu
                            event.preventDefault();
                            
                            // Show custom context menu if handler provided
                            showContextMenu(event, d);
                        });
                    
                    // Create node labels
                    if (currentConfig.label.enabled) {
                        labelElements = vizLayer.selectAll('.label')
                            .data(data.nodes, d => d.id)
                            .enter()
                            .append('text')
                            .attr('class', 'label')
                            .attr('text-anchor', currentConfig.label.textAnchor)
                            .attr('dy', currentConfig.label.dy)
                            .attr('font-family', currentConfig.label.fontFamily)
                            .attr('font-size', currentConfig.label.fontSize)
                            .attr('fill', currentConfig.colors.text)
                            .attr('pointer-events', 'none')
                            .text(d => {
                                if (currentConfig.label.formatter) {
                                    return currentConfig.label.formatter(d);
                                }
                                
                                const labelAttr = currentConfig.labelAttribute;
                                return d[labelAttr] || d.name || d.id;
                            });
                        
                        // Add label backgrounds if configured
                        if (currentConfig.label.background) {
                            labelElements.each(function(d) {
                                const text = d3.select(this);
                                const bbox = this.getBBox();
                                
                                const rect = vizLayer.insert('rect', 'text')
                                    .attr('class', 'label-background')
                                    .attr('x', bbox.x - 2)
                                    .attr('y', bbox.y - 2)
                                    .attr('width', bbox.width + 4)
                                    .attr('height', bbox.height + 4)
                                    .attr('fill', 'white')
                                    .attr('fill-opacity', 0.7)
                                    .attr('rx', 2)
                                    .attr('ry', 2);
                                
                                // Move rect behind text
                                rect.lower();
                            });
                        }
                    }
                    
                    // Update positions
                    updatePositions();
                    
                    // Cache layout if enabled
                    if (currentConfig.layout.cacheEnabled) {
                        const cacheKey = data.nodes.map(n => n.id).sort().join('-');
                        layoutCache[cacheKey] = data.nodes.map(node => ({
                            id: node.id,
                            x: node.x,
                            y: node.y
                        }));
                    }
                    
                    // Update performance stats
                    performanceStats.nodeCount = data.nodes.length;
                    performanceStats.linkCount = data.links.length;
                    
                    // Hide loading indicator
                    if (loadingIndicator) {
                        loadingIndicator.style('display', 'none');
                    }
                    
                    // Complete rendering
                    isRendering = false;
                    triggerEvent('renderComplete', { 
                        nodeCount: data.nodes.length, 
                        linkCount: data.links.length,
                        renderTime: performanceStats.lastRenderTime
                    });
                    
                    // Process queued renders if any
                    if (renderQueue.length > 0) {
                        const nextData = renderQueue.shift();
                        renderVisualization(nextData);
                    }
                } catch (error) {
                    console.error('Error rendering visualization:', error);
                    
                    // Reset rendering state
                    isRendering = false;
                    
                    // Hide loading indicator
                    if (loadingIndicator) {
                        loadingIndicator.style('display', 'none');
                    }
                }
            }, 0);
        }
        
        /**
         * Handle node drag start event
         * @param {Event} event - The drag event
         * @param {Object} d - The node data
         */
        function dragStarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            
            // Fix node position during drag
            d.fx = d.x;
            d.fy = d.y;
            
            // Select node on drag start
            if (currentConfig.fixNodesOnDrag && !selectedNode) {
                handleNodeClick(event, d);
            }
        }
        
        /**
         * Handle node drag event
         * @param {Event} event - The drag event
         * @param {Object} d - The node data
         */
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
            
            // If simplifying for interaction, do minimal updates
            if (currentConfig.performance.simplifyForInteraction) {
                // Only update the dragged node
                d3.select(event.sourceEvent.target)
                    .attr('cx', d.x = event.x)
                    .attr('cy', d.y = event.y);
                
                // Find and update connected links
                const connectedLinks = linkElements.filter(link => 
                    link.source.id === d.id || link.target.id === d.id
                );
                
                connectedLinks
                    .attr('x1', link => link.source.id === d.id ? d.x : link.source.x)
                    .attr('y1', link => link.source.id === d.id ? d.y : link.source.y)
                    .attr('x2', link => link.target.id === d.id ? d.x : link.target.x)
                    .attr('y2', link => link.target.id === d.id ? d.y : link.target.y);
                
                // Find and update the node's label
                if (labelElements) {
                    labelElements.filter(label => label.id === d.id)
                        .attr('x', d.x)
                        .attr('y', d.y);
                }
            }
        }
        
        /**
         * Handle node drag end event
         * @param {Event} event - The drag event
         * @param {Object} d - The node data
         */
        function dragEnded(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            
            // Unfix node position if not selected and fixNodesOnDrag is false
            if (!currentConfig.fixNodesOnDrag && (!selectedNode || selectedNode.id !== d.id)) {
                d.fx = null;
                d.fy = null;
            }
            
            // Update cache with new positions
            if (currentConfig.layout.cacheEnabled) {
                const cacheKey = nodes.map(n => n.id).sort().join('-');
                if (layoutCache[cacheKey]) {
                    layoutCache[cacheKey] = nodes.map(node => ({
                        id: node.id,
                        x: node.x,
                        y: node.y
                    }));
                }
            }
        }
        
        /**
         * Handle node mouseover event
         * @param {Event} event - The DOM event
         * @param {Object} d - The node data
         * @param {Element} element - The DOM element
         */
        function handleNodeMouseover(event, d, element) {
            if (!d) return;
            
            // Highlight node
            d3.select(element)
                .transition()
                .duration(200)
                .attr('r', getNodeStyle(d).radius * 1.2)
                .attr('stroke', currentConfig.colors.highlight)
                .attr('stroke-width', 2);
            
            // Highlight connected nodes
            if (currentConfig.highlight.propagationLevels > 0) {
                highlightConnections(d, currentConfig.highlight.propagationLevels);
            }
            
            // Show tooltip if enabled
            if (currentConfig.tooltip.enabled) {
                showTooltip(event, d);
            }
            
            // Call custom hover handler if provided
            if (currentConfig.eventHandlers.nodeHover) {
                currentConfig.eventHandlers.nodeHover(d.id);
            }
            
            // Trigger event
            triggerEvent('nodeMouseEnter', d);
        }
        
        /**
         * Handle node mouseout event
         * @param {Event} event - The DOM event
         * @param {Object} d - The node data
         * @param {Element} element - The DOM element
         */
        function handleNodeMouseout(event, d, element) {
            if (!d) return;
            
            // Reset node style
            d3.select(element)
                .transition()
                .duration(200)
                .attr('r', getNodeStyle(d).radius)
                .attr('stroke', getNodeStyle(d).stroke)
                .attr('stroke-width', getNodeStyle(d).strokeWidth);
            
            // Reset highlighted nodes
            if (currentConfig.highlight.propagationLevels > 0) {
                clearHighlights();
            }
            
            // Hide tooltip
            if (currentConfig.tooltip.enabled) {
                hideTooltip();
            }
            
            // Call custom hover handler with null to indicate hover end
            if (currentConfig.eventHandlers.nodeHover) {
                currentConfig.eventHandlers.nodeHover(null);
            }
            
            // Trigger event
            triggerEvent('nodeMouseLeave', d);
        }
        
        /**
         * Handle node click event
         * @param {Event} event - The DOM event
         * @param {Object} d - The node data
         */
        function handleNodeClick(event, d) {
            if (!d) return;
            
            // Prevent event propagation
            event.stopPropagation();
            
            // Toggle selection
            if (selectedNode && selectedNode.id === d.id) {
                // Deselect
                selectedNode = null;
                clearFixedNodes();
            } else {
                // Deselect selected link if any
                selectedLink = null;
                
                // Select new node
                selectedNode = d;
                
                // Fix node position
                if (currentConfig.fixNodesOnDrag) {
                    d.fx = d.x;
                    d.fy = d.y;
                }
            }
            
            // Update visualization to reflect selection
            updateVisualization();
            
            // Call custom click handler if provided
            if (currentConfig.eventHandlers.nodeClick) {
                currentConfig.eventHandlers.nodeClick(selectedNode ? selectedNode.id : null);
            }
            
            // Trigger event
            triggerEvent('selectionChanged', { type: 'node', node: selectedNode });
        }
        
        /**
         * Handle link click event
         * @param {Event} event - The DOM event
         * @param {Object} d - The link data
         */
        function handleLinkClick(event, d) {
            if (!d) return;
            
            // Prevent event propagation
            event.stopPropagation();
            
            // Toggle selection
            if (selectedLink && selectedLink.id === d.id) {
                // Deselect
                selectedLink = null;
            } else {
                // Deselect selected node if any
                selectedNode = null;
                clearFixedNodes();
                
                // Select new link
                selectedLink = d;
            }
            
            // Update visualization to reflect selection
            updateVisualization();
            
            // Call custom click handler if provided
            if (currentConfig.eventHandlers.linkClick) {
                currentConfig.eventHandlers.linkClick(selectedLink ? selectedLink.id : null);
            }
            
            // Trigger event
            triggerEvent('selectionChanged', { type: 'link', link: selectedLink });
        }
        
        /**
         * Clear fixed positions for all nodes
         */
        function clearFixedNodes() {
            nodes.forEach(node => {
                node.fx = null;
                node.fy = null;
            });
        }
        
        /**
         * Highlight nodes connected to the given node
         * @param {Object} node - Source node
         * @param {number} levels - Number of levels to propagate (1 = direct connections)
         */
        function highlightConnections(node, levels = 1) {
            if (!node || levels <= 0) return;
            
            // Clear existing highlights
            clearHighlights();
            
            // Build connected nodes map with BFS
            const visited = new Set([node.id]);
            let frontier = [{ node, level: 0 }];
            
            while (frontier.length > 0) {
                const { node: current, level } = frontier.shift();
                
                // Skip if exceeded maximum level
                if (level > levels) continue;
                
                // Add to highlighted nodes
                highlightedNodes.add(current.id);
                
                // Find connected links and add them to highlighted links
                links.forEach(link => {
                    const isSourceConnected = link.source.id === current.id;
                    const isTargetConnected = link.target.id === current.id;
                    
                    if (isSourceConnected || isTargetConnected) {
                        highlightedLinks.add(link.id);
                        
                        // Get connected node
                        const connectedNode = isSourceConnected ? link.target : link.source;
                        
                        // Add connected node to frontier if not visited
                        if (!visited.has(connectedNode.id)) {
                            visited.add(connectedNode.id);
                            frontier.push({ node: connectedNode, level: level + 1 });
                        }
                    }
                });
            }
            
            // Update node and link styles
            updateHighlightStyles();
        }
        
        /**
         * Clear all highlights
         */
        function clearHighlights() {
            highlightedNodes.clear();
            highlightedLinks.clear();
            
            // Reset styles
            if (nodeElements) {
                nodeElements.each(function(d) {
                    const node = d3.select(this);
                    const style = getNodeStyle(d);
                    
                    node.transition()
                        .duration(200)
                        .attr('fill', style.fill)
                        .attr('stroke', style.stroke)
                        .attr('stroke-width', style.strokeWidth);
                });
            }
            
            if (linkElements) {
                linkElements.each(function(d) {
                    const link = d3.select(this);
                    const style = getLinkStyle(d);
                    
                    link.transition()
                        .duration(200)
                        .attr('stroke', style.stroke)
                        .attr('stroke-width', style.strokeWidth)
                        .attr('stroke-dasharray', style.dasharray);
                });
            }
        }
        
        /**
         * Update styles for highlighted elements
         */
        function updateHighlightStyles() {
            if (!nodeElements || !linkElements) return;
            
            // Update node styles
            nodeElements.each(function(d) {
                const node = d3.select(this);
                let style;
                
                if (highlightedNodes.has(d.id)) {
                    style = currentConfig.highlight.node;
                } else {
                    style = getNodeStyle(d);
                    
                    // Fade non-highlighted nodes
                    node.transition()
                        .duration(200)
                        .attr('opacity', 0.3);
                }
                
                node.transition()
                    .duration(200)
                    .attr('fill', style.fill)
                    .attr('stroke', style.stroke)
                    .attr('stroke-width', style.strokeWidth)
                    .attr('opacity', 1);
            });
            
            // Update link styles
            linkElements.each(function(d) {
                const link = d3.select(this);
                let style;
                
                if (highlightedLinks.has(d.id)) {
                    style = currentConfig.highlight.link;
                } else {
                    style = getLinkStyle(d);
                    
                    // Fade non-highlighted links
                    link.transition()
                        .duration(200)
                        .attr('opacity', 0.1);
                }
                
                link.transition()
                    .duration(200)
                    .attr('stroke', style.stroke)
                    .attr('stroke-width', style.strokeWidth)
                    .attr('stroke-dasharray', style.dasharray)
                    .attr('opacity', 1);
            });
        }
        
        /**
         * Show tooltip for node
         * @param {Event} event - The DOM event
         * @param {Object} node - The node data
         */
        function showTooltip(event, node) {
            if (!tooltipDiv || !node) return false;
            
            // Use custom formatter if provided
            let content = '';
            if (currentConfig.tooltip.formatter) {
                content = currentConfig.tooltip.formatter(node);
            } else {
                // Default tooltip content
                content = `<div style="font-weight:bold; margin-bottom:5px;">${node.name || node.id}</div>`;
                
                // Add type if available
                if (node.type) {
                    content += `<div style="color:#666; margin-bottom:5px;">${node.type}</div>`;
                }
                
                // Add description if available
                if (node.description) {
                    content += `<div style="margin-bottom:8px;">${node.description}</div>`;
                }
                
                // Add additional properties
                const properties = Object.entries(node)
                    .filter(([key]) => !['id', 'name', 'description', 'type', 'x', 'y', 'fx', 'fy', 'vx', 'vy', 'index'].includes(key))
                    .map(([key, value]) => `<div><span style="color:#666; font-weight:bold;">${key}:</span> ${value}</div>`)
                    .join('');
                
                if (properties) {
                    content += `<div style="font-size:11px;">${properties}</div>`;
                }
            }
            
            tooltipDiv.html(content)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 10) + 'px')
                .transition()
                .duration(200)
                .style('opacity', 0.9)
                .style('visibility', 'visible');
            
            return true;
        }
        
        /**
         * Hide the tooltip
         */
        function hideTooltip() {
            if (!tooltipDiv) return false;
            
            tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0)
                .style('visibility', 'hidden');
            
            return true;
        }
        
        /**
         * Show context menu for node
         * @param {Event} event - The DOM event
         * @param {Object} node - The node data
         */
        function showContextMenu(event, node) {
            if (!contextMenu || !node || !currentConfig.eventHandlers.contextMenu) return false;
            
            // Get menu items from handler
            const menuItems = currentConfig.eventHandlers.contextMenu(node);
            
            if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
                return false;
            }
            
            // Clear existing menu
            contextMenu.html('');
            
            // Create menu items
            menuItems.forEach(item => {
                contextMenu.append('div')
                    .attr('class', 'menu-item')
                    .style('padding', '8px 16px')
                    .style('cursor', 'pointer')
                    .style('hover', 'background-color: #f5f5f5')
                    .text(item.label)
                    .on('click', () => {
                        // Hide menu
                        hideContextMenu();
                        
                        // Execute action
                        if (item.action) {
                            item.action(node.id);
                        }
                    })
                    .on('mouseover', function() {
                        d3.select(this).style('background-color', '#f5f5f5');
                    })
                    .on('mouseout', function() {
                        d3.select(this).style('background-color', 'white');
                    });
                
                // Add separator after groups
                if (item.separator) {
                    contextMenu.append('div')
                        .style('height', '1px')
                        .style('background-color', '#ddd')
                        .style('margin', '4px 0');
                }
            });
            
            // Show menu at event position
            contextMenu
                .style('visibility', 'visible')
                .style('left', (event.pageX) + 'px')
                .style('top', (event.pageY) + 'px');
            
            return true;
        }
        
        /**
         * Hide the context menu
         */
        function hideContextMenu() {
            if (!contextMenu) return;
            
            contextMenu.style('visibility', 'hidden');
        }
        
        /**
         * Get style for a node based on its type and state
         * @param {Object} node - The node data
         * @return {Object} Style object for the node
         */
        function getNodeStyle(node) {
            const defaultStyle = {
                radius: currentConfig.nodeSizeRange[0],
                fill: currentConfig.colors.node,
                stroke: darkenColor(currentConfig.colors.node, 20),
                strokeWidth: 1
            };
            
            // Check if this is the selected node
            if (selectedNode && node.id === selectedNode.id) {
                return { ...defaultStyle, ...currentConfig.selection.node }
            };
            
            // Get style based on node type
            if (node.type && currentConfig.nodeTypes[node.type]) {
                return { ...defaultStyle, ...currentConfig.nodeTypes[node.type] };
            }
            
            // Apply custom styling based on node properties
            if (currentConfig.nodeSizeAttribute && node[currentConfig.nodeSizeAttribute] !== undefined) {
                const sizeScale = d3.scaleLinear()
                    .domain(d3.extent(nodes, d => d[currentConfig.nodeSizeAttribute] || 0))
                    .range(currentConfig.nodeSizeRange);
                
                defaultStyle.radius = sizeScale(node[currentConfig.nodeSizeAttribute] || 0);
            }
            
            if (currentConfig.nodeColorAttribute && node[currentConfig.nodeColorAttribute] !== undefined) {
                const colorScale = getColorScale(currentConfig.nodeColorAttribute);
                defaultStyle.fill = colorScale(node[currentConfig.nodeColorAttribute]);
                defaultStyle.stroke = darkenColor(defaultStyle.fill, 20);
            }
            
            return defaultStyle;
        }
        
        /**
         * Get style for a link based on its type and state
         * @param {Object} link - The link data
         * @return {Object} Style object for the link
         */
        function getLinkStyle(link) {
            const defaultStyle = {
                stroke: currentConfig.colors.link,
                strokeWidth: 1,
                dasharray: null
            };
            
            // Check if this is the selected link
            if (selectedLink && link.id === selectedLink.id) {
                return { ...defaultStyle, ...currentConfig.selection.link };
            }
            
            // Get style based on link type
            if (link.type && currentConfig.linkTypes[link.type]) {
                return { ...defaultStyle, ...currentConfig.linkTypes[link.type] };
            }
            
            // Apply custom styling based on link properties
            if (currentConfig.linkWidthAttribute && link[currentConfig.linkWidthAttribute] !== undefined) {
                const widthScale = d3.scaleLinear()
                    .domain(d3.extent(links, d => d[currentConfig.linkWidthAttribute] || 0))
                    .range(currentConfig.linkWidthRange);
                
                defaultStyle.strokeWidth = widthScale(link[currentConfig.linkWidthAttribute] || 0);
            }
            
            return defaultStyle;
        }
        
        /**
         * Get a color scale for a specific attribute
         * @param {string} attribute - Attribute name
         * @return {Function} D3 color scale function
         */
        function getColorScale(attribute) {
            // Return cached scale if exists
            if (colorScales[attribute]) {
                return colorScales[attribute];
            }
            
            // Get unique values for categorical data
            const values = [...new Set(nodes.map(d => d[attribute]).filter(Boolean))];
            
            let scale;
            if (values.length <= 10) {
                // Use categorical scale for small number of values
                scale = d3.scaleOrdinal()
                    .domain(values)
                    .range(d3.schemeCategory10);
            } else {
                // Use sequential scale for numeric data
                const extent = d3.extent(nodes, d => d[attribute]);
                scale = d3.scaleSequential(d3.interpolateViridis)
                    .domain(extent);
            }
            
            // Cache scale
            colorScales[attribute] = scale;
            
            return scale;
        }
        
        /**
         * Darken a color by a percentage
         * @param {string} color - CSS color string
         * @param {number} percent - Percentage to darken (0-100)
         * @return {string} Darkened color string
         */
        function darkenColor(color, percent) {
            try {
                const rgb = d3.rgb(color);
                const darkenedRgb = d3.rgb(
                    Math.max(0, rgb.r - (rgb.r * percent / 100)),
                    Math.max(0, rgb.g - (rgb.g * percent / 100)),
                    Math.max(0, rgb.b - (rgb.b * percent / 100))
                );
                return darkenedRgb.toString();
            } catch (e) {
                // Return original color if parsing fails
                return color;
            }
        }
        
        /**
         * Save current visualization state
         */
        function saveState() {
            // Remove redundant states
            if (currentStateIndex < savedStates.length - 1) {
                savedStates = savedStates.slice(0, currentStateIndex + 1);
            }
            
            // Save current nodes and links
            const state = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                links: JSON.parse(JSON.stringify(links)),
                selectedNode: selectedNode ? selectedNode.id : null,
                selectedLink: selectedLink ? selectedLink.id : null,
                transform: { ...transform }
            };
            
            // Add state to stack
            savedStates.push(state);
            
            // Limit stack size
            if (savedStates.length > 20) {
                savedStates.shift();
            } else {
                currentStateIndex++;
            }
        }
        
        /**
         * Undo last action
         * @return {boolean} True if undo was successful
         */
        function undo() {
            if (currentStateIndex <= 0) {
                return false;
            }
            
            currentStateIndex--;
            const state = savedStates[currentStateIndex];
            
            // Restore state
            restoreState(state);
            
            return true;
        }
        
        /**
         * Redo previously undone action
         * @return {boolean} True if redo was successful
         */
        function redo() {
            if (currentStateIndex >= savedStates.length - 1) {
                return false;
            }
            
            currentStateIndex++;
            const state = savedStates[currentStateIndex];
            
            // Restore state
            restoreState(state);
            
            return true;
        }
        
        /**
         * Restore a saved state
         * @param {Object} state - State to restore
         */
        function restoreState(state) {
            if (!state) return;
            
            // Restore nodes and links
            nodes = state.nodes;
            links = state.links;
            
            // Restore selection
            selectedNode = state.selectedNode ? nodeRegistry.get(state.selectedNode) : null;
            selectedLink = state.selectedLink ? linkRegistry.get(state.selectedLink) : null;
            
            // Restore transform
            transform = { ...state.transform };
            
            // Update visualization
            updateVisualization(true);
        }
        
        /**
         * Get current performance statistics
         * @return {Object} Performance statistics
         */
        function getPerformanceStats() {
            return { ...performanceStats };
        }
        
        /**
         * Export visualization as PNG
         * @param {string} filename - Filename for the exported image
         * @return {Promise<string>} Base64 data URL of the image
         */
        function exportAsPNG(filename = 'visualization.png') {
            return new Promise((resolve, reject) => {
                if (!svg) {
                    reject(new Error('SVG element not found'));
                    return;
                }
                
                try {
                    // Create a canvas element
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    
                    // Get SVG dimensions
                    const svgBBox = svg.node().getBoundingClientRect();
                    canvas.width = svgBBox.width;
                    canvas.height = svgBBox.height;
                    
                    // Fill background
                    context.fillStyle = currentConfig.colors.background;
                    context.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // Convert SVG to data URL
                    const svgData = new XMLSerializer().serializeToString(svg.node());
                    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const svgUrl = URL.createObjectURL(svgBlob);
                    
                    // Create image element
                    const img = new Image();
                    
                    img.onload = function() {
                        // Draw image on canvas
                        context.drawImage(img, 0, 0);
                        
                        // Convert to data URL
                        const dataUrl = canvas.toDataURL('image/png');
                        
                        // Create download if filename is provided
                        if (filename) {
                            // Create download link
                            const a = document.createElement('a');
                            a.href = dataUrl;
                            a.download = filename;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }
                        
                        // Resolve with data URL
                        resolve(dataUrl);
                        
                        // Clean up
                        URL.revokeObjectURL(svgUrl);
                    };
                    
                    img.onerror = function(error) {
                        reject(error);
                    };
                    
                    img.src = svgUrl;
                } catch (error) {
                    reject(error);
                }
            });
        }
        
        /**
         * Export visualization data as JSON
         * @param {string} filename - Filename for the exported data
         * @return {Object} Exported data object
         */
        function exportAsJSON(filename = 'visualization.json') {
            // Create data object
            const data = {
                nodes: nodes.map(d => ({
                    id: d.id,
                    ...Object.fromEntries(
                        Object.entries(d).filter(([key]) => !['x', 'y', 'vx', 'vy', 'index', 'fx', 'fy', 'source', 'target'].includes(key))
                    )
                })),
                links: links.map(d => ({
                    id: d.id,
                    source: typeof d.source === 'object' ? d.source.id : d.source,
                    target: typeof d.target === 'object' ? d.target.id : d.target,
                    ...Object.fromEntries(
                        Object.entries(d).filter(([key]) => !['index', 'source', 'target'].includes(key))
                    )
                })),
                config: currentConfig
            };
            
            // Create download if filename is provided
            if (filename) {
                const dataStr = JSON.stringify(data, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const dataUrl = URL.createObjectURL(dataBlob);
                
                // Create download link
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                // Clean up
                URL.revokeObjectURL(dataUrl);
            }
            
            return data;
        }
        
        /**
         * Import visualization data from JSON
         * @param {Object|string} data - JSON data object or string
         * @return {boolean} True if import was successful
         */
        function importFromJSON(data) {
            try {
                // Parse string if needed
                if (typeof data === 'string') {
                    data = JSON.parse(data);
                }
                
                // Validate data structure
                if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
                    throw new Error('Invalid data format. Expected object with nodes and links arrays.');
                }
                
                // Save state before import
                saveState();
                
                // Import nodes and links
                setData(data.nodes, data.links);
                
                // Import config if available
                if (data.config) {
                    updateConfig(data.config);
                }
                
                return true;
            } catch (error) {
                console.error('Error importing data:', error);
                return false;
            }
        }
        
        /**
         * Find nodes that match a query
         * @param {Object} query - Query object with attributes to match
         * @return {Array} Array of matching nodes
         */
        function findNodes(query) {
            if (!query || typeof query !== 'object') {
                return [];
            }
            
            return nodes.filter(node => {
                return Object.entries(query).every(([key, value]) => {
                    // Skip undefined values
                    if (value === undefined) return true;
                    
                    // Check if node has the property
                    if (!(key in node)) return false;
                    
                    // Handle regular expressions
                    if (value instanceof RegExp) {
                        return value.test(String(node[key]));
                    }
                    
                    // Handle arrays (any match)
                    if (Array.isArray(value)) {
                        return value.includes(node[key]);
                    }
                    
                    // Direct comparison
                    return node[key] === value;
                });
            });
        }
        
        /**
         * Find links that match a query
         * @param {Object} query - Query object with attributes to match
         * @return {Array} Array of matching links
         */
        function findLinks(query) {
            if (!query || typeof query !== 'object') {
                return [];
            }
            
            return links.filter(link => {
                return Object.entries(query).every(([key, value]) => {
                    // Handle special source/target matching
                    if (key === 'source' || key === 'target') {
                        const nodeId = typeof link[key] === 'object' ? link[key].id : link[key];
                        return nodeId === value;
                    }
                    
                    // Skip undefined values
                    if (value === undefined) return true;
                    
                    // Check if link has the property
                    if (!(key in link)) return false;
                    
                    // Handle regular expressions
                    if (value instanceof RegExp) {
                        return value.test(String(link[key]));
                    }
                    
                    // Handle arrays (any match)
                    if (Array.isArray(value)) {
                        return value.includes(link[key]);
                    }
                    
                    // Direct comparison
                    return link[key] === value;
                });
            });
        }
        
        /**
         * Show loading indicator
         */
        function showLoading() {
            if (!loadingIndicator) {
                loadingIndicator = d3.select(containerElement)
                    .append('div')
                    .attr('class', 'loading-indicator')
                    .style('position', 'absolute')
                    .style('top', '50%')
                    .style('left', '50%')
                    .style('transform', 'translate(-50%, -50%)')
                    .style('background-color', 'rgba(255, 255, 255, 0.8)')
                    .style('padding', '20px')
                    .style('border-radius', '5px')
                    .style('box-shadow', '0 0 10px rgba(0, 0, 0, 0.2)')
                    .style('text-align', 'center')
                    .style('z-index', '1000');
                
                loadingIndicator.append('div')
                    .style('margin-bottom', '10px')
                    .text('Loading...');
                
                // Create spinner
                const spinner = loadingIndicator.append('div')
                    .style('width', '30px')
                    .style('height', '30px')
                    .style('border', '3px solid #f3f3f3')
                    .style('border-top', '3px solid #3498db')
                    .style('border-radius', '50%')
                    .style('margin', '0 auto')
                    .style('animation', 'spin 1s linear infinite');
                
                // Add keyframes for spinner
                const style = document.createElement('style');
                style.innerHTML = `
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);
            } else {
                loadingIndicator.style('display', 'block');
            }
        }
        
        /**
         * Hide loading indicator
         */
        function hideLoading() {
            if (loadingIndicator) {
                loadingIndicator.style('display', 'none');
            }
        }
        
        /**
         * Initialize visualization
         */
        function initialize() {
            debug('Initializing visualization');
            
            // Get container element
            containerElement = document.querySelector(currentConfig.container);
            if (!containerElement) {
                throw new Error(`Container element '${currentConfig.container}' not found`);
            }
            
            // Set container style
            containerElement.style.position = 'relative';
            containerElement.style.overflow = 'hidden';
            
            // Set width and height
            if (currentConfig.width) {
                containerElement.style.width = typeof currentConfig.width === 'number' ? `${currentConfig.width}px` : currentConfig.width;
            }
            
            if (currentConfig.height) {
                containerElement.style.height = typeof currentConfig.height === 'number' ? `${currentConfig.height}px` : currentConfig.height;
            }
            
            // Get dimensions
            const container = d3.select(containerElement);
            const containerBBox = containerElement.getBoundingClientRect();
            width = containerBBox.width;
            height = containerBBox.height;
            
            // Create SVG element
            svg = container.append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', [0, 0, width, height])
                .style('font-family', currentConfig.fontFamily)
                .style('user-select', 'none')
                .style('cursor', 'move');
            
            // Add defs for patterns and markers
            const defs = svg.append('defs');
            
            // Add arrowhead marker
            defs.append('marker')
                .attr('id', 'arrow')
                .attr('viewBox', '0 -5 10 10')
                .attr('refX', 15)
                .attr('refY', 0)
                .attr('markerWidth', 6)
                .attr('markerHeight', 6)
                .attr('orient', 'auto')
                .append('path')
                .attr('d', 'M0,-5L10,0L0,5')
                .attr('fill', currentConfig.colors.link);
            
            // Create tooltip div
            if (currentConfig.tooltip.enabled) {
                tooltipDiv = container.append('div')
                    .attr('class', 'tooltip')
                    .style('position', 'absolute')
                    .style('visibility', 'hidden')
                    .style('opacity', 0)
                    .style('background-color', '#fff')
                    .style('padding', '10px')
                    .style('border-radius', '3px')
                    .style('box-shadow', '0 0 10px rgba(0, 0, 0, 0.2)')
                    .style('max-width', '300px')
                    .style('font-size', '12px')
                    .style('z-index', 1000)
                    .style('pointer-events', 'none');
            }
            
            // Create context menu div
            contextMenu = container.append('div')
                .attr('class', 'context-menu')
                .style('position', 'absolute')
                .style('visibility', 'hidden')
                .style('background-color', '#fff')
                .style('border-radius', '3px')
                .style('box-shadow', '0 0 10px rgba(0, 0, 0, 0.2)')
                .style('min-width', '150px')
                .style('z-index', 1001);
            
            // Create container for links
            const linkGroup = svg.append('g')
                .attr('class', 'links');
            
            // Create container for nodes
            const nodeGroup = svg.append('g')
                .attr('class', 'nodes');
            
            // Create container for labels
            const labelGroup = svg.append('g')
                .attr('class', 'labels');
            
            // Initialize zoom behavior
            if (currentConfig.zoom.enabled) {
                zoomHandler = d3.zoom()
                    .scaleExtent(currentConfig.zoom.scaleExtent)
                    .on('zoom', handleZoom);
                
                svg.call(zoomHandler);
                
                // Apply initial zoom
                if (currentConfig.zoom.initialScale !== 1) {
                    svg.call(
                        zoomHandler.transform,
                        d3.zoomIdentity
                            .translate(width / 2, height / 2)
                            .scale(currentConfig.zoom.initialScale)
                            .translate(-width / 2, -height / 2)
                    );
                }
            }
            
            // Handle document-level click for closing context menu
            document.addEventListener('click', event => {
                // Check if click was outside the context menu
                if (contextMenu && contextMenu.style('visibility') === 'visible') {
                    const menuRect = contextMenu.node().getBoundingClientRect();
                    if (
                        event.clientX < menuRect.left ||
                        event.clientX > menuRect.right ||
                        event.clientY < menuRect.top ||
                        event.clientY > menuRect.bottom
                    ) {
                        hideContextMenu();
                    }
                }
            });
            
            // Handle window resize
            window.addEventListener('resize', debounce(() => {
                // Get new dimensions
                const containerBBox = containerElement.getBoundingClientRect();
                width = containerBBox.width;
                height = containerBBox.height;
                
                // Update SVG dimensions
                svg.attr('width', width)
                    .attr('height', height)
                    .attr('viewBox', [0, 0, width, height]);
                
                // Update simulation
                if (simulation) {
                    simulation.force('center', d3.forceCenter(width / 2, height / 2));
                    simulation.alpha(0.3).restart();
                }
                
                // Trigger event
                triggerEvent('viewChanged', { width, height });
            }, 250));
            
            debug('Visualization initialized');
        }
        
        /**
         * Handle zoom event
         * @param {Event} event - D3 zoom event
         */
        function handleZoom(event) {
            // Store transform
            transform = event.transform;
            
            // Apply transform to all groups
            svg.selectAll('g').attr('transform', transform);
            
            // Adjust node and label size based on zoom level
            if (nodeElements) {
                nodeElements.attr('r', d => {
                    const style = getNodeStyle(d);
                    return style.radius / transform.k;
                });
            }
            
            if (labelElements && currentConfig.label.enabled) {
                labelElements.style('font-size', `${currentConfig.label.fontSize / transform.k}px`);
            }
            
            // Trigger event
            triggerEvent('viewChanged', { transform });
        }
        
        /**
         * Create D3 force simulation
         */
        function createSimulation() {
            debug('Creating force simulation');
            
            // Create simulation
            simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(links)
                    .id(d => d.id)
                    .distance(d => {
                        if (currentConfig.linkDistanceAttribute && d[currentConfig.linkDistanceAttribute] !== undefined) {
                            const scale = d3.scaleLinear()
                                .domain(d3.extent(links, link => link[currentConfig.linkDistanceAttribute] || 0))
                                .range(currentConfig.linkDistanceRange);
                            
                            return scale(d[currentConfig.linkDistanceAttribute] || 0);
                        }
                        
                        return currentConfig.simulation.linkDistance;
                    })
                    .strength(currentConfig.simulation.linkStrength)
                )
                .force('charge', d3.forceManyBody()
                    .strength(currentConfig.simulation.forceManyBody)
                )
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide(currentConfig.simulation.forceCollision))
                .force('x', d3.forceX(width / 2).strength(currentConfig.simulation.forceX))
                .force('y', d3.forceY(height / 2).strength(currentConfig.simulation.forceY))
                .alpha(currentConfig.simulation.alpha)
                .alphaDecay(currentConfig.simulation.alphaDecay)
                .alphaMin(currentConfig.simulation.alphaMin)
                .on('tick', handleTick);
            
            debug('Force simulation created');
        }
        
        /**
         * Handle simulation tick
         */
        function handleTick() {
            if (!svg || !simulation) return;
            
            // Update link positions
            if (linkElements && currentConfig.renderLinks) {
                linkElements
                    .attr('x1', d => d.source.x)
                    .attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x)
                    .attr('y2', d => d.target.y);
            }
            
            // Update node positions
            if (nodeElements && currentConfig.renderNodes) {
                nodeElements
                    .attr('cx', d => d.x)
                    .attr('cy', d => d.y);
            }
            
            // Update label positions
            if (labelElements && currentConfig.label.enabled) {
                labelElements
                    .attr('x', d => d.x)
                    .attr('y', d => d.y);
            }
            
            // Update performance stats
            const now = Date.now();
            performanceStats.lastRenderTime = now - lastRenderTime;
            lastRenderTime = now;
            performanceStats.frameRate = Math.round(1000 / performanceStats.lastRenderTime);
            performanceStats.renderCount++;
        }
        
        /**
         * Update visualization by refreshing nodes and links
         * @param {boolean} resetSimulation - Whether to reset the simulation
         */
        function updateVisualization(resetSimulation = false) {
            if (!svg || !nodes || !links) {
                return;
            }
            
            debug('Updating visualization');
            
            // Trigger render start event
            triggerEvent('renderStart', { nodes, links });
            
            // Show loading indicator for large datasets
            if (nodes.length > currentConfig.performance.maxNodesByDefault) {
                showLoading();
            }
            
            // Use requestAnimationFrame to ensure rendering happens in the next frame
            requestAnimationFrame(() => {
                isRendering = true;
                
                // Create simulation if not exists or reset if requested
                if (!simulation || resetSimulation) {
                    if (simulation) {
                        simulation.stop();
                    }
                    createSimulation();
                } else {
                    // Update simulation nodes and links
                    simulation.nodes(nodes);
                    simulation.force('link').links(links);
                    
                    // Restart simulation with low alpha to avoid big jumps
                    if (resetSimulation) {
                        simulation.alpha(1).restart();
                    } else {
                        simulation.alpha(0.3).restart();
                    }
                }
                
                // Get all link elements
                linkElements = svg.select('.links')
                    .selectAll('line')
                    .data(links, d => d.id);
                
                // Remove old links
                linkElements.exit().remove();
                
                // Add new links
                const linkEnter = linkElements.enter()
                    .append('line')
                    .attr('stroke', d => getLinkStyle(d).stroke)
                    .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
                    .attr('stroke-dasharray', d => getLinkStyle(d).dasharray)
                    .style('pointer-events', 'stroke')
                    .on('click', (event, d) => handleLinkClick(event, d))
                    .on('mouseover', function(event, d) {
                        // Highlight link on hover
                        if (!selectedLink || d.id !== selectedLink.id) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', parseFloat(getLinkStyle(d).strokeWidth) * 1.5);
                        }
                        
                        // Call custom hover handler if provided
                        if (currentConfig.eventHandlers.linkHover) {
                            currentConfig.eventHandlers.linkHover(d.id, true);
                        }
                    })
                    .on('mouseout', function(event, d) {
                        // Restore link style on mouseout
                        if (!selectedLink || d.id !== selectedLink.id) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', getLinkStyle(d).strokeWidth);
                        }
                        
                        // Call custom hover handler if provided
                        if (currentConfig.eventHandlers.linkHover) {
                            currentConfig.eventHandlers.linkHover(d.id, false);
                        }
                    });
                
                // Merge links
                linkElements = linkEnter.merge(linkElements);
                
                // Get all node elements
                nodeElements = svg.select('.nodes')
                    .selectAll('circle')
                    .data(nodes, d => d.id);
                
                // Remove old nodes
                nodeElements.exit().remove();
                
                // Add new nodes
                const nodeEnter = nodeElements.enter()
                    .append('circle')
                    .attr('r', d => getNodeStyle(d).radius)
                    .attr('fill', d => getNodeStyle(d).fill)
                    .attr('stroke', d => getNodeStyle(d).stroke)
                    .attr('stroke-width', d => getNodeStyle(d).strokeWidth)
                    .style('cursor', 'pointer')
                    .call(d3.drag()
                        .on('start', handleDragStart)
                        .on('drag', handleDrag)
                        .on('end', handleDragEnd)
                    )
                    .on('click', (event, d) => {
                        // Prevent event from propagating to background
                        event.stopPropagation();
                        handleNodeClick(event, d);
                    })
                    .on('contextmenu', (event, d) => {
                        // Prevent default context menu
                        event.preventDefault();
                        
                        // Show custom context menu
                        showContextMenu(event, d);
                    })
                    .on('mouseover', function(event, d) {
                        // Show tooltip
                        if (currentConfig.tooltip.enabled) {
                            showTooltip(event, d);
                        }
                        
                        // Highlight node on hover
                        if (!selectedNode || d.id !== selectedNode.id) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', parseFloat(getNodeStyle(d).strokeWidth) * 2);
                        }
                        
                        // Call custom hover handler if provided
                        if (currentConfig.eventHandlers.nodeHover) {
                            currentConfig.eventHandlers.nodeHover(d.id, true);
                        }
                        
                        // Call custom mouse enter handler if provided
                        if (currentConfig.eventHandlers.nodeMouseEnter) {
                            currentConfig.eventHandlers.nodeMouseEnter(d.id);
                        }
                    })
                    .on('mouseout', function(event, d) {
                        // Hide tooltip
                        if (currentConfig.tooltip.enabled) {
                            hideTooltip();
                        }
                        
                        // Restore node style on mouseout
                        if (!selectedNode || d.id !== selectedNode.id) {
                            d3.select(this)
                                .transition()
                                .duration(200)
                                .attr('stroke-width', getNodeStyle(d).strokeWidth);
                        }
                        
                        // Call custom hover handler if provided
                        if (currentConfig.eventHandlers.nodeHover) {
                            currentConfig.eventHandlers.nodeHover(d.id, false);
                        }
                        
                        // Call custom mouse leave handler if provided
                        if (currentConfig.eventHandlers.nodeMouseLeave) {
                            currentConfig.eventHandlers.nodeMouseLeave(d.id);
                        }
                    });
                
                // Merge nodes
                nodeElements = nodeEnter.merge(nodeElements);
                
                // Update labels if enabled
                if (currentConfig.label.enabled) {
                    // Get all label elements
                    labelElements = svg.select('.labels')
                        .selectAll('text')
                        .data(nodes, d => d.id);
                    
                    // Remove old labels
                    labelElements.exit().remove();
                    
                    // Add new labels
                    const labelEnter = labelElements.enter()
                        .append('text')
                        .attr('text-anchor', currentConfig.label.textAnchor)
                        .attr('dy', currentConfig.label.dy)
                        .attr('font-family', currentConfig.label.fontFamily)
                        .attr('font-size', `${currentConfig.label.fontSize}px`)
                        .attr('fill', currentConfig.colors.text)
                        .style('pointer-events', 'none')
                        .text(d => {
                            if (currentConfig.label.formatter) {
                                return currentConfig.label.formatter(d);
                            }
                            
                            const labelAttr = currentConfig.labelAttribute || 'name';
                            return d[labelAttr] || d.id;
                        });
                    
                    // Merge labels
                    labelElements = labelEnter.merge(labelElements);
                }
                
                // Update node registry
                nodeRegistry.clear();
                nodes.forEach(node => nodeRegistry.set(node.id, node));
                
                // Update link registry
                linkRegistry.clear();
                links.forEach(link => linkRegistry.set(link.id, link));
                
                // Update performance stats
                performanceStats.nodeCount = nodes.length;
                performanceStats.linkCount = links.length;
                
                // Hide loading indicator
                hideLoading();
                
                // Trigger render complete event
                triggerEvent('renderComplete', { nodes, links });
                
                isRendering = false;
                
                // Process render queue
                if (renderQueue.length > 0) {
                    const nextRender = renderQueue.shift();
                    if (nextRender && typeof nextRender === 'function') {
                        nextRender();
                    }
                }
                
                debug('Visualization updated');
            });
        }
        
        /**
         * Handle drag start event
         * @param {Event} event - The DOM event
         */
        function handleDragStart(event) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            
            // Fix node position during drag
            if (currentConfig.fixNodesOnDrag) {
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }
        }
        
        /**
         * Handle drag event
         * @param {Event} event - The DOM event
         */
        function handleDrag(event) {
            // Update node position during drag
            if (currentConfig.fixNodesOnDrag) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            } else {
                event.subject.x = event.x;
                event.subject.y = event.y;
            }
        }
        
        /**
         * Handle drag end event
         * @param {Event} event - The DOM event
         */
        function handleDragEnd(event) {
            if (!event.active) simulation.alphaTarget(0);
            
            // If not fixed, release node position after drag
            if (!currentConfig.fixNodesOnDrag) {
                event.subject.fx = null;
                event.subject.fy = null;
            }
        }
        
        /**
         * Handle node click event
         * @param {Event} event - The DOM event
         * @param {Object} node - Node data
         */
        function handleNodeClick(event, node) {
            // Toggle node selection
            if (selectedNode && selectedNode.id === node.id) {
                // Deselect node
                selectedNode = null;
            } else {
                // Select node
                selectedNode = node;
                
                // Highlight connections
                highlightConnections(node, currentConfig.highlight.propagationLevels);
            }
            
            // Deselect link when selecting a node
            selectedLink = null;
            
            // Update styles to reflect selection
            updateVisualization();
            
            // Call custom click handler if provided
            if (currentConfig.eventHandlers.nodeClick) {
                currentConfig.eventHandlers.nodeClick(selectedNode ? selectedNode.id : null);
            }
            
            // Trigger event
            triggerEvent('selectionChanged', { type: 'node', node: selectedNode });
        }
        
        /**
         * Handle link click event
         * @param {Event} event - The DOM event
         * @param {Object} link - Link data
         */
        function handleLinkClick(event, link) {
            event.stopPropagation();
            
            // Toggle link selection
            if (selectedLink && selectedLink.id === link.id) {
                // Deselect link
                selectedLink = null;
            } else {
                // Select link
                selectedLink = link;
            }
            
            // Deselect node when selecting a link
            selectedNode = null;
            
            // Clear highlights
            clearHighlights();
            
            // Update styles to reflect selection
            updateVisualization();
            
            // Call custom click handler if provided
            if (currentConfig.eventHandlers.linkClick) {
                currentConfig.eventHandlers.linkClick(selectedLink ? selectedLink.id : null);
            }
            
            // Trigger event
            triggerEvent('selectionChanged', { type: 'link', link: selectedLink });
        }
        
        /**
         * Debounce a function
         * @param {Function} func - Function to debounce
         * @param {number} wait - Delay in milliseconds
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
        
        /**
         * Public API
         */
        return {
            /**
             * Initializes the visualization
             * @return {Object} This instance for chaining
             */
            init: function() {
                initialize();
                return this;
            },
            
            /**
             * Sets data for the visualization
             * @param {Array} dataNodes - Array of node objects
             * @param {Array} dataLinks - Array of link objects
             * @return {Object} This instance for chaining
             */
            setData: function(dataNodes, dataLinks) {
                setData(dataNodes, dataLinks);
                return this;
            },
            
            /**
             * Updates the configuration
             * @param {Object} config - Configuration object
             * @return {Object} This instance for chaining
             */
            updateConfig: function(config) {
                updateConfig(config);
                return this;
            },
            
            /**
             * Forces a re-render of the visualization
             * @param {boolean} resetSimulation - Whether to reset the simulation
             * @return {Object} This instance for chaining
             */
            render: function(resetSimulation = false) {
                updateVisualization(resetSimulation);
                return this;
            },
            
            /**
             * Adds a node to the visualization
             * @param {Object} node - Node object
             * @return {Object} This instance for chaining
             */
            addNode: function(node) {
                addNode(node);
                return this;
            },
            
            /**
             * Adds multiple nodes to the visualization
             * @param {Array} nodes - Array of node objects
             * @return {Object} This instance for chaining
             */
            addNodes: function(nodes) {
                addNodes(nodes);
                return this;
            },
            
            /**
             * Updates a node in the visualization
             * @param {string} nodeId - ID of the node to update
             * @param {Object} attributes - Attributes to update
             * @return {Object} This instance for chaining
             */
            updateNode: function(nodeId, attributes) {
                updateNode(nodeId, attributes);
                return this;
            },
            
            /**
             * Removes a node from the visualization
             * @param {string} nodeId - ID of the node to remove
             * @return {Object} This instance for chaining
             */
            removeNode: function(nodeId) {
                removeNode(nodeId);
                return this;
            },
            
            /**
             * Adds a link to the visualization
             * @param {Object} link - Link object
             * @return {Object} This instance for chaining
             */
            addLink: function(link) {
                addLink(link);
                return this;
            },
            
            /**
             * Adds multiple links to the visualization
             * @param {Array} links - Array of link objects
             * @return {Object} This instance for chaining
             */
            addLinks: function(links) {
                addLinks(links);
                return this;
            },
            
            /**
             * Updates a link in the visualization
             * @param {string} linkId - ID of the link to update
             * @param {Object} attributes - Attributes to update
             * @return {Object} This instance for chaining
             */
            updateLink: function(linkId, attributes) {
                updateLink(linkId, attributes);
                return this;
            },
            
            /**
             * Removes a link from the visualization
             * @param {string} linkId - ID of the link to remove
             * @return {Object} This instance for chaining
             */
            removeLink: function(linkId) {
                removeLink(linkId);
                return this;
            },
            
            /**
             * Selects a node in the visualization
             * @param {string} nodeId - ID of the node to select
             * @return {Object} This instance for chaining
             */
            selectNode: function(nodeId) {
                selectNode(nodeId);
                return this;
            },
            
            /**
             * Clears node selection
             * @return {Object} This instance for chaining
             */
            clearNodeSelection: function() {
                selectedNode = null;
                updateVisualization();
                return this;
            },
            
            /**
             * Gets the currently selected node
             * @return {Object|null} Selected node or null
             */
            getSelectedNode: function() {
                return selectedNode;
            },
            
            /**
             * Selects a link in the visualization
             * @param {string} linkId - ID of the link to select
             * @return {Object} This instance for chaining
             */
            selectLink: function(linkId) {
                selectLink(linkId);
                return this;
            },
            
            /**
             * Clears link selection
             * @return {Object} This instance for chaining
             */
            clearLinkSelection: function() {
                selectedLink = null;
                updateVisualization();
                return this;
            },
            
            /**
             * Gets the currently selected link
             * @return {Object|null} Selected link or null
             */
            getSelectedLink: function() {
                return selectedLink;
            },
            
            /**
             * Applies a filter to the visualization
             * @param {Function} filterFn - Filter function
             * @return {Object} This instance for chaining
             */
            filter: function(filterFn) {
                applyFilter(filterFn);
                return this;
            },
            
            /**
             * Clears all filters
             * @return {Object} This instance for chaining
             */
            clearFilters: function() {
                clearFilters();
                return this;
            },
            
            /**
             * Gets all nodes
             * @return {Array} Array of nodes
             */
            getNodes: function() {
                return [...nodes];
            },
            
            /**
             * Gets all links
             * @return {Array} Array of links
             */
            getLinks: function() {
                return [...links];
            },
            
            /**
             * Gets a node by ID
             * @param {string} nodeId - ID of the node
             * @return {Object|null} Node object or null
             */
            getNode: function(nodeId) {
                return nodeRegistry.get(nodeId) || null;
            },
            
            /**
             * Gets a link by ID
             * @param {string} linkId - ID of the link
             * @return {Object|null} Link object or null
             */
            getLink: function(linkId) {
                return linkRegistry.get(linkId) || null;
            },
            
            /**
             * Finds nodes matching a query
             * @param {Object} query - Query object
             * @return {Array} Array of matching nodes
             */
            findNodes: function(query) {
                return findNodes(query);
            },
            
            /**
             * Finds links matching a query
             * @param {Object} query - Query object
             * @return {Array} Array of matching links
             */
            findLinks: function(query) {
                return findLinks(query);
            },
            
            /**
             * Saves the current state
             * @return {Object} This instance for chaining
             */
            saveState: function() {
                saveState();
                return this;
            },
            
            /**
             * Undoes the last action
             * @return {boolean} True if undo was successful
             */
            undo: function() {
                return undo();
            },
            
            /**
             * Redoes the last undone action
             * @return {boolean} True if redo was successful
             */
            redo: function() {
                return redo();
            },
            
            /**
             * Gets performance statistics
             * @return {Object} Performance statistics
             */
            getPerformanceStats: function() {
                return getPerformanceStats();
            },
            
            /**
             * Export visualization as PNG
             * @param {string} filename - Filename for the exported image
             * @return {Promise<string>} Base64 data URL of the image
             */
            exportAsPNG: function(filename) {
                return exportAsPNG(filename);
            },
            
            /**
             * Export visualization data as JSON
             * @param {string} filename - Filename for the exported data
             * @return {Object} Exported data object
             */
            exportAsJSON: function(filename) {
                return exportAsJSON(filename);
            },
            
            /**
             * Import visualization data from JSON
             * @param {Object|string} data - JSON data object or string
             * @return {boolean} True if import was successful
             */
            importFromJSON: function(data) {
                return importFromJSON(data);
            },
            
/**
             * Centers the visualization on a specific node
             * @param {string} nodeId - ID of the node to center on
             * @return {Object} This instance for chaining
             */
            centerOnNode: function(nodeId) {
                const node = nodeRegistry.get(nodeId);
                if (node) {
                    centerOnNode(node);
                }
                return this;
            },
            
            /**
             * Centers the visualization view to fit all nodes
             * @param {number} padding - Padding to add around nodes
             * @return {Object} This instance for chaining
             */
            fitToScreen: function(padding = 50) {
                fitToScreen(padding);
                return this;
            },
            
            /**
             * Applies a layout algorithm to the visualization
             * @param {string} layoutName - Name of the layout algorithm
             * @param {Object} options - Layout options
             * @return {Object} This instance for chaining
             */
            applyLayout: function(layoutName, options = {}) {
                applyLayout(layoutName, options);
                return this;
            },
            
            /**
             * Stops the simulation
             * @return {Object} This instance for chaining
             */
            stopSimulation: function() {
                if (simulation) {
                    simulation.stop();
                }
                return this;
            },
            
            /**
             * Restarts the simulation
             * @return {Object} This instance for chaining
             */
            restartSimulation: function() {
                if (simulation) {
                    simulation.alpha(1).restart();
                }
                return this;
            },
            
            /**
             * Adds an event listener
             * @param {string} eventName - Name of the event
             * @param {Function} callback - Callback function
             * @return {Object} This instance for chaining
             */
            on: function(eventName, callback) {
                if (!events[eventName]) {
                    events[eventName] = [];
                }
                events[eventName].push(callback);
                return this;
            },
            
            /**
             * Removes an event listener
             * @param {string} eventName - Name of the event
             * @param {Function} callback - Callback function
             * @return {Object} This instance for chaining
             */
            off: function(eventName, callback) {
                if (events[eventName]) {
                    events[eventName] = events[eventName].filter(cb => cb !== callback);
                }
                return this;
            },
            
            /**
             * Adds a custom node type
             * @param {string} typeName - Name of the node type
             * @param {Object} typeConfig - Configuration for the node type
             * @return {Object} This instance for chaining
             */
            addNodeType: function(typeName, typeConfig) {
                if (!currentConfig.nodeTypes) {
                    currentConfig.nodeTypes = {};
                }
                currentConfig.nodeTypes[typeName] = typeConfig;
                return this;
            },
            
            /**
             * Adds a custom link type
             * @param {string} typeName - Name of the link type
             * @param {Object} typeConfig - Configuration for the link type
             * @return {Object} This instance for chaining
             */
            addLinkType: function(typeName, typeConfig) {
                if (!currentConfig.linkTypes) {
                    currentConfig.linkTypes = {};
                }
                currentConfig.linkTypes[typeName] = typeConfig;
                return this;
            },
            
            /**
             * Highlights nodes matching a query
             * @param {Object|Function} query - Query object or function
             * @return {Object} This instance for chaining
             */
            highlightNodes: function(query) {
                highlightNodes(query);
                return this;
            },
            
            /**
             * Highlights links matching a query
             * @param {Object|Function} query - Query object or function
             * @return {Object} This instance for chaining
             */
            highlightLinks: function(query) {
                highlightLinks(query);
                return this;
            },
            
            /**
             * Clears all highlights
             * @return {Object} This instance for chaining
             */
            clearHighlights: function() {
                clearHighlights();
                return this;
            },
            
            /**
             * Gets network statistics
             * @return {Object} Network statistics
             */
            getNetworkStats: function() {
                return getNetworkStats();
            },
            
            /**
             * Find connected components in the network
             * @return {Array} Array of component arrays
             */
            findConnectedComponents: function() {
                return findConnectedComponents();
            },
            
            /**
             * Find the shortest path between two nodes
             * @param {string} sourceId - ID of the source node
             * @param {string} targetId - ID of the target node
             * @return {Array|null} Array of nodes in the path or null if no path exists
             */
            findShortestPath: function(sourceId, targetId) {
                return findShortestPath(sourceId, targetId);
            },
            
            /**
             * Gets the neighborhood of a node
             * @param {string} nodeId - ID of the node
             * @param {number} depth - Depth of the neighborhood
             * @return {Object} Object containing nodes and links in the neighborhood
             */
            getNeighborhood: function(nodeId, depth = 1) {
                return getNeighborhood(nodeId, depth);
            },
            
            /**
             * Destroys the visualization and cleans up resources
             * @return {void}
             */
            destroy: function() {
                // Stop simulation
                if (simulation) {
                    simulation.stop();
                }
                
                // Remove event listeners
                container.selectAll('*').remove();
                if (containerNode) {
                    containerNode.removeEventListener('click', containerClickHandler);
                    containerNode.removeEventListener('contextmenu', contextMenuHandler);
                }
                
                // Clear data
                nodes = [];
                links = [];
                nodeRegistry.clear();
                linkRegistry.clear();
                events = {};
                
                // Clear caches
                colorScales = {};
                
                // Flag as destroyed
                isInitialized = false;
            }
        };
    };
    
    // Return the factory function
    return NetworkVisualization;
}));
