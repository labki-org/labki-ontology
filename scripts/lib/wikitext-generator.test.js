import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCategory,
  generateProperty,
  generateSubobject,
  generateTemplate,
  generateDashboardPage,
  generateResource,
  generateModuleVocab,
  buildEntityPaths,
  generateBundleVocab,
} from './wikitext-generator.js'
import { extractAnnotations, parseCategory, parseProperty, parseSubobject } from './wikitext-parser.js'

// ─── generateCategory ───────────────────────────────────────────────────────

describe('generateCategory', () => {
  it('generates minimal category with only description', () => {
    const wikitext = generateCategory({ id: 'Agent', description: 'An agent' })

    assert.ok(wikitext.includes('<!-- OntologySync Start -->'))
    assert.ok(wikitext.includes('<!-- OntologySync End -->'))
    assert.ok(wikitext.includes('[[Has description::An agent]]'))
    assert.ok(wikitext.includes('[[Category:OntologySync-managed]]'))
  })

  it('omits Display label when it matches default page name', () => {
    // toPageName('Research_student') = 'Research student', which matches the label
    const wikitext = generateCategory({ id: 'Research_student', label: 'Research student', description: 'A student' })

    assert.ok(!wikitext.includes('Display label'))
  })

  it('includes Display label when it differs from default', () => {
    const wikitext = generateCategory({ id: 'Agent', label: 'Custom Label', description: 'An agent' })

    assert.ok(wikitext.includes('[[Display label::Custom Label]]'))
  })

  it('generates parent category references with namespace prefix', () => {
    const wikitext = generateCategory({ id: 'Person', description: 'A person', parents: ['Agent'] })

    assert.ok(wikitext.includes('[[Has parent category::Category:Agent]]'))
  })

  it('generates multiple parent categories', () => {
    const wikitext = generateCategory({ id: 'Hybrid', description: 'Both', parents: ['TypeA', 'TypeB'] })

    assert.ok(wikitext.includes('Category:TypeA'))
    assert.ok(wikitext.includes('Category:TypeB'))
  })

  it('generates required and optional properties with namespace', () => {
    const wikitext = generateCategory({
      id: 'Person',
      description: 'A person',
      required_properties: ['Has_first_name'],
      optional_properties: ['Has_birthday'],
    })

    assert.ok(wikitext.includes('[[Has required property::Property:Has first name]]'))
    assert.ok(wikitext.includes('[[Has optional property::Property:Has birthday]]'))
  })

  it('generates required and optional subobjects with namespace', () => {
    const wikitext = generateCategory({
      id: 'Equipment',
      description: 'Equipment',
      required_subobjects: ['Has_address'],
      optional_subobjects: ['Has_maintenance_record'],
    })

    assert.ok(wikitext.includes('[[Has required subobject::Subobject:Has address]]'))
    assert.ok(wikitext.includes('[[Has optional subobject::Subobject:Has maintenance record]]'))
  })

  it('handles empty arrays for all fields', () => {
    const wikitext = generateCategory({
      id: 'Empty',
      description: 'Empty',
      parents: [],
      required_properties: [],
      optional_properties: [],
      required_subobjects: [],
      optional_subobjects: [],
    })

    assert.ok(!wikitext.includes('Has parent category'))
    assert.ok(!wikitext.includes('Has required property'))
    assert.ok(!wikitext.includes('Has optional property'))
  })

  it('round-trips through parser correctly', () => {
    const original = {
      id: 'Person',
      label: 'Custom Person',
      description: 'A human person',
      parents: ['Agent'],
      required_properties: ['Has_name', 'Has_email'],
      optional_properties: ['Has_birthday'],
      optional_subobjects: ['Has_role'],
    }
    const wikitext = generateCategory(original)
    const parsed = parseCategory(wikitext, 'Person')

    assert.strictEqual(parsed.description, original.description)
    assert.strictEqual(parsed.label, original.label)
    assert.deepStrictEqual(parsed.parents, original.parents)
    assert.deepStrictEqual(parsed.required_properties, original.required_properties)
    assert.deepStrictEqual(parsed.optional_properties, original.optional_properties)
    assert.deepStrictEqual(parsed.optional_subobjects, original.optional_subobjects)
  })
})

