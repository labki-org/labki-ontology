# Versioning Guide

This document explains how versioning works for the Labki ontology.

## Overview

The ontology uses **semantic versioning** (SemVer) at three levels:

1. **Ontology version** — tracked in the `VERSION` file at the repo root
2. **Module versions** — tracked in each `modules/*.vocab.json`
3. **Bundle versions** — tracked in each `bundles/*.json`

On every push to `main`, the CI pipeline automatically detects changes, calculates version bumps (cascading through the dependency graph), generates artifacts, commits the results, and tags the release.

## Semantic Versioning

Version numbers follow the format `MAJOR.MINOR.PATCH`:

| Component | When to Increment | Example |
|-----------|-------------------|---------|
| **MAJOR** | Breaking changes | `1.0.0` &rarr; `2.0.0` |
| **MINOR** | New features (backwards compatible) | `1.0.0` &rarr; `1.1.0` |
| **PATCH** | Bug fixes, documentation | `1.0.0` &rarr; `1.0.1` |

## Breaking Changes (Major Version)

A breaking change is any modification that could cause existing consumers (wikis, applications) to fail:

### Entity Deletions

Deleting any entity file (category, property, subobject, template, dashboard, resource).

### ID Changes

Renaming an entity (equivalent to delete + add):

```diff
- categories/Equipment.wikitext
+ categories/Lab_equipment.wikitext
```

### Property Changes

| Change | Breaking? |
|--------|-----------|
| `Has type` changed | Yes |
| `Allows multiple values`: `true` &rarr; removed | Yes |
| `Allows multiple values`: added `true` | No |
| Removing an `Allows value` entry | Yes |
| Adding an `Allows value` entry | No |

### Category Changes

| Change | Breaking? |
|--------|-----------|
| Adding `Has required property` | Yes |
| Removing `Has optional property` | Yes |
| Adding `Has optional property` | No |
| Removing `Has required property` | No |

## Non-Breaking Changes (Minor Version)

- Adding new entities (properties, categories, modules, etc.)
- Adding new optional fields to existing entities
- Expanding allowed values
- Changing cardinality from single to multiple
- Adding optional properties/subobjects to categories

## Patch Changes

- Updating `Display label` or `Has description`
- Fixing typos
- No structural or semantic changes

## Version Cascade

When an entity changes, the version bump cascades:

1. **Entity change detected** &rarr; determines bump type (major/minor/patch)
2. **Containing module** gets at least that bump type
3. **Dependent modules** (via `dependencies`) inherit the bump (propagated through the full dependency graph)
4. **Containing bundles** get at least the highest bump from their modules
5. **Ontology VERSION** gets at least the highest bump from all modules

For example, if `Has_email.wikitext` changes its `Has type` (major change), and the `Core` module contains it, and the `Default` bundle includes `Core`:

```
Has_email.wikitext  →  Core module (major)  →  Default bundle (major)  →  VERSION (major)
```

## Version Overrides

You can manually override the calculated bump type by creating a `VERSION_OVERRIDES.json` file at the repo root:

```json
{
  "Core": "major",
  "Default": "minor"
}
```

Each key is a module or bundle ID, and the value is the desired bump type (`major`, `minor`, or `patch`). The override must be at least as high as the calculated bump — it can only escalate, not downgrade.

The CI pipeline consumes and cleans up this file during the release process.

## CI Pipeline

### Validation (`validate.yml`)

Runs on PRs and pushes to `main` when entity files change:
- Validates structural integrity, reference integrity, cycle detection, orphan detection
- On PRs, runs with `--changed-only` for efficiency
- Posts a sticky comment on the PR with validation results

### Release (`release.yml`)

Runs on every push to `main`:

1. **Detect changes** — identifies entity files that changed in the push
2. **Detect affected modules/bundles** — traces which modules and bundles contain or depend on the changed entities
3. **Apply version bumps** — calculates the version cascade, applies `VERSION_OVERRIDES` if present, writes new versions to source files and `VERSION`
4. **Generate artifacts** — produces versioned artifact directories under `modules/*/versions/` and `bundles/*/versions/`
5. **Commit** — stages and commits version updates + artifacts
6. **Tag** — creates `v{ontologyVersion}` git tag if `VERSION` changed

### Tests (`test.yml`)

Runs on PRs and pushes to `main` when script files change:
- Unit tests: `npm test`
- Integration tests: `npm run test:integration`

## How Versioning Works Automatically

In the typical workflow, you don't manually version anything. Editing through Ontology Hub (or directly) and merging to `main` triggers the release pipeline, which handles all version management automatically.

If you need manual control, you can:
- Edit `VERSION` directly for the ontology version
- Edit `version` in `modules/*.vocab.json` for module versions
- Edit `version` in `bundles/*.json` for bundle versions
- Use `VERSION_OVERRIDES.json` to escalate a bump type

## Files Involved

| File | Purpose |
|------|---------|
| `VERSION` | Ontology-level version |
| `modules/*.vocab.json` | Module versions (in `version` field) |
| `bundles/*.json` | Bundle versions (in `version` field) |
| `VERSION_OVERRIDES.json` | Optional manual bump overrides (consumed by CI) |
| `scripts/lib/change-detector.js` | Breaking change detection |
| `scripts/lib/version-cascade.js` | Version cascade calculation |
| `scripts/ci-apply-versions.js` | Applies calculated versions to source files |
| `scripts/ci-detect-affected.js` | Maps changed files to affected modules/bundles |
| `.github/workflows/release.yml` | Release pipeline |
