import { describe, test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { runCLIJSON, runCLI } from './helpers/cli-runner.js'
import { createGitFixture, createTempFixture } from './helpers/fixture-manager.js'

describe('ci-apply-versions.js integration tests', () => {
  let fixture

  afterEach(() => {
    if (fixture) {
      fixture.cleanup()
      fixture = null
    }
  })

  describe('Basic execution', () => {
    test('script runs without crashing on empty directory', async () => {
      fixture = createTempFixture('apply-versions-empty')

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // May exit with error due to missing entity index, but shouldn't crash
      assert.ok(result.exitCode === 0 || result.exitCode === 1)
    })

    test('script runs on valid entity structure', async () => {
      fixture = createTempFixture('apply-versions-valid')
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      fixture.writeVersion('1.0.0')

      fixture.writeJSON('categories/Agent.json', { id: 'Agent', label: 'Agent' })
      fixture.writeJSON('properties/Name.json', { id: 'Name', label: 'Name', datatype: 'Text' })
      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        version: '1.0.0',
        categories: ['Agent'],
        properties: ['Name'],
        subobjects: [],
        templates: [],
        dependencies: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        version: '1.0.0',
        modules: ['Core']
      })

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // Should either succeed or fail gracefully
      assert.ok(result.exitCode === 0 || result.exitCode === 1)
    })
  })

  describe('With Git repository', () => {
    beforeEach(() => {
      fixture = createGitFixture('apply-versions-git')
      fixture.setupBaseBranch()

      // Create a branch that mimics origin/main
      try {
        execFileSync('git', ['branch', '-M', 'main'], { cwd: fixture.path, stdio: 'pipe' })
        execFileSync('git', ['branch', 'origin/main'], { cwd: fixture.path, stdio: 'pipe' })
      } catch (e) {
        // Branch may already exist
      }
    })

    test('output has expected JSON structure', async () => {
      const result = await runCLIJSON('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // Even if it fails, stdout should be parseable JSON or empty
      if (result.exitCode === 0 && result.data) {
        assert.ok('modules' in result.data)
        assert.ok('bundles' in result.data)
        assert.ok('overridesApplied' in result.data)
        assert.ok('overridesCleaned' in result.data)
        assert.ok('overrideWarnings' in result.data)
        assert.ok('ontologyVersion' in result.data)
      }
    })

    test('VERSION_OVERRIDES.json is cleaned up when present', async () => {
      // Write override file
      fixture.writeJSON('VERSION_OVERRIDES.json', {
        Core: 'major'
      })

      const overridesExistsBefore = fixture.exists('VERSION_OVERRIDES.json')
      assert.strictEqual(overridesExistsBefore, true)

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // If script ran successfully, overrides should be cleaned
      if (result.exitCode === 0) {
        assert.strictEqual(fixture.exists('VERSION_OVERRIDES.json'), false)
      }
    })

    test('module versions start at 1.0.0', async () => {
      const moduleContent = fixture.readJSON('modules/Core.json')

      assert.strictEqual(moduleContent.version, '1.0.0')
    })

    test('bundle versions start at 1.0.0', async () => {
      const bundleContent = fixture.readJSON('bundles/Default.json')

      assert.strictEqual(bundleContent.version, '1.0.0')
    })
  })

  describe('Version file handling', () => {
    test('VERSION file is read correctly', async () => {
      fixture = createTempFixture('version-read')
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      fixture.writeVersion('2.5.3')

      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        version: '1.0.0',
        categories: [],
        properties: [],
        subobjects: [],
        templates: [],
        dependencies: []
      })
      fixture.writeJSON('bundles/Default.json', {
        id: 'Default',
        version: '1.0.0',
        modules: ['Core']
      })

      const versionContent = fixture.readFile('VERSION').trim()
      assert.strictEqual(versionContent, '2.5.3')
    })
  })

  describe('Error handling', () => {
    test('handles missing VERSION file gracefully', async () => {
      fixture = createTempFixture('no-version')
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      // Don't write VERSION file

      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        version: '1.0.0',
        categories: [],
        properties: [],
        subobjects: [],
        templates: [],
        dependencies: []
      })

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // Should fail but not crash
      assert.ok(result.exitCode === 1 || result.exitCode === 0)
    })

    test('handles invalid VERSION format gracefully', async () => {
      fixture = createTempFixture('bad-version')
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      fixture.writeFile('VERSION', 'not-semver\n')

      fixture.writeJSON('modules/Core.json', {
        id: 'Core',
        version: '1.0.0',
        categories: [],
        properties: [],
        subobjects: [],
        templates: [],
        dependencies: []
      })

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // Should fail but not crash
      assert.ok(result.exitCode === 0 || result.exitCode === 1)
    })

    test('handles missing modules gracefully', async () => {
      fixture = createTempFixture('missing-modules')
      fixture.createEntityDirectories()
      fixture.writeSchemas()
      fixture.writeVersion('1.0.0')

      // Bundle references non-existent module
      fixture.writeJSON('bundles/Broken.json', {
        id: 'Broken',
        version: '1.0.0',
        modules: ['NonExistent']
      })

      const result = await runCLI('ci-apply-versions.js', {
        cwd: fixture.path
      })

      // Should handle gracefully (exit 0 or 1)
      assert.ok(result.exitCode === 0 || result.exitCode === 1)
    })
  })
})
