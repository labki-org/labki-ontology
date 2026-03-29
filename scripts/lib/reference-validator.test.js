import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateReferences, REFERENCE_FIELDS } from './reference-validator.js'
import { createMockEntityIndex, createDependencyChainIndex, createReferenceTestIndex } from '../__fixtures__/mock-entity-index.js'

describe('validateReferences', () => {
  describe('Missing reference detection', () => {
    test('category with missing parent returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Child', {
            id: 'Child',
            parents: ['NonExistentParent'],
            _filePath: 'categories/Child.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Child'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
      assert.ok(result.errors[0].message.includes('NonExistentParent'))
    })

    test('category with missing required_property returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', {
            id: 'Person',
            required_properties: ['MissingProp'],
            _filePath: 'categories/Person.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Person'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
      assert.ok(result.errors[0].message.includes('MissingProp'))
    })

    test('category with missing optional_property returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', {
            id: 'Person',
            optional_properties: ['MissingOptional'],
            _filePath: 'categories/Person.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Person'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
    })

    test('property with missing parent_property returns error', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['ChildProp', {
            id: 'ChildProp',
            datatype: 'Text',
            parent_property: 'MissingParent',
            _filePath: 'properties/ChildProp.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: [],
            properties: ['ChildProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
      assert.ok(result.errors[0].message.includes('MissingParent'))
    })

    test('module with missing category returns error', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['NonExistentCategory'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: [],
            _filePath: 'modules/Core.json'
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
      assert.ok(result.errors[0].message.includes('NonExistentCategory'))
    })

    test('bundle with missing module returns error', () => {
      const index = createMockEntityIndex({
        bundles: new Map([
          ['Default', {
            id: 'Default',
            modules: ['NonExistentModule'],
            _filePath: 'bundles/Default.json'
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'missing-reference')
      assert.ok(result.errors[0].message.includes('NonExistentModule'))
    })
  })

  describe('Self-reference prevention', () => {
    test('category parent references itself returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['SelfRef', {
            id: 'SelfRef',
            parents: ['SelfRef'],
            _filePath: 'categories/SelfRef.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['SelfRef'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      const selfRefErrors = result.errors.filter(e => e.type === 'self-reference')
      assert.strictEqual(selfRefErrors.length, 1)
      assert.ok(selfRefErrors[0].message.includes('references itself'))
    })

    test('property parent_property references itself returns error', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['SelfProp', {
            id: 'SelfProp',
            datatype: 'Text',
            parent_property: 'SelfProp',
            _filePath: 'properties/SelfProp.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: [],
            properties: ['SelfProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      const selfRefErrors = result.errors.filter(e => e.type === 'self-reference')
      assert.strictEqual(selfRefErrors.length, 1)
    })

    test('module dependency references itself returns error', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['SelfDep', {
            id: 'SelfDep',
            dependencies: ['SelfDep'],
            categories: [],
            properties: [],
            subobjects: [],
            templates: [],
            _filePath: 'modules/SelfDep.json'
          }]
        ])
      })

      const result = validateReferences(index)

      const selfRefErrors = result.errors.filter(e => e.type === 'self-reference')
      assert.strictEqual(selfRefErrors.length, 1)
    })

    test('valid non-self-reference passes', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Parent', {
            id: 'Parent',
            _filePath: 'categories/Parent.json'
          }],
          ['Child', {
            id: 'Child',
            parents: ['Parent'],
            _filePath: 'categories/Child.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Parent', 'Child'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('Entities in multiple modules', () => {
    test('entity referenced across modules without dependencies passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['SharedProp', {
            id: 'SharedProp',
            datatype: 'Text',
            _filePath: 'properties/SharedProp.json'
          }]
        ]),
        categories: new Map([
          ['CatA', {
            id: 'CatA',
            optional_properties: ['SharedProp'],
            _filePath: 'categories/CatA.json'
          }]
        ]),
        modules: new Map([
          ['ModuleA', {
            id: 'ModuleA',
            categories: ['CatA'],
            properties: ['SharedProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }],
          ['ModuleB', {
            id: 'ModuleB',
            categories: [],
            properties: ['SharedProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('Valid scenarios', () => {
    test('all references valid returns no errors', () => {
      const index = createDependencyChainIndex()

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('empty entity index returns no errors', () => {
      const index = createMockEntityIndex()

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('complex valid dependency chain passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['CoreProp', { id: 'CoreProp', datatype: 'Text', _filePath: 'properties/CoreProp.json' }],
          ['ChildProp', { id: 'ChildProp', datatype: 'Text', parent_property: 'CoreProp', _filePath: 'properties/ChildProp.json' }]
        ]),
        categories: new Map([
          ['Base', { id: 'Base', required_properties: ['CoreProp'], _filePath: 'categories/Base.json' }],
          ['Derived', { id: 'Derived', parents: ['Base'], optional_properties: ['ChildProp'], _filePath: 'categories/Derived.json' }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Base', 'Derived'],
            properties: ['CoreProp', 'ChildProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ]),
        bundles: new Map([
          ['Default', {
            id: 'Default',
            modules: ['Core'],
            _filePath: 'bundles/Default.json'
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('array reference with multiple valid refs passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['Prop1', { id: 'Prop1', datatype: 'Text', _filePath: 'properties/Prop1.json' }],
          ['Prop2', { id: 'Prop2', datatype: 'Text', _filePath: 'properties/Prop2.json' }],
          ['Prop3', { id: 'Prop3', datatype: 'Text', _filePath: 'properties/Prop3.json' }]
        ]),
        categories: new Map([
          ['MultiRef', {
            id: 'MultiRef',
            required_properties: ['Prop1', 'Prop2'],
            optional_properties: ['Prop3'],
            _filePath: 'categories/MultiRef.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['MultiRef'],
            properties: ['Prop1', 'Prop2', 'Prop3'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })
})

describe('REFERENCE_FIELDS', () => {
  test('defines expected entity types', () => {
    assert.ok(REFERENCE_FIELDS.categories)
    assert.ok(REFERENCE_FIELDS.properties)
    assert.ok(REFERENCE_FIELDS.modules)
    assert.ok(REFERENCE_FIELDS.bundles)
  })

  test('categories has expected reference fields', () => {
    assert.strictEqual(REFERENCE_FIELDS.categories.parents, 'categories')
    assert.strictEqual(REFERENCE_FIELDS.categories.required_properties, 'properties')
    assert.strictEqual(REFERENCE_FIELDS.categories.optional_properties, 'properties')
  })

  test('properties has expected reference fields', () => {
    assert.strictEqual(REFERENCE_FIELDS.properties.parent_property, 'properties')
    assert.strictEqual(REFERENCE_FIELDS.properties.has_display_template, 'templates')
  })
})
