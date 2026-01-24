#!/usr/bin/env node

import fs from 'node:fs'
import { buildEntityIndex } from './lib/entity-index.js'
import {
  generateModuleArtifact,
  generateBundleManifest,
  writeVersionedArtifact
} from './lib/artifact-generator.js'

/**
 * Parse command-line arguments
 * @returns {Object} Parsed arguments
 */
function parseArgs() {
  const args = {
    all: false,
    modules: [],
    bundles: []
  }

  for (const arg of process.argv.slice(2)) {
    if (arg === '--all') {
      args.all = true
    } else if (arg.startsWith('--modules=')) {
      const value = arg.slice('--modules='.length)
      args.modules = value.split(',').map(s => s.trim()).filter(Boolean)
    } else if (arg.startsWith('--bundles=')) {
      const value = arg.slice('--bundles='.length)
      args.bundles = value.split(',').map(s => s.trim()).filter(Boolean)
    }
  }

  return args
}

/**
 * Main entry point for artifact generation
 */
async function main() {
  try {
    const args = parseArgs()

    // Build entity index
    console.log('Building entity index...')
    const entityIndex = await buildEntityIndex()

    // Read ontology VERSION
    let ontologyVersion
    try {
      ontologyVersion = fs.readFileSync('VERSION', 'utf8').trim()
    } catch (err) {
      console.error('Error: VERSION file not found')
      process.exit(1)
    }

    // Determine what to generate
    let modulesToGenerate = []
    let bundlesToGenerate = []

    if (args.all) {
      // Generate for all modules and bundles
      modulesToGenerate = Array.from(entityIndex.modules.keys())
      bundlesToGenerate = Array.from(entityIndex.bundles.keys())
    } else if (args.modules.length > 0 || args.bundles.length > 0) {
      // Generate for specific modules/bundles
      modulesToGenerate = args.modules
      bundlesToGenerate = args.bundles
    } else {
      // No arguments - for Phase 9 integration, will read from stdin/file
      // For now, default to --all behavior if no args
      console.log('No arguments provided, generating for all modules and bundles...')
      modulesToGenerate = Array.from(entityIndex.modules.keys())
      bundlesToGenerate = Array.from(entityIndex.bundles.keys())
    }

    let moduleCount = 0
    let bundleCount = 0

    // Generate module artifacts
    for (const moduleId of modulesToGenerate) {
      const moduleEntity = entityIndex.modules.get(moduleId)
      if (!moduleEntity) {
        console.error(`Warning: Module not found: ${moduleId}`)
        continue
      }

      const artifact = generateModuleArtifact(moduleId, moduleEntity.version, entityIndex)
      const outputPath = writeVersionedArtifact('modules', moduleId, moduleEntity.version, artifact)
      console.log(`Generated ${outputPath}`)
      moduleCount++
    }

    // Generate bundle manifests
    for (const bundleId of bundlesToGenerate) {
      const bundleEntity = entityIndex.bundles.get(bundleId)
      if (!bundleEntity) {
        console.error(`Warning: Bundle not found: ${bundleId}`)
        continue
      }

      const manifest = generateBundleManifest(bundleId, bundleEntity.version, entityIndex, ontologyVersion)
      const outputPath = writeVersionedArtifact('bundles', bundleId, bundleEntity.version, manifest)
      console.log(`Generated ${outputPath}`)
      bundleCount++
    }

    // Print summary
    console.log(`\nGenerated ${moduleCount} module artifact(s), ${bundleCount} bundle manifest(s)`)

  } catch (error) {
    console.error('Error during artifact generation:', error.message)
    process.exit(1)
  }
}

main()
