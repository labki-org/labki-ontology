/**
 * Declarative map of entity types to their reference fields and target types
 *
 * Format: { entityType: { fieldName: targetEntityType } }
 */
export const REFERENCE_FIELDS = {
  categories: {
    parents: 'categories',
    required_properties: 'properties',
    optional_properties: 'properties',
    required_subobjects: 'subobjects',
    optional_subobjects: 'subobjects'
  },
  subobjects: {
    required_properties: 'properties',
    optional_properties: 'properties'
  },
  properties: {
    parent_property: 'properties',
    has_display_template: 'templates'
  },
  modules: {
    categories: 'categories',
    dashboards: 'dashboards'
  },
  bundles: {
    modules: 'modules',
    dashboards: 'dashboards'
  }
}

/**
 * Normalize a reference value to an array
 *
 * @param {*} value - Reference value (string, array, or undefined)
 * @returns {string[]} Array of reference IDs
 */
function normalizeToArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return [value]
}

/**
 * Validate all references in the entity index.
 *
 * Checks existence and self-references. Entities can appear in multiple
 * modules (modules are thematic groupings, not ownership boundaries).
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {{errors: Array, warnings: Array}} Validation results
 */
export function validateReferences(entityIndex) {
  const errors = []
  const warnings = []

  // Validate each entity type that has reference fields
  for (const [entityType, fieldMap] of Object.entries(REFERENCE_FIELDS)) {
    const entities = entityIndex[entityType]

    for (const [entityId, entity] of entities) {
      // Check each reference field
      for (const [fieldName, targetType] of Object.entries(fieldMap)) {
        const refs = normalizeToArray(entity[fieldName])

        for (const refId of refs) {
          // Self-reference check
          if (refId === entityId && targetType === entityType) {
            errors.push({
              file: entity._filePath,
              type: 'self-reference',
              message: `Self-reference in field "${fieldName}": "${refId}" references itself`
            })
            continue
          }

          // Existence check
          const targetIndex = entityIndex[targetType]
          if (!targetIndex.has(refId)) {
            errors.push({
              file: entity._filePath,
              type: 'missing-reference',
              message: `Missing reference in field "${fieldName}": "${refId}" does not exist in ${targetType}`
            })
          }
        }
      }
    }
  }

  return { errors, warnings }
}

/**
 * Validate media references in resources.
 *
 * Checks that [[File:X]] references in resource wikitext point to files
 * that exist in the media/ directory, and warns about oversized files.
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex
 * @returns {{errors: Array, warnings: Array}} Validation results
 */
export function validateMediaReferences(entityIndex) {
  const errors = []
  const warnings = []
  const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

  for (const [entityId, entity] of entityIndex.resources) {
    const refs = entity._mediaRefs || []
    for (const filename of refs) {
      if (!entityIndex.media || !entityIndex.media.has(filename)) {
        errors.push({
          file: entity._filePath,
          type: 'missing-media',
          message: `Missing media file "${filename}" referenced via [[File:${filename}]]`
        })
      }
    }
  }

  if (entityIndex.media) {
    for (const [filename, meta] of entityIndex.media) {
      if (meta.sizeBytes > MAX_FILE_SIZE) {
        warnings.push({
          file: meta._filePath,
          type: 'media-size',
          message: `Media file "${filename}" is ${(meta.sizeBytes / 1024 / 1024).toFixed(1)}MB (max 5MB recommended)`
        })
      }

      // Validate JSON sidecar metadata
      if (!meta.hasJsonFile) {
        errors.push({
          file: meta._filePath,
          type: 'missing-media-metadata',
          message: `Media file "${filename}" has no matching .json sidecar metadata file`
        })
      } else if (!meta.metadata) {
        // JSON file exists but could not be parsed
        errors.push({
          file: meta._filePath,
          type: 'malformed-media-metadata',
          message: `Media file "${filename}" has a malformed .json sidecar metadata file`
        })
      } else {
        // JSON parsed successfully — check required fields
        if (!meta.metadata.source) {
          errors.push({
            file: meta._filePath,
            type: 'missing-media-metadata-field',
            message: `Media file "${filename}" metadata is missing required field "source"`
          })
        }
        if (!meta.metadata.license) {
          errors.push({
            file: meta._filePath,
            type: 'missing-media-metadata-field',
            message: `Media file "${filename}" metadata is missing required field "license"`
          })
        }
      }
    }
  }

  return { errors, warnings }
}
