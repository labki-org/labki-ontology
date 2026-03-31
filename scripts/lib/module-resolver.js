/**
 * Module resolver — computes what properties and subobjects a module
 * should contain based on its categories.
 *
 * Categories declare required/optional properties and subobjects.
 * Subobjects declare their own required/optional properties.
 * A module's properties = union of all properties from its categories + their subobjects.
 * A module's subobjects = union of all subobjects from its categories.
 */

/**
 * Collect all properties, subobjects, and resources referenced by a module's categories.
 *
 * @param {object} moduleEntity - Module from the entity index (has categories array)
 * @param {object} entityIndex - Full entity index with categories, subobjects, resources maps
 * @returns {{ properties: string[], subobjects: string[], resources: string[] }} Sorted arrays of entity IDs
 */
export function resolveModule(moduleEntity, entityIndex) {
  const properties = new Set()
  const subobjects = new Set()
  const resources = new Set()

  const categories = moduleEntity.categories || []
  const categorySet = new Set(categories)

  for (const catId of categories) {
    const category = entityIndex.categories.get(catId)
    if (!category) continue

    for (const prop of category.required_properties || []) {
      properties.add(prop)
    }
    for (const prop of category.optional_properties || []) {
      properties.add(prop)
    }
    for (const sub of category.required_subobjects || []) {
      subobjects.add(sub)
    }
    for (const sub of category.optional_subobjects || []) {
      subobjects.add(sub)
    }
  }

  // Collect properties from subobjects
  for (const subId of subobjects) {
    const subobject = entityIndex.subobjects.get(subId)
    if (!subobject) continue

    for (const prop of subobject.required_properties || []) {
      properties.add(prop)
    }
    for (const prop of subobject.optional_properties || []) {
      properties.add(prop)
    }
  }

  // Collect resources whose category is in the module
  if (entityIndex.resources) {
    for (const [resourceId, resource] of entityIndex.resources) {
      if (resource.category && categorySet.has(resource.category)) {
        resources.add(resourceId)
      }
    }
  }

  return {
    properties: [...properties].sort(),
    subobjects: [...subobjects].sort(),
    resources: [...resources].sort(),
  }
}

/**
 * Compare a module's current properties/subobjects/resources against the resolved set.
 *
 * @param {object} moduleEntity - Module from the entity index
 * @param {{ properties: string[], subobjects: string[], resources: string[] }} resolved - From resolveModule()
 * @returns {object} Diff with missing/extra arrays for each field
 */
export function diffModule(moduleEntity, resolved) {
  const currentProps = new Set(moduleEntity.properties || [])
  const resolvedProps = new Set(resolved.properties)

  const currentSubs = new Set(moduleEntity.subobjects || [])
  const resolvedSubs = new Set(resolved.subobjects)

  const currentRes = new Set(moduleEntity.resources || [])
  const resolvedRes = new Set(resolved.resources)

  return {
    missingProperties: resolved.properties.filter(p => !currentProps.has(p)),
    extraProperties: (moduleEntity.properties || []).filter(p => !resolvedProps.has(p)),
    missingSubobjects: resolved.subobjects.filter(s => !currentSubs.has(s)),
    extraSubobjects: (moduleEntity.subobjects || []).filter(s => !resolvedSubs.has(s)),
    missingResources: resolved.resources.filter(r => !currentRes.has(r)),
    extraResources: (moduleEntity.resources || []).filter(r => !resolvedRes.has(r)),
  }
}

/**
 * Find which category or subobject requires a given property.
 * Used for error messages.
 *
 * @param {string} propertyId - The property to trace
 * @param {object} moduleEntity - Module from the entity index
 * @param {object} entityIndex - Full entity index
 * @returns {string} Human-readable source like 'category "Person"' or 'subobject "Has_training_record"'
 */
export function tracePropertySource(propertyId, moduleEntity, entityIndex) {
  for (const catId of moduleEntity.categories || []) {
    const category = entityIndex.categories.get(catId)
    if (!category) continue

    const allProps = [
      ...(category.required_properties || []),
      ...(category.optional_properties || []),
    ]
    if (allProps.includes(propertyId)) {
      return `category "${catId}"`
    }
  }

  // Check subobjects
  const resolved = resolveModule(moduleEntity, entityIndex)
  for (const subId of resolved.subobjects) {
    const subobject = entityIndex.subobjects.get(subId)
    if (!subobject) continue

    const allProps = [
      ...(subobject.required_properties || []),
      ...(subobject.optional_properties || []),
    ]
    if (allProps.includes(propertyId)) {
      return `subobject "${subId}"`
    }
  }

  return 'unknown source'
}

/**
 * Find which category requires a given subobject.
 *
 * @param {string} subobjectId - The subobject to trace
 * @param {object} moduleEntity - Module from the entity index
 * @param {object} entityIndex - Full entity index
 * @returns {string} Human-readable source like 'category "Person"'
 */
export function traceSubobjectSource(subobjectId, moduleEntity, entityIndex) {
  for (const catId of moduleEntity.categories || []) {
    const category = entityIndex.categories.get(catId)
    if (!category) continue

    const allSubs = [
      ...(category.required_subobjects || []),
      ...(category.optional_subobjects || []),
    ]
    if (allSubs.includes(subobjectId)) {
      return `category "${catId}"`
    }
  }

  return 'unknown source'
}
