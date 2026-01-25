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

  describe('Module scope validation', () => {
    test('reference to entity in unrelated module returns scope-violation', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['Name', {
            id: 'Name',
            datatype: 'Text',
            _filePath: 'properties/Name.json'
          }],
          ['Isolated', {
            id: 'Isolated',
            datatype: 'Text',
            _filePath: 'properties/Isolated.json'
          }]
        ]),
        categories: new Map([
          ['Person', {
            id: 'Person',
            optional_properties: ['Name', 'Isolated'],
            _filePath: 'categories/Person.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Person'],
            properties: ['Name'],
            subobjects: [],
            templates: [],
            dependencies: []
          }],
          ['OtherModule', {
            id: 'OtherModule',
            categories: [],
            properties: ['Isolated'],
            subobjects: [],
            templates: [],
            dependencies: []  // NOT a dependency of Core
          }]
        ])
      })

      const result = validateReferences(index)

      const scopeErrors = result.errors.filter(e => e.type === 'scope-violation')
      assert.strictEqual(scopeErrors.length, 1)
      assert.ok(scopeErrors[0].message.includes('Isolated'))
      assert.ok(scopeErrors[0].message.includes('OtherModule'))
    })

    test('reference to entity in same module passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['Name', {
            id: 'Name',
            datatype: 'Text',
            _filePath: 'properties/Name.json'
          }]
        ]),
        categories: new Map([
          ['Person', {
            id: 'Person',
            required_properties: ['Name'],
            _filePath: 'categories/Person.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['Person'],
            properties: ['Name'],
            subobjects: [],
            templates: [],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('reference to entity in dependency passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['BaseProp', {
            id: 'BaseProp',
            datatype: 'Text',
            _filePath: 'properties/BaseProp.json'
          }]
        ]),
        categories: new Map([
          ['Derived', {
            id: 'Derived',
            required_properties: ['BaseProp'],
            _filePath: 'categories/Derived.json'
          }]
        ]),
        modules: new Map([
          ['BaseModule', {
            id: 'BaseModule',
            categories: [],
            properties: ['BaseProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }],
          ['DerivedModule', {
            id: 'DerivedModule',
            categories: ['Derived'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: ['BaseModule']  // Declares dependency
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('reference to entity in transitive dependency passes', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['RootProp', {
            id: 'RootProp',
            datatype: 'Text',
            _filePath: 'properties/RootProp.json'
          }]
        ]),
        categories: new Map([
          ['LeafCat', {
            id: 'LeafCat',
            optional_properties: ['RootProp'],
            _filePath: 'categories/LeafCat.json'
          }]
        ]),
        modules: new Map([
          ['Root', {
            id: 'Root',
            categories: [],
            properties: ['RootProp'],
            subobjects: [],
            templates: [],
            dependencies: []
          }],
          ['Middle', {
            id: 'Middle',
            categories: [],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: ['Root']
          }],
          ['Leaf', {
            id: 'Leaf',
            categories: ['LeafCat'],
            properties: [],
            subobjects: [],
            templates: [],
            dependencies: ['Middle']  // Transitive to Root
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('entity not in any module skips scope check', () => {
      const index = createMockEntityIndex({
        properties: new Map([
          ['OrphanProp', {
            id: 'OrphanProp',
            datatype: 'Text',
            _filePath: 'properties/OrphanProp.json'
          }]
        ]),
        categories: new Map([
          ['OrphanCat', {
            id: 'OrphanCat',
            optional_properties: ['OrphanProp'],
            _filePath: 'categories/OrphanCat.json'
          }]
        ]),
        modules: new Map()  // No modules
      })

      const result = validateReferences(index)

      // No scope violation because category isn't in a module
      const scopeErrors = result.errors.filter(e => e.type === 'scope-violation')
      assert.strictEqual(scopeErrors.length, 0)
    })

    test('property references template outside scope returns scope-violation', () => {
      const index = createMockEntityIndex({
        templates: new Map([
          ['IsolatedTemplate', {
            id: 'IsolatedTemplate',
            _filePath: 'templates/IsolatedTemplate.json'
          }]
        ]),
        properties: new Map([
          ['Display', {
            id: 'Display',
            datatype: 'Text',
            has_display_template: 'IsolatedTemplate',
            _filePath: 'properties/Display.json'
          }]
        ]),
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: [],
            properties: ['Display'],
            subobjects: [],
            templates: [],  // Template NOT in this module
            dependencies: []
          }],
          ['TemplateModule', {
            id: 'TemplateModule',
            categories: [],
            properties: [],
            subobjects: [],
            templates: ['IsolatedTemplate'],
            dependencies: []
          }]
        ])
      })

      const result = validateReferences(index)

      const scopeErrors = result.errors.filter(e => e.type === 'scope-violation')
      assert.strictEqual(scopeErrors.length, 1)
      assert.ok(scopeErrors[0].message.includes('IsolatedTemplate'))
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
