import { describe, it, expect } from 'vitest'
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
  parseModuleVocab,
  parseFilePath,
} from './wikitext-parser.js'

describe('toPageName', () => {
  it('converts underscores to spaces', () => {
    expect(toPageName('Has_name')).toBe('Has name')
    expect(toPageName('Core_overview')).toBe('Core overview')
  })

  it('handles names without underscores', () => {
    expect(toPageName('Person')).toBe('Person')
  })
})

describe('toEntityKey', () => {
  it('converts spaces to underscores', () => {
    expect(toEntityKey('Has name')).toBe('Has_name')
    expect(toEntityKey('Core overview')).toBe('Core_overview')
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
    expect(ann.get('Has type')).toEqual(['Text'])
    expect(ann.get('Has description')).toEqual(['The name of an entity'])
    expect(ann.get('Display label')).toEqual(['Name'])
  })

  it('collects multiple values for same property', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has required property::Property:Has name]]
[[Has required property::Property:Has email]]
<!-- OntologySync End -->`

    const ann = extractAnnotations(wikitext)
    expect(ann.get('Has required property')).toEqual([
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
    expect(ann.size).toBe(1)
    expect(ann.get('Inside')).toEqual(['annotation'])
  })

  it('returns empty map for no annotations', () => {
    const ann = extractAnnotations('just plain text')
    expect(ann.size).toBe(0)
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
    expect(cats).toEqual(['Person', 'OntologySync-managed-resource'])
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
    expect(result).toEqual({
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
    expect(result).toEqual({
      id: 'Agent',
      label: 'Agent',
      description: 'Base agent type',
    })
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
    expect(result).toEqual({
      id: 'Has_name',
      label: 'Name',
      description: 'The name of an entity',
      datatype: 'Text',
      cardinality: 'single',
    })
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
    expect(result).toEqual({
      id: 'Has_email',
      label: 'Email',
      description: 'Email address for contact',
      datatype: 'Email',
      cardinality: 'multiple',
    })
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
    expect(result.allowed_values).toEqual(['Active', 'Inactive', 'Archived'])
  })

  it('parses property with display template', () => {
    const wikitext = `<!-- OntologySync Start -->
[[Has type::Page]]
[[Has description::Related page]]
[[Has template::Template:Property/Page]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_related')
    expect(result.has_display_template).toBe('Property/Page')
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
    expect(result).toEqual({
      id: 'Address',
      label: 'Address',
      description: 'A physical or mailing address',
      required_properties: ['Has_street', 'Has_city', 'Has_country'],
      optional_properties: ['Has_postal_code'],
    })
  })
})

describe('parseTemplate', () => {
  it('parses raw template wikitext', () => {
    const wikitext = '<includeonly>{{#if:{{{value|}}}|{{{value|}}}|}}</includeonly>\n'
    const result = parseTemplate(wikitext, 'Property/Page')
    expect(result.id).toBe('Property/Page')
    expect(result.wikitext).toBe('<includeonly>{{#if:{{{value|}}}|{{{value|}}}|}}</includeonly>')
  })
})

describe('parseDashboardPage', () => {
  it('parses dashboard page content', () => {
    const wikitext = '== Overview ==\n\n{{#ask: [[Category:Person]] }}\n'
    const result = parseDashboardPage(wikitext, '')
    expect(result.name).toBe('')
    expect(result.wikitext).toBe('== Overview ==\n\n{{#ask: [[Category:Person]] }}')
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
    expect(result.id).toBe('Person/John_doe')
    expect(result.label).toBe('John Doe')
    expect(result.category).toBe('Person')
    expect(result.Has_name).toBe('John Doe')
    expect(result.Has_email).toBe('john.doe@example.com')
  })
})

describe('parseModuleVocab', () => {
  it('extracts entity lists from import array', () => {
    const vocab = {
      id: 'Core',
      version: '1.0.0',
      label: 'Core Module',
      description: 'Core entities',
      dependencies: [],
      import: [
        { page: 'Person', namespace: 'NS_CATEGORY', contents: { importFrom: 'categories/Person.wikitext' } },
        { page: 'Has name', namespace: 'SMW_NS_PROPERTY', contents: { importFrom: 'properties/Has_name.wikitext' } },
        { page: 'Address', namespace: 'NS_SUBOBJECT', contents: { importFrom: 'subobjects/Address.wikitext' } },
        { page: 'Property/Page', namespace: 'NS_TEMPLATE', contents: { importFrom: 'templates/Property/Page.wikitext' } },
      ],
      meta: { version: '1' },
    }

    const result = parseModuleVocab(vocab)
    expect(result.id).toBe('Core')
    expect(result.version).toBe('1.0.0')
    expect(result.categories).toEqual(['Person'])
    expect(result.properties).toEqual(['Has_name'])
    expect(result.subobjects).toEqual(['Address'])
    expect(result.templates).toEqual(['Property/Page'])
  })
})

describe('parseFilePath', () => {
  it('parses category wikitext path', () => {
    expect(parseFilePath('categories/Person.wikitext')).toEqual({
      entityType: 'categories', entityKey: 'Person', fileType: 'wikitext',
    })
  })

  it('parses nested template path', () => {
    expect(parseFilePath('templates/Property/Page.wikitext')).toEqual({
      entityType: 'templates', entityKey: 'Property/Page', fileType: 'wikitext',
    })
  })

  it('parses nested resource path', () => {
    expect(parseFilePath('resources/Person/John_doe.wikitext')).toEqual({
      entityType: 'resources', entityKey: 'Person/John_doe', fileType: 'wikitext',
    })
  })

  it('parses module vocab.json path', () => {
    expect(parseFilePath('modules/Core.vocab.json')).toEqual({
      entityType: 'modules', entityKey: 'Core', fileType: 'vocab.json',
    })
  })

  it('parses bundle json path', () => {
    expect(parseFilePath('bundles/Default.json')).toEqual({
      entityType: 'bundles', entityKey: 'Default', fileType: 'json',
    })
  })
})
