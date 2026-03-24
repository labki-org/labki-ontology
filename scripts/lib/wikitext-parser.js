/**
 * Parses OntologySync wikitext files into structured entity dicts.
 *
 * Wikitext files use semantic annotations within <!-- OntologySync Start/End --> blocks.
 * Each annotation is a [[Property::Value]] pair on its own line.
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
 * Strip a namespace prefix from a value and convert to entity key.
 * @param {string} value - e.g. "Property:Has name" or "Category:Agent"
 * @param {string} expectedNs - e.g. "Property" or "Category"
 * @returns {string} e.g. "Has_name" or "Agent"
 */
function stripNamespace(value, expectedNs) {
  const prefix = expectedNs + ':'
  const stripped = value.startsWith(prefix) ? value.slice(prefix.length) : value
  return toEntityKey(stripped)
}

/**
 * Extract semantic annotations from wikitext content.
 * Parses lines between <!-- OntologySync Start --> and <!-- OntologySync End --> markers.
 *
 * @param {string} wikitext - Full wikitext content
 * @returns {Map<string, string[]>} Map of property name -> array of values
 */
export function extractAnnotations(wikitext) {
  const annotations = new Map()
  const lines = wikitext.split('\n')

  let inBlock = false
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

    if (!inBlock) continue

    // Match [[Property::Value]] pattern
    const match = trimmed.match(/^\[\[([^:[\]]+)::(.+)\]\]$/)
    if (match) {
      const [, property, value] = match
      if (!annotations.has(property)) {
        annotations.set(property, [])
      }
      annotations.get(property).push(value)
    }
  }

  return annotations
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

/**
 * Get first value from annotations map, or default.
 */
function first(annotations, property, defaultValue = '') {
  const values = annotations.get(property)
  return values && values.length > 0 ? values[0] : defaultValue
}

/**
 * Get all values for a property, stripping a namespace prefix and converting to entity keys.
 */
function allStripped(annotations, property, ns) {
  const values = annotations.get(property) || []
  return values.map(v => stripNamespace(v, ns))
}

// ─── Entity-specific parsers ────────────────────────────────────────────────

/**
 * Parse a category wikitext file into a structured dict.
 * @param {string} wikitext - File content
 * @param {string} entityKey - Entity key derived from filename (e.g. "Person")
 * @returns {object} Dict matching the old JSON format
 */
export function parseCategory(wikitext, entityKey) {
  const ann = extractAnnotations(wikitext)

  const result = {
    id: entityKey,
    label: first(ann, 'Display label', toPageName(entityKey)),
    description: first(ann, 'Has description', ''),
  }

  const parents = allStripped(ann, 'Has parent category', 'Category')
  if (parents.length > 0) result.parents = parents

  const requiredProps = allStripped(ann, 'Has required property', 'Property')
  if (requiredProps.length > 0) result.required_properties = requiredProps

  const optionalProps = allStripped(ann, 'Has optional property', 'Property')
  if (optionalProps.length > 0) result.optional_properties = optionalProps

  const requiredSubs = allStripped(ann, 'Has required subobject', 'Subobject')
  if (requiredSubs.length > 0) result.required_subobjects = requiredSubs

  const optionalSubs = allStripped(ann, 'Has optional subobject', 'Subobject')
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
  const ann = extractAnnotations(wikitext)

  const result = {
    id: entityKey,
    label: first(ann, 'Display label', toPageName(entityKey)),
    description: first(ann, 'Has description', ''),
    datatype: first(ann, 'Has type', ''),
    cardinality: first(ann, 'Allows multiple values') === 'true' ? 'multiple' : 'single',
  }

  // Allowed values (enumerated)
  const allowedValues = ann.get('Allows value')
  if (allowedValues && allowedValues.length > 0) {
    result.allowed_values = allowedValues
  }

  // Allowed values from category
  const fromCategory = first(ann, 'Allows value from category')
  if (fromCategory) {
    result.Allows_value_from_category = stripNamespace(fromCategory, 'Category')
  }

  // Allowed pattern
  const pattern = first(ann, 'Allows pattern')
  if (pattern) result.allowed_pattern = pattern

  // Allowed value list
  const valueList = first(ann, 'Allows value list')
  if (valueList) result.allowed_value_list = valueList

  // Display units
  const displayUnits = ann.get('Display units')
  if (displayUnits && displayUnits.length > 0) {
    result.display_units = displayUnits
  }

  // Display precision
  const precision = first(ann, 'Display precision')
  if (precision) result.display_precision = parseInt(precision, 10)

  // Unique values
  const unique = first(ann, 'Has unique values')
  if (unique === 'true') result.unique_values = true

  // Display template
  const template = first(ann, 'Has template')
  if (template) {
    result.has_display_template = stripNamespace(template, 'Template')
  }

  // Subproperty
  const parent = first(ann, 'Subproperty of')
  if (parent) {
    result.parent_property = stripNamespace(parent, 'Property')
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
  const ann = extractAnnotations(wikitext)

  const result = {
    id: entityKey,
    label: first(ann, 'Display label', toPageName(entityKey)),
    description: first(ann, 'Has description', ''),
  }

  const requiredProps = allStripped(ann, 'Has required property', 'Property')
  if (requiredProps.length > 0) result.required_properties = requiredProps

  const optionalProps = allStripped(ann, 'Has optional property', 'Property')
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
 * Resources have semantic annotations for their property values
 * and a [[Category:X]] to identify their category.
 *
 * @param {string} wikitext
 * @param {string} entityKey - e.g. "Person/John_doe"
 * @returns {object}
 */
export function parseResource(wikitext, entityKey) {
  const ann = extractAnnotations(wikitext)
  const categories = extractCategories(wikitext)

  // Find the category (non-management category)
  const category = categories.find(c => !c.startsWith('OntologySync-managed'))

  const result = {
    id: entityKey,
    label: first(ann, 'Display label', toPageName(entityKey.split('/').pop())),
    description: first(ann, 'Has description', ''),
    category: category || '',
  }

  // Add all property annotations as dynamic fields
  for (const [property, values] of ann) {
    // Skip metadata properties
    if (['Display label', 'Has description'].includes(property)) continue

    const key = toEntityKey(property)
    result[key] = values.length === 1 ? values[0] : values
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
 * @param {string} filePath - e.g. "categories/Person.wikitext" or "modules/Core.vocab.json"
 * @returns {{ entityType: string, entityKey: string, fileType: string } | null}
 */
export function parseFilePath(filePath) {
  const parts = filePath.split('/')
  if (parts.length < 2) return null

  const directory = parts[0]

  if (directory === 'modules' && filePath.endsWith('.vocab.json')) {
    const entityKey = parts[1].replace('.vocab.json', '')
    return { entityType: 'modules', entityKey, fileType: 'vocab.json' }
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
