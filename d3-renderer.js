/**
 * D3Renderer - A specialized D3.js-based visualization renderer for biblical genealogies
 * Handles the actual SVG rendering and D3 force simulation
 */
const D3Renderer = (function() {
    // Private module state
    let svg = null;
    let simulation = null;
    let nodeElements = null;
    let linkElements = null;
    let labelElements = null;
    let dragHandler = null;
    let zoomHandler = null;
    let currentConfig = null;
    let width = 1200;
    let height = 800;
    let transform = { x: 0, y: 0, k: 1 };
    let tooltipDiv = null;
    let dataCache = { nodes: [], links: [] };
    
    // Add a container for rendered elements
    let renderedElements = {
        nodes: new Set(),
        links: new Set(),
        labels: new Set()
    };
    
    // Performance tracking variables
    let renderStartTime = 0;
    let simulationStartTime = 0;
    let frameCount = 0;
    let lastFrameTime = 0;
    
    // Add visibility tracking
    let visibleNodeIds = new Set();
    let visibleLinkIds = new Set();
    
    // Define force simulation constants
    const FORCE_CONSTANTS = {
        CHARGE_STRENGTH: -120,
        CHARGE_DISTANCE: 300,
        CENTER_STRENGTH: 0.05,
        COLLISION_STRENGTH: 0.7,
        LINK_STRENGTH: 0.3,
        LINK_DISTANCE: 80,
        RADIAL_SORT_STRENGTH: 0.2,
        MANY_BODY_THETA: 0.8
    };
    
    // List of supported layout types
    const LAYOUT_TYPES = {
        FORCE: 'force',
        RADIAL: 'radial',
        HIERARCHICAL: 'hierarchical', 
        TIMELINE: 'timeline',
        GRID: 'grid'
    };
    
    // Import relationship types from GenealogyDataUtils if available
    const RELATIONSHIP_TYPES = (window.GenealogyDataUtils && window.GenealogyDataUtils.RELATIONSHIP_TYPES) || {
        PARENT: 'parent',
        CHILD: 'child',
        SPOUSE: 'spouse',
        SIBLING: 'sibling',
        ANCESTOR: 'ancestor',
        DESCENDANT: 'descendant',
        EXTENDED_FAMILY: 'extended-family',
        MENTOR: 'mentor',
        DISCIPLE: 'disciple',
        ALLY: 'ally',
        RIVAL: 'rival'
    };

    /**
     * Initialize the D3 visualization with genealogy data
     * @param {Element} container - DOM element to contain the visualization
     * @param {Object} data - The genealogy data with nodes and links
     * @param {Object} config - Configuration options
     * @returns {Object} - API for controlling the visualization
     */
    function createGenealogy(container, data, config = {}) {
        if (!container) {
            throw new Error('Container element is required');
        }
        
        // Start performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.startTimer('d3-renderer-init');
        }
        
        // Initialize configuration with defaults
        currentConfig = initializeConfig(config);
        
        // Set dimensions based on container
        updateDimensions(container);
        
        // Create SVG
        svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('class', 'genealogy-visualization')
            .attr('aria-label', 'Biblical genealogy visualization')
            .attr('role', 'img');
        
        // Add descriptive title for accessibility
        svg.append('title')
            .text('Biblical Genealogy Visualization');
        
        // Create zoom behavior
        zoomHandler = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', handleZoom);
        
        // Apply zoom behavior to SVG
        svg.call(zoomHandler);
        
        // Add double-click to reset zoom
        svg.on('dblclick.zoom', resetZoom);
        
        // Create tooltip
        tooltipDiv = d3.select(container)
            .append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
        
        // Create container groups for visualization elements
        const g = svg.append('g')
            .attr('class', 'zoom-layer');
        
        g.append('g').attr('class', 'links');
        g.append('g').attr('class', 'nodes');
        g.append('g').attr('class', 'labels');
        
        // Initialize empty visualization if no data provided
        if (!data) {
            data = { nodes: [], links: [] };
        }
        
        // Initialize with data
        updateData(data);
        
        // End performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.endTimer('d3-renderer-init');
        }
        
        // Return interface for external control
        return {
            svg: svg,
            updateData: updateData,
            updateConfig: updateConfig,
            getNodeById: getNodeById,
            getLinkById: getLinkById,
            centerOnNode: centerOnNode,
            highlightNode: highlightNode,
            exportSVG: exportSVG,
            exportPNG: exportPNG,
            getSimulation: () => simulation,
            destroy: destroy
        };
    }
    
    /**
     * Initialize configuration with defaults and user options
     * @param {Object} config - User-provided configuration
     * @return {Object} Complete configuration with defaults
     */
    function initializeConfig(config = {}) {
        // Default configuration
        const defaultConfig = {
            // Layout configuration
            layout: {
                type: LAYOUT_TYPES.FORCE,
                levelSpacing: 100,
                nodeSpacing: 30,
                sortMethod: 'chronological'
            },
            // Visual styling
            style: {
                nodeRadius: 10,
                nodeStroke: '#fff',
                nodeStrokeWidth: 1.5,
                linkStroke: '#999',
                linkStrokeWidth: 1,
                linkOpacity: 0.6,
                labelSize: 10,
                labelColor: '#333',
                maleColor: '#6baed6',
                femaleColor: '#fc9272',
                unknownGenderColor: '#969696',
                highlightColor: '#ffd700',
                ancestorColor: '#4292c6',
                descendantColor: '#41ab5d'
            },
            // Interaction settings
            interaction: {
                draggable: true,
                zoomable: true,
                tooltips: true,
                highlightConnected: true,
                highlightHover: true,
                clickToCenter: true
            },
            // Simulation parameters
            simulation: {
                alpha: 0.3,
                alphaDecay: 0.05,
                velocityDecay: 0.4,
                linkStrength: FORCE_CONSTANTS.LINK_STRENGTH,
                linkDistance: FORCE_CONSTANTS.LINK_DISTANCE,
                chargeStrength: FORCE_CONSTANTS.CHARGE_STRENGTH,
                centerStrength: FORCE_CONSTANTS.CENTER_STRENGTH
            },
            // Animation settings
            animation: {
                enabled: true,
                duration: 750,
                easing: d3.easeCubicOut
            },
            // Performance options
            performance: {
                renderThreshold: 2000, // Number of nodes before simplified rendering
                simulationThreshold: 1000, // Number of nodes before simplified simulation
                enableWorkers: false, // Use web workers for simulation (when supported)
                cacheLayouts: true, // Cache layout results
                visibilityOptimization: true // Only render visible elements
            },
            // Custom link styling by type
            linkTypes: {
                [RELATIONSHIP_TYPES.SPOUSE]: {
                    stroke: '#6baed6',
                    strokeWidth: 2,
                    dasharray: null
                },
                [RELATIONSHIP_TYPES.PARENT]: {
                    stroke: '#4292c6',
                    strokeWidth: 1.5,
                    dasharray: null
                },
                [RELATIONSHIP_TYPES.CHILD]: {
                    stroke: '#2171b5',
                    strokeWidth: 1.5,
                    dasharray: null
                },
                [RELATIONSHIP_TYPES.SIBLING]: {
                    stroke: '#6baed6',
                    strokeWidth: 1,
                    dasharray: '5,5'
                },
                'default': {
                    stroke: '#999',
                    strokeWidth: 1,
                    dasharray: null
                }
            },
            // Custom node styling by type
            nodeTypes: {
                'male': {
                    fill: '#6baed6',
                    radius: 10,
                    stroke: '#fff',
                    strokeWidth: 1.5
                },
                'female': {
                    fill: '#fc9272',
                    radius: 10,
                    stroke: '#fff',
                    strokeWidth: 1.5
                },
                'important': {
                    fill: '#fed976',
                    radius: 15,
                    stroke: '#fff',
                    strokeWidth: 2
                },
                'default': {
                    fill: '#969696',
                    radius: 10,
                    stroke: '#fff',
                    strokeWidth: 1.5
                }
            },
            // Transition durations
            transitionDuration: 750
        };
        
        // Deep merge with user configuration
        return deepMerge(defaultConfig, config);
    }
    
    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object to merge
     * @return {Object} Merged object
     */
    function deepMerge(target, source) {
        if (!source) return target;
        
        const output = Object.assign({}, target);
        
        if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach(key => {
                if (isObject(source[key])) {
                    if (!(key in target)) {
                        Object.assign(output, { [key]: source[key] });
                    } else {
                        output[key] = deepMerge(target[key], source[key]);
                    }
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        
        return output;
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
     * Update dimensions based on container size
     * @param {Element} container - Container element
     */
    function updateDimensions(container) {
        if (!container) return;
        
        const rect = container.getBoundingClientRect();
        width = rect.width || 1200;
        height = rect.height || 800;
        
        if (svg) {
            svg.attr('width', width)
               .attr('height', height);
               
            // Reset transform to avoid unexpected behavior
            resetZoom();
        }
        
        // Update simulation center if it exists
        if (simulation) {
            simulation.force('center', d3.forceCenter(width / 2, height / 2));
            simulation.alpha(0.3).restart();
        }
    }
    
    /**
     * Reset zoom to default state
     */
    function resetZoom() {
        if (!svg) return;
        
        svg.transition()
           .duration(750)
           .call(zoomHandler.transform, d3.zoomIdentity);
    }
    
    /**
     * Handle zoom events
     * @param {Object} event - D3 zoom event
     */
    function handleZoom(event) {
        if (!event || !event.transform) return;
        
        transform = event.transform;
        
        svg.select('.zoom-layer')
           .attr('transform', transform);
    }
    
    /**
     * Update visualization with new data
     * @param {Object} data - Data with nodes and links
     */
    function updateData(data) {
        if (!data) return;
        
        // Start performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.startTimer('d3-renderer-update');
        }
        
        // Preprocess data
        const processedData = preprocessData(data);
        
        // Cache the data
        dataCache = processedData;
        
        // Initialize or update the simulation
        initializeSimulation(processedData);
        
        // Render visualization
        renderVisualization(processedData);
        
        // End performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.endTimer('d3-renderer-update');
        }
    }
    
    /**
     * Preprocess data to ensure consistent structure
     * @param {Object} data - Raw data object with nodes and links
     * @return {Object} Processed data with consistent structure
     */
    function preprocessData(data) {
        // Start performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.startTimer('preprocess-data');
        }
        
        // Clone data to avoid modifying the original
        const clonedData = JSON.parse(JSON.stringify(data));
        
        // If data is empty, return empty structure
        if (!clonedData || (!clonedData.nodes && !clonedData.links)) {
            console.warn('Empty or invalid data provided to preprocessData');
            return { nodes: [], links: [] };
        }
        
        // Ensure nodes exist
        const nodes = (clonedData.nodes || []).map(node => ({
            // Ensure all required properties exist
            id: node.id || `node-${Math.random().toString(36).substr(2, 9)}`,
            name: node.name || 'Unknown',
            type: node.type || 'regular',
            gender: node.gender || 'unknown',
            generation: typeof node.generation === 'number' ? node.generation : 0,
            importance: node.importance || 1,
            x: node.x || (width/2 + (Math.random() - 0.5) * width * 0.8),
            y: node.y || (height/2 + (Math.random() - 0.5) * height * 0.8),
            // Preserve all original properties
            ...node
        }));
        
        // Create a map of nodes by ID for faster lookup
        const nodeMap = new Map(nodes.map(node => [node.id, node]));
        
        // Ensure links exist and reference valid nodes
        const links = (clonedData.links || []).map((link, index) => ({
            // Ensure all required properties exist
            id: link.id || `link-${index}`,
            source: link.source,
            target: link.target,
            type: link.type || 'default',
            // Preserve all original properties
            ...link
        })).filter(link => {
            // Filter out links with invalid source or target
            const sourceExists = nodeMap.has(link.source);
            const targetExists = nodeMap.has(link.target);
            
            if (!sourceExists) {
                console.warn(`Link references non-existent source node: ${link.source}`);
            }
            
            if (!targetExists) {
                console.warn(`Link references non-existent target node: ${link.target}`);
            }
            
            return sourceExists && targetExists;
        });
        
        // End performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.endTimer('preprocess-data');
        }
        
        return { nodes, links };
    }
    
    /**
     * Initialize or update D3 force simulation
     * @param {Object} data - Data with nodes and links
     */
    function initializeSimulation(data) {
        // Start performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.startTimer('initialize-simulation');
        }
        
        const simConfig = currentConfig.simulation;
        
        // Create new simulation if it doesn't exist
        if (!simulation) {
            simulation = d3.forceSimulation()
                .force('charge', d3.forceManyBody()
                    .strength(d => d.importance * simConfig.chargeStrength)
                    .theta(FORCE_CONSTANTS.MANY_BODY_THETA)
                    .distanceMax(FORCE_CONSTANTS.CHARGE_DISTANCE))
                .force('center', d3.forceCenter(width / 2, height / 2)
                    .strength(simConfig.centerStrength))
                .force('collision', d3.forceCollide()
                    .radius(d => getNodeRadius(d) * 1.2)
                    .strength(FORCE_CONSTANTS.COLLISION_STRENGTH))
                .on('tick', handleSimulationTick)
                .alpha(simConfig.alpha)
                .alphaDecay(simConfig.alphaDecay)
                .velocityDecay(simConfig.velocityDecay);
            
            // Define drag behavior
            dragHandler = d3.drag()
                .on('start', dragStarted)
                .on('drag', dragging)
                .on('end', dragEnded);
        }
        
        // Apply appropriate layout based on configuration
        applyLayout(data);
        
        // Update simulation with new data
        simulation.nodes(data.nodes);
        
        // Add or update link force if links exist
        if (data.links && data.links.length > 0) {
            // Use forceLink with id accessor for string-based references
            simulation.force('link', d3.forceLink(data.links)
                .id(d => d.id)
                .distance(simConfig.linkDistance)
                .strength(simConfig.linkStrength));
        } else {
            // Remove link force if no links
            simulation.force('link', null);
        }
        
        // Add radial force if using radial layout
        if (currentConfig.layout.type === LAYOUT_TYPES.RADIAL) {
            // Add radial force to create concentric circles by generation
            simulation.force('radial', d3.forceRadial(
                d => 100 + d.generation * currentConfig.layout.levelSpacing,
                width / 2,
                height / 2
            ).strength(FORCE_CONSTANTS.RADIAL_SORT_STRENGTH));
        } else {
            // Remove radial force if not using radial layout
            simulation.force('radial', null);
        }
        
        // Reheat and restart the simulation
        simulation.alpha(simConfig.alpha).restart();
        
        // Track simulation start time for performance monitoring
        simulationStartTime = performance.now();
        
        // End performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.endTimer('initialize-simulation');
        }
    }
    
    /**
     * Get node radius based on node data and configuration
     * @param {Object} node - Node data
     * @return {number} Node radius
     */
    function getNodeRadius(node) {
        if (!node) return currentConfig.style.nodeRadius;
        
        // Check if node type has custom radius
        if (node.type && currentConfig.nodeTypes[node.type]) {
            return currentConfig.nodeTypes[node.type].radius;
        }
        
        // Check if gender has custom radius
        if (node.gender && currentConfig.nodeTypes[node.gender]) {
            return currentConfig.nodeTypes[node.gender].radius;
        }
        
        // Scale radius by importance if specified
        if (node.importance && typeof node.importance === 'number') {
            return currentConfig.style.nodeRadius * Math.sqrt(node.importance);
        }
        
        return currentConfig.style.nodeRadius;
    }
    /**
     * Apply appropriate layout algorithm based on configuration
     * @param {Object} data - Data with nodes and links
     */
    function applyLayout(data) {
        const layoutType = currentConfig.layout.type;
        
        // Start performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.startTimer(`apply-${layoutType}-layout`);
        }
        
        switch (layoutType) {
            case LAYOUT_TYPES.HIERARCHICAL:
                applyHierarchicalLayout(data);
                break;
            case LAYOUT_TYPES.TIMELINE:
                applyTimelineLayout(data);
                break;
            case LAYOUT_TYPES.GRID:
                applyGridLayout(data);
                break;
            case LAYOUT_TYPES.RADIAL:
                // Initial positions for radial layout (will be refined by force simulation)
                applyRadialLayout(data);
                break;
            case LAYOUT_TYPES.FORCE:
            default:
                // For force-directed layout, just ensure nodes have initial positions
                ensureInitialPositions(data.nodes);
                break;
        }
        
        // End performance tracking
        if (window.DebugUtils) {
            window.DebugUtils.endTimer(`apply-${layoutType}-layout`);
        }
    }
    
    /**
     * Apply hierarchical layout (parent-child relationships)
     * @param {Object} data - Data with nodes and links
     */
    function applyHierarchicalLayout(data) {
        const { nodes, links } = data;
        const spacing = currentConfig.layout.levelSpacing || 100;
        const nodeWidth = currentConfig.layout.nodeWidth || 50;
        
        // Create a stratify operator to build a hierarchy
        const stratify = d3.stratify()
            .id(d => d.id)
            .parentId(d => {
                // Find parent links
                const parentLinks = links.filter(link => 
                    link.target === d.id && 
                    link.relationship === RELATIONSHIP_TYPES.PARENT);
                
                return parentLinks.length > 0 ? parentLinks[0].source : null;
            });
        
        try {
            // Try to create hierarchy (may fail if there are cycles)
            const root = stratify(nodes);
            
            // Use tree layout
            const treeLayout = d3.tree()
                .size([width - 100, height - 100])
                .nodeSize([nodeWidth, spacing]);
            
            // Apply layout
            treeLayout(root);
            
            // Copy positions back to original nodes
            root.each(node => {
                const originalNode = nodes.find(n => n.id === node.id);
                if (originalNode) {
                    originalNode.x = node.x + width / 2;
                    originalNode.y = node.y + 50;
                    // Fix positions for simulation
                    originalNode.fx = originalNode.x;
                    originalNode.fy = originalNode.y;
                }
            });
        } catch (error) {
            console.warn('Hierarchical layout failed, falling back to force layout', error);
            // Fall back to force layout
            ensureInitialPositions(nodes);
        }
    }
    
    /**
     * Apply timeline layout based on generation or date
     * @param {Object} data - Data with nodes and links
     */
    function applyTimelineLayout(data) {
        const { nodes } = data;
        const timelineField = currentConfig.layout.timelineField || 'generation';
        const spacing = currentConfig.layout.levelSpacing || 100;
        
        // Group nodes by timeline field
        const groupedNodes = d3.group(nodes, d => d[timelineField] || 0);
        
        // Set vertical position based on timeline value
        groupedNodes.forEach((nodesInLevel, level) => {
            const y = 100 + Number(level) * spacing;
            
            // Distribute nodes horizontally
            const step = width / (nodesInLevel.length + 1);
            
            nodesInLevel.forEach((node, i) => {
                node.x = (i + 1) * step;
                node.y = y;
                
                // Semi-fix positions (allow some movement for better aesthetics)
                node.fx = node.x;
                node.fy = y;
            });
        });
    }
    
    /**
     * Apply grid layout
     * @param {Object} data - Data with nodes and links
     */
    function applyGridLayout(data) {
        const { nodes } = data;
        const cols = Math.ceil(Math.sqrt(nodes.length));
        const cellWidth = width / (cols + 1);
        const cellHeight = height / (Math.ceil(nodes.length / cols) + 1);
        
        nodes.forEach((node, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            
            node.x = (col + 1) * cellWidth;
            node.y = (row + 1) * cellHeight;
            
            // Allow some movement within cell
            node.fx = null;
            node.fy = null;
        });
    }
    
    /**
     * Apply radial layout
     * @param {Object} data - Data with nodes and links
     */
    function applyRadialLayout(data) {
        const { nodes } = data;
        const centerX = width / 2;
        const centerY = height / 2;
        const radiusIncrement = currentConfig.layout.levelSpacing || 100;
        
        // Group nodes by generation
        const groupedNodes = d3.group(nodes, d => d.generation || 0);
        const maxGeneration = Math.max(...Array.from(groupedNodes.keys()));
        
        // Position nodes in concentric circles based on generation
        groupedNodes.forEach((nodesInGeneration, generation) => {
            const radius = (Number(generation) + 1) * radiusIncrement;
            const angleStep = (2 * Math.PI) / nodesInGeneration.length;
            
            nodesInGeneration.forEach((node, i) => {
                const angle = i * angleStep;
                
                // Position around circle
                node.x = centerX + radius * Math.cos(angle);
                node.y = centerY + radius * Math.sin(angle);
                
                // Don't fix positions - let force simulation adjust
            });
        });
    }
    
    /**
     * Ensure all nodes have initial positions
     * @param {Array} nodes - Nodes array
     */
    function ensureInitialPositions(nodes) {
        nodes.forEach(node => {
            if (typeof node.x !== 'number' || isNaN(node.x)) {
                node.x = width / 2 + (Math.random() - 0.5) * width / 2;
            }
            if (typeof node.y !== 'number' || isNaN(node.y)) {
                node.y = height / 2 + (Math.random() - 0.5) * height / 2;
            }
            
            // Clear any fixed positions
            node.fx = null;
            node.fy = null;
        });
    }
    
    /**
     * Render visualization elements with improved performance
     * @param {Object} data - Data with nodes and links
     */
    function renderVisualization(data) {
        if (!svg) return;
        
        // Start performance tracking
        renderStartTime = performance.now();
        if (window.DebugUtils) {
            window.DebugUtils.startTimer('render-visualization');
        }
        
        // Cache current data
        dataCache = {
            nodes: [...data.nodes], 
            links: [...data.links]
        };
        
        // Create node ID lookup for rendering optimization
        const nodeIdMap = new Map(data.nodes.map(node => [node.id, node]));
        
        // Track which elements we're going to render
        visibleNodeIds = new Set(data.nodes.map(n => n.id));
        visibleLinkIds = new Set(data.links.map(l => `${l.source.id || l.source}-${l.target.id || l.target}`));
        
        // Render links first (below nodes)
        renderLinks(data.links, nodeIdMap);
        
        // Render nodes
        renderNodes(data.nodes);
        
        // Render labels
        renderLabels(data.nodes);
        
        // Apply zoom if needed
        if (transform && transform.k !== 1) {
            updateTransform(transform);
        }
        
        // End performance tracking
        const renderTime = performance.now() - renderStartTime;
        if (window.DebugUtils) {
            window.DebugUtils.endTimer('render-visualization');
            window.DebugUtils.info(`Rendered ${data.nodes.length} nodes and ${data.links.length} links in ${renderTime.toFixed(2)}ms`);
        }
    }
    /**
     * Render links with improved performance
     * @param {Array} links - Links array
     * @param {Map} nodeIdMap - Map of node IDs to node objects
     */
    function renderLinks(links, nodeIdMap) {
        const g = svg.select('.zoom-layer');
        
        // Render links
        linkElements = g.select('.links')
            .selectAll('line')
            .data(links, d => d.id || `${d.source}-${d.target}`);
        
        // Remove exiting links with animation
        linkElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('stroke-opacity', 0)
            .remove();
        
        // Add new links
        const linkEnter = linkElements.enter()
            .append('line')
            .attr('stroke', d => getLinkStyle(d).stroke)
            .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
            .attr('stroke-dasharray', d => getLinkStyle(d).dasharray || null)
            .attr('stroke-opacity', 0)
            .attr('data-id', d => d.id || `${d.source}-${d.target}`)
            .attr('data-type', d => d.type || 'default')
            .attr('class', d => `link link-${d.type || 'default'}`)
            .on('mouseover', handleLinkMouseover)
            .on('mouseout', handleLinkMouseout)
            .on('click', handleLinkClick);
        
        // Merge new and existing links
        linkElements = linkEnter.merge(linkElements);
        
        // Animate existing links
        linkElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('stroke-opacity', d => getLinkStyle(d).opacity || 1)
            .attr('stroke', d => getLinkStyle(d).stroke)
            .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
            .attr('stroke-dasharray', d => getLinkStyle(d).dasharray || null);
    }
    
    /**
     * Render nodes with improved performance
     * @param {Array} nodes - Nodes array
     */
    function renderNodes(nodes) {
        const g = svg.select('.zoom-layer');
        
        // Render nodes
        nodeElements = g.select('.nodes')
            .selectAll('circle')
            .data(nodes, d => d.id);
        
        // Remove exiting nodes with animation
        nodeElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('r', 0)
            .remove();
        
        // Add new nodes
        const nodeEnter = nodeElements.enter()
            .append('circle')
            .attr('r', 0)
            .attr('fill', d => getNodeStyle(d).color)
            .attr('data-id', d => d.id)
            .attr('data-type', d => d.type || 'default')
            .attr('class', d => `node node-${d.type || 'default'}`)
            .attr('aria-label', d => createAccessibleLabel(d))
            .on('mouseover', handleNodeMouseover)
            .on('mouseout', handleNodeMouseout)
            .on('click', handleNodeClick)
            .call(dragHandler);
        
        // Merge new and existing nodes
        nodeElements = nodeEnter.merge(nodeElements);
        
        // Animate existing nodes
        nodeElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('r', d => getNodeRadius(d))
            .attr('fill', d => getNodeStyle(d).color)
            .attr('stroke', d => getNodeStyle(d).stroke || 'none')
            .attr('stroke-width', d => getNodeStyle(d).strokeWidth || 0);
    }
    
    /**
     * Render labels with improved performance
     * @param {Array} nodes - Nodes array
     */
    function renderLabels(nodes) {
        const g = svg.select('.zoom-layer');
        
        // Render labels
        labelElements = g.select('.labels')
            .selectAll('text')
            .data(nodes, d => d.id);
        
        // Remove exiting labels with animation
        labelElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('opacity', 0)
            .remove();
        
        // Add new labels
        const labelEnter = labelElements.enter()
            .append('text')
            .attr('font-family', currentConfig.fontFamily)
            .attr('font-size', currentConfig.fontSize)
            .attr('fill', currentConfig.colors.text)
            .attr('text-anchor', 'middle')
            .attr('dy', d => getNodeRadius(d) + 15)
            .attr('opacity', 0)
            .attr('class', 'node-label')
            .text(d => d.name || d.id);
        
        // Merge new and existing labels
        labelElements = labelEnter.merge(labelElements);
        
        // Animate existing labels
        labelElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('opacity', d => currentConfig.labels.show ? 1 : 0)
            .attr('dy', d => getNodeRadius(d) + 15)
            .text(d => getLabelText(d));
    }
    
    /**
     * Create accessible label for node
     * @param {Object} node - Node data
     * @return {string} Accessible label
     */
    function createAccessibleLabel(node) {
        if (!node) return '';
        
        let label = node.name || node.id || '';
        
        if (node.type) {
            label += `, ${node.type}`;
        }
        
        if (node.description) {
            label += `. ${node.description}`;
        }
        
        return label;
    }
    
    /**
     * Get appropriate label text for node
     * @param {Object} node - Node data
     * @return {string} Label text
     */
    function getLabelText(node) {
        if (!node) return '';
        
        // Check label display configuration
        switch (currentConfig.labels.content) {
            case 'id':
                return node.id;
            case 'name':
                return node.name || node.id;
            case 'both':
                return node.name ? `${node.name} (${node.id})` : node.id;
            case 'custom':
                if (typeof currentConfig.labels.customFunction === 'function') {
                    return currentConfig.labels.customFunction(node);
                }
                return node.name || node.id;
            default:
                return node.name || node.id;
        }
    }
    
    /**
     * Force simulation tick callback
     */
    function simulationTick() {
        if (!nodeElements || !linkElements || !labelElements) return;
        
        // Track frame rate
        const now = performance.now();
        frameCount++;
        
        if (now - lastFrameTime > 1000) { // Update once per second
            const fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
            lastFrameTime = now;
            frameCount = 0;
            
            if (window.DebugUtils) {
                window.DebugUtils.info(`Simulation running at ${fps} FPS`);
            }
        }
        // Update link positions
        linkElements
            .attr('x1', d => getSourceX(d))
            .attr('y1', d => getSourceY(d))
            .attr('x2', d => getTargetX(d))
            .attr('y2', d => getTargetY(d));
        
        // Update node positions
        nodeElements
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
        
        // Update label positions
        labelElements
            .attr('x', d => d.x)
            .attr('y', d => d.y);
            
        // Cache positions for non-force layouts
        if (currentConfig.layout.type !== LAYOUT_TYPES.FORCE) {
            nodeElements.each(d => {
                if (!layoutCache[d.id]) {
                    layoutCache[d.id] = {};
                }
                layoutCache[d.id][currentConfig.layout.type] = { x: d.x, y: d.y };
            });
        }
    }
    
    /**
     * Get source node x coordinate from link
     * @param {Object} link - Link data
     * @return {number} X coordinate
     */
    function getSourceX(link) {
        if (typeof link.source === 'object') {
            return link.source.x;
        }
        
        // Find node by ID
        const sourceNode = dataCache.nodes.find(n => n.id === link.source);
        return sourceNode ? sourceNode.x : 0;
    }
    
    /**
     * Get source node y coordinate from link
     * @param {Object} link - Link data
     * @return {number} Y coordinate
     */
    function getSourceY(link) {
        if (typeof link.source === 'object') {
            return link.source.y;
        }
        
        // Find node by ID
        const sourceNode = dataCache.nodes.find(n => n.id === link.source);
        return sourceNode ? sourceNode.y : 0;
    }
    
    /**
     * Get target node x coordinate from link
     * @param {Object} link - Link data
     * @return {number} X coordinate
     */
    function getTargetX(link) {
        if (typeof link.target === 'object') {
            return link.target.x;
        }
        
        // Find node by ID
        const targetNode = dataCache.nodes.find(n => n.id === link.target);
        return targetNode ? targetNode.x : 0;
    }
    
    /**
     * Get target node y coordinate from link
     * @param {Object} link - Link data
     * @return {number} Y coordinate
     */
    function getTargetY(link) {
        if (typeof link.target === 'object') {
            return link.target.y;
        }
        
        // Find node by ID
        const targetNode = dataCache.nodes.find(n => n.id === link.target);
        return targetNode ? targetNode.y : 0;
    }
    
    /**
     * Handle mouseover event on node
     * @param {Event} event - Mouse event
     * @param {Object} node - Node data
     */
    function handleNodeMouseover(event, node) {
        // Highlight node
        d3.select(this)
            .transition()
            .duration(200)
            .attr('r', d => getNodeRadius(d) * 1.2)
            .attr('stroke', currentConfig.colors.highlight)
            .attr('stroke-width', 2);
        
        // Show tooltip if enabled
        if (currentConfig.tooltips.enabled) {
            showNodeTooltip(event, node);
        }
        
        // Highlight connected nodes and links if enabled
        if (currentConfig.highlights.showConnections) {
            highlightConnections(node);
        }
        
        // Emit event
        if (currentConfig.events.onNodeHover) {
            currentConfig.events.onNodeHover(node, event);
        }
    }
    
    /**
     * Handle mouseout event on node
     * @param {Event} event - Mouse event
     * @param {Object} node - Node data
     */
    function handleNodeMouseout(event, node) {
        // Reset node appearance
        d3.select(this)
            .transition()
            .duration(200)
            .attr('r', d => getNodeRadius(d))
            .attr('stroke', d => getNodeStyle(d).stroke || 'none')
            .attr('stroke-width', d => getNodeStyle(d).strokeWidth || 0);
        
        // Hide tooltip
        if (currentConfig.tooltips.enabled) {
            hideTooltip();
        }
        
        // Reset highlighting
        if (currentConfig.highlights.showConnections) {
            resetHighlights();
        }
        
        // Emit event
        if (currentConfig.events.onNodeLeave) {
            currentConfig.events.onNodeLeave(node, event);
        }
    }
    
    /**
     * Handle click event on node
     * @param {Event} event - Mouse event
     * @param {Object} node - Node data
     */
    function handleNodeClick(event, node) {
        // Toggle selection
        const isSelected = currentConfig.selectedNodes.has(node.id);
        
        if (isSelected) {
            currentConfig.selectedNodes.delete(node.id);
        } else {
            // If not multi-select mode, clear previous selections
            if (!currentConfig.selections.multiSelect) {
                currentConfig.selectedNodes.clear();
            }
            currentConfig.selectedNodes.add(node.id);
        }
        
        // Update visual appearance of all nodes
        updateNodeSelections();
        
        // Emit event
        if (currentConfig.events.onNodeClick) {
            currentConfig.events.onNodeClick(node, isSelected, event);
        }
        
        // Stop propagation to prevent zoom behavior
        event.stopPropagation();
    }
