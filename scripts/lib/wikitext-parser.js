/**
 * Parses OntologySync wikitext files into structured entity dicts.
 *
 * Wikitext files use {{TemplateName|param=value}} template calls within
 * <!-- OntologySync Start/End --> blocks.
 *
 * This parser produces dicts in the same format as the old JSON entity files,
 * so downstream code (validation, artifact generation) works unchanged.
 */

// Namespace prefix to entity type mapping (for stripping prefixes from values)
const NAMESPACE_PREFIXES = {
  'Category': 'Category',
  'Property': 'Property',
  'Subobject': 'Subobject',
  'Template': 'Template',
}

// Namespace constant to entity type mapping (for vocab.json parsing)
export const NAMESPACE_TO_ENTITY_TYPE = {
  'NS_CATEGORY': 'categories',
  'SMW_NS_PROPERTY': 'properties',
  'NS_SUBOBJECT': 'subobjects',
  'NS_TEMPLATE': 'templates',
  'NS_ONTOLOGY_DASHBOARD': 'dashboards',
  'NS_ONTOLOGY_RESOURCE': 'resources',
}

/**
 * Convert an entity key (underscores) to a wiki page name (spaces).
 * @param {string} entityKey - e.g. "Has_name"
 * @returns {string} e.g. "Has name"
 */
export function toPageName(entityKey) {
  return entityKey.replace(/_/g, ' ')
}

/**
 * Convert a wiki page name (spaces) to an entity key (underscores).
 * @param {string} pageName - e.g. "Has name"
 * @returns {string} e.g. "Has_name"
 */
export function toEntityKey(pageName) {
  return pageName.replace(/ /g, '_')
}

/**
 * Split a comma-separated value string into trimmed items.
 * @param {string} value - e.g. "Has first name, Has last name"
 * @returns {string[]} e.g. ["Has first name", "Has last name"]
 */
function splitComma(value) {
  if (!value) return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * Split a comma-separated value string into entity keys (underscored).
 * @param {string} value - e.g. "Has first name, Has last name"
 * @returns {string[]} e.g. ["Has_first_name", "Has_last_name"]
 */
function commaToKeys(value) {
  return splitComma(value).map(toEntityKey)
}

/**
 * Extract a template call from within the OntologySync block.
 * Parses {{TemplateName|param1=value1|param2=value2}} syntax.
 *
 * @param {string} wikitext - Full wikitext content
 * @returns {{ templateName: string, params: Map<string, string> } | null}
 */
export function extractTemplateCall(wikitext) {
  const lines = wikitext.split('\n')

  let inBlock = false
  let templateLines = []
  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed === '<!-- OntologySync Start -->') {
      inBlock = true
      continue
    }
    if (trimmed === '<!-- OntologySync End -->') {
      inBlock = false
      continue
    }

    if (inBlock) {
      templateLines.push(line)
    }
  }

  // Join all lines inside the block
  const blockContent = templateLines.join('\n').trim()
  if (!blockContent) return null

  // Match {{ ... }} template call (may span multiple lines)
  const match = blockContent.match(/^\{\{([^|}\n]+)([\s\S]*)\}\}$/m)
  if (!match) return null

  const templateName = match[1].trim()
  const paramBlock = match[2]

  const params = new Map()

  // Parse |param=value entries (each on its own line typically)
  // The lookahead handles optional leading whitespace before | or }}
  const paramRegex = /\|([^=]+)=([^\n|]*(?:\n(?!\s*\||\s*\}\}).*)*)/g
  let paramMatch
  while ((paramMatch = paramRegex.exec(paramBlock)) !== null) {
    const key = paramMatch[1].trim()
    const value = paramMatch[2].trim()
    params.set(key, value)
  }

  return { templateName, params }
}

/**
 * Extract management categories from wikitext (outside the annotation block).
 * @param {string} wikitext
 * @returns {string[]} Array of category names
 */
export function extractCategories(wikitext) {
  const categories = []
  const lines = wikitext.split('\n')
  let inBlock = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '<!-- OntologySync Start -->') { inBlock = true; continue }
    if (trimmed === '<!-- OntologySync End -->') { inBlock = false; continue }
    if (inBlock) continue

    const match = trimmed.match(/^\[\[Category:([^\]]+)\]\]$/)
    if (match) {
      categories.push(match[1])
    }
  }

  return categories
}

// ─── Entity-specific parsers ────────────────────────────────────────────────

/**
 * Parse a category wikitext file into a structured dict.
 * @param {string} wikitext - File content
 * @param {string} entityKey - Entity key derived from filename (e.g. "Person")
 * @returns {object} Dict matching the old JSON format
 */
