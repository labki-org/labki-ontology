/**
 * Tests for the module auto-include validation in reference-validator.js
 * and the module-resolver.js logic that drives it.
 *
 * These tests focus on the interaction between categories, subobjects,
 * and module property/subobject lists — the exact scenarios that caused
 * real-world issues like PR #40 failing due to stale module references.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateReferences } from './reference-validator.js'
import { resolveModule, diffModule, tracePropertySource, traceSubobjectSource } from './module-resolver.js'
import { createMockEntityIndex } from '../__fixtures__/mock-entity-index.js'

// ─── Validation: incomplete-module-properties ───────────────────────────────

describe('Module auto-include validation', () => {
  describe('Missing properties', () => {
    it('errors when module is missing a property required by its category', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', { id: 'Person', required_properties: ['Has_name'], _filePath: 'categories/Person.wikitext' }],
        ]),
        properties: new Map([
          ['Has_name', { id: 'Has_name', datatype: 'Text', _filePath: 'properties/Has_name.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Person'], properties: [], subobjects: [], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e => e.type === 'incomplete-module-properties')

      assert.strictEqual(autoErrors.length, 1)
      assert.ok(autoErrors[0].message.includes('Has_name'))
      assert.ok(autoErrors[0].message.includes('category "Person"'))
    })

    it('errors when module is missing a property from a subobject', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', { id: 'Person', optional_subobjects: ['Has_role'], _filePath: 'categories/Person.wikitext' }],
        ]),
        subobjects: new Map([
          ['Has_role', { id: 'Has_role', required_properties: ['Has_start_date'], _filePath: 'subobjects/Has_role.wikitext' }],
        ]),
        properties: new Map([
          ['Has_start_date', { id: 'Has_start_date', datatype: 'Date', _filePath: 'properties/Has_start_date.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Person'], properties: [], subobjects: ['Has_role'], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e => e.type === 'incomplete-module-properties')

      assert.strictEqual(autoErrors.length, 1)
      assert.ok(autoErrors[0].message.includes('Has_start_date'))
      assert.ok(autoErrors[0].message.includes('subobject "Has_role"'))
    })
  })

  describe('Extra properties', () => {
    it('errors when module lists property not referenced by any category or subobject', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Agent', { id: 'Agent', required_properties: ['Has_name'], _filePath: 'categories/Agent.wikitext' }],
        ]),
        properties: new Map([
          ['Has_name', { id: 'Has_name', datatype: 'Text', _filePath: 'properties/Has_name.wikitext' }],
          ['Has_stale', { id: 'Has_stale', datatype: 'Text', _filePath: 'properties/Has_stale.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Agent'], properties: ['Has_name', 'Has_stale'], subobjects: [], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e => e.type === 'incomplete-module-properties')

      assert.strictEqual(autoErrors.length, 1)
      assert.ok(autoErrors[0].message.includes('Has_stale'))
      assert.ok(autoErrors[0].message.includes('not referenced'))
    })
  })

  describe('Missing subobjects', () => {
    it('errors when module is missing a subobject declared by its category', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', { id: 'Person', optional_subobjects: ['Has_role'], _filePath: 'categories/Person.wikitext' }],
        ]),
        subobjects: new Map([
          ['Has_role', { id: 'Has_role', _filePath: 'subobjects/Has_role.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Person'], properties: [], subobjects: [], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e => e.type === 'incomplete-module-subobjects')

      assert.strictEqual(autoErrors.length, 1)
      assert.ok(autoErrors[0].message.includes('Has_role'))
    })
  })

  describe('Extra subobjects', () => {
    it('errors when module lists subobject not referenced by any category', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Agent', { id: 'Agent', _filePath: 'categories/Agent.wikitext' }],
        ]),
        subobjects: new Map([
          ['Stale_sub', { id: 'Stale_sub', _filePath: 'subobjects/Stale_sub.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Agent'], properties: [], subobjects: ['Stale_sub'], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e => e.type === 'incomplete-module-subobjects')

      assert.strictEqual(autoErrors.length, 1)
      assert.ok(autoErrors[0].message.includes('Stale_sub'))
    })
  })

  describe('Valid module passes', () => {
    it('passes when module exactly matches resolved set', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Agent', { id: 'Agent', required_properties: ['Has_name'], _filePath: 'categories/Agent.wikitext' }],
          ['Person', {
            id: 'Person', parents: ['Agent'],
            required_properties: ['Has_first_name'],
            optional_properties: ['Has_email'],
            optional_subobjects: ['Has_role'],
            _filePath: 'categories/Person.wikitext',
          }],
        ]),
        properties: new Map([
          ['Has_name', { id: 'Has_name', datatype: 'Text', _filePath: 'properties/Has_name.wikitext' }],
          ['Has_first_name', { id: 'Has_first_name', datatype: 'Text', _filePath: 'properties/Has_first_name.wikitext' }],
          ['Has_email', { id: 'Has_email', datatype: 'Email', _filePath: 'properties/Has_email.wikitext' }],
          ['Has_org', { id: 'Has_org', datatype: 'Page', _filePath: 'properties/Has_org.wikitext' }],
          ['Has_start_date', { id: 'Has_start_date', datatype: 'Date', _filePath: 'properties/Has_start_date.wikitext' }],
        ]),
        subobjects: new Map([
          ['Has_role', {
            id: 'Has_role',
            required_properties: ['Has_org', 'Has_start_date'],
            _filePath: 'subobjects/Has_role.wikitext',
          }],
        ]),
        modules: new Map([
          ['Agents', {
            id: 'Agents',
            categories: ['Agent', 'Person'],
            properties: ['Has_email', 'Has_first_name', 'Has_name', 'Has_org', 'Has_start_date'],
            subobjects: ['Has_role'],
            templates: [],
          }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e =>
        e.type === 'incomplete-module-properties' || e.type === 'incomplete-module-subobjects'
      )

      assert.strictEqual(autoErrors.length, 0)
    })

    it('passes with empty module (no categories)', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['Empty', { id: 'Empty', categories: [], properties: [], subobjects: [], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e =>
        e.type === 'incomplete-module-properties' || e.type === 'incomplete-module-subobjects'
      )
      assert.strictEqual(autoErrors.length, 0)
    })
  })

  describe('Shared properties across modules', () => {
    it('same property in multiple modules is valid when both have categories requiring it', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Agent', { id: 'Agent', required_properties: ['Has_description'], _filePath: 'categories/Agent.wikitext' }],
          ['Activity', { id: 'Activity', required_properties: ['Has_description'], _filePath: 'categories/Activity.wikitext' }],
        ]),
        properties: new Map([
          ['Has_description', { id: 'Has_description', datatype: 'Text', _filePath: 'properties/Has_description.wikitext' }],
        ]),
        modules: new Map([
          ['Agents', { id: 'Agents', categories: ['Agent'], properties: ['Has_description'], subobjects: [], templates: [] }],
          ['Activities', { id: 'Activities', categories: ['Activity'], properties: ['Has_description'], subobjects: [], templates: [] }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e =>
        e.type === 'incomplete-module-properties' || e.type === 'incomplete-module-subobjects'
      )
      assert.strictEqual(autoErrors.length, 0)
    })
  })

  describe('Properties from both required and optional', () => {
    it('includes property whether it is required or optional on different categories', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Base', { id: 'Base', required_properties: ['Has_name'], _filePath: 'categories/Base.wikitext' }],
          ['Extended', { id: 'Extended', optional_properties: ['Has_name', 'Has_extra'], _filePath: 'categories/Extended.wikitext' }],
        ]),
        properties: new Map([
          ['Has_name', { id: 'Has_name', datatype: 'Text', _filePath: 'properties/Has_name.wikitext' }],
          ['Has_extra', { id: 'Has_extra', datatype: 'Text', _filePath: 'properties/Has_extra.wikitext' }],
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Base', 'Extended'],
            properties: ['Has_extra', 'Has_name'],
            subobjects: [],
            templates: [],
          }],
        ]),
      })

      const result = validateReferences(index)
      const autoErrors = result.errors.filter(e =>
        e.type === 'incomplete-module-properties' || e.type === 'incomplete-module-subobjects'
      )
      assert.strictEqual(autoErrors.length, 0)
    })
  })
})

// ─── Resolver edge cases ────────────────────────────────────────────────────

describe('resolveModule edge cases', () => {
  it('deduplicates properties shared between category and its subobject', () => {
    // Both Category and Subobject reference Has_notes
    const index = {
      categories: new Map([
        ['Equipment', {
          id: 'Equipment',
          optional_properties: ['Has_notes'],
          optional_subobjects: ['Has_maintenance_record'],
        }],
      ]),
      subobjects: new Map([
        ['Has_maintenance_record', {
          id: 'Has_maintenance_record',
          optional_properties: ['Has_notes'],
        }],
      ]),
    }

    const result = resolveModule({ categories: ['Equipment'] }, index)

    // Has_notes should appear only once
    assert.deepStrictEqual(result.properties, ['Has_notes'])
  })

  it('handles category referencing non-existent subobject', () => {
    const index = {
      categories: new Map([
        ['Person', { id: 'Person', optional_subobjects: ['Does_not_exist'] }],
      ]),
      subobjects: new Map(),
    }

    const result = resolveModule({ categories: ['Person'] }, index)

    // Subobject is still listed (reference-validator catches that it doesn't exist)
    assert.deepStrictEqual(result.subobjects, ['Does_not_exist'])
    // But no properties collected from it (since it doesn't exist)
    assert.deepStrictEqual(result.properties, [])
  })
})

// ─── tracePropertySource / traceSubobjectSource edge cases ──────────────────

describe('tracePropertySource edge cases', () => {
  it('returns unknown source for property not in any category or subobject', () => {
    const index = {
      categories: new Map([
        ['Agent', { id: 'Agent', required_properties: ['Has_name'] }],
      ]),
      subobjects: new Map(),
    }

    const source = tracePropertySource('Has_nonexistent', { categories: ['Agent'] }, index)
    assert.strictEqual(source, 'unknown source')
  })

  it('returns first matching category when property is in multiple', () => {
    const index = {
      categories: new Map([
        ['Alpha', { id: 'Alpha', required_properties: ['Has_shared'] }],
        ['Beta', { id: 'Beta', required_properties: ['Has_shared'] }],
      ]),
      subobjects: new Map(),
    }

    const source = tracePropertySource('Has_shared', { categories: ['Alpha', 'Beta'] }, index)
    // Should return first match
    assert.strictEqual(source, 'category "Alpha"')
  })
})

describe('traceSubobjectSource edge cases', () => {
  it('returns unknown source for subobject not in any category', () => {
    const index = {
      categories: new Map([
        ['Agent', { id: 'Agent' }],
      ]),
      subobjects: new Map(),
    }

    const source = traceSubobjectSource('Non_existent', { categories: ['Agent'] }, index)
    assert.strictEqual(source, 'unknown source')
  })
})
