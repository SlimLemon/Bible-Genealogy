/**
 * Genealogy Data Utilities
 * A comprehensive module for loading, processing, and analyzing genealogy data.
 */

// Define relationship types for consistency across the application
const RELATIONSHIP_TYPES = {
  MARRIAGE: 'marriage',
  PARENT_CHILD: 'parent-child',
  FATHER_CHILD: 'father-child',
  MOTHER_CHILD: 'mother-child',
  SIBLING: 'sibling',
  SPOUSE: 'spouse',
  HUSBAND_WIFE: 'husband-wife',
  ANCESTOR: 'ancestor',
  DESCENDANT: 'descendant'
};

/**
* Loads genealogy data from a JSON file or URL
* @param {string} source - Path to JSON file or URL
* @param {Object} options - Optional configuration
* @param {boolean} options.validateData - Whether to validate the data
* @param {boolean} options.enrichData - Whether to enrich the data with computed fields
* @param {Function} options.progressCallback - Callback for load progress
* @returns {Promise<Object>} - Promise resolving to the genealogy data
*/
async function loadGenealogyData(source, options = {}) {
  try {
      // Create default options
      const config = {
          validateData: true,
          enrichData: true,
          progressCallback: null,
          ...options
      };
      
      // Call progress callback with initial state
      if (typeof config.progressCallback === 'function') {
          config.progressCallback({ loaded: 0, total: 100, status: 'Fetching data...' });
      }
      
      // Fetch the data
      const response = await fetch(source);
      
      if (!response.ok) {
          throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
      }
      
      // Process the data
      const data = await response.json();
      
      // Call progress callback with successful load
      if (typeof config.progressCallback === 'function') {
          config.progressCallback({ loaded: 50, total: 100, status: 'Processing data...' });
      }
      
      // Validate if requested
      if (config.validateData) {
          const validationResult = validateGenealogyData(data);
          if (!validationResult.valid) {
              throw new Error(`Invalid data format: ${validationResult.errors.join(', ')}`);
          }
      }
      
      // Enrich data if requested
      let processedData = data;
      if (config.enrichData) {
          processedData = enrichDataset(data);
      }
      
      // Call progress callback with completion
      if (typeof config.progressCallback === 'function') {
          config.progressCallback({ loaded: 100, total: 100, status: 'Data loaded successfully' });
      }
      
      return processedData;
  } catch (error) {
      console.error("Error loading genealogy data:", error);
      throw error;
  }
}

/**
* Loads genealogy data from a file input element
* @param {HTMLInputElement} fileInput - The file input element
* @param {Object} options - Optional configuration
* @returns {Promise<Object>} - Promise resolving to the genealogy data
*/
async function loadGenealogyDataFromFileInput(fileInput, options = {}) {
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
              
              // Validate if requested
              if (options.validateData) {
                  const validationResult = validateGenealogyData(data);
                  if (!validationResult.valid) {
                      reject(new Error(`Invalid data format: ${validationResult.errors.join(', ')}`));
                      return;
                  }
              }
              
              // Enrich data if requested
              if (options.enrichData) {
                  resolve(enrichDataset(data));
              } else {
                  resolve(data);
              }
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
  
  // Check people array
  if (!Array.isArray(data.people)) {
      errors.push('Data must contain a "people" array');
  } else {
      // Check each person
      data.people.forEach((person, index) => {
          if (!person.id) {
              errors.push(`Person at index ${index} is missing an id`);
          }
          
          // Check that IDs are unique
          const idMatches = data.people.filter(p => p.id === person.id);
          if (idMatches.length > 1) {
              errors.push(`Duplicate person ID found: ${person.id}`);
          }
      });
  }
  
  // Check relationships array if it exists
  if (data.relationships) {
      if (!Array.isArray(data.relationships)) {
          errors.push('Relationships must be an array');
      } else {
          // Check each relationship
          data.relationships.forEach((rel, index) => {
              if (!rel.from || !rel.to || !rel.type) {
                  errors.push(`Relationship at index ${index} is missing required fields (from, to, type)`);
                  return;
              }
              
              // Check that from/to reference existing people
              const fromExists = data.people.some(p => p.id === rel.from);
              const toExists = data.people.some(p => p.id === rel.to);
              
              if (!fromExists) {
                  errors.push(`Relationship at index ${index} references non-existent person ID in "from": ${rel.from}`);
              }
              
              if (!toExists) {
                  errors.push(`Relationship at index ${index} references non-existent person ID in "to": ${rel.to}`);
              }
          });
      }
  }
  
  return {
      valid: errors.length === 0,
      errors
  };
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
  
  // Create a deep clone to avoid modifying the original
  const enriched = JSON.parse(JSON.stringify(data));
  
  // Create a map for efficient lookups
  const peopleMap = new Map();
  enriched.people.forEach(person => {
      peopleMap.set(person.id, person);
  });
  
  // Calculate birth/death years from dates if possible
  enriched.people.forEach(person => {
      // Extract year from "YYYY-MM-DD" or "YYYY" format
      if (person.birthDate && !person.birthYear) {
          const match = person.birthDate.match(/^(\d{4})/);
          if (match) {
              person.birthYear = parseInt(match[1], 10);
          }
      }
      
      if (person.deathDate && !person.deathYear) {
          const match = person.deathDate.match(/^(\d{4})/);
          if (match) {
              person.deathYear = parseInt(match[1], 10);
          }
      }
      
      // Calculate age if possible
      if (person.birthYear && person.deathYear) {
          person.age = person.deathYear - person.birthYear;
      } else if (person.birthYear) {
          // If alive, use current year
          const currentYear = new Date().getFullYear();
          person.isAlive = !person.deathYear && person.birthYear <= currentYear;
          if (person.isAlive) {
              person.age = currentYear - person.birthYear;
          }
      }
  });
  
  // Add relationship-derived fields if relationships exist
  if (enriched.relationships && enriched.relationships.length > 0) {
      // Maps to store family relationships
      const childrenByParent = new Map();
      const spousesByPerson = new Map();
      const siblingsByPerson = new Map();
      
      // Initialize maps
      enriched.people.forEach(person => {
          childrenByParent.set(person.id, []);
          spousesByPerson.set(person.id, []);
          siblingsByPerson.set(person.id, []);
      });
      
      // Process relationships
      enriched.relationships.forEach(rel => {
          // Handle parent-child relationships
          if (rel.type === RELATIONSHIP_TYPES.PARENT_CHILD || 
              rel.type === RELATIONSHIP_TYPES.FATHER_CHILD || 
              rel.type === RELATIONSHIP_TYPES.MOTHER_CHILD) {
              
              const parentId = rel.from;
              const childId = rel.to;
              
              // Add child to parent's children
              if (childrenByParent.has(parentId)) {
                  const children = childrenByParent.get(parentId);
                  if (!children.includes(childId)) {
                      children.push(childId);
                  }
              }
              
              // Set parent ID on child
              const child = peopleMap.get(childId);
              const parent = peopleMap.get(parentId);
              
              if (child && parent) {
                  if (parent.gender === 'male') {
                      child.fatherId = parentId;
                  } else if (parent.gender === 'female') {
                      child.motherId = parentId;
                  }
              }
          }
          
          // Handle marriage relationships
          if (rel.type === RELATIONSHIP_TYPES.MARRIAGE || 
              rel.type === RELATIONSHIP_TYPES.SPOUSE || 
              rel.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
              
              const person1Id = rel.from;
              const person2Id = rel.to;
              
              // Add to spouse lists (both directions)
              if (spousesByPerson.has(person1Id)) {
                  const spouses = spousesByPerson.get(person1Id);
                  if (!spouses.includes(person2Id)) {
                      spouses.push(person2Id);
                  }
              }
              
              if (spousesByPerson.has(person2Id)) {
                  const spouses = spousesByPerson.get(person2Id);
                  if (!spouses.includes(person1Id)) {
                      spouses.push(person1Id);
                  }
              }
          }
          
          // Handle sibling relationships
          if (rel.type === RELATIONSHIP_TYPES.SIBLING) {
              const sibling1Id = rel.from;
              const sibling2Id = rel.to;
              
              // Add to sibling lists (both directions)
              if (siblingsByPerson.has(sibling1Id)) {
                  const siblings = siblingsByPerson.get(sibling1Id);
                  if (!siblings.includes(sibling2Id)) {
                      siblings.push(sibling2Id);
                  }
              }
              
              if (siblingsByPerson.has(sibling2Id)) {
                  const siblings = siblingsByPerson.get(sibling2Id);
                  if (!siblings.includes(sibling1Id)) {
                      siblings.push(sibling1Id);
                  }
              }
          }
      });
      
      // Add computed family fields to people
      enriched.people.forEach(person => {
          // Add children array
          const children = childrenByParent.get(person.id) || [];
          if (children.length > 0) {
              person.childrenIds = children;
              person.childCount = children.length;
          }
          
          // Add spouse array
          const spouses = spousesByPerson.get(person.id) || [];
          if (spouses.length > 0) {
              person.spouseIds = spouses;
              person.spouseCount = spouses.length;
          }
          
          // Add sibling array
          const siblings = siblingsByPerson.get(person.id) || [];
          if (siblings.length > 0) {
              person.siblingIds = siblings;
              person.siblingCount = siblings.length;
          }
      });
  }
  
  // Infer missing parent-child relationships from fatherId/motherId
  enriched.people.forEach(person => {
      if (person.fatherId) {
          const father = peopleMap.get(person.fatherId);
          if (father) {
              if (!father.childrenIds) {
                  father.childrenIds = [];
              }
              if (!father.childrenIds.includes(person.id)) {
                  father.childrenIds.push(person.id);
              }
              father.childCount = father.childrenIds.length;
              
              // Add relationship if it doesn't exist
              if (!enriched.relationships) {
                  enriched.relationships = [];
              }
              
              const relationshipExists = enriched.relationships.some(
                  rel => (rel.from === father.id && rel.to === person.id && 
                        (rel.type === RELATIONSHIP_TYPES.FATHER_CHILD || rel.type === RELATIONSHIP_TYPES.PARENT_CHILD))
              );
              
              if (!relationshipExists) {
                  enriched.relationships.push({
                      from: father.id,
                      to: person.id,
                      type: RELATIONSHIP_TYPES.FATHER_CHILD
                  });
              }
          }
      }
      
      if (person.motherId) {
          const mother = peopleMap.get(person.motherId);
          if (mother) {
              if (!mother.childrenIds) {
                  mother.childrenIds = [];
              }
              if (!mother.childrenIds.includes(person.id)) {
                  mother.childrenIds.push(person.id);
              }
              mother.childCount = mother.childrenIds.length;
              
              // Add relationship if it doesn't exist
              if (!enriched.relationships) {
                  enriched.relationships = [];
              }
              
              const relationshipExists = enriched.relationships.some(
                  rel => (rel.from === mother.id && rel.to === person.id && 
                        (rel.type === RELATIONSHIP_TYPES.MOTHER_CHILD || rel.type === RELATIONSHIP_TYPES.PARENT_CHILD))
              );
              
              if (!relationshipExists) {
                  enriched.relationships.push({
                      from: mother.id,
                      to: person.id,
                      type: RELATIONSHIP_TYPES.MOTHER_CHILD
                  });
              }
          }
      }
  });
  
  // Calculate generation numbers if not already present
  // Start with a reference person (e.g., the earliest ancestor or a specified person)
  const rootPersons = findRootAncestors(enriched);
  
  // Set generation for root persons
  rootPersons.forEach(root => {
      root.generation = 0;
      
      // Traverse down the family tree
      assignGenerations(root, peopleMap, 0);
  });
  
  // Update metadata
  if (!enriched.metadata) {
      enriched.metadata = {};
  }
  
  enriched.metadata.enriched = true;
  enriched.metadata.lastUpdated = new Date().toISOString();
  enriched.metadata.peopleCount = enriched.people.length;
  enriched.metadata.relationshipsCount = enriched.relationships ? enriched.relationships.length : 0;
  
  return enriched;
}

