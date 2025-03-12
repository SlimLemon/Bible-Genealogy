/**
 * Biblical Genealogy Data Utilities
 * Processes, validates, and enriches genealogical data for visualization
 */
const GenealogyDataUtils = (function() {
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
            'adam', 'noah', 'abraham', 'isaac', 'jacob', 'joseph', 
            'moses', 'joshua', 'samuel', 'david', 'solomon', 'elijah', 
            'isaiah', 'jeremiah', 'ezekiel', 'daniel', 'john_the_baptist', 'jesus',
            'peter', 'paul', 'john'
        ]
    };

    // Cache for storing data at different processing stages
    const dataCache = {
        raw: null,
        processed: null,
        enriched: null
    };

    /**
     * Loads genealogy data from the specified source
     * @param {string} source - The data source URL
     * @returns {Promise<Object>} - The loaded data
     */
    async function loadGenealogyData(source = config.dataSource) {
        // If we have cached data and caching is enabled, return it
        if (config.useCache && dataCache.raw !== null) {
            console.log('Returning cached raw data');
            return dataCache.raw;
        }
        
        console.log(`Loading genealogy data from: ${source}`);
        
        try {
            // Create a promise that will reject when the timeout is reached
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Data loading timed out')), config.fetchTimeout);
            });
            
            // Fetch data with timeout
            const response = await Promise.race([
                fetch(source),
                timeoutPromise
            ]);
            
            if (!response.ok) {
                throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            
            // Validate the data structure
            if (!isValidDataStructure(data)) {
                throw new Error('Invalid data structure');
            }
            
            // Cache the raw data
            dataCache.raw = data;
            
            console.log('Data loaded successfully');
            return data;
        } catch (error) {
            console.error('Error loading genealogy data:', error);
            
            // Try fallback source if available and different from original source
            if (config.fallbackSource && config.fallbackSource !== source) {
                console.log(`Attempting to load from fallback source: ${config.fallbackSource}`);
                return loadGenealogyData(config.fallbackSource);
            }
            
            // Use fallback data as last resort
            console.log('Using fallback data');
            return getFallbackData();
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
        
        // Check if nodes array exists
        if (!Array.isArray(data.nodes)) {
            console.error('Nodes array is missing');
            return false;
        }
        
        // Check if all nodes have an id and name
        const validNodes = data.nodes.every(node => {
            const isValid = node.id && node.name;
            if (!isValid) {
                console.error('Node missing required fields:', node);
            }
            return isValid;
        });
        
        if (!validNodes) {
            return false;
        }
        
        // Check if relationships array exists
        if (!data.relationships) {
            console.warn('Relationships array is missing, will be generated');
            // Not a critical error, we can generate relationships
        } else if (Array.isArray(data.relationships)) {
            // Check if all relationships have source and target
            const validRelationships = data.relationships.every(rel => {
                const isValid = rel.source && rel.target && rel.type;
                if (!isValid) {
                    console.error('Relationship missing required fields:', rel);
                }
                return isValid;
            });
            
            if (!validRelationships) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Builds relationships array from node data if missing
     * @param {Array} nodes - The nodes array
     * @returns {Array} - The relationships array
     */
    function buildRelationships(nodes) {
        const relationships = [];
        
        nodes.forEach(node => {
            // Add parent-child relationships
            if (node.parents && Array.isArray(node.parents)) {
                node.parents.forEach(parentId => {
                    relationships.push({
                        source: parentId,
                        target: node.id,
                        type: 'parental'
                    });
                });
            }
            
            // Add spousal relationships
            if (node.spouse) {
                // Check if this spousal relationship already exists
                const existingRelationship = relationships.find(rel => 
                    (rel.source === node.id && rel.target === node.spouse) || 
                    (rel.source === node.spouse && rel.target === node.id)
                );
                
                if (!existingRelationship) {
                    relationships.push({
                        source: node.id,
                        target: node.spouse,
                        type: 'spousal'
                    });
                }
            }
        });
        
        return relationships;
    }

    /**
     * Calculates the generation number for a node
     * @param {Object} node - The node to calculate for
     * @param {Array} allNodes - All nodes in the dataset
     * @returns {number} - The calculated generation
     */
    function calculateGeneration(node, allNodes) {
        // If node has birthYear, calculate based on that
        if (node.birthYear) {
            return Math.floor((node.birthYear - config.generations.startYear) / config.generations.yearSpan);
        }
        
        // If node has parents, use parent's generation + 1
        if (node.parents && node.parents.length > 0) {
            const parentNode = allNodes.find(n => n.id === node.parents[0]);
            if (parentNode && parentNode.generation !== undefined) {
                return parentNode.generation + 1;
            }
        }
        
        // Default to 0 if we can't determine
        return 0;
    }

    /**
     * Determines the biblical era for a node based on birth or death year
     * @param {Object} node - The node to calculate for
     * @returns {string} - The biblical era
     */
    function determineEra(node) {
        // Use birth year if available, otherwise death year
        const year = node.birthYear || node.deathYear;
        
        if (!year) {
            return config.defaultEra;
        }
        
        // Find the era that contains this year
        const era = config.eras.find(era => year >= era.startYear && year <= era.endYear);
        
        return era ? era.id : config.defaultEra;
    }

    /**
     * Checks if a person is a key biblical figure
     * @param {Object} node - The node to check
     * @returns {boolean} - Whether the person is a key figure
     */
    function isKeyBiblicalFigure(node) {
        // If the node already has isKeyFigure set, use that
        if (node.isKeyFigure !== undefined) {
            return node.isKeyFigure;
        }
        
        // Check if the node's ID is in the key figures list
        return config.keyFigures.includes(node.id);
    }

    /**
     * Enriches the dataset with additional calculated properties
     * @param {Object} data - The raw data to enrich
     * @returns {Object} - The enriched data
     */
    function enrichDataset(data) {
        if (!isValidDataStructure(data)) {
            throw new Error('Invalid data structure for enrichment');
        }
        
        // Process nodes to add calculated properties
        data.nodes = data.nodes.map(node => {
            // Add calculated age if birth and death years are available
            if (node.birthYear && node.deathYear) {
                node.age = Math.abs(node.deathYear - node.birthYear);
            }
            
            // Add generation information
            node.generation = calculateGeneration(node, data.nodes);
            
            // Determine biblical era
            node.era = determineEra(node);
            
            // Flag key biblical figures
            node.isKeyFigure = isKeyBiblicalFigure(node);
            
            return node;
        });
        
        // Add any missing relationships
        if (!data.relationships) {
            data.relationships = buildRelationships(data.nodes);
        }
        
        // Add covenant markers
        data.covenants = generateCovenantMarkers();
        
        // Store in cache
        dataCache.enriched = data;
        
        return data;
    }

    /**
     * Generates covenant markers for significant biblical covenants
     * @returns {Array} - Array of covenant marker objects
     */
    function generateCovenantMarkers() {
        return [
            {
                id: 'covenant-adam',
                name: 'Adamic Covenant',
                description: 'God\'s covenant with Adam in the Garden of Eden',
                figure: 'adam',
                approximate_year: -4000,
                references: ['Genesis 1:26-30', 'Genesis 2:16-17']
            },
            {
                id: 'covenant-noah',
                name: 'Noahic Covenant',
                description: 'God\'s covenant never to destroy the earth by flood again',
                figure: 'noah',
                approximate_year: -2350,
                references: ['Genesis 9:8-17']
            },
            {
                id: 'covenant-abraham',
                name: 'Abrahamic Covenant',
                description: 'God\'s promises to Abraham of land, descendants, and blessing',
                figure: 'abraham',
                approximate_year: -1900,
                references: ['Genesis 12:1-3', 'Genesis 15', 'Genesis 17:1-14']
            },
            {
                id: 'covenant-moses',
                name: 'Mosaic Covenant',
                description: 'The Law given to Moses at Mount Sinai',
                figure: 'moses',
                approximate_year: -1446,
                references: ['Exodus 19-24', 'Deuteronomy 5']
            },
            {
                id: 'covenant-david',
                name: 'Davidic Covenant',
                description: 'God\'s promise to establish David\'s throne forever',
                figure: 'david',
                approximate_year: -1000,
                references: ['2 Samuel 7:8-16', 'Psalm 89']
            },
            {
                id: 'covenant-new',
                name: 'New Covenant',
                description: 'Covenant established through Jesus Christ',
                figure: 'jesus',
                approximate_year: 30,
                references: ['Jeremiah 31:31-34', 'Luke 22:20', 'Hebrews 8:8-13']
            }
        ];
    }

    /**
     * Gets a fallback dataset for cases where data loading fails
     * @returns {Object} - A minimal fallback dataset
     */
    function getFallbackData() {
        console.log('Providing minimal fallback dataset');
        
        return {
            nodes: [
                { id: 'adam', name: 'Adam', birthYear: -4000, deathYear: -3070, era: 'antediluvian', isKeyFigure: true },
                { id: 'eve', name: 'Eve', birthYear: -4000, deathYear: -3100, era: 'antediluvian', isKeyFigure: true, spouse: 'adam' },
                { id: 'cain', name: 'Cain', birthYear: -3970, era: 'antediluvian', parents: ['adam', 'eve'] },
                { id: 'abel', name: 'Abel', birthYear: -3960, deathYear: -3930, era: 'antediluvian', parents: ['adam', 'eve'] },
                { id: 'seth', name: 'Seth', birthYear: -3870, deathYear: -2958, era: 'antediluvian', parents: ['adam', 'eve'] },
                { id: 'noah', name: 'Noah', birthYear: -2948, deathYear: -1998, era: 'antediluvian', isKeyFigure: true },
                { id: 'abraham', name: 'Abraham', birthYear: -1996, deathYear: -1821, era: 'patriarchal', isKeyFigure: true },
                { id: 'isaac', name: 'Isaac', birthYear: -1896, deathYear: -1716, era: 'patriarchal', isKeyFigure: true, parents: ['abraham'] },
                { id: 'jacob', name: 'Jacob', birthYear: -1836, deathYear: -1689, era: 'patriarchal', isKeyFigure: true, parents: ['isaac'] },
                { id: 'joseph', name: 'Joseph', birthYear: -1745, deathYear: -1635, era: 'patriarchal', isKeyFigure: true, parents: ['jacob'] },
                { id: 'moses', name: 'Moses', birthYear: -1526, deathYear: -1406, era: 'exodus-conquest', isKeyFigure: true },
                { id: 'david', name: 'David', birthYear: -1040, deathYear: -970, era: 'judges-kings', isKeyFigure: true },
                { id: 'jesus', name: 'Jesus', birthYear: -4, deathYear: 33, era: 'new-testament', isKeyFigure: true }
            ],
            relationships: [
                { source: 'adam', target: 'eve', type: 'spousal' },
                { source: 'adam', target: 'cain', type: 'parental' },
                { source: 'eve', target: 'cain', type: 'parental' },
                { source: 'adam', target: 'abel', type: 'parental' },
                { source: 'eve', target: 'abel', type: 'parental' },
                { source: 'adam', target: 'seth', type: 'parental' },
                { source: 'eve', target: 'seth', type: 'parental' },
                { source: 'abraham', target: 'isaac', type: 'parental' },
                { source: 'isaac', target: 'jacob', type: 'parental' },
                { source: 'jacob', target: 'joseph', type: 'parental' }
            ]
        };
    }

    /**
     * Updates the configuration
     * @param {Object} newConfig - The new configuration options
     */
    function updateConfig(newConfig) {
        if (!newConfig || typeof newConfig !== 'object') {
            throw new Error('Invalid configuration object');
        }
        
        const oldDataSource = config.dataSource;
        const oldFallbackSource = config.fallbackSource;
        
        // Update config with new values
        Object.assign(config, newConfig);
        
        // Clear cache if data sources changed
        if (config.dataSource !== oldDataSource || config.fallbackSource !== oldFallbackSource) {
            console.log('Data sources changed, clearing cache');
            clearCache();
        }
        
        console.log('Configuration updated', config);
    }

    /**
     * Clears all data caches
     */
    function clearCache() {
        dataCache.raw = null;
        dataCache.processed = null;
        dataCache.enriched = null;
        console.log('All data caches cleared');
    }

    /**
     * Searches for people in the dataset matching search criteria
     * @param {string} query - The search query
     * @param {Object} options - Search options
     * @returns {Array} - Array of matching people
     */
    function searchPeople(query, options = {}) {
        if (!dataCache.enriched || !dataCache.enriched.nodes) {
            throw new Error('No data available for search');
        }
        
        if (!query || query.trim() === '') {
            return [];
        }
        
        const searchOptions = {
            caseSensitive: false,
            exact: false,
            searchFields: ['name', 'title', 'description', 'attributes'],
            limit: 20,
            ...options
        };
        
        const normalizedQuery = searchOptions.caseSensitive 
            ? query.trim() 
            : query.trim().toLowerCase();
        
        const results = dataCache.enriched.nodes
            .filter(node => {
                for (const field of searchOptions.searchFields) {
                    if (!node[field]) continue;
                    
                    const fieldValue = searchOptions.caseSensitive 
                        ? node[field].toString() 
                        : node[field].toString().toLowerCase();
                    
                    if (searchOptions.exact) {
                        if (fieldValue === normalizedQuery) return true;
                    } else {
                        if (fieldValue.includes(normalizedQuery)) return true;
                    }
                }
                return false;
            })
            .slice(0, searchOptions.limit);
        
        return results;
    }

    /**
     * Gets all people from a specific biblical era
     * @param {string} era - The biblical era to filter by
     * @returns {Array} - Array of people from that era
     */
    function getPeopleByEra(era) {
        if (!dataCache.enriched || !dataCache.enriched.nodes) {
            throw new Error('No data available');
        }
        
        return dataCache.enriched.nodes.filter(node => node.era === era);
    }

    /**
     * Extracts a specific lineage path through the genealogy
     * @param {string} startPersonId - The ID of the starting person
     * @param {string} endPersonId - The ID of the ending person
     * @returns {Object} - The lineage path information
     */
    function getLineagePath(startPersonId, endPersonId) {
        if (!dataCache.enriched || !dataCache.enriched.nodes) {
            throw new Error('No data available');
        }
        
        // Create node map for quick lookups
        const nodeMap = new Map();
        dataCache.enriched.nodes.forEach(node => nodeMap.set(node.id, node));
        
        // Check if both people exist
        const startPerson = nodeMap.get(startPersonId);
        const endPerson = nodeMap.get(endPersonId);
        
        if (!startPerson || !endPerson) {
            throw new Error('One or both people not found in dataset');
        }
        
        // Breadth-first search for shortest path
        const visited = new Set();
        const queue = [];
        const paths = new Map(); // Maps person ID to their predecessor in the path
        
        queue.push(startPersonId);
        visited.add(startPersonId);
        paths.set(startPersonId, null);
        
        let found = false;
        
        while (queue.length > 0 && !found) {
            const currentId = queue.shift();
            
            // Check all relationships for this person
            const relationships = dataCache.enriched.relationships.filter(r => 
                r.source === currentId || r.target === currentId);
            
            for (const rel of relationships) {
                const connectedId = rel.source === currentId ? rel.target : rel.source;
                
                if (!visited.has(connectedId)) {
                    visited.add(connectedId);
                    paths.set(connectedId, currentId);
                    queue.push(connectedId);
                    
                    if (connectedId === endPersonId) {
                        found = true;
                        break;
                    }
                }
            }
        }
        
        if (!found) {
            return { found: false, path: [] };
        }
        
        // Reconstruct the path
        const pathIds = [];
        let current = endPersonId;
        
        while (current !== null) {
            pathIds.unshift(current);
            current = paths.get(current);
        }
        
        // Create the full path with node details
        const fullPath = pathIds.map(id => {
            const node = nodeMap.get(id);
            return {
                id: node.id,
                name: node.name,
                generation: node.generation,
                era: node.era,
                isKeyFigure: node.isKeyFigure || false
            };
        });
        
        return {
            found: true,
            path: fullPath,
            startPerson: startPerson.name,
            endPerson: endPerson.name,
            generationSpan: endPerson.generation - startPerson.generation,
            pathLength: fullPath.length - 1,
            keyFiguresInPath: fullPath.filter(p => p.isKeyFigure).length
        };
    }

    // Public API
    return {
        loadGenealogyData,
        enrichDataset,
        getFallbackData,
        updateConfig,
        clearCache,
        searchPeople,
        getPeopleByEra,
        getLineagePath,
        
        // Utility functions exposed for testing and advanced usage
        utils: {
            isValidDataStructure,
            buildRelationships,
            calculateGeneration,
            determineEra,
            isKeyBiblicalFigure
        }
    };
})();

// Export for module systems if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GenealogyDataUtils;
}