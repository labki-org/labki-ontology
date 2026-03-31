import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert'
import { runCLI } from './helpers/cli-runner.js'
import { createTempFixture } from './helpers/fixture-manager.js'

describe('sync-modules.js integration tests', () => {
  let fixture

  afterEach(() => {
    if (fixture) {
      fixture.cleanup()
      fixture = null
    }
  })

  /**
   * Helper: create a fixture with a category, its properties, and a module
   */
  function createModuleFixture({ categories = {}, properties = {}, subobjects = {}, moduleOverrides = {} } = {}) {
    fixture = createTempFixture('sync-test')
    fixture.createEntityDirectories()

    for (const [id, data] of Object.entries(categories)) {
      fixture.writeJSON(`categories/${id}.json`, { id, ...data })
    }
    for (const [id, data] of Object.entries(properties)) {
      fixture.writeJSON(`properties/${id}.json`, { id, datatype: 'Text', ...data })
    }
    for (const [id, data] of Object.entries(subobjects)) {
      fixture.writeJSON(`subobjects/${id}.json`, { id, ...data })
    }

    const defaultModule = {
      id: 'Core',
      label: 'Core',
      description: 'Core module',
      categories: Object.keys(categories),
      properties: [],
      subobjects: [],
      templates: [],
      manual_categories: [],
      resources: [],
      ...moduleOverrides,
    }
    fixture.writeJSON('modules/Core.json', defaultModule)
    fixture.writeJSON('bundles/Default.json', { id: 'Default', description: 'Default', modules: ['Core'] })

    return fixture
  }

  describe('Basic sync', () => {
    test('adds missing properties to module', async () => {
      createModuleFixture({
        categories: { Person: { description: 'A person', required_properties: ['Has_name'] } },
        properties: { Has_name: { description: 'Name' } },
      })

      const result = await runCLI('sync-modules.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('+ properties: Has_name'))
      assert.ok(result.stdout.includes('1 module(s) updated'))

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Has_name'])
    })

    test('removes extra properties from module', async () => {
      createModuleFixture({
        categories: { Person: { description: 'A person' } },
        properties: { Has_stale: { description: 'Stale property' } },
        moduleOverrides: { properties: ['Has_stale'] },
      })

      const result = await runCLI('sync-modules.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('- properties: Has_stale'))

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, [])
    })

    test('adds missing subobjects to module', async () => {
      createModuleFixture({
        categories: { Equipment: { description: 'Equipment', optional_subobjects: ['Has_maintenance_record'] } },
        subobjects: { Has_maintenance_record: { description: 'Maintenance record', required_properties: ['Has_date'] } },
        properties: { Has_date: { description: 'Date', datatype: 'Date' } },
      })

      const result = await runCLI('sync-modules.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.subobjects, ['Has_maintenance_record'])
      assert.ok(mod.properties.includes('Has_date'))
    })

    test('reports up to date when module matches', async () => {
      createModuleFixture({
        categories: { Agent: { description: 'Agent', required_properties: ['Has_name'] } },
        properties: { Has_name: { description: 'Name' } },
        moduleOverrides: { properties: ['Has_name'] },
      })

      const result = await runCLI('sync-modules.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('up to date'))
      assert.ok(result.stdout.includes('All modules are up to date'))
    })
  })

  describe('Dry run', () => {
    test('shows changes without writing files', async () => {
      createModuleFixture({
        categories: { Person: { description: 'A person', required_properties: ['Has_name'] } },
        properties: { Has_name: { description: 'Name' } },
      })

      const result = await runCLI('sync-modules.js', { args: ['--dry-run'], cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('would be updated'))

      // File should NOT be modified
      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, [])
    })
  })

  describe('Complex scenarios', () => {
    test('collects properties from multiple categories', async () => {
      createModuleFixture({
        categories: {
          Agent: { description: 'Agent', required_properties: ['Has_name'] },
          Person: { description: 'Person', parents: ['Agent'], required_properties: ['Has_first_name'], optional_properties: ['Has_email'] },
        },
        properties: {
          Has_name: { description: 'Name' },
          Has_first_name: { description: 'First name' },
          Has_email: { description: 'Email', datatype: 'Email' },
        },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Has_email', 'Has_first_name', 'Has_name'])
    })

    test('collects properties from subobjects referenced by categories', async () => {
      createModuleFixture({
        categories: {
          Person: { description: 'Person', required_properties: ['Has_name'], optional_subobjects: ['Has_training_record'] },
        },
        properties: {
          Has_name: { description: 'Name' },
          Has_training: { description: 'Training', datatype: 'Page' },
          Has_completion_date: { description: 'Completion date', datatype: 'Date' },
        },
        subobjects: {
          Has_training_record: {
            description: 'Training record',
            required_properties: ['Has_training', 'Has_completion_date'],
          },
        },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Has_completion_date', 'Has_name', 'Has_training'])
      assert.deepStrictEqual(mod.subobjects, ['Has_training_record'])
    })

    test('preserves manual fields when updating', async () => {
      createModuleFixture({
        categories: { Agent: { description: 'Agent', required_properties: ['Has_name'] } },
        properties: { Has_name: { description: 'Name' } },
        moduleOverrides: {
          templates: ['Property/Page'],
          manual_categories: ['Agent'],
          resources: ['Person/John_doe'],
        },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Has_name'])
      // Manual fields preserved
      assert.deepStrictEqual(mod.templates, ['Property/Page'])
      assert.deepStrictEqual(mod.manual_categories, ['Agent'])
      assert.deepStrictEqual(mod.resources, ['Person/John_doe'])
    })

    test('sorts properties alphabetically', async () => {
      createModuleFixture({
        categories: {
          Thing: { description: 'Thing', required_properties: ['Zebra', 'Alpha', 'Middle'] },
        },
        properties: {
          Zebra: { description: 'Z' },
          Alpha: { description: 'A' },
          Middle: { description: 'M' },
        },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Alpha', 'Middle', 'Zebra'])
    })
  })

  describe('Simulating real-world PR scenarios', () => {
    test('deleted property removed from module (Has_manual_URL scenario)', async () => {
      // Simulates: Equipment had Has_manual_URL, it was replaced with Has_url
      createModuleFixture({
        categories: {
          Equipment: { description: 'Equipment', optional_properties: ['Has_url'] },
        },
        properties: {
          Has_url: { description: 'URL', datatype: 'URL' },
          // Has_manual_URL no longer exists as a property file
        },
        // But module still references the old property
        moduleOverrides: { properties: ['Has_manual_URL'] },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.deepStrictEqual(mod.properties, ['Has_url'])
      assert.ok(!mod.properties.includes('Has_manual_URL'))
    })

    test('new training module with subobject properties auto-included', async () => {
      // Simulates: Adding training record subobject to Person
      createModuleFixture({
        categories: {
          Agent: { description: 'Agent', required_properties: ['Has_name'] },
          Person: {
            description: 'Person',
            parents: ['Agent'],
            required_properties: ['Has_first_name', 'Has_last_name'],
            optional_subobjects: ['Has_training_record'],
          },
        },
        properties: {
          Has_name: { description: 'Name' },
          Has_first_name: { description: 'First name' },
          Has_last_name: { description: 'Last name' },
          Has_training: { description: 'Training', datatype: 'Page' },
          Has_completion_date: { description: 'Completion date', datatype: 'Date' },
          Has_expiration_date: { description: 'Expiration date', datatype: 'Date' },
          Has_notes: { description: 'Notes' },
        },
        subobjects: {
          Has_training_record: {
            description: 'Training record',
            required_properties: ['Has_training', 'Has_completion_date'],
            optional_properties: ['Has_expiration_date', 'Has_notes'],
          },
        },
      })

      await runCLI('sync-modules.js', { cwd: fixture.path })

      const mod = fixture.readJSON('modules/Core.json')
      assert.ok(mod.properties.includes('Has_training'))
      assert.ok(mod.properties.includes('Has_completion_date'))
      assert.ok(mod.properties.includes('Has_expiration_date'))
      assert.ok(mod.properties.includes('Has_notes'))
      assert.ok(mod.subobjects.includes('Has_training_record'))
    })
  })
})
