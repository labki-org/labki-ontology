import { describe, test } from 'node:test'
import assert from 'node:assert'
import { findOrphanedEntities } from './orphan-detector.js'
import { createMockEntityIndex, createDependencyChainIndex } from '../__fixtures__/mock-entity-index.js'

describe('findOrphanedEntities', () => {
  test('category in module is not orphan', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Agent', { id: 'Agent', _filePath: 'categories/Agent.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['Agent'],
          dashboards: [],
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 0)
  })

  test('category not in any module is orphan', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Orphan', { id: 'Orphan', _filePath: 'categories/Orphan.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],
          dashboards: [],
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

  test('mixed orphan and non-orphan categories detected correctly', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['InModule', { id: 'InModule', _filePath: 'categories/InModule.json' }],
        ['Orphan1', { id: 'Orphan1', _filePath: 'categories/Orphan1.json' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['InModule'],
          dashboards: [],
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].message.includes('Orphan1'))
  })

  test('empty modules map detects all categories as orphans', () => {
    const index = createMockEntityIndex({
      categories: new Map([
        ['Cat1', { id: 'Cat1', _filePath: 'categories/Cat1.json' }]
      ]),
      modules: new Map()
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 1)
  })

  test('modules and bundles are not checked for orphans', () => {
    const index = createMockEntityIndex({
      modules: new Map([
        ['Standalone', {
          id: 'Standalone',
          categories: [],
          dashboards: [],
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

  test('dashboard in module is not orphan', () => {
    const index = createMockEntityIndex({
      dashboards: new Map([
        ['MainDash', { id: 'MainDash', _filePath: 'dashboards/MainDash.wikitext' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],
          dashboards: ['MainDash'],
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 0)
  })

  test('dashboard not in any module is orphan', () => {
    const index = createMockEntityIndex({
      dashboards: new Map([
        ['OrphanDash', { id: 'OrphanDash', _filePath: 'dashboards/OrphanDash.wikitext' }]
      ]),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],
          dashboards: [],
        }]
      ])
    })

    const result = findOrphanedEntities(index)

    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].message.includes('OrphanDash'))
  })
})