/**
* Helper function to find root ancestors (people with no parents)
* @param {Object} data - The genealogy data
* @returns {Array} - Array of root ancestor person objects
*/
function findRootAncestors(data) {
  if (!data || !data.people) {
      return [];
  }
  
  return data.people.filter(person => {
      return (!person.fatherId && !person.motherId);
  });
}

/**
* Helper function to recursively assign generation numbers
* @param {Object} person - The current person
* @param {Map} peopleMap - Map of people by ID for efficient lookup
* @param {number} generation - The current generation number
*/
function assignGenerations(person, peopleMap, generation) {
  person.generation = generation;
  
  // Process children if any
  if (person.childrenIds && person.childrenIds.length > 0) {
      person.childrenIds.forEach(childId => {
          const child = peopleMap.get(childId);
          if (child) {
              // Only update if not already assigned or if new generation is higher
              if (child.generation === undefined || child.generation < generation + 1) {
                  assignGenerations(child, peopleMap, generation + 1);
              }
          }
      });
  }
  
  // Also process spouses to ensure they're in the same generation
  if (person.spouseIds && person.spouseIds.length > 0) {
      person.spouseIds.forEach(spouseId => {
          const spouse = peopleMap.get(spouseId);
          if (spouse && (spouse.generation === undefined || spouse.generation !== generation)) {
              assignGenerations(spouse, peopleMap, generation);
          }
      });
  }
}

