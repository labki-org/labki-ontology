/**
 * Edge case tests for wikitext-parser.js
 *
 * These test malformed input, boundary conditions, and ID/label
 * conversion that aren't covered by the main parser tests.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractAnnotations,
  extractCategories,
  toPageName,
  toEntityKey,
  parseCategory,
  parseProperty,
  parseSubobject,
  parseResource,
  parseFilePath,
} from './wikitext-parser.js'

// ─── extractAnnotations edge cases ──────────────────────────────────────────

describe('extractAnnotations edge cases', () => {
  it('returns empty map for empty string', () => {
    const result = extractAnnotations('')
    assert.strictEqual(result.size, 0)
  })

  it('returns empty map for wikitext with no annotation block', () => {
    const result = extractAnnotations('Just some text\nNo markers here\n')
    assert.strictEqual(result.size, 0)
  })

  it('ignores annotations outside the OntologySync block', () => {
    const wikitext = `
[[Has description::Outside annotation]]
<!-- OntologySync Start -->
[[Has description::Inside annotation]]
<!-- OntologySync End -->
[[Has description::After annotation]]
`
    const result = extractAnnotations(wikitext)
    assert.deepStrictEqual(result.get('Has description'), ['Inside annotation'])
  })

  it('handles empty annotation block', () => {
    const wikitext = `<!-- OntologySync Start -->
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.strictEqual(result.size, 0)
  })

  it('collects multiple values for same annotation property', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Allows value::Active]]
[[Allows value::Inactive]]
[[Allows value::Pending]]
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.deepStrictEqual(result.get('Allows value'), ['Active', 'Inactive', 'Pending'])
  })

  it('handles lines with leading/trailing whitespace', () => {
    const wikitext = `<!-- OntologySync Start -->
  [[Has description::Indented]]
\t[[Has type::Text]]\t
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.deepStrictEqual(result.get('Has description'), ['Indented'])
    assert.deepStrictEqual(result.get('Has type'), ['Text'])
  })

  it('ignores malformed annotations (missing ::)', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Valid]]
[[MalformedNoSeparator]]
[[Also Valid::Value]]
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.strictEqual(result.size, 2)
    assert.ok(result.has('Has description'))
    assert.ok(result.has('Also Valid'))
  })

  it('handles annotation values containing colons', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Value with: colons in it]]
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.deepStrictEqual(result.get('Has description'), ['Value with: colons in it'])
  })

  it('handles annotation values containing double colons', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Value with :: double colons]]
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    // The regex matches first :: only, rest is value
    assert.ok(result.has('Has description'))
  })

  it('ignores non-annotation lines in the block', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Valid]]
This is just text, not an annotation
<!-- some comment -->
[[Has type::Text]]
<!-- OntologySync End -->`
    const result = extractAnnotations(wikitext)
    assert.strictEqual(result.size, 2)
  })
})

// ─── extractCategories ──────────────────────────────────────────────────────

describe('extractCategories edge cases', () => {
  it('extracts categories outside the block only', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
[[Category:Person]]`
    const cats = extractCategories(wikitext)
    assert.deepStrictEqual(cats, ['OntologySync-managed', 'Person'])
  })

  it('ignores Category annotations inside the block', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Category:ShouldBeIgnored]]
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
  it('derives label from entity key when Display label is absent', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Research_student')
    assert.strictEqual(result.label, 'Research student')
  })

  it('uses Display label when present', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
[[Display label::Custom Label]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Something')
    assert.strictEqual(result.label, 'Custom Label')
  })

  it('omits parents field when no parent categories', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Root]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Root')
    assert.strictEqual(result.parents, undefined)
  })

  it('strips namespace prefix from parent category references', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
[[Has parent category::Category:Agent]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Person')
    assert.deepStrictEqual(result.parents, ['Agent'])
  })

  it('strips namespace prefix from property references', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
[[Has required property::Property:Has first name]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`
    const result = parseCategory(wikitext, 'Person')
    assert.deepStrictEqual(result.required_properties, ['Has_first_name'])
  })

  it('handles category with all fields populated', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Full category]]
[[Display label::Full]]
[[Has parent category::Category:Base]]
[[Has required property::Property:Has name]]
[[Has optional property::Property:Has email]]
[[Has required subobject::Subobject:Required sub]]
[[Has optional subobject::Subobject:Optional sub]]
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
  it('defaults cardinality to single when Allows multiple values is absent', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::Simple]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_simple')
    assert.strictEqual(result.cardinality, 'single')
  })

  it('sets cardinality to multiple when flag is true', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Page]]
[[Has description::Multi]]
[[Allows multiple values::true]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_multi')
    assert.strictEqual(result.cardinality, 'multiple')
  })

  it('handles Allows value from category with namespace stripping', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Page]]
[[Has description::Person ref]]
[[Allows value from category::Category:Person]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_person')
    assert.strictEqual(result.Allows_value_from_category, 'Person')
  })

  it('parses subproperty reference', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Email]]
[[Has description::Work email]]
[[Subproperty of::Property:Has email]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`
    const result = parseProperty(wikitext, 'Has_work_email')
    assert.strictEqual(result.parent_property, 'Has_email')
  })

  it('handles missing datatype (validation catches this)', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::No type]]
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
[[Has description::Empty subobject]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-subobject]]`
    const result = parseSubobject(wikitext, 'Empty_sub')
    assert.strictEqual(result.required_properties, undefined)
    assert.strictEqual(result.optional_properties, undefined)
  })

  it('strips namespace from property references', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
[[Has required property::Property:Has start date]]
[[Has optional property::Property:Has end date]]
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
[[Has description::Test]]
[[Has name::John]]
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]`
    const result = parseResource(wikitext, 'Person/John')
    assert.strictEqual(result.category, 'Person')
  })

  it('handles resource with no category', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::No category]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-resource]]`
    const result = parseResource(wikitext, 'Unknown/Item')
    assert.strictEqual(result.category, '')
  })

  it('converts property names to entity keys', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Test]]
[[Has first name::John]]
[[Has last name::Doe]]
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
