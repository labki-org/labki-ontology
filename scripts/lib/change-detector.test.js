import { describe, test } from 'node:test'
import assert from 'node:assert'
import { detectBreakingChange } from './change-detector.js'

describe('detectBreakingChange', () => {
  describe('Deletion rules', () => {
    test('entity deleted returns major', () => {
      const base = { id: 'Name', datatype: 'Text' }
      const pr = null

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('deleted'))
    })

    test('entity added returns minor', () => {
      const base = null
      const pr = { id: 'NewProp', datatype: 'Text' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'minor')
      assert.strictEqual(result.reason, null)
    })

    test('both null returns patch', () => {
      const result = detectBreakingChange('properties', null, null)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'patch')
    })

    test('id changed returns major', () => {
      const base = { id: 'OldName', datatype: 'Text' }
      const pr = { id: 'NewName', datatype: 'Text' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('id changed'))
    })
  })

  describe('Property breaking changes', () => {
    test('datatype change returns major', () => {
      const base = { id: 'Name', datatype: 'Text' }
      const pr = { id: 'Name', datatype: 'Integer' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('datatype changed'))
    })

    test('cardinality multiple to single returns major', () => {
      const base = { id: 'Name', datatype: 'Text', cardinality: 'multiple' }
      const pr = { id: 'Name', datatype: 'Text', cardinality: 'single' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('cardinality restricted'))
    })

    test('cardinality single to multiple is not breaking', () => {
      const base = { id: 'Name', datatype: 'Text', cardinality: 'single' }
      const pr = { id: 'Name', datatype: 'Text', cardinality: 'multiple' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      // Single to multiple is an update, typically patch
      assert.ok(['minor', 'patch'].includes(result.changeType))
    })

    test('allowed_values removal returns major', () => {
      const base = { id: 'Status', datatype: 'Text', allowed_values: ['A', 'B', 'C'] }
      const pr = { id: 'Status', datatype: 'Text', allowed_values: ['A', 'B'] }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('allowed_values removed'))
    })

    test('allowed_values addition returns minor', () => {
      const base = { id: 'Status', datatype: 'Text', allowed_values: ['A', 'B'] }
      const pr = { id: 'Status', datatype: 'Text', allowed_values: ['A', 'B', 'C'] }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'minor')
    })

    test('label change only returns patch', () => {
      const base = { id: 'Name', datatype: 'Text', label: 'Name' }
      const pr = { id: 'Name', datatype: 'Text', label: 'Full Name' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'patch')
    })

    test('description change only returns patch', () => {
      const base = { id: 'Name', datatype: 'Text', description: 'Old desc' }
      const pr = { id: 'Name', datatype: 'Text', description: 'New desc' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'patch')
    })

    test('no changes returns patch', () => {
      const base = { id: 'Name', datatype: 'Text', label: 'Name' }
      const pr = { id: 'Name', datatype: 'Text', label: 'Name' }

      const result = detectBreakingChange('properties', base, pr)

      assert.strictEqual(result.isBreaking, false)
      assert.strictEqual(result.changeType, 'patch')
    })
  })

  describe('Category breaking changes', () => {
    test('adding required_properties returns major', () => {
      const base = { id: 'Agent', required_properties: ['Name'] }
      const pr = { id: 'Agent', required_properties: ['Name', 'Email'] }

      const result = detectBreakingChange('categories', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('required_properties added'))
    })

    test('adding required_properties when none existed returns major', () => {
      const base = { id: 'Agent' }
      const pr = { id: 'Agent', required_properties: ['Name'] }

      const result = detectBreakingChange('categories', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('required_properties added'))
    })

    test('removing optional_properties returns major', () => {
      const base = { id: 'Agent', optional_properties: ['Name', 'Email'] }
      const pr = { id: 'Agent', optional_properties: ['Name'] }

      const result = detectBreakingChange('categories', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('optional_properties removed'))
    })

    test('adding optional_properties returns minor', () => {
      const base = { id: 'Agent', optional_properties: ['Name'] }
      const pr = { id: 'Agent', optional_properties: ['Name', 'Email'] }

      const result = detectBreakingChange('categories', base, pr)

      assert.strictEqual(result.isBreaking, false)
      // Addition of fields is minor
      assert.ok(['minor', 'patch'].includes(result.changeType))
    })

    test('removing required_properties is not breaking', () => {
      const base = { id: 'Agent', required_properties: ['Name', 'Email'] }
      const pr = { id: 'Agent', required_properties: ['Name'] }

      const result = detectBreakingChange('categories', base, pr)

      // Removing requirements makes the API more permissive
      assert.strictEqual(result.isBreaking, false)
    })

    test('parents change is minor or patch', () => {
      const base = { id: 'Person', parents: ['Agent'] }
      const pr = { id: 'Person', parents: ['Entity'] }

      const result = detectBreakingChange('categories', base, pr)

      // Parents change is not directly breaking for data consumers
      assert.ok(['minor', 'patch'].includes(result.changeType))
    })
  })

  describe('Module/bundle changes', () => {
    test('structural field deleted returns major', () => {
      const base = { id: 'Core', label: 'Core Module', categories: ['Agent'] }
      const pr = { id: 'Core', categories: ['Agent'] }

      const result = detectBreakingChange('modules', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
      assert.ok(result.reason.includes('field deleted'))
    })

    test('non-structural change is not breaking', () => {
      const base = { id: 'Core', label: 'Core Module', version: '1.0.0' }
      const pr = { id: 'Core', label: 'Core Module', version: '1.1.0' }

      const result = detectBreakingChange('modules', base, pr)

      assert.strictEqual(result.isBreaking, false)
    })

    test('version field update is not breaking', () => {
      const base = { id: 'Core', version: '1.0.0' }
      const pr = { id: 'Core', version: '2.0.0' }

      const result = detectBreakingChange('modules', base, pr)

      // Version updates within the module definition are metadata changes
      assert.strictEqual(result.isBreaking, false)
    })

    test('bundle module removal would be major if detected', () => {
      // Note: bundles follow same pattern - deletion/structural changes are major
      const base = { id: 'Default', modules: ['Core', 'Lab'] }
      const pr = null // bundle deleted

      const result = detectBreakingChange('bundles', base, pr)

      assert.strictEqual(result.isBreaking, true)
      assert.strictEqual(result.changeType, 'major')
    })
  })
})
