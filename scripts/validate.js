#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js'
import betterAjvErrors from 'better-ajv-errors'
import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'

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

// Initialize Ajv with draft 2020-12 support
// CRITICAL: Must use ajv/dist/2020.js (not default export)
const ajv = new Ajv2020({
  allErrors: true,   // Collect all errors, not just first
  verbose: true,     // Include schema and data in errors
  strict: false      // Allow valid schemas that strict mode rejects
})

// Schema cache: compile once, reuse validators
const schemaCache = new Map()

/**
 * Load and compile a schema, caching the compiled validator
 * @param {string} schemaPath - Path to _schema.json file
 * @returns {{schema: object, validate: Function}}
 */
function loadSchema(schemaPath) {
  if (!schemaCache.has(schemaPath)) {
    const schemaContent = fs.readFileSync(schemaPath, 'utf8')
    const schema = JSON.parse(schemaContent)
    const validate = ajv.compile(schema)

    schemaCache.set(schemaPath, {
      schema,
      validate
    })
  }

  return schemaCache.get(schemaPath)
}

/**
 * Discover all entity JSON files
 * @returns {Promise<string[]>}
 */
async function discoverFiles() {
  const files = await fg(
    ['**/*.json'],
    {
      ignore: [
        '**/_schema.json',
        '**/node_modules/**',
        '**/versions/**',  // Exclude generated version artifacts
        'package*.json',
        '.planning/**',
        '.claude/**',
        '.**/**',  // Exclude all dot directories
        'VERSION_OVERRIDES.schema.json'
      ],
      absolute: false,
      onlyFiles: true
    }
  )

  return files.sort()  // Deterministic output
}

/**
 * Find the _schema.json file for an entity
 * Searches the immediate directory and parent directories
 * @param {string} filePath - Path to entity JSON file (can be relative or absolute)
 * @returns {string|null} Path to _schema.json or null if not found
 */
function findSchemaPath(filePath) {
  // Resolve to absolute path
  const absolutePath = path.resolve(filePath)
  let currentDir = path.dirname(absolutePath)
  const root = process.cwd()

  // Search upward from entity directory, but don't go above project root
  while (currentDir.startsWith(root) || currentDir === root) {
    const schemaPath = path.join(currentDir, '_schema.json')
    if (fs.existsSync(schemaPath)) {
      return schemaPath
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) {
      break  // Reached filesystem root
    }
    currentDir = parentDir
  }

  return null
}

/**
 * Validate a single entity file
 * @param {string} filePath - Path to entity JSON file
 * @returns {Array} Array of error objects (empty if valid)
 */
