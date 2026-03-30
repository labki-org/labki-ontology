import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  toPageName,
  toEntityKey,
  extractAnnotations,
  extractCategories,
  parseCategory,
  parseProperty,
  parseSubobject,
  parseTemplate,
  parseDashboardPage,
  parseResource,
  parseFilePath,
} from './wikitext-parser.js'

describe('toPageName', () => {
  it('converts underscores to spaces', () => {
    assert.strictEqual(toPageName('Has_name'), 'Has name')
    assert.strictEqual(toPageName('Core_overview'), 'Core overview')
  })

  it('handles names without underscores', () => {
    assert.strictEqual(toPageName('Person'), 'Person')
  })
})

describe('toEntityKey', () => {
  it('converts spaces to underscores', () => {
    assert.strictEqual(toEntityKey('Has name'), 'Has_name')
    assert.strictEqual(toEntityKey('Core overview'), 'Core_overview')
  })
})

describe('extractAnnotations', () => {
  it('extracts annotations from OntologySync block', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::The name of an entity]]
[[Display label::Name]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const ann = extractAnnotations(wikitext)
    assert.deepStrictEqual(ann.get('Has type'), ['Text'])
    assert.deepStrictEqual(ann.get('Has description'), ['The name of an entity'])
    assert.deepStrictEqual(ann.get('Display label'), ['Name'])
  })

  it('collects multiple values for same property', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has required property::Property:Has name]]
[[Has required property::Property:Has email]]
<!-- OntologySync End -->`

    const ann = extractAnnotations(wikitext)
    assert.deepStrictEqual(ann.get('Has required property'), [
      'Property:Has name',
      'Property:Has email',
    ])
  })

  it('ignores annotations outside the block', () => {
    const wikitext = `[[Outside::annotation]]
<!-- OntologySync Start -->
[[Inside::annotation]]
<!-- OntologySync End -->
[[Also outside::annotation]]`

    const ann = extractAnnotations(wikitext)
    assert.strictEqual(ann.size, 1)
    assert.deepStrictEqual(ann.get('Inside'), ['annotation'])
  })

  it('returns empty map for no annotations', () => {
    const ann = extractAnnotations('just plain text')
    assert.strictEqual(ann.size, 0)
  })
})

describe('extractCategories', () => {
  it('extracts categories outside the annotation block', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Text]]
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]`

    const cats = extractCategories(wikitext)
    assert.deepStrictEqual(cats, ['Person', 'OntologySync-managed-resource'])
  })
})

describe('parseCategory', () => {
  it('parses a full category', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::A human being]]
[[Display label::Person]]
[[Has parent category::Category:Agent]]
[[Has required property::Property:Has name]]
[[Has optional property::Property:Has email]]
[[Has optional subobject::Subobject:Address]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`

    const result = parseCategory(wikitext, 'Person')
    assert.deepStrictEqual(result, {
      id: 'Person',
      label: 'Person',
      description: 'A human being',
      parents: ['Agent'],
      required_properties: ['Has_name'],
      optional_properties: ['Has_email'],
      optional_subobjects: ['Address'],
    })
  })

  it('handles minimal category', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Base agent type]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]`

    const result = parseCategory(wikitext, 'Agent')
    assert.strictEqual(result.id, 'Agent')
    assert.strictEqual(result.description, 'Base agent type')
    assert.strictEqual(result.parents, undefined)
    assert.strictEqual(result.required_properties, undefined)
  })
})

describe('parseProperty', () => {
  it('parses a simple text property', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::The name of an entity]]
[[Display label::Name]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_name')
    assert.strictEqual(result.datatype, 'Text')
    assert.strictEqual(result.cardinality, 'single')
    assert.strictEqual(result.label, 'Name')
  })

  it('parses a multi-value email property', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Email]]
[[Has description::Email address for contact]]
[[Display label::Email]]
[[Allows multiple values::true]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_email')
    assert.strictEqual(result.cardinality, 'multiple')
  })

  it('parses property with allowed values', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::Status of an item]]
[[Display label::Status]]
[[Allows value::Active]]
[[Allows value::Inactive]]
[[Allows value::Archived]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_status')
    assert.deepStrictEqual(result.allowed_values, ['Active', 'Inactive', 'Archived'])
  })

  it('parses property with display template', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Page]]
[[Has description::Related page]]
[[Has template::Template:Property/Page]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_related')
    assert.strictEqual(result.has_display_template, 'Property/Page')
  })
})

describe('parseSubobject', () => {
  it('parses a subobject with properties', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::A physical or mailing address]]
[[Has required property::Property:Has street]]
[[Has required property::Property:Has city]]
[[Has required property::Property:Has country]]
[[Has optional property::Property:Has postal code]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-subobject]]`

    const result = parseSubobject(wikitext, 'Address')
    assert.deepStrictEqual(result.required_properties, ['Has_street', 'Has_city', 'Has_country'])
    assert.deepStrictEqual(result.optional_properties, ['Has_postal_code'])
  })
})

describe('parseTemplate', () => {
  it('parses raw template wikitext', () => {
    const wikitext = '<includeonly>{{#if:{{{value|}}}|{{{value|}}}|}}</includeonly>\n'
    const result = parseTemplate(wikitext, 'Property/Page')
    assert.strictEqual(result.id, 'Property/Page')
    assert.strictEqual(result.wikitext, '<includeonly>{{#if:{{{value|}}}|{{{value|}}}|}}</includeonly>')
  })
})

describe('parseDashboardPage', () => {
  it('parses dashboard page content', () => {
    const wikitext = '== Overview ==\n\n{{#ask: [[Category:Person]] }}\n'
    const result = parseDashboardPage(wikitext, '')
    assert.strictEqual(result.name, '')
    assert.strictEqual(result.wikitext, '== Overview ==\n\n{{#ask: [[Category:Person]] }}')
  })
})

describe('parseResource', () => {
  it('parses a resource with category and properties', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has description::Example person resource]]
[[Display label::John Doe]]
[[Has name::John Doe]]
[[Has email::john.doe@example.com]]
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]`

    const result = parseResource(wikitext, 'Person/John_doe')
    assert.strictEqual(result.id, 'Person/John_doe')
    assert.strictEqual(result.label, 'John Doe')
    assert.strictEqual(result.category, 'Person')
    assert.strictEqual(result.Has_name, 'John Doe')
    assert.strictEqual(result.Has_email, 'john.doe@example.com')
  })
})

describe('parseFilePath', () => {
  it('parses category wikitext path', () => {
    assert.deepStrictEqual(parseFilePath('categories/Person.wikitext'), {
      entityType: 'categories', entityKey: 'Person', fileType: 'wikitext',
    })
  })

  it('parses nested template path', () => {
    assert.deepStrictEqual(parseFilePath('templates/Property/Page.wikitext'), {
      entityType: 'templates', entityKey: 'Property/Page', fileType: 'wikitext',
    })
  })

  it('parses nested resource path', () => {
    assert.deepStrictEqual(parseFilePath('resources/Person/John_doe.wikitext'), {
      entityType: 'resources', entityKey: 'Person/John_doe', fileType: 'wikitext',
    })
  })

  it('parses module json path', () => {
    assert.deepStrictEqual(parseFilePath('modules/Core.json'), {
      entityType: 'modules', entityKey: 'Core', fileType: 'json',
    })
  })

  it('parses bundle json path', () => {
    assert.deepStrictEqual(parseFilePath('bundles/Default.json'), {
      entityType: 'bundles', entityKey: 'Default', fileType: 'json',
    })
  })
})
