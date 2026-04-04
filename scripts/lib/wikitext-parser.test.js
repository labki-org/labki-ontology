import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  toPageName,
  toEntityKey,
  extractTemplateCall,
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

describe('extractTemplateCall', () => {
  it('extracts template call from OntologySync block', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=The name of an entity
|has_type=Text
|display_label=Name
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const tc = extractTemplateCall(wikitext)
    assert.strictEqual(tc.templateName, 'Property')
    assert.strictEqual(tc.params.get('has_type'), 'Text')
    assert.strictEqual(tc.params.get('has_description'), 'The name of an entity')
    assert.strictEqual(tc.params.get('display_label'), 'Name')
  })

  it('extracts template call with comma-separated values', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Category
|has_required_property=Has name, Has email
}}
<!-- OntologySync End -->`

    const tc = extractTemplateCall(wikitext)
    assert.strictEqual(tc.params.get('has_required_property'), 'Has name, Has email')
  })

  it('ignores content outside the block', () => {
    const wikitext = `some text before
<!-- OntologySync Start -->
{{Property
|has_description=Inside
}}
<!-- OntologySync End -->
some text after`

    const tc = extractTemplateCall(wikitext)
    assert.strictEqual(tc.templateName, 'Property')
    assert.strictEqual(tc.params.get('has_description'), 'Inside')
  })

  it('returns null for no template call', () => {
    const tc = extractTemplateCall('just plain text')
    assert.strictEqual(tc, null)
  })
})

describe('extractCategories', () => {
  it('extracts categories outside the annotation block', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_type=Text
}}
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
{{Category
|has_description=A human being
|display_label=Person
|has_parent_category=Agent
|has_required_property=Has name
|has_optional_property=Has email
|has_optional_subobject=Address
}}
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
{{Category
|has_description=Base agent type
}}
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
{{Property
|has_description=The name of an entity
|has_type=Text
|display_label=Name
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_name')
    assert.strictEqual(result.datatype, 'Text')
    assert.strictEqual(result.cardinality, 'single')
    assert.strictEqual(result.label, 'Name')
  })

  it('parses a multi-value email property', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=Email address for contact
|has_type=Email
|display_label=Email
|allows_multiple_values=Yes
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_email')
    assert.strictEqual(result.cardinality, 'multiple')
  })

  it('parses property with allowed values', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=Status of an item
|has_type=Text
|display_label=Status
|allows_value=Active, Inactive, Archived
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_status')
    assert.deepStrictEqual(result.allowed_values, ['Active', 'Inactive', 'Archived'])
  })

  it('parses property with display template', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Property
|has_description=Related page
|has_type=Page
|has_template=Property/Page
}}
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]`

    const result = parseProperty(wikitext, 'Has_related')
    assert.strictEqual(result.has_display_template, 'Property/Page')
  })
})

describe('parseSubobject', () => {
  it('parses a subobject with properties', () => {
    const wikitext = `<!-- OntologySync Start -->
{{Subobject
|has_description=A physical or mailing address
|has_required_property=Has street, Has city, Has country
|has_optional_property=Has postal code
}}
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
{{Person
|has_description=Example person resource
|display_label=John Doe
|has_name=John Doe
|has_email=john.doe@example.com
}}
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