/**
* Converts genealogy data to a format suitable for graph visualization
* @param {Object} data - The genealogy data to convert
* @param {Object} options - Options for conversion
* @returns {Object} - The graph data (nodes and links)
*/
function convertToGraphData(data, options = {}) {
  if (!data || !data.people) {
      console.error("Invalid data provided to convertToGraphData");
      return { nodes: [], links: [] };
  }
  
  // Default options
  const config = {
      includeDetailedInfo: true,
      useGenerationLevels: true,
      includeFamilyGroups: true,
      ...options
  };
  
  // Create nodes for each person
  const nodes = data.people.map(person => {
      const node = {
          id: person.id,
          name: person.name || 'Unknown',
          gender: person.gender || 'unknown',
          birthYear: person.birthYear,
          deathYear: person.deathYear,
          generation: person.generation !== undefined ? person.generation : null
      };
      
      // Add detailed info if requested
      if (config.includeDetailedInfo) {
          node.age = person.age;
          node.isAlive = person.isAlive;
          node.fatherId = person.fatherId;
          node.motherId = person.motherId;
          node.childCount = person.childCount || 0;
          node.spouseCount = person.spouseCount || 0;
          node.description = person.description;
          node.tribe = person.tribe;
          node.birthPlace = person.birthPlace;
          node.deathPlace = person.deathPlace;
          node.occupation = person.occupation;
      }
      
      return node;
  });
  
  // Create links for relationships
  const links = [];
  
  if (data.relationships && Array.isArray(data.relationships)) {
      data.relationships.forEach(rel => {
          const link = {
              source: rel.from,
              target: rel.to,
              type: rel.type
          };
          
          // Add any relationship metadata
          if (rel.date) link.date = rel.date;
          if (rel.place) link.place = rel.place;
          if (rel.description) link.description = rel.description;
          
          links.push(link);
      });
  }
  
  // Add family groups if requested
  if (config.includeFamilyGroups) {
      // Create a family node for each parent pair
      const families = new Map();
      
      // Find all marriages
      data.people.forEach(person => {
          if (person.spouseIds && person.spouseIds.length > 0) {
              person.spouseIds.forEach(spouseId => {
                  const familyId = [person.id, spouseId].sort().join('-');
                  
                  if (!families.has(familyId)) {
                      // Find mutual children
                      const children = data.people.filter(p => 
                          (p.fatherId === person.id && p.motherId === spouseId) ||
                          (p.fatherId === spouseId && p.motherId === person.id)
                      );
                      
                      if (children.length > 0) {
                          families.set(familyId, {
                              id: `family-${familyId}`,
                              type: 'family',
                              parents: [person.id, spouseId],
                              children: children.map(c => c.id)
                          });
                      }
                  }
              });
          }
      });
      
      // Add family nodes and links
      families.forEach(family => {
          // Add family node
          nodes.push({
              id: family.id,
              type: 'family',
              parents: family.parents,
              children: family.children
          });
          
          // Add links from parents to family
          family.parents.forEach(parentId => {
              links.push({
                  source: parentId,
                  target: family.id,
                  type: 'parent-family'
              });
          });
          
          // Add links from family to children
          family.children.forEach(childId => {
              links.push({
                  source: family.id,
                  target: childId,
                  type: 'family-child'
              });
          });
      });
  }
  
  return { nodes, links };
}

/**
* Finds the ancestral or descendant lineage for a person
* @param {Object} data - The genealogy data
* @param {string} personId - The ID of the person to find lineage for
* @param {Object} options - Options for lineage tracing
* @returns {Object} - The lineage data
*/
function findLineage(data, personId, options = {}) {
  if (!data || !data.people || !personId) {
      console.error("Invalid parameters provided to findLineage");
      return { ancestor: [], descendant: [] };
  }
  
  // Default options
  const config = {
      direction: 'both', // 'ancestor', 'descendant', or 'both'
      maxGenerations: 10, // Maximum generations to trace
      includeSiblings: false, // Whether to include siblings in the lineage
      includeSpouses: true, // Whether to include spouses in the lineage
      ...options
  };
  
  // Create a map for efficient lookups
  const peopleMap = new Map();
  data.people.forEach(person => {
      peopleMap.set(person.id, person);
  });
  
  // Get the starting person
  const startPerson = peopleMap.get(personId);
  if (!startPerson) {
      console.error(`Person with ID ${personId} not found`);
      return { ancestor: [], descendant: [] };
  }
  
  // Initialize result
  const result = {
      ancestor: [],
      descendant: [],
      startPerson: {
          id: startPerson.id,
          name: startPerson.name,
          gender: startPerson.gender,
          birthYear: startPerson.birthYear,
          deathYear: startPerson.deathYear
      }
  };
  
  // Trace ancestral lineage if requested
  if (config.direction === 'ancestor' || config.direction === 'both') {
      // Start with parents
      let currentGeneration = [];
      
      if (startPerson.fatherId && peopleMap.has(startPerson.fatherId)) {
          currentGeneration.push(peopleMap.get(startPerson.fatherId));
      }
      
      if (startPerson.motherId && peopleMap.has(startPerson.motherId)) {
          currentGeneration.push(peopleMap.get(startPerson.motherId));
      }
      
      // Process each generation
      for (let gen = 1; gen <= config.maxGenerations && currentGeneration.length > 0; gen++) {
          // Add current generation to result
          result.ancestor.push({
              generation: gen,
              people: currentGeneration.map(person => ({
                  id: person.id,
                  name: person.name,
                  gender: person.gender,
                  birthYear: person.birthYear,
                  deathYear: person.deathYear,
                  isDirectAncestor: true
              }))
          });
          
          // Include spouses if requested
          if (config.includeSpouses) {
              currentGeneration.forEach(person => {
                  if (person.spouseIds) {
                      person.spouseIds.forEach(spouseId => {
                          if (peopleMap.has(spouseId)) {
                              const spouse = peopleMap.get(spouseId);
                              // Check if spouse is already in the generation
                              const exists = result.ancestor[gen - 1].people.some(p => p.id === spouseId);
                              
                              if (!exists) {
                                  result.ancestor[gen - 1].people.push({
                                      id: spouse.id,
                                      name: spouse.name,
                                      gender: spouse.gender,
                                      birthYear: spouse.birthYear,
                                      deathYear: spouse.deathYear,
                                      isDirectAncestor: false,
                                      isSpouse: true,
                                      spouseOf: person.id
                                  });
                              }
                          }
                      });
                  }
              });
          }
          
          // Include siblings if requested
          if (config.includeSiblings) {
              const siblingsToAdd = [];
              
              currentGeneration.forEach(person => {
                  if (person.siblingIds) {
                      person.siblingIds.forEach(siblingId => {
                          if (peopleMap.has(siblingId)) {
                              const sibling = peopleMap.get(siblingId);
                              // Check if sibling is already in the generation
                              const exists = result.ancestor[gen - 1].people.some(p => p.id === siblingId);
                              
                              if (!exists) {
                                  siblingsToAdd.push({
                                      id: sibling.id,
                                      name: sibling.name,
                                      gender: sibling.gender,
                                      birthYear: sibling.birthYear,
                                      deathYear: sibling.deathYear,
                                      isDirectAncestor: false,
                                      isSibling: true,
                                      siblingOf: person.id
                                  });
                              }
                          }
                      });
                  }
              });
              
              result.ancestor[gen - 1].people.push(...siblingsToAdd);
          }
          
          // Prepare next generation (parents of current generation)
          const nextGeneration = [];
          
          currentGeneration.forEach(person => {
              if (person.fatherId && peopleMap.has(person.fatherId)) {
                  const father = peopleMap.get(person.fatherId);
                  // Check if already included
                  if (!nextGeneration.some(p => p.id === father.id)) {
                      nextGeneration.push(father);
                  }
              }
              
              if (person.motherId && peopleMap.has(person.motherId)) {
                  const mother = peopleMap.get(person.motherId);
                  // Check if already included
                  if (!nextGeneration.some(p => p.id === mother.id)) {
                      nextGeneration.push(mother);
                  }
              }
          });
          
          currentGeneration = nextGeneration;
      }
  }
  
  // Trace descendant lineage if requested
  if (config.direction === 'descendant' || config.direction === 'both') {
      let currentGeneration = [startPerson];
      
      // Add spouse(s) to starting generation if requested
      if (config.includeSpouses && startPerson.spouseIds) {
          startPerson.spouseIds.forEach(spouseId => {
              if (peopleMap.has(spouseId)) {
                  const spouse = peopleMap.get(spouseId);
                  currentGeneration.push(spouse);
              }
          });
      }
      
      // Process descendants
      result.descendant.push({
          generation: 0,
          people: currentGeneration.map(person => ({
              id: person.id,
              name: person.name,
              gender: person.gender,
              birthYear: person.birthYear,
              deathYear: person.deathYear,
              isDirectDescendant: person.id === personId,
              isSpouse: person.id !== personId
          }))
      });
      
      // Start with just the person and their spouse(s) for descendants
      currentGeneration = [startPerson];
      
      // Process each generation
      for (let gen = 1; gen <= config.maxGenerations; gen++) {
          const descendants = [];
          
          // Find all children of the current generation
          currentGeneration.forEach(person => {
              if (person.childrenIds) {
                  person.childrenIds.forEach(childId => {
                      if (peopleMap.has(childId)) {
                          const child = peopleMap.get(childId);
                          // Check if already included
                          if (!descendants.some(p => p.id === child.id)) {
                              descendants.push(child);
                          }
                      }
                  });
              }
          });
          
          if (descendants.length === 0) {
              break; // No more descendants
          }
          
          // Add spouses of descendants if requested
          const spouses = [];
          if (config.includeSpouses) {
              descendants.forEach(person => {
                  if (person.spouseIds) {
                      person.spouseIds.forEach(spouseId => {
                          if (peopleMap.has(spouseId)) {
                              const spouse = peopleMap.get(spouseId);
                              // Check if already included
                              if (!descendants.some(p => p.id === spouse.id) && !spouses.some(p => p.id === spouse.id)) {
                                  spouses.push(spouse);
                              }
                          }
                      });
                  }
              });
          }
          
          // Add this generation to result
          result.descendant.push({
              generation: gen,
              people: [
                  ...descendants.map(person => ({
                      id: person.id,
                      name: person.name,
                      gender: person.gender,
                      birthYear: person.birthYear,
                      deathYear: person.deathYear,
                      isDirectDescendant: true
                  })),
                  ...spouses.map(person => ({
                      id: person.id,
                      name: person.name,
                      gender: person.gender,
                      birthYear: person.birthYear,
                      deathYear: person.deathYear,
                      isDirectDescendant: false,
                      isSpouse: true
                  }))
              ]
          });
          
          // Include siblings if requested
          if (config.includeSiblings) {
              const siblingsToAdd = [];
              
              descendants.forEach(person => {
                  if (person.siblingIds) {
                      person.siblingIds.forEach(siblingId => {
                          if (peopleMap.has(siblingId)) {
                              const sibling = peopleMap.get(siblingId);
                              // Check if sibling is already in the generation
                              const exists = result.descendant[gen].people.some(p => p.id === siblingId);
                              
                              if (!exists && !siblingsToAdd.some(s => s.id === siblingId)) {
                                  siblingsToAdd.push({
                                      id: sibling.id,
                                      name: sibling.name,
                                      gender: sibling.gender,
                                      birthYear: sibling.birthYear,
                                      deathYear: sibling.deathYear,
                                      isDirectDescendant: false,
                                      isSibling: true,
                                      siblingOf: person.id
                                  });
                              }
                          }
                      });
                  }
              });
              
              result.descendant[gen].people.push(...siblingsToAdd);
          }
          
          // Update current generation for next iteration
          currentGeneration = [...descendants, ...spouses];
      }
  }
  
  return result;
}

