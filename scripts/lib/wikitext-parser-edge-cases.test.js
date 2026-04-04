/**
 * Edge case tests for wikitext-parser.js
 *
 * These test malformed input, boundary conditions, and ID/label
 * conversion that aren't covered by the main parser tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractTemplateCall,
  extractCategories,
  toPageName,
  toEntityKey,
  parseCategory,
  parseProperty,
  parseSubobject,
  parseResource,
  parseFilePath,
} from './wikitext-parser.js'

// ─── extractTemplateCall edge cases ────────────────────────────────────────

describe('extractTemplateCall edge cases', () => {
  it('returns null for empty string', () => {
    const result = extractTemplateCall('')
    assert.strictEqual(result, null)
  })

  it('returns null for wikitext with no annotation block', () => {
    const result = extractTemplateCall('Just some text\nNo markers here\n')
    assert.strictEqual(result, null)
  })

  it('ignores content outside the OntologySync block', () => {
    const wikitext = `
some random text before
<!-- OntologySync Start -->
{{Property
|has_description=Inside annotation
}}
<!-- OntologySync End -->
some random text after
`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result.params.get('has_description'), 'Inside annotation')
  })

  it('handles empty annotation block', () => {
    const wikitext = `<!-- OntologySync Start -->
<!-- OntologySync End -->`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result, null)
  })

  it('extracts multiple params correctly', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|allows_value=Active, Inactive, Pending
}}
<!-- OntologySync End -->`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result.params.get('allows_value'), 'Active, Inactive, Pending')
  })

  it('handles lines with leading/trailing whitespace', () => {
    const wikitext = `<!-- OntologySync Start -->
  {{Property
  |has_description=Indented
  |has_type=Text
  }}
<!-- OntologySync End -->`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result.params.get('has_description'), 'Indented')
    assert.strictEqual(result.params.get('has_type'), 'Text')
  })

  it('handles parameter values containing equals signs', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=Value with: colons in it
}}
<!-- OntologySync End -->`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result.params.get('has_description'), 'Value with: colons in it')
  })

  it('handles template with no params', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
}}
<!-- OntologySync End -->`
    const result = extractTemplateCall(wikitext)
    assert.strictEqual(result.templateName, 'Category')
    assert.strictEqual(result.params.size, 0)
  })
})

// ─── extractCategories ──────────────────────────────────────────────────────

describe('extractCategories edge cases', () => {
  it('extracts categories outside the block only', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
[[Category:Person]]`
    const cats = extractCategories(wikitext)
    assert.deepStrictEqual(cats, ['OntologySync-managed', 'Person'])
  })

  it('ignores Category annotations inside the block', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
}}
<!-- OntologySync End -->
[[Category:Visible]]`
    const cats = extractCategories(wikitext)
    assert.deepStrictEqual(cats, ['Visible'])
  })

  it('returns empty array when no categories', () => {
    const cats = extractCategories('no categories here')
    assert.deepStrictEqual(cats, [])
  })
})

// ─── ID / label conversion ─────────────────────────────────────────────────

describe('toPageName', () => {
  it('converts underscores to spaces', () => {
    assert.strictEqual(toPageName('Has_first_name'), 'Has first name')
  })

  it('handles single word (no underscores)', () => {
    assert.strictEqual(toPageName('Agent'), 'Agent')
  })

  it('handles empty string', () => {
    assert.strictEqual(toPageName(''), '')
  })

  it('handles consecutive underscores', () => {
    assert.strictEqual(toPageName('Has__double'), 'Has  double')
  })
})

describe('toEntityKey', () => {
  it('converts spaces to underscores', () => {
    assert.strictEqual(toEntityKey('Has first name'), 'Has_first_name')
  })

  it('handles single word (no spaces)', () => {
    assert.strictEqual(toEntityKey('Agent'), 'Agent')
  })

  it('handles empty string', () => {
    assert.strictEqual(toEntityKey(''), '')
  })
})

// ─── parseCategory edge cases ───────────────────────────────────────────────

describe('parseCategory edge cases', () => {
  it('derives label from entity key when display_label is absent', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Research_student')
    assert.strictEqual(result.label, 'Research student')
  })

  it('uses display_label when present', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
|display_label=Custom Label
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Something')
    assert.strictEqual(result.label, 'Custom Label')
  })

  it('omits parents field when no parent categories', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Root
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Root')
    assert.strictEqual(result.parents, undefined)
  })

  it('parses parent category reference without namespace prefix', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
|has_parent_category=Agent
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Person')
    assert.deepStrictEqual(result.parents, ['Agent'])
  })

  it('converts comma-separated property references to entity keys', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Test
|has_required_property=Has first name
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Person')
    assert.deepStrictEqual(result.required_properties, ['Has_first_name'])
  })

  it('handles category with all fields populated', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_description=Full category
|display_label=Full
|has_parent_category=Base
|has_required_property=Has name
|has_optional_property=Has email
|has_required_subobject=Required sub
|has_optional_subobject=Optional sub
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Full')

    assert.strictEqual(result.description, 'Full category')
    assert.deepStrictEqual(result.parents, ['Base'])
    assert.deepStrictEqual(result.required_properties, ['Has_name'])
    assert.deepStrictEqual(result.optional_properties, ['Has_email'])
    assert.deepStrictEqual(result.required_subobjects, ['Required_sub'])
    assert.deepStrictEqual(result.optional_subobjects, ['Optional_sub'])
  })
})

// ─── parseProperty edge cases ───────────────────────────────────────────────

describe('parseProperty edge cases', () => {
  it('defaults cardinality to single when allows_multiple_values is absent', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_type=Text
|has_description=Simple
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_simple')
    assert.strictEqual(result.cardinality, 'single')
  })

  it('sets cardinality to multiple when flag is Yes', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_type=Page
|has_description=Multi
|allows_multiple_values=Yes
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_multi')
    assert.strictEqual(result.cardinality, 'multiple')
  })

  it('handles allows_value_from_category', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_type=Page
|has_description=Person ref
|allows_value_from_category=Person
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_person')
    assert.strictEqual(result.Allows_value_from_category, 'Person')
  })

  it('parses subproperty reference', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_type=Email
|has_description=Work email
|subproperty_of=Has email
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_work_email')
    assert.strictEqual(result.parent_property, 'Has_email')
  })

  it('handles missing datatype (validation catches this)', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=No type
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Bad_prop')
    assert.strictEqual(result.datatype, '')
  })
})

// ─── parseSubobject edge cases ──────────────────────────────────────────────

describe('parseSubobject edge cases', () => {
  it('handles subobject with no properties', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Subobject
|has_description=Empty subobject
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-subobject]]`
    const result = parseSubobject(wikitext, 'Empty_sub')
    assert.strictEqual(result.required_properties, undefined)
    assert.strictEqual(result.optional_properties, undefined)
  })

  it('converts comma-separated property references to entity keys', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Subobject
|has_description=Test
|has_required_property=Has start date
|has_optional_property=Has end date
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-subobject]]`
    const result = parseSubobject(wikitext, 'Test_sub')
    assert.deepStrictEqual(result.required_properties, ['Has_start_date'])
    assert.deepStrictEqual(result.optional_properties, ['Has_end_date'])
  })
})

// ─── parseResource edge cases ───────────────────────────────────────────────

describe('parseResource edge cases', () => {
  it('finds non-management category', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Person
|has_description=Test
|has_name=John
}}
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]`
    const result = parseResource(wikitext, 'Person/John')
    assert.strictEqual(result.category, 'Person')
  })

  it('handles resource with no category', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Resource
|has_description=No category
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-resource]]`
    const result = parseResource(wikitext, 'Unknown/Item')
    assert.strictEqual(result.category, '')
  })

  it('converts property param names to entity keys', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Person
|has_description=Test
|has_first_name=John
|has_last_name=Doe
}}
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]`
    const result = parseResource(wikitext, 'Person/John')
    assert.strictEqual(result.Has_first_name, 'John')
    assert.strictEqual(result.Has_last_name, 'Doe')
  })
})

// ─── parseFilePath edge cases ───────────────────────────────────────────────

describe('parseFilePath edge cases', () => {
  it('returns null for single-segment paths', () => {
    assert.strictEqual(parseFilePath('file.wikitext'), null)
  })

  it('returns null for non-entity file extensions', () => {
    assert.strictEqual(parseFilePath('categories/file.txt'), null)
  })

  it('parses module JSON', () => {
    const result = parseFilePath('modules/Core.json')
    assert.deepStrictEqual(result, { entityType: 'modules', entityKey: 'Core', fileType: 'json' })
  })

  it('parses bundle JSON', () => {
    const result = parseFilePath('bundles/Default.json')
    assert.deepStrictEqual(result, { entityType: 'bundles', entityKey: 'Default', fileType: 'json' })
  })

  it('parses nested template path', () => {
    const result = parseFilePath('templates/Property/Page.wikitext')
    assert.deepStrictEqual(result, { entityType: 'templates', entityKey: 'Property/Page', fileType: 'wikitext' })
  })

  it('parses nested resource path', () => {
    const result = parseFilePath('resources/SOP/Safety_manual.wikitext')
    assert.deepStrictEqual(result, { entityType: 'resources', entityKey: 'SOP/Safety_manual', fileType: 'wikitext' })
  })

  it('parses simple category path', () => {
    const result = parseFilePath('categories/Person.wikitext')
    assert.deepStrictEqual(result, { entityType: 'categories', entityKey: 'Person', fileType: 'wikitext' })
  })

  it('returns null for JSON in non-module/bundle directories', () => {
    assert.strictEqual(parseFilePath('categories/Person.json'), null)
  })
})
