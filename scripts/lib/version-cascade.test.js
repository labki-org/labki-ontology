import { describe, test } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { DepGraph } from 'dependency-graph'
import {
  buildReverseModuleIndex,
  maxBumpType,
  calculateModuleBumps,
  buildModuleDependencyGraph,
  propagateDependencyCascade,
  calculateBundleBumps,
  calculateOntologyBump,
  loadOverrides,
  applyOverrides,
  calculateNewVersion
} from './version-cascade.js'

describe('maxBumpType', () => {
  test('returns patch for empty array', () => {
    assert.strictEqual(maxBumpType([]), 'patch')
  })

  test('returns patch for single patch', () => {
    assert.strictEqual(maxBumpType(['patch']), 'patch')
  })

  test('returns minor when minor and patch present', () => {
    assert.strictEqual(maxBumpType(['minor', 'patch']), 'minor')
  })

  test('returns major when all types present', () => {
    assert.strictEqual(maxBumpType(['patch', 'major', 'minor']), 'major')
  })

  test('handles major with patch', () => {
    assert.strictEqual(maxBumpType(['patch', 'major']), 'major')
  })

  test('handles multiple minor bumps', () => {
    assert.strictEqual(maxBumpType(['minor', 'minor', 'patch']), 'minor')
  })
})

describe('buildReverseModuleIndex', () => {
  test('maps categories to module', () => {
    const entityIndex = {
      categories: new Map([
        ['Agent', { id: 'Agent', _filePath: 'categories/Agent.json' }],
        ['Person', { id: 'Person', _filePath: 'categories/Person.json' }]
      ]),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['Agent', 'Person'],
          properties: [],
          subobjects: [],
          templates: []
        }]
      ]),
      bundles: new Map()
    }

    const reverseIndex = buildReverseModuleIndex(entityIndex)

    assert.strictEqual(reverseIndex.get('categories:Agent'), 'Core')
    assert.strictEqual(reverseIndex.get('categories:Person'), 'Core')
  })

  test('maps properties to module', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map([
        ['Name', { id: 'Name', _filePath: 'properties/Name.json' }]
      ]),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: [],
          properties: ['Name'],
          subobjects: [],
          templates: []
        }]
      ]),
      bundles: new Map()
    }

    const reverseIndex = buildReverseModuleIndex(entityIndex)

    assert.strictEqual(reverseIndex.get('properties:Name'), 'Core')
  })

  test('handles multiple modules', () => {
    const entityIndex = {
      categories: new Map([
        ['Agent', { id: 'Agent' }],
        ['Equipment', { id: 'Equipment' }]
      ]),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', categories: ['Agent'], properties: [] }],
        ['Lab', { id: 'Lab', categories: ['Equipment'], properties: [] }]
      ]),
      bundles: new Map()
    }

    const reverseIndex = buildReverseModuleIndex(entityIndex)

    assert.strictEqual(reverseIndex.get('categories:Agent'), 'Core')
    assert.strictEqual(reverseIndex.get('categories:Equipment'), 'Lab')
  })

  test('returns undefined for entities not in any module', () => {
    const entityIndex = {
      categories: new Map([
        ['Orphan', { id: 'Orphan' }]
      ]),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', categories: [], properties: [] }]
      ]),
      bundles: new Map()
    }

    const reverseIndex = buildReverseModuleIndex(entityIndex)

    assert.strictEqual(reverseIndex.get('categories:Orphan'), undefined)
  })
})

describe('calculateModuleBumps', () => {
  test('aggregates entity bumps to containing module', () => {
    const entityIndex = {
      categories: new Map([
        ['Agent', { id: 'Agent' }]
      ]),
      properties: new Map([
        ['Name', { id: 'Name' }]
      ]),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', {
          id: 'Core',
          categories: ['Agent'],
          properties: ['Name'],
          subobjects: [],
          templates: []
        }]
      ]),
      bundles: new Map()
    }

    const changes = [
      { file: 'categories/Agent.json', entityType: 'categories', changeType: 'minor' },
      { file: 'properties/Name.json', entityType: 'properties', changeType: 'major' }
    ]

    const moduleBumps = calculateModuleBumps(entityIndex, changes)

    assert.strictEqual(moduleBumps.get('Core'), 'major')
  })

  test('handles changes across multiple modules', () => {
    const entityIndex = {
      categories: new Map([
        ['Agent', { id: 'Agent' }],
        ['Equipment', { id: 'Equipment' }]
      ]),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', categories: ['Agent'], properties: [] }],
        ['Lab', { id: 'Lab', categories: ['Equipment'], properties: [] }]
      ]),
      bundles: new Map()
    }

    const changes = [
      { file: 'categories/Agent.json', entityType: 'categories', changeType: 'minor' },
      { file: 'categories/Equipment.json', entityType: 'categories', changeType: 'patch' }
    ]

    const moduleBumps = calculateModuleBumps(entityIndex, changes)

    assert.strictEqual(moduleBumps.get('Core'), 'minor')
    assert.strictEqual(moduleBumps.get('Lab'), 'patch')
  })

  test('excludes orphan entities not in any module', () => {
    const entityIndex = {
      categories: new Map([
        ['Orphan', { id: 'Orphan' }]
      ]),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', categories: [], properties: [] }]
      ]),
      bundles: new Map()
    }

    const changes = [
      { file: 'categories/Orphan.json', entityType: 'categories', changeType: 'major' }
    ]

    const moduleBumps = calculateModuleBumps(entityIndex, changes)

    assert.strictEqual(moduleBumps.has('Core'), false)
    assert.strictEqual(moduleBumps.size, 0)
  })
})

