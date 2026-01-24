import { DepGraph } from 'dependency-graph'
import semver from 'semver'
import fs from 'node:fs'
import path from 'node:path'
import { detectChanges } from './change-detector.js'

/**
 * Bump priority levels for comparison
 */
const BUMP_PRIORITY = { major: 3, minor: 2, patch: 1 }

/**
 * Entity types tracked for versioning
 */
const ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates']

/**
 * Build reverse index: entity key -> module id
 *
 * Maps each entity to its containing module for efficient lookup.
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {Map<string, string>} Map from "type:id" to module id
 *
 * @example
 * const reverseIndex = buildReverseModuleIndex(entityIndex)
 * reverseIndex.get('categories:Agent') // 'Core'
 */
export function buildReverseModuleIndex(entityIndex) {
  const reverseIndex = new Map()

  for (const [moduleId, moduleEntity] of entityIndex.modules) {
    // Index each entity type that modules reference
    for (const entityType of ENTITY_TYPES) {
      const entityIds = moduleEntity[entityType] || []
      for (const entityId of entityIds) {
        const key = `${entityType}:${entityId}`
        reverseIndex.set(key, moduleId)
      }
    }
  }

  return reverseIndex
}

/**
 * Return highest bump type from array
 *
 * @param {string[]} bumps - Array of bump types ('major', 'minor', 'patch')
 * @returns {string} Highest bump type ('major' > 'minor' > 'patch')
 *
 * @example
 * maxBumpType(['patch', 'major', 'minor']) // 'major'
 * maxBumpType(['minor', 'patch']) // 'minor'
 * maxBumpType([]) // 'patch'
 */
export function maxBumpType(bumps) {
  if (!bumps || bumps.length === 0) {
    return 'patch'
  }

  let max = 'patch'
  let maxPriority = BUMP_PRIORITY.patch

  for (const bump of bumps) {
    const priority = BUMP_PRIORITY[bump] || 0
    if (priority > maxPriority) {
      max = bump
      maxPriority = priority
    }
  }

  return max
}

/**
 * Aggregate entity bumps per module
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @param {Array} changes - Changes from detectChanges
 * @returns {Map<string, string>} Map from moduleId to bumpType
 *
 * @example
 * const moduleBumps = calculateModuleBumps(entityIndex, changes)
 * moduleBumps.get('Core') // 'major'
 */
export function calculateModuleBumps(entityIndex, changes) {
  const reverseIndex = buildReverseModuleIndex(entityIndex)
  const moduleBumps = new Map()

  for (const change of changes) {
    // Extract entity type and id from file path
    const parts = change.file.split('/')
    const entityType = parts[0]
    const fileName = parts[parts.length - 1]
    const entityId = fileName.replace('.json', '')

    // Find containing module
    const key = `${entityType}:${entityId}`
    const moduleId = reverseIndex.get(key)

    // Skip orphan entities (not in any module)
    if (!moduleId) {
      continue
    }

    // Aggregate bumps per module using maxBumpType
    const existingBump = moduleBumps.get(moduleId)
    if (existingBump) {
      const newBump = maxBumpType([existingBump, change.changeType])
      moduleBumps.set(moduleId, newBump)
    } else {
      moduleBumps.set(moduleId, change.changeType)
    }
  }

  return moduleBumps
}

/**
 * Build module dependency graph for cascade ordering
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {DepGraph} Dependency graph with modules as nodes
 */
export function buildModuleDependencyGraph(entityIndex) {
  const graph = new DepGraph()

  // Add all modules as nodes first
  for (const [moduleId] of entityIndex.modules) {
    graph.addNode(moduleId)
  }

  // Add dependency edges
  for (const [moduleId, moduleEntity] of entityIndex.modules) {
    const deps = moduleEntity.dependencies || []
    for (const depId of deps) {
      // Only add edge if dependency module exists
      if (entityIndex.modules.has(depId)) {
        graph.addDependency(moduleId, depId)
      }
    }
  }

  return graph
}

/**
 * Propagate bumps through module dependency cascade
 *
 * If module A depends on B, and B has a bump, A gets at least the same bump.
 * Bottom-up processing ensures dependencies are resolved before dependents.
 *
 * @param {DepGraph} moduleGraph - Module dependency graph
 * @param {Map<string, string>} moduleBumps - Initial module bumps
 * @returns {Map<string, string>} Cascaded module bumps
 *
 * @example
 * // Module A depends on B, B has 'major' bump
 * const cascaded = propagateDependencyCascade(graph, moduleBumps)
 * cascaded.get('A') // 'major' (cascaded from B)
 */
