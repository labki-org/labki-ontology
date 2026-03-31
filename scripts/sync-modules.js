#!/usr/bin/env node

/**
 * Auto-update module JSON files so their properties and subobjects arrays
 * match what their categories (and those categories' subobjects) declare.
 *
 * Usage:
 *   npm run sync-modules              # Update all modules in-place
 *   npm run sync-modules -- --dry-run # Show what would change without writing
 *
 * This must run AFTER all entity file edits are on disk — it reads the current
 * state of categories, subobjects, and properties to compute the resolved set.
 */

import fs from 'node:fs'
import path from 'node:path'
import { buildEntityIndex } from './lib/entity-index.js'
import { resolveModule, diffModule } from './lib/module-resolver.js'

async function main() {
  const dryRun = process.argv.includes('--dry-run')

  const entityIndex = await buildEntityIndex()
  const moduleCount = entityIndex.modules.size

  console.log(`Resolving ${moduleCount} module(s)...\n`)

  let updatedCount = 0

  for (const [moduleId, moduleEntity] of entityIndex.modules) {
    const resolved = resolveModule(moduleEntity, entityIndex)
    const diff = diffModule(moduleEntity, resolved)

    const hasChanges =
      diff.missingProperties.length > 0 ||
      diff.extraProperties.length > 0 ||
      diff.missingSubobjects.length > 0 ||
      diff.extraSubobjects.length > 0 ||
      diff.missingResources.length > 0 ||
      diff.extraResources.length > 0

    if (!hasChanges) {
      console.log(`  ${moduleId}: up to date`)
      continue
    }

    updatedCount++
    console.log(`  ${moduleId}: needs update`)

    if (diff.missingProperties.length > 0) {
      console.log(`    + properties: ${diff.missingProperties.join(', ')}`)
    }
    if (diff.extraProperties.length > 0) {
      console.log(`    - properties: ${diff.extraProperties.join(', ')}`)
    }
    if (diff.missingSubobjects.length > 0) {
      console.log(`    + subobjects: ${diff.missingSubobjects.join(', ')}`)
    }
    if (diff.extraSubobjects.length > 0) {
      console.log(`    - subobjects: ${diff.extraSubobjects.join(', ')}`)
    }
    if (diff.missingResources.length > 0) {
      console.log(`    + resources: ${diff.missingResources.join(', ')}`)
    }
    if (diff.extraResources.length > 0) {
      console.log(`    - resources: ${diff.extraResources.join(', ')}`)
    }

    if (!dryRun) {
      const filePath = moduleEntity._filePath || `modules/${moduleId}.json`
      const absolutePath = path.resolve(filePath)
      const content = JSON.parse(fs.readFileSync(absolutePath, 'utf8'))

      content.properties = resolved.properties
      content.subobjects = resolved.subobjects
      content.resources = resolved.resources

      fs.writeFileSync(absolutePath, JSON.stringify(content, null, 2) + '\n', 'utf8')
    }
  }

  console.log('')

  if (updatedCount === 0) {
    console.log('All modules are up to date.')
  } else if (dryRun) {
    console.log(`${updatedCount} module(s) would be updated. Run without --dry-run to apply.`)
  } else {
    console.log(`${updatedCount} module(s) updated.`)
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message)
  process.exit(1)
})
