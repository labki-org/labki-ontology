import fs from 'node:fs'
import path from 'node:path'
// Re-export buildEntityIndex for convenience
export { buildEntityIndex } from './entity-index.js'

/**
 * Entity types that can be included in module artifacts
 */
const ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates']

/**
 * Generate a module version artifact
 *
 * @param {string} moduleId - Module ID to generate artifact for
 * @param {string} version - Version to assign to artifact
 * @param {Object} entityIndex - Entity index from buildEntityIndex()
 * @returns {Object} Module artifact object
 * @throws {Error} If module not found or dependency module not found
 */
export function generateModuleArtifact(moduleId, version, entityIndex) {
  const moduleEntity = entityIndex.modules.get(moduleId)
  if (!moduleEntity) {
    throw new Error(`Module not found: ${moduleId}`)
  }

  // Resolve dependency versions
  const dependencies = {}
  for (const depId of (moduleEntity.dependencies || [])) {
    const depModule = entityIndex.modules.get(depId)
    if (!depModule) {
      throw new Error(`Dependency module not found: ${depId}`)
    }
    dependencies[depId] = depModule.version
  }

  // Build artifact structure
  const artifact = {
    $schema: 'https://labki.org/schemas/module-version.schema.json',
    id: moduleId,
    version: version,
    generated: new Date().toISOString(),
    dependencies: dependencies
  }

  // Add entities by type (full JSON content)
  for (const entityType of ENTITY_TYPES) {
    const entityIds = moduleEntity[entityType] || []
    const entities = []

    for (const entityId of entityIds) {
      const entity = entityIndex[entityType].get(entityId)
      if (entity) {
        // Clone and remove internal fields
        const cleanEntity = { ...entity }
        delete cleanEntity._filePath
        entities.push(cleanEntity)
      }
    }

    artifact[entityType] = entities
  }

  return artifact
}

/**
 * Generate a bundle version manifest
 *
 * @param {string} bundleId - Bundle ID to generate manifest for
 * @param {string} version - Version to assign to manifest
 * @param {Object} entityIndex - Entity index from buildEntityIndex()
 * @param {string} ontologyVersion - Current ontology VERSION
 * @returns {Object} Bundle manifest object
 * @throws {Error} If bundle not found or module not found
 */
export function generateBundleManifest(bundleId, version, entityIndex, ontologyVersion) {
  const bundleEntity = entityIndex.bundles.get(bundleId)
  if (!bundleEntity) {
    throw new Error(`Bundle not found: ${bundleId}`)
  }

  // Build module version map
  const modules = {}
  for (const moduleId of bundleEntity.modules) {
    const moduleEntity = entityIndex.modules.get(moduleId)
    if (!moduleEntity) {
      throw new Error(`Module not found in bundle: ${moduleId}`)
    }
    modules[moduleId] = moduleEntity.version
  }

  // Build manifest structure
  const manifest = {
    $schema: 'https://labki.org/schemas/bundle-version.schema.json',
    id: bundleId,
    version: version,
    generated: new Date().toISOString(),
    ontologyVersion: ontologyVersion,
    modules: modules
  }

  // Add optional description if present
  if (bundleEntity.description) {
    manifest.description = bundleEntity.description
  }

  return manifest
}

/**
 * Write artifact to versioned file path
 *
 * @param {string} baseDir - Base directory (e.g., 'modules' or 'bundles')
 * @param {string} entityId - Module or bundle ID
 * @param {string} version - Version string
 * @param {Object} artifact - Artifact object to write
 * @returns {string} Output path where artifact was written
 */
export function writeVersionedArtifact(baseDir, entityId, version, artifact) {
  const outputPath = path.join(baseDir, entityId, 'versions', `${version}.json`)
  const outputDir = path.dirname(outputPath)

  // Create directory if it doesn't exist
  fs.mkdirSync(outputDir, { recursive: true })

  // Write with consistent formatting (2-space indent, trailing newline)
  const json = JSON.stringify(artifact, null, 2)
  fs.writeFileSync(outputPath, json + '\n', 'utf8')

  return outputPath
}
