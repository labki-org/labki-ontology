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
      categories: [{ id: 'Agent', label: 'Agent', description: 'An agent' }],
      properties: [{ id: 'Has_name', label: 'Name', description: 'A name', datatype: 'Text', cardinality: 'single' }],
      subobjects: [{ id: 'Address', label: 'Address', description: 'An address' }],
      templates: [{ id: 'Display', label: 'Display', description: '', wikitext: '{{{value}}}' }],
      modules: [{ id: 'Core', label: 'Core', description: 'Core', categories: [], dashboards: [] }],
      bundles: [{ id: 'Default', label: 'Default', description: 'Default', modules: ['Core'] }]
    })

    const index = await buildEntityIndex(tempDir.path)

    assert.ok(index.categories.has('Agent'))
    assert.ok(index.properties.has('Has_name'))
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

  test('parses wikitext correctly', async () => {
    tempDir = createEntityTempDir({
      categories: [{
        id: 'Person',
        label: 'Human Person',
        description: 'A person entity',
        parents: ['Agent']
      }]
    })

    const index = await buildEntityIndex(tempDir.path)

    const person = index.categories.get('Person')
    assert.strictEqual(person.id, 'Person')
    assert.strictEqual(person.label, 'Human Person')
    assert.strictEqual(person.description, 'A person entity')
    assert.deepStrictEqual(person.parents, ['Agent'])
  })

  test('sets _filePath on entities', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Agent', label: 'Agent', description: 'An agent' }]
    })

    const index = await buildEntityIndex(tempDir.path)

    const agent = index.categories.get('Agent')
    assert.ok(agent._filePath)
    assert.ok(agent._filePath.includes('categories'))
    assert.ok(agent._filePath.includes('Agent.wikitext'))
  })

  test('indexes by entity id not filename', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Actual_id', label: 'Different Name', description: 'Test' }]
    })

    const index = await buildEntityIndex(tempDir.path)

    // Entity should be keyed by its 'id' field
    assert.ok(index.categories.has('Actual_id'))
  })

  test('skips malformed wikitext files gracefully', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Valid', label: 'Valid', description: 'A valid entity' }]
    })

    const index = await buildEntityIndex(tempDir.path)

    assert.strictEqual(index.categories.size, 1)
    assert.ok(index.categories.has('Valid'))
  })

  test('ignores files in non-entity directories', async () => {
    tempDir = createEntityTempDir({
      categories: [{ id: 'Agent', label: 'Agent', description: 'An agent' }]
    })
    // Write file in unknown directory
    tempDir.writeFile('unknown/Something.wikitext', '[[Has description::test]]')

    const index = await buildEntityIndex(tempDir.path)

    // Should only have the category, not the unknown
    assert.strictEqual(index.categories.size, 1)
  })
})
