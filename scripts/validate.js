#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js'
import betterAjvErrors from 'better-ajv-errors'
import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'

// Reference validation modules
import { buildEntityIndex } from './lib/entity-index.js'
import { validateReferences } from './lib/reference-validator.js'
import { validateConstraints } from './lib/constraint-validator.js'
import { findOrphanedEntities } from './lib/orphan-detector.js'

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
        'package*.json',
        '.planning/**',
        '.claude/**',
        '.**/**'  // Exclude all dot directories
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
 * Generate markdown summary for GitHub Actions Job Summary
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 * @returns {string} Markdown content
 */
function generateMarkdownSummary(allErrors, allWarnings, totalFiles) {
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

  return markdown
}

/**
 * Write Job Summary for GitHub Actions
 * @param {Array} allErrors - All validation errors
 * @param {Array} allWarnings - All validation warnings
 * @param {number} totalFiles - Total files validated
 */
function writeJobSummary(allErrors, allWarnings, totalFiles) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY

  if (!summaryFile) {
    return  // Not running in GitHub Actions
  }

  const markdown = generateMarkdownSummary(allErrors, allWarnings, totalFiles)
  fs.appendFileSync(summaryFile, markdown, 'utf8')
}

/**
 * Main validation logic
 */
async function main() {
  try {
    // Discover all entity files
    const files = await discoverFiles()

    if (files.length === 0) {
      console.log('No entity files found to validate')
      process.exit(0)
    }

    console.log(`Validating ${files.length} file(s)...\n`)

    // Phase 1: Schema validation - collect all errors
    const schemaErrors = []
    for (const file of files) {
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

    // Combine all errors and warnings
    const allErrors = [...schemaErrors, ...referenceErrors, ...constraintErrors]
    const allWarnings = [...referenceWarnings, ...orphanWarnings]

    // Format and output results
    formatConsoleOutput(allErrors, allWarnings, files.length)

    // Write GitHub Actions Job Summary if available
    writeJobSummary(allErrors, allWarnings, files.length)

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