export function propagateDependencyCascade(moduleGraph, moduleBumps) {
  const cascadedBumps = new Map(moduleBumps)

  try {
    // Process modules bottom-up (leaves first, roots last)
    const order = moduleGraph.overallOrder()

    for (const moduleId of order) {
      // Get dependencies of this module
      const deps = moduleGraph.dependenciesOf(moduleId)

      // Collect bumps from all dependencies
      const depBumps = []
      for (const depId of deps) {
        if (cascadedBumps.has(depId)) {
          depBumps.push(cascadedBumps.get(depId))
        }
      }

      // If this module has dependencies with bumps, cascade them
      if (depBumps.length > 0) {
        const maxDepBump = maxBumpType(depBumps)
        const currentBump = cascadedBumps.get(moduleId)

        if (currentBump) {
          // Take max of current and cascaded
          const finalBump = maxBumpType([currentBump, maxDepBump])
          cascadedBumps.set(moduleId, finalBump)
        } else {
          // Module didn't have direct bump, gets cascaded bump
          cascadedBumps.set(moduleId, maxDepBump)
        }
      }
    }
  } catch (err) {
    // If cycle exists, skip cascade (cycle detector will catch it)
    if (err.message && err.message.includes('Dependency Cycle Found')) {
      return cascadedBumps
    }
    throw err
  }

  return cascadedBumps
}

/**
 * Aggregate module bumps per bundle
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @param {Map<string, string>} moduleBumps - Module bumps (after cascade)
 * @returns {Map<string, string>} Map from bundleId to bumpType
 *
 * @example
 * const bundleBumps = calculateBundleBumps(entityIndex, moduleBumps)
 * bundleBumps.get('Default') // 'major'
 */
export function calculateBundleBumps(entityIndex, moduleBumps) {
  const bundleBumps = new Map()

  for (const [bundleId, bundleEntity] of entityIndex.bundles) {
    const moduleIds = bundleEntity.modules || []
    const bumps = []

    for (const moduleId of moduleIds) {
      if (moduleBumps.has(moduleId)) {
        bumps.push(moduleBumps.get(moduleId))
      }
    }

    // Only add bundle if at least one of its modules has a bump
    if (bumps.length > 0) {
      bundleBumps.set(bundleId, maxBumpType(bumps))
    }
  }

  return bundleBumps
}

/**
 * Calculate overall ontology version bump
 *
 * Takes the maximum of all entity changes (including orphans).
 *
 * @param {Array} changes - All entity changes from detectChanges
 * @param {Map<string, string>} moduleBumps - Module bumps (unused, for API consistency)
 * @param {Map<string, string>} bundleBumps - Bundle bumps (unused, for API consistency)
 * @returns {string} Overall bump type ('major', 'minor', or 'patch')
 *
 * @example
 * calculateOntologyBump(changes, moduleBumps, bundleBumps) // 'major'
 */
export function calculateOntologyBump(changes, moduleBumps, bundleBumps) {
  if (!changes || changes.length === 0) {
    return 'patch'
  }

  const bumps = changes.map(c => c.changeType)
  return maxBumpType(bumps)
}

/**
 * Load VERSION_OVERRIDES.json from repository root
 *
 * @param {string} rootDir - Repository root directory (defaults to cwd)
 * @returns {Object} Override object mapping entity IDs to bump types, or empty object if file doesn't exist
 *
 * @example
 * const overrides = loadOverrides()
 * // { Core: 'major', Lab: 'minor' }
 */
export function loadOverrides(rootDir = process.cwd()) {
  const overridePath = path.join(rootDir, 'VERSION_OVERRIDES.json')

  if (!fs.existsSync(overridePath)) {
    return {}
  }

  try {
    const content = fs.readFileSync(overridePath, 'utf8')
    return JSON.parse(content)
  } catch (err) {
    throw new Error(`Failed to parse VERSION_OVERRIDES.json: ${err.message}`)
  }
}

/**
 * Apply version overrides with downgrade warnings
 *
 * @param {Map<string, string>} calculatedBumps - Calculated bumps from cascade
 * @param {Object} overrides - Override object from VERSION_OVERRIDES.json
 * @returns {{bumps: Map<string, string>, warnings: string[]}} Final bumps and warnings
 *
 * @example
 * const result = applyOverrides(moduleBumps, { Core: 'major' })
 * // { bumps: Map { 'Core' => 'major' }, warnings: ['Override downgrades Core from minor to patch'] }
 */
export function applyOverrides(calculatedBumps, overrides) {
  const warnings = []
  const finalBumps = new Map(calculatedBumps)

  for (const [id, overrideBump] of Object.entries(overrides)) {
    const calculated = calculatedBumps.get(id)
    if (calculated && BUMP_PRIORITY[overrideBump] < BUMP_PRIORITY[calculated]) {
      warnings.push(`Override downgrades ${id} from ${calculated} to ${overrideBump}`)
    }
    finalBumps.set(id, overrideBump)
  }

  return { bumps: finalBumps, warnings }
}

/**
 * Calculate new semver version from current version and bump type
 *
 * @param {string} currentVersion - Current semver version
 * @param {string} bumpType - Bump type ('major', 'minor', 'patch')
 * @returns {string|null} New version string, or null if invalid
 *
 * @example
 * calculateNewVersion('1.2.3', 'minor') // '1.3.0'
 */
