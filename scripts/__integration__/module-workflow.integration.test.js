/**
 * Integration tests for the full module auto-include workflow:
 * 1. Editing a category should require sync-modules
 * 2. Validation should catch module drift
 * 3. sync-modules should fix the drift
 * 4. Validation should pass after sync
 *
 * These tests simulate the real-world scenarios that caused PR failures.
 */
import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { runCLI } from './helpers/cli-runner.js'
import { createTempFixture } from './helpers/fixture-manager.js'

describe('Module auto-include workflow', () => {
  let fixture

  afterEach(() => {
    if (fixture) {
      fixture.cleanup()
      fixture = null
    }
  })

  /**
   * Helper: create a valid baseline ontology
   */
  function createBaseOntology() {
    fixture = createTempFixture('workflow-test')
    fixture.createEntityDirectories()

    // Categories
    fixture.writeJSON('categories/Agent.json', {
      id: 'Agent', description: 'An agent', required_properties: ['Has_name'],
    })
    fixture.writeJSON('categories/Person.json', {
      id: 'Person', description: 'A person', parents: ['Agent'],
      required_properties: ['Has_first_name', 'Has_last_name'],
      optional_properties: ['Has_email'],
    })

    // Properties
    fixture.writeJSON('properties/Has_name.json', { id: 'Has_name', datatype: 'Text', description: 'Name' })
    fixture.writeJSON('properties/Has_first_name.json', { id: 'Has_first_name', datatype: 'Text', description: 'First name' })
    fixture.writeJSON('properties/Has_last_name.json', { id: 'Has_last_name', datatype: 'Text', description: 'Last name' })
    fixture.writeJSON('properties/Has_email.json', { id: 'Has_email', datatype: 'Email', description: 'Email' })

    // Module with correct resolved properties
    fixture.writeJSON('modules/Agents.json', {
      id: 'Agents',
      label: 'Agents',
      description: 'Agent module',
      categories: ['Agent', 'Person'],
      properties: ['Has_email', 'Has_first_name', 'Has_last_name', 'Has_name'],
      subobjects: [],
      templates: [],
      manual_categories: ['Person'],
      resources: [],
    })
    fixture.writeJSON('bundles/Default.json', {
      id: 'Default', description: 'Default bundle', modules: ['Agents'],
    })

    return fixture
  }

  test('validation passes on correctly resolved module', async () => {
    createBaseOntology()

    const result = await runCLI('validate.js', { cwd: fixture.path })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.stdout.includes('validated successfully'))
  })

  test('validation fails when category gets new property but module not updated', async () => {
    createBaseOntology()

    // Add a new property to Person (simulating a category edit)
    fixture.writeJSON('properties/Has_birthday.json', { id: 'Has_birthday', datatype: 'Date', description: 'Birthday' })

    // Edit Person category to include the new property
    fixture.writeJSON('categories/Person.json', {
      id: 'Person', description: 'A person', parents: ['Agent'],
      required_properties: ['Has_first_name', 'Has_last_name'],
      optional_properties: ['Has_email', 'Has_birthday'],  // Added Has_birthday
    })

    // But DON'T update the module — this should fail validation
    const result = await runCLI('validate.js', { cwd: fixture.path })

    assert.strictEqual(result.exitCode, 1)
    assert.ok(result.stderr.includes('Has_birthday') || result.stdout.includes('Has_birthday'))
  })

  test('sync-modules fixes drift, then validation passes', async () => {
    createBaseOntology()

    // Add new property to Person without updating module
    fixture.writeJSON('properties/Has_birthday.json', { id: 'Has_birthday', datatype: 'Date', description: 'Birthday' })
    fixture.writeJSON('categories/Person.json', {
      id: 'Person', description: 'A person', parents: ['Agent'],
      required_properties: ['Has_first_name', 'Has_last_name'],
      optional_properties: ['Has_email', 'Has_birthday'],
    })

    // Run sync-modules to fix the drift
    const syncResult = await runCLI('sync-modules.js', { cwd: fixture.path })
    assert.strictEqual(syncResult.exitCode, 0)
    assert.ok(syncResult.stdout.includes('Has_birthday'))

    // Now validation should pass
    const validateResult = await runCLI('validate.js', { cwd: fixture.path })
    assert.strictEqual(validateResult.exitCode, 0)
  })

  test('validation fails when property is deleted but module still references it', async () => {
    createBaseOntology()

    // Remove Has_email from Person category and delete the property file
    fixture.writeJSON('categories/Person.json', {
      id: 'Person', description: 'A person', parents: ['Agent'],
      required_properties: ['Has_first_name', 'Has_last_name'],
      // Has_email removed from category
    })
    // Delete the property file
    fs.unlinkSync(path.join(fixture.path, 'properties/Has_email.wikitext'))

    // Module still lists Has_email — should fail
    const result = await runCLI('validate.js', { cwd: fixture.path })
    assert.strictEqual(result.exitCode, 1)
  })

  test('validation fails when subobject is added to category but module not updated', async () => {
    createBaseOntology()

    // Create a subobject and its properties
    fixture.writeJSON('subobjects/Has_training_record.json', {
      id: 'Has_training_record',
      label: 'Training Record',
      description: 'Training completion record',
      required_properties: ['Has_training', 'Has_completion_date'],
    })
    fixture.writeJSON('properties/Has_training.json', { id: 'Has_training', datatype: 'Page', description: 'Training' })
    fixture.writeJSON('properties/Has_completion_date.json', { id: 'Has_completion_date', datatype: 'Date', description: 'Completion date' })

    // Add the subobject to Person
    fixture.writeJSON('categories/Person.json', {
      id: 'Person', description: 'A person', parents: ['Agent'],
      required_properties: ['Has_first_name', 'Has_last_name'],
      optional_properties: ['Has_email'],
      optional_subobjects: ['Has_training_record'],
    })

    // Module NOT updated — should fail
    const result = await runCLI('validate.js', { cwd: fixture.path })
    assert.strictEqual(result.exitCode, 1)

    // Sync should fix it
    await runCLI('sync-modules.js', { cwd: fixture.path })
    const mod = fixture.readJSON('modules/Agents.json')
    assert.ok(mod.subobjects.includes('Has_training_record'))
    assert.ok(mod.properties.includes('Has_training'))
    assert.ok(mod.properties.includes('Has_completion_date'))

    // Validation should now pass
    const result2 = await runCLI('validate.js', { cwd: fixture.path })
    assert.strictEqual(result2.exitCode, 0)
  })

  test('validation error identifies the incomplete-module-properties type', async () => {
    createBaseOntology()

    // Create drift
    fixture.writeJSON('properties/Has_new.json', { id: 'Has_new', datatype: 'Text', description: 'New' })
    fixture.writeJSON('categories/Agent.json', {
      id: 'Agent', description: 'Agent', required_properties: ['Has_name', 'Has_new'],
    })

    const result = await runCLI('validate.js', { args: ['--output-markdown'], cwd: fixture.path })
    assert.strictEqual(result.exitCode, 1)

    // The PR comment should show the missing property error
    const md = fixture.readFile('validation-results.md')
    assert.ok(md.includes('Has_new'))
    assert.ok(md.includes('incomplete-module-properties') || md.includes('missing property'))
  })

  test('multiple modules each resolve independently', async () => {
    fixture = createTempFixture('multi-module-test')
    fixture.createEntityDirectories()

    // Module A
    fixture.writeJSON('categories/Agent.json', {
      id: 'Agent', description: 'Agent', required_properties: ['Has_name'],
    })
    fixture.writeJSON('properties/Has_name.json', { id: 'Has_name', datatype: 'Text', description: 'Name' })

    // Module B
    fixture.writeJSON('categories/Equipment.json', {
      id: 'Equipment', description: 'Equipment', required_properties: ['Has_serial_number'],
    })
    fixture.writeJSON('properties/Has_serial_number.json', { id: 'Has_serial_number', datatype: 'Text', description: 'Serial' })

    // Both modules start empty
    fixture.writeJSON('modules/Agents.json', {
      id: 'Agents', description: 'Agents', categories: ['Agent'], properties: [], subobjects: [], templates: [],
    })
    fixture.writeJSON('modules/Equipment.json', {
      id: 'Equipment', description: 'Equipment', categories: ['Equipment'], properties: [], subobjects: [], templates: [],
    })
    fixture.writeJSON('bundles/Default.json', {
      id: 'Default', description: 'Default', modules: ['Agents', 'Equipment'],
    })

    // Sync both
    await runCLI('sync-modules.js', { cwd: fixture.path })

    const agents = fixture.readJSON('modules/Agents.json')
    const equipment = fixture.readJSON('modules/Equipment.json')

    assert.deepStrictEqual(agents.properties, ['Has_name'])
    assert.deepStrictEqual(equipment.properties, ['Has_serial_number'])

    // Validate passes
    const result = await runCLI('validate.js', { cwd: fixture.path })
    assert.strictEqual(result.exitCode, 0)
  })
})