/**
* Finds the shortest relationship path between two people
* @param {Object} data - The genealogy data
* @param {string} person1Id - The ID of the first person
* @param {string} person2Id - The ID of the second person
* @param {Object} options - Options for path finding
* @returns {Object} - The relationship path
*/
function findRelationshipPath(data, person1Id, person2Id, options = {}) {
  if (!data || !data.people || !person1Id || !person2Id) {
      console.error("Invalid parameters provided to findRelationshipPath");
      return { found: false };
  }
  
  // Default options
  const config = {
      maxDepth: 10, // Maximum relationship distance to search
      includeDetail: true, // Whether to include detailed relationship descriptions
      ...options
  };
  
  // Create a map for efficient lookups
  const peopleMap = new Map();
  data.people.forEach(person => {
      peopleMap.set(person.id, person);
  });
  
  // Get the people
  const person1 = peopleMap.get(person1Id);
  const person2 = peopleMap.get(person2Id);
  
  if (!person1 || !person2) {
      console.error("One or both people not found");
      return { found: false, error: "One or both people not found" };
  }
  
  // Direct relationship - same person
  if (person1Id === person2Id) {
      return {
          found: true,
          distance: 0,
          path: [{ id: person1Id, name: person1.name }],
          relationship: "Same person"
      };
  }
  
  // Build adjacency map for breadth-first search
  const adjacencyMap = new Map();
  
  // Add all people to adjacency map
  data.people.forEach(person => {
      adjacencyMap.set(person.id, []);
  });
  
  // Add relationships to adjacency map
  // Parent-child relationships
  data.people.forEach(person => {
      if (person.fatherId && peopleMap.has(person.fatherId)) {
          // Child to father
          adjacencyMap.get(person.id).push({
              id: person.fatherId,
              type: RELATIONSHIP_TYPES.FATHER_CHILD,
              direction: 'parent'
          });
          
          // Father to child
          adjacencyMap.get(person.fatherId).push({
              id: person.id,
              type: RELATIONSHIP_TYPES.FATHER_CHILD,
              direction: 'child'
          });
      }
      
      if (person.motherId && peopleMap.has(person.motherId)) {
          // Child to mother
          adjacencyMap.get(person.id).push({
              id: person.motherId,
              type: RELATIONSHIP_TYPES.MOTHER_CHILD,
              direction: 'parent'
          });
          
          // Mother to child
          adjacencyMap.get(person.motherId).push({
              id: person.id,
              type: RELATIONSHIP_TYPES.MOTHER_CHILD,
              direction: 'child'
          });
      }
  });
  
  // Add explicit relationships from data
  if (data.relationships) {
      data.relationships.forEach(rel => {
          // Marriage relationships
          if (rel.type === RELATIONSHIP_TYPES.MARRIAGE || 
              rel.type === RELATIONSHIP_TYPES.SPOUSE || 
              rel.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
              
              // Bidirectional relationship
              adjacencyMap.get(rel.from).push({
                  id: rel.to,
                  type: rel.type,
                  direction: 'spouse'
              });
              
              adjacencyMap.get(rel.to).push({
                  id: rel.from,
                  type: rel.type,
                  direction: 'spouse'
              });
          }
          
          // Sibling relationships
          if (rel.type === RELATIONSHIP_TYPES.SIBLING) {
              adjacencyMap.get(rel.from).push({
                  id: rel.to,
                  type: rel.type,
                  direction: 'sibling'
              });
              
              adjacencyMap.get(rel.to).push({
                  id: rel.from,
                  type: rel.type,
                  direction: 'sibling'
              });
          }
      });
  }
  
  // Breadth-first search for shortest path
  const queue = [{
      id: person1Id,
      path: [{ id: person1Id, name: person1.name }],
      steps: []
  }];
  
  const visited = new Set([person1Id]);
  
  while (queue.length > 0) {
      const current = queue.shift();
      
      // Check if we've reached the target
      if (current.id === person2Id) {
          // Calculate relationship description
          let relationshipDesc = "";
          
          if (config.includeDetail && current.steps.length > 0) {
              relationshipDesc = describeRelationship(current.steps);
          }
          
          return {
              found: true,
              distance: current.steps.length,
              path: current.path,
              steps: current.steps,
              relationship: relationshipDesc
          };
      }
      
      // Stop if we've reached the maximum depth
      if (current.steps.length >= config.maxDepth) {
          continue;
      }
      
      // Check all neighbors
      const neighbors = adjacencyMap.get(current.id) || [];
      
      for (const neighbor of neighbors) {
          if (!visited.has(neighbor.id)) {
              visited.add(neighbor.id);
              
              const person = peopleMap.get(neighbor.id);
              
              queue.push({
                  id: neighbor.id,
                  path: [...current.path, { id: neighbor.id, name: person.name }],
                  steps: [...current.steps, {
                      from: current.id,
                      to: neighbor.id,
                      type: neighbor.type,
                      direction: neighbor.direction
                  }]
              });
          }
      }
  }
  
  // No path found
  return {
      found: false,
      error: "No relationship path found"
  };
}