export function parseCategory(wikitext, entityKey) {
  const tc = extractTemplateCall(wikitext)
  const p = tc ? tc.params : new Map()

  const result = {
    id: entityKey,
    label: p.get('display_label') || toPageName(entityKey),
    description: p.get('has_description') || '',
  }

  const parents = commaToKeys(p.get('has_parent_category'))
  if (parents.length > 0) result.parents = parents

  const requiredProps = commaToKeys(p.get('has_required_property'))
  if (requiredProps.length > 0) result.required_properties = requiredProps

  const optionalProps = commaToKeys(p.get('has_optional_property'))
  if (optionalProps.length > 0) result.optional_properties = optionalProps

  const requiredSubs = commaToKeys(p.get('has_required_subobject'))
  if (requiredSubs.length > 0) result.required_subobjects = requiredSubs

  const optionalSubs = commaToKeys(p.get('has_optional_subobject'))
  if (optionalSubs.length > 0) result.optional_subobjects = optionalSubs

  return result
}

/**
 * Parse a property wikitext file into a structured dict.
 * @param {string} wikitext
 * @param {string} entityKey - e.g. "Has_name"
 * @returns {object}
 */
export function parseProperty(wikitext, entityKey) {
  const tc = extractTemplateCall(wikitext)
  const p = tc ? tc.params : new Map()

  const result = {
    id: entityKey,
    label: p.get('display_label') || toPageName(entityKey),
    description: p.get('has_description') || '',
    datatype: p.get('has_type') || '',
    cardinality: p.get('allows_multiple_values') === 'Yes' ? 'multiple' : 'single',
  }

  // Allowed values (enumerated, comma-separated)
  const allowsValue = p.get('allows_value')
  if (allowsValue) {
    result.allowed_values = splitComma(allowsValue)
  }

  // Allowed values from category
  const fromCategory = p.get('allows_value_from_category')
  if (fromCategory) {
    result.Allows_value_from_category = toEntityKey(fromCategory)
  }

  // Allowed pattern
  const pattern = p.get('allows_pattern')
  if (pattern) result.allowed_pattern = pattern

  // Allowed value list
  const valueList = p.get('allows_value_list')
  if (valueList) result.allowed_value_list = valueList

  // Display units (comma-separated)
  const displayUnits = p.get('display_units')
  if (displayUnits) {
    result.display_units = splitComma(displayUnits)
  }

  // Display precision
  const precision = p.get('display_precision')
  if (precision) result.display_precision = parseInt(precision, 10)

  // Unique values
  const unique = p.get('has_unique_values')
  if (unique === 'Yes') result.unique_values = true

  // Display template
  const template = p.get('has_template')
  if (template) {
    result.has_display_template = toEntityKey(template)
  }

  // Subproperty
  const parent = p.get('subproperty_of')
  if (parent) {
    result.parent_property = toEntityKey(parent)
  }

  return result
}

/**
 * Parse a subobject wikitext file into a structured dict.
 * @param {string} wikitext
 * @param {string} entityKey - e.g. "Address"
 * @returns {object}
 */
export function parseSubobject(wikitext, entityKey) {
  const tc = extractTemplateCall(wikitext)
  const p = tc ? tc.params : new Map()

  const result = {
    id: entityKey,
    label: p.get('display_label') || toPageName(entityKey),
    description: p.get('has_description') || '',
  }

  const requiredProps = commaToKeys(p.get('has_required_property'))
  if (requiredProps.length > 0) result.required_properties = requiredProps

  const optionalProps = commaToKeys(p.get('has_optional_property'))
  if (optionalProps.length > 0) result.optional_properties = optionalProps

  return result
}

/**
 * Parse a template wikitext file. Templates are raw wikitext with no annotation block.
 * @param {string} wikitext
 * @param {string} entityKey - e.g. "Property/Page"
 * @returns {object}
 */
export function parseTemplate(wikitext, entityKey) {
  return {
    id: entityKey,
    label: toPageName(entityKey),
    description: '',
    wikitext: wikitext.trimEnd(),
  }
}

/**
 * Parse a dashboard wikitext file. Dashboards are pure wikitext content.
 * For multi-page dashboards, each page is parsed separately and assembled
 * by the caller into the pages array.
 *
 * @param {string} wikitext
 * @param {string} pageName - e.g. "" for root, "Setup" for subpage
 * @returns {object} A single page entry {name, wikitext}
 */
export function parseDashboardPage(wikitext, pageName) {
  return {
    name: pageName,
    wikitext: wikitext.trimEnd(),
  }
}

