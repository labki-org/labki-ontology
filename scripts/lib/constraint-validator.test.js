import { describe, test } from 'node:test'
import assert from 'node:assert'
import { validateConstraints } from './constraint-validator.js'
import { createMockEntityIndex } from '../__fixtures__/mock-entity-index.js'

describe('validateConstraints', () => {
  describe('Category property overlap', () => {
    test('property in both required and optional returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', {
            id: 'Person',
            required_properties: ['Name', 'Email'],
            optional_properties: ['Email', 'Phone'],
            _filePath: 'categories/Person.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'property-conflict')
      assert.ok(result.errors[0].message.includes('Email'))
    })

    test('no overlap returns no errors', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Person', {
            id: 'Person',
            required_properties: ['Name'],
            optional_properties: ['Email', 'Phone'],
            _filePath: 'categories/Person.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      const propertyErrors = result.errors.filter(e => e.type === 'property-conflict')
      assert.strictEqual(propertyErrors.length, 0)
    })

    test('empty lists return no errors', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Empty', {
            id: 'Empty',
            required_properties: [],
            optional_properties: [],
            _filePath: 'categories/Empty.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('undefined lists return no errors', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Minimal', {
            id: 'Minimal',
            _filePath: 'categories/Minimal.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 0)
    })

    test('multiple overlaps returns multiple errors in message', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['MultiOverlap', {
            id: 'MultiOverlap',
            required_properties: ['A', 'B', 'C'],
            optional_properties: ['B', 'C', 'D'],
            _filePath: 'categories/MultiOverlap.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].message.includes('B'))
      assert.ok(result.errors[0].message.includes('C'))
    })
  })

  describe('Category subobject overlap', () => {
    test('subobject in both required and optional returns error', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Container', {
            id: 'Container',
            required_subobjects: ['Address'],
            optional_subobjects: ['Address', 'Contact'],
            _filePath: 'categories/Container.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'subobject-conflict')
      assert.ok(result.errors[0].message.includes('Address'))
    })

    test('no subobject overlap passes', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Container', {
            id: 'Container',
            required_subobjects: ['Address'],
            optional_subobjects: ['Contact'],
            _filePath: 'categories/Container.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      const subobjectErrors = result.errors.filter(e => e.type === 'subobject-conflict')
      assert.strictEqual(subobjectErrors.length, 0)
    })
  })

  describe('Subobject property overlap', () => {
    test('property in both required and optional returns error', () => {
      const index = createMockEntityIndex({
        subobjects: new Map([
          ['Address', {
            id: 'Address',
            required_properties: ['Street', 'City'],
            optional_properties: ['City', 'Zip'],
            _filePath: 'subobjects/Address.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 1)
      assert.strictEqual(result.errors[0].type, 'property-conflict')
      assert.ok(result.errors[0].message.includes('City'))
    })

    test('no overlap in subobject passes', () => {
      const index = createMockEntityIndex({
        subobjects: new Map([
          ['Address', {
            id: 'Address',
            required_properties: ['Street'],
            optional_properties: ['Zip'],
            _filePath: 'subobjects/Address.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })

  describe('Multiple entities', () => {
    test('errors from multiple entities all returned', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Cat1', {
            id: 'Cat1',
            required_properties: ['Shared'],
            optional_properties: ['Shared'],
            _filePath: 'categories/Cat1.json'
          }],
          ['Cat2', {
            id: 'Cat2',
            required_subobjects: ['Sub'],
            optional_subobjects: ['Sub'],
            _filePath: 'categories/Cat2.json'
          }]
        ]),
        subobjects: new Map([
          ['Subobj', {
            id: 'Subobj',
            required_properties: ['Overlap'],
            optional_properties: ['Overlap'],
            _filePath: 'subobjects/Subobj.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 3)
    })

    test('mixed valid and invalid entities returns only invalid errors', () => {
      const index = createMockEntityIndex({
        categories: new Map([
          ['Valid', {
            id: 'Valid',
            required_properties: ['A'],
            optional_properties: ['B'],
            _filePath: 'categories/Valid.json'
          }],
          ['Invalid', {
            id: 'Invalid',
            required_properties: ['X'],
            optional_properties: ['X'],
            _filePath: 'categories/Invalid.json'
          }]
        ])
      })

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 1)
      assert.ok(result.errors[0].file.includes('Invalid'))
    })
  })

  describe('Empty index', () => {
    test('empty entity index returns no errors', () => {
      const index = createMockEntityIndex()

      const result = validateConstraints(index)

      assert.strictEqual(result.errors.length, 0)
    })
  })
})