describe('buildModuleDependencyGraph', () => {
  test('builds graph with module nodes', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', dependencies: [] }],
        ['Lab', { id: 'Lab', dependencies: [] }]
      ]),
      bundles: new Map()
    }

    const graph = buildModuleDependencyGraph(entityIndex)

    assert.ok(graph.hasNode('Core'))
    assert.ok(graph.hasNode('Lab'))
  })

  test('adds dependency edges', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core', dependencies: [] }],
        ['Lab', { id: 'Lab', dependencies: ['Core'] }]
      ]),
      bundles: new Map()
    }

    const graph = buildModuleDependencyGraph(entityIndex)

    const deps = graph.dependenciesOf('Lab')
    assert.ok(deps.includes('Core'))
  })
})

describe('propagateDependencyCascade', () => {
  test('propagates bump from dependency to dependent', () => {
    const graph = new DepGraph()
    graph.addNode('Core')
    graph.addNode('Lab')
    graph.addDependency('Lab', 'Core')

    const moduleBumps = new Map([
      ['Core', 'major']
    ])

    const cascaded = propagateDependencyCascade(graph, moduleBumps)

    assert.strictEqual(cascaded.get('Core'), 'major')
    assert.strictEqual(cascaded.get('Lab'), 'major')
  })

  test('keeps higher bump when dependent already has bump', () => {
    const graph = new DepGraph()
    graph.addNode('Core')
    graph.addNode('Lab')
    graph.addDependency('Lab', 'Core')

    const moduleBumps = new Map([
      ['Core', 'patch'],
      ['Lab', 'minor']
    ])

    const cascaded = propagateDependencyCascade(graph, moduleBumps)

    assert.strictEqual(cascaded.get('Core'), 'patch')
    assert.strictEqual(cascaded.get('Lab'), 'minor')
  })

  test('takes max when dependency bump is higher', () => {
    const graph = new DepGraph()
    graph.addNode('Core')
    graph.addNode('Lab')
    graph.addDependency('Lab', 'Core')

    const moduleBumps = new Map([
      ['Core', 'major'],
      ['Lab', 'patch']
    ])

    const cascaded = propagateDependencyCascade(graph, moduleBumps)

    assert.strictEqual(cascaded.get('Lab'), 'major')
  })

  test('handles no dependencies', () => {
    const graph = new DepGraph()
    graph.addNode('Core')

    const moduleBumps = new Map([
      ['Core', 'minor']
    ])

    const cascaded = propagateDependencyCascade(graph, moduleBumps)

    assert.strictEqual(cascaded.get('Core'), 'minor')
  })

  test('handles transitive dependencies', () => {
    const graph = new DepGraph()
    graph.addNode('Core')
    graph.addNode('Lab')
    graph.addNode('Analysis')
    graph.addDependency('Lab', 'Core')
    graph.addDependency('Analysis', 'Lab')

    const moduleBumps = new Map([
      ['Core', 'major']
    ])

    const cascaded = propagateDependencyCascade(graph, moduleBumps)

    assert.strictEqual(cascaded.get('Core'), 'major')
    assert.strictEqual(cascaded.get('Lab'), 'major')
    assert.strictEqual(cascaded.get('Analysis'), 'major')
  })
})

describe('calculateBundleBumps', () => {
  test('aggregates module bumps to bundle', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core' }],
        ['Lab', { id: 'Lab' }]
      ]),
      bundles: new Map([
        ['Default', { id: 'Default', modules: ['Core', 'Lab'] }]
      ])
    }

    const moduleBumps = new Map([
      ['Core', 'major'],
      ['Lab', 'minor']
    ])

    const bundleBumps = calculateBundleBumps(entityIndex, moduleBumps)

    assert.strictEqual(bundleBumps.get('Default'), 'major')
  })

  test('excludes bundles with no module bumps', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core' }]
      ]),
      bundles: new Map([
        ['Default', { id: 'Default', modules: ['Core'] }]
      ])
    }

    const moduleBumps = new Map()

    const bundleBumps = calculateBundleBumps(entityIndex, moduleBumps)

    assert.strictEqual(bundleBumps.has('Default'), false)
    assert.strictEqual(bundleBumps.size, 0)
  })

  test('handles bundle with partial module bumps', () => {
    const entityIndex = {
      categories: new Map(),
      properties: new Map(),
      subobjects: new Map(),
      templates: new Map(),
      modules: new Map([
        ['Core', { id: 'Core' }],
        ['Lab', { id: 'Lab' }]
      ]),
      bundles: new Map([
        ['Default', { id: 'Default', modules: ['Core', 'Lab'] }]
      ])
    }

    const moduleBumps = new Map([
      ['Core', 'minor']
      // Lab has no bump
    ])

    const bundleBumps = calculateBundleBumps(entityIndex, moduleBumps)

    assert.strictEqual(bundleBumps.get('Default'), 'minor')
  })
})