/**
* Helper function to describe a relationship path in plain language
* @param {Array} steps - The relationship steps
* @returns {string} - The relationship description
*/
function describeRelationship(steps) {
  if (!steps || steps.length === 0) {
      return "Same person";
  }
  
  if (steps.length === 1) {
      const step = steps[0];
      
      if (step.type === RELATIONSHIP_TYPES.FATHER_CHILD) {
          return step.direction === 'parent' ? "Father" : "Child";
      } else if (step.type === RELATIONSHIP_TYPES.MOTHER_CHILD) {
          return step.direction === 'parent' ? "Mother" : "Child";
      } else if (step.type === RELATIONSHIP_TYPES.MARRIAGE || 
                 step.type === RELATIONSHIP_TYPES.SPOUSE || 
                 step.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
          return "Spouse";
      } else if (step.type === RELATIONSHIP_TYPES.SIBLING) {
          return "Sibling";
      }
      
      return "Direct relationship";
  }
  
  // More complex relationships
  if (steps.length === 2) {
      const step1 = steps[0];
      const step2 = steps[1];
      
      // Grandparent relationship
      if ((step1.direction === 'parent' && step2.direction === 'parent')) {
          return "Grandparent";
      }
      
      // Grandchild relationship
      if ((step1.direction === 'child' && step2.direction === 'child')) {
          return "Grandchild";
      }
      
      // Aunt/Uncle relationship
      if ((step1.direction === 'parent' && step2.direction === 'sibling') ||
          (step1.direction === 'sibling' && step2.direction === 'parent')) {
          return "Aunt/Uncle";
      }
      
      // Niece/Nephew relationship
      if ((step1.direction === 'sibling' && step2.direction === 'child') ||
          (step1.direction === 'child' && step2.direction === 'sibling')) {
          return "Niece/Nephew";
      }
      
      // Parent-in-law
      if ((step1.direction === 'spouse' && step2.direction === 'parent') ||
          (step1.direction === 'parent' && step2.direction === 'spouse')) {
          return "Parent-in-law";
      }
      
      // Child-in-law
      if ((step1.direction === 'spouse' && step2.direction === 'child') ||
          (step1.direction === 'child' && step2.direction === 'spouse')) {
          return "Child-in-law";
      }
  }
  
  // For longer or more complex paths, provide a general description
  if (steps.length >= 3) {
      return `Extended family (${steps.length} steps away)`;
  }
  
  return `Related (${steps.length} steps away)`;
}

/**
* Generates a color scheme for different data categories
* @param {Object} data - The genealogy data
* @param {Object} options - Color scheme options
* @returns {Object} - The generated color scheme
*/
function generateCategoryColors(data, options = {}) {
  if (!data || !data.people) {
      console.error("Invalid data provided to generateCategoryColors");
      return {};
  }
  
  // Default options
  const config = {
      theme: 'default', // 'default', 'light', 'dark', 'colorful'
      ...options
  };
  
  // Define color palettes for different themes
  const colorThemes = {
      default: {
          male: '#5B9BD5',
          female: '#ED7D31',
          unknownGender: '#A5A5A5',
          marriage: '#70AD47',
          parent: '#4472C4',
          sibling: '#FFC000',
          ancestor: '#7030A0',
          highlight: '#FF0000',
          selected: '#00B0F0',
          mainLineage: '#00B050',
          default: '#808080'
      },
      light: {
          male: '#A9CCE3',
          female: '#F5CBA7',
          unknownGender: '#D5D8DC',
          marriage: '#A9DFBF',
          parent: '#AED6F1',
          sibling: '#FAD7A0',
          ancestor: '#D2B4DE',
          highlight: '#F5B7B1',
          selected: '#85C1E9',
          mainLineage: '#ABEBC6',
          default: '#BDC3C7'
      },
      dark: {
          male: '#1A5276',
          female: '#943126',
          unknownGender: '#283747',
          marriage: '#196F3D',
          parent: '#1F618D',
          sibling: '#B7950B',
          ancestor: '#4A235A',
          highlight: '#CB4335',
          selected: '#2874A6',
          mainLineage: '#0B5345',
          default: '#17202A'
      },
      colorful: {
          male: '#3498DB',
          female: '#E74C3C',
          unknownGender: '#95A5A6',
          marriage: '#27AE60',
          parent: '#2980B9',
          sibling: '#F1C40F',
          ancestor: '#8E44AD',
          highlight: '#E84393',
          selected: '#00CEC9',
          mainLineage: '#00B894',
          default: '#636E72'
      }
  };
  
  // Select the appropriate color theme
  const colors = colorThemes[config.theme] || colorThemes.default;
  
  // Get unique generations
  const generations = new Set();
  data.people.forEach(person => {
      if (person.generation !== undefined) {
          generations.add(person.generation);
      }
  });
  
  // Generate colors for generations
  const generationColors = {};
  Array.from(generations).sort((a, b) => a - b).forEach((gen, index) => {
      // Use a gradient from blue to red for generations
      const hue = 240 - (index * (240 / Math.max(generations.size - 1, 1)));
      generationColors[gen] = `hsl(${hue}, 70%, 60%)`;
  });
  
  // Get unique tribes/groups if they exist in the data
  const tribes = new Set();
  data.people.forEach(person => {
      if (person.tribe) {
          tribes.add(person.tribe);
      }
  });
  
  // Generate colors for tribes/groups
  const tribeColors = {};
  Array.from(tribes).sort().forEach((tribe, index) => {
      const hue = (index * (360 / Math.max(tribes.size, 1))) % 360;
      tribeColors[tribe] = `hsl(${hue}, 70%, 50%)`;
  });
  
  return {
      gender: {
          male: colors.male,
          female: colors.female,
          unknown: colors.unknownGender
      },
      relationship: {
          marriage: colors.marriage,
          parent: colors.parent,
          sibling: colors.sibling,
          ancestor: colors.ancestor
      },
      generation: generationColors,
      tribe: tribeColors,
      highlight: colors.highlight,
      selected: colors.selected,
      mainLineage: colors.mainLineage,
      default: colors.default
  };
}

/**
 * Creates a subgraph containing only specific people and their relationships
 * @param {Object} data - The full genealogy data
 * @param {Array<string>} personIds - Array of person IDs to include in the subgraph
 * @param {Object} options - Options for subgraph creation
 * @param {boolean} options.includeParents - Whether to include parents of selected people
 * @param {boolean} options.includeChildren - Whether to include children of selected people
 * @param {boolean} options.includeSiblings - Whether to include siblings of selected people
 * @param {boolean} options.includeSpouses - Whether to include spouses of selected people
 * @param {number} options.maxGenerationsUp - Maximum number of ancestral generations to include
 * @param {number} options.maxGenerationsDown - Maximum number of descendant generations to include
 * @returns {Object} - A subgraph containing only the selected people and their relationships
 */
