#!/usr/bin/env node

import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import { GLOB_IGNORE_PATTERNS } from './lib/constants.js'

// Reference validation modules
import { buildEntityIndex } from './lib/entity-index.js'
import { validateReferences } from './lib/reference-validator.js'
import { validateConstraints } from './lib/constraint-validator.js'
import { findOrphanedEntities } from './lib/orphan-detector.js'
import { detectCycles } from './lib/cycle-detector.js'

// Change detection
import { detectChanges, getChangedFiles } from './lib/change-detector.js'

/**
 * Discover all entity files (.wikitext, .json for modules/bundles)
 * @returns {Promise<string[]>}
 */
async function discoverFiles() {
  const files = await fg(
    ['**/*.wikitext', 'modules/*.json', 'bundles/*.json'],
    {
      ignore: GLOB_IGNORE_PATTERNS,
      absolute: false,
      onlyFiles: true
    }
  )

  return files.sort()  // Deterministic output
}

/**
 * Validate entity files using the entity index (structural validation).
 *
 * With wikitext format, we no longer use JSON Schema. Instead, we validate
 * the parsed entities from the entity index for required fields and
 * correct structure.
 *
 * @param {Object} entityIndex - Entity index from buildEntityIndex()
 * @returns {Array} Array of error objects
 */
function validateEntities(entityIndex) {
  const errors = []

  // Validate properties have required fields
  for (const [id, entity] of entityIndex.properties) {
    if (!entity.datatype) {
      errors.push({
        file: entity._filePath,
        type: 'missing-field',
        message: `Property "${id}" is missing required field "datatype" (Has type annotation)`
      })
    }
  }

  // Validate bundles have required fields
  for (const [id, entity] of entityIndex.bundles) {
    if (!entity.modules || entity.modules.length === 0) {
      errors.push({
        file: entity._filePath,
        type: 'missing-field',
        message: `Bundle "${id}" must have at least one module`
      })
    }
  }

  return errors
}

/**
 * Group items by their file property
 * @param {Array} items - Array of items with file property
 * @returns {Object} Items grouped by file path
 */
function groupByFile(items) {
  const grouped = {}
  for (const item of items) {
    if (!grouped[item.file]) {
      grouped[item.file] = []
    }
    grouped[item.file].push(item)
  }
  return grouped
}

/**
 * Format errors and warnings for console output
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 */
function formatConsoleOutput(allErrors, allWarnings, totalFiles) {
  const hasErrors = allErrors.length > 0
  const hasWarnings = allWarnings.length > 0

  // Print errors first
  if (hasErrors) {
    const uniqueErrorFiles = new Set(allErrors.map(e => e.file)).size
    console.error(`\n\u274C Found ${allErrors.length} error(s) in ${uniqueErrorFiles} file(s) (out of ${totalFiles} total)\n`)

    const errorsByFile = groupByFile(allErrors)

    for (const [file, fileErrors] of Object.entries(errorsByFile)) {
      console.error(`\n\uD83D\uDCC4 ${file}`)

      for (const error of fileErrors) {
        console.error(`\n   Type: ${error.type}`)

        if (error.output) {
          console.error(error.output)
        } else {
          console.error(`   ${error.message}`)
        }
      }
    }

    console.error('') // Newline after errors
  }

  // Print warnings (separate section)
  if (hasWarnings) {
    const uniqueWarningFiles = new Set(allWarnings.map(w => w.file)).size
    console.warn(`\n\u26A0\uFE0F  Found ${allWarnings.length} warning(s) in ${uniqueWarningFiles} file(s)\n`)

    // Emit GitHub Actions annotations for warnings
    if (process.env.GITHUB_ACTIONS) {
      for (const warning of allWarnings) {
        console.log(`::warning file=${warning.file},title=${warning.type}::${warning.message}`)
      }
    } else {
      const warningsByFile = groupByFile(allWarnings)

      for (const [file, fileWarnings] of Object.entries(warningsByFile)) {
        console.warn(`   ${file}`)
        for (const warning of fileWarnings) {
          console.warn(`      - ${warning.message}`)
        }
      }
    }

    console.warn('') // Newline after warnings
  }

  // Success message (only if no errors)
  if (!hasErrors) {
    if (hasWarnings) {
      console.log(`\u2705 All ${totalFiles} file(s) validated successfully (with ${allWarnings.length} warning(s))`)
    } else {
      console.log(`\u2705 All ${totalFiles} file(s) validated successfully`)
    }
  }
}

