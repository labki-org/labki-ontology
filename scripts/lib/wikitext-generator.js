/**
 * Generates OntologySync wikitext files from structured entity dicts.
 *
 * This is the inverse of wikitext-parser.js. Given a dict in the same format
 * as the old JSON entity files, it produces wikitext with semantic annotations.
 */

import { toPageName, NAMESPACE_TO_ENTITY_TYPE } from './wikitext-parser.js'

// Reverse mapping: entity type -> namespace constant
const ENTITY_TYPE_TO_NAMESPACE = Object.fromEntries(
  Object.entries(NAMESPACE_TO_ENTITY_TYPE).map(([ns, type]) => [type, ns])
)

/**
 * Add a namespace prefix to an entity key for use in wikitext annotations.
 * @param {string} entityKey - e.g. "Has_name"
 * @param {string} ns - e.g. "Property"
 * @returns {string} e.g. "Property:Has name"
 */
function withNamespace(entityKey, ns) {
  return `${ns}:${toPageName(entityKey)}`
}

// ─── Entity-specific generators ─────────────────────────────────────────────

/**
 * Generate wikitext for a category entity.
 * @param {object} entity - Structured category dict
 * @returns {string} Wikitext content
 */
export function generateCategory(entity) {
  const lines = ['<!-- OntologySync Start -->']

  if (entity.description) {
    lines.push(`[[Has description::${entity.description}]]`)
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    lines.push(`[[Display label::${entity.label}]]`)
  }

  for (const parent of entity.parents || []) {
    lines.push(`[[Has parent category::${withNamespace(parent, 'Category')}]]`)
  }
  for (const prop of entity.required_properties || []) {
    lines.push(`[[Has required property::${withNamespace(prop, 'Property')}]]`)
  }
  for (const prop of entity.optional_properties || []) {
    lines.push(`[[Has optional property::${withNamespace(prop, 'Property')}]]`)
  }
  for (const sub of entity.required_subobjects || []) {
    lines.push(`[[Has required subobject::${withNamespace(sub, 'Subobject')}]]`)
  }
  for (const sub of entity.optional_subobjects || []) {
    lines.push(`[[Has optional subobject::${withNamespace(sub, 'Subobject')}]]`)
  }

  lines.push('<!-- OntologySync End -->')
  lines.push('[[Category:OntologySync-managed]]')

  return lines.join('\n') + '\n'
}

/**
 * Generate wikitext for a property entity.
 * @param {object} entity - Structured property dict
 * @returns {string} Wikitext content
 */
export function generateProperty(entity) {
  const lines = ['<!-- OntologySync Start -->']

  lines.push(`[[Has type::${entity.datatype}]]`)

  if (entity.description) {
    lines.push(`[[Has description::${entity.description}]]`)
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    lines.push(`[[Display label::${entity.label}]]`)
  }

  if (entity.cardinality === 'multiple') {
    lines.push('[[Allows multiple values::true]]')
  }

  // Allowed values (enumerated)
  if (Array.isArray(entity.allowed_values)) {
    for (const value of entity.allowed_values) {
      lines.push(`[[Allows value::${value}]]`)
    }
  }

  // Allowed values from category
  if (entity.Allows_value_from_category) {
    lines.push(`[[Allows value from category::${withNamespace(entity.Allows_value_from_category, 'Category')}]]`)
  }

  // Allowed pattern
  if (entity.allowed_pattern) {
    lines.push(`[[Allows pattern::${entity.allowed_pattern}]]`)
  }

  // Allowed value list
  if (entity.allowed_value_list) {
    lines.push(`[[Allows value list::${entity.allowed_value_list}]]`)
  }

  // Display units
  if (entity.display_units) {
    for (const unit of entity.display_units) {
      lines.push(`[[Display units::${unit}]]`)
    }
  }

  // Display precision
  if (entity.display_precision !== undefined && entity.display_precision !== null) {
    lines.push(`[[Display precision::${entity.display_precision}]]`)
  }

  // Unique values
  if (entity.unique_values === true) {
    lines.push('[[Has unique values::true]]')
  }

  // Display template
  if (entity.has_display_template) {
    lines.push(`[[Has template::${withNamespace(entity.has_display_template, 'Template')}]]`)
  }

  // Subproperty
  if (entity.parent_property) {
    lines.push(`[[Subproperty of::${withNamespace(entity.parent_property, 'Property')}]]`)
  }

  lines.push('<!-- OntologySync End -->')
  lines.push('[[Category:OntologySync-managed-property]]')

  return lines.join('\n') + '\n'
}

/**
 * Generate wikitext for a subobject entity.
 * @param {object} entity - Structured subobject dict
 * @returns {string} Wikitext content
 */
export function generateSubobject(entity) {
  const lines = ['<!-- OntologySync Start -->']

  if (entity.description) {
    lines.push(`[[Has description::${entity.description}]]`)
  }
  if (entity.label && entity.label !== toPageName(entity.id)) {
    lines.push(`[[Display label::${entity.label}]]`)
  }

  for (const prop of entity.required_properties || []) {
    lines.push(`[[Has required property::${withNamespace(prop, 'Property')}]]`)
  }
  for (const prop of entity.optional_properties || []) {
    lines.push(`[[Has optional property::${withNamespace(prop, 'Property')}]]`)
  }

  lines.push('<!-- OntologySync End -->')
  lines.push('[[Category:OntologySync-managed-subobject]]')

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
  const lines = ['<!-- OntologySync Start -->']

  // Metadata properties
  if (entity.description) {
    lines.push(`[[Has description::${entity.description}]]`)
  }
  if (entity.label) {
    lines.push(`[[Display label::${entity.label}]]`)
  }

  // Dynamic property fields (everything that's not metadata)
  const metadataKeys = new Set(['id', 'label', 'description', 'category'])
  for (const [key, value] of Object.entries(entity)) {
    if (metadataKeys.has(key)) continue
    const pageName = toPageName(key)
    if (Array.isArray(value)) {
      for (const v of value) {
        lines.push(`[[${pageName}::${v}]]`)
      }
    } else {
      lines.push(`[[${pageName}::${value}]]`)
    }
  }

  lines.push('<!-- OntologySync End -->')

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
