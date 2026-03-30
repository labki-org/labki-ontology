/**
 * Entity types array (used across multiple files)
 */
export const ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates', 'modules', 'bundles', 'dashboards', 'resources']

/**
 * Entity types as a Set for efficient lookup
 */
export const ENTITY_TYPES_SET = new Set(ENTITY_TYPES)

/**
 * Entity types for module contents (excludes modules/bundles)
 */
export const MODULE_ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates', 'dashboards', 'resources']

/**
 * Glob patterns for discovering entity source files
 */
export const WIKITEXT_GLOB = '**/*.wikitext'
export const MODULE_GLOB = 'modules/*.json'
export const BUNDLE_GLOB = 'bundles/*.json'

/**
 * Glob ignore patterns for file discovery
 */
export const GLOB_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/versions/**',
  'package*.json',
  '.planning/**',
  '.claude/**',
  '.**/**',
  '*.schema.json',
  'scripts/**'
]

/**
 * Namespace constant to entity type mapping
 */
export const NAMESPACE_TO_ENTITY_TYPE = {
  'NS_CATEGORY': 'categories',
  'SMW_NS_PROPERTY': 'properties',
  'NS_SUBOBJECT': 'subobjects',
  'NS_TEMPLATE': 'templates',
  'NS_ONTOLOGY_DASHBOARD': 'dashboards',
  'NS_ONTOLOGY_RESOURCE': 'resources',
}