/**
 * Generate change summary markdown
 * @param {Array} changes - Change objects from detectChanges
 * @param {string} maxImpact - Maximum impact level
 * @param {Object} entityIndex - Entity index for membership lookups
 * @returns {string} Markdown summary
 */
function generateChangeSummary(changes, maxImpact, entityIndex) {
  if (changes.length === 0) return ''

  const added = changes.filter(c => c.status === 'added')
  const modified = changes.filter(c => c.status === 'modified')
  const deleted = changes.filter(c => c.status === 'deleted')

  let md = '### Change Summary\n\n'

  if (added.length > 0) {
    md += '**Added pages:**\n'
    for (const c of added) {
      md += `- \`${c.file}\` (impact: ${c.impact})\n`
    }
    md += '\n'
  }

  if (modified.length > 0) {
    md += '**Modified pages:**\n'
    for (const c of modified) {
      const detail = c.reason ? ` - ${c.reason}` : ''
      md += `- \`${c.file}\` (impact: ${c.impact})${detail}\n`
    }
    md += '\n'
  }

  if (deleted.length > 0) {
    md += '**Deleted pages:**\n'
    for (const c of deleted) {
      md += `- \`${c.file}\` (impact: ${c.impact})\n`
    }
    md += '\n'
  }

  // Module/bundle membership changes
  const moduleChanges = changes.filter(c => c.entityType === 'modules')
  const bundleChanges = changes.filter(c => c.entityType === 'bundles')
  if (moduleChanges.length > 0 || bundleChanges.length > 0) {
    md += '**Membership changes:**\n'
    for (const c of moduleChanges) {
      md += `- Module \`${c.file}\` ${c.status}\n`
    }
    for (const c of bundleChanges) {
      md += `- Bundle \`${c.file}\` ${c.status}\n`
    }
    md += '\n'
  }

  // Warning count for major changes
  const majorChanges = changes.filter(c => c.impact === 'major')
  if (majorChanges.length > 0) {
    md += `> **Warning:** ${majorChanges.length} breaking change(s) detected (impact: major)\n\n`
  }

  md += `**Max impact:** ${maxImpact}\n`

  return md
}

/**
 * Generate PR comment markdown with collapsible sections
 * @param {Array} schemaErrors - Schema validation errors
 * @param {Array} refErrors - Reference validation errors
 * @param {Array} cycleErrors - Cycle detection errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @param {object} validationMode - Mode and file count info
 * @param {string} changeSummaryMd - Change summary markdown (optional)
 * @returns {string} Markdown for PR comment
 */
function generatePRComment(schemaErrors, refErrors, cycleErrors, allWarnings, totalFiles, validationMode = null, changeSummaryMd = '') {
  const allErrors = [...schemaErrors, ...refErrors, ...cycleErrors]
  const hasAnyError = allErrors.length > 0
  const status = hasAnyError ? 'FAIL' : 'PASS'
  const emoji = hasAnyError ? '\u274C' : '\u2705'

  let md = `## ${emoji} Entity Validation ${status}\n\n`
  md += `Validated ${totalFiles} entities`
  if (validationMode && validationMode.mode === 'changed') {
    md += ` (${validationMode.changedCount} changed)`
  }
  md += '\n\n'

  // Schema validation section
  md += '<details>\n'
  md += `<summary>Entity Validation ${schemaErrors.length === 0 ? '\u2705' : '\u274C'}</summary>\n\n`
  if (schemaErrors.length === 0) {
    md += 'All files passed schema validation.\n'
  } else {
    for (const err of schemaErrors) {
      md += `- \`${err.file}\`: ${err.message}\n`
      if (err.output) {
        md += '```\n' + err.output + '\n```\n'
      }
    }
  }
  md += '\n</details>\n\n'

  // Reference integrity section
  md += '<details>\n'
  md += `<summary>Reference Integrity ${refErrors.length === 0 ? '\u2705' : '\u274C'}</summary>\n\n`
  if (refErrors.length === 0) {
    md += 'All references resolve correctly.\n'
  } else {
    for (const err of refErrors) {
      md += `- \`${err.file}\`: ${err.message}\n`
    }
  }
  md += '\n</details>\n\n'

  // Cycle detection section
  md += '<details>\n'
  md += `<summary>Cycle Detection ${cycleErrors.length === 0 ? '\u2705' : '\u274C'}</summary>\n\n`
  if (cycleErrors.length === 0) {
    md += 'No circular dependencies detected.\n'
  } else {
    for (const err of cycleErrors) {
      md += `- \`${err.file}\`: ${err.message}\n`
    }
  }
  md += '\n</details>\n\n'

  // Change summary section
  if (changeSummaryMd) {
    md += '<details>\n'
    md += '<summary>Change Summary</summary>\n\n'
    md += changeSummaryMd
    md += '\n</details>\n\n'
  }

  return md
}