function createSubgraph(data, personIds, options = {}) {
  if (!data || !data.people || !Array.isArray(personIds)) {
      console.error("Invalid data or personIds provided to createSubgraph");
      return { people: [], relationships: [] };
  }
  
  // Default options
  const config = {
      includeParents: false,
      includeChildren: false,
      includeSiblings: false,
      includeSpouses: false,
      maxGenerationsUp: 0,
      maxGenerationsDown: 0,
      ...options
  };
  
  // Create sets to track IDs to include
  const includedIds = new Set(personIds);
  const processedIds = new Set();
  const toProcess = [...personIds];
  
  // Create a map for efficient person lookups
  const peopleMap = new Map();
  data.people.forEach(person => {
      peopleMap.set(person.id, person);
  });
  
  // Create maps for relationships
  const parentMap = new Map();
  const childrenMap = new Map();
  const siblingMap = new Map();
  const spouseMap = new Map();
  
  // Initialize relationship maps
  data.people.forEach(person => {
      parentMap.set(person.id, []);
      childrenMap.set(person.id, []);
      siblingMap.set(person.id, []);
      spouseMap.set(person.id, []);
  });
  
  // Fill relationship maps from data
  if (data.relationships) {
      data.relationships.forEach(rel => {
          if (rel.type === RELATIONSHIP_TYPES.PARENT_CHILD || 
              rel.type === RELATIONSHIP_TYPES.FATHER_CHILD || 
              rel.type === RELATIONSHIP_TYPES.MOTHER_CHILD) {
              
              // Add parent-child relationship
              if (childrenMap.has(rel.from)) {
                  childrenMap.get(rel.from).push(rel.to);
              }
              
              if (parentMap.has(rel.to)) {
                  parentMap.get(rel.to).push(rel.from);
              }
          }
          
          if (rel.type === RELATIONSHIP_TYPES.MARRIAGE || 
              rel.type === RELATIONSHIP_TYPES.SPOUSE || 
              rel.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
              
              // Add spouse relationship (bidirectional)
              if (spouseMap.has(rel.from)) {
                  spouseMap.get(rel.from).push(rel.to);
              }
              
              if (spouseMap.has(rel.to)) {
                  spouseMap.get(rel.to).push(rel.from);
              }
          }
          
          if (rel.type === RELATIONSHIP_TYPES.SIBLING) {
              // Add sibling relationship (bidirectional)
              if (siblingMap.has(rel.from)) {
                  siblingMap.get(rel.from).push(rel.to);
              }
              
              if (siblingMap.has(rel.to)) {
                  siblingMap.get(rel.to).push(rel.from);
              }
          }
      });
  }
  
  // Also fill relationship maps from person data
  data.people.forEach(person => {
      // Add parent relationships
      if (person.fatherId) {
          if (parentMap.has(person.id)) {
              parentMap.get(person.id).push(person.fatherId);
          }
          
          if (childrenMap.has(person.fatherId)) {
              childrenMap.get(person.fatherId).push(person.id);
          }
      }
      
      if (person.motherId) {
          if (parentMap.has(person.id)) {
              parentMap.get(person.id).push(person.motherId);
          }
          
          if (childrenMap.has(person.motherId)) {
              childrenMap.get(person.motherId).push(person.id);
          }
      }
      
      // Add children, siblings, and spouses from arrays if they exist
      if (Array.isArray(person.childrenIds)) {
          person.childrenIds.forEach(childId => {
              if (childrenMap.has(person.id)) {
                  childrenMap.get(person.id).push(childId);
              }
              
              if (parentMap.has(childId)) {
                  parentMap.get(childId).push(person.id);
              }
          });
      }
      
      if (Array.isArray(person.siblingIds)) {
          person.siblingIds.forEach(siblingId => {
              if (siblingMap.has(person.id)) {
                  siblingMap.get(person.id).push(siblingId);
              }
              
              if (siblingMap.has(siblingId)) {
                  siblingMap.get(siblingId).push(person.id);
              }
          });
      }
      
      if (Array.isArray(person.spouseIds)) {
          person.spouseIds.forEach(spouseId => {
              if (spouseMap.has(person.id)) {
                  spouseMap.get(person.id).push(spouseId);
              }
              
              if (spouseMap.has(spouseId)) {
                  spouseMap.get(spouseId).push(person.id);
              }
          });
      }
  });
  
  // Process people to include in the subgraph
  while (toProcess.length > 0) {
      const personId = toProcess.shift();
      if (processedIds.has(personId)) continue;
      processedIds.add(personId);
      
      const person = peopleMap.get(personId);
      if (!person) continue;
      
      // Track generations for ancestors
      const currentGenUp = person.generationUp || 0;
      
      // Track generations for descendants
      const currentGenDown = person.generationDown || 0;
      
      // Include parents if requested and within generation limit
      if (config.includeParents && currentGenUp < config.maxGenerationsUp) {
          const parents = parentMap.get(personId) || [];
          parents.forEach(parentId => {
              if (!includedIds.has(parentId)) {
                  includedIds.add(parentId);
                  toProcess.push(parentId);
                  
                  // Set generation tracking for ancestor
                  const parent = peopleMap.get(parentId);
                  if (parent) {
                      parent.generationUp = currentGenUp + 1;
                  }
              }
          });
      }
      
      // Include children if requested and within generation limit
      if (config.includeChildren && currentGenDown < config.maxGenerationsDown) {
          const children = childrenMap.get(personId) || [];
          children.forEach(childId => {
              if (!includedIds.has(childId)) {
                  includedIds.add(childId);
                  toProcess.push(childId);
                  
                  // Set generation tracking for descendant
                  const child = peopleMap.get(childId);
                  if (child) {
                      child.generationDown = currentGenDown + 1;
                  }
              }
          });
      }
      
      // Include siblings if requested
      if (config.includeSiblings) {
          const siblings = siblingMap.get(personId) || [];
          siblings.forEach(siblingId => {
              if (!includedIds.has(siblingId)) {
                  includedIds.add(siblingId);
                  toProcess.push(siblingId);
              }
          });
      }
      
      // Include spouses if requested
      if (config.includeSpouses) {
          const spouses = spouseMap.get(personId) || [];
          spouses.forEach(spouseId => {
              if (!includedIds.has(spouseId)) {
                  includedIds.add(spouseId);
                  toProcess.push(spouseId);
              }
          });
      }
  }
  
  // Create the subgraph
  const subgraph = {
      people: data.people.filter(person => includedIds.has(person.id)),
      relationships: []
  };
  
  // Include only relationships between included people
  if (data.relationships) {
      subgraph.relationships = data.relationships.filter(rel => 
          includedIds.has(rel.from) && includedIds.has(rel.to)
      );
  }
  
  return subgraph;
}

