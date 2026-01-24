#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { buildEntityIndex } from './lib/entity-index.js'
import { calculateVersionCascade } from './lib/version-cascade.js'

/**
 * Update module version in JSON file
 *
 * @param {string} moduleId - Module identifier
 * @param {string} newVersion - New semver version
 */
function updateModuleVersion(moduleId, newVersion) {
  const filePath = path.join('modules', `${moduleId}.json`)
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  // Update version field
  content.version = newVersion

  // Write back with 2-space indent + trailing newline
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n')
}

/**
 * Update bundle version in JSON file
 *
 * @param {string} bundleId - Bundle identifier
 * @param {string} newVersion - New semver version
 */
function updateBundleVersion(bundleId, newVersion) {
  const filePath = path.join('bundles', `${bundleId}.json`)
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  // Update version field
  content.version = newVersion

  // Write back with 2-space indent + trailing newline
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n')
}

/**
 * Update ontology VERSION file
 *
 * @param {string} bumpType - Bump type ('major', 'minor', 'patch')
 * @param {string} rootDir - Repository root directory
 * @returns {string} New version string
 */
function updateOntologyVersion(bumpType, rootDir = process.cwd()) {
  const versionPath = path.join(rootDir, 'VERSION')
  const currentVersion = fs.readFileSync(versionPath, 'utf8').trim()
  const newVersion = semver.inc(currentVersion, bumpType)

  // Write with trailing newline
  fs.writeFileSync(versionPath, newVersion + '\n')

  return newVersion
}

/**
 * Delete VERSION_OVERRIDES.json if it exists
 *
 * @param {string} rootDir - Repository root directory
 * @returns {boolean} True if file was deleted
 */
function cleanupOverrides(rootDir = process.cwd()) {
  const overridePath = path.join(rootDir, 'VERSION_OVERRIDES.json')

  if (fs.existsSync(overridePath)) {
    fs.unlinkSync(overridePath)
    console.error('Cleaned up VERSION_OVERRIDES.json')
    return true
  }

  return false
}

/**
 * Main orchestration function
 */
async function main() {
  try {
    // Build entity index
    const entityIndex = await buildEntityIndex()

    // Run version cascade calculation with overrides
    const result = calculateVersionCascade(entityIndex, 'origin/main', {
      applyOverrides: true,
      rootDir: process.cwd()
    })

    // Track what was changed
    const modulesOutput = {}
    const bundlesOutput = {}
    let ontologyVersion = null
    const overridesApplied = Object.keys(result.overrides || {}).length > 0

    // Update module versions
    for (const [moduleId, versionInfo] of result.moduleVersions) {
      updateModuleVersion(moduleId, versionInfo.new)
      modulesOutput[moduleId] = {
        from: versionInfo.current,
        to: versionInfo.new,
        bump: versionInfo.bump
      }
    }

    // Update bundle versions
    for (const [bundleId, versionInfo] of result.bundleVersions) {
      updateBundleVersion(bundleId, versionInfo.new)
      bundlesOutput[bundleId] = {
        from: versionInfo.current,
        to: versionInfo.new,
        bump: versionInfo.bump
      }
    }

    // Update ontology VERSION if there are any changes
    if (result.ontologyBump && (result.moduleVersions.size > 0 || result.bundleVersions.size > 0 || result.orphanChanges.length > 0)) {
      ontologyVersion = updateOntologyVersion(result.ontologyBump)
    }

    // Clean up overrides
    const overridesCleaned = cleanupOverrides()

    // Output JSON to stdout for workflow consumption
    const output = {
      modules: modulesOutput,
      bundles: bundlesOutput,
      ontologyVersion,
      overridesApplied,
      overrideWarnings: result.overrideWarnings || [],
      overridesCleaned
    }

    console.log(JSON.stringify(output, null, 2))

  } catch (error) {
    console.error('Error applying versions:', error.message)
    process.exit(1)
  }
}

main()
