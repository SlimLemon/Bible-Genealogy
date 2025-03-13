/**
 * Biblical Genealogy Data Utilities
 * Processes, validates, and enriches genealogical data for visualization
 */
const GenealogyDataUtils = (function() {
    // Core relationship types used throughout the application
    const RELATIONSHIP_TYPES = {
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
    
    // Configuration with defaults
    const config = {
        dataSource: 'Genealogy-dataset.json',
        fallbackSource: '',
        useCache: true,
        fetchTimeout: 5000, // milliseconds
        defaultEra: 'unknown',
        generations: {
            startYear: -4000,
            yearSpan: 25
        },
        eras: [
            { id: 'antediluvian', name: 'Antediluvian Period', startYear: -4000, endYear: -2350 },
            { id: 'postdiluvian', name: 'Post-Flood Period', startYear: -2349, endYear: -2000 },
            { id: 'patriarchal', name: 'Patriarchal Period', startYear: -1999, endYear: -1500 },
            { id: 'exodus-conquest', name: 'Exodus & Conquest', startYear: -1499, endYear: -1100 },
            { id: 'judges-kings', name: 'Judges & Kings', startYear: -1099, endYear: -586 },
            { id: 'exile-return', name: 'Exile & Return', startYear: -585, endYear: -400 },
            { id: 'intertestamental', name: 'Intertestamental Period', startYear: -399, endYear: -5 },
            { id: 'new-testament', name: 'New Testament Era', startYear: -4, endYear: 100 }
        ],
        keyFigures: [
            'adam', 'noah', 'abraham', 'isaac', 'jacob', 'joseph', 'moses', 'joshua', 'samuel',
            'david', 'solomon', 'elijah', 'isaiah', 'jeremiah', 'ezekiel', 'daniel',
            'john_the_baptist', 'jesus', 'peter', 'paul', 'john'
        ],
        cacheKey: 'biblicalGenealogyData',
        errorLoggingEnabled: true,
        performanceMonitoring: true
    };

    // Error types for improved error handling
    const ERROR_TYPES = {
        VALIDATION: 'VALIDATION_ERROR',
        DATA_LOADING: 'DATA_LOADING_ERROR',
        PROCESSING: 'PROCESSING_ERROR',
        NOT_FOUND: 'NOT_FOUND_ERROR',
        RELATIONSHIP: 'RELATIONSHIP_ERROR',
        CONFIGURATION: 'CONFIGURATION_ERROR',
        EXPORT: 'EXPORT_ERROR'
    };

    // Performance tracking
    const perfMetrics = {
        startTimes: {},
        endTimes: {},
        durations: {}
    };

    /**
     * Start tracking performance for a named operation
     * @param {string} operationName - Name of operation to track
     */
    function startPerformanceTracking(operationName) {
        if (config.performanceMonitoring) {
            perfMetrics.startTimes[operationName] = performance.now();
        }
    }

    /**
     * End tracking performance for a named operation
     * @param {string} operationName - Name of operation to track
     * @returns {number} Duration in milliseconds
     */
    function endPerformanceTracking(operationName) {
        if (config.performanceMonitoring && perfMetrics.startTimes[operationName]) {
            perfMetrics.endTimes[operationName] = performance.now();
            perfMetrics.durations[operationName] = perfMetrics.endTimes[operationName] - perfMetrics.startTimes[operationName];
            console.log(`Performance: ${operationName} took ${perfMetrics.durations[operationName].toFixed(2)}ms`);
            return perfMetrics.durations[operationName];
        }
        return 0;
    }

    /**
     * Enhanced error handling system
     * @param {string} type - Error type from ERROR_TYPES
     * @param {string} message - Error message
     * @param {*} [data=null] - Additional error data
     * @returns {Object} Structured error object
     */
    function handleError(type, message, data = null) {
        const error = {
            type,
            message,
            timestamp: new Date().toISOString(),
            data
        };
        
        if (config.errorLoggingEnabled) {
            console.error(`${error.type}: ${error.message}`);
            
            // Store error in application error log if available
            if (typeof window !== 'undefined' && !window.genealogyErrorLog) {
                window.genealogyErrorLog = [];
            }
            
            if (typeof window !== 'undefined') {
                window.genealogyErrorLog.push(error);
            }
        }
        
        return error;
    }

    /**
     * Loads genealogy data from a file or URL
     * @param {string} [source=config.dataSource] - Data source path
     * @param {Object} [options={}] - Loading options
     * @returns {Promise<Object>} Promise resolving to genealogy data
     */
    async function loadGenealogyData(source = config.dataSource, options = {}) {
        startPerformanceTracking('loadGenealogyData');
        
        const opts = {
            useCache: config.useCache,
            timeout: config.fetchTimeout,
            ...options
        };
        
        // Check cache first if enabled
        if (opts.useCache && typeof localStorage !== 'undefined') {
            try {
                const cachedData = localStorage.getItem(config.cacheKey);
                if (cachedData) {
                    const data = JSON.parse(cachedData);
                    const cacheTimestamp = data._cacheTimestamp || 0;
                    const cacheAge = Date.now() - cacheTimestamp;
                    
                    // Use cache if it's less than 1 day old
                    if (cacheAge < 86400000) {
                        console.log('Using cached genealogy data');
                        endPerformanceTracking('loadGenealogyData');
                        return data;
                    }
                }
            } catch (error) {
                console.warn('Cache retrieval failed:', error);
            }
        }
        
        try {
            // Set up fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), opts.timeout);
            
            const response = await fetch(source, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
            }
            
            const rawData = await response.json();
            
            if (!isValidDataStructure(rawData)) {
                throw new Error('Invalid data structure');
            }
            
            // Process the data
            const processedData = processGenealogyData(rawData);
            
            // Cache the processed data if caching is enabled
            if (opts.useCache && typeof localStorage !== 'undefined') {
                try {
                    processedData._cacheTimestamp = Date.now();
                    localStorage.setItem(config.cacheKey, JSON.stringify(processedData));
                } catch (error) {
                    console.warn('Failed to cache data:', error);
                }
            }
            
            endPerformanceTracking('loadGenealogyData');
            return processedData;
        } catch (error) {
            const errorDetails = {
                source,
                options: opts,
                message: error.message
            };
            
            handleError(ERROR_TYPES.DATA_LOADING, `Failed to load genealogy data: ${error.message}`, errorDetails);
            
            // Try fallback source if available
            if (config.fallbackSource && source !== config.fallbackSource) {
                console.log(`Attempting to load from fallback source: ${config.fallbackSource}`);
                return loadGenealogyData(config.fallbackSource, options);
            }
            
            throw error;
        }
    }

    /**
     * Loads genealogy data from a file input element
     * @param {HTMLInputElement} fileInput - File input DOM element
     * @returns {Promise<Object>} Promise resolving to genealogy data
     */
    function loadGenealogyDataFromFileInput(fileInput) {
        return new Promise((resolve, reject) => {
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                reject(new Error("No file selected"));
                return;
            }
            
            const file = fileInput.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    
                    if (!isValidDataStructure(data)) {
                        reject(new Error("Invalid data structure"));
                        return;
                    }
                    
                    resolve(processGenealogyData(data));
                } catch (error) {
                    reject(new Error(`Failed to parse JSON: ${error.message}`));
                }
            };
            
            reader.onerror = () => {
                reject(new Error("Failed to read file"));
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * Process raw genealogy data into a format usable by the application
     * @param {Object} data - Raw genealogy data
     * @returns {Object} Processed genealogy data
     */
    function processGenealogyData(data) {
        startPerformanceTracking('processGenealogyData');
        
        try {
            // Make a deep copy to avoid modifying the original data
            const processedData = JSON.parse(JSON.stringify(data));
            
            // Validate the data structure
            if (!isValidDataStructure(processedData)) {
                throw new Error('Invalid data structure');
            }
            
            // Transform data structure if needed
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
            
            // Build relationship links if needed
            if (processedData.relationships && !processedData.links) {
                processedData.links = buildRelationships(processedData);
            }
            
            // Add indices for faster lookups
            processedData.indices = indexGenealogyData(processedData);
            
            // Add computed statistics
            processedData.statistics = computeStatistics(processedData);
            
            endPerformanceTracking('processGenealogyData');
            return processedData;
        } catch (error) {
            handleError(
                ERROR_TYPES.PROCESSING,
                `Error processing genealogy data: ${error.message}`,
                { error }
            );
            throw error;
        }
    }

    /**
     * Validates the data structure
     * @param {Object} data - The data to validate
     * @returns {boolean} - Whether the data is valid
     */
    function isValidDataStructure(data) {
        // Check if data is an object
        if (!data || typeof data !== 'object') {
            console.error('Data is not an object');
            return false;
        }
        
        // Check for people/nodes array
        if ((!data.people && !data.nodes) || 
            (data.people && !Array.isArray(data.people)) ||
            (data.nodes && !Array.isArray(data.nodes))) {
            console.error('Data must contain a people or nodes array');
            return false;
        }
        
        // Check for relationships/links array
        if ((!data.relationships && !data.links) ||
            (data.relationships && !Array.isArray(data.relationships)) ||
            (data.links && !Array.isArray(data.links))) {
            console.error('Data must contain a relationships or links array');
            return false;
        }
        
        return true;
    }

    /**
     * Creates indices for faster data lookups
     * @param {Object} data - Genealogy data
     * @returns {Object} Index objects
     */
    function indexGenealogyData(data) {
        const indices = {
            byId: {},
            byName: {},
            byEra: {},
            byGeneration: {},
            byTribe: {},
            bySignificance: {}
        };
        
        const nodes = data.nodes || data.people || [];
        
        // Build indices
        nodes.forEach(person => {
            // Index by ID
            indices.byId[person.id] = person;
            
            // Index by name (lowercase for case-insensitive lookup)
            const name = (person.fullName || person.name || '').toLowerCase();
            if (name) {
                if (!indices.byName[name]) {
                    indices.byName[name] = [];
                }
                indices.byName[name].push(person);
            }
            
            // Index by era
            const era = person.era || determineEra(person.birthYear);
            if (era) {
                if (!indices.byEra[era]) {
                    indices.byEra[era] = [];
                }
                indices.byEra[era].push(person);
            }
            
            // Index by generation
            const generation = person.generation || calculateGeneration(person.birthYear);
            if (generation) {
                if (!indices.byGeneration[generation]) {
                    indices.byGeneration[generation] = [];
                }
                indices.byGeneration[generation].push(person);
            }
            
            // Index by tribe
            if (person.tribe) {
                if (!indices.byTribe[person.tribe]) {
                    indices.byTribe[person.tribe] = [];
                }
                indices.byTribe[person.tribe].push(person);
            }
            
            // Index by significance
            if (person.significance) {
                if (!indices.bySignificance[person.significance]) {
                    indices.bySignificance[person.significance] = [];
                }
                indices.bySignificance[person.significance].push(person);
            }
        });
        
        return indices;
    }

    /**
     * Builds relationship links from relationship data
     * @param {Object} data - Genealogy data
     * @returns {Array} Array of relationship links
     */
    function buildRelationships(data) {
        const relationships = data.relationships || [];
        const links = [];
        
        relationships.forEach(rel => {
            if (!rel.from || !rel.to || !rel.type) {
                return;
            }
            
            links.push({
                source: rel.from,
                target: rel.to,
                type: rel.type,
                strength: getRelationshipStrength(rel.type),
                ...rel
            });
            
            // Add reciprocal relationship if needed
            if (rel.bidirectional) {
                links.push({
                    source: rel.to,
                    target: rel.from,
                    type: getReciprocalRelationship(rel.type),
                    strength: getRelationshipStrength(rel.type),
                    ...rel
                });
            }
        });
        
        return links;
    }

    /**
     * Gets the reciprocal relationship type
     * @param {string} relationshipType - Original relationship type
     * @returns {string} Reciprocal relationship type
     */
    function getReciprocalRelationship(relationshipType) {
        const reciprocals = {
            [RELATIONSHIP_TYPES.PARENT]: RELATIONSHIP_TYPES.CHILD,
            [RELATIONSHIP_TYPES.CHILD]: RELATIONSHIP_TYPES.PARENT,
            [RELATIONSHIP_TYPES.ANCESTOR]: RELATIONSHIP_TYPES.DESCENDANT,
            [RELATIONSHIP_TYPES.DESCENDANT]: RELATIONSHIP_TYPES.ANCESTOR,
            [RELATIONSHIP_TYPES.MENTOR]: RELATIONSHIP_TYPES.DISCIPLE,
            [RELATIONSHIP_TYPES.DISCIPLE]: RELATIONSHIP_TYPES.MENTOR,
            [RELATIONSHIP_TYPES.ALLY]: RELATIONSHIP_TYPES.ALLY,
            [RELATIONSHIP_TYPES.RIVAL]: RELATIONSHIP_TYPES.RIVAL,
            [RELATIONSHIP_TYPES.SPOUSE]: RELATIONSHIP_TYPES.SPOUSE,
            [RELATIONSHIP_TYPES.SIBLING]: RELATIONSHIP_TYPES.SIBLING,
            [RELATIONSHIP_TYPES.EXTENDED_FAMILY]: RELATIONSHIP_TYPES.EXTENDED_FAMILY
        };
        
        return reciprocals[relationshipType] || relationshipType;
    }

    /**
     * Gets the strength value for a relationship type
     * @param {string} relationshipType - Relationship type
     * @returns {number} Strength value (1-10)
     */
    function getRelationshipStrength(relationshipType) {
        const strengths = {
            [RELATIONSHIP_TYPES.PARENT]: 10,
            [RELATIONSHIP_TYPES.CHILD]: 10,
            [RELATIONSHIP_TYPES.SPOUSE]: 9,
            [RELATIONSHIP_TYPES.SIBLING]: 8,
            [RELATIONSHIP_TYPES.ANCESTOR]: 7,
            [RELATIONSHIP_TYPES.DESCENDANT]: 7,
            [RELATIONSHIP_TYPES.EXTENDED_FAMILY]: 5,
            [RELATIONSHIP_TYPES.MENTOR]: 6,
            [RELATIONSHIP_TYPES.DISCIPLE]: 6,
            [RELATIONSHIP_TYPES.ALLY]: 4,
            [RELATIONSHIP_TYPES.RIVAL]: 3
        };
        
        return strengths[relationshipType] || 1;
    }

    /**
     * Calculates the generation based on birth year
     * @param {number|string} birthYear - Birth year
     * @returns {number} Generation number
     */
    function calculateGeneration(birthYear) {
        if (birthYear === undefined || birthYear === null) {
            return 0;
        }
        
        const birthYearNum = parseInt(birthYear);
        if (isNaN(birthYearNum)) {
            return 0;
        }
        
        return Math.floor((birthYearNum - config.generations.startYear) / config.generations.yearSpan);
    }

    /**
     * Determines the era based on a year
     * @param {number|string} year - Year to check
     * @returns {string} Era identifier
     */
    function determineEra(year) {
        if (year === undefined || year === null) {
            return config.defaultEra;
        }
        
        const yearNum = parseInt(year);
        if (isNaN(yearNum)) {
            return config.defaultEra;
        }
        
        for (const era of config.eras) {
            if (yearNum >= era.startYear && yearNum <= era.endYear) {
                return era.id;
            }
        }
        
        return config.defaultEra;
    }

    /**
     * Checks if a person is a key biblical figure
     * @param {string} id - Person ID
     * @returns {boolean} Whether the person is a key figure
     */
    function isKeyBiblicalFigure(id) {
        return config.keyFigures.includes(id);
    }

    /**
     * Validates the structure of genealogy data
     * @param {Object} data - The genealogy data to validate
     * @returns {Object} - Validation result with valid flag and any errors
     */
    function validateGenealogyData(data) {
        const errors = [];
        
        // Check that data is an object
        if (!data || typeof data !== 'object') {
            return { valid: false, errors: ['Data must be a valid object'] };
        }
        
        // Check for essential arrays
        if (!data.people && !data.nodes) {
            errors.push('Missing people or nodes array');
        } else {
            const peopleArray = data.people || data.nodes;
            if (!Array.isArray(peopleArray)) {
                errors.push('People or nodes must be an array');
            } else {
                // Check each person
                peopleArray.forEach((person, index) => {
                    if (!person.id) {
                        errors.push(`Person at index ${index} is missing an id`);
                    }
                    if (!person.name && !person.fullName) {
                        errors.push(`Person at index ${index} (id: ${person.id || 'unknown'}) is missing a name`);
                    }
                });
            }
        }
        
        if (!data.relationships && !data.links) {
            errors.push('Missing relationships or links array');
        } else {
            const relationshipsArray = data.relationships || data.links;
            if (!Array.isArray(relationshipsArray)) {
                errors.push('Relationships or links must be an array');
            } else {
                // Check each relationship
                relationshipsArray.forEach((rel, index) => {
                    if (!rel.from && !rel.source) {
                        errors.push(`Relationship at index ${index} is missing from/source`);
                    }
                    if (!rel.to && !rel.target) {
                        errors.push(`Relationship at index ${index} is missing to/target`);
                    }
                    if (!rel.type) {
                        errors.push(`Relationship at index ${index} is missing type`);
                    }
                });
            }
        }
        
        return { valid: errors.length === 0, errors };
    }

    /**
     * Enriches a genealogy dataset with computed fields
     * @param {Object} data - The genealogy data to enrich
     * @returns {Object} - The enriched data
     */
    function enrichDataset(data) {
        if (!data || !data.people) {
            console.error("Invalid data provided to enrichDataset");
            return data;
        }
        
        // Clone data to avoid modifying original
        const enriched = JSON.parse(JSON.stringify(data));
        
        // Add computed fields to people
        enriched.people.forEach(person => {
            // Calculate age if birth and death years are available
            if (person.birthYear && person.deathYear) {
                person.age = parseInt(person.deathYear) - parseInt(person.birthYear);
            }
            
            // Set era based on birth year
            if (!person.era && person.birthYear) {
                person.era = determineEra(person.birthYear);
            }
            
            // Set generation based on birth year
            if (!person.generation && person.birthYear) {
                person.generation = calculateGeneration(person.birthYear);
            }
            
            // Flag key figures
            if (!person.isKeyFigure) {
                person.isKeyFigure = isKeyBiblicalFigure(person.id);
            }
        });
        
        return enriched;
    }

    /**
     * Finds a relationship path between two people
     * @param {Object} data - Genealogy data
     * @param {string} fromId - Starting person ID
     * @param {string} toId - Target person ID
     * @param {Object} options - Search options
     * @returns {Object|null} Path object or null if no path exists
     */
    function findRelationshipPath(data, fromId, toId, options = {}) {
        const defaultOptions = {
            maxDepth: 10,
            excludeTypes: []
        };
        
        const opts = { ...defaultOptions, ...options };
        
        if (!data || !data.links || !Array.isArray(data.links)) {
            return null;
        }
        
        // Check if IDs exist
        const nodes = data.nodes || data.people || [];
        const nodeMap = {};
        
        nodes.forEach(node => {
            nodeMap[node.id] = node;
        });
        
        if (!nodeMap[fromId] || !nodeMap[toId]) {
            return null;
        }
        
        // Breadth-first search for shortest path
        const queue = [{ id: fromId, path: [], visited: new Set([fromId]) }];
        
        while (queue.length > 0) {
            const { id, path, visited } = queue.shift();
            
            // Don't exceed max depth
            if (path.length >= opts.maxDepth) {
                continue;
            }
            
            // Find all direct connections
            const connections = data.links.filter(link => {
                const sourceId = link.source.id || link.source;
                const targetId = link.target.id || link.target;
                
                return (
                    (sourceId === id || targetId === id) && 
                    !opts.excludeTypes.includes(link.type)
                );
            });
            
            for (const connection of connections) {
                const sourceId = connection.source.id || connection.source;
                const targetId = connection.target.id || connection.target;
                const nextId = sourceId === id ? targetId : sourceId;
                
                if (visited.has(nextId)) {
                    continue;
                }
                
                const newPath = [...path, {
                    from: sourceId,
                    to: targetId,
                    type: connection.type,
                    relationship: connection
                }];
                
                if (nextId === toId) {
                    // Found path
                    return {
                        path: newPath,
                        length: newPath.length,
                        fromPerson: nodeMap[fromId],
                        toPerson: nodeMap[toId],
                        description: describeRelationship(newPath, nodeMap)
                    };
                }
                
                const newVisited = new Set(visited);
                newVisited.add(nextId);
                
                queue.push({
                    id: nextId,
                    path: newPath,
                    visited: newVisited
                });
            }
        }
        
        return null;
    }

    /**
     * Generates a human-readable description of a relationship path
     * @param {Array} path - Relationship path
     * @param {Object} nodeMap - Map of nodes by ID
     * @returns {string} Relationship description
     */
    function describeRelationship(path, nodeMap) {
        if (!path || path.length === 0) {
            return "No relationship found";
        }
        
        if (path.length === 1) {
            const rel = path[0];
            const fromPerson = nodeMap[rel.from];
            const toPerson = nodeMap[rel.to];
            
            switch (rel.type) {
                case RELATIONSHIP_TYPES.PARENT:
                    return `${fromPerson.name} is the parent of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.CHILD:
                    return `${fromPerson.name} is the child of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.SPOUSE:
                    return `${fromPerson.name} is the spouse of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.SIBLING:
                    return `${fromPerson.name} is the sibling of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.ANCESTOR:
                    return `${fromPerson.name} is an ancestor of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.DESCENDANT:
                    return `${fromPerson.name} is a descendant of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.MENTOR:
                    return `${fromPerson.name} is a mentor of ${toPerson.name}`;
                case RELATIONSHIP_TYPES.DISCIPLE:
                    return `${fromPerson.name} is a disciple of ${toPerson.name}`;
                default:
                    return `${fromPerson.name} is ${rel.type} to ${toPerson.name}`;
            }
        }
        
        // Complex relationship
        const fromPerson = nodeMap[path[0].from];
        const toPerson = nodeMap[path[path.length - 1].to];
        
        let description = `${fromPerson.name} is connected to ${toPerson.name} through ${path.length} relationships: `;
        
        path.forEach((rel, index) => {
            const fromName = nodeMap[rel.from].name;
            const toName = nodeMap[rel.to].name;
            
            description += `${fromName} (${rel.type}) ${toName}`;
            
            if (index < path.length - 1) {
                description += " → ";
            }
        });
        
        return description;
    }

    /**
     * Generates color scheme for data categories
     * @param {Array} categories - Array of category names
     * @param {Object} options - Color options
     * @returns {Object} Map of categories to colors
     */
    function generateCategoryColors(categories, options = {}) {
        const colorSchemes = {
            standard: [
                '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
                '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
            ],
            pastel: [
                '#c6dbef', '#fdd0a2', '#c7e9c0', '#fcbba1', '#dadaeb',
                '#e6d8c9', '#fde0ef', '#d9d9d9', '#ffffcc', '#ccffff'
            ],
            biblical: [
                '#CD853F', '#8B4513', '#BC8F8F', '#F4A460', '#DAA520',
                '#B8860B', '#D2B48C', '#BDB76B', '#6B8E23', '#556B2F'
            ]
        };
        
        const opts = {
            scheme: 'biblical',
            shuffle: false,
            ...options
        };
        
        const colors = colorSchemes[opts.scheme] || colorSchemes.standard;
        
        // Shuffle colors if requested
        if (opts.shuffle) {
            for (let i = colors.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [colors[i], colors[j]] = [colors[j], colors[i]];
            }
        }
        
        // Create color mapping
        const colorMap = {};
        categories.forEach((category, index) => {
            colorMap[category] = colors[index % colors.length];
        });
        
        return colorMap;
    }

    /**
     * Creates a subgraph from the main genealogy data
     * @param {Object} data - Original genealogy data
     * @param {Array} centerIds - IDs of central people for the subgraph
     * @param {Object} options - Filtering options
     * @returns {Object} Filtered subgraph
     */
    function createSubgraph(data, centerIds, options = {}) {
        const defaultOptions = {
            depth: 2,
            includeTypes: Object.values(RELATIONSHIP_TYPES),
            exclusions: [],
            includePropertiesFilter: null
        };
        
        const opts = { ...defaultOptions, ...options };
        
        // Validate inputs
        if (!data || !data.nodes || !data.links || !Array.isArray(centerIds) || centerIds.length === 0) {
            return null;
        }
        
        // Find nodes within desired depth
        const includedNodeIds = new Set(centerIds);
        const nodeMap = {};
        
        data.nodes.forEach(node => {
            nodeMap[node.id] = node;
        });
        
        // BFS to find all nodes within depth
        let frontier = [...centerIds];
        
        for (let currentDepth = 1; currentDepth <= opts.depth; currentDepth++) {
            const nextFrontier = [];
            
            for (const nodeId of frontier) {
                const connections = data.links.filter(link => {
                    const sourceId = link.source.id || link.source;
                    const targetId = link.target.id || link.target;
                    
                    return (
                        (sourceId === nodeId || targetId === nodeId) &&
                        opts.includeTypes.includes(link.type) &&
                        !opts.exclusions.includes(sourceId) &&
                        !opts.exclusions.includes(targetId)
                    );
                });
                
                for (const connection of connections) {
                    const sourceId = connection.source.id || connection.source;
                    const targetId = connection.target.id || connection.target;
                    const connectedId = sourceId === nodeId ? targetId : sourceId;
                    
                    if (!includedNodeIds.has(connectedId) && !opts.exclusions.includes(connectedId)) {
                        includedNodeIds.add(connectedId);
                        nextFrontier.push(connectedId);
                    }
                }
            }
            
            frontier = nextFrontier;
        }
        
        // Filter nodes and links
        const filteredNodes = data.nodes.filter(node => {
            if (!includedNodeIds.has(node.id)) {
                return false;
            }
            
            if (opts.includePropertiesFilter && typeof opts.includePropertiesFilter === 'function') {
                return opts.includePropertiesFilter(node);
            }
            
            return true;
        });
        
        const filteredLinks = data.links.filter(link => {
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            
            return (
                includedNodeIds.has(sourceId) &&
                includedNodeIds.has(targetId) &&
                opts.includeTypes.includes(link.type)
            );
        });
        
        return {
            nodes: filteredNodes,
            links: filteredLinks,
            centerIds: centerIds,
            metadata: {
                filteredFrom: data.metadata || {},
                filterOptions: opts,
                nodeCount: filteredNodes.length,
                linkCount: filteredLinks.length
            }
        };
    }

    /**
     * Determines the era based on a year
     * @param {number} year - Year to check
     * @returns {string} Era ID
     */
    function determineEra(year) {
        const numYear = parseInt(year);
        
        if (isNaN(numYear)) {
            return config.defaultEra;
        }
        
        for (const era of config.eras) {
            if (numYear >= era.startYear && numYear <= era.endYear) {
                return era.id;
            }
        }
        
        return config.defaultEra;
    }

    /**
     * Calculate generation based on birth year
     * @param {number} birthYear - Year of birth
     * @returns {number} Generation number
     */
    function calculateGeneration(birthYear) {
        const numYear = parseInt(birthYear);
        
        if (isNaN(numYear)) {
            return 0;
        }
        
        const yearsSinceStart = numYear - config.generations.startYear;
        return Math.floor(yearsSinceStart / config.generations.yearSpan);
    }

    /**
     * Checks if a person is a key biblical figure
     * @param {string} id - Person ID
     * @returns {boolean} True if key figure
     */
    function isKeyBiblicalFigure(id) {
        return config.keyFigures.includes(id.toLowerCase());
    }

    /**
     * Computes statistics about a genealogy dataset
     * @param {Object} data - The genealogy data
     * @returns {Object} Statistics about the dataset
     */
    function computeStatistics(data) {
        if (!data || !data.nodes || !data.links) {
            console.error("Invalid data provided to computeStatistics");
            return {};
        }
        
        const stats = {
            nodeCount: data.nodes.length,
            linkCount: data.links.length,
            generations: new Set(),
            eras: new Set(),
            types: new Set(),
            relationshipTypes: new Set(),
            avgConnections: 0,
            keyFigures: 0,
            connectivityDensity: 0,
            longestLife: { age: 0, person: null },
            mostConnected: { connections: 0, person: null }
        };
        
        // Node-based statistics
        const connectionCounts = {};
        
        data.nodes.forEach(node => {
            if (node.generation) {
                stats.generations.add(node.generation);
            }
            
            if (node.era) {
                stats.eras.add(node.era);
            }
            
            if (node.type) {
                stats.types.add(node.type);
            }
            
            if (isKeyBiblicalFigure(node.id)) {
                stats.keyFigures++;
            }
            
            if (node.birthYear && node.deathYear) {
                const age = parseInt(node.deathYear) - parseInt(node.birthYear);
                if (age > stats.longestLife.age) {
                    stats.longestLife = { age, person: node };
                }
            }
            
            connectionCounts[node.id] = 0;
        });
        
        // Link-based statistics
        data.links.forEach(link => {
            if (link.type) {
                stats.relationshipTypes.add(link.type);
            }
            
            const sourceId = link.source.id || link.source;
            const targetId = link.target.id || link.target;
            
            connectionCounts[sourceId] = (connectionCounts[sourceId] || 0) + 1;
            connectionCounts[targetId] = (connectionCounts[targetId] || 0) + 1;
        });
        
        // Compute derived statistics
        let totalConnections = 0;
        
        Object.keys(connectionCounts).forEach(id => {
            const count = connectionCounts[id];
            totalConnections += count;
            
            if (count > stats.mostConnected.connections) {
                stats.mostConnected = {
                    connections: count,
                    person: data.nodes.find(node => node.id === id)
                };
            }
        });
        
        stats.avgConnections = totalConnections / data.nodes.length;
        stats.connectivityDensity = data.links.length / (data.nodes.length * (data.nodes.length - 1) / 2);
        
        // Convert sets to arrays for easier use
        stats.generations = Array.from(stats.generations).sort((a, b) => a - b);
        stats.eras = Array.from(stats.eras);
        stats.types = Array.from(stats.types);
        stats.relationshipTypes = Array.from(stats.relationshipTypes);
        
        return stats;
    }

    /**
     * Transforms data between different genealogy formats
     * @param {Object} data - Source data
     * @param {string} targetFormat - Target format ('d3', 'gedcom', 'gramps', 'custom')
     * @returns {Object} Transformed data
     */
    function transformGenealogyData(data, targetFormat = 'd3') {
        if (!data) {
            return null;
        }
        
        switch (targetFormat.toLowerCase()) {
            case 'd3':
                return transformToD3Format(data);
            case 'gedcom':
                return transformToGedcomFormat(data);
            case 'gramps':
                return transformToGrampsFormat(data);
            case 'custom':
                return transformToCustomFormat(data);
            default:
                return data;
        }
    }

    /**
     * Transform data to D3.js format
     * @param {Object} data - Source data
     * @returns {Object} D3 formatted data
     */
    function transformToD3Format(data) {
        if (!data) return null;
        
        // If already in D3 format (nodes/links)
        if (data.nodes && data.links) {
            return JSON.parse(JSON.stringify(data));
        }
        
        // Convert from people/relationships format
        if (data.people && data.relationships) {
            return {
                nodes: data.people.map(person => ({
                    id: person.id,
                    name: person.name || person.fullName,
                    group: person.type || person.group || 1,
                    ...person
                })),
                links: data.relationships.map(rel => ({
                    source: rel.from || rel.source,
                    target: rel.to || rel.target,
                    type: rel.type,
                    value: rel.strength || 1,
                    ...rel
                }))
            };
        }
        
        return null;
    }

    /**
     * Transform to GEDCOM format (simplified)
     * @param {Object} data - Source data
     * @returns {string} GEDCOM formatted data
     */
    function transformToGedcomFormat(data) {
        if (!data || (!data.nodes && !data.people)) {
            return '';
        }
        
        const people = data.people || data.nodes;
        const relationships = data.relationships || data.links;
        
        let gedcom = "0 HEAD\n1 GEDC\n2 VERS 5.5.1\n1 CHAR UTF-8\n0 @SUBM@ SUBM\n1 NAME Biblical Genealogy Exporter\n";
        
        // Add people
        people.forEach(person => {
            gedcom += `0 @${person.id}@ INDI\n`;
            gedcom += `1 NAME ${person.name || person.fullName || 'Unknown'}\n`;
            
            if (person.birthYear) {
                gedcom += "1 BIRT\n2 DATE " + person.birthYear + "\n";
            }
            
            if (person.deathYear) {
                gedcom += "1 DEAT\n2 DATE " + person.deathYear + "\n";
            }
            
            if (person.gender) {
                gedcom += `1 SEX ${person.gender.charAt(0)}\n`;
            }
            
            if (person.description) {
                gedcom += `1 NOTE ${person.description}\n`;
            }
        });
        
        // Add families
        let familyCount = 1;
        const familyMap = {};
        
        relationships.forEach(rel => {
            if (rel.type === 'spouse') {
                const sourceId = rel.source || rel.from;
                const targetId = rel.target || rel.to;
                
                const famId = `F${familyCount++}`;
                familyMap[famId] = { husb: null, wife: null, children: [] };
                
                const sourcePerson = people.find(p => p.id === sourceId);
                const targetPerson = people.find(p => p.id === targetId);
                
                if (sourcePerson && targetPerson) {
                    const sourceGender = sourcePerson.gender || '';
                    const targetGender = targetPerson.gender || '';
                    
                    if (sourceGender.toLowerCase().startsWith('m')) {
                        familyMap[famId].husb = sourceId;
                        familyMap[famId].wife = targetId;
                    } else {
                        familyMap[famId].husb = targetId;
                        familyMap[famId].wife = sourceId;
                    }
                    
                    gedcom += `0 @${famId}@ FAM\n`;
                    gedcom += `1 HUSB @${familyMap[famId].husb}@\n`;
                    gedcom += `1 WIFE @${familyMap[famId].wife}@\n`;
                }
            }
        });
        
        // Add parent-child relationships
        relationships.forEach(rel => {
            if (rel.type === 'parent' || rel.type === 'child') {
                const parentId = rel.type === 'parent' ? rel.source || rel.from : rel.target || rel.to;
                const childId = rel.type === 'parent' ? rel.target || rel.to : rel.source || rel.from;
                
                // Find family for this parent
                let familyId = null;
                
                Object.keys(familyMap).forEach(famId => {
                    if (familyMap[famId].husb === parentId || familyMap[famId].wife === parentId) {
                        familyId = famId;
                        if (!familyMap[famId].children.includes(childId)) {
                            familyMap[famId].children.push(childId);
                        }
                    }
                });
                
                // Create new family if none exists
                if (!familyId) {
                    familyId = `F${familyCount++}`;
                    
                    const parentPerson = people.find(p => p.id === parentId);
                    
                    if (parentPerson) {
                        const parentGender = (parentPerson.gender || '').toLowerCase().startsWith('m');
                        
                        familyMap[familyId] = {
                            husb: parentGender ? parentId : null,
                            wife: parentGender ? null : parentId,
                            children: [childId]
                        };
                        
                        gedcom += `0 @${familyId}@ FAM\n`;
                        
                        if (parentGender) {
                            gedcom += `1 HUSB @${parentId}@\n`;
                        } else {
                            gedcom += `1 WIFE @${parentId}@\n`;
                        }
                    }
                }
                
                // Add reference to individual record
                const personIndex = people.findIndex(p => p.id === childId);
                if (personIndex >= 0) {
                    gedcom += `1 CHIL @${childId}@\n`;
                }
            }
        });
        
        gedcom += "0 TRLR\n";
        return gedcom;
    }

    /**
     * Export genealogy data to various formats
     * @param {Object} data - Data to export
     * @param {string} format - Export format ('json', 'csv', 'gedcom')
     * @returns {string} Exported data
     */
    function exportGenealogyData(data, format = 'json') {
        if (!data) {
            return '';
        }
        
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(data, null, 2);
            
            case 'csv':
                return exportToCSV(data);
            
            case 'gedcom':
                return transformToGedcomFormat(data);
            
            default:
                return JSON.stringify(data);
        }
    }

    /**
     * Export data to CSV format
     * @param {Object} data - Data to export
     * @returns {string} CSV string
     */
    function exportToCSV(data) {
        if (!data || (!data.nodes && !data.people)) {
            return '';
        }
        
        const people = data.people || data.nodes;
        const relationships = data.relationships || data.links;
        
        // People CSV
        let peopleCSV = 'id,name,birth_year,death_year,gender,type,era,generation\n';
        
        people.forEach(person => {
            peopleCSV += [
                person.id,
                `"${(person.name || person.fullName || '').replace(/"/g, '""')}"`,
                person.birthYear || '',
                person.deathYear || '',
                person.gender || '',
                person.type || '',
                person.era || '',
                person.generation || ''
            ].join(',') + '\n';
        });
        
        // Relationships CSV
        let relCSV = 'source,target,type,description\n';
        
        relationships.forEach(rel => {
            relCSV += [
                rel.source || rel.from,
                rel.target || rel.to,
                rel.type || '',
                `"${(rel.description || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });
        
        return {
            people: peopleCSV,
            relationships: relCSV
        };
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
        
        const stats = computeStatistics(data);
        
        console.log('Dataset Analysis:');
        console.log(`Nodes: ${stats.nodeCount}, Links: ${stats.linkCount}`);
        console.log(`Generations: ${stats.generations.length}, Eras: ${stats.eras.length}`);
        console.log(`Relationship Types: ${Array.from(stats.relationshipTypes).join(', ')}`);
        console.log(`Key Biblical Figures: ${stats.keyFigures}`);
        
        if (stats.longestLife.person) {
            console.log(`Longest life: ${stats.longestLife.person.name} (${stats.longestLife.age} years)`);
        }
        
        if (stats.mostConnected.person) {
            console.log(`Most connected: ${stats.mostConnected.person.name} (${stats.mostConnected.connections} connections)`);
        }
        
        return stats;
    }

    /**
     * Gets a fallback dataset for cases where data loading fails
     * @returns {Object} - A minimal fallback dataset
     */
    function getFallbackData() {
        console.log('Providing minimal fallback dataset');
        
        return {
            nodes: [
                { id: 'adam', name: 'Adam', gender: 'male', birthYear: -4000, deathYear: -3070, type: 'patriarch', era: 'antediluvian', generation: 1 },
                { id: 'eve', name: 'Eve', gender: 'female', birthYear: -4000, deathYear: -3070, type: 'matriarch', era: 'antediluvian', generation: 1 },
                { id: 'cain', name: 'Cain', gender: 'male', birthYear: -3970, deathYear: -3000, type: 'firstborn', era: 'antediluvian', generation: 2 },
                { id: 'abel', name: 'Abel', gender: 'male', birthYear: -3968, deathYear: -3950, type: 'victim', era: 'antediluvian', generation: 2 },
                { id: 'seth', name: 'Seth', gender: 'male', birthYear: -3870, deathYear: -2958, type: 'patriarch', era: 'antediluvian', generation: 2 }
            ],
            links: [
                { source: 'adam', target: 'eve', type: 'spouse' },
                { source: 'adam', target: 'cain', type: 'parent' },
                { source: 'eve', target: 'cain', type: 'parent' },
                { source: 'adam', target: 'abel', type: 'parent' },
                { source: 'eve', target: 'abel', type: 'parent' },
                { source: 'adam', target: 'seth', type: 'parent' },
                { source: 'eve', target: 'seth', type: 'parent' },
                { source: 'cain', target: 'abel', type: 'sibling' },
                { source: 'cain', target: 'seth', type: 'sibling' },
                { source: 'abel', target: 'seth', type: 'sibling' }
            ],
            metadata: {
                title: 'Minimal Biblical Genealogy',
                description: 'A minimal dataset of the first biblical family',
                source: 'Genesis 4-5',
                createdAt: new Date().toISOString(),
                isFallback: true
            }
        };
    }

    /**
     * Check if data structure is valid for genealogy operations
     * @param {Object} data - Data to validate
     * @returns {boolean} Whether data is valid
     */
    function isValidDataStructure(data) {
        // Must have nodes/people and links/relationships
        if (!data) return false;
        
        // Check for nodes array (d3 format)
        if (data.nodes && Array.isArray(data.nodes) && data.links && Array.isArray(data.links)) {
            return true;
        }
        
        // Check for people array (custom format)
        if (data.people && Array.isArray(data.people) && data.relationships && Array.isArray(data.relationships)) {
            return true;
        }
        
        return false;
    }

    // Initialize module
    function init() {
        console.log('Biblical Genealogy Data Utilities initialized');
        
        // Expose public methods
        return {
            RELATIONSHIP_TYPES,
            loadGenealogyData,
            loadGenealogyDataFromFileInput,
            validateGenealogyData,
            processGenealogyData,
            enrichDataset,
            findRelationshipPath,
            describeRelationship,
            generateCategoryColors,
            createSubgraph,
            computeStatistics,
            transformGenealogyData,
            exportGenealogyData,
            analyzeDataset,
            getFallbackData
        };
    }

    // Return public API
    return init();
})();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = GenealogyDataUtils;
} else if (typeof define === 'function' && define.amd) {
    // AMD environment
    define([], function() {
        return GenealogyDataUtils;
    });
} else if (typeof window !== 'undefined') {
    // Browser environment
    window.GenealogyDataUtils = GenealogyDataUtils;
}
 
