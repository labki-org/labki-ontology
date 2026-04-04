/**
 * Generates OntologySync wikitext files from structured entity dicts.
 *
 * This is the inverse of wikitext-parser.js. Given a dict in the same format
 * as the old JSON entity files, it produces wikitext with {{Template|param=value}} calls.
 */

import { toPageName, NAMESPACE_TO_ENTITY_TYPE } from './wikitext-parser.js'

// Reverse mapping: entity type -> namespace constant
const ENTITY_TYPE_TO_NAMESPACE = Object.fromEntries(
  Object.entries(NAMESPACE_TO_ENTITY_TYPE).map(([ns, type]) => [type, ns])
)

/**
 * Convert an entity key to a template parameter name (lowercase, underscored).
 * @param {string} entityKey - e.g. "Has_name"
 * @returns {string} e.g. "has_name"
 */
function toParam(entityKey) {
  return entityKey.toLowerCase().replace(/ /g, '_')
}

/**
 * Join an array of entity keys as comma-separated page names (with spaces).
 * @param {string[]} keys - e.g. ["Has_first_name", "Has_last_name"]
 * @returns {string} e.g. "Has first name, Has last name"
 */
function commaJoin(keys) {
  return keys.map(toPageName).join(', ')
}

/**
 * Build a {{TemplateName|param=value}} template call string.
 * @param {string} templateName - e.g. "Category"
 * @param {Array<[string, string]>} params - Array of [key, value] pairs
 * @returns {string} The formatted template call (multi-line)
 */
function buildTemplateCall(templateName, params) {
  if (params.length === 0) {
    return `{{${templateName}\n}}`
  }
  const lines = [`{{${templateName}`]
  for (const [key, value] of params) {
    lines.push(`|${key}=${value}`)
  }
  lines.push('}}')
  return lines.join('\n')
}

// ─── Entity-specific generators ─────────────────────────────────────────────

/**
 * Generate wikitext for a category entity.
 * @param {object} entity - Structured category dict
 * @returns {string} Wikitext content
 */
export function generateCategory(entity) {
  const params = []

  if (entity.description) {
    params.push(['has_description', entity.description])
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    params.push(['display_label', entity.label])
  }

  if (entity.parents?.length > 0) {
    params.push(['has_parent_category', commaJoin(entity.parents)])
  }
  if (entity.required_properties?.length > 0) {
    params.push(['has_required_property', commaJoin(entity.required_properties)])
  }
  if (entity.optional_properties?.length > 0) {
    params.push(['has_optional_property', commaJoin(entity.optional_properties)])
  }
  if (entity.required_subobjects?.length > 0) {
    params.push(['has_required_subobject', commaJoin(entity.required_subobjects)])
  }
  if (entity.optional_subobjects?.length > 0) {
    params.push(['has_optional_subobject', commaJoin(entity.optional_subobjects)])
  }

  const lines = [
    '<!-- OntologySync Start -->',
    buildTemplateCall('Category', params),
    '<!-- OntologySync End -->',
    '[[Category:OntologySync-managed]]',
  ]

  return lines.join('\n') + '\n'
}

/**
 * Generate wikitext for a property entity.
 * @param {object} entity - Structured property dict
 * @returns {string} Wikitext content
 */
export function generateProperty(entity) {
  const params = []

  if (entity.description) {
    params.push(['has_description', entity.description])
  }
  if (entity.datatype) {
    params.push(['has_type', entity.datatype])
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    params.push(['display_label', entity.label])
  }

  if (entity.cardinality === 'multiple') {
    params.push(['allows_multiple_values', 'Yes'])
  }

  // Allowed values (enumerated)
  if (Array.isArray(entity.allowed_values) && entity.allowed_values.length > 0) {
    params.push(['allows_value', entity.allowed_values.join(', ')])
  }

  // Allowed values from category
  if (entity.Allows_value_from_category) {
    params.push(['allows_value_from_category', toPageName(entity.Allows_value_from_category)])
  }

  // Allowed pattern
  if (entity.allowed_pattern) {
    params.push(['allows_pattern', entity.allowed_pattern])
  }

  // Allowed value list
  if (entity.allowed_value_list) {
    params.push(['allows_value_list', entity.allowed_value_list])
  }

  // Display units
  if (entity.display_units?.length > 0) {
    params.push(['display_units', entity.display_units.join(', ')])
  }

  // Display precision
  if (entity.display_precision !== undefined && entity.display_precision !== null) {
    params.push(['display_precision', String(entity.display_precision)])
  }

  // Unique values
  if (entity.unique_values === true) {
    params.push(['has_unique_values', 'Yes'])
  }

  // Display template
  if (entity.has_display_template) {
    params.push(['has_template', toPageName(entity.has_display_template)])
  }

  // Subproperty
  if (entity.parent_property) {
    params.push(['subproperty_of', toPageName(entity.parent_property)])
  }

  const lines = [
    '<!-- OntologySync Start -->',
    buildTemplateCall('Property', params),
    '<!-- OntologySync End -->',
    '[[Category:OntologySync-managed-property]]',
  ]

  return lines.join('\n') + '\n'
}

/**
 * Generate wikitext for a subobject entity.
 * @param {object} entity - Structured subobject dict
 * @returns {string} Wikitext content
 */
