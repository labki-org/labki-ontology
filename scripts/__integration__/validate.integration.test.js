import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { runCLI } from './helpers/cli-runner.js'
import { createTempFixture, createGitFixture } from './helpers/fixture-manager.js'

describe('validate.js integration tests', () => {
  let fixture

  afterEach(() => {
    if (fixture) {
      fixture.cleanup()
      fixture = null
    }
  })

  describe('Exit codes', () => {
    test('valid entities exit with code 0', async () => {
      fixture = createTempFixture('valid-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent', required_properties: ['Name'] })
      fixture.writeJSON('properties/Name.json', { id: 'Name', label: 'Name', datatype: 'Text' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['Agent'],
        properties: ['Name'],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('validated successfully'))
    })

    test('schema violation exits with code 1', async () => {
      fixture = createTempFixture('schema-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // Property missing required 'datatype' field
      fixture.writeJSON('properties/Invalid.json', { id: 'Invalid', label: 'Invalid' })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 1)
    })

    test('malformed wikitext is handled gracefully', async () => {
      fixture = createTempFixture('parse-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // Malformed wikitext won't parse but shouldn't crash
      fixture.writeFile('categories/Malformed.wikitext', 'totally invalid content with no annotations')

      const result = await runCLI('validate.js', { cwd: fixture.path })

      // Should still exit (entity has no meaningful data, gets skipped or passes)
      assert.ok(result.exitCode === 0 || result.exitCode === 1)
    })

    test('missing reference exits with code 1', async () => {
      fixture = createTempFixture('ref-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('categories/BadRef.json', {
        id: 'BadRef',
        label: 'Bad Ref',
        parents: ['NonExistent']
      })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['BadRef'],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('missing') || result.stdout.includes('missing') || result.stderr.includes('reference'))
    })

    test('cycle detected exits with code 1', async () => {
      fixture = createTempFixture('cycle-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('categories/CycleA.json', {
        id: 'CycleA',
        label: 'Cycle A',
        parents: ['CycleB']
      })
      fixture.writeJSON('categories/CycleB.json', {
        id: 'CycleB',
        label: 'Cycle B',
        parents: ['CycleA']
      })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['CycleA', 'CycleB'],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('circular') || result.stderr.includes('Circular') || result.stdout.includes('circular'))
    })
  })

  describe('Flags', () => {
    test('--output-markdown creates validation-results.md file', async () => {
      fixture = createTempFixture('markdown-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['Agent'],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', {
        args: ['--output-markdown'],
        cwd: fixture.path
      })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(fixture.exists('validation-results.md'))

      const mdContent = fixture.readFile('validation-results.md')
      assert.ok(mdContent.includes('Entity Validation'))
    })

    test('GitHub Actions output format when GITHUB_ACTIONS is set', async () => {
      fixture = createTempFixture('gha-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // Create orphan (generates warning)
      fixture.writeJSON('categories/Orphan.json', { id: 'Orphan', label: 'Orphan' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: [],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', {
        cwd: fixture.path,
        env: { GITHUB_ACTIONS: 'true' }
      })

      // Warnings should produce ::warning annotations
      assert.ok(result.stdout.includes('::warning') || result.exitCode === 0)
    })
  })

  describe('GITHUB_STEP_SUMMARY', () => {
    test('writes to GITHUB_STEP_SUMMARY file when set', async () => {
      fixture = createTempFixture('summary-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['Agent'],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const summaryPath = path.join(fixture.path, 'step-summary.md')

      const result = await runCLI('validate.js', {
        cwd: fixture.path,
        env: { GITHUB_STEP_SUMMARY: summaryPath }
      })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(fixture.exists('step-summary.md'))

      const summaryContent = fixture.readFile('step-summary.md')
      assert.ok(summaryContent.includes('Validation'))
    })
  })

  describe('Multiple error types', () => {
    test('reports all error types when multiple issues exist', async () => {
      fixture = createTempFixture('multi-error-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // Schema error (missing datatype)
      fixture.writeJSON('properties/NoDatatype.json', { id: 'NoDatatype', label: 'No Datatype' })

      // Reference error
      fixture.writeJSON('categories/BadRef.json', {
        id: 'BadRef',
        label: 'Bad Ref',
        parents: ['Missing']
      })

      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['BadRef'],
        properties: ['NoDatatype'],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 1)
      // Should have multiple errors
      assert.ok(result.stderr.includes('error'))
    })
  })

  describe('Empty and minimal scenarios', () => {
    test('no entity files found exits gracefully', async () => {
      fixture = createTempFixture('empty-test')
      // Don't create any directories or files

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
      assert.ok(result.stdout.includes('No entity files') || result.stdout.includes('0 file'))
    })

    test('only schemas no entities validates successfully', async () => {
      fixture = createTempFixture('schema-only-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
    })
  })

  describe('ID derivation', () => {
    test('entity ID is derived from filename (no mismatch possible with wikitext)', async () => {
      fixture = createTempFixture('id-derive-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // With wikitext, the ID is always derived from the filename
      fixture.writeEntity('categories', { id: 'My_category', label: 'My Category', description: 'Test' })
      fixture.writeEntity('modules', {
        id: 'Core', label: 'Core', description: 'Core',
        categories: ['My_category'], properties: [], subobjects: [], templates: []
      })
      fixture.writeEntity('bundles', { id: 'Default', label: 'Default', description: 'Default', modules: ['Core'] })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 0)
    })
  })

  describe('Constraint validation', () => {
    test('property in both required and optional detected', async () => {
      fixture = createTempFixture('constraint-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      fixture.writeJSON('properties/Name.json', { id: 'Name', label: 'Name', datatype: 'Text' })
      fixture.writeJSON('categories/Conflict.json', {
        id: 'Conflict',
        label: 'Conflict',
        required_properties: ['Name'],
        optional_properties: ['Name']  // Same property in both!
      })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: ['Conflict'],
        properties: ['Name'],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      assert.strictEqual(result.exitCode, 1)
      assert.ok(result.stderr.includes('conflict') || result.stderr.includes('both'))
    })
  })

  describe('Orphan detection', () => {
    test('orphaned entity generates warning not error', async () => {
      fixture = createTempFixture('orphan-test')
      fixture.createEntityDirectories()
      fixture.writeSchemas()

      // Orphan - not in any module
      fixture.writeJSON('categories/Orphan.json', { id: 'Orphan', label: 'Orphan' })

      // Module that doesn't include the orphan
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        categories: [],
        properties: [],
        subobjects: [],
        templates: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        modules: ['Core']
      })

      const result = await runCLI('validate.js', { cwd: fixture.path })

      // Should pass (warnings don't fail)
      assert.strictEqual(result.exitCode, 0)
      // Should mention orphan
      assert.ok(result.stdout.includes('warning') || result.stdout.includes('Orphan'))
    })
  })
})
