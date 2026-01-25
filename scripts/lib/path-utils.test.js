import { describe, test } from 'node:test'
import assert from 'node:assert'
import { parseEntityPath } from './path-utils.js'

describe('parseEntityPath', () => {
  test('extracts entity type from path', () => {
    const result = parseEntityPath('properties/Name.json')

    assert.strictEqual(result.entityType, 'properties')
  })

  test('extracts entity id from path', () => {
    const result = parseEntityPath('properties/Name.json')

    assert.strictEqual(result.entityId, 'Name')
  })

  test('handles nested paths', () => {
    const result = parseEntityPath('categories/nested/Agent.json')

    assert.strictEqual(result.entityType, 'categories')
    assert.strictEqual(result.entityId, 'Agent')
  })

  test('handles all entity types', () => {
    const types = ['categories', 'properties', 'subobjects', 'templates', 'modules', 'bundles']

    for (const type of types) {
      const result = parseEntityPath(`${type}/Test.json`)
      assert.strictEqual(result.entityType, type)
      assert.strictEqual(result.entityId, 'Test')
    }
  })

  test('handles complex entity ids', () => {
    const result = parseEntityPath('properties/Has_Display_Template.json')

    assert.strictEqual(result.entityId, 'Has_Display_Template')
  })
})