export function calculateNewVersion(currentVersion, bumpType) {
  if (!currentVersion || !bumpType) {
    return null
  }

  try {
    return semver.inc(currentVersion, bumpType)
  } catch (err) {
    return null
  }
}

/**
 * Calculate complete version cascade from entity changes
 *
 * Main entry point that orchestrates the entire cascade calculation:
 * 1. Detect entity changes
 * 2. Aggregate entity bumps to modules
 * 3. Propagate bumps through module dependencies
 * 4. Aggregate module bumps to bundles
 * 5. Calculate overall ontology bump
 * 6. Apply overrides if requested
 * 7. Calculate new versions for modules and bundles
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @param {string} baseBranch - Base branch reference (e.g., 'origin/main')
 * @param {Object} options - Options: { applyOverrides: boolean, rootDir: string }
 * @returns {Object} Cascade result with bumps for all levels
 *
 * @example
 * const result = calculateVersionCascade(entityIndex, 'origin/main', { applyOverrides: true })
 * // {
 * //   changes: [...],
 * //   moduleBumps: Map<moduleId, bumpType>,
 * //   bundleBumps: Map<bundleId, bumpType>,
 * //   ontologyBump: 'major',
 * //   orphanChanges: [...],
 * //   overrides: { Core: 'major' },
 * //   overrideWarnings: ['Override downgrades Lab from major to minor'],
 * //   moduleVersions: Map<moduleId, { current, new, bump }>,
 * //   bundleVersions: Map<bundleId, { current, new, bump }>
 * // }
 */
export function calculateVersionCascade(entityIndex, baseBranch = 'origin/main', options = {}) {
  // Detect all entity changes
  const { changes } = detectChanges(entityIndex, baseBranch)

  // Handle no changes case
  if (!changes || changes.length === 0) {
    return {
      changes: [],
      moduleBumps: new Map(),
      bundleBumps: new Map(),
      ontologyBump: 'patch',
      orphanChanges: []
    }
  }

  // Build reverse index and module graph
  const reverseIndex = buildReverseModuleIndex(entityIndex)
  const moduleGraph = buildModuleDependencyGraph(entityIndex)

  // Calculate module bumps from entity changes
  const initialModuleBumps = calculateModuleBumps(entityIndex, changes)

  // Propagate bumps through dependency cascade
  const moduleBumps = propagateDependencyCascade(moduleGraph, initialModuleBumps)

  // Calculate bundle bumps
  const bundleBumps = calculateBundleBumps(entityIndex, moduleBumps)

  // Calculate ontology bump
  const ontologyBump = calculateOntologyBump(changes, moduleBumps, bundleBumps)

  // Identify orphan changes (entities not in any module)
  const orphanChanges = changes.filter(change => {
    const parts = change.file.split('/')
    const entityType = parts[0]
    const fileName = parts[parts.length - 1]
    const entityId = fileName.replace('.json', '')
    const key = `${entityType}:${entityId}`
    return !reverseIndex.has(key)
  })

  // Apply overrides if requested
  let overrides = {}
  let overrideWarnings = []
  let finalModuleBumps = moduleBumps
  let finalBundleBumps = bundleBumps

  if (options.applyOverrides) {
    overrides = loadOverrides(options.rootDir)

    // Apply overrides to modules
    const moduleOverrideResult = applyOverrides(moduleBumps, overrides)
    finalModuleBumps = moduleOverrideResult.bumps
    overrideWarnings.push(...moduleOverrideResult.warnings)

    // Apply overrides to bundles
    const bundleOverrideResult = applyOverrides(bundleBumps, overrides)
    finalBundleBumps = bundleOverrideResult.bumps
    overrideWarnings.push(...bundleOverrideResult.warnings)
  }

  // Calculate new versions for modules and bundles
  const moduleVersions = new Map()
  for (const [moduleId, bump] of finalModuleBumps) {
    const moduleEntity = entityIndex.modules.get(moduleId)
    if (moduleEntity && moduleEntity.version) {
      const newVersion = calculateNewVersion(moduleEntity.version, bump)
      moduleVersions.set(moduleId, {
        current: moduleEntity.version,
        new: newVersion,
        bump
      })
    }
  }

  const bundleVersions = new Map()
  for (const [bundleId, bump] of finalBundleBumps) {
    const bundleEntity = entityIndex.bundles.get(bundleId)
    if (bundleEntity && bundleEntity.version) {
      const newVersion = calculateNewVersion(bundleEntity.version, bump)
      bundleVersions.set(bundleId, {
        current: bundleEntity.version,
        new: newVersion,
        bump
      })
    }
  }

  return {
    changes,
    moduleBumps: finalModuleBumps,
    bundleBumps: finalBundleBumps,
    ontologyBump,
    orphanChanges,
    overrides,
    overrideWarnings,
    moduleVersions,
    bundleVersions
  }
}
