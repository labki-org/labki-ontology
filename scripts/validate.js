#!/usr/bin/env node

import Ajv2020 from 'ajv/dist/2020.js'
import betterAjvErrors from 'better-ajv-errors'
import fg from 'fast-glob'
import fs from 'node:fs'
import path from 'node:path'

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
 * Format errors for console output
 * @param {Array} allErrors - All validation errors
 * @param {number} totalFiles - Total files validated
 */
function formatConsoleOutput(allErrors, totalFiles) {
  if (allErrors.length === 0) {
    console.log(`✅ All ${totalFiles} file(s) validated successfully`)
    return
  }

  const uniqueFiles = new Set(allErrors.map(e => e.file)).size
  console.error(`\n❌ Found ${allErrors.length} error(s) in ${uniqueFiles} file(s) (out of ${totalFiles} total)\n`)

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
    console.error(`\n📄 ${file}`)

    for (const error of fileErrors) {
      console.error(`\n   Type: ${error.type}`)

      if (error.output) {
        console.error(error.output)
      } else {
        console.error(`   ${error.message}`)
      }
    }
  }

  console.error('') // Final newline
}

/**
 * Generate markdown summary for GitHub Actions Job Summary
 * @param {Array} allErrors - All validation errors
 * @param {number} totalFiles - Total files validated
 * @returns {string} Markdown content
 */
function generateMarkdownSummary(allErrors, totalFiles) {
  if (allErrors.length === 0) {
    return `## ✅ Schema Validation Passed\n\n**${totalFiles} file(s)** validated successfully\n`
  }

  const uniqueFiles = new Set(allErrors.map(e => e.file)).size

  let markdown = '## ❌ Schema Validation Failed\n\n'
  markdown += `**${allErrors.length} error(s)** found in **${uniqueFiles} file(s)** (out of ${totalFiles} total)\n\n`

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
    markdown += `### \`${file}\`\n\n`

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
      }
    }
  }

  return markdown
}

/**
 * Write Job Summary for GitHub Actions
 * @param {Array} allErrors - All validation errors
 * @param {number} totalFiles - Total files validated
 */
function writeJobSummary(allErrors, totalFiles) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY

  if (!summaryFile) {
    return  // Not running in GitHub Actions
  }

  const markdown = generateMarkdownSummary(allErrors, totalFiles)
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

    // Validate each file, collecting all errors
    const allErrors = []
    for (const file of files) {
      const fileErrors = validateFile(file)
      allErrors.push(...fileErrors)
    }

    // Format and output results
    formatConsoleOutput(allErrors, files.length)

    // Write GitHub Actions Job Summary if available
    writeJobSummary(allErrors, files.length)

    // Exit with appropriate code
    process.exit(allErrors.length > 0 ? 1 : 0)

  } catch (error) {
    console.error('Fatal error during validation:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
