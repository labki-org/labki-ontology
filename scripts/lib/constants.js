/**
 * Entity types array (used across multiple files)
 */
export const ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates', 'modules', 'bundles']

/**
 * Entity types for module contents (excludes modules/bundles)
 */
export const MODULE_ENTITY_TYPES = ['categories', 'properties', 'subobjects', 'templates']

/**
 * Glob ignore patterns for file discovery
 */
export const GLOB_IGNORE_PATTERNS = [
  '**/_schema.json',
  '**/node_modules/**',
  '**/versions/**',
  'package*.json',
  '.planning/**',
  '.claude/**',
  '.**/**',
  'VERSION_OVERRIDES.schema.json',
  'scripts/**'
]

/**
 * Bump priority levels for comparison
 */
export const BUMP_PRIORITY = { major: 3, minor: 2, patch: 1 }