function validateFile(filePath) {
  const errors = []

  // Find schema path (searches upward from entity directory)
  const schemaPath = findSchemaPath(filePath)

  // Check schema exists
  if (!schemaPath) {
    errors.push({
      file: filePath,
      type: 'no-schema',
      message: `No _schema.json found in ${path.dirname(filePath)} or parent directories`
    })
    return errors
  }

  // Parse JSON (catch parse errors with context)
  let data
  let fileContent
  try {
    fileContent = fs.readFileSync(filePath, 'utf8')
    data = JSON.parse(fileContent)
  } catch (parseError) {
    errors.push({
      file: filePath,
      type: 'parse',
      message: `JSON parse error: ${parseError.message}`
    })
    return errors
  }

  // Validate against schema
  const { schema, validate } = loadSchema(schemaPath)
  const valid = validate(data)

  if (!valid) {
    // CRITICAL: Copy errors immediately (validate.errors gets overwritten)
    const validationErrors = [...validate.errors]

    // Format with better-ajv-errors
    const output = betterAjvErrors(
      schema,
      data,
      validationErrors,
      { format: 'cli', indent: 2 }
    )

    errors.push({
      file: filePath,
      type: 'schema',
      message: 'Schema validation failed',
      output: output || validationErrors.map(e => `  ${e.instancePath} ${e.message}`).join('\n')
    })
  }

  // Check id matches filename (without .json)
  // For nested files (e.g., templates/Property/Page.json),
  // the id should be the relative path from the schema directory
  const schemaDir = path.dirname(schemaPath)
  const relativePath = path.relative(schemaDir, filePath)
  const expectedId = relativePath.replace(/\.json$/, '').replace(/\\/g, '/')

  if (data.id !== expectedId) {
    errors.push({
      file: filePath,
      type: 'id-mismatch',
      message: `ID "${data.id}" doesn't match expected "${expectedId}" (derived from file path relative to schema directory)`
    })
  }

  return errors
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

    // Group errors by file
    const errorsByFile = {}
    for (const error of allErrors) {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = []
      }
      errorsByFile[error.file].push(error)
    }

    // Print each file's errors
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
      // Group warnings by file for local console
      const warningsByFile = {}
      for (const warning of allWarnings) {
        if (!warningsByFile[warning.file]) {
          warningsByFile[warning.file] = []
        }
        warningsByFile[warning.file].push(warning)
      }

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

  let md = `## ${emoji} Schema Validation ${status}\n\n`
  md += `Validated ${totalFiles} entities`
  if (validationMode && validationMode.mode === 'changed') {
    md += ` (${validationMode.changedCount} changed)`
  }
  md += '\n\n'

  // Schema validation section
  md += '<details>\n'
  md += `<summary>Schema Validation ${schemaErrors.length === 0 ? '\u2705' : '\u274C'}</summary>\n\n`
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
    md += '| Field | Value |\n'
    md += '|-------|-------|\n'
    md += `| PR Version | ${versionAnalysis.prVersion} |\n`
    md += `| Base Version | ${versionAnalysis.baseVersion} |\n`
    md += `| Required Bump | ${versionAnalysis.requiredBump} |\n`
    md += `| Actual Bump | ${versionAnalysis.actualBump} |\n`

    if (versionAnalysis.breakingChanges.length > 0) {
      md += '\n**Breaking Changes Detected:**\n'
      for (const reason of versionAnalysis.breakingChanges) {
        md += `- ${reason}\n`
      }
    }
    md += '\n</details>\n\n'
  }

  // Version Cascade section
  if (versionAnalysis && versionAnalysis.cascade) {
    const cascade = versionAnalysis.cascade
    md += '<details>\n'
    md += '<summary>Version Cascade</summary>\n\n'

    // Module bumps table
    const moduleBumps = Object.entries(cascade.moduleBumps)
    if (moduleBumps.length > 0) {
      md += '**Module Version Bumps:**\n'
      md += '| Module | Bump Type |\n'
      md += '|--------|----------|\n'
      for (const [mod, bump] of moduleBumps) {
        md += `| ${mod} | ${bump} |\n`
      }
      md += '\n'
    }

    // Bundle bumps table
    const bundleBumps = Object.entries(cascade.bundleBumps)
    if (bundleBumps.length > 0) {
      md += '**Bundle Version Bumps:**\n'
      md += '| Bundle | Bump Type |\n'
      md += '|--------|----------|\n'
      for (const [bundle, bump] of bundleBumps) {
        md += `| ${bundle} | ${bump} |\n`
      }
      md += '\n'
    }

    md += `**Ontology Required Bump:** ${cascade.ontologyBump}\n`

    // Override warnings
    if (cascade.overrideWarnings.length > 0) {
      md += '\n**Override Warnings:**\n'
      for (const warning of cascade.overrideWarnings) {
        md += `- ${warning}\n`
      }
    }

    md += '\n</details>\n\n'
  }

  return md
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

    // Group errors by file
    const errorsByFile = {}
    for (const error of allErrors) {
      if (!errorsByFile[error.file]) {
        errorsByFile[error.file] = []
      }
      errorsByFile[error.file].push(error)
    }

    // Document each file's errors
    for (const [file, fileErrors] of Object.entries(errorsByFile)) {
      markdown += `#### \`${file}\`\n\n`

      for (const error of fileErrors) {
        markdown += `**Type:** ${error.type}\n\n`

        if (error.output) {
          markdown += '```\n' + error.output + '\n```\n\n'
        } else {
          markdown += `**Error:** ${error.message}\n\n`
        }

        // Add suggestions for common issues
        if (error.type === 'id-mismatch') {
          markdown += `**Suggestion:** Rename the file to match the id, or update the id field to match the filename.\n\n`
        } else if (error.type === 'no-schema') {
          markdown += `**Suggestion:** Create a _schema.json file in the same directory as this entity.\n\n`
        } else if (error.type === 'parse') {
          markdown += `**Suggestion:** Check for syntax errors (trailing commas, missing quotes, invalid escape sequences).\n\n`
        } else if (error.type === 'missing-reference') {
          markdown += `**Suggestion:** Create the referenced entity or fix the reference.\n\n`
        } else if (error.type === 'property-conflict' || error.type === 'subobject-conflict') {
          markdown += `**Suggestion:** Remove the item from either required or optional list (not both).\n\n`
        } else if (error.type === 'scope-violation') {
          markdown += `**Suggestion:** Add the referenced entity's module as a dependency.\n\n`
        } else if (error.type.startsWith('circular-')) {
          markdown += `**Suggestion:** Break the cycle by removing one of the references in the chain.\n\n`
        } else if (error.type === 'missing-version') {
          markdown += `**Suggestion:** Create a VERSION file in the repository root with valid semver (e.g., "1.0.0").\n\n`
        } else if (error.type === 'invalid-version') {
          markdown += `**Suggestion:** Update VERSION file to contain valid semver format: MAJOR.MINOR.PATCH (e.g., "1.0.0").\n\n`
        } else if (error.type === 'version-not-incremented') {
          markdown += `**Suggestion:** Increment the VERSION to be greater than the base branch version.\n\n`
        }
      }
    }
  }

  // Warnings section
  if (hasWarnings) {
    markdown += '### Warnings\n\n'

    const warningsByFile = {}
    for (const warning of allWarnings) {
      if (!warningsByFile[warning.file]) {
        warningsByFile[warning.file] = []
      }
      warningsByFile[warning.file].push(warning)
    }

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
    markdown += '| Field | Value |\n'
    markdown += '|-------|-------|\n'
    markdown += `| PR Version | ${versionAnalysis.prVersion} |\n`
    markdown += `| Base Version | ${versionAnalysis.baseVersion} |\n`
    markdown += `| Required Bump | ${versionAnalysis.requiredBump} |\n`
    markdown += `| Actual Bump | ${versionAnalysis.actualBump} |\n`
    markdown += '\n'

    if (versionAnalysis.breakingChanges.length > 0) {
      markdown += '**Breaking Changes Detected:**\n'
      for (const reason of versionAnalysis.breakingChanges) {
        markdown += `- ${reason}\n`
      }
      markdown += '\n'
    }
  }

  // Version Cascade section
  if (versionAnalysis && versionAnalysis.cascade) {
    const cascade = versionAnalysis.cascade
    markdown += '### Version Cascade\n\n'

    // Module bumps table
    const moduleBumps = Object.entries(cascade.moduleBumps)
    if (moduleBumps.length > 0) {
      markdown += '**Module Version Bumps:**\n'
      markdown += '| Module | Bump Type |\n'
      markdown += '|--------|----------|\n'
      for (const [mod, bump] of moduleBumps) {
        markdown += `| ${mod} | ${bump} |\n`
      }
      markdown += '\n'
    }

    // Bundle bumps table
    const bundleBumps = Object.entries(cascade.bundleBumps)
    if (bundleBumps.length > 0) {
      markdown += '**Bundle Version Bumps:**\n'
      markdown += '| Bundle | Bump Type |\n'
      markdown += '|--------|----------|\n'
      for (const [bundle, bump] of bundleBumps) {
        markdown += `| ${bundle} | ${bump} |\n`
      }
      markdown += '\n'
    }

    markdown += `**Ontology Required Bump:** ${cascade.ontologyBump}\n\n`

    // Override warnings
    if (cascade.overrideWarnings.length > 0) {
      markdown += '**Override Warnings:**\n'
      for (const warning of cascade.overrideWarnings) {
        markdown += `- ${warning}\n`
      }
      markdown += '\n'
    }
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

  // 4. Compare versions (if base exists)
  if (baseVersion) {
    const compareResult = compareVersions(analysis.prVersion, baseVersion)
    if (!compareResult.valid) {
      errors.push({
        file: 'VERSION',
        type: 'version-not-incremented',
        message: compareResult.error
      })
      return { errors, warnings, analysis }
    }
    analysis.isIncremented = true
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
  const bumpPriority = { major: 3, minor: 2, patch: 1, null: 0 }
  const actualPriority = bumpPriority[analysis.actualBump] || 0
  const requiredPriority = bumpPriority[analysis.requiredBump] || 0

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

    // Phase 1: Schema validation - collect all errors (uses selected files)
    const schemaErrors = []
    for (const file of filesToValidate) {
      const fileErrors = validateFile(file)
      schemaErrors.push(...fileErrors)
    }

    // Phase 2: Reference validation (only if schema validation passed for all files)
    // Build entity index once for all reference checks
    const entityIndex = await buildEntityIndex()

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
