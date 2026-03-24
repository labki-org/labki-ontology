import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  generateModuleArtifactDirectory,
  generateBundleArtifactDirectory,
} from './artifact-generator.js'
import { createEntityTempDir } from '../__fixtures__/temp-dir.js'

/**
 * Create a temp dir with entities and write their source wikitext files
 */
function createTestProject() {
  const tempDir = createEntityTempDir({
    categories: [
      { id: 'TestCategory', label: 'Test Category', description: 'A test category' },
      { id: 'OtherCategory', label: 'Other', description: 'Another category' },
    ],
    properties: [
      { id: 'Has_test', label: 'Test', description: 'A test property', datatype: 'Text', cardinality: 'single' },
    ],
    subobjects: [
      { id: 'TestSubobject', label: 'Sub', description: 'A subobject', required_properties: ['Has_test'] },
    ],
    templates: [
      { id: 'Property/Default', label: 'Default', description: '', wikitext: '{{{value}}}' },
    ],
    modules: [
      {
        id: 'TestModule', version: '1.0.0', label: 'Test Module', description: 'A test module',
        categories: ['TestCategory'], properties: ['Has_test'], subobjects: ['TestSubobject'],
        templates: ['Property/Default'], dependencies: [],
      },
      {
        id: 'DepModule', version: '2.0.0', label: 'Dep Module', description: 'Dependent module',
        categories: ['OtherCategory'], properties: [], subobjects: [], templates: [],
        dependencies: ['TestModule'],
      },
    ],
    bundles: [
      { id: 'TestBundle', version: '1.0.0', label: 'Test Bundle', description: 'A test bundle', modules: ['TestModule'] },
      { id: 'MultiBund', version: '1.5.0', label: 'Multi', description: 'Multi-module', modules: ['TestModule', 'DepModule'] },
    ],
  })

  // Write VERSION file
  tempDir.writeFile('VERSION', '0.1.0')

  return tempDir
}

describe('generateModuleArtifactDirectory', () => {
  let tempDir
  let entityIndex

  beforeEach(async () => {
    tempDir = createTestProject()
    const { buildEntityIndex } = await import('./entity-index.js')
    entityIndex = await buildEntityIndex(tempDir.path)
  })

  afterEach(() => {
    if (tempDir) tempDir.cleanup()
  })

  it('creates output directory with vocab.json', () => {
    const outputDir = generateModuleArtifactDirectory(
      'TestModule', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    assert.ok(fs.existsSync(outputDir))
    assert.ok(fs.existsSync(path.join(outputDir, 'testmodule.vocab.json')))
  })

  it('vocab.json has correct structure', () => {
    const outputDir = generateModuleArtifactDirectory(
      'TestModule', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    const vocab = JSON.parse(fs.readFileSync(path.join(outputDir, 'testmodule.vocab.json'), 'utf8'))
    assert.equal(vocab.id, 'TestModule')
    assert.equal(vocab.version, '1.0.0')
    assert.ok(Array.isArray(vocab.import))
    assert.ok(vocab.import.length > 0)
    assert.equal(vocab.meta.ontologyVersion, '0.1.0')
  })

  it('copies wikitext files into artifact directory', () => {
    const outputDir = generateModuleArtifactDirectory(
      'TestModule', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    assert.ok(fs.existsSync(path.join(outputDir, 'categories', 'TestCategory.wikitext')))
    assert.ok(fs.existsSync(path.join(outputDir, 'properties', 'Has_test.wikitext')))
    assert.ok(fs.existsSync(path.join(outputDir, 'subobjects', 'TestSubobject.wikitext')))
    assert.ok(fs.existsSync(path.join(outputDir, 'templates', 'Property', 'Default.wikitext')))
  })

  it('resolves dependency versions', () => {
    const outputDir = generateModuleArtifactDirectory(
      'DepModule', '2.0.0', entityIndex, '0.1.0', tempDir.path
    )

    const vocab = JSON.parse(fs.readFileSync(path.join(outputDir, 'depmodule.vocab.json'), 'utf8'))
    assert.deepEqual(vocab.dependencies, { TestModule: '1.0.0' })
  })

  it('throws for missing module', () => {
    assert.throws(
      () => generateModuleArtifactDirectory('NonExistent', '1.0.0', entityIndex, '0.1.0', tempDir.path),
      /Module not found: NonExistent/
    )
  })

  it('import entries have correct namespace constants', () => {
    const outputDir = generateModuleArtifactDirectory(
      'TestModule', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    const vocab = JSON.parse(fs.readFileSync(path.join(outputDir, 'testmodule.vocab.json'), 'utf8'))
    const namespaces = vocab.import.map(e => e.namespace)

    assert.ok(namespaces.includes('NS_CATEGORY'))
    assert.ok(namespaces.includes('SMW_NS_PROPERTY'))
    assert.ok(namespaces.includes('NS_SUBOBJECT'))
    assert.ok(namespaces.includes('NS_TEMPLATE'))
  })
})

describe('generateBundleArtifactDirectory', () => {
  let tempDir
  let entityIndex

  beforeEach(async () => {
    tempDir = createTestProject()
    const { buildEntityIndex } = await import('./entity-index.js')
    entityIndex = await buildEntityIndex(tempDir.path)
  })

  afterEach(() => {
    if (tempDir) tempDir.cleanup()
  })

  it('creates output directory with vocab.json', () => {
    const outputDir = generateBundleArtifactDirectory(
      'TestBundle', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    assert.ok(fs.existsSync(outputDir))
    assert.ok(fs.existsSync(path.join(outputDir, 'testbundle.vocab.json')))
  })

  it('vocab.json includes module version map', () => {
    const outputDir = generateBundleArtifactDirectory(
      'TestBundle', '1.0.0', entityIndex, '0.1.0', tempDir.path
    )

    const vocab = JSON.parse(fs.readFileSync(path.join(outputDir, 'testbundle.vocab.json'), 'utf8'))
    assert.deepEqual(vocab.modules, { TestModule: '1.0.0' })
  })

  it('merges entities from all modules', () => {
    const outputDir = generateBundleArtifactDirectory(
      'MultiBund', '1.5.0', entityIndex, '0.1.0', tempDir.path
    )

    const vocab = JSON.parse(fs.readFileSync(path.join(outputDir, 'multibund.vocab.json'), 'utf8'))
    assert.deepEqual(vocab.modules, { TestModule: '1.0.0', DepModule: '2.0.0' })

    // Should have entities from both modules
    assert.ok(fs.existsSync(path.join(outputDir, 'categories', 'TestCategory.wikitext')))
    assert.ok(fs.existsSync(path.join(outputDir, 'categories', 'OtherCategory.wikitext')))
  })

  it('throws for missing bundle', () => {
    assert.throws(
      () => generateBundleArtifactDirectory('NonExistent', '1.0.0', entityIndex, '0.1.0', tempDir.path),
      /Bundle not found: NonExistent/
    )
  })

  it('throws for missing module in bundle', () => {
    entityIndex.bundles.set('Broken', {
      id: 'Broken', version: '1.0.0', modules: ['NonExistent'],
    })

    assert.throws(
      () => generateBundleArtifactDirectory('Broken', '1.0.0', entityIndex, '0.1.0', tempDir.path),
      /Module not found in bundle: NonExistent/
    )
  })
})