/**
 * Show tooltip for node
 * @param {Event} event - Mouse event
 * @param {Object} node - Node data
 */
function showNodeTooltip(event, node) {
    // Create tooltip if it doesn't exist
    if (!tooltipDiv) {
        tooltipDiv = d3.select('body')
            .append('div')
            .attr('class', 'genealogy-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', currentConfig.tooltips.background)
            .style('border', `1px solid ${currentConfig.tooltips.border}`)
            .style('border-radius', '5px')
            .style('padding', '10px')
            .style('box-shadow', '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)')
            .style('z-index', 1000);
    }
    
    // Fade in tooltip
    tooltipDiv.transition()
        .duration(200)
        .style('opacity', 0.9);
    
    // Build tooltip content
    let tooltipContent = '';
    
    // Title
    tooltipContent += `<div style="font-weight: bold; margin-bottom: 5px; color: ${currentConfig.tooltips.titleColor}">
        ${node.name || node.id}
    </div>`;
    
    // Add all properties except internal ones
    const excludedProps = ['x', 'y', 'vx', 'vy', 'index', 'fx', 'fy'];
    Object.entries(node).forEach(([key, value]) => {
        if (!excludedProps.includes(key) && key !== 'name' && key !== 'id') {
            // Format dates if recognized
            if (value && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                try {
                    const date = new Date(value);
                    if (!isNaN(date.getTime())) {
                        value = date.toLocaleDateString();
                    }
                } catch (e) {
                    // Use original value if date parsing fails
                }
            }
            
            tooltipContent += `<div style="margin-top: 3px;">
                <span style="color: ${currentConfig.tooltips.keyColor}">${formatLabel(key)}:</span> 
                <span style="color: ${currentConfig.tooltips.valueColor}">${value}</span>
            </div>`;
        }
    });
    
    // Custom tooltip content if provided
    if (currentConfig.tooltips.customContent) {
        tooltipContent = currentConfig.tooltips.customContent(node, tooltipContent);
    }
    
    // Set tooltip content and position
    tooltipDiv.html(tooltipContent)
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 28}px`);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    if (tooltipDiv) {
        tooltipDiv.transition()
            .duration(500)
            .style('opacity', 0);
    }
}

/**
 * Highlight nodes and links connected to the selected node
 * @param {Object} centralNode - Node to highlight connections for
 */
function highlightConnections(centralNode) {
    // Reset existing highlights
    resetHighlights();
    
    // Find all links connected to this node
    const connectedLinks = dataCache.links.filter(link => 
        (link.source === centralNode || link.source.id === centralNode.id) || 
        (link.target === centralNode || link.target.id === centralNode.id)
    );
    
    // Find all nodes connected to this node via links
    const connectedNodes = new Set();
    connectedNodes.add(centralNode.id);
    
    connectedLinks.forEach(link => {
        // Handle both string IDs and object references
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        connectedNodes.add(sourceId);
        connectedNodes.add(targetId);
    });
    
    // Apply highlighting to connected nodes
    nodeElements.each(function(d) {
        const nodeElement = d3.select(this);
        if (connectedNodes.has(d.id)) {
            nodeElement.classed('connected', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.nodeStroke)
                .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth);
        } else {
            nodeElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
    
    // Apply highlighting to connected links
    linkElements.each(function(d) {
        const linkElement = d3.select(this);
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        if (connectedNodes.has(sourceId) && connectedNodes.has(targetId)) {
            linkElement.classed('connected', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.linkStroke)
                .attr('stroke-width', currentConfig.highlights.linkStrokeWidth)
                .style('opacity', 1);
        } else {
            linkElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity / 2);
        }
    });
    
    // Apply highlighting to labels
    labelElements.each(function(d) {
        const labelElement = d3.select(this);
        if (connectedNodes.has(d.id)) {
            labelElement.classed('connected', true)
                .transition()
                .duration(300)
                .style('opacity', 1)
                .attr('font-weight', 'bold');
        } else {
            labelElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
}

/**
 * Reset all highlighted elements
 */
function resetHighlights() {
    // Reset nodes
    nodeElements.classed('connected', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke', d => getNodeStyle(d).stroke || 'none')
        .attr('stroke-width', d => getNodeStyle(d).strokeWidth || 0);
    
    // Reset links
    linkElements.classed('connected', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke', d => getLinkStyle(d).stroke)
        .attr('stroke-width', d => getLinkStyle(d).strokeWidth);
    
    // Reset labels
    labelElements.classed('connected', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('font-weight', 'normal');
}

/**
 * Format property key into readable label
 * @param {string} key - Property key
 * @return {string} Formatted label
 */
function formatLabel(key) {
    // Convert camelCase or snake_case to Title Case With Spaces
    return key
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
}

/**
 * Update visual appearance of selected nodes
 */
function updateNodeSelections() {
    nodeElements.each(function(d) {
        const nodeElement = d3.select(this);
        const isSelected = currentConfig.selectedNodes.has(d.id);
        
        if (isSelected) {
            nodeElement.classed('selected', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.selections.stroke)
                .attr('stroke-width', currentConfig.selections.strokeWidth)
                .attr('r', d => getNodeRadius(d) * currentConfig.selections.radiusMultiplier);
        } else {
            nodeElement.classed('selected', false)
                .transition()
                .duration(300)
                .attr('stroke', d => getNodeStyle(d).stroke || 'none')
                .attr('stroke-width', d => getNodeStyle(d).strokeWidth || 0)
                .attr('r', d => getNodeRadius(d));
        }
    });
    
    // Update labels for selected nodes
    labelElements.each(function(d) {
        const labelElement = d3.select(this);
        const isSelected = currentConfig.selectedNodes.has(d.id);
        
        if (isSelected) {
            labelElement.classed('selected', true)
                .transition()
                .duration(300)
                .attr('font-weight', 'bold')
                .attr('font-size', parseInt(currentConfig.labels.fontSize) * 1.2 + 'px');
        } else {
            labelElement.classed('selected', false)
                .transition()
                .duration(300)
                .attr('font-weight', 'normal')
                .attr('font-size', currentConfig.labels.fontSize);
        }
    });
}
/**
 * Handle link-related events and styling
 */

/**
 * Handle mouseover event on link
 * @param {Event} event - Mouse event
 * @param {Object} link - Link data
 */
function handleLinkMouseover(event, link) {
    // Highlight link
    d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke', currentConfig.colors.highlight)
        .attr('stroke-width', getLinkStyle(link).strokeWidth * 2);
    
    // Show tooltip if enabled
    if (currentConfig.tooltips.enabled) {
        showLinkTooltip(event, link);
    }
    
    // Highlight connected nodes if enabled
    if (currentConfig.highlights.showLinkNodes) {
        highlightLinkNodes(link);
    }
    
    // Emit event
    if (currentConfig.events.onLinkHover) {
        currentConfig.events.onLinkHover(link, event);
    }
}

/**
 * Handle mouseout event on link
 * @param {Event} event - Mouse event
 * @param {Object} link - Link data
 */
function handleLinkMouseout(event, link) {
    // Reset link appearance
    d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke', d => getLinkStyle(d).stroke)
        .attr('stroke-width', d => getLinkStyle(d).strokeWidth);
    
    // Hide tooltip
    if (currentConfig.tooltips.enabled) {
        hideTooltip();
    }
    
    // Reset highlighting
    if (currentConfig.highlights.showLinkNodes) {
        resetLinkHighlights();
    }
    
    // Emit event
    if (currentConfig.events.onLinkLeave) {
        currentConfig.events.onLinkLeave(link, event);
    }
}
/**
 * Handle click event on link
 * @param {Event} event - Mouse event
 * @param {Object} link - Link data
 */
function handleLinkClick(event, link) {
    // Toggle selection
    const linkId = link.id || `${link.source}-${link.target}`;
    const isSelected = currentConfig.selectedLinks.has(linkId);
    
    if (isSelected) {
        currentConfig.selectedLinks.delete(linkId);
    } else {
        // If not multi-select mode, clear previous selections
        if (!currentConfig.selections.multiSelect) {
            currentConfig.selectedLinks.clear();
        }
        currentConfig.selectedLinks.add(linkId);
    }
    
    // Update visual appearance of all links
    updateLinkSelections();
    
    // Emit event
    if (currentConfig.events.onLinkClick) {
        currentConfig.events.onLinkClick(link, isSelected, event);
    }
    
    // Stop propagation to prevent zoom behavior
    event.stopPropagation();
}

/**
 * Show tooltip for link
 * @param {Event} event - Mouse event
 * @param {Object} link - Link data
 */
function showLinkTooltip(event, link) {
    // Create tooltip if it doesn't exist
    if (!tooltipDiv) {
        tooltipDiv = d3.select('body')
            .append('div')
            .attr('class', 'genealogy-tooltip')
            .style('opacity', 0)
            .style('position', 'absolute')
            .style('pointer-events', 'none')
            .style('background', currentConfig.tooltips.background)
            .style('border', `1px solid ${currentConfig.tooltips.border}`)
            .style('border-radius', '5px')
            .style('padding', '10px')
            .style('box-shadow', '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)')
            .style('z-index', 1000);
    }
    
    // Fade in tooltip
    tooltipDiv.transition()
        .duration(200)
        .style('opacity', 0.9);
    
    // Get source and target node info
    const sourceNode = typeof link.source === 'object' ? link.source : 
        dataCache.nodes.find(n => n.id === link.source);
    const targetNode = typeof link.target === 'object' ? link.target : 
        dataCache.nodes.find(n => n.id === link.target);
    
    // Build tooltip content
    let tooltipContent = '';
    
    // Title
    const relationshipText = link.relationship || link.type || 'Link';
    tooltipContent += `<div style="font-weight: bold; margin-bottom: 5px; color: ${currentConfig.tooltips.titleColor}">
        ${formatLabel(relationshipText)}
    </div>`;
    
    // Connection info
    tooltipContent += `<div style="margin-top: 3px;">
        <span style="color: ${currentConfig.tooltips.keyColor}">From:</span> 
        <span style="color: ${currentConfig.tooltips.valueColor}">${sourceNode ? (sourceNode.name || sourceNode.id) : 'Unknown'}</span>
    </div>`;
    
    tooltipContent += `<div style="margin-top: 3px;">
        <span style="color: ${currentConfig.tooltips.keyColor}">To:</span> 
        <span style="color: ${currentConfig.tooltips.valueColor}">${targetNode ? (targetNode.name || targetNode.id) : 'Unknown'}</span>
    </div>`;
    
    // Add all other properties
    const excludedProps = ['source', 'target', 'index', 'relationship', 'type'];
    Object.entries(link).forEach(([key, value]) => {
        if (!excludedProps.includes(key)) {
            tooltipContent += `<div style="margin-top: 3px;">
                <span style="color: ${currentConfig.tooltips.keyColor}">${formatLabel(key)}:</span> 
                <span style="color: ${currentConfig.tooltips.valueColor}">${value}</span>
            </div>`;
        }
    });
    
    // Custom tooltip content if provided
    if (currentConfig.tooltips.customLinkContent) {
        tooltipContent = currentConfig.tooltips.customLinkContent(link, sourceNode, targetNode, tooltipContent);
    }
    
    // Set tooltip content and position
    tooltipDiv.html(tooltipContent)
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 28}px`);
}

