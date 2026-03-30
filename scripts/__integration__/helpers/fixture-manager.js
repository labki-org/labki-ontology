import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createTempDir } from '../../__fixtures__/temp-dir.js'
import { ENTITY_TYPES } from '../../lib/constants.js'
import {
  generateCategory,
  generateProperty,
  generateSubobject,
  generateTemplate,
  generateResource,
} from '../../lib/wikitext-generator.js'

/** Wikitext generators by entity type */
const WIKITEXT_GENERATORS = {
  categories: generateCategory,
  properties: generateProperty,
  subobjects: generateSubobject,
  templates: generateTemplate,
  resources: generateResource,
}

/**
 * Create a temporary fixture directory with entity structure
 *
 * Extends createTempDir with additional schema and entity management features.
 *
 * @param {string} name - Fixture name (for temp directory prefix)
 * @returns {Object} Fixture manager
 */
export function createTempFixture(name = 'test-fixture') {
  const tempDir = createTempDir(`${name}-`)

  const fixture = {
    /**
     * Root path of the fixture
     */
    path: tempDir.path,

    /**
     * Write a file to the fixture
     */
    writeFile: tempDir.writeFile.bind(tempDir),

    /**
     * Write a JSON file to the fixture.
     * For entity types (categories, properties, etc.), auto-converts to wikitext format.
     * For modules, writes JSON directly.
     * For bundles and non-entity files, writes JSON directly.
     */
    writeJSON(relativePath, data) {
      const parts = relativePath.split('/')
      const dir = parts[0]

      // Auto-convert entity JSON to wikitext format
      if (WIKITEXT_GENERATORS[dir] && relativePath.endsWith('.json')) {
        const wikitext = WIKITEXT_GENERATORS[dir](data)
        const wikitextPath = relativePath.replace(/\.json$/, '.wikitext')
        return tempDir.writeFile(wikitextPath, wikitext)
      }

      // Modules and bundles: write JSON directly
      return tempDir.writeJSON(relativePath, data)
    },

    /**
     * Read a file from the fixture
     */
    readFile: tempDir.readFile.bind(tempDir),

    /**
     * Read and parse a JSON file
     */
    readJSON: tempDir.readJSON.bind(tempDir),

    /**
     * Check if a file exists
     */
    exists: tempDir.exists.bind(tempDir),

    /**
     * Create standard entity directory structure
     */
    createEntityDirectories() {
      for (const dir of ENTITY_TYPES) {
        tempDir.mkdir(dir)
      }
    },

    /**
     * Write entity schemas to fixture (no-op — wikitext format doesn't use _schema.json)
     */
    writeSchemas() {
      // No-op: wikitext format doesn't use JSON Schema validation
    },

    /**
     * Write an entity file in the correct format for its type.
     * Categories, properties, subobjects, templates, resources -> .wikitext
     * Modules -> .json
     * Bundles -> .json
     *
     * @param {string} entityType - e.g. 'categories', 'modules', 'bundles'
     * @param {object} entity - Entity data with id field
     */
    writeEntity(entityType, entity) {
      if (entityType === 'modules') {
        tempDir.writeJSON(`modules/${entity.id}.json`, entity)
      } else if (entityType === 'bundles') {
        this.writeJSON(`bundles/${entity.id}.json`, entity)
      } else if (WIKITEXT_GENERATORS[entityType]) {
        const wikitext = WIKITEXT_GENERATORS[entityType](entity)
        this.writeFile(`${entityType}/${entity.id}.wikitext`, wikitext)
      }
    },

    /**
     * Write VERSION file
     *
     * @param {string} version - Semver version string
     */
    writeVersion(version) {
      this.writeFile('VERSION', version + '\n')
    },

    /**
     * Clean up the fixture (delete directory)
     */
    cleanup: tempDir.cleanup.bind(tempDir)
  }

  return fixture
}

/**
 * Create a git-initialized fixture for testing git-dependent functionality
 *
 * @param {string} name - Fixture name
 * @returns {Object} Git fixture manager (extends createTempFixture)
 */
export function createGitFixture(name = 'git-fixture') {
  const fixture = createTempFixture(name)

  // Initialize git repo using execFileSync for security
  execFileSync('git', ['init'], { cwd: fixture.path, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: fixture.path, stdio: 'pipe' })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: fixture.path, stdio: 'pipe' })

  // Add git-specific methods
  return {
    ...fixture,

    /**
     * Stage and commit all changes
     *
     * @param {string} message - Commit message
     */
    commit(message) {
      execFileSync('git', ['add', '-A'], { cwd: fixture.path, stdio: 'pipe' })
      execFileSync('git', ['commit', '-m', message], { cwd: fixture.path, stdio: 'pipe' })
    },

    /**
     * Create a branch
     *
     * @param {string} branchName - Branch name
     */
    createBranch(branchName) {
      execFileSync('git', ['checkout', '-b', branchName], { cwd: fixture.path, stdio: 'pipe' })
    },

    /**
     * Checkout a branch
     *
     * @param {string} branchName - Branch name
     */
    checkout(branchName) {
      execFileSync('git', ['checkout', branchName], { cwd: fixture.path, stdio: 'pipe' })
    },

    /**
     * Get current branch name
     *
     * @returns {string} Current branch name
     */
    getCurrentBranch() {
      return execFileSync('git', ['branch', '--show-current'], { cwd: fixture.path, encoding: 'utf8' }).trim()
    },

    /**
     * Setup a base branch with initial commit
     */
    setupBaseBranch() {
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      // Create initial structure
      fixture.writeEntity('categories', { id: 'Agent', label: 'Agent', description: 'An agent' })
      fixture.writeEntity('properties', { id: 'Has_name', label: 'Name', description: 'A name', datatype: 'Text', cardinality: 'single' })
      fixture.writeEntity('modules', {
        id: 'Core', label: 'Core', description: 'Core module',
        categories: ['Agent'], properties: ['Has_name'],
        subobjects: [], templates: []
      })
      fixture.writeEntity('bundles', { id: 'Default', label: 'Default', description: 'Default', modules: ['Core'] })

      this.commit('Initial commit')
    },

    cleanup() {
      fixture.cleanup()
    }
  }
}

/**
 * Clean up a fixture directory
 *
 * @param {string} dir - Directory path
 */
export function cleanupFixture(dir) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}