/**
 * Get suggestion text for an error type
 * @param {string} errorType - The error type
 * @returns {string|null} Suggestion text or null if no suggestion
 */
function getErrorSuggestion(errorType) {
  const suggestions = {
    'missing-field': 'Add the missing annotation to the wikitext file.',
    'missing-reference': 'Create the referenced entity or fix the reference.',
    'property-conflict': 'Remove the item from either required or optional list (not both).',
    'subobject-conflict': 'Remove the item from either required or optional list (not both).',
    'incomplete-module-properties': 'Run `npm run sync-modules` to auto-update module property and subobject lists.',
    'incomplete-module-subobjects': 'Run `npm run sync-modules` to auto-update module property and subobject lists.',
    'incomplete-module-resources': 'Run `npm run sync-modules` to auto-update module resource lists.',
  }

  if (suggestions[errorType]) {
    return suggestions[errorType]
  }

  // Handle circular-* error types
  if (errorType.startsWith('circular-')) {
    return 'Break the cycle by removing one of the references in the chain.'
  }

  return null
}

/**
 * Generate markdown summary for GitHub Actions Job Summary
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @param {string} changeSummaryMd - Change summary markdown (optional)
 * @returns {string} Markdown content
 */
function generateMarkdownSummary(allErrors, allWarnings, totalFiles, changeSummaryMd = '') {
  const hasErrors = allErrors.length > 0
  const hasWarnings = allWarnings.length > 0

  let markdown = ''

  // Overall status header
  if (!hasErrors) {
    markdown += `## \u2705 Validation Passed\n\n`
    markdown += `**${totalFiles} file(s)** validated successfully`
    if (hasWarnings) {
      markdown += ` (with ${allWarnings.length} warning(s))`
    }
    markdown += '\n\n'
  } else {
    const uniqueErrorFiles = new Set(allErrors.map(e => e.file)).size
    markdown += '## \u274C Validation Failed\n\n'
    markdown += `**${allErrors.length} error(s)** found in **${uniqueErrorFiles} file(s)** (out of ${totalFiles} total)\n\n`
  }

  // Errors section
  if (hasErrors) {
    markdown += '### Errors\n\n'

    const errorsByFile = groupByFile(allErrors)

    for (const [file, fileErrors] of Object.entries(errorsByFile)) {
      markdown += `#### \`${file}\`\n\n`

      for (const error of fileErrors) {
        markdown += `**Type:** ${error.type}\n\n`

        if (error.output) {
          markdown += '```\n' + error.output + '\n```\n\n'
        } else {
          markdown += `**Error:** ${error.message}\n\n`
        }

        const suggestion = getErrorSuggestion(error.type)
        if (suggestion) {
          markdown += `**Suggestion:** ${suggestion}\n\n`
        }
      }
    }
  }

  // Warnings section
  if (hasWarnings) {
    markdown += '### Warnings\n\n'

    const warningsByFile = groupByFile(allWarnings)

    for (const [file, fileWarnings] of Object.entries(warningsByFile)) {
      markdown += `- \`${file}\`\n`
      for (const warning of fileWarnings) {
        markdown += `  - ${warning.message}\n`
      }
    }
    markdown += '\n'
  }

  // Change summary section
  if (changeSummaryMd) {
    markdown += changeSummaryMd + '\n'
  }

  return markdown
}