/**
* Computes statistics about a genealogy dataset
* @param {Object} data - The genealogy data
* @returns {Object} - Statistics about the dataset
*/
function computeStatistics(data) {
  if (!data || !data.people) {
      console.error("Invalid data provided to computeStatistics");
      return {};
  }
  
  const stats = {
      totalCount: data.people.length,
      gender: {
          male: 0,
          female: 0,
          unknown: 0,
          other: 0
      },
      relationships: {
          marriages: 0,
          children: 0,
          siblings: 0
      },
      birthYears: {},
      deathYears: {},
      longevity: {
          averageAge: 0,
          maxAge: 0,
          minAge: Infinity
      },
      surnames: {},
      locations: {
          birth: {},
          death: {}
      },
      generations: {
          count: 0,
          min: Infinity,
          max: -Infinity
      }
  };
  
  // Compute gender statistics
  data.people.forEach(person => {
      // Gender stats
      if (person.gender === 'male') {
          stats.gender.male++;
      } else if (person.gender === 'female') {
          stats.gender.female++;
      } else if (!person.gender) {
          stats.gender.unknown++;
      } else {
          stats.gender.other++;
      }
      
      // Birth years
      if (person.birthYear) {
          stats.birthYears[person.birthYear] = (stats.birthYears[person.birthYear] || 0) + 1;
      }
      
      // Death years
      if (person.deathYear) {
          stats.deathYears[person.deathYear] = (stats.deathYears[person.deathYear] || 0) + 1;
      }
      
      // Age statistics
      if (person.age) {
          stats.longevity.averageAge += person.age;
          stats.longevity.maxAge = Math.max(stats.longevity.maxAge, person.age);
          stats.longevity.minAge = Math.min(stats.longevity.minAge, person.age);
      }
      
      // Surname statistics
      if (person.surname) {
          stats.surnames[person.surname] = (stats.surnames[person.surname] || 0) + 1;
      }
      
      // Location statistics
      if (person.birthPlace) {
          stats.locations.birth[person.birthPlace] = (stats.locations.birth[person.birthPlace] || 0) + 1;
      }
      
      if (person.deathPlace) {
          stats.locations.death[person.deathPlace] = (stats.locations.death[person.deathPlace] || 0) + 1;
      }
      
      // Generation statistics
      if (person.generation !== undefined) {
          stats.generations.min = Math.min(stats.generations.min, person.generation);
          stats.generations.max = Math.max(stats.generations.max, person.generation);
      }
  });
  
  // Calculate average age
  if (stats.longevity.minAge === Infinity) {
      stats.longevity.minAge = 0;
  }
  
  stats.longevity.averageAge = stats.longevity.averageAge / 
      (data.people.filter(p => p.age !== undefined).length || 1);
  
  // Count generations
  stats.generations.count = stats.generations.max - stats.generations.min + 1;
  
  // Count relationships
  if (data.relationships) {
      data.relationships.forEach(rel => {
          if (rel.type === RELATIONSHIP_TYPES.MARRIAGE || 
              rel.type === RELATIONSHIP_TYPES.SPOUSE || 
              rel.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
              stats.relationships.marriages++;
          } else if (rel.type === RELATIONSHIP_TYPES.PARENT_CHILD || 
                    rel.type === RELATIONSHIP_TYPES.FATHER_CHILD || 
                    rel.type === RELATIONSHIP_TYPES.MOTHER_CHILD) {
              stats.relationships.children++;
          } else if (rel.type === RELATIONSHIP_TYPES.SIBLING) {
              stats.relationships.siblings++;
          }
      });
  }
  
  // Count children based on person data
  let childCount = 0;
  data.people.forEach(person => {
      if (Array.isArray(person.childrenIds)) {
          childCount += person.childrenIds.length;
      }
  });
  
  // If we have more children from person data than from relationships, update the count
  stats.relationships.children = Math.max(stats.relationships.children, childCount);
  
  return stats;
}

/**
* Exports genealogy data to a specific format
* @param {Object} data - The genealogy data
* @param {string} format - The format to export to ('gedcom', 'csv', 'json')
* @param {Object} options - Export options
* @returns {string} - The exported data as a string
*/
function exportGenealogyData(data, format = 'gedcom', options = {}) {
  if (!data || !data.people) {
      console.error("Invalid data provided to exportGenealogyData");
      return "";
  }
  
  // Default options
  const config = {
      includeNotes: true,
      includeSources: true,
      includeMedia: false, // Media can be large, so default to exclude
      dateFormat: 'YYYY-MM-DD', // ISO format by default
      ...options
  };
  
  switch (format.toLowerCase()) {
      case 'gedcom':
          return exportToGedcom(data, config);
      case 'csv':
          return exportToCsv(data, config);
      case 'json':
          return exportToJson(data, config);
      default:
          console.error(`Unsupported export format: ${format}`);
          return "";
  }
}

