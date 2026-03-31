import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveModule, diffModule, tracePropertySource, traceSubobjectSource } from './module-resolver.js'

/**
 * Helper to build a minimal entity index for testing.
 */
function makeIndex({ categories = {}, subobjects = {} } = {}) {
  return {
    categories: new Map(Object.entries(categories)),
    subobjects: new Map(Object.entries(subobjects)),
    properties: new Map(),
    modules: new Map(),
  }
}

describe('resolveModule', () => {
  it('collects properties from a single category', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name', 'Has_last_name'],
          optional_properties: ['Has_birthday'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, ['Has_birthday', 'Has_first_name', 'Has_last_name'])
    assert.deepStrictEqual(result.subobjects, [])
  })

  it('collects union of properties from multiple categories', () => {
    const index = makeIndex({
      categories: {
        Agent: {
          id: 'Agent',
          required_properties: ['Has_name'],
          optional_properties: ['Has_description'],
        },
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name'],
          optional_properties: ['Has_description'], // duplicate with Agent
        },
      },
    })

    const mod = { categories: ['Agent', 'Person'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, ['Has_description', 'Has_first_name', 'Has_name'])
  })

  it('collects subobjects from categories', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name'],
          optional_subobjects: ['Has_organizational_role'],
        },
      },
      subobjects: {
        Has_organizational_role: {
          id: 'Has_organizational_role',
          required_properties: ['Has_organization', 'Has_start_date'],
          optional_properties: ['Has_end_date'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.subobjects, ['Has_organizational_role'])
    assert.deepStrictEqual(result.properties, [
      'Has_end_date',
      'Has_first_name',
      'Has_organization',
      'Has_start_date',
    ])
  })

  it('handles category with no properties', () => {
    const index = makeIndex({
      categories: {
        Empty: { id: 'Empty' },
      },
    })

    const mod = { categories: ['Empty'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, [])
    assert.deepStrictEqual(result.subobjects, [])
  })

  it('skips missing categories gracefully', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name'],
        },
      },
    })

    const mod = { categories: ['Person', 'NonExistent'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, ['Has_first_name'])
  })

  it('skips missing subobjects gracefully', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name'],
          optional_subobjects: ['NonExistent_subobject'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, ['Has_first_name'])
    assert.deepStrictEqual(result.subobjects, ['NonExistent_subobject'])
  })

  it('returns sorted arrays', () => {
    const index = makeIndex({
      categories: {
        Cat: {
          id: 'Cat',
          required_properties: ['Zebra', 'Alpha', 'Middle'],
          optional_subobjects: ['Zoo', 'Ant'],
        },
      },
      subobjects: {
        Zoo: { id: 'Zoo', required_properties: ['Beta'] },
        Ant: { id: 'Ant', optional_properties: ['Gamma'] },
      },
    })

    const mod = { categories: ['Cat'] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, ['Alpha', 'Beta', 'Gamma', 'Middle', 'Zebra'])
    assert.deepStrictEqual(result.subobjects, ['Ant', 'Zoo'])
  })

  it('handles module with no categories', () => {
    const index = makeIndex()
    const mod = { categories: [] }
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, [])
    assert.deepStrictEqual(result.subobjects, [])
  })

  it('handles module with undefined categories', () => {
    const index = makeIndex()
    const mod = {}
    const result = resolveModule(mod, index)

    assert.deepStrictEqual(result.properties, [])
    assert.deepStrictEqual(result.subobjects, [])
  })
})

describe('diffModule', () => {
  it('finds missing properties', () => {
    const mod = { properties: ['Has_name'] }
    const resolved = { properties: ['Has_email', 'Has_name'], subobjects: [] }

    const diff = diffModule(mod, resolved)

    assert.deepStrictEqual(diff.missingProperties, ['Has_email'])
    assert.deepStrictEqual(diff.extraProperties, [])
  })

  it('finds extra properties', () => {
    const mod = { properties: ['Has_name', 'Has_stale'] }
    const resolved = { properties: ['Has_name'], subobjects: [] }

    const diff = diffModule(mod, resolved)

    assert.deepStrictEqual(diff.missingProperties, [])
    assert.deepStrictEqual(diff.extraProperties, ['Has_stale'])
  })

  it('finds missing and extra subobjects', () => {
    const mod = { subobjects: ['Old_sub'], properties: [] }
    const resolved = { properties: [], subobjects: ['New_sub'] }

    const diff = diffModule(mod, resolved)

    assert.deepStrictEqual(diff.missingSubobjects, ['New_sub'])
    assert.deepStrictEqual(diff.extraSubobjects, ['Old_sub'])
  })

  it('returns empty diffs when module matches resolved', () => {
    const mod = { properties: ['A', 'B'], subobjects: ['S'] }
    const resolved = { properties: ['A', 'B'], subobjects: ['S'] }

    const diff = diffModule(mod, resolved)

    assert.deepStrictEqual(diff.missingProperties, [])
    assert.deepStrictEqual(diff.extraProperties, [])
    assert.deepStrictEqual(diff.missingSubobjects, [])
    assert.deepStrictEqual(diff.extraSubobjects, [])
  })

  it('handles undefined module arrays', () => {
    const mod = {}
    const resolved = { properties: ['Has_name'], subobjects: ['Sub'] }

    const diff = diffModule(mod, resolved)

    assert.deepStrictEqual(diff.missingProperties, ['Has_name'])
    assert.deepStrictEqual(diff.extraProperties, [])
    assert.deepStrictEqual(diff.missingSubobjects, ['Sub'])
    assert.deepStrictEqual(diff.extraSubobjects, [])
  })
})

describe('tracePropertySource', () => {
  it('finds property in category', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          required_properties: ['Has_first_name'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const source = tracePropertySource('Has_first_name', mod, index)

    assert.strictEqual(source, 'category "Person"')
  })

  it('finds property in subobject', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          optional_subobjects: ['Has_role'],
        },
      },
      subobjects: {
        Has_role: {
          id: 'Has_role',
          required_properties: ['Has_start_date'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const source = tracePropertySource('Has_start_date', mod, index)

    assert.strictEqual(source, 'subobject "Has_role"')
  })
})

describe('traceSubobjectSource', () => {
  it('finds subobject in category', () => {
    const index = makeIndex({
      categories: {
        Person: {
          id: 'Person',
          optional_subobjects: ['Has_role'],
        },
      },
    })

    const mod = { categories: ['Person'] }
    const source = traceSubobjectSource('Has_role', mod, index)

    assert.strictEqual(source, 'category "Person"')
  })
})
