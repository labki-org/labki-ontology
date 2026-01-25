import { describe, test } from 'node:test'
import assert from 'node:assert'
import { detectCycles } from './cycle-detector.js'
import { createMockEntityIndex, createCyclicIndex } from '../__fixtures__/mock-entity-index.js'

describe('detectCycles', () => {
  describe('Category inheritance cycles', () => {
    test('simple A->B->A cycle detected', () => {
      const index = createCyclicIndex('category')

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].type.includes('circular'))
      assert.ok(result.errors[0].message.includes('CategoryA'))
      assert.ok(result.errors[0].message.includes('CategoryB'))
    })

    test('three-node cycle A->B->C->A detected', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['CatA', { id: 'CatA', parents: ['CatC'], _filePath: 'categories/CatA.json' }],
          ['CatB', { id: 'CatB', parents: ['CatA'], _filePath: 'categories/CatB.json' }],
          ['CatC', { id: 'CatC', parents: ['CatB'], _filePath: 'categories/CatC.json' }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].type.includes('circular-category'))
    })

    test('self-reference A->A detected', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['SelfRef', {
            id: 'SelfRef',
            parents: ['SelfRef'],
            _filePath: 'categories/SelfRef.json'
          }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].message.includes('SelfRef'))
    })

    test('valid linear chain passes (no cycle)', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Root', { id: 'Root', _filePath: 'categories/Root.json' }],
          ['Middle', { id: 'Middle', parents: ['Root'], _filePath: 'categories/Middle.json' }],
          ['Leaf', { id: 'Leaf', parents: ['Middle'], _filePath: 'categories/Leaf.json' }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('diamond inheritance is not a cycle', () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      const index = createMockEntityIndex({
        categories: new Map([
          ['D', { id: 'D', _filePath: 'categories/D.json' }],
          ['B', { id: 'B', parents: ['D'], _filePath: 'categories/B.json' }],
          ['C', { id: 'C', parents: ['D'], _filePath: 'categories/C.json' }],
          ['A', { id: 'A', parents: ['B', 'C'], _filePath: 'categories/A.json' }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('multiple independent cycles detected', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['CycleA1', { id: 'CycleA1', parents: ['CycleA2'], _filePath: 'categories/CycleA1.json' }],
          ['CycleA2', { id: 'CycleA2', parents: ['CycleA1'], _filePath: 'categories/CycleA2.json' }],
          ['Valid', { id: 'Valid', _filePath: 'categories/Valid.json' }]
        ])
      })

      const result = detectCycles(index)

      // dependency-graph typically reports one cycle at a time
      assert.ok(result.errors.length >= 1)
    })
  })

  describe('Module dependency cycles', () => {
    test('ModuleA->ModuleB->ModuleA cycle detected', () => {
      const index = createCyclicIndex('module')

      const result = detectCycles(index)

      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      assert.strictEqual(moduleErrors.length, 1)
      assert.ok(moduleErrors[0].message.includes('ModuleA'))
      assert.ok(moduleErrors[0].message.includes('ModuleB'))
    })

    test('three-module cycle detected', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['ModA', { id: 'ModA', dependencies: ['ModC'], categories: [], properties: [] }],
          ['ModB', { id: 'ModB', dependencies: ['ModA'], categories: [], properties: [] }],
          ['ModC', { id: 'ModC', dependencies: ['ModB'], categories: [], properties: [] }]
        ])
      })

      const result = detectCycles(index)

      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      assert.strictEqual(moduleErrors.length, 1)
    })

    test('self-dependency detected', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['SelfDep', {
            id: 'SelfDep',
            dependencies: ['SelfDep'],
            categories: [],
            properties: [],
            _filePath: 'modules/SelfDep.json'
          }]
        ])
      })

      const result = detectCycles(index)

      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      assert.strictEqual(moduleErrors.length, 1)
    })

    test('valid dependency chain passes', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['Core', { id: 'Core', dependencies: [], categories: [], properties: [] }],
          ['Lab', { id: 'Lab', dependencies: ['Core'], categories: [], properties: [] }],
          ['Analysis', { id: 'Analysis', dependencies: ['Lab'], categories: [], properties: [] }]
        ])
      })

      const result = detectCycles(index)

      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      assert.strictEqual(moduleErrors.length, 0)
    })

    test('complex valid tree passes', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['Core', { id: 'Core', dependencies: [], categories: [], properties: [] }],
          ['Utils', { id: 'Utils', dependencies: ['Core'], categories: [], properties: [] }],
          ['Lab', { id: 'Lab', dependencies: ['Core', 'Utils'], categories: [], properties: [] }],
          ['Analysis', { id: 'Analysis', dependencies: ['Lab', 'Utils'], categories: [], properties: [] }]
        ])
      })

      const result = detectCycles(index)

      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      assert.strictEqual(moduleErrors.length, 0)
    })
  })

  describe('Property parent_property cycles', () => {
    test('PropA->PropB->PropA cycle detected', () => {
      const index = createCyclicIndex('property')

      const result = detectCycles(index)

      const propErrors = result.errors.filter(e => e.type.includes('property'))
      assert.strictEqual(propErrors.length, 1)
      assert.ok(propErrors[0].message.includes('PropA'))
      assert.ok(propErrors[0].message.includes('PropB'))
    })

    test('self-referencing property detected', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['SelfProp', {
            id: 'SelfProp',
            datatype: 'Text',
            parent_property: 'SelfProp',
            _filePath: 'properties/SelfProp.json'
          }]
        ])
      })

      const result = detectCycles(index)

      const propErrors = result.errors.filter(e => e.type.includes('property'))
      assert.strictEqual(propErrors.length, 1)
    })

    test('valid parent chain passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['RootProp', { id: 'RootProp', datatype: 'Text', _filePath: 'properties/RootProp.json' }],
          ['ChildProp', { id: 'ChildProp', datatype: 'Text', parent_property: 'RootProp', _filePath: 'properties/ChildProp.json' }],
          ['GrandchildProp', { id: 'GrandchildProp', datatype: 'Text', parent_property: 'ChildProp', _filePath: 'properties/GrandchildProp.json' }]
        ])
      })

      const result = detectCycles(index)

      const propErrors = result.errors.filter(e => e.type.includes('property'))
      assert.strictEqual(propErrors.length, 0)
    })

    test('property with no parent passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['Standalone', { id: 'Standalone', datatype: 'Text', _filePath: 'properties/Standalone.json' }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('multiple properties with one cycle detected', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['Valid1', { id: 'Valid1', datatype: 'Text', _filePath: 'properties/Valid1.json' }],
          ['Valid2', { id: 'Valid2', datatype: 'Text', parent_property: 'Valid1', _filePath: 'properties/Valid2.json' }],
          ['CycleA', { id: 'CycleA', datatype: 'Text', parent_property: 'CycleB', _filePath: 'properties/CycleA.json' }],
          ['CycleB', { id: 'CycleB', datatype: 'Text', parent_property: 'CycleA', _filePath: 'properties/CycleB.json' }]
        ])
      })

      const result = detectCycles(index)

      const propErrors = result.errors.filter(e => e.type.includes('property'))
      assert.strictEqual(propErrors.length, 1)
    })
  })

  describe('Combined scenarios', () => {
    test('empty entity index returns no errors', () => {
      const index = createMockEntityIndex()

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('clean index with no cycles returns no errors', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Base', { id: 'Base', _filePath: 'categories/Base.json' }],
          ['Derived', { id: 'Derived', parents: ['Base'], _filePath: 'categories/Derived.json' }]
        ]),
        properties: new Map([
          ['Name', { id: 'Name', datatype: 'Text', _filePath: 'properties/Name.json' }]
        ]),
        modules: new Map([
          ['Core', { id: 'Core', dependencies: [], categories: ['Base', 'Derived'], properties: ['Name'] }]
        ])
      })

      const result = detectCycles(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('multiple cycle types simultaneously detected', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['CatCycle1', { id: 'CatCycle1', parents: ['CatCycle2'], _filePath: 'categories/CatCycle1.json' }],
          ['CatCycle2', { id: 'CatCycle2', parents: ['CatCycle1'], _filePath: 'categories/CatCycle2.json' }]
        ]),
        modules: new Map([
          ['ModCycle1', { id: 'ModCycle1', dependencies: ['ModCycle2'], categories: [], properties: [] }],
          ['ModCycle2', { id: 'ModCycle2', dependencies: ['ModCycle1'], categories: [], properties: [] }]
        ]),
        properties: new Map([
          ['PropCycle1', { id: 'PropCycle1', datatype: 'Text', parent_property: 'PropCycle2', _filePath: 'properties/PropCycle1.json' }],
          ['PropCycle2', { id: 'PropCycle2', datatype: 'Text', parent_property: 'PropCycle1', _filePath: 'properties/PropCycle2.json' }]
        ])
      })

      const result = detectCycles(index)

      // Should detect at least one error from each cycle type
      assert.ok(result.errors.length >= 3)

      const categoryErrors = result.errors.filter(e => e.type.includes('category'))
      const moduleErrors = result.errors.filter(e => e.type.includes('module'))
      const propertyErrors = result.errors.filter(e => e.type.includes('property'))

      assert.ok(categoryErrors.length >= 1)
      assert.ok(moduleErrors.length >= 1)
      assert.ok(propertyErrors.length >= 1)
    })

    test('reference to non-existent entity handled gracefully', () => {
      // Cycle detector should not crash when parent doesn't exist
      // (reference validator handles missing references)
      const index = createMockEntityIndex({
        categories: new Map([
          ['Child', {
            id: 'Child',
            parents: ['NonExistent'],
            _filePath: 'categories/Child.json'
          }]
        ])
      })

      // Should not throw
      const result = detectCycles(index)

      // No cycle should be detected (NonExistent is ignored)
      const categoryErrors = result.errors.filter(e => e.type.includes('category'))
      assert.strictEqual(categoryErrors.length, 0)
    })
  })
})
