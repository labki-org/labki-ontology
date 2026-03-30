import { DepGraph } from 'dependency-graph'

/**
 * Build a dependency graph from entities using a custom dependency extractor
 *
 * @param {Map<string, object>} entities - Entity map from index
 * @param {function(object): string|string[]} getDependencies - Function to extract dependencies from an entity
 * @returns {DepGraph} Graph where edges represent dependencies
 *
 * @example
 * // Categories use parents array
 * buildEntityGraph(categories, entity => entity.parents || [])
 *
 * // Properties use single parent_property
 * buildEntityGraph(properties, entity => entity.parent_property)
 */
export function buildEntityGraph(entities, getDependencies) {
  const graph = new DepGraph()

  // First pass: add all entities as nodes
  for (const [entityId] of entities) {
    graph.addNode(entityId)
  }

  // Second pass: add dependency edges
  for (const [entityId, entity] of entities) {
    const deps = getDependencies(entity)
    const depArray = Array.isArray(deps) ? deps : deps ? [deps] : []

    for (const depId of depArray) {
      if (graph.hasNode(depId)) {
        graph.addDependency(entityId, depId)
      }
    }
  }

  return graph
}

/**
 * Check a graph for cycles and return errors
 * @param {DepGraph} graph - Graph to check
 * @param {string} graphType - Human-readable type name
 * @param {Map<string, object>} entityMap - Entity map for file path lookup
 * @returns {Array} Array of error objects
 */
function checkForCycles(graph, graphType, entityMap) {
  const errors = []

  try {
    graph.overallOrder()  // Throws DepGraphCycleError if cycle exists
  } catch (err) {
    if (err.cyclePath) {
      const cyclePath = err.cyclePath
      const cycleStr = cyclePath.join(' -> ')

      // Get file path from first entity in cycle
      const firstEntityId = cyclePath[0]
      const entity = entityMap.get(firstEntityId)
      const filePath = entity ? entity._filePath : 'unknown'

      errors.push({
        file: filePath,
        type: `circular-${graphType.replace(/ /g, '-')}`,
        message: `Circular ${graphType} detected: ${cycleStr}`
      })
    } else {
      // Re-throw unexpected errors
      throw err
    }
  }

  return errors
}

/**
 * Detect cycles in all three graph types
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {{errors: Array}} Detection results
 */
export function detectCycles(entityIndex) {
  const errors = []

  // Check category inheritance cycles (GRPH-01)
  const categoryGraph = buildEntityGraph(
    entityIndex.categories,
    entity => entity.parents || []
  )
  errors.push(...checkForCycles(
    categoryGraph,
    'category inheritance',
    entityIndex.categories
  ))

  // Check property parent_property cycles (GRPH-03)
  const propertyGraph = buildEntityGraph(
    entityIndex.properties,
    entity => entity.parent_property
  )
  errors.push(...checkForCycles(
    propertyGraph,
    'property parent_property',
    entityIndex.properties
  ))

  return { errors }
}