// ─── generateProperty ───────────────────────────────────────────────────────

describe('generateProperty', () => {
  it('generates simple text property', () => {
    const wikitext = generateProperty({ id: 'Has_name', description: 'A name', datatype: 'Text' })

    assert.ok(wikitext.includes('[[Has type::Text]]'))
    assert.ok(wikitext.includes('[[Has description::A name]]'))
    assert.ok(wikitext.includes('[[Category:OntologySync-managed-property]]'))
    assert.ok(!wikitext.includes('Allows multiple values'))
  })

  it('generates multi-value property', () => {
    const wikitext = generateProperty({ id: 'Has_email', description: 'Email', datatype: 'Email', cardinality: 'multiple' })

    assert.ok(wikitext.includes('[[Allows multiple values::true]]'))
  })

  it('generates enumerated allowed values', () => {
    const wikitext = generateProperty({
      id: 'Has_status',
      description: 'Status',
      datatype: 'Text',
      allowed_values: ['Active', 'Inactive', 'Pending'],
    })

    assert.ok(wikitext.includes('[[Allows value::Active]]'))
    assert.ok(wikitext.includes('[[Allows value::Inactive]]'))
    assert.ok(wikitext.includes('[[Allows value::Pending]]'))
  })

  it('generates allowed value from category', () => {
    const wikitext = generateProperty({
      id: 'Has_person',
      description: 'A person',
      datatype: 'Page',
      Allows_value_from_category: 'Person',
    })

    assert.ok(wikitext.includes('[[Allows value from category::Category:Person]]'))
  })

  it('generates allowed pattern', () => {
    const wikitext = generateProperty({
      id: 'Has_orcid',
      description: 'ORCID',
      datatype: 'Text',
      allowed_pattern: '^\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]$',
    })

    assert.ok(wikitext.includes('[[Allows pattern::'))
  })

  it('generates unique values flag', () => {
    const wikitext = generateProperty({
      id: 'Has_serial',
      description: 'Serial',
      datatype: 'Text',
      unique_values: true,
    })

    assert.ok(wikitext.includes('[[Has unique values::true]]'))
  })

  it('generates display template reference', () => {
    const wikitext = generateProperty({
      id: 'Has_url',
      description: 'URL',
      datatype: 'URL',
      has_display_template: 'Property/URL',
    })

    assert.ok(wikitext.includes('[[Has template::Template:Property/URL]]'))
  })

  it('generates subproperty reference', () => {
    const wikitext = generateProperty({
      id: 'Has_work_email',
      description: 'Work email',
      datatype: 'Email',
      parent_property: 'Has_email',
    })

    assert.ok(wikitext.includes('[[Subproperty of::Property:Has email]]'))
  })

  it('generates display units', () => {
    const wikitext = generateProperty({
      id: 'Has_weight',
      description: 'Weight',
      datatype: 'Number',
      display_units: ['kg', 'lb'],
    })

    assert.ok(wikitext.includes('[[Display units::kg]]'))
    assert.ok(wikitext.includes('[[Display units::lb]]'))
  })

  it('generates display precision', () => {
    const wikitext = generateProperty({
      id: 'Has_amount',
      description: 'Amount',
      datatype: 'Number',
      display_precision: 2,
    })

    assert.ok(wikitext.includes('[[Display precision::2]]'))
  })

  it('round-trips through parser correctly', () => {
    const original = {
      id: 'Has_status',
      label: 'Status',
      description: 'Activity status',
      datatype: 'Text',
      cardinality: 'multiple',
      allowed_values: ['Active', 'Inactive'],
      unique_values: true,
    }
    const wikitext = generateProperty(original)
    const parsed = parseProperty(wikitext, 'Has_status')

    assert.strictEqual(parsed.datatype, 'Text')
    assert.strictEqual(parsed.cardinality, 'multiple')
    assert.deepStrictEqual(parsed.allowed_values, ['Active', 'Inactive'])
    assert.strictEqual(parsed.unique_values, true)
  })
})

// ─── generateSubobject ──────────────────────────────────────────────────────

