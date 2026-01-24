#!/usr/bin/env node

import { buildEntityIndex } from './lib/entity-index.js'
import { buildReverseModuleIndex } from './lib/version-cascade.js'
import fs from 'node:fs'

/**
 * Detect affected modules and bundles from changed files
 *
 * Reads changed file paths from stdin (newline-separated)
 * Outputs JSON with affected modules and bundles
 */
async function main() {
  // Read changed files from stdin
  const input = fs.readFileSync(0, 'utf8')
  const changedFiles = input.trim().split('\n').filter(Boolean)

  if (changedFiles.length === 0) {
    console.log(JSON.stringify({ modules: [], bundles: [] }))
    return
  }

  // Build entity index and reverse module index
  const entityIndex = await buildEntityIndex()
  const reverseIndex = buildReverseModuleIndex(entityIndex)

  const affectedModules = new Set()
  const affectedBundles = new Set()

  for (const filePath of changedFiles) {
    const parts = filePath.split('/')
    const entityType = parts[0]
    const fileName = parts[parts.length - 1]
    const entityId = fileName.replace('.json', '')

    // Direct module/bundle changes
    if (entityType === 'modules') {
      affectedModules.add(entityId)
    } else if (entityType === 'bundles') {
      affectedBundles.add(entityId)
    } else {
      // Entity changes - look up containing module
      const key = `${entityType}:${entityId}`
      const moduleId = reverseIndex.get(key)
      if (moduleId) {
        affectedModules.add(moduleId)
      }
    }
  }

  // For each affected module, find containing bundles
  for (const [bundleId, bundleEntity] of entityIndex.bundles) {
    const bundleModules = bundleEntity.modules || []
    for (const moduleId of bundleModules) {
      if (affectedModules.has(moduleId)) {
        affectedBundles.add(bundleId)
        break
      }
    }
  }

  // Output result
  console.log(JSON.stringify({
    modules: Array.from(affectedModules),
    bundles: Array.from(affectedBundles)
  }))
}

main().catch(err => {
  console.error('Error detecting affected modules:', err.message)
  process.exit(1)
})
