#!/usr/bin/env node

import fs from 'node:fs'
import { buildEntityIndex } from './lib/entity-index.js'
import {
  generateModuleArtifactDirectory,
  generateBundleArtifactDirectory,
} from './lib/artifact-generator.js'

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = { all: false, modules: [], bundles: [] }

  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') {
      args.all = true
    } else if (arg.startsWith('--modules=')) {
      args.modules = arg.slice('--modules='.length).split(',').map(s => s.trim()).filter(Boolean)
    } else if (arg.startsWith('--bundles=')) {
      args.bundles = arg.slice('--bundles='.length).split(',').map(s => s.trim()).filter(Boolean)
    }
  }

  return args
}

async function main() {
  try {
    const args = parseArgs()

    console.log('Building entity index...')
    const entityIndex = await buildEntityIndex()

    let ontologyVersion
    try {
      ontologyVersion = fs.readFileSync('VERSION', 'utf8').trim()
    } catch (err) {
      console.error('Error: VERSION file not found')
      process.exit(1)
    }

    let modulesToGenerate = []
    let bundlesToGenerate = []

    if (args.all || (args.modules.length === 0 && args.bundles.length === 0)) {
      modulesToGenerate = Array.from(entityIndex.modules.keys())
      bundlesToGenerate = Array.from(entityIndex.bundles.keys())
    } else {
      modulesToGenerate = args.modules
      bundlesToGenerate = args.bundles
    }

    let moduleCount = 0
    let bundleCount = 0

    // Generate module artifacts (directory-based)
    for (const moduleId of modulesToGenerate) {
      const moduleEntity = entityIndex.modules.get(moduleId)
      if (!moduleEntity) {
        console.error(`Warning: Module not found: ${moduleId}`)
        continue
      }

      const outputDir = generateModuleArtifactDirectory(
        moduleId, moduleEntity.version, entityIndex, ontologyVersion
      )
      console.log(`Generated module artifact: ${outputDir}/`)
      moduleCount++
    }

    // Generate bundle artifacts (directory-based)
    for (const bundleId of bundlesToGenerate) {
      const bundleEntity = entityIndex.bundles.get(bundleId)
      if (!bundleEntity) {
        console.error(`Warning: Bundle not found: ${bundleId}`)
        continue
      }

      const outputDir = generateBundleArtifactDirectory(
        bundleId, bundleEntity.version, entityIndex, ontologyVersion
      )
      console.log(`Generated bundle artifact: ${outputDir}/`)
      bundleCount++
    }

    console.log(`\nGenerated ${moduleCount} module artifact(s), ${bundleCount} bundle artifact(s)`)

  } catch (error) {
    console.error('Error during artifact generation:', error.message)
    process.exit(1)
  }
}

main()
