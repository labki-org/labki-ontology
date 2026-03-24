/**
 * Parse entity type and ID from a file path
 *
 * @param {string} filePath - File path like 'properties/Has_name.wikitext' or 'modules/Core.vocab.json'
 * @returns {{entityType: string, entityId: string}} Parsed entity info
 *
 * @example
 * parseEntityPath('properties/Has_name.wikitext')
 * // { entityType: 'properties', entityId: 'Has_name' }
 * parseEntityPath('modules/Core.vocab.json')
 * // { entityType: 'modules', entityId: 'Core' }
 * parseEntityPath('templates/Property/Page.wikitext')
 * // { entityType: 'templates', entityId: 'Property/Page' }
 */
export function parseEntityPath(filePath) {
  const parts = filePath.split('/')
  const entityType = parts[0]

  // Module vocab.json
  if (filePath.endsWith('.vocab.json')) {
    return {
      entityType,
      entityId: parts[parts.length - 1].replace('.vocab.json', '')
    }
  }

  // Wikitext entity (may have nested paths for templates, resources, dashboards)
  if (filePath.endsWith('.wikitext')) {
    const entityId = parts.slice(1).join('/').replace('.wikitext', '')
    return { entityType, entityId }
  }

  // Plain JSON (bundles)
  return {
    entityType,
    entityId: parts[parts.length - 1].replace('.json', '')
  }
}
