import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ENTITY_TYPES } from '../lib/constants.js'
import {
  generateCategory,
  generateProperty,
  generateSubobject,
  generateTemplate,
  generateResource,
} from '../lib/wikitext-generator.js'

/**
 * Create a managed temporary directory for testing
 *
 * @param {string} prefix - Prefix for the temp directory name
 * @returns {Object} Temp directory manager with helper methods
 *
 * @example
 * const tempDir = createTempDir('test-')
 * tempDir.writeFile('foo.json', '{"id": "foo"}')
 * const content = tempDir.readFile('foo.json')
 * tempDir.cleanup()
 */
export function createTempDir(prefix = 'test-') {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), prefix))

  return {
    /**
     * The absolute path to the temp directory
     */
    path: dirPath,

    /**
     * Write a file to the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @param {string|Buffer} content - File content
     * @returns {string} Absolute path to the written file
     */
    writeFile(relativePath, content) {
      const absolutePath = path.join(dirPath, relativePath)
      const dir = path.dirname(absolutePath)

      // Ensure parent directories exist
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(absolutePath, content)

      return absolutePath
    },

    /**
     * Write a JSON file to the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @param {object} data - Data to JSON stringify
     * @returns {string} Absolute path to the written file
     */
    writeJSON(relativePath, data) {
      return this.writeFile(relativePath, JSON.stringify(data, null, 2) + '\n')
    },

    /**
     * Read a file from the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @returns {string} File content
     */
    readFile(relativePath) {
      const absolutePath = path.join(dirPath, relativePath)
      return fs.readFileSync(absolutePath, 'utf8')
    },

    /**
     * Read and parse a JSON file from the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @returns {object} Parsed JSON data
     */
    readJSON(relativePath) {
      return JSON.parse(this.readFile(relativePath))
    },

    /**
     * Check if a file exists in the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @returns {boolean} True if file exists
     */
    exists(relativePath) {
      const absolutePath = path.join(dirPath, relativePath)
      return fs.existsSync(absolutePath)
    },

    /**
     * Create a subdirectory in the temp directory
     *
     * @param {string} relativePath - Path relative to temp directory
     * @returns {string} Absolute path to the created directory
     */
    mkdir(relativePath) {
      const absolutePath = path.join(dirPath, relativePath)
      fs.mkdirSync(absolutePath, { recursive: true })
      return absolutePath
    },

    /**
     * List files in a subdirectory
     *
     * @param {string} relativePath - Path relative to temp directory (default: root)
     * @returns {string[]} Array of file/directory names
     */
    list(relativePath = '') {
      const absolutePath = path.join(dirPath, relativePath)
      return fs.readdirSync(absolutePath)
    },

    /**
     * Get absolute path for a relative path
     *
     * @param {string} relativePath - Path relative to temp directory
     * @returns {string} Absolute path
     */
    resolve(relativePath) {
      return path.join(dirPath, relativePath)
    },

    /**
     * Clean up the temp directory (remove all files and the directory)
     */
    cleanup() {
      fs.rmSync(dirPath, { recursive: true, force: true })
    }
  }
}

/**
 * Create a temp directory with entity structure for testing
 *
 * @param {Object} entities - Entity definitions by type
 * @returns {Object} Temp directory manager
 *
 * @example
 * const tempDir = createEntityTempDir({
 *   categories: [{ id: 'Agent', label: 'Agent' }],
 *   properties: [{ id: 'Name', label: 'Name', datatype: 'Text' }]
 * })
 */
/**
 * Wikitext generators by entity type
 */
const WIKITEXT_GENERATORS = {
  categories: generateCategory,
  properties: generateProperty,
  subobjects: generateSubobject,
  templates: generateTemplate,
  resources: generateResource,
}

export function createEntityTempDir(entities = {}) {
  const tempDir = createTempDir('entity-')

  for (const type of ENTITY_TYPES) {
    const typeEntities = entities[type] || []
    for (const entity of typeEntities) {
      if (type === 'modules') {
        // Modules use simple JSON format
        tempDir.writeJSON(`modules/${entity.id}.json`, entity)
      } else if (type === 'bundles') {
        // Bundles stay as JSON
        tempDir.writeJSON(`bundles/${entity.id}.json`, entity)
      } else if (WIKITEXT_GENERATORS[type]) {
        // All other entity types use wikitext
        const wikitext = WIKITEXT_GENERATORS[type](entity)
        tempDir.writeFile(`${type}/${entity.id}.wikitext`, wikitext)
      }
    }
  }

  return tempDir
}
