import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { detailedDiff } from 'deep-object-diff'
import { ENTITY_TYPES_SET } from './constants.js'
import { parseFilePath, parseCategory, parseProperty, parseSubobject, parseTemplate, parseResource } from './wikitext-parser.js'

/**
 * Get list of changed files between base branch and HEAD
 *
 * @param {string} baseBranch - Base branch reference (e.g., 'origin/main')
 * @returns {string[]} Array of changed file paths (filtered to entity directories)
 *
 * @example
 * getChangedFiles('origin/main')
 * // ['properties/Name.json', 'categories/Equipment.json']
 */
export function getChangedFiles(baseBranch = 'origin/main') {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${baseBranch}...HEAD`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })

    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter(filePath => {
        const firstSegment = filePath.split('/')[0]
        // Include entity files: .wikitext, .json (modules and bundles)
        return ENTITY_TYPES_SET.has(firstSegment) &&
               (filePath.endsWith('.wikitext') ||
                (filePath.endsWith('.json') && (firstSegment === 'modules' || firstSegment === 'bundles')))
      })
  } catch (err) {
    // No changes or git error
    return []
  }
}

/**
 * Get entity content from base branch
 *
 * @param {string} filePath - Relative path to entity file
 * @param {string} baseBranch - Base branch reference
 * @returns {object|null} Parsed entity or null if doesn't exist on base
 *
 * @example
 * getBaseEntity('properties/Name.json', 'origin/main')
 * // { id: 'Name', datatype: 'Text', ... } or null
 */
export function getBaseEntity(filePath, baseBranch = 'origin/main') {
  try {
    const content = execFileSync('git', ['show', `${baseBranch}:${filePath}`], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    })
    return parseEntityContent(filePath, content)
  } catch (err) {
    // File doesn't exist on base
    return null
  }
}

/**
 * Get entity content from current working directory (PR state)
 *
 * @param {string} filePath - Relative path to entity file
 * @param {string} rootDir - Root directory (defaults to cwd)
 * @returns {object|null} Parsed entity or null if doesn't exist
 */
function getPrEntity(filePath, rootDir = process.cwd()) {
  try {
    const absolutePath = path.join(rootDir, filePath)
    const content = fs.readFileSync(absolutePath, 'utf8')
    return parseEntityContent(filePath, content)
  } catch (err) {
    // File doesn't exist in PR (deleted)
    return null
  }
}

/**
 * Wikitext parsers by directory name
 */
const WIKITEXT_PARSERS = {
  categories: parseCategory,
  properties: parseProperty,
  subobjects: parseSubobject,
  templates: parseTemplate,
  resources: parseResource,
}

/**
 * Parse file content based on file path (wikitext or JSON)
 */
function parseEntityContent(filePath, content) {
  const parsed = parseFilePath(filePath)
  if (!parsed) return JSON.parse(content)

  if (parsed.fileType === 'wikitext') {
    const parser = WIKITEXT_PARSERS[parsed.entityType]
    return parser ? parser(content, parsed.entityKey) : null
  }
  // Plain JSON (modules and bundles)
  return JSON.parse(content)
}

/**
 * Detect if entity change is breaking and determine change type
 *
 * @param {string} entityType - Entity type ('properties', 'categories', etc.)
 * @param {object|null} baseEntity - Entity from base branch (null if new)
 * @param {object|null} prEntity - Entity from PR (null if deleted)
 * @returns {{isBreaking: boolean, changeType: 'major'|'minor'|'patch', reason: string|null}}
 *
 * @example
 * detectBreakingChange('properties', baseEntity, prEntity)
 * // { isBreaking: true, changeType: 'major', reason: 'datatype changed' }
 */
export function detectBreakingChange(entityType, baseEntity, prEntity) {
  // Deletion is always breaking (major)
  if (baseEntity && !prEntity) {
    return {
      isBreaking: true,
      changeType: 'major',
      reason: `${entityType} deleted: ${baseEntity.id}`
    }
  }

  // Addition is never breaking (minor)
  if (!baseEntity && prEntity) {
    return {
      isBreaking: false,
      changeType: 'minor',
      reason: null
    }
  }

  // Both null - shouldn't happen, but treat as patch
  if (!baseEntity && !prEntity) {
    return {
      isBreaking: false,
      changeType: 'patch',
      reason: null
    }
  }

  // ID change is always breaking (major) - equivalent to delete + add
  if (baseEntity.id !== prEntity.id) {
    return {
      isBreaking: true,
      changeType: 'major',
      reason: `id changed: ${baseEntity.id} -> ${prEntity.id}`
    }
  }

  // Get detailed diff
  const { deleted, updated } = detailedDiff(baseEntity, prEntity)

  // Check entity-type-specific breaking changes
  const result = checkEntityBreakingChanges(entityType, baseEntity, prEntity, deleted, updated)
  if (result) {
    return result
  }

  // Check if there are any changes at all
  const { added } = detailedDiff(baseEntity, prEntity)
  const hasAdditions = Object.keys(added).filter(k => k !== '_filePath').length > 0
  const hasUpdates = Object.keys(updated).filter(k => k !== '_filePath').length > 0

  if (hasAdditions) {
    return {
      isBreaking: false,
      changeType: 'minor',
      reason: null
    }
  }

  if (hasUpdates) {
    // Non-breaking updates (like label/description changes)
    return {
      isBreaking: false,
      changeType: 'patch',
      reason: null
    }
  }

  // No meaningful changes
  return {
    isBreaking: false,
    changeType: 'patch',
    reason: null
  }
}

/**
 * Check entity-type-specific breaking change rules
 *
 * @param {string} entityType - Entity type
 * @param {object} baseEntity - Base entity
 * @param {object} prEntity - PR entity
 * @param {object} deleted - Deleted fields from detailedDiff
 * @param {object} updated - Updated fields from detailedDiff
 * @returns {{isBreaking: boolean, changeType: 'major'|'minor'|'patch', reason: string}|null}
 */
function checkEntityBreakingChanges(entityType, baseEntity, prEntity, deleted, updated) {
  if (entityType === 'properties') {
    return checkPropertyBreakingChanges(baseEntity, prEntity, deleted, updated)
  }

  if (entityType === 'categories') {
    return checkCategoryBreakingChanges(baseEntity, prEntity, deleted, updated)
  }

  // modules and bundles: deletion handled above, other changes are minor/patch
  if (entityType === 'modules' || entityType === 'bundles') {
    // Any field deletion in module/bundle that isn't cosmetic
    const deletedKeys = Object.keys(deleted).filter(k => k !== '_filePath')
    if (deletedKeys.length > 0) {
      // Check if any structural field was deleted
      const structuralFields = new Set(['id', 'label', 'description', 'categories', 'properties'])
      for (const key of deletedKeys) {
        if (structuralFields.has(key)) {
          return {
            isBreaking: true,
            changeType: 'major',
            reason: `field deleted: ${key}`
          }
        }
      }
    }
  }

  return null
}

/**
 * Check property-specific breaking changes
 */
function checkPropertyBreakingChanges(baseEntity, prEntity, deleted, updated) {
  // datatype change is breaking
  if (updated.datatype !== undefined) {
    return {
      isBreaking: true,
      changeType: 'major',
      reason: `datatype changed: ${baseEntity.datatype} -> ${prEntity.datatype}`
    }
  }

  // cardinality: only breaking if multiple -> single
  if (updated.cardinality !== undefined) {
    if (baseEntity.cardinality === 'multiple' && prEntity.cardinality === 'single') {
      return {
        isBreaking: true,
        changeType: 'major',
        reason: 'cardinality restricted: multiple -> single'
      }
    }
  }

  // allowed_values: removal is breaking
  if (baseEntity.allowed_values && prEntity.allowed_values) {
    const oldSet = new Set(baseEntity.allowed_values)
    const newSet = new Set(prEntity.allowed_values)

    for (const val of oldSet) {
      if (!newSet.has(val)) {
        return {
          isBreaking: true,
          changeType: 'major',
          reason: `allowed_values removed: ${val}`
        }
      }
    }

    // Addition of allowed_values is minor
    for (const val of newSet) {
      if (!oldSet.has(val)) {
        return {
          isBreaking: false,
          changeType: 'minor',
          reason: null
        }
      }
    }
  }

  return null
}

/**
 * Check category-specific breaking changes
 */
function checkCategoryBreakingChanges(baseEntity, prEntity, deleted, updated) {
  // required_properties: adding new required = breaking
  if (baseEntity.required_properties && prEntity.required_properties) {
    const oldSet = new Set(baseEntity.required_properties)
    const newSet = new Set(prEntity.required_properties)

    for (const prop of newSet) {
      if (!oldSet.has(prop)) {
        return {
          isBreaking: true,
          changeType: 'major',
          reason: `required_properties added: ${prop}`
        }
      }
    }
  } else if (!baseEntity.required_properties && prEntity.required_properties?.length > 0) {
    // Adding required_properties when there were none
    return {
      isBreaking: true,
      changeType: 'major',
      reason: `required_properties added: ${prEntity.required_properties.join(', ')}`
    }
  }

  // optional_properties: removal is breaking
  if (baseEntity.optional_properties && prEntity.optional_properties) {
    const oldSet = new Set(baseEntity.optional_properties)
    const newSet = new Set(prEntity.optional_properties)

    for (const prop of oldSet) {
      if (!newSet.has(prop)) {
        return {
          isBreaking: true,
          changeType: 'major',
          reason: `optional_properties removed: ${prop}`
        }
      }
    }
  }

  return null
}

/** Impact priority levels for comparison */
const IMPACT_PRIORITY = { major: 3, minor: 2, patch: 1 }

/**
 * Detect changes in all modified entities and compute max impact label
 *
 * @param {object} entityIndex - Entity index from buildEntityIndex (unused, for API compatibility)
 * @param {string} baseBranch - Base branch reference
 * @returns {{changes: Array<{file: string, entityType: string, status: string, impact: string, reason: string|null}>, maxImpact: 'major'|'minor'|'patch'}}
 *
 * @example
 * const result = detectChanges(entityIndex, 'origin/main')
 * // { changes: [...], maxImpact: 'major' }
 */
export function detectChanges(entityIndex, baseBranch = 'origin/main') {
  const changedFiles = getChangedFiles(baseBranch)
  const changes = []
  let maxImpact = 'patch'
  let maxPriority = IMPACT_PRIORITY.patch

  for (const filePath of changedFiles) {
    const entityType = filePath.split('/')[0]
    const baseEntity = getBaseEntity(filePath, baseBranch)
    const prEntity = getPrEntity(filePath)

    // Determine status
    let status
    if (!baseEntity && prEntity) {
      status = 'added'
    } else if (baseEntity && !prEntity) {
      status = 'deleted'
    } else {
      status = 'modified'
    }

    const result = detectBreakingChange(entityType, baseEntity, prEntity)

    changes.push({
      file: filePath,
      entityType,
      status,
      impact: result.changeType,
      reason: result.reason
    })

    // Update max impact using priority comparison
    const changePriority = IMPACT_PRIORITY[result.changeType] || 0
    if (changePriority > maxPriority) {
      maxImpact = result.changeType
      maxPriority = changePriority
    }
  }

  return { changes, maxImpact }
}