/**
* Exports genealogy data to GEDCOM format
* @param {Object} data - The genealogy data
* @param {Object} config - Export configuration
* @returns {string} - GEDCOM formatted string
*/
function exportToGedcom(data, config) {
  const gedcom = [];
  
  // GEDCOM header
  gedcom.push("0 HEAD");
  gedcom.push("1 CHAR UTF-8");
  gedcom.push("1 GEDC");
  gedcom.push("2 VERS 5.5.1");
  gedcom.push("2 FORM LINEAGE-LINKED");
  gedcom.push("1 SOUR GENEALOGY_DATA_UTILS");
  gedcom.push("2 VERS 1.0");
  gedcom.push("1 DATE " + new Date().toISOString().split('T')[0]);
  gedcom.push("2 TIME " + new Date().toISOString().split('T')[1].split('.')[0]);
  
  // Generate a map of person IDs to GEDCOM IDs
  const gedcomIdMap = new Map();
  data.people.forEach((person, index) => {
      gedcomIdMap.set(person.id, `I${index + 1}`);
  });
  
  // Track families
  const families = [];
  const familyMap = new Map(); // Maps husband+wife IDs to family ID
  
  // Add people to GEDCOM
  data.people.forEach((person, index) => {
      const gedcomId = gedcomIdMap.get(person.id);
      
      gedcom.push(`0 ${gedcomId} INDI`);
      
      // Add name
      if (person.givenName || person.surname) {
          const givenName = person.givenName || '';
          const surname = person.surname || '';
          gedcom.push(`1 NAME ${givenName} /${surname}/`);
          
          if (person.givenName) {
              gedcom.push(`2 GIVN ${person.givenName}`);
          }
          
          if (person.surname) {
              gedcom.push(`2 SURN ${person.surname}`);
          }
      } else if (person.name) {
          // Try to parse name if in format "Given Surname"
          const nameParts = person.name.split(' ');
          if (nameParts.length >= 2) {
              const givenName = nameParts.slice(0, -1).join(' ');
              const surname = nameParts[nameParts.length - 1];
              gedcom.push(`1 NAME ${givenName} /${surname}/`);
          } else {
              gedcom.push(`1 NAME ${person.name}`);
          }
      }
      
      // Add sex
      if (person.gender) {
          const sex = person.gender.toUpperCase().charAt(0);
          if (sex === 'M' || sex === 'F') {
              gedcom.push(`1 SEX ${sex}`);
          }
      }
      
      // Add birth information
      if (person.birthDate || person.birthPlace || person.birthYear) {
          gedcom.push("1 BIRT");
          
          if (person.birthDate) {
              gedcom.push(`2 DATE ${formatGedcomDate(person.birthDate, config.dateFormat)}`);
          } else if (person.birthYear) {
              gedcom.push(`2 DATE ${person.birthYear}`);
          }
          
          if (person.birthPlace) {
              gedcom.push(`2 PLAC ${person.birthPlace}`);
          }
      }
      
      // Add death information
      if (person.deathDate || person.deathPlace || person.deathYear) {
          gedcom.push("1 DEAT");
          
          if (person.deathDate) {
              gedcom.push(`2 DATE ${formatGedcomDate(person.deathDate, config.dateFormat)}`);
          } else if (person.deathYear) {
              gedcom.push(`2 DATE ${person.deathYear}`);
          }
          
          if (person.deathPlace) {
              gedcom.push(`2 PLAC ${person.deathPlace}`);
          }
      }
      
      // Add occupation
      if (person.occupation) {
          gedcom.push(`1 OCCU ${person.occupation}`);
      }
      
      // Add notes
      if (config.includeNotes && person.notes) {
          if (Array.isArray(person.notes)) {
              person.notes.forEach(note => {
                  gedcom.push(`1 NOTE ${note}`);
              });
          } else {
              gedcom.push(`1 NOTE ${person.notes}`);
          }
      }
      
      // Add sources
      if (config.includeSources && person.sources) {
          if (Array.isArray(person.sources)) {
              person.sources.forEach(source => {
                  gedcom.push(`1 SOUR ${source}`);
              });
          } else {
              gedcom.push(`1 SOUR ${person.sources}`);
          }
      }
  });
  
  // Process relationships to create families
  if (data.relationships) {
      // First, gather marriages
      data.relationships.forEach((rel, index) => {
          if (rel.type === RELATIONSHIP_TYPES.MARRIAGE || 
              rel.type === RELATIONSHIP_TYPES.SPOUSE || 
              rel.type === RELATIONSHIP_TYPES.HUSBAND_WIFE) {
              
              const husband = data.people.find(p => p.id === rel.from && p.gender === 'male');
              const wife = data.people.find(p => p.id === rel.to && p.gender === 'female');
              
              // If genders aren't specified or match, try to determine by relationship direction
              const person1 = data.people.find(p => p.id === rel.from);
              const person2 = data.people.find(p => p.id === rel.to);
              
              if (husband && wife) {
                  // Husband and wife are correctly identified
                  const familyKey = `${husband.id}-${wife.id}`;
                  
                  if (!familyMap.has(familyKey)) {
                      const familyId = `F${families.length + 1}`;
                      familyMap.set(familyKey, familyId);
                      
                      families.push({
                          id: familyId,
                          husbandId: husband.id,
                          wifeId: wife.id,
                          childrenIds: []
                      });
                  }
              } else if (person1 && person2) {
                  // Default to using the direction in the relationship
                  const familyKey = `${person1.id}-${person2.id}`;
                  
                  if (!familyMap.has(familyKey)) {
                      const familyId = `F${families.length + 1}`;
                      familyMap.set(familyKey, familyId);
                      
                      families.push({
                          id: familyId,
                          husbandId: person1.id,
                          wifeId: person2.id,
                          childrenIds: []
                      });
                  }
              }
          }
      });
      
      // Then, gather parent-child relationships
      data.relationships.forEach(rel => {
          if (rel.type === RELATIONSHIP_TYPES.PARENT_CHILD || 
              rel.type === RELATIONSHIP_TYPES.FATHER_CHILD || 
              rel.type === RELATIONSHIP_TYPES.MOTHER_CHILD) {
              
              const parent = data.people.find(p => p.id === rel.from);
              const child = data.people.find(p => p.id === rel.to);
              
              if (parent && child) {
                  // Find the family where this parent is husband or wife
                  const family = families.find(f => 
                      f.husbandId === parent.id || f.wifeId === parent.id
                  );
                  
                  if (family && !family.childrenIds.includes(child.id)) {
                      family.childrenIds.push(child.id);
                  } else if (!family) {
                      // Create a new family with just one parent
                      const familyId = `F${families.length + 1}`;
                      
                      const newFamily = {
                          id: familyId,
                          childrenIds: [child.id]
                      };
                      
                      if (parent.gender === 'male') {
                          newFamily.husbandId = parent.id;
                      } else {
                          newFamily.wifeId = parent.id;
                      }
                      
                      families.push(newFamily);
                  }
              }
          }
      });
  }
  
  // Add families to GEDCOM
  families.forEach(family => {
      gedcom.push(`0 ${family.id} FAM`);
      
      if (family.husbandId) {
          const husbandGedcomId = gedcomIdMap.get(family.husbandId);
          if (husbandGedcomId) {
              gedcom.push(`1 HUSB @${husbandGedcomId}@`);
          }
      }
      
      if (family.wifeId) {
          const wifeGedcomId = gedcomIdMap.get(family.wifeId);
          if (wifeGedcomId) {
              gedcom.push(`1 WIFE @${wifeGedcomId}@`);
          }
      }
      
      family.childrenIds.forEach(childId => {
          const childGedcomId = gedcomIdMap.get(childId);
          if (childGedcomId) {
              gedcom.push(`1 CHIL @${childGedcomId}@`);
          }
      });
  });
  
  // Add trailer
  gedcom.push("0 TRLR");
  
  return gedcom.join("\n");
}

/**
* Exports genealogy data to CSV format
* @param {Object} data - The genealogy data
* @param {Object} config - Export configuration
* @returns {string} - CSV formatted string
*/
function exportToCsv(data, config) {
  if (!data.people || data.people.length === 0) {
      return "";
  }
  
  // Determine all possible fields from the people data
  const allFields = new Set();
  data.people.forEach(person => {
      Object.keys(person).forEach(key => {
          allFields.add(key);
      });
  });
  
  // Create header row
  const fields = Array.from(allFields);
  const csv = [fields.join(',')];
  
  // Add data rows
  data.people.forEach(person => {
      const row = fields.map(field => {
          const value = person[field];
          
          if (value === undefined || value === null) {
              return '';
          }
          
          if (Array.isArray(value)) {
              return `"${value.join(', ')}"`;
          }
          
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
          }
          
          return value;
      });
      
      csv.push(row.join(','));
  });
  
  return csv.join('\n');
}

/**
* Exports genealogy data to JSON format
* @param {Object} data - The genealogy data
* @param {Object} config - Export configuration
* @returns {string} - JSON formatted string
*/
function exportToJson(data, config) {
  if (!config.includeMedia) {
      // Filter out media fields to reduce size
      const filteredData = JSON.parse(JSON.stringify(data));
      
      if (filteredData.people) {
          filteredData.people.forEach(person => {
              delete person.media;
              delete person.photos;
              delete person.images;
          });
      }
      
      return JSON.stringify(filteredData, null, 2);
  }
  
  return JSON.stringify(data, null, 2);
}

/**
* Helper function to format dates for GEDCOM
* @param {string} date - The date string
* @param {string} format - The current format of the date
* @returns {string} - GEDCOM formatted date
*/
function formatGedcomDate(date, format) {
  // If the date is already in GEDCOM format, return it
  if (/^\d{1,2} (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) \d{4}$/.test(date)) {
      return date;
  }
  
  // Handle ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-');
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`;
  }
  
  // Handle just year
  if (/^\d{4}$/.test(date)) {
      return date;
  }
  
  // Handle other formats
  try {
      const dateObj = new Date(date);
      if (!isNaN(dateObj.getTime())) {
          const day = dateObj.getDate();
          const month = dateObj.getMonth();
          const year = dateObj.getFullYear();
          const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
          return `${day} ${months[month]} ${year}`;
      }
  } catch (e) {
      // Failed to parse date
  }
  
  // If we can't parse it, return as is
  return date;
}

// Replace the final export statement with this:
if (typeof module !== 'undefined' && module.exports) {
  // Node.js/CommonJS environment
  module.exports = {
      RELATIONSHIP_TYPES,
      loadGenealogyData,
      loadGenealogyDataFromFileInput,
      validateGenealogyData,
      enrichDataset,
      findRelationshipPath,
      describeRelationship,
      generateCategoryColors,
      createSubgraph,
      computeStatistics,
      exportGenealogyData
  };
} else if (typeof window !== 'undefined') {
  // Browser environment
  window.GenealogyDataUtils = {
      RELATIONSHIP_TYPES,
      loadGenealogyData,
      loadGenealogyDataFromFileInput,
      validateGenealogyData,
      enrichDataset,
      findRelationshipPath,
      describeRelationship,
      generateCategoryColors,
      createSubgraph,
      computeStatistics,
      exportGenealogyData
  };
}
