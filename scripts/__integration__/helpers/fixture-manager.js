import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

/**
 * Create a temporary fixture directory with entity structure
 *
 * @param {string} name - Fixture name (for temp directory prefix)
 * @returns {Object} Fixture manager
 */
export function createTempFixture(name = 'test-fixture') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`))

  const fixture = {
    /**
     * Root path of the fixture
     */
    path: tempDir,

    /**
     * Write a file to the fixture
     *
     * @param {string} relativePath - Path relative to fixture root
     * @param {string|Buffer} content - File content
     */
    writeFile(relativePath, content) {
      const absolutePath = path.join(tempDir, relativePath)
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
      fs.writeFileSync(absolutePath, content)
    },

    /**
     * Write a JSON file to the fixture
     *
     * @param {string} relativePath - Path relative to fixture root
     * @param {object} data - Data to JSON stringify
     */
    writeJSON(relativePath, data) {
      this.writeFile(relativePath, JSON.stringify(data, null, 2) + '\n')
    },

    /**
     * Read a file from the fixture
     *
     * @param {string} relativePath - Path relative to fixture root
     * @returns {string} File content
     */
    readFile(relativePath) {
      return fs.readFileSync(path.join(tempDir, relativePath), 'utf8')
    },

    /**
     * Read and parse a JSON file
     *
     * @param {string} relativePath - Path relative to fixture root
     * @returns {object} Parsed JSON data
     */
    readJSON(relativePath) {
      return JSON.parse(this.readFile(relativePath))
    },

    /**
     * Check if a file exists
     *
     * @param {string} relativePath - Path relative to fixture root
     * @returns {boolean}
     */
    exists(relativePath) {
      return fs.existsSync(path.join(tempDir, relativePath))
    },

    /**
     * Create standard entity directory structure
     */
    createEntityDirectories() {
      const dirs = ['categories', 'properties', 'subobjects', 'templates', 'modules', 'bundles']
      for (const dir of dirs) {
        fs.mkdirSync(path.join(tempDir, dir), { recursive: true })
      }
    },

    /**
     * Write entity schemas to fixture
     */
    writeSchemas() {
      // Minimal schemas for testing
      const schemas = {
        categories: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            parents: { type: 'array', items: { type: 'string' } },
            required_properties: { type: 'array', items: { type: 'string' } },
            optional_properties: { type: 'array', items: { type: 'string' } }
          }
        },
        properties: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id', 'datatype'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            datatype: { type: 'string' },
            cardinality: { type: 'string' },
            parent_property: { type: 'string' }
          }
        },
        subobjects: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
            required_properties: { type: 'array', items: { type: 'string' } },
            optional_properties: { type: 'array', items: { type: 'string' } }
          }
        },
        templates: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            label: { type: 'string' }
          }
        },
        modules: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            version: { type: 'string' },
            categories: { type: 'array', items: { type: 'string' } },
            properties: { type: 'array', items: { type: 'string' } },
            subobjects: { type: 'array', items: { type: 'string' } },
            templates: { type: 'array', items: { type: 'string' } },
            dependencies: { type: 'array', items: { type: 'string' } }
          }
        },
        bundles: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
            version: { type: 'string' },
            modules: { type: 'array', items: { type: 'string' } }
          }
        }
      }

      for (const [type, schema] of Object.entries(schemas)) {
        this.writeJSON(`${type}/_schema.json`, schema)
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
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
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
      fixture.writeVersion('1.0.0')

      // Create initial structure
      fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent' })
      fixture.writeJSON('properties/Name.json', { id: 'Name', label: 'Name', datatype: 'Text' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        version: '1.0.0',
        categories: ['Agent'],
        properties: ['Name'],
        subobjects: [],
        templates: [],
        dependencies: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        version: '1.0.0',
        modules: ['Core']
      })

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
