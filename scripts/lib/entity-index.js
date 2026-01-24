import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Known entity types that are indexed
 */
const ENTITY_TYPES = new Set([
  'categories',
  'properties',
  'subobjects',
  'templates',
  'modules',
  'bundles'
])

/**
 * Build an index of all entities in the project
 *
 * @param {string} rootDir - Root directory to search from (defaults to cwd)
 * @returns {Promise<Object>} Entity index with Maps for each entity type
 *
 * @example
 * const index = await buildEntityIndex();
 * // {
 * //   categories: Map<id, entity>,
 * //   properties: Map<id, entity>,
 * //   subobjects: Map<id, entity>,
 * //   templates: Map<id, entity>,
 * //   modules: Map<id, entity>,
 * //   bundles: Map<id, entity>
 * // }
 */
export async function buildEntityIndex(rootDir = process.cwd()) {
  // Initialize Maps for each entity type
  const index = {
    categories: new Map(),
    properties: new Map(),
    subobjects: new Map(),
    templates: new Map(),
    modules: new Map(),
    bundles: new Map()
  }

  // Discover all JSON files
  const files = await fg(
    ['**/*.json'],
    {
      ignore: [
        '**/_schema.json',
        '**/node_modules/**',
        '**/versions/**',  // Exclude generated version artifacts
        'package*.json',
        '.planning/**',
        '.claude/**',
        '.**/**'
      ],
      cwd: rootDir,
      absolute: false,
      onlyFiles: true
    }
  )

  // Process each file
  for (const relativePath of files) {
    // Determine entity type from first path segment
    const firstSegment = relativePath.split('/')[0]

    // Skip files not in known entity type directories
    if (!ENTITY_TYPES.has(firstSegment)) {
      continue
    }

    const absolutePath = path.join(rootDir, relativePath)

    // Parse entity file
    let data
    try {
      const content = fs.readFileSync(absolutePath, 'utf8')
      data = JSON.parse(content)
    } catch (err) {
      // Skip files that can't be parsed (validate.js handles parse errors)
      continue
    }

    // Entity must have an id field
    if (!data.id) {
      continue
    }

    // Store entity with metadata
    const entity = {
      ...data,
      _filePath: relativePath
    }

    // Key by entity's id field (not filename)
    index[firstSegment].set(data.id, entity)
  }

  return index
}
