import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import { ENTITY_TYPES_SET, GLOB_IGNORE_PATTERNS } from './constants.js'
import {
  parseCategory,
  parseProperty,
  parseSubobject,
  parseTemplate,
  parseDashboardPage,
  parseResource,
  parseFilePath,
} from './wikitext-parser.js'

/**
 * Wikitext parser dispatch by entity type directory name
 */
const WIKITEXT_PARSERS = {
  categories: parseCategory,
  properties: parseProperty,
  subobjects: parseSubobject,
  templates: parseTemplate,
  resources: parseResource,
}

/**
 * Build an index of all entities in the project.
 *
 * Discovers .wikitext files for entity content, .json for modules,
 * and .json for bundles. Parses wikitext into structured dicts matching
 * the old JSON format so downstream validators work unchanged.
 *
 * @param {string} rootDir - Root directory to search from (defaults to cwd)
 * @returns {Promise<Object>} Entity index with Maps for each entity type
 */
export async function buildEntityIndex(rootDir = process.cwd()) {
  const index = {
    categories: new Map(),
    properties: new Map(),
    subobjects: new Map(),
    templates: new Map(),
    modules: new Map(),
    bundles: new Map(),
    dashboards: new Map(),
    resources: new Map()
  }

  // Discover all entity files (.wikitext, .json for modules/bundles)
  const files = await fg(
    ['**/*.wikitext', 'modules/*.json', 'bundles/*.json'],
    {
      ignore: GLOB_IGNORE_PATTERNS,
      cwd: rootDir,
      absolute: false,
      onlyFiles: true
    }
  )

  // Temporary storage for assembling multi-page dashboards
  const dashboardPages = new Map() // dashboardId -> [{name, wikitext, filePath}]

  for (const relativePath of files) {
    const parsed = parseFilePath(relativePath)
    if (!parsed) continue

    const { entityType, entityKey, fileType } = parsed

    if (!ENTITY_TYPES_SET.has(entityType)) continue

    const absolutePath = path.join(rootDir, relativePath)

    try {
      if (fileType === 'wikitext') {
        const content = fs.readFileSync(absolutePath, 'utf8')

        // Dashboards: collect pages for assembly
        if (entityType === 'dashboards') {
          const dashboardId = entityKey.split('/')[0]
          const pageName = entityKey.includes('/') ? entityKey.split('/').slice(1).join('/') : ''

          if (!dashboardPages.has(dashboardId)) {
            dashboardPages.set(dashboardId, [])
          }
          const page = parseDashboardPage(content, pageName)
          dashboardPages.get(dashboardId).push({
            ...page,
            _filePath: relativePath,
          })
          continue
        }

        // All other wikitext entity types
        const parser = WIKITEXT_PARSERS[entityType]
        if (!parser) continue

        const data = parser(content, entityKey)
        if (!data.id) continue

        index[entityType].set(data.id, { ...data, _filePath: relativePath })
      } else if (fileType === 'json') {
        // Module or bundle JSON
        const content = fs.readFileSync(absolutePath, 'utf8')
        const data = JSON.parse(content)
        if (!data.id) continue

        if (entityType === 'modules') {
          index.modules.set(data.id, { ...data, _filePath: relativePath })
        } else {
          index.bundles.set(data.id, { ...data, _filePath: relativePath })
        }
      }
    } catch (err) {
      // Skip files that can't be parsed (validate.js handles parse errors)
      continue
    }
  }

  // Assemble dashboard entities from collected pages
  for (const [dashboardId, pages] of dashboardPages) {
    // Sort: root page first, then subpages alphabetically
    pages.sort((a, b) => {
      if (a.name === '') return -1
      if (b.name === '') return 1
      return a.name.localeCompare(b.name)
    })

    const rootPage = pages.find(p => p.name === '')
    const filePath = rootPage?._filePath || `dashboards/${dashboardId}.wikitext`

    const dashboard = {
      id: dashboardId,
      label: dashboardId.replace(/_/g, ' '),
      description: '',
      pages: pages.map(({ name, wikitext }) => ({ name, wikitext })),
      _filePath: filePath,
    }

    index.dashboards.set(dashboardId, dashboard)
  }

  return index
}
