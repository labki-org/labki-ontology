#!/usr/bin/env node

import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { GLOB_IGNORE_PATTERNS, BUMP_PRIORITY } from './lib/constants.js'

// Reference validation modules
import { buildEntityIndex } from './lib/entity-index.js'
import { validateReferences } from './lib/reference-validator.js'
import { validateConstraints } from './lib/constraint-validator.js'
import { findOrphanedEntities } from './lib/orphan-detector.js'
import { detectCycles } from './lib/cycle-detector.js'

// Version validation modules
import { validateVersionFormat, compareVersions, getBaseVersion } from './lib/version-validator.js'
import { detectChanges, getChangedFiles } from './lib/change-detector.js'
import { calculateVersionCascade } from './lib/version-cascade.js'

/**
 * Discover all entity files (.wikitext, .vocab.json, .json for bundles)
 * @returns {Promise<string[]>}
 */
async function discoverFiles() {
  const files = await fg(
    ['**/*.wikitext', 'modules/*.vocab.json', 'bundles/*.json'],
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

  // Validate modules have required fields
  for (const [id, entity] of entityIndex.modules) {
    if (!entity.version) {
      errors.push({
        file: entity._filePath,
        type: 'missing-field',
        message: `Module "${id}" is missing required field "version"`
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
 * Generate a markdown table for bump types
 * @param {string} title - Table title (e.g., "Module Version Bumps")
 * @param {string} entityLabel - Column header (e.g., "Module" or "Bundle")
 * @param {Object} bumps - Object mapping entity ID to bump type
 * @returns {string} Markdown table or empty string if no bumps
 */
function generateBumpTable(title, entityLabel, bumps) {
  const entries = Object.entries(bumps)
  if (entries.length === 0) {
    return ''
  }

  let md = `**${title}:**\n`
  md += `| ${entityLabel} | Bump Type |\n`
  md += '|--------|----------|\n'
  for (const [id, bump] of entries) {
    md += `| ${id} | ${bump} |\n`
  }
  md += '\n'
  return md
}

/**
 * Generate version analysis table markdown
 * @param {object} analysis - Version analysis object with prVersion, baseVersion, requiredBump, actualBump
 * @returns {string} Markdown table for version analysis
 */
function generateVersionTable(analysis) {
  let md = '| Field | Value |\n'
  md += '|-------|-------|\n'
  md += `| PR Version | ${analysis.prVersion} |\n`
  md += `| Base Version | ${analysis.baseVersion} |\n`
  md += `| Required Bump | ${analysis.requiredBump} |\n`
  md += `| Actual Bump | ${analysis.actualBump} |\n`
  return md
}

/**
 * Generate breaking changes list markdown
 * @param {Array<string>} breakingChanges - Array of breaking change reasons
 * @returns {string} Markdown list of breaking changes (empty string if none)
 */
function generateBreakingChangesList(breakingChanges) {
  if (breakingChanges.length === 0) {
    return ''
  }

  let md = '\n**Breaking Changes Detected:**\n'
  for (const reason of breakingChanges) {
    md += `- ${reason}\n`
  }
  return md
}

/**
 * Generate version cascade section markdown
 * @param {object} cascade - Cascade analysis from versionAnalysis.cascade
 * @returns {string} Markdown for cascade section (without wrapper)
 */
function generateCascadeMarkdown(cascade) {
  let md = ''
  md += generateBumpTable('Module Version Bumps', 'Module', cascade.moduleBumps)
  md += generateBumpTable('Bundle Version Bumps', 'Bundle', cascade.bundleBumps)
  md += `**Ontology Required Bump:** ${cascade.ontologyBump}\n`

  if (cascade.overrideWarnings.length > 0) {
    md += '\n**Override Warnings:**\n'
    for (const warning of cascade.overrideWarnings) {
      md += `- ${warning}\n`
    }
  }

  return md
}

/**
 * Generate PR comment markdown with collapsible sections
 * @param {Array} schemaErrors - Schema validation errors
 * @param {Array} refErrors - Reference validation errors
 * @param {Array} cycleErrors - Cycle detection errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @param {object} versionAnalysis - Version analysis results (optional)
 * @param {object} validationMode - Mode and file count info
 * @returns {string} Markdown for PR comment
 */
function generatePRComment(schemaErrors, refErrors, cycleErrors, allWarnings, totalFiles, versionAnalysis = null, validationMode = null) {
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

  // Version analysis section
  if (versionAnalysis && versionAnalysis.prVersion) {
    const versionStatus = (versionAnalysis.isValid && versionAnalysis.isIncremented) ? '\u2705' : '\u26A0\uFE0F'
    md += '<details>\n'
    md += `<summary>Version Analysis ${versionStatus}</summary>\n\n`
    md += generateVersionTable(versionAnalysis)
    md += generateBreakingChangesList(versionAnalysis.breakingChanges)
    md += '\n</details>\n\n'
  }

  // Version Cascade section
  if (versionAnalysis && versionAnalysis.cascade) {
    md += '<details>\n'
    md += '<summary>Version Cascade</summary>\n\n'
    md += generateCascadeMarkdown(versionAnalysis.cascade)
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
    'scope-violation': "Add the referenced entity's module as a dependency.",
    'missing-version': 'Create a VERSION file in the repository root with valid semver (e.g., "1.0.0").',
    'invalid-version': 'Update VERSION file to contain valid semver format: MAJOR.MINOR.PATCH (e.g., "1.0.0").',
    'version-not-incremented': 'Increment the VERSION to be greater than the base branch version.'
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
 * @param {object} versionAnalysis - Version analysis results (optional)
 * @returns {string} Markdown content
 */
function generateMarkdownSummary(allErrors, allWarnings, totalFiles, versionAnalysis = null) {
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

  // Version analysis section (if version was checked)
  if (versionAnalysis && versionAnalysis.prVersion) {
    markdown += '### Version Analysis\n\n'
    markdown += generateVersionTable(versionAnalysis)
    markdown += '\n'

    const breakingChangesMd = generateBreakingChangesList(versionAnalysis.breakingChanges)
    if (breakingChangesMd) {
      markdown += breakingChangesMd.trimStart() + '\n'
    }
  }

  // Version Cascade section
  if (versionAnalysis && versionAnalysis.cascade) {
    markdown += '### Version Cascade\n\n'
    markdown += generateCascadeMarkdown(versionAnalysis.cascade)
    markdown += '\n'
  }

  return markdown
}

/**
 * Write Job Summary for GitHub Actions
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @param {object} versionAnalysis - Version analysis results (optional)
 */
function writeJobSummary(allErrors, allWarnings, totalFiles, versionAnalysis = null) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY

  if (!summaryFile) {
    return  // Not running in GitHub Actions
  }

  const markdown = generateMarkdownSummary(allErrors, allWarnings, totalFiles, versionAnalysis)
  fs.appendFileSync(summaryFile, markdown, 'utf8')
}

/**
 * Validate VERSION file format, increment, and required bump
 * @param {object} entityIndex - Entity index for change detection
 * @returns {{errors: Array, warnings: Array, analysis: object}}
 */
function validateVersion(entityIndex) {
  const errors = []
  const warnings = []
  const analysis = {
    prVersion: null,
    baseVersion: null,
    actualBump: null,
    requiredBump: null,
    isValid: false,
    isIncremented: false,
    breakingChanges: []
  }

  // 1. Read VERSION file
  let versionContent
  try {
    versionContent = fs.readFileSync('VERSION', 'utf8')
  } catch (err) {
    errors.push({
      file: 'VERSION',
      type: 'missing-version',
      message: 'VERSION file not found in repository root'
    })
    return { errors, warnings, analysis }
  }

  // 2. Validate format
  const formatResult = validateVersionFormat(versionContent)
  if (!formatResult.valid) {
    errors.push({
      file: 'VERSION',
      type: 'invalid-version',
      message: formatResult.error
    })
    return { errors, warnings, analysis }
  }

  analysis.prVersion = versionContent.trim()
  analysis.isValid = true

  // 3. Get base version
  const baseVersion = getBaseVersion()
  analysis.baseVersion = baseVersion || '0.0.0'

  // 4. Check if version is incremented (informational only - CI auto-increments)
  if (baseVersion) {
    analysis.isIncremented = semver.gt(analysis.prVersion, baseVersion)
  } else {
    // New VERSION file, treat as incremented from 0.0.0
    analysis.isIncremented = true
  }

  // 5. Detect changes and required bump
  const { changes, requiredBump } = detectChanges(entityIndex)
  analysis.requiredBump = requiredBump

  // 6. Determine actual bump type
  analysis.actualBump = semver.diff(analysis.baseVersion, analysis.prVersion) || 'patch'

  // 7. Collect breaking changes for reporting
  analysis.breakingChanges = changes
    .filter(c => c.reason !== null)
    .map(c => c.reason)

  // 8. Compare actual vs required bump
  const actualPriority = BUMP_PRIORITY[analysis.actualBump] || 0
  const requiredPriority = BUMP_PRIORITY[analysis.requiredBump] || 0

  if (requiredPriority > actualPriority) {
    // Actual bump is insufficient for detected changes
    warnings.push({
      file: 'VERSION',
      type: 'version-bump-insufficient',
      message: `Version bump is ${analysis.actualBump}, but changes require ${analysis.requiredBump}. Breaking changes: ${analysis.breakingChanges.join(', ') || 'none detected'}`
    })
  }

  // 9. Calculate version cascade
  const baseBranch = process.env.GITHUB_BASE_REF
    ? `origin/${process.env.GITHUB_BASE_REF}`
    : 'origin/main'

  const cascadeResult = calculateVersionCascade(entityIndex, baseBranch, {
    applyOverrides: true,
    rootDir: process.cwd()
  })

  // Add cascade info to analysis (handle null/empty result)
  if (cascadeResult && cascadeResult.moduleBumps) {
    analysis.cascade = {
      moduleBumps: Object.fromEntries(cascadeResult.moduleBumps),
      bundleBumps: Object.fromEntries(cascadeResult.bundleBumps),
      ontologyBump: cascadeResult.ontologyBump,
      overrideWarnings: cascadeResult.overrideWarnings || []
    }
  } else {
    analysis.cascade = {
      moduleBumps: {},
      bundleBumps: {},
      ontologyBump: null,
      overrideWarnings: []
    }
  }

  // Add override warnings to warnings array
  for (const warning of (cascadeResult.overrideWarnings || [])) {
    warnings.push({
      file: 'VERSION_OVERRIDES.json',
      type: 'override-downgrade',
      message: warning
    })
  }

  return { errors, warnings, analysis }
}

/**
 * Main validation logic
 */
async function main() {
  try {
    // Parse command-line arguments
    const changedOnly = process.argv.includes('--changed-only')
    const outputMarkdown = process.argv.includes('--output-markdown')

    // Discover files based on mode
    let filesToValidate
    let validationMode = null

    if (changedOnly) {
      const baseBranch = process.env.GITHUB_BASE_REF
        ? `origin/${process.env.GITHUB_BASE_REF}`
        : 'origin/main'

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

    // Phase 1: Build entity index (parses all wikitext and vocab.json files)
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

    // Phase 4: Version validation
    const { errors: versionErrors, warnings: versionWarnings, analysis: versionAnalysis } = validateVersion(entityIndex)

    // Combine all errors and warnings
    const allErrors = [...schemaErrors, ...referenceErrors, ...constraintErrors, ...cycleErrors, ...versionErrors]
    const allWarnings = [...referenceWarnings, ...orphanWarnings, ...versionWarnings]

    // Get total entity count (always from full discovery for accurate reporting)
    const allFiles = await discoverFiles()

    // Format and output results
    formatConsoleOutput(allErrors, allWarnings, allFiles.length)

    // Output version analysis
    if (versionAnalysis.prVersion) {
      console.log(`\nVersion: ${versionAnalysis.prVersion} (base: ${versionAnalysis.baseVersion})`)
      console.log(`Required bump: ${versionAnalysis.requiredBump}, Actual bump: ${versionAnalysis.actualBump}`)
      if (versionAnalysis.breakingChanges.length > 0) {
        console.log(`Breaking changes detected: ${versionAnalysis.breakingChanges.length}`)
      }
    }

    // Output cascade analysis
    if (versionAnalysis.cascade) {
      const { moduleBumps, bundleBumps, ontologyBump } = versionAnalysis.cascade
      const modCount = Object.keys(moduleBumps).length
      const bundleCount = Object.keys(bundleBumps).length
      if (modCount > 0 || bundleCount > 0) {
        console.log(`Cascade: ${modCount} module(s), ${bundleCount} bundle(s) affected`)
        console.log(`Ontology bump required: ${ontologyBump}`)
      }
    }

    // Write GitHub Actions Job Summary if available
    writeJobSummary(allErrors, allWarnings, allFiles.length, versionAnalysis)

    // Write PR comment markdown if requested
    if (outputMarkdown) {
      const prComment = generatePRComment(
        schemaErrors,
        referenceErrors.concat(constraintErrors),
        cycleErrors,
        allWarnings,
        allFiles.length,
        versionAnalysis,
        validationMode
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