/**
 * Write Job Summary for GitHub Actions
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @param {string} changeSummaryMd - Change summary markdown (optional)
 */
function writeJobSummary(allErrors, allWarnings, totalFiles, changeSummaryMd = '') {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY

  if (!summaryFile) {
    return  // Not running in GitHub Actions
  }

  const markdown = generateMarkdownSummary(allErrors, allWarnings, totalFiles, changeSummaryMd)
  fs.appendFileSync(summaryFile, markdown, 'utf8')
}

/**
 * Main validation logic
 */
async function main() {
  try {
    // Parse command-line arguments
    const changedOnly = process.argv.includes('--changed-only')
    const outputMarkdown = process.argv.includes('--output-markdown')

    const baseBranch = process.env.GITHUB_BASE_REF
      ? `origin/${process.env.GITHUB_BASE_REF}`
      : 'origin/main'

    // Discover files based on mode
    let filesToValidate
    let validationMode = null

    if (changedOnly) {
      const changedFiles = getChangedFiles(baseBranch)

      if (changedFiles.length === 0) {
        console.log('No entity files changed, running full validation')
        filesToValidate = await discoverFiles()
        validationMode = { mode: 'full', changedCount: 0 }
      } else {
        console.log(`Diff-based validation: ${changedFiles.length} changed files`)
        filesToValidate = changedFiles
        validationMode = { mode: 'changed', changedCount: changedFiles.length }
      }
    } else {
      filesToValidate = await discoverFiles()
      console.log(`Full validation: ${filesToValidate.length} files`)
      validationMode = { mode: 'full', changedCount: 0 }
    }

    if (filesToValidate.length === 0) {
      console.log('No entity files found to validate')
      process.exit(0)
    }

    console.log(`Validating ${filesToValidate.length} file(s)...\n`)

    // Phase 1: Build entity index (parses all wikitext and JSON files)
    const entityIndex = await buildEntityIndex()

    // Phase 1b: Structural validation (required fields, etc.)
    const schemaErrors = validateEntities(entityIndex)

    // Run reference validation
    const { errors: referenceErrors, warnings: referenceWarnings } = validateReferences(entityIndex)

    // Run constraint validation
    const { errors: constraintErrors } = validateConstraints(entityIndex)

    // Run orphan detection (warnings only)
    const { warnings: orphanWarnings } = findOrphanedEntities(entityIndex)

    // Phase 3: Cycle detection
    const { errors: cycleErrors } = detectCycles(entityIndex)

    // Combine all errors and warnings
    const allErrors = [...schemaErrors, ...referenceErrors, ...constraintErrors, ...cycleErrors]
    const allWarnings = [...referenceWarnings, ...orphanWarnings]

    // Get total entity count (always from full discovery for accurate reporting)
    const allFiles = await discoverFiles()

    // Format and output results
    formatConsoleOutput(allErrors, allWarnings, allFiles.length)

    // Change summary for PR mode
    let changeSummaryMd = ''
    if (changedOnly) {
      const { changes, maxImpact } = detectChanges(entityIndex, baseBranch)
      if (changes.length > 0) {
        changeSummaryMd = generateChangeSummary(changes, maxImpact, entityIndex)
        console.log(`\nChange summary: ${changes.length} change(s), max impact: ${maxImpact}`)
        const majorCount = changes.filter(c => c.impact === 'major').length
        if (majorCount > 0) {
          console.log(`Warning: ${majorCount} breaking change(s) detected`)
        }
      }
    }

    // Write GitHub Actions Job Summary if available
    writeJobSummary(allErrors, allWarnings, allFiles.length, changeSummaryMd)

    // Write PR comment markdown if requested
    if (outputMarkdown) {
      const prComment = generatePRComment(
        schemaErrors,
        referenceErrors.concat(constraintErrors),
        cycleErrors,
        allWarnings,
        allFiles.length,
        validationMode,
        changeSummaryMd
      )
      fs.writeFileSync('validation-results.md', prComment, 'utf8')
      console.log('\nPR comment markdown written to validation-results.md')
    }

    // Exit with appropriate code (errors fail, warnings don't)
    const hasErrors = allErrors.length > 0
    process.exit(hasErrors ? 1 : 0)

  } catch (error) {
    console.error('Fatal error during validation:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
