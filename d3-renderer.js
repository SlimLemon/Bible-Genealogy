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
    
    // Constants for simulation
    const FORCE_CONSTANTS = {
        DEFAULT_CHARGE: -400,
        DEFAULT_LINK_DISTANCE: 100,
        DEFAULT_LINK_STRENGTH: 0.7,
        RADIAL_SORT_STRENGTH: 0.1,
        COLLISION_RADIUS: 40
    };
    
    /**
     * Initialize the D3 visualization with genealogy data
     * @param {Element} container - DOM element to contain the visualization
     * @param {Object} data - The genealogy data with nodes and links
     * @param {Object} config - Configuration options
     */
    function createGenealogy(container, data, config = {}) {
        if (!container) {
            throw new Error('Container element is required');
        }
        
        // Initialize configuration
        currentConfig = initializeConfig(config);
        width = currentConfig.width;
        height = currentConfig.height;
        
        // Create SVG container
        svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('class', 'genealogy-visualization')
            .attr('aria-label', 'Biblical genealogy visualization');
            
        // Create zoom behavior
        zoomHandler = d3.zoom()
            .scaleExtent([0.1, 4])
            .on('zoom', handleZoom);
        
        // Apply zoom behavior to SVG
        svg.call(zoomHandler);
        
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
        
        // Return interface for external control
        return {
            svg: svg,
            updateData: updateData,
            updateConfig: updateConfig
        };
    }
    
    /**
     * Initialize configuration with defaults and user options
     * @param {Object} config - User-provided configuration
     * @return {Object} Complete configuration with defaults
     */
    function initializeConfig(config) {
        const defaultConfig = {
            width: 1200,
            height: 800,
            nodeRadius: 10,
            nodePadding: 20,
            transitionDuration: 750,
            fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: '12px',
            colors: {
                node: '#69b3a2',
                link: '#ddd',
                text: '#333',
                highlight: '#2C5282'
            },
            layout: {
                orientation: 'vertical',
                nodeSpacing: 50,
                levelSpacing: 150
            },
            nodeTypes: {
                patriarch: { radius: 15, color: '#4299E1' },
                matriarch: { radius: 15, color: '#ED64A6' },
                regular: { radius: 10, color: '#69b3a2' }
            },
            linkTypes: {
                'parent-child': { stroke: '#666', strokeWidth: 2 },
                'spouse': { stroke: '#999', strokeWidth: 1, dasharray: '5,5' },
                'covenant': { stroke: '#2C5282', strokeWidth: 3 }
            },
            eventHandlers: {
                nodeClick: null,
                nodeHover: null,
                backgroundClick: null
            }
        };
        
        // Deep merge with user config
        return deepMerge(defaultConfig, config);
    }
    
    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object to merge
     * @return {Object} Merged object
     */
    function deepMerge(target, source) {
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
     * @return {boolean} True if item is an object
     */
    function isObject(item) {
        return (item && typeof item === 'object' && !Array.isArray(item));
    }
    
    /**
     * Update visualization with new data
     * @param {Object} data - New data with nodes and links
     */
    function updateData(data) {
        if (!svg || !data) return;
        
        // Preprocess data to ensure proper structure and references
        const processedData = preprocessData(data);
        dataCache = processedData;
        
        // Create the force simulation
        createForceSimulation(processedData);
        
        // Render the visualization
        renderVisualization(processedData);
    }
    
    /**
     * Preprocess data to ensure consistent structure
     * @param {Object} data - Raw data object with nodes and links
     * @return {Object} Processed data with consistent structure
     */
    function preprocessData(data) {
        const nodes = data.nodes.map(node => ({
            ...node,
            // Ensure all required properties exist
            id: node.id || `node-${Math.random().toString(36).substr(2, 9)}`,
            name: node.name || 'Unknown',
            type: node.type || 'regular',
            generation: node.generation || 0,
            x: node.x || Math.random() * width,
            y: node.y || Math.random() * height
        }));
        
        // Create Map for faster node lookup
        const nodeMap = new Map(nodes.map(node => [node.id, node]));
        
        const links = data.links.map(link => {
            // Create deep copy to avoid modifying input
            const processedLink = { ...link };
            
            // Ensure link has an ID
            processedLink.id = link.id || `link-${Math.random().toString(36).substr(2, 9)}`;
            
            // Ensure consistent type
            processedLink.type = link.type || 'parent-child';
            
            // Handle source/target references
            if (typeof link.source === 'string') {
                processedLink.source = nodeMap.get(link.source) || link.source;
            }
            
            if (typeof link.target === 'string') {
                processedLink.target = nodeMap.get(link.target) || link.target;
            }
            
            return processedLink;
        });
        
        return { nodes, links };
    }
    
    /**
     * Initialize D3 force simulation
     * @param {Object} data - Data with nodes and links
     */
    function createForceSimulation(data) {
        // Cleanup previous simulation
        if (simulation) {
            simulation.stop();
        }
        
        // Create new force simulation
        simulation = d3.forceSimulation(data.nodes)
            .force('link', d3.forceLink(data.links)
                .id(d => d.id)
                .distance(FORCE_CONSTANTS.DEFAULT_LINK_DISTANCE)
                .strength(FORCE_CONSTANTS.DEFAULT_LINK_STRENGTH))
            .force('charge', d3.forceManyBody()
                .strength(FORCE_CONSTANTS.DEFAULT_CHARGE))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide()
                .radius(FORCE_CONSTANTS.COLLISION_RADIUS))
            .on('tick', simulationTick);
        
        // Apply special layout forces based on config
        if (currentConfig.layout.orientation === 'vertical') {
            applyVerticalForces();
        } else if (currentConfig.layout.orientation === 'radial') {
            applyRadialForces();
        }
        
        // Create drag behavior
        dragHandler = d3.drag()
            .on('start', dragStarted)
            .on('drag', dragged)
            .on('end', dragEnded);
    }
    
    /**
     * Apply vertical tree-like forces to the simulation
     */
    function applyVerticalForces() {
        // Add Y-positioning force to create generations
        simulation.force('y', d3.forceY(d => {
            // Use generation for vertical positioning
            return height / 2 + (d.generation * currentConfig.layout.levelSpacing - 3 * currentConfig.layout.levelSpacing);
        }).strength(0.3));
        
        // Add X separation force to spread nodes horizontally
        simulation.force('x', d3.forceX(d => {
            return width / 2 + (Math.random() - 0.5) * 50; // Add slight randomness
        }).strength(0.1));
    }
    
    /**
     * Apply radial layout forces to the simulation
     */
    function applyRadialForces() {
        // Remove existing x/y forces
        simulation.force('x', null).force('y', null);
        
        // Add radial force to create concentric circles by generation
        simulation.force('radial', d3.forceRadial(
            d => 100 + d.generation * currentConfig.layout.levelSpacing,
            width / 2,
            height / 2
        ).strength(FORCE_CONSTANTS.RADIAL_SORT_STRENGTH));
    }
    
    /**
     * Render visualization elements
     * @param {Object} data - Data with nodes and links
     */
    function renderVisualization(data) {
        if (!svg) return;
        
        const g = svg.select('.zoom-layer');
        
        // Render links
        linkElements = g.select('.links')
            .selectAll('line')
            .data(data.links, d => d.id);
        
        linkElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('stroke-opacity', 0)
            .remove();
        
        const linkEnter = linkElements.enter()
            .append('line')
            .attr('stroke', d => getLinkStyle(d).stroke)
            .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
            .attr('stroke-dasharray', d => getLinkStyle(d).dasharray || null)
            .attr('stroke-opacity', 0)
            .attr('data-id', d => d.id)
            .attr('data-type', d => d.type)
            .attr('class', d => `link link-${d.type}`);
        
        linkElements = linkEnter.merge(linkElements);
        
        linkElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('stroke-opacity', 1);
        
        // Render nodes
        nodeElements = g.select('.nodes')
            .selectAll('circle')
            .data(data.nodes, d => d.id);
        
        nodeElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('r', 0)
            .remove();
        
        const nodeEnter = nodeElements.enter()
            .append('circle')
            .attr('r', 0)
            .attr('fill', d => getNodeStyle(d).color)
            .attr('data-id', d => d.id)
            .attr('data-type', d => d.type)
            .attr('class', d => `node node-${d.type}`)
            .attr('aria-label', d => `${d.name}, ${d.type}`)
            .on('mouseover', handleNodeMouseover)
            .on('mouseout', handleNodeMouseout)
            .on('click', handleNodeClick)
            .call(dragHandler);
        
        nodeElements = nodeEnter.merge(nodeElements);
        
        nodeElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('r', d => getNodeStyle(d).radius);
        
        // Render labels
        labelElements = g.select('.labels')
            .selectAll('text')
            .data(data.nodes, d => d.id);
        
        labelElements.exit().transition()
            .duration(currentConfig.transitionDuration / 2)
            .attr('opacity', 0)
            .remove();
        
        const labelEnter = labelElements.enter()
            .append('text')
            .attr('font-family', currentConfig.fontFamily)
            .attr('font-size', currentConfig.fontSize)
            .attr('fill', currentConfig.colors.text)
            .attr('text-anchor', 'middle')
            .attr('dy', d => getNodeStyle(d).radius + 15)
            .attr('opacity', 0)
            .attr('class', 'node-label')
            .text(d => d.name);
        
        labelElements = labelEnter.merge(labelElements);
        
        labelElements.transition()
            .duration(currentConfig.transitionDuration)
            .attr('opacity', 1);
        
        // Set simulation nodes and links
        simulation.nodes(data.nodes);
        simulation.force('link').links(data.links);
        
        // Restart simulation
        simulation.alpha(1).restart();
    }
    
    /**
     * Force simulation tick callback
     */
    function simulationTick() {
        if (!nodeElements || !linkElements || !labelElements) return;
        
        // Update links
        linkElements
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        // Update nodes
        nodeElements
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
        
        // Update labels
        labelElements
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    }
    
    /**
     * Handle node mouseover event
     * @param {Event} event - The DOM event
     * @param {Object} d - The node data
     */
    function handleNodeMouseover(event, d) {
        // Highlight node
        d3.select(this)
            .transition()
            .duration(200)
            .attr('r', getNodeStyle(d).radius * 1.2)
            .attr('stroke', currentConfig.colors.highlight)
            .attr('stroke-width', 2);
        
        // Show tooltip if not dragging
        if (!event.active) {
            tooltipDiv.transition()
                .duration(200)
                .style('opacity', 0.9);
                
            const tooltipContent = `
                <div class="tooltip-title">${d.name}</div>
                ${d.lineage ? `<div>Lineage: ${d.lineage}</div>` : ''}
                ${d.generation ? `<div>Generation: ${d.generation}</div>` : ''}
            `;
            
            tooltipDiv.html(tooltipContent)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        }
        
        // Call custom hover handler if provided
        if (currentConfig.eventHandlers.nodeHover) {
            currentConfig.eventHandlers.nodeHover(d.id);
        }
    }
    
    /**
     * Handle node mouseout event
     * @param {Event} event - The DOM event
     * @param {Object} d - The node data
     */
    function handleNodeMouseout(event, d) {
        // Reset node style
        d3.select(this)
            .transition()
            .duration(200)
            .attr('r', getNodeStyle(d).radius)
            .attr('stroke', null)
            .attr('stroke-width', 0);
        
        // Hide tooltip
        tooltipDiv.transition()
            .duration(500)
            .style('opacity', 0);
            
        // Call custom hover handler with null to indicate hover end
        if (currentConfig.eventHandlers.nodeHover) {
            currentConfig.eventHandlers.nodeHover(null);
        }
    }
    
    /**
     * Handle node click event
     * @param {Event} event - The DOM event
     * @param {Object} d - The node data
     */
    function handleNodeClick(event, d) {
        // Prevent event propagation
        event.stopPropagation();
        
        // Call custom click handler if provided
        if (currentConfig.eventHandlers.nodeClick) {
            currentConfig.eventHandlers.nodeClick(d.id);
        }
    }
    
    /**
     * Handle D3 zoom event
     * @param {Event} event - The zoom event
     */
    function handleZoom(event) {
        // Store current transform
        transform = event.transform;
        
        // Apply transform to visualization
        svg.select('.zoom-layer')
            .attr('transform', event.transform);
    }
    
    /**
     * Manually set zoom level
     * @param {number} level - The zoom level
     */
    function setZoom(level) {
        // Validate zoom level
        level = Math.max(0.1, Math.min(4, level));
        
        // Create new transform object
        const newTransform = d3.zoomIdentity
            .translate(transform.x, transform.y)
            .scale(level);
        
        // Apply new transform
        svg.transition()
            .duration(currentConfig.transitionDuration)
            .call(zoomHandler.transform, newTransform);
    }
    
    /**
     * Center view on specific node
     * @param {string} nodeId - ID of node to center on
     */
    function centerOnNode(nodeId) {
        if (!svg || !nodeId || !dataCache.nodes) return;
        
        // Find node in data
        const node = dataCache.nodes.find(n => n.id === nodeId);
        if (!node) return;
        
        // Calculate new transform
        const scale = transform.k; // Keep current zoom level
        const x = width / 2 - node.x * scale;
        const y = height / 2 - node.y * scale;
        
        // Create new transform
        const newTransform = d3.zoomIdentity
            .translate(x, y)
            .scale(scale);
        
        // Apply new transform with transition
        svg.transition()
            .duration(currentConfig.transitionDuration)
            .call(zoomHandler.transform, newTransform);
    }
    
    /**
     * Highlight connected elements for a node
     * @param {string} nodeId - ID of the node to highlight connections for
     */
    function highlightConnections(nodeId) {
        if (!svg || !nodeId || !dataCache.nodes) return;
        
        // Get connected nodes and links
        const connections = findConnections(nodeId);
        
        // Update nodes
        nodeElements.attr('opacity', d => 
            connections.has(d.id) ? 1 : 0.3
        );
        
        // Update links
        linkElements.attr('opacity', d => 
            connections.hasLink(d.id) ? 1 : 0.1
        );
        
        // Update labels
        labelElements.attr('opacity', d => 
            connections.has(d.id) ? 1 : 0.3
        );
    }
    
    /**
     * Find connections for a given node
     * @param {string} nodeId - ID of the node
     * @return {Object} Object with node and link connection data
     */
    function findConnections(nodeId) {
        if (!nodeId || !dataCache.nodes) {
            return { 
                has: () => false,
                hasLink: () => false
            };
        }
        
        // Node IDs directly connected to the target node
        const connectedNodeIds = new Set([nodeId]);
        
        // Link IDs connecting to the target node
        const connectedLinkIds = new Set();
        
        // Find direct connections in single pass
        dataCache.links.forEach(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            
            if (source === nodeId || target === nodeId) {
                connectedLinkIds.add(link.id);
                connectedNodeIds.add(source === nodeId ? target : source);
            }
        });
        
        // Optional: Find second-level connections (commented out for performance)
        /*
        const secondLevel = new Set([...connectedNodeIds]);
        secondLevel.delete(nodeId);
        
        secondLevel.forEach(id => {
            dataCache.links.forEach(link => {
                const source = typeof link.source === 'object' ? link.source.id : link.source;
                const target = typeof link.target === 'object' ? link.target.id : link.target;
                
                if (source === id || target === id) {
                    connectedLinkIds.add(link.id);
                    connectedNodeIds.add(source === id ? target : source);
                }
            });
        });
        */
        
        return {
            has: id => connectedNodeIds.has(id),
            hasLink: id => connectedLinkIds.has(id)
        };
    }
    
    /**
     * Reset view to initial state
     */
    function resetView() {
        // Reset zoom/pan
        svg.transition()
            .duration(currentConfig.transitionDuration)
            .call(zoomHandler.transform, d3.zoomIdentity);
        
        // Reset node highlighting
        nodeElements.attr('opacity', 1);
        linkElements.attr('opacity', 1);
        labelElements.attr('opacity', 1);
        
        // Reset simulation
        simulation.alpha(0.3).restart();
    }
    
    /**
     * Get style for a node based on its type
     * @param {Object} node - The node data
     * @return {Object} Style object for the node
     */
    function getNodeStyle(node) {
        const defaultStyle = { radius: 10, color: currentConfig.colors.node };
        
        if (!node.type || !currentConfig.nodeTypes[node.type]) {
            return defaultStyle;
        }
        
        return currentConfig.nodeTypes[node.type];
    }
    
    /**
     * Get style for a link based on its type
     * @param {Object} link - The link data
     * @return {Object} Style object for the link
     */
    function getLinkStyle(link) {
        const defaultStyle = { 
            stroke: currentConfig.colors.link, 
            strokeWidth: 1, 
            dasharray: null 
        };
        
        if (!link.type || !currentConfig.linkTypes[link.type]) {
            return defaultStyle;
        }
        
        return currentConfig.linkTypes[link.type];
    }
    
    /**
     * Drag start event handler
     * @param {Event} event - The drag event
     */
    function dragStarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        
        // Stop any tooltip from showing
        tooltipDiv.transition()
            .duration(50)
            .style('opacity', 0);
    }
    
    /**
     * Drag move event handler
     * @param {Event} event - The drag event
     */
    function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }
    
    /**
     * Drag end event handler
     * @param {Event} event - The drag event
     */
    function dragEnded(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        
        // Optionally keep node fixed or release it
        if (currentConfig.fixNodesOnDrag === false) {
            d.fx = null;
            d.fy = null;
        }
    }
    
    /**
     * Update view with new data or highlighting
     * @param {Object} data - The new data
     * @param {Object} viewConfig - Configuration for the view update
     */
    function updateView(data, viewConfig = {}) {
        // Update data if provided
        if (data && data.nodes && data.links) {
            updateData(data);
        }
        
        // Apply highlighting if node ID provided
        if (viewConfig.highlight) {
            highlightConnections(viewConfig.highlight);
        } else {
            // Reset highlighting
            nodeElements?.attr('opacity', 1);
            linkElements?.attr('opacity', 1);
            labelElements?.attr('opacity', 1);
        }
        
        // Update zoom if specified
        if (viewConfig.zoom && viewConfig.zoom !== transform.k) {
            setZoom(viewConfig.zoom);
        }
        
        // Center on node if specified
        if (viewConfig.centerNode) {
            centerOnNode(viewConfig.centerNode);
        }
    }
    
    /**
     * Update configuration settings
     * @param {Object} newConfig - New configuration options
     */
    function updateConfig(newConfig) {
        if (!newConfig) return;
        
        // Update current configuration
        currentConfig = deepMerge(currentConfig, newConfig);
        
        // Update visualization appearance
        if (nodeElements) {
            nodeElements
                .attr('fill', d => getNodeStyle(d).color)
                .transition()
                .duration(currentConfig.transitionDuration)
                .attr('r', d => getNodeStyle(d).radius);
        }
        
        if (linkElements) {
            linkElements
                .attr('stroke', d => getLinkStyle(d).stroke)
                .attr('stroke-width', d => getLinkStyle(d).strokeWidth)
                .attr('stroke-dasharray', d => getLinkStyle(d).dasharray || null);
        }
        
        if (labelElements) {
            labelElements
                .attr('font-family', currentConfig.fontFamily)
                .attr('font-size', currentConfig.fontSize)
                .attr('fill', currentConfig.colors.text);
        }
        
        // Update layout if needed
        if (newConfig.layout && newConfig.layout.orientation) {
            if (newConfig.layout.orientation === 'vertical') {
                applyVerticalForces();
            } else if (newConfig.layout.orientation === 'radial') {
                applyRadialForces();
            }
            
            // Restart simulation
            simulation.alpha(0.3).restart();
        }
    }
    
    // Public API
    return {
        createGenealogy,
        updateData,
        updateView,
        resetView,
        setZoom,
        centerOnNode,
        highlightConnections,
        updateConfig
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = D3Renderer;
}
