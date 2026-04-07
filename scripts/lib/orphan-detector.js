/**
 * Orphan detector for entity definitions
 *
 * Finds entities that are not referenced by any module.
 * Orphaned entities are warnings, not errors - they don't block CI.
 */

import { MODULE_ENTITY_TYPES } from './constants.js'

/**
 * Find entities that are not referenced by any module
 *
 * Checks categories, properties, subobjects, and templates.
 * Does NOT check modules or bundles (they are top-level organizers).
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {{warnings: Array}} Detection results
 */
export function findOrphanedEntities(entityIndex) {
  const warnings = []

  // Build a Set of all entities referenced by modules
  const referencedEntities = new Set()

  for (const [moduleId, mod] of entityIndex.modules) {
    for (const entityType of MODULE_ENTITY_TYPES) {
      for (const entityId of (mod[entityType] || [])) {
        referencedEntities.add(`${entityType}:${entityId}`)
      }
    }
  }

  // Check each entity type (same as MODULE_ENTITY_TYPES)
  for (const entityType of MODULE_ENTITY_TYPES) {
    const entities = entityIndex[entityType]

    for (const [entityId, entity] of entities) {
      const key = `${entityType}:${entityId}`

      if (!referencedEntities.has(key)) {
        warnings.push({
          file: entity._filePath,
          type: 'orphaned-entity',
          message: `${entityId} is not referenced by any module`
        })
      }
    }
  }

  // Detect orphaned media files
  if (entityIndex.media) {
    const referencedMedia = new Set()
    for (const [, entity] of entityIndex.resources) {
      for (const ref of (entity._mediaRefs || [])) {
        referencedMedia.add(ref)
      }
    }
    for (const [filename, meta] of entityIndex.media) {
      if (!referencedMedia.has(filename)) {
        warnings.push({
          file: meta._filePath,
          type: 'orphaned-media',
          message: `Media file "${filename}" is not referenced by any resource`
        })
      }
    }
  }

  return { warnings }
}