describe('generateSubobject', () => {
  it('generates subobject with required and optional properties', () => {
    const wikitext = generateSubobject({
      id: 'Has_role',
      label: 'Role',
      description: 'A role record',
      required_properties: ['Has_organization', 'Has_start_date'],
      optional_properties: ['Has_end_date'],
    })

    assert.ok(wikitext.includes('[[Has description::A role record]]'))
    assert.ok(wikitext.includes('[[Has required property::Property:Has organization]]'))
    assert.ok(wikitext.includes('[[Has required property::Property:Has start date]]'))
    assert.ok(wikitext.includes('[[Has optional property::Property:Has end date]]'))
    assert.ok(wikitext.includes('[[Category:OntologySync-managed-subobject]]'))
  })

  it('generates minimal subobject with only description', () => {
    const wikitext = generateSubobject({ id: 'Simple', description: 'Simple sub' })

    assert.ok(wikitext.includes('[[Has description::Simple sub]]'))
    assert.ok(!wikitext.includes('Has required property'))
    assert.ok(!wikitext.includes('Has optional property'))
  })

  it('includes Display label when it differs from default', () => {
    const wikitext = generateSubobject({ id: 'Has_role', label: 'Custom Role Label', description: 'A role' })

    assert.ok(wikitext.includes('[[Display label::Custom Role Label]]'))
  })

  it('round-trips through parser correctly', () => {
    const original = {
      id: 'Has_training_record',
      label: 'Training Record',
      description: 'Training completion record',
      required_properties: ['Has_training', 'Has_completion_date'],
      optional_properties: ['Has_expiration_date', 'Has_notes'],
    }
    const wikitext = generateSubobject(original)
    const parsed = parseSubobject(wikitext, 'Has_training_record')

    assert.strictEqual(parsed.label, 'Training Record')
    assert.deepStrictEqual(parsed.required_properties, original.required_properties)
    assert.deepStrictEqual(parsed.optional_properties, original.optional_properties)
  })
})

// ─── generateTemplate / generateDashboardPage ───────────────────────────────

describe('generateTemplate', () => {
  it('returns wikitext content as-is with trailing newline', () => {
    const result = generateTemplate({ id: 'Test', wikitext: '{{{value}}}' })
    assert.strictEqual(result, '{{{value}}}\n')
  })

  it('handles empty wikitext', () => {
    const result = generateTemplate({ id: 'Empty', wikitext: '' })
    assert.strictEqual(result, '\n')
  })

  it('handles undefined wikitext', () => {
    const result = generateTemplate({ id: 'NoContent' })
    assert.strictEqual(result, '\n')
  })
})

describe('generateDashboardPage', () => {
  it('returns content with trailing newline', () => {
    const result = generateDashboardPage('{{#ask: [[Category:Person]]}}')
    assert.strictEqual(result, '{{#ask: [[Category:Person]]}}\n')
  })

  it('handles empty input', () => {
    assert.strictEqual(generateDashboardPage(''), '\n')
    assert.strictEqual(generateDashboardPage(null), '\n')
    assert.strictEqual(generateDashboardPage(undefined), '\n')
  })
})

// ─── generateResource ───────────────────────────────────────────────────────

describe('generateResource', () => {
  it('generates resource with category and dynamic properties', () => {
    const wikitext = generateResource({
      id: 'Person/John_doe',
      label: 'John Doe',
      description: 'Example person',
      category: 'Person',
      Has_name: 'John Doe',
      Has_email: 'john@example.com',
    })

    assert.ok(wikitext.includes('[[Display label::John Doe]]'))
    assert.ok(wikitext.includes('[[Has description::Example person]]'))
    assert.ok(wikitext.includes('[[Has name::John Doe]]'))
    assert.ok(wikitext.includes('[[Has email::john@example.com]]'))
    assert.ok(wikitext.includes('[[Category:Person]]'))
    assert.ok(wikitext.includes('[[Category:OntologySync-managed-resource]]'))
  })

  it('handles multi-valued dynamic properties', () => {
    const wikitext = generateResource({
      id: 'Person/Multi',
      label: 'Multi',
      description: 'Multi-valued',
      category: 'Person',
      Has_skill: ['Python', 'JavaScript', 'Rust'],
    })

    assert.ok(wikitext.includes('[[Has skill::Python]]'))
    assert.ok(wikitext.includes('[[Has skill::JavaScript]]'))
    assert.ok(wikitext.includes('[[Has skill::Rust]]'))
  })

  it('skips metadata keys (id, label, description, category)', () => {
    const wikitext = generateResource({
      id: 'Test/Item',
      label: 'Item',
      description: 'Test',
      category: 'Thing',
    })

    // id and category should not appear as annotations
    const ann = extractAnnotations(wikitext)
    assert.ok(!ann.has('id'))
    assert.ok(!ann.has('category'))
  })
})

