/**
 * Round-trip tests: JSON -> wikitext (generator) -> JSON (parser) should produce
 * semantically identical results.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  parseCategory,
  parseProperty,
  parseSubobject,
  parseTemplate,
  parseResource,
} from './wikitext-parser.js'
import {
  generateCategory,
  generateProperty,
  generateSubobject,
  generateTemplate,
  generateResource,
} from './wikitext-generator.js'

describe('category round-trip', () => {
  it('preserves all fields through generate -> parse cycle', () => {
    const original = {
      id: 'Person',
      label: 'Human Person',
      description: 'A human being',
      parents: ['Agent'],
      required_properties: ['Has_name'],
      optional_properties: ['Has_email', 'Has_website'],
      required_subobjects: ['Contact_info'],
      optional_subobjects: ['Address'],
    }

    const wikitext = generateCategory(original)
    const parsed = parseCategory(wikitext, 'Person')

    assert.strictEqual(parsed.id, original.id)
    assert.strictEqual(parsed.label, original.label)
    assert.strictEqual(parsed.description, original.description)
    assert.deepStrictEqual(parsed.parents, original.parents)
    assert.deepStrictEqual(parsed.required_properties, original.required_properties)
    assert.deepStrictEqual(parsed.optional_properties, original.optional_properties)
    assert.deepStrictEqual(parsed.required_subobjects, original.required_subobjects)
    assert.deepStrictEqual(parsed.optional_subobjects, original.optional_subobjects)
  })

  it('handles category where label matches page name (label omitted in wikitext)', () => {
    const original = {
      id: 'Person',
      label: 'Person',
      description: 'A human being',
    }

    const wikitext = generateCategory(original)
    const parsed = parseCategory(wikitext, 'Person')

    assert.strictEqual(parsed.label, 'Person')
    assert.ok(!wikitext.includes('display_label'))
  })
})

describe('property round-trip', () => {
  it('preserves simple text property', () => {
    const original = {
      id: 'Has_name',
      label: 'Name',
      description: 'The name of an entity',
      datatype: 'Text',
      cardinality: 'single',
    }

    const wikitext = generateProperty(original)
    const parsed = parseProperty(wikitext, 'Has_name')

    assert.strictEqual(parsed.id, original.id)
    assert.strictEqual(parsed.label, original.label)
    assert.strictEqual(parsed.description, original.description)
    assert.strictEqual(parsed.datatype, original.datatype)
    assert.strictEqual(parsed.cardinality, original.cardinality)
  })

  it('preserves multi-value property', () => {
    const original = {
      id: 'Has_email',
      label: 'Email',
      description: 'Email address',
      datatype: 'Email',
      cardinality: 'multiple',
    }

    const wikitext = generateProperty(original)
    const parsed = parseProperty(wikitext, 'Has_email')

    assert.strictEqual(parsed.cardinality, 'multiple')
  })

  it('preserves property with allowed values', () => {
    const original = {
      id: 'Has_status',
      label: 'Status',
      description: 'Item status',
      datatype: 'Text',
      cardinality: 'single',
      allowed_values: ['Active', 'Inactive', 'Archived'],
    }

    const wikitext = generateProperty(original)
    const parsed = parseProperty(wikitext, 'Has_status')

    assert.deepStrictEqual(parsed.allowed_values, original.allowed_values)
  })

  it('preserves property with display template', () => {
    const original = {
      id: 'Has_related',
      label: 'Related',
      description: 'Related page',
      datatype: 'Page',
      cardinality: 'single',
      has_display_template: 'Property/Page',
    }

    const wikitext = generateProperty(original)
    const parsed = parseProperty(wikitext, 'Has_related')

    assert.strictEqual(parsed.has_display_template, 'Property/Page')
  })
})

describe('subobject round-trip', () => {
  it('preserves all fields', () => {
    const original = {
      id: 'Address',
      label: 'Address',
      description: 'A physical or mailing address',
      required_properties: ['Has_street', 'Has_city', 'Has_country'],
      optional_properties: ['Has_postal_code'],
    }

    const wikitext = generateSubobject(original)
    const parsed = parseSubobject(wikitext, 'Address')

    assert.strictEqual(parsed.id, original.id)
    assert.strictEqual(parsed.description, original.description)
    assert.deepStrictEqual(parsed.required_properties, original.required_properties)
    assert.deepStrictEqual(parsed.optional_properties, original.optional_properties)
  })
})

describe('template round-trip', () => {
  it('preserves wikitext content', () => {
    const original = {
      id: 'Property/Page',
      label: 'Property/Page',
      description: '',
      wikitext: '<includeonly>{{#if:{{{value|}}}|[[:{{FULLPAGENAME}}]]|}}</includeonly>',
    }

    const wikitext = generateTemplate(original)
    const parsed = parseTemplate(wikitext, 'Property/Page')

    assert.strictEqual(parsed.wikitext, original.wikitext)
  })
})

describe('resource round-trip', () => {
  it('preserves category and properties', () => {
    const original = {
      id: 'Person/John_doe',
      label: 'John Doe',
      description: 'Example person',
      category: 'Person',
      Has_name: 'John Doe',
      Has_email: 'john@example.com',
    }

    const wikitext = generateResource(original)
    const parsed = parseResource(wikitext, 'Person/John_doe')

    assert.strictEqual(parsed.id, original.id)
    assert.strictEqual(parsed.label, original.label)
    assert.strictEqual(parsed.category, original.category)
    assert.strictEqual(parsed.Has_name, original.Has_name)
    assert.strictEqual(parsed.Has_email, original.Has_email)
  })
})