describe('calculateOntologyBump', () => {
  test('returns max of all changes', () => {
    const changes = [
      { changeType: 'patch' },
      { changeType: 'minor' },
      { changeType: 'major' }
    ]

    const bump = calculateOntologyBump(changes, new Map(), new Map())

    assert.strictEqual(bump, 'major')
  })

  test('returns patch for empty changes', () => {
    const bump = calculateOntologyBump([], new Map(), new Map())

    assert.strictEqual(bump, 'patch')
  })

  test('handles all same change type', () => {
    const changes = [
      { changeType: 'minor' },
      { changeType: 'minor' }
    ]

    const bump = calculateOntologyBump(changes, new Map(), new Map())

    assert.strictEqual(bump, 'minor')
  })
})

describe('loadOverrides', () => {
  const testOverridesPath = path.join(process.cwd(), 'VERSION_OVERRIDES.json')

  test('returns empty object when file missing', () => {
    // Ensure file doesn't exist
    if (fs.existsSync(testOverridesPath)) {
      fs.unlinkSync(testOverridesPath)
    }
    const result = loadOverrides()
    assert.deepStrictEqual(result, {})
  })

  test('returns parsed JSON when file exists', () => {
    fs.writeFileSync(testOverridesPath, JSON.stringify({ Core: 'major' }))
    const result = loadOverrides()
    assert.deepStrictEqual(result, { Core: 'major' })
    fs.unlinkSync(testOverridesPath)
  })

  test('throws error for invalid JSON', () => {
    fs.writeFileSync(testOverridesPath, '{ invalid json }')
    assert.throws(
      () => loadOverrides(),
      /Failed to parse VERSION_OVERRIDES.json/
    )
    fs.unlinkSync(testOverridesPath)
  })
})

describe('applyOverrides', () => {
  test('applies override to existing bump', () => {
    const calculatedBumps = new Map([['Core', 'minor']])
    const overrides = { Core: 'major' }

    const result = applyOverrides(calculatedBumps, overrides)

    assert.strictEqual(result.bumps.get('Core'), 'major')
    assert.strictEqual(result.warnings.length, 0)
  })

  test('generates warning for downgrade', () => {
    const calculatedBumps = new Map([['Core', 'major']])
    const overrides = { Core: 'minor' }

    const result = applyOverrides(calculatedBumps, overrides)

    assert.strictEqual(result.bumps.get('Core'), 'minor')
    assert.strictEqual(result.warnings.length, 1)
    assert.ok(result.warnings[0].includes('downgrades Core from major to minor'))
  })

  test('adds new bump for non-existent module', () => {
    const calculatedBumps = new Map([['Core', 'minor']])
    const overrides = { Lab: 'patch' }

    const result = applyOverrides(calculatedBumps, overrides)

    assert.strictEqual(result.bumps.get('Core'), 'minor')
    assert.strictEqual(result.bumps.get('Lab'), 'patch')
    assert.strictEqual(result.warnings.length, 0)
  })

  test('returns unchanged bumps for empty overrides', () => {
    const calculatedBumps = new Map([['Core', 'minor']])
    const overrides = {}

    const result = applyOverrides(calculatedBumps, overrides)

    assert.strictEqual(result.bumps.get('Core'), 'minor')
    assert.strictEqual(result.bumps.size, 1)
    assert.strictEqual(result.warnings.length, 0)
  })
})

describe('calculateNewVersion', () => {
  test('patch bump increments patch version', () => {
    const result = calculateNewVersion('1.2.3', 'patch')
    assert.strictEqual(result, '1.2.4')
  })

  test('minor bump increments minor version and resets patch', () => {
    const result = calculateNewVersion('1.2.3', 'minor')
    assert.strictEqual(result, '1.3.0')
  })

  test('major bump increments major version and resets minor and patch', () => {
    const result = calculateNewVersion('1.2.3', 'major')
    assert.strictEqual(result, '2.0.0')
  })

  test('returns null for invalid version', () => {
    const result = calculateNewVersion('invalid', 'patch')
    assert.strictEqual(result, null)
  })

  test('returns null for missing version', () => {
    const result = calculateNewVersion(null, 'patch')
    assert.strictEqual(result, null)
  })

  test('returns null for missing bump type', () => {
    const result = calculateNewVersion('1.2.3', null)
    assert.strictEqual(result, null)
  })
})
