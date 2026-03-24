/**
 * Round-trip tests: JSON -> wikitext (generator) -> JSON (parser) should produce
 * semantically identical results.
 */
import { describe, it, expect } from 'vitest'
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

    expect(parsed.id).toBe(original.id)
    expect(parsed.label).toBe(original.label)
    expect(parsed.description).toBe(original.description)
    expect(parsed.parents).toEqual(original.parents)
    expect(parsed.required_properties).toEqual(original.required_properties)
    expect(parsed.optional_properties).toEqual(original.optional_properties)
    expect(parsed.required_subobjects).toEqual(original.required_subobjects)
    expect(parsed.optional_subobjects).toEqual(original.optional_subobjects)
  })

  it('handles category where label matches page name (label omitted in wikitext)', () => {
    const original = {
      id: 'Person',
      label: 'Person',
      description: 'A human being',
    }

    const wikitext = generateCategory(original)
    const parsed = parseCategory(wikitext, 'Person')

    expect(parsed.label).toBe('Person')
    // Label should be derived from entity key since it wasn't in the wikitext
    expect(wikitext).not.toContain('Display label')
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

    expect(parsed.id).toBe(original.id)
    expect(parsed.label).toBe(original.label)
    expect(parsed.description).toBe(original.description)
    expect(parsed.datatype).toBe(original.datatype)
    expect(parsed.cardinality).toBe(original.cardinality)
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

    expect(parsed.cardinality).toBe('multiple')
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

    expect(parsed.allowed_values).toEqual(original.allowed_values)
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

    expect(parsed.has_display_template).toBe('Property/Page')
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

    expect(parsed.id).toBe(original.id)
    expect(parsed.description).toBe(original.description)
    expect(parsed.required_properties).toEqual(original.required_properties)
    expect(parsed.optional_properties).toEqual(original.optional_properties)
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

    expect(parsed.wikitext).toBe(original.wikitext)
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

    expect(parsed.id).toBe(original.id)
    expect(parsed.label).toBe(original.label)
    expect(parsed.category).toBe(original.category)
    expect(parsed.Has_name).toBe(original.Has_name)
    expect(parsed.Has_email).toBe(original.Has_email)
  })
})
