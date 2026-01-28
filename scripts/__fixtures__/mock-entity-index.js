/**
 * Factory functions for creating mock entity indexes in tests
 */

/**
 * Create a mock entity index with configurable overrides
 *
 * @param {Object} overrides - Optional overrides for specific entity types
 * @returns {Object} Entity index with Maps for each entity type
 *
 * @example
 * const index = createMockEntityIndex({
 *   categories: new Map([['Agent', { id: 'Agent', label: 'Agent' }]])
 * })
 */
export function createMockEntityIndex(overrides = {}) {
  return {
    categories: overrides.categories ?? new Map(),
    properties: overrides.properties ?? new Map(),
    subobjects: overrides.subobjects ?? new Map(),
    templates: overrides.templates ?? new Map(),
    modules: overrides.modules ?? new Map(),
    bundles: overrides.bundles ?? new Map(),
    dashboards: overrides.dashboards ?? new Map(),
    resources: overrides.resources ?? new Map()
  }
}

/**
 * Create a mock entity index with a dependency chain for cascade testing
 *
 * Structure:
 * - Core module: contains Agent category, Name property
 * - Lab module: depends on Core, contains Equipment category
 * - Default bundle: contains Core and Lab modules
 *
 * @returns {Object} Entity index with dependency chain
 */
export function createDependencyChainIndex() {
  return {
    categories: new Map([
      ['Agent', {
        id: 'Agent',
        label: 'Agent',
        _filePath: 'categories/Agent.json'
      }],
      ['Equipment', {
        id: 'Equipment',
        label: 'Equipment',
        _filePath: 'categories/Equipment.json'
      }]
    ]),
    properties: new Map([
      ['Name', {
        id: 'Name',
        label: 'Name',
        datatype: 'Text',
        _filePath: 'properties/Name.json'
      }],
      ['SerialNumber', {
        id: 'SerialNumber',
        label: 'Serial Number',
        datatype: 'Text',
        _filePath: 'properties/SerialNumber.json'
      }]
    ]),
    subobjects: new Map(),
    templates: new Map(),
    dashboards: new Map(),
    resources: new Map(),
    modules: new Map([
      ['Core', {
        id: 'Core',
        version: '1.0.0',
        categories: ['Agent'],
        properties: ['Name'],
        subobjects: [],
        templates: [],
        dashboards: [],
        resources: [],
        dependencies: []
      }],
      ['Lab', {
        id: 'Lab',
        version: '1.0.0',
        categories: ['Equipment'],
        properties: ['SerialNumber'],
        subobjects: [],
        templates: [],
        dashboards: [],
        resources: [],
        dependencies: ['Core']
      }]
    ]),
    bundles: new Map([
      ['Default', {
        id: 'Default',
        version: '1.0.0',
        modules: ['Core', 'Lab']
      }]
    ])
  }
}

/**
 * Create a mock entity index with cycles for cycle detection testing
 *
 * @param {'category'|'module'|'property'} cycleType - Type of cycle to create
 * @returns {Object} Entity index with specified cycle
 */
export function createCyclicIndex(cycleType) {
  const base = createMockEntityIndex()

  if (cycleType === 'category') {
    // A -> B -> A cycle
    base.categories = new Map([
      ['CategoryA', {
        id: 'CategoryA',
        label: 'Category A',
        parents: ['CategoryB'],
        _filePath: 'categories/CategoryA.json'
      }],
      ['CategoryB', {
        id: 'CategoryB',
        label: 'Category B',
        parents: ['CategoryA'],
        _filePath: 'categories/CategoryB.json'
      }]
    ])
  }

  if (cycleType === 'module') {
    // ModuleA -> ModuleB -> ModuleA cycle
    base.modules = new Map([
      ['ModuleA', {
        id: 'ModuleA',
        dependencies: ['ModuleB'],
        categories: [],
        properties: []
      }],
      ['ModuleB', {
        id: 'ModuleB',
        dependencies: ['ModuleA'],
        categories: [],
        properties: []
      }]
    ])
  }

  if (cycleType === 'property') {
    // PropA -> PropB -> PropA cycle
    base.properties = new Map([
      ['PropA', {
        id: 'PropA',
        label: 'Property A',
        datatype: 'Text',
        parent_property: 'PropB',
        _filePath: 'properties/PropA.json'
      }],
      ['PropB', {
        id: 'PropB',
        label: 'Property B',
        datatype: 'Text',
        parent_property: 'PropA',
        _filePath: 'properties/PropB.json'
      }]
    ])
  }

  return base
}

/**
 * Create a minimal valid entity index
 *
 * @returns {Object} Empty but valid entity index
 */
export function createEmptyIndex() {
  return createMockEntityIndex()
}

/**
 * Create a mock entity index for reference validation testing
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.withMissingRef - Include a missing reference
 * @param {boolean} options.withSelfRef - Include a self-reference
 * @param {boolean} options.withScopeViolation - Include a scope violation
 * @returns {Object} Entity index configured for testing
 */
export function createReferenceTestIndex(options = {}) {
  const index = createMockEntityIndex()

  // Base valid structure
  index.properties = new Map([
    ['Name', {
      id: 'Name',
      label: 'Name',
      datatype: 'Text',
      _filePath: 'properties/Name.json'
    }],
    ['Email', {
      id: 'Email',
      label: 'Email',
      datatype: 'Text',
      _filePath: 'properties/Email.json'
    }]
  ])

  index.categories = new Map([
    ['Person', {
      id: 'Person',
      label: 'Person',
      required_properties: ['Name'],
      optional_properties: ['Email'],
      _filePath: 'categories/Person.json'
    }]
  ])

  index.modules = new Map([
    ['Core', {
      id: 'Core',
      categories: ['Person'],
      properties: ['Name', 'Email'],
      subobjects: [],
      templates: [],
      dependencies: []
    }]
  ])

  if (options.withMissingRef) {
    index.categories.set('BadCategory', {
      id: 'BadCategory',
      label: 'Bad Category',
      parents: ['NonExistent'],
      _filePath: 'categories/BadCategory.json'
    })
    index.modules.get('Core').categories.push('BadCategory')
  }

  if (options.withSelfRef) {
    index.categories.set('SelfRefCategory', {
      id: 'SelfRefCategory',
      label: 'Self Ref Category',
      parents: ['SelfRefCategory'],
      _filePath: 'categories/SelfRefCategory.json'
    })
    index.modules.get('Core').categories.push('SelfRefCategory')
  }

  if (options.withScopeViolation) {
    // Add an unrelated module with a property
    index.properties.set('Isolated', {
      id: 'Isolated',
      label: 'Isolated Property',
      datatype: 'Text',
      _filePath: 'properties/Isolated.json'
    })
    index.modules.set('OtherModule', {
      id: 'OtherModule',
      categories: [],
      properties: ['Isolated'],
      subobjects: [],
      templates: [],
      dependencies: []  // NOT a dependency of Core
    })

    // Reference Isolated from Core's Person category
    index.categories.get('Person').optional_properties.push('Isolated')
  }

  return index
}
