import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { runCLIJSON } from './helpers/cli-runner.js'
import { createTempFixture } from './helpers/fixture-manager.js'

describe('ci-detect-affected.js integration tests', () => {
  let fixture

  beforeEach(() => {
    fixture = createTempFixture('detect-affected')
    fixture.createEntityDirectories()
    fixture.writeSchemas()
    fixture.writeVersion('1.0.0')

    // Setup base entity structure using wikitext format
    fixture.writeEntity('categories', { id: 'Agent', label: 'Agent', description: 'An agent' })
    fixture.writeEntity('categories', { id: 'Equipment', label: 'Equipment', description: 'Equipment' })
    fixture.writeEntity('properties', { id: 'Has_name', label: 'Name', description: 'A name', datatype: 'Text', cardinality: 'single' })
    fixture.writeEntity('properties', { id: 'Has_serial_number', label: 'Serial Number', description: 'Serial', datatype: 'Text', cardinality: 'single' })

    fixture.writeEntity('modules', {
      id: 'Core', version: '1.0.0', label: 'Core', description: 'Core module',
      categories: ['Agent'], properties: ['Has_name'],
      subobjects: [], templates: [], dependencies: []
    })
    fixture.writeEntity('modules', {
      id: 'Lab', version: '1.0.0', label: 'Lab', description: 'Lab module',
      categories: ['Equipment'], properties: ['Has_serial_number'],
      subobjects: [], templates: [], dependencies: ['Core']
    })

    fixture.writeEntity('bundles', { id: 'Default', version: '1.0.0', label: 'Default', description: 'Default', modules: ['Core', 'Lab'] })
    fixture.writeEntity('bundles', { id: 'LabOnly', version: '1.0.0', label: 'LabOnly', description: 'Lab only', modules: ['Lab'] })
  })

  afterEach(() => {
    if (fixture) {
      fixture.cleanup()
      fixture = null
    }
  })

  test('empty input returns empty arrays', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: ''
    })

    assert.strictEqual(result.exitCode, 0)
    assert.deepStrictEqual(result.data, { modules: [], bundles: [] })
  })

  test('category change detects correct module', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
  })

  test('property change detects correct module', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'properties/Has_serial_number.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Lab'))
  })

  test('module file change is detected directly', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'modules/Core.vocab.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
  })

  test('bundle file change is detected directly', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'bundles/Default.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.bundles.includes('Default'))
  })

  test('affected module triggers containing bundles', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
    assert.ok(result.data.bundles.includes('Default'))
  })

  test('multiple changes aggregated output', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.wikitext\ncategories/Equipment.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
    assert.ok(result.data.modules.includes('Lab'))
    assert.ok(result.data.bundles.includes('Default'))
  })

  test('orphan entity returns empty arrays', async () => {
    fixture.writeEntity('categories', { id: 'Orphan', label: 'Orphan', description: 'Orphan' })

    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Orphan.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.deepStrictEqual(result.data.modules, [])
    assert.deepStrictEqual(result.data.bundles, [])
  })

  test('changes in multiple modules affect multiple bundles correctly', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'properties/Has_serial_number.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Lab'))
    assert.ok(result.data.bundles.includes('Default'))
    assert.ok(result.data.bundles.includes('LabOnly'))
  })

  test('handles whitespace in input', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: '\ncategories/Agent.wikitext\n\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
  })

  test('deduplicates modules and bundles', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.wikitext\ncategories/Agent.wikitext\n'
    })

    assert.strictEqual(result.exitCode, 0)
    const coreCount = result.data.modules.filter(m => m === 'Core').length
    assert.strictEqual(coreCount, 1)
  })
})
