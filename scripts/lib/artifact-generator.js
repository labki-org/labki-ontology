import fs from 'node:fs'
import path from 'node:path'
import { MODULE_ENTITY_TYPES } from './constants.js'
import { generateModuleVocab, generateBundleVocab, buildEntityPaths } from './wikitext-generator.js'

/**
 * Generate a module version artifact as a self-contained directory.
 *
 * The artifact directory contains:
 * - {moduleid}.vocab.json (SMW-importable manifest + module metadata)
 * - Entity wikitext files in subdirectories (categories/, properties/, etc.)
 *
 * @param {string} moduleId - Module ID
 * @param {string} version - Version to assign
 * @param {Object} entityIndex - Entity index from buildEntityIndex()
 * @param {string} ontologyVersion - Current ontology version
 * @param {string} rootDir - Root directory of the project (for reading source files)
 * @returns {string} Output directory path
 */
export function generateModuleArtifactDirectory(moduleId, version, entityIndex, ontologyVersion, rootDir = process.cwd()) {
  const moduleEntity = entityIndex.modules.get(moduleId)
  if (!moduleEntity) {
    throw new Error(`Module not found: ${moduleId}`)
  }

  const outputDir = path.join(rootDir, 'modules', moduleId, 'versions', version)

  // Clean and create output directory
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true })
  }
  fs.mkdirSync(outputDir, { recursive: true })

  // Collect all import entries for the vocab.json
  const importEntries = []

  // Copy entity wikitext files and build import entries
  const entityArrays = {
    categories: { dir: 'categories', namespace: 'NS_CATEGORY' },
    properties: { dir: 'properties', namespace: 'SMW_NS_PROPERTY' },
    subobjects: { dir: 'subobjects', namespace: 'NS_SUBOBJECT' },
    templates: { dir: 'templates', namespace: 'NS_TEMPLATE' },
  }

  for (const [type, { dir, namespace }] of Object.entries(entityArrays)) {
    for (const entityKey of moduleEntity[type] || []) {
      const entity = entityIndex[type].get(entityKey)
      if (!entity?._filePath) continue

      // Copy wikitext file to artifact directory
      const sourcePath = path.join(rootDir, entity._filePath)
      const destRelative = `${dir}/${entityKey}.wikitext`
      const destPath = path.join(outputDir, destRelative)

      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(sourcePath, destPath)

      // Add import entry
      importEntries.push({
        page: entityKey.replace(/_/g, ' '),
        namespace,
        contents: { importFrom: destRelative },
        options: { replaceable: true },
      })
    }
  }

  // Handle dashboards (multi-page: copy all page files)
  for (const dashboardId of moduleEntity.dashboards || []) {
    const dashboard = entityIndex.dashboards.get(dashboardId)
    if (!dashboard) continue

    for (const page of dashboard.pages) {
      const pageSuffix = page.name ? `/${page.name}` : ''
      const fileKey = `${dashboardId}${pageSuffix}`
      const destRelative = `dashboards/${fileKey}.wikitext`
      const destPath = path.join(outputDir, destRelative)

      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.writeFileSync(destPath, page.wikitext + '\n', 'utf8')

      importEntries.push({
        page: fileKey.replace(/_/g, ' '),
        namespace: 'NS_ONTOLOGY_DASHBOARD',
        contents: { importFrom: destRelative },
        options: { replaceable: true },
      })
    }
  }

  // Handle resources
  for (const resourceKey of moduleEntity.resources || []) {
    const resource = entityIndex.resources.get(resourceKey)
    if (!resource?._filePath) continue

    const sourcePath = path.join(rootDir, resource._filePath)
    const destRelative = `resources/${resourceKey}.wikitext`
    const destPath = path.join(outputDir, destRelative)

    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.copyFileSync(sourcePath, destPath)

    importEntries.push({
      page: resourceKey.replace(/_/g, ' '),
      namespace: 'NS_ONTOLOGY_RESOURCE',
      contents: { importFrom: destRelative },
      options: { replaceable: true },
    })
  }

  // Resolve dependency versions
  const dependencies = {}
  for (const depId of moduleEntity.dependencies || []) {
    const depModule = entityIndex.modules.get(depId)
    if (depModule) {
      dependencies[depId] = depModule.version
    }
  }

  // Write vocab.json
  const vocab = {
    description: moduleEntity.description || '',
    id: moduleId,
    version,
    label: moduleEntity.label || moduleId,
    dependencies,
    import: importEntries,
    meta: {
      version: '1',
      ontologyVersion,
      generated: new Date().toISOString(),
    },
  }

  const vocabPath = path.join(outputDir, `${moduleId.toLowerCase()}.vocab.json`)
  fs.writeFileSync(vocabPath, JSON.stringify(vocab, null, 2) + '\n', 'utf8')

  return outputDir
}

