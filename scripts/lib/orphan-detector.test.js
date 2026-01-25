import { describe, test } from 'node:test'
import assert from 'node:assert'
import { findOrphanedEntities } from './orphan-detector.js'
import { createMockEntityIndex, createDependencyChainIndex } from '../__fixtures__/mock-entity-index.js'

describe('findOrphanedEntities', () => {
  test('entity in module is not orphan', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Agent', { id: 'Agent', _filePath: 'categories/Agent.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['Agent'],
          properties: [],
          subobjects: [],
          templates: []
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 0)
  })

  test('entity not in any module is orphan', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Orphan', { id: 'Orphan', _filePath: 'categories/Orphan.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],  // Orphan not included
          properties: [],
          subobjects: [],
          templates: []
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 1)
    assert.strictEqual(result.warnings[0].type, 'orphaned-entity')
    assert.ok(result.warnings[0].message.includes('Orphan'))
  })

  test('all entities in modules returns no orphans', () => {
    const index = createDependencyChainIndex()

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 0)
  })

  test('mixed orphan and non-orphan returns correct detection', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['InModule', { id: 'InModule', _filePath: 'categories/InModule.json' }],
        ['Orphan1', { id: 'Orphan1', _filePath: 'categories/Orphan1.json' }]
      ]),
      properties: new Map([
        ['PropInModule', { id: 'PropInModule', datatype: 'Text', _filePath: 'properties/PropInModule.json' }],
        ['OrphanProp', { id: 'OrphanProp', datatype: 'Text', _filePath: 'properties/OrphanProp.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['InModule'],
          properties: ['PropInModule'],
          subobjects: [],
          templates: []
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 2)
    const orphanIds = result.warnings.map(w => w.message)
    assert.ok(orphanIds.some(m => m.includes('Orphan1')))
    assert.ok(orphanIds.some(m => m.includes('OrphanProp')))
  })

  test('empty modules map detects all entities as orphans', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Cat1', { id: 'Cat1', _filePath: 'categories/Cat1.json' }]
      ]),
      properties: new Map([
        ['Prop1', { id: 'Prop1', datatype: 'Text', _filePath: 'properties/Prop1.json' }]
      ]),
      modules: new Map()
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 2)
  })

  test('modules and bundles are not checked for orphans', () => {
    const index = createMockEntityIndex({
      modules: new Map([
        ['Standalone', {
          id: 'Standalone',
          categories: [],
          properties: [],
          subobjects: [],
          templates: []
        }]
      ]),
      bundles: new Map([
        ['Unbundled', {
          id: 'Unbundled',
          modules: [],
          _filePath: 'bundles/Unbundled.json'
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    // Modules and bundles should not be flagged as orphans
    assert.strictEqual(result.warnings.length, 0)
  })

  test('templates and subobjects are checked for orphans', () => {
    const index = createMockEntityIndex({
      subobjects: new Map([
        ['OrphanSub', { id: 'OrphanSub', _filePath: 'subobjects/OrphanSub.json' }]
      ]),
      templates: new Map([
        ['OrphanTmpl', { id: 'OrphanTmpl', _filePath: 'templates/OrphanTmpl.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],
          properties: [],
          subobjects: [],  // OrphanSub not included
          templates: []    // OrphanTmpl not included
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 2)
    const orphanIds = result.warnings.map(w => w.message)
    assert.ok(orphanIds.some(m => m.includes('OrphanSub')))
    assert.ok(orphanIds.some(m => m.includes('OrphanTmpl')))
  })
})
