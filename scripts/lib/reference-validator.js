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
    properties: 'properties',
    subobjects: 'subobjects',
    templates: 'templates',
    dependencies: 'modules',
    dashboards: 'dashboards',
    resources: 'resources'
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