// ─── generateModuleVocab / buildEntityPaths / generateBundleVocab ───────────

describe('buildEntityPaths', () => {
  it('builds paths for all entity types', () => {
    const mod = {
      categories: ['Person', 'Agent'],
      properties: ['Has_name'],
      subobjects: ['Has_role'],
      templates: ['Property/Page'],
      dashboards: ['Overview'],
      resources: ['Person/John_doe'],
    }

    const paths = buildEntityPaths(mod)

    assert.deepStrictEqual(paths.Person, { path: 'categories/Person.wikitext', namespace: 'NS_CATEGORY' })
    assert.deepStrictEqual(paths.Has_name, { path: 'properties/Has_name.wikitext', namespace: 'SMW_NS_PROPERTY' })
    assert.deepStrictEqual(paths.Has_role, { path: 'subobjects/Has_role.wikitext', namespace: 'NS_SUBOBJECT' })
    assert.deepStrictEqual(paths['Property/Page'], { path: 'templates/Property/Page.wikitext', namespace: 'NS_TEMPLATE' })
  })

  it('handles empty module', () => {
    const paths = buildEntityPaths({})
    assert.deepStrictEqual(paths, {})
  })
})

describe('generateModuleVocab', () => {
  it('generates vocab.json with import entries', () => {
    const mod = { id: 'Core', version: '1.0.0', label: 'Core', description: 'Core module', dependencies: [] }
    const entityPaths = {
      Person: { path: 'categories/Person.wikitext', namespace: 'NS_CATEGORY' },
      Has_name: { path: 'properties/Has_name.wikitext', namespace: 'SMW_NS_PROPERTY' },
    }

    const vocab = generateModuleVocab(mod, entityPaths, '0.1.0')

    assert.strictEqual(vocab.id, 'Core')
    assert.strictEqual(vocab.version, '1.0.0')
    assert.strictEqual(vocab.import.length, 2)
    assert.strictEqual(vocab.meta.ontologyVersion, '0.1.0')

    const personImport = vocab.import.find(i => i.page === 'Person')
    assert.strictEqual(personImport.namespace, 'NS_CATEGORY')
    assert.strictEqual(personImport.contents.importFrom, 'categories/Person.wikitext')
    assert.strictEqual(personImport.options.replaceable, true)
  })
})

describe('generateBundleVocab', () => {
  it('merges imports from multiple modules', () => {
    const bundle = { id: 'Default', version: '1.0.0', label: 'Default', description: 'Default bundle' }
    const moduleVocabs = [
      { id: 'Core', version: '1.0.0', import: [{ page: 'Agent', namespace: 'NS_CATEGORY' }] },
      { id: 'Lab', version: '2.0.0', import: [{ page: 'Equipment', namespace: 'NS_CATEGORY' }] },
    ]

    const vocab = generateBundleVocab(bundle, moduleVocabs, '0.1.0')

    assert.strictEqual(vocab.import.length, 2)
    assert.deepStrictEqual(vocab.modules, { Core: '1.0.0', Lab: '2.0.0' })
    assert.strictEqual(vocab.meta.ontologyVersion, '0.1.0')
  })

  it('handles empty module list', () => {
    const bundle = { id: 'Empty', version: '1.0.0', description: 'Empty' }
    const vocab = generateBundleVocab(bundle, [], '0.1.0')

    assert.strictEqual(vocab.import.length, 0)
    assert.deepStrictEqual(vocab.modules, {})
  })
})