export function generateSubobject(entity) {
  const params = []

  if (entity.description) {
    params.push(['has_description', entity.description])
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    params.push(['display_label', entity.label])
  }

  if (entity.required_properties?.length > 0) {
    params.push(['has_required_property', commaJoin(entity.required_properties)])
  }
  if (entity.optional_properties?.length > 0) {
    params.push(['has_optional_property', commaJoin(entity.optional_properties)])
  }

  const lines = [
    '<!-- OntologySync Start -->',
    buildTemplateCall('Subobject', params),
    '<!-- OntologySync End -->',
    '[[Category:OntologySync-managed-subobject]]',
  ]

  return lines.join('\n') + '\n'
}

/**
 * Generate wikitext for a template entity. Templates are raw wikitext.
 * @param {object} entity - Structured template dict (must have .wikitext field)
 * @returns {string} Wikitext content
 */
export function generateTemplate(entity) {
  return (entity.wikitext || '') + '\n'
}

/**
 * Generate wikitext for a single dashboard page. Dashboards are pure wikitext.
 * @param {string} wikitext - The dashboard page content
 * @returns {string} Wikitext content
 */
export function generateDashboardPage(wikitext) {
  return (wikitext || '') + '\n'
}

/**
 * Generate wikitext for a resource entity.
 * @param {object} entity - Structured resource dict
 * @returns {string} Wikitext content
 */
export function generateResource(entity) {
  const params = []

  // Metadata properties
  if (entity.description) {
    params.push(['has_description', entity.description])
  }
  if (entity.label) {
    params.push(['display_label', entity.label])
  }

  // Dynamic property fields (everything that's not metadata)
  const metadataKeys = new Set(['id', 'label', 'description', 'category'])
  for (const [key, value] of Object.entries(entity)) {
    if (metadataKeys.has(key)) continue
    const paramName = toParam(key)
    if (Array.isArray(value)) {
      params.push([paramName, value.join(', ')])
    } else {
      params.push([paramName, String(value)])
    }
  }

  // Template name = first content category (or entity type from id)
  const templateName = entity.category || 'Resource'

  const lines = [
    '<!-- OntologySync Start -->',
    buildTemplateCall(templateName, params),
    '<!-- OntologySync End -->',
  ]

  // Category membership
  if (entity.category) {
    lines.push(`[[Category:${toPageName(entity.category)}]]`)
  }
  lines.push('[[Category:OntologySync-managed-resource]]')

  return lines.join('\n') + '\n'
}

// ─── Module vocab.json generator ────────────────────────────────────────────

/**
 * Generate a module vocab.json from a structured module dict and its entity file paths.
 *
 * @param {object} module - Module dict with id, version, label, description, dependencies, and entity arrays
 * @param {object} entityPaths - Map of entity keys to their relative file paths from the module root
 *   e.g. { "Person": { path: "categories/Person.wikitext", namespace: "NS_CATEGORY" } }
 * @param {string} ontologyVersion - Current ontology version
 * @returns {object} vocab.json content (serializable to JSON)
 */
export function generateModuleVocab(module, entityPaths, ontologyVersion) {
  const importEntries = []

  // Build import entries from entity paths
  for (const [entityKey, info] of Object.entries(entityPaths)) {
    importEntries.push({
      page: toPageName(entityKey),
      namespace: info.namespace,
      contents: { importFrom: info.path },
      options: { replaceable: true },
    })
  }

  return {
    description: module.description || '',
    id: module.id,
    version: module.version,
    label: module.label || module.id,
    dependencies: module.dependencies || [],
    import: importEntries,
    meta: {
      version: '1',
      ontologyVersion: ontologyVersion || '',
    },
  }
}

/**
 * Build entity paths map from a module's entity arrays.
 * Maps each entity key to its file path and namespace constant.
 *
 * @param {object} module - Module dict with entity arrays (categories, properties, etc.)
 * @returns {object} Map of entity key -> { path, namespace }
 */
export function buildEntityPaths(module) {
  const paths = {}

  const entityArrays = {
    categories: { dir: 'categories', namespace: 'NS_CATEGORY' },
    properties: { dir: 'properties', namespace: 'SMW_NS_PROPERTY' },
    subobjects: { dir: 'subobjects', namespace: 'NS_SUBOBJECT' },
    templates: { dir: 'templates', namespace: 'NS_TEMPLATE' },
    dashboards: { dir: 'dashboards', namespace: 'NS_ONTOLOGY_DASHBOARD' },
    resources: { dir: 'resources', namespace: 'NS_ONTOLOGY_RESOURCE' },
  }

  for (const [type, { dir, namespace }] of Object.entries(entityArrays)) {
    for (const key of module[type] || []) {
      paths[key] = {
        path: `${dir}/${key}.wikitext`,
        namespace,
      }
    }
  }

  return paths
}

/**
 * Generate a bundle vocab.json by merging import entries from all constituent modules.
 *
 * @param {object} bundle - Bundle dict with id, version, label, description, modules
 * @param {object[]} moduleVocabs - Array of module vocab.json contents
 * @param {string} ontologyVersion
 * @returns {object} Combined vocab.json
 */
export function generateBundleVocab(bundle, moduleVocabs, ontologyVersion) {
  const allImports = []
  const moduleVersions = {}

  for (const vocab of moduleVocabs) {
    allImports.push(...(vocab.import || []))
    moduleVersions[vocab.id] = vocab.version
  }

  return {
    description: bundle.description || '',
    id: bundle.id,
    version: bundle.version,
    label: bundle.label || bundle.id,
    modules: moduleVersions,
    import: allImports,
    meta: {
      version: '1',
      ontologyVersion: ontologyVersion || '',
    },
  }
}