/**
 * Generate a bundle version artifact by combining all constituent modules.
 *
 * The bundle directory contains a single vocab.json with all module entities
 * merged, plus all wikitext files from all modules.
 *
 * @param {string} bundleId - Bundle ID
 * @param {string} version - Version to assign
 * @param {Object} entityIndex - Entity index
 * @param {string} ontologyVersion - Ontology version
 * @param {string} rootDir - Root directory
 * @returns {string} Output directory path
 */
export function generateBundleArtifactDirectory(bundleId, version, entityIndex, ontologyVersion, rootDir = process.cwd()) {
  const bundleEntity = entityIndex.bundles.get(bundleId)
  if (!bundleEntity) {
    throw new Error(`Bundle not found: ${bundleId}`)
  }

  const outputDir = path.join(rootDir, 'bundles', bundleId, 'versions', version)

  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true })
  }
  fs.mkdirSync(outputDir, { recursive: true })

  // Collect all import entries from all modules
  const allImportEntries = []
  const moduleVersions = {}

  for (const moduleId of bundleEntity.modules) {
    const moduleEntity = entityIndex.modules.get(moduleId)
    if (!moduleEntity) {
      throw new Error(`Module not found in bundle: ${moduleId}`)
    }

    moduleVersions[moduleId] = moduleEntity.version

    // Generate module's artifact content into the bundle directory
    // (same logic as module artifact but into bundle output dir)
    const entityArrays = {
      categories: { dir: 'categories', namespace: 'NS_CATEGORY' },
      properties: { dir: 'properties', namespace: 'SMW_NS_PROPERTY' },
      subobjects: { dir: 'subobjects', namespace: 'NS_SUBOBJECT' },
      templates: { dir: 'templates', namespace: 'NS_TEMPLATE' },
    }

    for (const [type, { dir, namespace }] of Object.entries(entityArrays)) {
      for (const entityKey of moduleEntity[type] || []) {
        const entity = entityIndex[type].get(entityKey)
        if (!entity?._filePath) continue

        const sourcePath = path.join(rootDir, entity._filePath)
        const destRelative = `${dir}/${entityKey}.wikitext`
        const destPath = path.join(outputDir, destRelative)

        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.copyFileSync(sourcePath, destPath)

        allImportEntries.push({
          page: entityKey.replace(/_/g, ' '),
          namespace,
          contents: { importFrom: destRelative },
          options: { replaceable: true },
        })
      }
    }

    // Dashboards
    for (const dashboardId of moduleEntity.dashboards || []) {
      const dashboard = entityIndex.dashboards.get(dashboardId)
      if (!dashboard) continue

      for (const page of dashboard.pages) {
        const pageSuffix = page.name ? `/${page.name}` : ''
        const fileKey = `${dashboardId}${pageSuffix}`
        const destRelative = `dashboards/${fileKey}.wikitext`
        const destPath = path.join(outputDir, destRelative)

        fs.mkdirSync(path.dirname(destPath), { recursive: true })
        fs.writeFileSync(destPath, page.wikitext + '\n', 'utf8')

        allImportEntries.push({
          page: fileKey.replace(/_/g, ' '),
          namespace: 'NS_ONTOLOGY_DASHBOARD',
          contents: { importFrom: destRelative },
          options: { replaceable: true },
        })
      }
    }

    // Resources
    for (const resourceKey of moduleEntity.resources || []) {
      const resource = entityIndex.resources.get(resourceKey)
      if (!resource?._filePath) continue

      const sourcePath = path.join(rootDir, resource._filePath)
      const destRelative = `resources/${resourceKey}.wikitext`
      const destPath = path.join(outputDir, destRelative)

      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(sourcePath, destPath)

      allImportEntries.push({
        page: resourceKey.replace(/_/g, ' '),
        namespace: 'NS_ONTOLOGY_RESOURCE',
        contents: { importFrom: destRelative },
        options: { replaceable: true },
      })
    }
  }

  // Write combined vocab.json
  const vocab = {
    description: bundleEntity.description || '',
    id: bundleId,
    version,
    label: bundleEntity.label || bundleId,
    modules: moduleVersions,
    import: allImportEntries,
    meta: {
      version: '1',
      ontologyVersion,
      generated: new Date().toISOString(),
    },
  }

  const vocabPath = path.join(outputDir, `${bundleId.toLowerCase()}.vocab.json`)
  fs.writeFileSync(vocabPath, JSON.stringify(vocab, null, 2) + '\n', 'utf8')

  return outputDir
}