/**
 * Parse a resource wikitext file into a structured dict.
 * Resources have a template call for their property values
 * and [[Category:X]] to identify their category.
 *
 * @param {string} wikitext
 * @param {string} entityKey - e.g. "Person/John_doe"
 * @returns {object}
 */
export function parseResource(wikitext, entityKey) {
  const tc = extractTemplateCall(wikitext)
  const p = tc ? tc.params : new Map()
  const categories = extractCategories(wikitext)

  // Find the category (non-management category)
  const category = categories.find(c => !c.startsWith('OntologySync-managed'))

  const result = {
    id: entityKey,
    label: p.get('display_label') || toPageName(entityKey.split('/').pop()),
    description: p.get('has_description') || '',
    category: category || '',
  }

  // Add all dynamic property parameters as fields
  for (const [key, value] of p) {
    // Skip metadata parameters
    if (['display_label', 'has_description'].includes(key)) continue

    // Convert param name (lowercase_underscored) back to entity key format
    // toParam lowercases everything, so we just capitalize the first letter
    const entityKeyName = key.charAt(0).toUpperCase() + key.slice(1)

    // Check if it's a comma-separated multi-value
    const values = splitComma(value)
    if (values.length > 1) {
      result[entityKeyName] = values
    } else {
      result[entityKeyName] = value
    }
  }

  return result
}

/**
 * Parse a module vocab.json into a structured dict matching the old module JSON format.
 * Extracts entity membership from the import array by namespace.
 *
 * @param {object} vocabJson - Parsed vocab.json content
 * @returns {object} Dict matching the old module JSON format
 */
export function parseModuleVocab(vocabJson) {
  const result = {
    id: vocabJson.id,
    version: vocabJson.version,
    label: vocabJson.label || vocabJson.id,
    description: vocabJson.description || '',
    dependencies: vocabJson.dependencies || [],
  }

  // Extract entity lists from import array
  const entities = {
    categories: [],
    properties: [],
    subobjects: [],
    templates: [],
    dashboards: [],
    resources: [],
  }

  for (const entry of vocabJson.import || []) {
    const entityType = NAMESPACE_TO_ENTITY_TYPE[entry.namespace]
    if (!entityType) continue

    // Derive entity key from importFrom path
    const importPath = entry.contents?.importFrom || ''
    let entityKey = importPathToEntityKey(importPath, entityType)

    // For dashboards, use only the root ID (subpages are part of the same entity)
    // e.g. "Core_overview/Setup" -> "Core_overview"
    if (entityType === 'dashboards' && entityKey.includes('/')) {
      entityKey = entityKey.split('/')[0]
    }

    if (entityKey && entities[entityType] && !entities[entityType].includes(entityKey)) {
      entities[entityType].push(entityKey)
    }
  }

  // Only include non-empty arrays
  for (const [type, keys] of Object.entries(entities)) {
    if (keys.length > 0) result[type] = keys
  }

  return result
}

/**
 * Convert an importFrom path to an entity key.
 * @param {string} importPath - e.g. "categories/Person.wikitext"
 * @param {string} entityType - e.g. "categories"
 * @returns {string} e.g. "Person"
 */
function importPathToEntityKey(importPath, entityType) {
  // Remove the entity type directory prefix
  const prefix = entityType + '/'
  let relative = importPath.startsWith(prefix) ? importPath.slice(prefix.length) : importPath

  // Remove .wikitext extension
  relative = relative.replace(/\.wikitext$/, '')

  return relative
}

/**
 * Detect entity type from file path.
 * @param {string} filePath - e.g. "categories/Person.wikitext" or "modules/Core.json"
 * @returns {{ entityType: string, entityKey: string, fileType: string } | null}
 */
export function parseFilePath(filePath) {
  const parts = filePath.split('/')
  if (parts.length < 2) return null

  const directory = parts[0]

  if (directory === 'modules' && filePath.endsWith('.json')) {
    const entityKey = parts[1].replace('.json', '')
    return { entityType: 'modules', entityKey, fileType: 'json' }
  }

  if (directory === 'bundles' && filePath.endsWith('.json')) {
    const entityKey = parts[1].replace('.json', '')
    return { entityType: 'bundles', entityKey, fileType: 'json' }
  }

  if (!filePath.endsWith('.wikitext')) return null

  // For templates and resources, entity key includes subdirectory
  // e.g. "templates/Property/Page.wikitext" -> "Property/Page"
  // e.g. "resources/Person/John_doe.wikitext" -> "Person/John_doe"
  const entityKey = parts.slice(1).join('/').replace('.wikitext', '')

  return { entityType: directory, entityKey, fileType: 'wikitext' }
}
