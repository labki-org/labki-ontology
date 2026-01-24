# Versioning Guide

This document explains how versioning works for the Labki Schemas ontology.

## Overview

The ontology uses **semantic versioning** (SemVer) with a single `VERSION` file at the repository root. Every pull request must include an appropriately incremented version.

```
VERSION
```

Contains a single line with the version number:
```
1.2.3
```

## Semantic Versioning

The version number follows the format `MAJOR.MINOR.PATCH`:

| Component | When to Increment | Example |
|-----------|-------------------|---------|
| **MAJOR** | Breaking changes | `1.0.0` → `2.0.0` |
| **MINOR** | New features (backwards compatible) | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fixes, documentation | `1.0.0` → `1.0.1` |

## Breaking Changes (Major Version)

A breaking change is any modification that could cause existing consumers (wikis, applications) to fail. The following changes require a **major version bump**:

### Entity Deletions

Deleting any entity file:
- Categories
- Properties
- Subobjects
- Templates
- Modules
- Bundles

### ID Changes

Renaming an entity's `id` field is treated as a deletion followed by an addition:
```json
// Before
{ "id": "Equipment" }

// After (BREAKING)
{ "id": "LabEquipment" }
```

### Property Changes

| Change | Breaking? |
|--------|-----------|
| `datatype` changed | Yes |
| `cardinality`: `multiple` → `single` | Yes |
| `cardinality`: `single` → `multiple` | No |
| Removing values from `allowed_values` | Yes |
| Adding values to `allowed_values` | No |

### Category Changes

| Change | Breaking? |
|--------|-----------|
| Adding items to `required_properties` | Yes |
| Removing items from `optional_properties` | Yes |
| Adding items to `optional_properties` | No |
| Removing items from `required_properties` | No |

## Non-Breaking Changes (Minor Version)

The following require a **minor version bump**:

- Adding new entities (properties, categories, modules, etc.)
- Adding new optional fields to existing entities
- Expanding `allowed_values` (adding new options)
- Changing `cardinality` from `single` to `multiple`
- Adding items to `optional_properties`

## Patch Changes

The following require only a **patch version bump**:

- Updating `label` or `description` fields
- Fixing typos
- Documentation changes
- No structural or semantic changes

## CI Validation

The CI pipeline validates versioning on every pull request:

### What CI Checks

1. **Format Validation**: VERSION file must contain a valid semver string
2. **Increment Validation**: VERSION must be greater than the base branch version
3. **Change Detection**: CI analyzes the diff to determine required bump type
4. **Bump Comparison**: CI reports if VERSION matches the expected bump

### Error Messages

| Error | Meaning |
|-------|---------|
| `missing-version` | No VERSION file in repository |
| `invalid-version` | VERSION doesn't parse as valid semver |
| `version-not-incremented` | VERSION not greater than base branch |

### Warnings

| Warning | Meaning |
|---------|---------|
| `version-bump-insufficient` | Detected changes require a higher version bump |

Warnings are non-blocking but should be reviewed.

### Example CI Output

```
Version: 2.1.0 (base: 2.0.0)
Required bump: major, Actual bump: minor
Breaking changes detected: 1
```

This output indicates:
- PR version is `2.1.0`, base is `2.0.0`
- A breaking change was detected (requires major bump)
- But only a minor bump was applied
- CI will warn about this mismatch

## How to Version Your PR

### Step 1: Identify Your Changes

Review what you're changing:
- Are you deleting entities?
- Are you changing property datatypes?
- Are you adding new required fields to categories?

### Step 2: Determine Required Bump

Use this decision tree:

```
Any breaking change? → MAJOR
├── Entity deletion
├── ID change
├── Datatype change
├── Cardinality restriction (multiple → single)
├── Allowed values removal
├── Required properties addition
└── Optional properties removal

Only additions/expansions? → MINOR
├── New entities
├── New optional fields
├── Allowed values expansion
└── Cardinality expansion (single → multiple)

Only cosmetic changes? → PATCH
├── Label/description updates
└── Documentation fixes
```

### Step 3: Update VERSION File

Edit the VERSION file with the new version:

```bash
# View current version
cat VERSION

# Update version (example: 1.0.0 → 2.0.0)
echo "2.0.0" > VERSION
```

### Step 4: Commit

Include the VERSION file in your commit:

```bash
git add VERSION
git commit -m "feat: add new property with major version bump"
```

## Examples

### Example 1: Adding a New Property

```diff
+ properties/SerialNumber.json (new file)
```

**Required bump**: Minor (new entity)
```
1.0.0 → 1.1.0
```

### Example 2: Changing a Datatype

```diff
  properties/Weight.json
- "datatype": "Text"
+ "datatype": "Number"
```

**Required bump**: Major (breaking change)
```
1.0.0 → 2.0.0
```

### Example 3: Adding Allowed Values

```diff
  properties/Status.json
  "allowed_values": [
    "Active",
    "Inactive",
+   "Pending"
  ]
```

**Required bump**: Minor (expansion)
```
1.0.0 → 1.1.0
```

### Example 4: Fixing a Label Typo

```diff
  properties/Name.json
- "label": "Nmae"
+ "label": "Name"
```

**Required bump**: Patch (cosmetic)
```
1.0.0 → 1.0.1
```

## Consumer Guidance

Consumers of this ontology can pin to version ranges:

```
# Accept any 2.x version (safe for minor/patch updates)
ontology >= 2.0.0 < 3.0.0

# Accept only patch updates
ontology >= 2.1.0 < 2.2.0
```

This ensures:
- Patch updates: Always safe, no action needed
- Minor updates: Safe, may include new features to adopt
- Major updates: Review breaking changes before upgrading

## Technical Details

### How Change Detection Works

1. CI fetches the VERSION file from the base branch using `git show origin/main:VERSION`
2. CI compares changed entity files between base and PR using `git diff --name-only`
3. For each changed file, CI retrieves both versions and analyzes the diff
4. Breaking changes are detected using `deep-object-diff` to identify field-level changes
5. The highest required bump (major > minor > patch) determines the expected version

### Files Involved

- `scripts/lib/version-validator.js` - Version format and comparison
- `scripts/lib/change-detector.js` - Breaking change detection
- `scripts/validate.js` - Integration into validation pipeline
- `.github/workflows/validate.yml` - CI workflow with git history access

---

*Last updated: 2026-01-23*