/**
 * Highlight nodes connected by the selected link
 * @param {Object} link - Link to highlight connections for
 */
function highlightLinkNodes(link) {
    // Reset existing highlights
    resetLinkHighlights();
    
    // Get source and target IDs
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Apply highlighting to nodes
    nodeElements.each(function(d) {
        const nodeElement = d3.select(this);
        if (d.id === sourceId || d.id === targetId) {
            nodeElement.classed('linked', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.nodeStroke)
                .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth);
        } else {
            nodeElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
    
    // Apply highlighting to the specific link
    linkElements.each(function(d) {
        const linkElement = d3.select(this);
        const currentSourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const currentTargetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        if ((currentSourceId === sourceId && currentTargetId === targetId) ||
            (currentConfig.highlights.bidirectional && currentSourceId === targetId && currentTargetId === sourceId)) {
            linkElement.classed('linked', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.linkStroke)
                .attr('stroke-width', currentConfig.highlights.linkStrokeWidth)
                .style('opacity', 1);
        } else {
            linkElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity / 2);
        }
    });
    
    // Apply highlighting to labels
    labelElements.each(function(d) {
        const labelElement = d3.select(this);
        if (d.id === sourceId || d.id === targetId) {
            labelElement.classed('linked', true)
                .transition()
                .duration(300)
                .style('opacity', 1)
                .attr('font-weight', 'bold');
        } else {
            labelElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
}

/**
 * Reset link highlights
 */
function resetLinkHighlights() {
    // Reset nodes
    nodeElements.classed('linked', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke', d => getNodeStyle(d).stroke || 'none')
        .attr('stroke-width', d => getNodeStyle(d).strokeWidth || 0);
    
    // Reset links
    linkElements.classed('linked', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke', d => getLinkStyle(d).stroke)
        .attr('stroke-width', d => getLinkStyle(d).strokeWidth);
    
    // Reset labels
    labelElements.classed('linked', false)
        .classed('faded', false)
        .transition()
        .duration(300)
        .style('opacity', currentConfig.labels.show ? 1 : 0)
        .attr('font-weight', 'normal');
}

/**
 * Update visual appearance of selected links
 */
function updateLinkSelections() {
    linkElements.each(function(d) {
        const linkElement = d3.select(this);
        const linkId = d.id || `${d.source}-${d.target}`;
        const isSelected = currentConfig.selectedLinks.has(linkId);
        
        if (isSelected) {
            linkElement.classed('selected', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.selections.linkStroke)
                .attr('stroke-width', currentConfig.selections.linkStrokeWidth);
        } else {
            linkElement.classed('selected', false)
                .transition()
                .duration(300)
                .attr('stroke', d => getLinkStyle(d).stroke)
                .attr('stroke-width', d => getLinkStyle(d).strokeWidth);
        }
    });
}
/**
 * Zoom and pan interaction functions
 */

/**
 * Initialize zoom behavior for the visualization
 */
function initializeZoom() {
    // Create zoom behavior
    zoom = d3.zoom()
        .scaleExtent([currentConfig.zoom.minScale, currentConfig.zoom.maxScale])
        .on('zoom', handleZoom);
    
    // Apply zoom behavior to SVG
    svg.call(zoom);
    
    // Set initial transform if specified
    if (currentConfig.zoom.initialScale !== 1 || 
        currentConfig.zoom.initialTranslateX !== 0 || 
        currentConfig.zoom.initialTranslateY !== 0) {
        
        const initialTransform = d3.zoomIdentity
            .translate(currentConfig.zoom.initialTranslateX, currentConfig.zoom.initialTranslateY)
            .scale(currentConfig.zoom.initialScale);
        
        svg.call(zoom.transform, initialTransform);
    }
    
    // Add zoom controls if enabled
    if (currentConfig.zoom.showControls) {
        addZoomControls();
    }
}

/**
 * Handle zoom events
 * @param {Event} event - Zoom event
 */
function handleZoom(event) {
    // Apply transform to the container
    container.attr('transform', event.transform);
    
    // Update current transform
    currentTransform = event.transform;
    
    // Adjust link width based on zoom level if enabled
    if (currentConfig.links.dynamicWidth) {
        linkElements.attr('stroke-width', d => getLinkWidth(d) / Math.sqrt(event.transform.k));
    }
    
    // Adjust node size based on zoom level if enabled
    if (currentConfig.nodes.dynamicSize) {
        nodeElements.attr('r', d => getNodeRadius(d) / Math.sqrt(event.transform.k));
    }
    
    // Adjust label size and position based on zoom level
    if (currentConfig.labels.dynamicSize) {
        labelElements
            .attr('font-size', `${parseInt(currentConfig.labels.fontSize) / Math.sqrt(event.transform.k)}px`)
            .attr('dx', d => (getNodeRadius(d) + 5) / Math.sqrt(event.transform.k))
            .attr('dy', d => currentConfig.labels.position === 'top' ? 
                -(getNodeRadius(d) + 5) / Math.sqrt(event.transform.k) : 
                (getNodeRadius(d) + 5) / Math.sqrt(event.transform.k) / 3);
    }
    
    // Emit zoom event
    if (currentConfig.events.onZoom) {
        currentConfig.events.onZoom(event.transform);
    }
}

/**
 * Add zoom control buttons to the visualization
 */
function addZoomControls() {
    const controlsContainer = d3.select(container.node().parentNode)
        .append('g')
        .attr('class', 'zoom-controls')
        .attr('transform', `translate(${currentConfig.zoom.controlsPosition.x}, ${currentConfig.zoom.controlsPosition.y})`);
    
    // Background rectangle
    controlsContainer.append('rect')
        .attr('width', 90)
        .attr('height', 30)
        .attr('rx', 5)
        .attr('ry', 5)
        .attr('fill', currentConfig.zoom.controlsBackground)
        .attr('stroke', currentConfig.zoom.controlsBorder)
        .attr('stroke-width', 1)
        .attr('opacity', 0.7);
    
    // Zoom in button
    const zoomInButton = controlsContainer.append('g')
        .attr('class', 'zoom-button zoom-in')
        .attr('transform', 'translate(10, 5)')
        .style('cursor', 'pointer')
        .on('click', function() {
            svg.transition()
                .duration(750)
                .call(zoom.scaleBy, 1.5);
        });
    
    zoomInButton.append('circle')
        .attr('r', 10)
        .attr('fill', currentConfig.zoom.buttonFill);
    
    zoomInButton.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', currentConfig.zoom.buttonText)
        .text('+');
    
    // Zoom reset button
    const zoomResetButton = controlsContainer.append('g')
        .attr('class', 'zoom-button zoom-reset')
        .attr('transform', 'translate(45, 5)')
        .style('cursor', 'pointer')
        .on('click', function() {
            svg.transition()
                .duration(750)
                .call(zoom.transform, d3.zoomIdentity);
        });
    
    zoomResetButton.append('circle')
        .attr('r', 10)
        .attr('fill', currentConfig.zoom.buttonFill);
    
    zoomResetButton.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', currentConfig.zoom.buttonText)
        .text('⟲');
    
    // Zoom out button
    const zoomOutButton = controlsContainer.append('g')
        .attr('class', 'zoom-button zoom-out')
        .attr('transform', 'translate(80, 5)')
        .style('cursor', 'pointer')
        .on('click', function() {
            svg.transition()
                .duration(750)
                .call(zoom.scaleBy, 0.75);
        });
    
    zoomOutButton.append('circle')
        .attr('r', 10)
        .attr('fill', currentConfig.zoom.buttonFill);
    
    zoomOutButton.append('text')
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .attr('fill', currentConfig.zoom.buttonText)
        .text('−');
}

/**
 * Zoom to specific point
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} scale - Zoom scale
 * @param {number} duration - Transition duration
 */
function zoomToPoint(x, y, scale, duration = 750) {
    svg.transition()
        .duration(duration)
        .call(zoom.transform, d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-x, -y));
}

/**
 * Zoom to fit all nodes
 * @param {number} padding - Padding around the nodes
 * @param {number} duration - Transition duration
 */
function zoomToFit(padding = 50, duration = 750) {
    if (!dataCache.nodes || dataCache.nodes.length === 0) return;
    
    // Find the bounds of all nodes
    const bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity
    };
    
    // Get current positions from the simulation
    dataCache.nodes.forEach(node => {
        if (node.x < bounds.minX) bounds.minX = node.x;
        if (node.y < bounds.minY) bounds.minY = node.y;
        if (node.x > bounds.maxX) bounds.maxX = node.x;
        if (node.y > bounds.maxY) bounds.maxY = node.y;
    });
    
    // Add padding
    bounds.minX -= padding;
    bounds.minY -= padding;
    bounds.maxX += padding;
    bounds.maxY += padding;
    
    // Calculate needed scale and translation
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const x = (bounds.minX + bounds.maxX) / 2;
    const y = (bounds.minY + bounds.maxY) / 2;
    
    // Calculate scale to fit entire graph
    const scale = Math.min(width / dx, height / dy);
    const clampedScale = Math.min(
        Math.max(scale, currentConfig.zoom.minScale),
        currentConfig.zoom.maxScale
    );
    
    // Apply zoom transformation
    svg.transition()
        .duration(duration)
        .call(zoom.transform, d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(clampedScale)
            .translate(-x, -y));
}

/**
 * Zoom to specific node
 * @param {string|Object} nodeIdentifier - Node ID or node object
 * @param {number} scale - Zoom scale
 * @param {number} duration - Transition duration
 */
function zoomToNode(nodeIdentifier, scale = 3, duration = 750) {
    // Find the node
    let targetNode;
    if (typeof nodeIdentifier === 'string') {
        targetNode = dataCache.nodes.find(n => n.id === nodeIdentifier);
    } else {
        targetNode = nodeIdentifier;
    }
    
    if (!targetNode) {
        console.warn(`Node not found: ${nodeIdentifier}`);
        return;
    }
    
    // Zoom to node position
    zoomToPoint(targetNode.x, targetNode.y, scale, duration);
    
    // Highlight the node
    if (currentConfig.highlights.zoomHighlight) {
        highlightNode(targetNode);
    }
}

/**
 * Highlight a specific node
 * @param {Object} node - Node to highlight
 */
function highlightNode(node) {
    // Reset existing highlights
    resetHighlights();
    
    // Find node element
    nodeElements.filter(d => d.id === node.id)
        .classed('highlighted', true)
        .transition()
        .duration(300)
        .attr('stroke', currentConfig.highlights.nodeStroke)
        .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
        .attr('r', d => getNodeRadius(d) * 1.2);
    
    // Find label element
    labelElements.filter(d => d.id === node.id)
        .classed('highlighted', true)
        .transition()
        .duration(300)
        .attr('font-weight', 'bold')
        .attr('font-size', parseInt(currentConfig.labels.fontSize) * 1.2 + 'px');
    
    // Highlight node's connections if enabled
    if (currentConfig.highlights.showConnections) {
        highlightConnections(node);
    }
}

/**
 * Export visualization as SVG
 * @return {string} SVG string
 */
function exportSVG() {
    // Clone the SVG to avoid modifying the original
    const clonedSvgNode = svg.node().cloneNode(true);
    const clonedSvg = d3.select(clonedSvgNode);
    
    // Set dimensions and viewBox explicitly
    clonedSvg
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);
    
    // Add CSS styles inline
    const styleElement = document.createElement('style');
    const cssRules = [];
    
    // Add basic styles
    cssRules.push(`
        .node { cursor: pointer; }
        .link { pointer-events: stroke; cursor: pointer; }
        .label { pointer-events: none; user-select: none; }
    `);
    
    // Add custom styles
    if (currentConfig.customCSS) {
        cssRules.push(currentConfig.customCSS);
    }
    
    styleElement.textContent = cssRules.join('\n');
    clonedSvgNode.insertBefore(styleElement, clonedSvgNode.firstChild);
    
    // Serialize to SVG string
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvgNode);
    
    // Add XML declaration and doctype
    svgString = '<?xml version="1.0" standalone="no"?>\n' + svgString;
    
    return svgString;
}
/**
 * Export and utility functions
 */

/**
 * Export visualization as PNG
 * @param {string} filename - Name of the exported file
 * @param {number} scale - Export scale factor
 * @return {Promise} Promise resolving with the data URL
 */
function exportPNG(filename = 'graph-visualization.png', scale = 2) {
    return new Promise((resolve, reject) => {
        try {
            // Create a canvas with appropriate size
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            
            // Set canvas dimensions with scale factor
            canvas.width = width * scale;
            canvas.height = height * scale;
            
            // Fill background
            context.fillStyle = currentConfig.background;
            context.fillRect(0, 0, canvas.width, canvas.height);
            
            // Get SVG data
            const svgString = exportSVG();
            
            // Create a Blob from the SVG string
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            
            // Create image from SVG
            const img = new Image();
            img.onload = () => {
                // Draw the image to the canvas with scaling
                context.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Convert to data URL
                const dataUrl = canvas.toDataURL('image/png');
                
                // Clean up
                URL.revokeObjectURL(url);
                
                // Create download if filename provided
                if (filename) {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = filename;
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                
                resolve(dataUrl);
            };
            
            img.onerror = error => {
                URL.revokeObjectURL(url);
                reject(error);
            };
            
            img.src = url;
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Export visualization data as JSON
 * @param {string} filename - Name of the exported file
 * @return {Object} Visualization data
 */
function exportJSON(filename = 'graph-data.json') {
    // Prepare data object
    const exportData = {
        nodes: dataCache.nodes.map(node => {
            // Create a clean copy without D3 simulation properties
            const cleanNode = { ...node };
            
            // Remove D3 force simulation properties
            delete cleanNode.index;
            delete cleanNode.x;
            delete cleanNode.y;
            delete cleanNode.vx;
            delete cleanNode.vy;
            delete cleanNode.fx;
            delete cleanNode.fy;
            
            return cleanNode;
        }),
        links: dataCache.links.map(link => {
            // Create a clean copy
            const cleanLink = { ...link };
            
            // Convert source/target objects back to IDs if needed
            if (typeof cleanLink.source === 'object') {
                cleanLink.source = cleanLink.source.id;
            }
            if (typeof cleanLink.target === 'object') {
                cleanLink.target = cleanLink.target.id;
            }
            
            // Remove D3 force simulation properties
            delete cleanLink.index;
            
            return cleanLink;
        }),
        config: { ...currentConfig }
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create download if filename provided
    if (filename) {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }
    
    return exportData;
}

/**
 * Calculate node strength (number of connections)
 * @param {Object} node - Node to analyze
 * @return {number} Node strength (number of connections)
 */
function calculateNodeStrength(node) {
    return dataCache.links.filter(link => 
        (typeof link.source === 'object' ? link.source.id === node.id : link.source === node.id) ||
        (typeof link.target === 'object' ? link.target.id === node.id : link.target === node.id)
    ).length;
}

/**
 * Group nodes by attribute
 * @param {string} attribute - Attribute to group by
 * @return {Object} Grouped nodes
 */
function groupNodesByAttribute(attribute) {
    const groups = {};
    
    dataCache.nodes.forEach(node => {
        const value = node[attribute] || 'undefined';
        
        if (!groups[value]) {
            groups[value] = [];
        }
        
        groups[value].push(node);
    });
    
    return groups;
}

/**
 * Find path between two nodes
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {number} maxDepth - Maximum path depth
 * @return {Array} Path of nodes
 */
function findPath(sourceId, targetId, maxDepth = 5) {
    // Build adjacency list
    const adjacencyList = {};
    
    dataCache.nodes.forEach(node => {
        adjacencyList[node.id] = [];
    });
    
    dataCache.links.forEach(link => {
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        
        // Add both directions if we want to find any path
        adjacencyList[source].push({ id: target, link });
        adjacencyList[target].push({ id: source, link });
    });
    
    // Breadth-first search
    const queue = [{ id: sourceId, path: [sourceId], links: [], depth: 0 }];
    const visited = new Set([sourceId]);
    
    while (queue.length > 0) {
        const { id, path, links, depth } = queue.shift();
        
        // Check if we reached the target
        if (id === targetId) {
            return { path, links };
        }
        
        // Check if we reached maximum depth
        if (depth >= maxDepth) {
            continue;
        }
        
        // Explore neighbors
        for (const neighbor of adjacencyList[id]) {
            if (!visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push({
                    id: neighbor.id,
                    path: [...path, neighbor.id],
                    links: [...links, neighbor.link],
                    depth: depth + 1
                });
            }
        }
    }
    
    // No path found
    return null;
}

/**
 * Highlight path between two nodes
 * @param {string} sourceId - Source node ID
 * @param {string} targetId - Target node ID
 * @param {number} maxDepth - Maximum path depth
 */
function highlightPath(sourceId, targetId, maxDepth = 5) {
    // Find path
    const pathData = findPath(sourceId, targetId, maxDepth);
    
    if (!pathData) {
        console.warn(`No path found between ${sourceId} and ${targetId} within depth ${maxDepth}`);
        return;
    }
    
    const { path, links } = pathData;
    
    // Reset existing highlights
    resetHighlights();
    
    // Highlight path nodes
    nodeElements.each(function(d) {
        const nodeElement = d3.select(this);
        if (path.includes(d.id)) {
            nodeElement.classed('path', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.pathNodeStroke)
                .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
                .style('opacity', 1);
        } else {
            nodeElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
    
    // Highlight path links
    linkElements.each(function(d) {
        const linkElement = d3.select(this);
        const source = typeof d.source === 'object' ? d.source.id : d.source;
        const target = typeof d.target === 'object' ? d.target.id : d.target;
        
        // Check if this link is part of the path
        const isPathLink = links.some(pathLink => {
            const pathSource = typeof pathLink.source === 'object' ? pathLink.source.id : pathLink.source;
            const pathTarget = typeof pathLink.target === 'object' ? pathLink.target.id : pathLink.target;
            
            return (source === pathSource && target === pathTarget) || 
                   (source === pathTarget && target === pathSource);
        });
        
        if (isPathLink) {
            linkElement.classed('path', true)
                .transition()
                .duration(300)
                .attr('stroke', currentConfig.highlights.pathLinkStroke)
                .attr('stroke-width', currentConfig.highlights.linkStrokeWidth * 1.5)
                .style('opacity', 1);
        } else {
            linkElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity / 2);
        }
    });
    
    // Highlight path labels
    labelElements.each(function(d) {
        const labelElement = d3.select(this);
        if (path.includes(d.id)) {
            labelElement.classed('path', true)
                .transition()
                .duration(300)
                .style('opacity', 1)
                .attr('font-weight', 'bold');
        } else {
            labelElement.classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
}

/**
 * Get node neighborhood (nodes directly connected to the given node)
 * @param {string} nodeId - Node ID
 * @return {Object} Neighborhood data
 */
function getNodeNeighborhood(nodeId) {
    const neighbors = new Set();
    const connections = [];
    
    // Find all nodes connected to this node
    dataCache.links.forEach(link => {
        const source = typeof link.source === 'object' ? link.source.id : link.source;
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        
        if (source === nodeId) {
            neighbors.add(target);
            connections.push({
                source: nodeId,
                target,
                link
            });
        } else if (target === nodeId) {
            neighbors.add(source);
            connections.push({
                source,
                target: nodeId,
                link
            });
        }
    });
    
    // Convert neighbor IDs to node objects
    const neighborNodes = Array.from(neighbors).map(id => 
        dataCache.nodes.find(node => node.id === id)
    ).filter(Boolean);
    
    return {
        center: dataCache.nodes.find(node => node.id === nodeId),
        neighbors: neighborNodes,
        connections
    };
}
/**
 * Layout and simulation functions
 */

/**
 * Initialize force simulation
 */
function initializeSimulation() {
    // Create new simulation
    simulation = d3.forceSimulation()
        .nodes(dataCache.nodes)
        .force('link', d3.forceLink()
            .id(d => d.id)
            .links(dataCache.links)
            .distance(d => getLinkDistance(d))
            .strength(d => getLinkStrength(d)))
        .force('charge', d3.forceManyBody()
            .strength(d => getChargeStrength(d)))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .on('tick', tick);
    
    // Add additional forces if configured
    if (currentConfig.simulation.useCollide) {
        simulation.force('collide', d3.forceCollide()
            .radius(d => getNodeRadius(d) * currentConfig.simulation.collisionFactor)
            .strength(currentConfig.simulation.collisionStrength));
    }
    
    if (currentConfig.simulation.useXForce) {
        simulation.force('x', d3.forceX(width / 2)
            .strength(currentConfig.simulation.xStrength));
    }
    
    if (currentConfig.simulation.useYForce) {
        simulation.force('y', d3.forceY(height / 2)
            .strength(currentConfig.simulation.yStrength));
    }
    
    // Apply custom layout if specified
    if (currentConfig.layout.type !== 'force') {
        applyCustomLayout(currentConfig.layout.type);
    }
    
    // Handle fixed nodes
    dataCache.nodes.forEach(node => {
        if (node.fixed || node.fx !== undefined || node.fy !== undefined) {
            node.fx = node.fx !== undefined ? node.fx : (node.x || width / 2);
            node.fy = node.fy !== undefined ? node.fy : (node.y || height / 2);
        }
    });
    
    // Set alpha target if specified
    if (currentConfig.simulation.alphaTarget) {
        simulation.alphaTarget(currentConfig.simulation.alphaTarget);
    }
    
    // Set alpha decay if specified
    if (currentConfig.simulation.alphaDecay) {
        simulation.alphaDecay(currentConfig.simulation.alphaDecay);
    }
}

/**
 * Simulation tick handler
 */
function tick() {
    // Update link positions
    linkElements
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);

    // Update curve links if using curved links
    if (currentConfig.links.curved) {
        curvedLinkElements
            .attr('d', d => {
                const dx = d.target.x - d.source.x;
                const dy = d.target.y - d.source.y;
                const dr = Math.sqrt(dx * dx + dy * dy) * getCurveFactor(d);
                return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
            });
    }
    
    // Update node positions with bounds checking
    nodeElements
        .attr('cx', d => {
            if (currentConfig.simulation.bounded) {
                const r = getNodeRadius(d);
                d.x = Math.max(r, Math.min(width - r, d.x));
            }
            return d.x;
        })
        .attr('cy', d => {
            if (currentConfig.simulation.bounded) {
                const r = getNodeRadius(d);
                d.y = Math.max(r, Math.min(height - r, d.y));
            }
            return d.y;
        });
    
    // Update label positions
    labelElements
        .attr('x', d => d.x)
        .attr('y', d => d.y);
    
    // Update icon positions if icons are used
    if (currentConfig.nodes.useIcons) {
        iconElements
            .attr('x', d => d.x - getNodeRadius(d) / 2)
            .attr('y', d => d.y - getNodeRadius(d) / 2)
            .attr('width', d => getNodeRadius(d))
            .attr('height', d => getNodeRadius(d));
    }
    
    // Update marker positions
    markerElements
        .attr('transform', d => `translate(${d.x},${d.y})`);
    
    // Update hull positions if using hulls
    if (currentConfig.hulls.enabled) {
        updateHulls();
    }
    
    // Emit tick event
    if (currentConfig.events.onTick) {
        currentConfig.events.onTick();
    }
}

/**
 * Apply custom layout to nodes
 * @param {string} layoutType - Type of layout
 */
function applyCustomLayout(layoutType) {
    switch (layoutType) {
        case 'circular':
            applyCircularLayout();
            break;
        case 'grid':
            applyGridLayout();
            break;
        case 'radial':
            applyRadialLayout();
            break;
        case 'hierarchical':
            applyHierarchicalLayout();
            break;
        case 'cluster':
            applyClusterLayout();
            break;
        default:
            console.warn(`Unknown layout type: ${layoutType}`);
    }
}

/**
 * Apply circular layout
 */
function applyCircularLayout() {
    const nodes = dataCache.nodes;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;
    
    // Arrange nodes in a circle
    nodes.forEach((node, i) => {
        const angle = (i / nodes.length) * 2 * Math.PI;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
        
        // Fix position if specified
        if (currentConfig.layout.fixPositions) {
            node.fx = node.x;
            node.fy = node.y;
        }
    });
    
    // Update simulation
    if (simulation) {
        simulation.alpha(1).restart();
    }
}

/**
 * Apply grid layout
 */
function applyGridLayout() {
    const nodes = dataCache.nodes;
    const padding = currentConfig.layout.padding || 50;
    
    // Calculate grid dimensions
    const cellsPerRow = Math.ceil(Math.sqrt(nodes.length));
    const cellWidth = (width - padding * 2) / cellsPerRow;
    const cellHeight = (height - padding * 2) / Math.ceil(nodes.length / cellsPerRow);
    
    // Arrange nodes in a grid
    nodes.forEach((node, i) => {
        const row = Math.floor(i / cellsPerRow);
        const col = i % cellsPerRow;
        
        node.x = padding + col * cellWidth + cellWidth / 2;
        node.y = padding + row * cellHeight + cellHeight / 2;
        
        // Fix position if specified
        if (currentConfig.layout.fixPositions) {
            node.fx = node.x;
            node.fy = node.y;
        }
    });
    
    // Update simulation
    if (simulation) {
        simulation.alpha(1).restart();
    }
}

/**
 * Apply radial layout (nodes grouped by attribute)
 */
function applyRadialLayout() {
    const nodes = dataCache.nodes;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.4;
    
    // Group nodes by the specified attribute
    const attribute = currentConfig.layout.groupAttribute || 'group';
    const groups = {};
    
    nodes.forEach(node => {
        const value = node[attribute] || 'undefined';
        if (!groups[value]) {
            groups[value] = [];
        }
        groups[value].push(node);
    });
    
    // Calculate positions for each group
    const groupNames = Object.keys(groups);
    
    groupNames.forEach((groupName, groupIndex) => {
        const groupNodes = groups[groupName];
        const groupAngle = (groupIndex / groupNames.length) * 2 * Math.PI;
        const groupX = centerX + radius * 0.5 * Math.cos(groupAngle);
        const groupY = centerY + radius * 0.5 * Math.sin(groupAngle);
        
        // Arrange nodes in a circle within their group
        groupNodes.forEach((node, i) => {
            const nodeRadius = radius * 0.3;
            const nodeAngle = (i / groupNodes.length) * 2 * Math.PI;
            
            node.x = groupX + nodeRadius * Math.cos(nodeAngle);
            node.y = groupY + nodeRadius * Math.sin(nodeAngle);
            
            // Fix position if specified
            if (currentConfig.layout.fixPositions) {
                node.fx = node.x;
                node.fy = node.y;
            }
        });
    });
    
    // Update simulation
    if (simulation) {
        simulation.alpha(1).restart();
    }
}

/**
 * Apply hierarchical layout (tree-like)
 */
function applyHierarchicalLayout() {
    const nodes = dataCache.nodes;
    const links = dataCache.links;
    
    // Find root nodes (nodes with no incoming links)
    const hasIncoming = new Set();
    
    links.forEach(link => {
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        hasIncoming.add(targetId);
    });
    
    const rootNodes = nodes.filter(node => !hasIncoming.has(node.id));
    
    // If no root nodes found, use the first node
    if (rootNodes.length === 0) {
        rootNodes.push(nodes[0]);
    }
    
    // Build tree hierarchy
    const visited = new Set();
    const levelMap = {};
    
    function buildLevels(nodeId, level) {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        
        if (!levelMap[level]) {
            levelMap[level] = [];
        }
        
        levelMap[level].push(nodeId);
        
        // Find children
        links.forEach(link => {
            const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
            const targetId = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (sourceId === nodeId && !visited.has(targetId)) {
                buildLevels(targetId, level + 1);
            }
        });
    }
    
    // Build levels starting from root nodes
    rootNodes.forEach(rootNode => buildLevels(rootNode.id, 0));
    
    // Position nodes based on levels
    const levels = Object.keys(levelMap).map(Number);
    const levelHeight = height / (levels.length || 1);
    
    levels.forEach(level => {
        const levelNodes = levelMap[level];
        const levelWidth = width / (levelNodes.length || 1);
        
        levelNodes.forEach((nodeId, index) => {
            const node = nodes.find(n => n.id === nodeId);
            
            if (node) {
                node.x = levelWidth / 2 + index * levelWidth;
                node.y = levelHeight / 2 + level * levelHeight;
                
                // Fix position if specified
                if (currentConfig.layout.fixPositions) {
                    node.fx = node.x;
                    node.fy = node.y;
                }
            }
        });
    });
    
    // Position remaining nodes that weren't visited
    const unvisitedNodes = nodes.filter(node => !visited.has(node.id));
    
    if (unvisitedNodes.length > 0) {
        const extraLevel = levels.length;
        const levelWidth = width / (unvisitedNodes.length || 1);
        
        unvisitedNodes.forEach((node, index) => {
            node.x = levelWidth / 2 + index * levelWidth;
            node.y = levelHeight / 2 + extraLevel * levelHeight;
            
            // Fix position if specified
            if (currentConfig.layout.fixPositions) {
                node.fx = node.x;
                node.fy = node.y;
            }
        });
    }
    
    // Update simulation
    if (simulation) {
        simulation.alpha(1).restart();
    }
}
/**
 * Apply cluster layout based on node attributes
 */
function applyClusterLayout() {
    const nodes = dataCache.nodes;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Group nodes by the specified attribute
    const attribute = currentConfig.layout.groupAttribute || 'group';
    const clusters = {};
    
    nodes.forEach(node => {
        const value = node[attribute] || 'undefined';
        if (!clusters[value]) {
            clusters[value] = [];
        }
        clusters[value].push(node);
    });
    
    // Calculate positions for each cluster
    const clusterKeys = Object.keys(clusters);
    const clusterRadius = Math.min(width, height) * 0.35;
    
    clusterKeys.forEach((clusterKey, i) => {
        const clusterNodes = clusters[clusterKey];
        const angle = (i / clusterKeys.length) * 2 * Math.PI;
        const clusterX = centerX + clusterRadius * Math.cos(angle);
        const clusterY = centerY + clusterRadius * Math.sin(angle);
        
        // Position nodes within cluster with a mini force simulation
        const clusterSimulation = d3.forceSimulation(clusterNodes)
            .force('charge', d3.forceManyBody().strength(-30))
            .force('center', d3.forceCenter(clusterX, clusterY))
            .force('collide', d3.forceCollide().radius(d => getNodeRadius(d) * 1.2))
            .stop();
        
        // Run the simulation synchronously
        for (let i = 0; i < 50; ++i) clusterSimulation.tick();
        
        // Fix positions if specified
        if (currentConfig.layout.fixPositions) {
            clusterNodes.forEach(node => {
                node.fx = node.x;
                node.fy = node.y;
            });
        }
    });
    
    // Update simulation
    if (simulation) {
        simulation.alpha(1).restart();
    }
}

/**
 * Interaction handling functions
 */

/**
 * Initialize drag behavior for nodes
 * @return {Object} D3 drag behavior
 */
function initializeDragBehavior() {
    return d3.drag()
        .on('start', dragStarted)
        .on('drag', dragged)
        .on('end', dragEnded);
}

/**
 * Handler for drag start event
 * @param {Object} event - D3 drag event
 * @param {Object} d - Node data
 */
function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    
    // Set node position based on event
    d.fx = d.x;
    d.fy = d.y;
    
    // Add dragging class
    d3.select(this).classed('dragging', true);
    
    // Emit dragStart event
    if (currentConfig.events.onDragStart) {
        currentConfig.events.onDragStart(d, event);
    }
}

/**
 * Handler for drag event
 * @param {Object} event - D3 drag event
 * @param {Object} d - Node data
 */
function dragged(event, d) {
    // Update node position based on event
    d.fx = event.x;
    d.fy = event.y;
    
    // Apply bounds if enabled
    if (currentConfig.simulation.bounded) {
        const r = getNodeRadius(d);
        d.fx = Math.max(r, Math.min(width - r, d.fx));
        d.fy = Math.max(r, Math.min(height - r, d.fy));
    }
    
    // Emit drag event
    if (currentConfig.events.onDrag) {
        currentConfig.events.onDrag(d, event);
    }
}

/**
 * Handler for drag end event
 * @param {Object} event - D3 drag event
 * @param {Object} d - Node data
 */
function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    
    // Remove dragging class
    d3.select(this).classed('dragging', false);
    
    // Keep node fixed if pinning is enabled or shift key is pressed
    if (!currentConfig.interaction.pinning && !event.sourceEvent.shiftKey) {
        d.fx = null;
        d.fy = null;
    }
    
    // Emit dragEnd event
    if (currentConfig.events.onDragEnd) {
        currentConfig.events.onDragEnd(d, event);
    }
}

/**
 * Initialize zoom behavior
 * @return {Object} D3 zoom behavior
 */
function initializeZoomBehavior() {
    return d3.zoom()
        .scaleExtent([currentConfig.zoom.minScale, currentConfig.zoom.maxScale])
        .on('zoom', zoomed);
}

/**
 * Handler for zoom event
 * @param {Object} event - D3 zoom event
 */
function zoomed(event) {
    // Apply zoom transform to the main group
    container.attr('transform', event.transform);
    
    // Store current zoom transform
    currentZoomTransform = event.transform;
    
    // Update tooltip position if visible
    if (tooltipVisible) {
        updateTooltipPosition();
    }
    
    // Emit zoom event
    if (currentConfig.events.onZoom) {
        currentConfig.events.onZoom(event);
    }
}

/**
 * Handler for node click event
 * @param {Object} event - D3 click event
 * @param {Object} d - Node data
 */
function nodeClicked(event, d) {
    // Stop event propagation to prevent SVG click handler firing
    event.stopPropagation();
    
    // Toggle node selection
    if (currentConfig.interaction.selection) {
        const isSelected = selectedNodes.has(d.id);
        
        if (isSelected) {
            selectedNodes.delete(d.id);
            d3.select(this).classed('selected', false);
            
            // Update appearance
            d3.select(this)
                .transition()
                .duration(200)
                .attr('stroke-width', currentConfig.nodes.strokeWidth)
                .attr('stroke', getNodeStrokeColor(d));
        } else {
            // If not multi-selection, clear previous selection
            if (!event.shiftKey && !currentConfig.interaction.multiSelection) {
                clearSelection();
            }
            
            selectedNodes.add(d.id);
            d3.select(this).classed('selected', true);
            
            // Update appearance
            d3.select(this)
                .transition()
                .duration(200)
                .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
                .attr('stroke', currentConfig.highlights.selectedStroke);
        }
    }
    
    // Show node neighborhood if enabled
    if (currentConfig.interaction.showNeighborsOnClick) {
        highlightNodeNeighborhood(d);
    }
    
    // Show tooltip if enabled
    if (currentConfig.tooltip.nodeOnClick) {
        showTooltip(event, d, 'node');
    }
    
    // Emit nodeClick event
    if (currentConfig.events.onNodeClick) {
        currentConfig.events.onNodeClick(d, event);
    }
}

/**
 * Handler for node double click event
 * @param {Object} event - D3 dblclick event
 * @param {Object} d - Node data
 */
function nodeDoubleClicked(event, d) {
    // Stop event propagation
    event.stopPropagation();
    
    // Toggle fixed status
    if (currentConfig.interaction.pinOnDoubleClick) {
        if (d.fx !== null && d.fy !== null) {
            // Unpin node
            d.fx = null;
            d.fy = null;
            d3.select(this).classed('fixed', false);
        } else {
            // Pin node at current position
            d.fx = d.x;
            d.fy = d.y;
            d3.select(this).classed('fixed', true);
        }
    }
    
    // Emit nodeDoubleClick event
    if (currentConfig.events.onNodeDoubleClick) {
        currentConfig.events.onNodeDoubleClick(d, event);
    }
}

/**
 * Handler for node mouseover event
 * @param {Object} event - D3 mouseover event
 * @param {Object} d - Node data
 */
function nodeMouseover(event, d) {
    // Highlight node
    d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
        .attr('stroke', currentConfig.highlights.hoverStroke);
    
    // Show tooltip if enabled
    if (currentConfig.tooltip.nodeOnHover) {
        showTooltip(event, d, 'node');
    }
    
    // Highlight neighbors if enabled
    if (currentConfig.interaction.showNeighborsOnHover) {
        highlightNodeNeighborhood(d, true);
    }
    
    // Emit nodeMouseover event
    if (currentConfig.events.onNodeMouseover) {
        currentConfig.events.onNodeMouseover(d, event);
    }
}

/**
 * Handler for node mouseout event
 * @param {Object} event - D3 mouseout event
 * @param {Object} d - Node data
 */
function nodeMouseout(event, d) {
    // Reset highlight if not selected
    if (!selectedNodes.has(d.id)) {
        d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-width', currentConfig.nodes.strokeWidth)
            .attr('stroke', getNodeStrokeColor(d));
    }
    
    // Hide tooltip if enabled
    if (currentConfig.tooltip.nodeOnHover) {
        hideTooltip();
    }
    
    // Reset neighborhood highlight if enabled
    if (currentConfig.interaction.showNeighborsOnHover) {
        resetHighlights();
    }
    
    // Emit nodeMouseout event
    if (currentConfig.events.onNodeMouseout) {
        currentConfig.events.onNodeMouseout(d, event);
    }
}

/**
 * Handler for link click event
 * @param {Object} event - D3 click event
 * @param {Object} d - Link data
 */
function linkClicked(event, d) {
    // Stop event propagation
    event.stopPropagation();
    
    // Toggle link selection
    if (currentConfig.interaction.selection) {
        const isSelected = selectedLinks.has(d.id || `${d.source.id}-${d.target.id}`);
        
        if (isSelected) {
            selectedLinks.delete(d.id || `${d.source.id}-${d.target.id}`);
            d3.select(this).classed('selected', false);
            
            // Update appearance
            d3.select(this)
                .transition()
                .duration(200)
                .attr('stroke-width', getLinkStrokeWidth(d))
                .attr('stroke', getLinkColor(d));
        } else {
            // If not multi-selection, clear previous selection
            if (!event.shiftKey && !currentConfig.interaction.multiSelection) {
                clearSelection();
            }
            
            selectedLinks.add(d.id || `${d.source.id}-${d.target.id}`);
            d3.select(this).classed('selected', true);
            
            // Update appearance
            d3.select(this)
                .transition()
                .duration(200)
                .attr('stroke-width', currentConfig.highlights.linkStrokeWidth)
                .attr('stroke', currentConfig.highlights.selectedStroke);
        }
    }
    
    // Show tooltip if enabled
    if (currentConfig.tooltip.linkOnClick) {
        showTooltip(event, d, 'link');
    }
    
    // Emit linkClick event
    if (currentConfig.events.onLinkClick) {
        currentConfig.events.onLinkClick(d, event);
    }
}

/**
 * Handler for link mouseover event
 * @param {Object} event - D3 mouseover event
 * @param {Object} d - Link data
 */
function linkMouseover(event, d) {
    // Highlight link
    d3.select(this)
        .transition()
        .duration(200)
        .attr('stroke-width', currentConfig.highlights.linkStrokeWidth)
        .attr('stroke', currentConfig.highlights.hoverStroke);
    
    // Show tooltip if enabled
    if (currentConfig.tooltip.linkOnHover) {
        showTooltip(event, d, 'link');
    }
    
    // Highlight connected nodes if enabled
    if (currentConfig.interaction.highlightConnectedNodes) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        nodeElements.each(function(node) {
            if (node.id === sourceId || node.id === targetId) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
                    .attr('stroke', currentConfig.highlights.hoverStroke);
            }
        });
    }
    
    // Emit linkMouseover event
    if (currentConfig.events.onLinkMouseover) {
        currentConfig.events.onLinkMouseover(d, event);
    }
}

/**
 * Handler for link mouseout event
 * @param {Object} event - D3 mouseout event
 * @param {Object} d - Link data
 */
function linkMouseout(event, d) {
    // Reset highlight if not selected
    const linkId = d.id || `${d.source.id}-${d.target.id}`;
    if (!selectedLinks.has(linkId)) {
        d3.select(this)
            .transition()
            .duration(200)
            .attr('stroke-width', getLinkStrokeWidth(d))
            .attr('stroke', getLinkColor(d));
    }
    
    // Hide tooltip if enabled
    if (currentConfig.tooltip.linkOnHover) {
        hideTooltip();
    }
    
    // Reset connected nodes highlight if enabled
    if (currentConfig.interaction.highlightConnectedNodes) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        nodeElements.each(function(node) {
            if ((node.id === sourceId || node.id === targetId) && !selectedNodes.has(node.id)) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr('stroke-width', currentConfig.nodes.strokeWidth)
                    .attr('stroke', getNodeStrokeColor(node));
            }
        });
    }
    
    // Emit linkMouseout event
    if (currentConfig.events.onLinkMouseout) {
        currentConfig.events.onLinkMouseout(d, event);
    }
}

/**
 * Handler for SVG click event (background click)
 * @param {Object} event - D3 click event
 */
function svgClicked(event) {
    // Skip if the click is a result of a drag end
    if (event.defaultPrevented) return;
    
    // Clear selection if configured
    if (currentConfig.interaction.clearSelectionOnBackgroundClick) {
        clearSelection();
    }
    
    // Reset highlights
    resetHighlights();
    
    // Hide tooltip
    hideTooltip();
    
    // Emit backgroundClick event
    if (currentConfig.events.onBackgroundClick) {
        currentConfig.events.onBackgroundClick(event);
    }
}

/**
 * Tooltip functions
 */

/**
 * Show tooltip for node or link
 * @param {Object} event - D3 event
 * @param {Object} d - Data object
 * @param {string} type - 'node' or 'link'
 */
function showTooltip(event, d, type) {
    // Create tooltip content based on type
    let content;
    
    if (type === 'node') {
        content = getNodeTooltipContent(d);
    } else {
        content = getLinkTooltipContent(d);
    }
    
    // Set tooltip content
    tooltip.html(content);
    
    // Show tooltip
    tooltip.style('display', 'block');
    tooltipVisible = true;
    
    // Position tooltip
    updateTooltipPosition(event);
}

/**
 * Update tooltip position based on mouse position
 * @param {Object} event - D3 event
 */
function updateTooltipPosition(event) {
    if (!tooltipVisible) return;
    
    // Get mouse position with respect to current zoom level
    let x, y;
    
    if (event) {
        // If event is provided, use event position
        x = event.pageX;
        y = event.pageY;
    } else {
        // If no event (e.g., during zoom), use stored position
        const mouse = d3.pointer(d3.event, svg.node());
        x = mouse[0];
        y = mouse[1];
    }
    
    // Apply offset
    const offsetX = currentConfig.tooltip.offsetX;
    const offsetY = currentConfig.tooltip.offsetY;
    
    // Set tooltip position
    tooltip
        .style('left', `${x + offsetX}px`)
        .style('top', `${y + offsetY}px`);
}

/**
 * Hide tooltip
 */
function hideTooltip() {
    tooltip.style('display', 'none');
    tooltipVisible = false;
}

/**
 * Get tooltip content for node
 * @param {Object} node - Node data
 * @return {string} HTML content
 */
function getNodeTooltipContent(node) {
    // If custom tooltip function is provided, use it
    if (typeof currentConfig.tooltip.nodeContent === 'function') {
        return currentConfig.tooltip.nodeContent(node);
    }
    
    // Default tooltip content
    let content = `<div class="tooltip-title">${node.label || node.id}</div>`;
    content += '<div class="tooltip-content">';
    
    // Add node attributes
    for (const key in node) {
        if (key !== 'x' && key !== 'y' && key !== 'vx' && key !== 'vy' &&
            key !== 'fx' && key !== 'fy' && key !== 'index' && 
            typeof node[key] !== 'object' && typeof node[key] !== 'function') {
            content += `<div><strong>${key}:</strong> ${node[key]}</div>`;
        }
    }
    
    // Add degree information
    const degree = calculateNodeStrength(node);
    content += `<div><strong>Degree:</strong> ${degree}</div>`;
    
    content += '</div>';
    return content;
}

/**
 * Get tooltip content for link
 * @param {Object} link - Link data
 * @return {string} HTML content
 */
function getLinkTooltipContent(link) {
    // If custom tooltip function is provided, use it
    if (typeof currentConfig.tooltip.linkContent === 'function') {
        return currentConfig.tooltip.linkContent(link);
    }
    
    // Extract source and target IDs
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target;
    
    // Default tooltip content
    let content = `<div class="tooltip-title">Link</div>`;
    content += '<div class="tooltip-content">';
    content += `<div><strong>Source:</strong> ${sourceId}</div>`;
    content += `<div><strong>Target:</strong> ${targetId}</div>`;
    
    // Add link attributes
    for (const key in link) {
        if (key !== 'source' && key !== 'target' && key !== 'index' && 
            typeof link[key] !== 'object' && typeof link[key] !== 'function') {
            content += `<div><strong>${key}:</strong> ${link[key]}</div>`;
        }
    }
    
    content += '</div>';
    return content;
}

/**
 * Utility functions
 */

/**
 * Clear selection (nodes and links)
 */
function clearSelection() {
    // Clear selected nodes
    nodeElements.each(function(d) {
        if (selectedNodes.has(d.id)) {
            d3.select(this)
                .classed('selected', false)
                .transition()
                .duration(200)
                .attr('stroke-width', currentConfig.nodes.strokeWidth)
                .attr('stroke', getNodeStrokeColor(d));
        }
    });
    
    // Clear selected links
    linkElements.each(function(d) {
        const linkId = d.id || `${d.source.id}-${d.target.id}`;
        if (selectedLinks.has(linkId)) {
            d3.select(this)
                .classed('selected', false)
                .transition()
                .duration(200)
                .attr('stroke-width', getLinkStrokeWidth(d))
                .attr('stroke', getLinkColor(d));
        }
    });
    
    // Clear sets
    selectedNodes.clear();
    selectedLinks.clear();
}

/**
 * Reset all highlights
 */
function resetHighlights() {
    // Reset node highlights
    nodeElements
        .classed('faded', false)
        .classed('path', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke-width', d => selectedNodes.has(d.id) ? 
            currentConfig.highlights.nodeStrokeWidth : 
            currentConfig.nodes.strokeWidth)
        .attr('stroke', d => selectedNodes.has(d.id) ? 
            currentConfig.highlights.selectedStroke : 
            getNodeStrokeColor(d));
    
    // Reset link highlights
    linkElements
        .classed('faded', false)
        .classed('path', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('stroke-width', d => {
            const linkId = d.id || `${d.source.id}-${d.target.id}`;
            return selectedLinks.has(linkId) ? 
                currentConfig.highlights.linkStrokeWidth : 
                getLinkStrokeWidth(d);
        })
        .attr('stroke', d => {
            const linkId = d.id || `${d.source.id}-${d.target.id}`;
            return selectedLinks.has(linkId) ? 
                currentConfig.highlights.selectedStroke : 
                getLinkColor(d);
        });
    
    // Reset curved link highlights if using curved links
    if (currentConfig.links.curved) {
        curvedLinkElements
            .classed('faded', false)
            .classed('path', false)
            .transition()
            .duration(300)
            .style('opacity', 1)
            .attr('stroke-width', d => {
                const linkId = d.id || `${d.source.id}-${d.target.id}`;
                return selectedLinks.has(linkId) ? 
                    currentConfig.highlights.linkStrokeWidth : 
                    getLinkStrokeWidth(d);
            })
            .attr('stroke', d => {
                const linkId = d.id || `${d.source.id}-${d.target.id}`;
                return selectedLinks.has(linkId) ? 
                    currentConfig.highlights.selectedStroke : 
                    getLinkColor(d);
            });
    }
    
    // Reset label highlights
    labelElements
        .classed('faded', false)
        .classed('path', false)
        .transition()
        .duration(300)
        .style('opacity', 1)
        .attr('font-weight', 'normal');
}

/**
 * Highlight node neighborhood
 * @param {Object} node - Central node
 * @param {boolean} isHover - Whether this is triggered by hover
 */
function highlightNodeNeighborhood(node, isHover = false) {
    // Skip if the node is already highlighted
    if (node.highlighted && !isHover) return;
    
    // Reset existing highlights
    resetHighlights();
    
    // Get neighborhood data
    const neighborhood = getNodeNeighborhood(node.id);
    const neighborIds = new Set(neighborhood.neighbors.map(n => n.id));
    
    // Highlight central node
    d3.select(`#node-${node.id.replace(/[^\w-]/g, '_')}`)
        .classed('path', true)
        .transition()
        .duration(300)
        .attr('stroke', currentConfig.highlights.pathNodeStroke)
        .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
        .style('opacity', 1);
    
    // Fade non-neighbor nodes
    nodeElements.each(function(d) {
        if (d.id !== node.id && !neighborIds.has(d.id)) {
            d3.select(this)
                .classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
    
    // Highlight neighbor nodes
    neighborhood.neighbors.forEach(neighbor => {
        d3.select(`#node-${neighbor.id.replace(/[^\w-]/g, '_')}`)
            .classed('path', true)
            .transition()
            .duration(300)
            .attr('stroke', currentConfig.highlights.neighborStroke)
            .attr('stroke-width', currentConfig.highlights.nodeStrokeWidth)
            .style('opacity', 1);
    });
    
    // Fade non-connected links
    linkElements.each(function(d) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        
        if (sourceId !== node.id && targetId !== node.id) {
            d3.select(this)
                .classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity / 2);
        }
    });
    
    // Highlight connected links
    neighborhood.connections.forEach(conn => {
        const linkSelector = `#link-${conn.source.replace(/[^\w-]/g, '_')}-${conn.target.replace(/[^\w-]/g, '_')}`;
        d3.select(linkSelector)
            .classed('path', true)
            .transition()
            .duration(300)
            .attr('stroke', currentConfig.highlights.pathLinkStroke)
            .attr('stroke-width', currentConfig.highlights.linkStrokeWidth)
            .style('opacity', 1);
    });
    
    // Fade non-connected labels
    labelElements.each(function(d) {
        if (d.id !== node.id && !neighborIds.has(d.id)) {
            d3.select(this)
                .classed('faded', true)
                .transition()
                .duration(300)
                .style('opacity', currentConfig.highlights.fadedOpacity);
        }
    });
    
    // Highlight connected labels
    labelElements.each(function(d) {
        if (d.id === node.id || neighborIds.has(d.id)) {
            d3.select(this)
                .classed('path', true)
                .transition()
                .duration(300)
                .style('opacity', 1)
                .attr('font-weight', 'bold');
        }
    });
    
    // Mark node as highlighted
    node.highlighted = true;
}

/**
 * Update hull positions
 */
function updateHulls() {
    if (!currentConfig.hulls.enabled || !currentConfig.hulls.groupAttribute) return;
    
    const attribute = currentConfig.hulls.groupAttribute;
    const hullPadding = currentConfig.hulls.padding;
    
    // Group nodes by attribute
    const groups = {};
    
    dataCache.nodes.forEach(node => {
        const value = node[attribute] || 'undefined';
        
        if (!groups[value]) {
            groups[value] = [];
        }
        
        groups[value].push([node.x, node.y]);
    });
    
    // Update hulls
    Object.keys(groups).forEach((group, i) => {
        const points = groups[group];
        if (points.length < 3) {
            // Need at least 3 points for a hull
            points.push(...points); // Duplicate points if needed
        }
        
        // Generate hull path
        const hullData = d3.polygonHull(points);
        
        // Skip if hull could not be computed
        if (!hullData) return;
        
        // Add padding to hull
        const paddedHull = hullData.map(point => {
            const centroid = d3.polygonCentroid(hullData);
            const angle = Math.atan2(point[1] - centroid[1], point[0] - centroid[0]);
            return [
                point[0] + hullPadding * Math.cos(angle),
                point[1] + hullPadding * Math.sin(angle)
            ];
        });
        
        // Create hull path
        const hullPath = `M${paddedHull.join('L')}Z`;
        
        // Update or create hull
        let hull = container.select(`.hull-${group.replace(/[^\w-]/g, '_')}`);
        
        if (hull.empty()) {
            hull = container.append('path')
                .attr('class', `hull hull-${group.replace(/[^\w-]/g, '_')}`)
                .attr('fill', currentConfig.hulls.colorScheme[i % currentConfig.hulls.colorScheme.length])
                .attr('opacity', currentConfig.hulls.opacity)
                .attr('stroke', currentConfig.hulls.strokeColor)
                .attr('stroke-width', currentConfig.hulls.strokeWidth);
        }
        
        hull.attr('d', hullPath);
    });
}

/**
 * Update node labels visibility based on zoom level
 */
function updateLabelsVisibility() {
    if (!currentZoomTransform) return;
    
    const scale = currentZoomTransform.k;
    
    // Show/hide labels based on zoom level
    if (scale >= currentConfig.labels.zoomThreshold) {
        labelElements.attr('visibility', 'visible');
    } else {
        labelElements.attr('visibility', 'hidden');
    }
    
    // Optional: Scale label size with zoom if configured
    if (currentConfig.labels.scaleWithZoom) {
        labelElements
            .attr('font-size', `${currentConfig.labels.fontSize / scale}px`);
    }
}

/**
 * Find connections for a node
 * @param {string} nodeId - ID of the node
 * @returns {Object} Object with sets of connected nodes and links
 */
function findConnections(nodeId) {
    // Create result object with Sets for node IDs and link IDs
    const result = {
        nodes: new Set([nodeId]),
        links: new Set(),
        has: function(id) { return this.nodes.has(id); },
        hasLink: function(id) { return this.links.has(id); }
    };
    
    // Find all links connected to this node
    dataCache.links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
        
        if (sourceId === nodeId || targetId === nodeId) {
            // Add connected node
            result.nodes.add(sourceId);
            result.nodes.add(targetId);
            
            // Add link
            result.links.add(link.id || `${sourceId}-${targetId}`);
        }
    });
    
    return result;
}

/**
 * Reset the view to show all nodes
 */
function resetView() {
    if (!svg) return;
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    dataCache.nodes.forEach(node => {
        minX = Math.min(minX, node.x || 0);
        minY = Math.min(minY, node.y || 0);
        maxX = Math.max(maxX, node.x || width);
        maxY = Math.max(maxY, node.y || height);
    });
    
    // Add padding
    const padding = 50;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Calculate scale to fit content
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    const scaleX = width / contentWidth;
    const scaleY = height / contentHeight;
    let scale = Math.min(scaleX, scaleY);
    
    // Clamp scale to zoom limits
    scale = Math.max(currentConfig.zoom.minScale, 
                    Math.min(currentConfig.zoom.maxScale, scale));
    
    // Calculate center point
    const centerX = minX + contentWidth / 2;
    const centerY = minY + contentHeight / 2;
    
    // Calculate translate to center content
    const translateX = width / 2 - centerX * scale;
    const translateY = height / 2 - centerY * scale;
    
    // Create new transform
    const newTransform = d3.zoomIdentity
        .translate(translateX, translateY)
        .scale(scale);
    
    // Apply transform with transition
    svg.transition()
        .duration(currentConfig.transitionDuration)
        .call(zoomHandler.transform, newTransform);
}

/**
 * Apply filter to visualization
 * @param {Function} filterFn - Filter function receiving node/link object, returns boolean
 * @param {Object} options - Filter options
 */
function applyFilter(filterFn, options = {}) {
    const defaults = {
        nodes: true,
        links: true,
        duration: currentConfig.transitionDuration,
        fadeOpacity: 0.1
    };
    
    const filterOptions = { ...defaults, ...options };
    
    // Apply node filter
    if (filterOptions.nodes && nodeElements) {
        nodeElements
            .transition()
            .duration(filterOptions.duration)
            .style('opacity', d => filterFn(d) ? 1 : filterOptions.fadeOpacity);
        
        // Update labels
        if (labelElements) {
            labelElements
                .transition()
                .duration(filterOptions.duration)
                .style('opacity', d => filterFn(d) ? 1 : filterOptions.fadeOpacity);
        }
    }
    
    // Apply link filter
    if (filterOptions.links && linkElements) {
        linkElements
            .transition()
            .duration(filterOptions.duration)
            .style('opacity', d => {
                const sourceObj = typeof d.source === 'object' ? d.source : 
                    dataCache.nodes.find(n => n.id === d.source);
                    
                const targetObj = typeof d.target === 'object' ? d.target : 
                    dataCache.nodes.find(n => n.id === d.target);
                
                if (!sourceObj || !targetObj) return filterOptions.fadeOpacity;
                
                // Link visible if both source and target nodes match filter
                return (filterFn(sourceObj) && filterFn(targetObj)) ? 
                    1 : filterOptions.fadeOpacity;
            });
    }
}

/**
 * Export current view as image
 * @param {string} format - Export format ('png', 'svg')
 * @returns {Promise} Promise resolving to the exported data
 */
function exportImage(format = 'png') {
    return new Promise((resolve, reject) => {
        try {
            // Create a clone of the SVG for export
            const svgClone = svg.node().cloneNode(true);
            
            // Prepare the SVG for export
            d3.select(svgClone)
                .attr('width', width)
                .attr('height', height)
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            
            // If exporting as SVG, return SVG string
            if (format === 'svg') {
                const svgString = new XMLSerializer().serializeToString(svgClone);
                resolve(svgString);
                return;
            }
            
            // For PNG, create an image
            const svgString = new XMLSerializer().serializeToString(svgClone);
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);
            
            const image = new Image();
            image.onload = () => {
                // Create canvas and draw the image
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const context = canvas.getContext('2d');
                context.fillStyle = '#ffffff'; // White background
                context.fillRect(0, 0, width, height);
                context.drawImage(image, 0, 0);
                
                // Get PNG data URL
                try {
                    const dataUrl = canvas.toDataURL('image/png');
                    URL.revokeObjectURL(svgUrl);
                    resolve(dataUrl);
                } catch (error) {
                    reject(error);
                }
            };
            
            image.onerror = (error) => {
                URL.revokeObjectURL(svgUrl);
                reject(error);
            };
            
            image.src = svgUrl;
        } catch (error) {
            reject(error);
        }
    });
}

/**
 * Clean up resources used by the renderer
 */
function destroy() {
    // Stop simulation
    if (simulation) simulation.stop();
    
    // Remove event listeners
    if (svg) {
        svg.on('.zoom', null);
        svg.on('click', null);
        svg.on('contextmenu', null);
    }
    
    // Remove tooltip
    if (tooltipDiv) tooltipDiv.remove();
    
    // Remove context menu
    if (contextMenu) contextMenu.remove();
    
    // Clear all cached data
    dataCache = { nodes: [], links: [] };
    
    // Reset selections
    selectedNodes.clear();
    selectedLinks.clear();
    
    // Clear private variables
    svg = null;
    simulation = null;
    nodeElements = null;
    linkElements = null;
    labelElements = null;
    zoomHandler = null;
    dragHandler = null;
    tooltipDiv = null;
    contextMenu = null;
}

// Return public API
return {
    initialize,
    render,
    updateData,
    getNodeById,
    getLinkById,
    centerOnNode,
    setZoom,
    resetView,
    highlightConnections,
    applyFilter,
    applyClusterLayout,
    exportImage,
    destroy
};

})();

// Export module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = D3Renderer;
} else if (typeof define === 'function' && define.amd) {
    define([], function() { return D3Renderer; });
} else {
    window.D3Renderer = D3Renderer;
}