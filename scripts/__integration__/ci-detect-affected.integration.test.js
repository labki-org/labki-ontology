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

    // Setup base entity structure
    fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent' })
    fixture.writeJSON('categories/Equipment.json', { id: 'Equipment', label: 'Equipment' })
    fixture.writeJSON('properties/Name.json', { id: 'Name', label: 'Name', datatype: 'Text' })
    fixture.writeJSON('properties/SerialNumber.json', { id: 'SerialNumber', label: 'Serial Number', datatype: 'Text' })

    fixture.writeJSON('modules/Core.json', {
      id: 'Core',
      version: '1.0.0',
      categories: ['Agent'],
      properties: ['Name'],
      subobjects: [],
      templates: [],
      dependencies: []
    })
    fixture.writeJSON('modules/Lab.json', {
      id: 'Lab',
      version: '1.0.0',
      categories: ['Equipment'],
      properties: ['SerialNumber'],
      subobjects: [],
      templates: [],
      dependencies: ['Core']
    })

    fixture.writeJSON('bundles/Default.json', {
      id: 'Default',
      version: '1.0.0',
      modules: ['Core', 'Lab']
    })
    fixture.writeJSON('bundles/LabOnly.json', {
      id: 'LabOnly',
      version: '1.0.0',
      modules: ['Lab']
    })
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
      stdin: 'categories/Agent.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
  })

  test('property change detects correct module', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'properties/SerialNumber.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Lab'))
  })

  test('module file change is detected directly', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'modules/Core.json\n'
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
      stdin: 'categories/Agent.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    // Agent is in Core, Core is in Default bundle
    assert.ok(result.data.modules.includes('Core'))
    assert.ok(result.data.bundles.includes('Default'))
  })

  test('multiple changes aggregated output', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.json\ncategories/Equipment.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
    assert.ok(result.data.modules.includes('Lab'))
    // Both modules are in Default bundle
    assert.ok(result.data.bundles.includes('Default'))
  })

  test('orphan entity returns empty arrays', async () => {
    // Create an orphan category not in any module
    fixture.writeJSON('categories/Orphan.json', { id: 'Orphan', label: 'Orphan' })

    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Orphan.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    // Orphan is not in any module, so no modules affected
    assert.deepStrictEqual(result.data.modules, [])
    assert.deepStrictEqual(result.data.bundles, [])
  })

  test('changes in multiple modules affect multiple bundles correctly', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'properties/SerialNumber.json\n'  // Only in Lab module
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Lab'))
    // Lab is in both Default and LabOnly bundles
    assert.ok(result.data.bundles.includes('Default'))
    assert.ok(result.data.bundles.includes('LabOnly'))
  })

  test('handles whitespace in input', async () => {
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: '\ncategories/Agent.json\n\n'
    })

    assert.strictEqual(result.exitCode, 0)
    assert.ok(result.data.modules.includes('Core'))
  })

  test('deduplicates modules and bundles', async () => {
    // Same category twice should not produce duplicate modules
    const result = await runCLIJSON('ci-detect-affected.js', {
      cwd: fixture.path,
      stdin: 'categories/Agent.json\ncategories/Agent.json\n'
    })

    assert.strictEqual(result.exitCode, 0)
    // Should only have Core once
    const coreCount = result.data.modules.filter(m => m === 'Core').length
    assert.strictEqual(coreCount, 1)
  })
})
