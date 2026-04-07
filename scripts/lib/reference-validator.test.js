import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateReferences, validateMediaReferences, REFERENCE_FIELDS } from './reference-validator.js'
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
            dashboards: [],
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
      })

      const result = validateReferences(index)

      const refErrors = result.errors.filter(e => e.type === 'missing-reference')
      assert.strictEqual(refErrors.length, 1)
      assert.ok(refErrors[0].message.includes('MissingProp'))
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
      })

      const result = validateReferences(index)

      const refErrors = result.errors.filter(e => e.type === 'missing-reference')
      assert.strictEqual(refErrors.length, 1)
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
      })

      const result = validateReferences(index)

      const refErrors = result.errors.filter(e => e.type === 'missing-reference')
      assert.strictEqual(refErrors.length, 1)
      assert.ok(refErrors[0].message.includes('MissingParent'))
    })

    test('module with missing category returns error', () => {
      const index = createMockEntityIndex({
        modules: new Map([
          ['Core', {
            id: 'Core',
            categories: ['NonExistentCategory'],
            dashboards: [],
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
            dashboards: [],
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
            dashboards: [],
          }]
        ])
      })

      const result = validateReferences(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('Entities in multiple modules', () => {
    test('category in multiple modules passes', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Shared', {
            id: 'Shared',
            _filePath: 'categories/Shared.json'
          }]
        ]),
        modules: new Map([
          ['ModuleA', {
            id: 'ModuleA',
            categories: ['Shared'],
            dashboards: [],
          }],
          ['ModuleB', {
            id: 'ModuleB',
            categories: ['Shared'],
            dashboards: [],
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
            dashboards: [],
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
            dashboards: [],
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

  test('modules only references categories and dashboards', () => {
    assert.strictEqual(REFERENCE_FIELDS.modules.categories, 'categories')
    assert.strictEqual(REFERENCE_FIELDS.modules.dashboards, 'dashboards')
    assert.strictEqual(Object.keys(REFERENCE_FIELDS.modules).length, 2)
  })
})

describe('validateMediaReferences', () => {
  test('returns error for missing media file', () => {
    const index = createMockEntityIndex({
      resources: new Map([
        ['Person/John_doe', {
          id: 'Person/John_doe',
          _mediaRefs: ['missing_image.png'],
          _filePath: 'resources/Person/John_doe.wikitext'
        }]
      ]),
      media: new Map()
    })

    const result = validateMediaReferences(index)

    assert.strictEqual(result.errors.length, 1)
    assert.strictEqual(result.errors[0].type, 'missing-media')
    assert.ok(result.errors[0].message.includes('missing_image.png'))
  })

  test('returns warning for oversized media file', () => {
    const index = createMockEntityIndex({
      resources: new Map(),
      media: new Map([
        ['large_image.png', {
          id: 'large_image.png',
          filename: 'large_image.png',
          extension: '.png',
          sizeBytes: 6 * 1024 * 1024, // 6MB
          metadata: { source: 'Test', license: 'CC0-1.0' },
          hasJsonFile: true,
          _filePath: 'media/large_image.png'
        }]
      ])
    })

    const result = validateMediaReferences(index)

    assert.strictEqual(result.errors.length, 0)
    assert.strictEqual(result.warnings.length, 1)
    assert.strictEqual(result.warnings[0].type, 'media-size')
    assert.ok(result.warnings[0].message.includes('6.0MB'))
  })

  test('passes when all media references are valid', () => {
    const index = createMockEntityIndex({
      resources: new Map([
        ['Person/John_doe', {
          id: 'Person/John_doe',
          _mediaRefs: ['photo.png'],
          _filePath: 'resources/Person/John_doe.wikitext'
        }]
      ]),
      media: new Map([
        ['photo.png', {
          id: 'photo.png',
          filename: 'photo.png',
          extension: '.png',
          sizeBytes: 1024,
          metadata: { source: 'Test', license: 'CC0-1.0' },
          hasJsonFile: true,
          _filePath: 'media/photo.png'
        }]
      ])
    })

    const result = validateMediaReferences(index)

    assert.strictEqual(result.errors.length, 0)
    assert.strictEqual(result.warnings.length, 0)
  })

  test('passes when resources have no media refs', () => {
    const index = createMockEntityIndex({
      resources: new Map([
        ['Person/John_doe', {
          id: 'Person/John_doe',
          _filePath: 'resources/Person/John_doe.wikitext'
        }]
      ]),
      media: new Map()
    })

    const result = validateMediaReferences(index)

    assert.strictEqual(result.errors.length, 0)
    assert.strictEqual(result.warnings.length, 0)
  })

  describe('Media metadata validation', () => {
    test('error when media file has no matching JSON sidecar', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: null,
            hasJsonFile: false,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      const metaErrors = result.errors.filter(e => e.type === 'missing-media-metadata')
      assert.strictEqual(metaErrors.length, 1)
      assert.ok(metaErrors[0].message.includes('photo.png'))
      assert.ok(metaErrors[0].message.includes('no matching .json sidecar'))
    })

    test('error when JSON sidecar is malformed', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: null,
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      const metaErrors = result.errors.filter(e => e.type === 'malformed-media-metadata')
      assert.strictEqual(metaErrors.length, 1)
      assert.ok(metaErrors[0].message.includes('malformed'))
    })

    test('error when JSON is missing source field', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: { license: 'CC-BY-4.0' },
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      const fieldErrors = result.errors.filter(e => e.type === 'missing-media-metadata-field')
      assert.strictEqual(fieldErrors.length, 1)
      assert.ok(fieldErrors[0].message.includes('"source"'))
    })

    test('error when JSON is missing license field', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: { source: 'Aharoni Lab, UCLA' },
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      const fieldErrors = result.errors.filter(e => e.type === 'missing-media-metadata-field')
      assert.strictEqual(fieldErrors.length, 1)
      assert.ok(fieldErrors[0].message.includes('"license"'))
    })

    test('pass when all metadata is valid with required fields only', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: { source: 'Aharoni Lab, UCLA', license: 'CC-BY-4.0' },
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      assert.strictEqual(result.errors.length, 0)
      assert.strictEqual(result.warnings.length, 0)
    })

    test('optional fields (description, author) do not cause errors when missing', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: { source: 'Aharoni Lab, UCLA', license: 'CC-BY-4.0' },
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      assert.strictEqual(result.errors.length, 0)
      // Verify no errors about description or author
      const fieldErrors = result.errors.filter(e => e.type === 'missing-media-metadata-field')
      assert.strictEqual(fieldErrors.length, 0)
    })

    test('pass when all metadata fields are present including optional', () => {
      const index = createMockEntityIndex({
        resources: new Map(),
        media: new Map([
          ['photo.png', {
            id: 'photo.png',
            filename: 'photo.png',
            extension: '.png',
            sizeBytes: 1024,
            metadata: {
              source: 'Aharoni Lab, UCLA',
              license: 'CC-BY-4.0',
              description: 'A test photo',
              author: 'Daniel Aharoni'
            },
            hasJsonFile: true,
            _filePath: 'media/photo.png'
          }]
        ])
      })

      const result = validateMediaReferences(index)

      assert.strictEqual(result.errors.length, 0)
      assert.strictEqual(result.warnings.length, 0)
    })
  })
})
