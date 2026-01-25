import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { buildEntityIndex } from './entity-index.js'
import { createEntityTempDir } from '../__fixtures__/temp-dir.js'

describe('buildEntityIndex', () => {
  let tempDir

  beforeEach(() => {
    // Create fresh temp directory for each test
  })

  afterEach(() => {
    // Clean up temp directory
    if (tempDir) {
      tempDir.cleanup()
      tempDir = null
    }
  })

  test('indexes all entity types', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Agent', label: 'Agent' }],
      properties: [{ id: 'Name', label: 'Name', datatype: 'Text' }],
      subobjects: [{ id: 'Address', label: 'Address' }],
      templates: [{ id: 'Display', label: 'Display' }],
      modules: [{ id: 'Core', categories: [], properties: [] }],
      bundles: [{ id: 'Default', modules: ['Core'] }]
    })

    const index = await buildEntityIndex(tempDir.path)

    assert.ok(index.categories.has('Agent'))
    assert.ok(index.properties.has('Name'))
    assert.ok(index.subobjects.has('Address'))
    assert.ok(index.templates.has('Display'))
    assert.ok(index.modules.has('Core'))
    assert.ok(index.bundles.has('Default'))
  })

  test('handles empty directories', async () => {
    tempDir = createEntityTempDir({})

    const index = await buildEntityIndex(tempDir.path)

    assert.strictEqual(index.categories.size, 0)
    assert.strictEqual(index.properties.size, 0)
    assert.strictEqual(index.subobjects.size, 0)
    assert.strictEqual(index.templates.size, 0)
    assert.strictEqual(index.modules.size, 0)
    assert.strictEqual(index.bundles.size, 0)
  })

  test('parses JSON correctly', async () => {
    tempDir = createEntityTempDir({
      categories: [{
        id: 'Person',
        label: 'Person',
        description: 'A person entity',
        parents: ['Agent']
      }]
    })

    const index = await buildEntityIndex(tempDir.path)

    const person = index.categories.get('Person')
    assert.strictEqual(person.id, 'Person')
    assert.strictEqual(person.label, 'Person')
    assert.strictEqual(person.description, 'A person entity')
    assert.deepStrictEqual(person.parents, ['Agent'])
  })

  test('sets _filePath on entities', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Agent', label: 'Agent' }]
    })

    const index = await buildEntityIndex(tempDir.path)

    const agent = index.categories.get('Agent')
    assert.ok(agent._filePath)
    assert.ok(agent._filePath.includes('categories'))
    assert.ok(agent._filePath.includes('Agent.json'))
  })

  test('indexes by entity id not filename', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'ActualId', label: 'Different Name' }]
    })

    const index = await buildEntityIndex(tempDir.path)

    // Entity should be keyed by its 'id' field
    assert.ok(index.categories.has('ActualId'))
  })

  test('skips files without id field', async () => {
    tempDir = createEntityTempDir({})
    // Manually write a file without id
    tempDir.writeJSON('categories/NoId.json', { label: 'No ID' })

    const index = await buildEntityIndex(tempDir.path)

    assert.strictEqual(index.categories.size, 0)
  })

  test('skips malformed JSON files', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Valid', label: 'Valid' }]
    })
    // Write malformed JSON
    tempDir.writeFile('categories/Malformed.json', '{ invalid json }')

    const index = await buildEntityIndex(tempDir.path)

    // Should only have the valid entity
    assert.strictEqual(index.categories.size, 1)
    assert.ok(index.categories.has('Valid'))
  })

  test('ignores files in non-entity directories', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Agent', label: 'Agent' }]
    })
    // Write file in unknown directory
    tempDir.writeJSON('unknown/Something.json', { id: 'Something' })

    const index = await buildEntityIndex(tempDir.path)

    // Should only have the category, not the unknown
    assert.strictEqual(index.categories.size, 1)
    // No way to check 'unknown' as it's not an indexed type
  })
})
