# Labki Ontology Specification

This document defines the entity types, wikitext format, and validation rules for the Labki community ontology. These definitions are used by [OntologySync](https://github.com/labki-org/OntologySync) to install ontology content into MediaWiki instances running [SemanticSchemas](https://github.com/labki-org/SemanticSchemas) with [Semantic MediaWiki](https://www.semantic-mediawiki.org/).

## Overview

The ontology is organized into a hierarchy:

```
Bundle
  └── Module
        ├── Category
        │     ├── Property (required/optional)
        │     ├── Subobject (required/optional)
        │     └── (inherits from parent Categories)
        ├── Property
        ├── Subobject
        ├── Template
        ├── Dashboard
        └── Resource
```

| Concept | Purpose | File Format | Location |
|---------|---------|-------------|----------|
| **Category** | Entity types with multiple inheritance | `.wikitext` | `categories/` |
| **Property** | Typed attributes with constraints | `.wikitext` | `properties/` |
| **Subobject** | Reusable nested structures | `.wikitext` | `subobjects/` |
| **Template** | Display formatting for property values | `.wikitext` | `templates/` |
| **Dashboard** | Wiki dashboard pages with SMW queries | `.wikitext` | `dashboards/` |
| **Resource** | Pre-filled content pages (entity instances) | `.wikitext` | `resources/` |
| **Module** | Logical entity groupings with dependencies | `.vocab.json` | `modules/` |
| **Bundle** | Curated module collections for deployment | `.json` | `bundles/` |

---

## Wikitext Format

Entity definitions (categories, properties, subobjects, resources) use MediaWiki semantic annotations inside OntologySync marker blocks:

```wikitext
<!-- OntologySync Start -->
[[Annotation property::Value]]
[[Another property::Another value]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
```

Key rules:
- Annotations go between the `<!-- OntologySync Start -->` and `<!-- OntologySync End -->` markers
- Each annotation is a `[[Property::Value]]` pair on its own line
- Multi-valued properties use repeated annotations (one per line)
- References to other entities include the namespace prefix (e.g. `Property:Has name`, `Category:Agent`)
- Page names in annotations use **spaces** (e.g. `Has name`), while filenames use **underscores** (e.g. `Has_name.wikitext`)
- A management category appears outside the markers (e.g. `[[Category:OntologySync-managed]]`)

Templates and dashboards are **raw wikitext** with no annotation block.

---

## Category

A Category defines an entity type. Categories support multiple inheritance and distinguish between required and optional properties/subobjects.

### File Location

`categories/{Category_name}.wikitext`

### Annotations

| Annotation | Required | Description |
|------------|----------|-------------|
| `Has description` | Yes | What this Category represents |
| `Display label` | No | Human-readable label (defaults to page name) |
| `Has parent category` | No | Parent category reference (repeatable for multiple inheritance) |
| `Has required property` | No | Property that must be provided (repeatable) |
| `Has optional property` | No | Property that may be provided (repeatable) |
| `Has required subobject` | No | Subobject that must be provided (repeatable) |
| `Has optional subobject` | No | Subobject that may be provided (repeatable) |

Management category: `[[Category:OntologySync-managed]]`

### Inheritance

Categories support multiple inheritance through repeated `Has parent category` annotations:

- A Category inherits all properties and subobjects from every parent
- Inherited properties/subobjects retain their required/optional status from the parent
- Child-defined properties/subobjects merge with inherited ones
- Circular inheritance is not allowed

### Example: Root Category

```wikitext
<!-- OntologySync Start -->
[[Has description::An abstract entity that can perform actions - either a person or an organization]]
[[Has required property::Property:Has name]]
[[Has optional property::Property:Has description]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
```

### Example: Child with Inheritance

```wikitext
<!-- OntologySync Start -->
[[Has description::A human being]]
[[Has parent category::Category:Agent]]
[[Has optional property::Property:Has email]]
[[Has optional subobject::Subobject:Address]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
```

### Example: Multiple Inheritance

```wikitext
<!-- OntologySync Start -->
[[Has description::A student who also conducts research]]
[[Has parent category::Category:Student]]
[[Has parent category::Category:Researcher]]
[[Has required property::Property:Has advisor]]
[[Has optional property::Property:Has thesis title]]
<!-- OntologySync End -->
[[Category:OntologySync-managed]]
```

---

## Property

A Property defines a typed attribute that can be assigned to Categories and Subobjects. Properties specify the SMW data type, cardinality, and optional constraints.

### File Location

`properties/{Property_id}.wikitext`

### Annotations

| Annotation | Required | Description |
|------------|----------|-------------|
| `Has type` | Yes | Semantic MediaWiki data type |
| `Has description` | Yes | What this Property represents |
| `Display label` | No | Human-readable label (defaults to page name) |
| `Allows multiple values` | No | Set to `true` for multi-valued properties (default: single) |
| `Allows value` | No | Permitted value (repeatable for enumerated constraints) |
| `Allows value from category` | No | Restrict values to pages in a category |
| `Allows pattern` | No | Regex pattern for validation |
| `Allows value list` | No | Reference to a wiki page of allowed values |
| `Display units` | No | Unit for display (repeatable) |
| `Display precision` | No | Decimal places for numeric display |
| `Has unique values` | No | `true` if values must be globally unique |
| `Has template` | No | Template reference for custom rendering |
| `Subproperty of` | No | Parent property reference |

Management category: `[[Category:OntologySync-managed-property]]`

### Data Types

| Datatype | Description | Example |
|----------|-------------|---------|
| `Text` | Plain text | `"John Doe"` |
| `Email` | Email address | `"user@example.com"` |
| `Date` | Calendar date | `"2024-01-15"` |
| `URL` | Web address | `"https://example.com"` |
| `Page` | Internal wiki page | `"Person:John Doe"` |
| `Number` | Numeric value | `42`, `3.14` |
| `Boolean` | True/false | `true`, `false` |
| `Telephone` | Phone number | `"+1-555-123-4567"` |
| `Geographic coordinate` | Lat/long | `"37.7749, -122.4194"` |

### Cardinality

- **Single** (default): Property accepts exactly one value
- **Multiple** (`[[Allows multiple values::true]]`): Property accepts zero or more values

### Example: Simple Property

```wikitext
<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::The name of an entity]]
[[Display label::Name]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

### Example: Multi-valued Property

```wikitext
<!-- OntologySync Start -->
[[Has type::Email]]
[[Has description::Email address for contact]]
[[Display label::Email]]
[[Allows multiple values::true]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

### Example: Enumerated Values

```wikitext
<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::Current status of the entity]]
[[Display label::Status]]
[[Allows value::planned]]
[[Allows value::active]]
[[Allows value::completed]]
[[Allows value::cancelled]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

### Example: Pattern Validation with Uniqueness

```wikitext
<!-- OntologySync Start -->
[[Has type::Text]]
[[Has description::Open Researcher and Contributor ID]]
[[Display label::ORCID]]
[[Allows pattern::^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$]]
[[Has unique values::true]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

### Example: Property with Display Template

```wikitext
<!-- OntologySync Start -->
[[Has type::Page]]
[[Has description::Link to a related wiki page]]
[[Display label::Related Page]]
[[Allows multiple values::true]]
[[Has template::Template:Property/Page]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

### Example: Subproperty

```wikitext
<!-- OntologySync Start -->
[[Has type::Email]]
[[Has description::Professional email address]]
[[Display label::Work Email]]
[[Subproperty of::Property:Has email]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

---

## Subobject

A Subobject defines a reusable nested structure that can be embedded within Categories. Subobjects reference existing Properties.

### File Location

`subobjects/{Subobject_name}.wikitext`

### Annotations

| Annotation | Required | Description |
|------------|----------|-------------|
| `Has description` | Yes | What this Subobject represents |
| `Display label` | No | Human-readable label (defaults to page name) |
| `Has required property` | No | Property that must be provided (repeatable) |
| `Has optional property` | No | Property that may be provided (repeatable) |

Management category: `[[Category:OntologySync-managed-subobject]]`

### Example

```wikitext
<!-- OntologySync Start -->
[[Has description::A physical or mailing address]]
[[Has required property::Property:Has street]]
[[Has required property::Property:Has city]]
[[Has required property::Property:Has country]]
[[Has optional property::Property:Has postal code]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-subobject]]
```

---

## Template

A Template defines how Property values are rendered in the wiki. Templates are **raw wikitext** with no annotation block.

### File Location

`templates/{Template/Path}.wikitext`

Templates use nested directories to create MediaWiki subpage hierarchies:
- `templates/Property/Page.wikitext` &rarr; `Template:Property/Page` in the wiki

### Format

Templates contain raw MediaWiki wikitext. The property value is available via the `{{{value|}}}` placeholder.

### Example

```wikitext
<includeonly>{{#if:{{{value|}}}|{{#arraymap:{{{value|}}}|,|@@item@@|[[:@@item@@]]|,&#32;}}|}}</includeonly>
```

---

## Dashboard

A Dashboard is a wiki page (typically with SMW queries) that provides an overview or management interface. Dashboards support multi-page structures with subpages.

### File Location

```
dashboards/{Dashboard_name}.wikitext           # Root page
dashboards/{Dashboard_name}/{Subpage}.wikitext  # Subpages
```

### Format

Dashboards contain raw MediaWiki wikitext (no annotation block). They can use SMW `#ask` queries, templates, and any other wikitext.

All pages belonging to a dashboard are automatically collected by the tooling and included as separate import entries in the module's `vocab.json`.

### Example: Root Page

```wikitext
== Core Entities Overview ==

This dashboard provides an overview of the core ontology entities.

=== People ===
{{#ask:
 [[Category:Person]]
 |?Has_name
 |?Has_email
 |format=table
}}

=== Organizations ===
{{#ask:
 [[Category:Organization]]
 |?Has_name
 |format=table
}}
```

---

## Resource

A Resource is a pre-filled content page — an instance of one or more Categories with property values already set. Resources are useful for example data or default content.

### File Location

`resources/{Category}/{Resource_name}.wikitext`

### Annotations

| Annotation | Required | Description |
|------------|----------|-------------|
| `Has description` | No | Description of this resource |
| `Display label` | No | Human-readable label |
| _(property annotations)_ | No | Any property values as `[[Property name::Value]]` |

Category memberships appear outside the markers. Resources belong to both their content category and a management category:

```
[[Category:Person]]
[[Category:OntologySync-managed-resource]]
```

### Example

```wikitext
<!-- OntologySync Start -->
[[Has description::Example person resource demonstrating the Person category structure]]
[[Display label::John Doe]]
[[Has name::John Doe]]
[[Has email::john.doe@example.com]]
<!-- OntologySync End -->
[[Category:Person]]
[[Category:OntologySync-managed-resource]]
```

---

## Module

A Module is a logical grouping of related entities. Modules declare which categories they contain; properties and subobjects are auto-computed from those categories.

### File Location

`modules/{Module_id}.json`

### Format

```json
{
  "id": "Agents",
  "label": "Agents",
  "description": "People, organizations, and other actors",
  "categories": ["Agent", "Person", "Researcher"],
  "properties": ["Has_first_name", "Has_last_name", "Has_name"],
  "subobjects": ["Has_organizational_role"],
  "templates": [],
  "manual_categories": ["Person", "Researcher"],
  "resources": []
}
```

### Fields

| Field | Type | Required | Manual/Auto | Description |
|-------|------|----------|-------------|-------------|
| `id` | string | Yes | Manual | Module identifier matching the filename |
| `label` | string | No | Manual | Human-readable display name |
| `description` | string | Yes | Manual | What this Module provides |
| `categories` | string[] | Yes | Manual | Category IDs in this module |
| `properties` | string[] | Yes | **Auto-computed** | Properties referenced by categories and subobjects |
| `subobjects` | string[] | Yes | **Auto-computed** | Subobjects referenced by categories |
| `resources` | string[] | No | **Auto-computed** | Resources whose category is in this module |
| `templates` | string[] | No | Manual | Template IDs in this module |
| `dashboards` | string[] | No | Manual | Dashboard IDs in this module |
| `manual_categories` | string[] | No | Manual | Categories that users can create pages for |

### Auto-Computed Fields

The `properties` and `subobjects` arrays are automatically resolved from the module's categories:

1. For each category in the module, collect all `required_properties`, `optional_properties`, `required_subobjects`, and `optional_subobjects`
2. For each collected subobject, collect its `required_properties` and `optional_properties`
3. For each resource in the ontology, include it if its `[[Category:X]]` matches a category in the module
4. The union of all collected properties becomes the module's `properties` array
5. The union of all collected subobjects becomes the module's `subobjects` array
6. The matching resources become the module's `resources` array
7. All arrays are sorted alphabetically

Run `npm run sync-modules` to recompute these fields after editing entities. Validation enforces that these arrays exactly match the resolved set.

### Module Completeness

Validation requires:
- If a module includes a child category, it must also include all parent categories
- The `properties` array must exactly match the resolved set (no missing, no extra)
- The `subobjects` array must exactly match the resolved set (no missing, no extra)
- The `resources` array must exactly match the resolved set (no missing, no extra)

### Namespace Constants

| Constant | Maps to |
|----------|---------|
| `NS_CATEGORY` | `categories/` |
| `SMW_NS_PROPERTY` | `properties/` |
| `NS_SUBOBJECT` | `subobjects/` |
| `NS_TEMPLATE` | `templates/` |
| `NS_ONTOLOGY_DASHBOARD` | `dashboards/` |
| `NS_ONTOLOGY_RESOURCE` | `resources/` |

### Dependency Resolution

When a Module is installed:
1. All modules in `dependencies` are installed first (recursively)
2. All entities listed in the module are imported
3. Duplicate entities from overlapping modules are imported only once

---

## Bundle

A Bundle is a curated collection of Modules designed for a specific deployment scenario.

### File Location

`bundles/{Bundle_id}.json`

### Format

```json
{
  "id": "Default",
  "version": "1.0.0",
  "label": "Default Bundle",
  "description": "Standard bundle with core entities",
  "modules": ["Core"]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Bundle identifier matching the filename |
| `version` | string | Yes | Semantic version of this bundle |
| `label` | string | No | Human-readable display name |
| `description` | string | Yes | What this Bundle is for |
| `modules` | string[] | Yes | Module IDs to include |

### Module Resolution

When a Bundle is installed:
1. Each Module in `modules` is resolved (including its dependencies)
2. Duplicate Modules from overlapping dependencies are installed only once
3. All entities from all resolved Modules are collected and installed

---

## Generated Artifacts

The CI pipeline generates versioned artifact directories for each module and bundle. These are what OntologySync consumes.

### Module Artifacts

```
modules/{Module_id}/versions/{version}/
├── {module_id}.vocab.json    # SMW-importable manifest
├── categories/               # Entity wikitext files
├── properties/
├── subobjects/
├── templates/
├── dashboards/
└── resources/
```

The artifact `vocab.json` is similar to the source but with:
- `dependencies` as an object mapping module IDs to versions (not an array)
- A `generated` timestamp in the `meta` block
- `importFrom` paths relative to the artifact directory

### Bundle Artifacts

```
bundles/{Bundle_id}/versions/{version}/
├── {bundle_id}.vocab.json    # Merged manifest with all module entities
├── categories/
├── properties/
└── ...
```

The bundle artifact merges all import entries from all constituent modules into a single manifest with a `modules` field mapping module IDs to their versions.

---

## Directory Structure

```
labki-ontology/
├── categories/                    # Category .wikitext files
├── properties/                    # Property .wikitext files
├── subobjects/                    # Subobject .wikitext files
├── templates/                     # Template .wikitext files (directory-based)
│   └── Property/
│       └── Page.wikitext
├── dashboards/                    # Dashboard .wikitext files (supports subpages)
│   ├── Core_overview.wikitext
│   └── Core_overview/
│       └── Setup.wikitext
├── resources/                     # Resource .wikitext files (directory-based)
│   └── Person/
│       └── John_doe.wikitext
├── modules/                       # Module definitions
│   ├── Core.vocab.json            # Source definition
│   └── Core/
│       └── versions/
│           └── 1.0.0/             # Generated artifact
├── bundles/                       # Bundle definitions
│   ├── Default.json               # Source definition
│   └── Default/
│       └── versions/
│           └── 1.0.0/             # Generated artifact
├── scripts/                       # Tooling
├── .github/workflows/             # CI/CD
├── VERSION                        # Ontology version
├── SCHEMA.md                      # This specification
└── docs/VERSIONING.md             # Versioning guide
```

---

## Naming Conventions

### Entity IDs

All entity IDs follow MediaWiki page title conventions:
- **First letter capitalized**
- **Underscores between words** (in filenames and IDs)
- **Spaces between words** (in wiki page names and `vocab.json` references)

### ID to Page Name Mapping

| Entity | Filename | ID | Wiki Page |
|--------|----------|-----|-----------|
| Category | `Person.wikitext` | `Person` | `Category:Person` |
| Category | `Research_student.wikitext` | `Research_student` | `Category:Research student` |
| Property | `Has_name.wikitext` | `Has_name` | `Property:Has name` |
| Subobject | `Address.wikitext` | `Address` | `Subobject:Address` |
| Template | `Property/Page.wikitext` | `Property/Page` | `Template:Property/Page` |
| Dashboard | `Core_overview.wikitext` | `Core_overview` | `OntologyDashboard:Core overview` |
| Resource | `Person/John_doe.wikitext` | `Person/John_doe` | `OntologyResource:Person/John doe` |

### Property ID Prefixes

Properties should use semantic prefixes:
- `Has_*` — possession or association (e.g. `Has_name`, `Has_email`)
- `Is_*` — boolean state or classification (e.g. `Is_active`, `Is_verified`)

---

## Validation Rules

### General

- All entity `.wikitext` files must have `<!-- OntologySync Start -->` and `<!-- OntologySync End -->` markers
- All entities must have a `Has description` annotation
- References to other entities must resolve to existing files

### Categories

- All `Has parent category` values must reference existing Categories
- Circular inheritance is not allowed
- All `Has required property` and `Has optional property` values must reference existing Properties
- A Property cannot appear in both required and optional
- All `Has required subobject` and `Has optional subobject` values must reference existing Subobjects
- A Subobject cannot appear in both required and optional

### Properties

- `Has type` is required and must be a valid SMW data type
- `Allows value`, `Allows pattern`, and `Allows value list` should not be combined
- `Subproperty of` must reference an existing Property
- `Has template` must reference an existing Template

### Subobjects

- All property references must point to existing Properties
- A Property cannot appear in both required and optional

### Modules

- `import` array must be present with at least one entry
- All referenced entity files must exist at the specified `importFrom` path
- All `dependencies` must reference existing Module IDs
- Circular dependencies are not allowed

### Bundles

- `modules` must reference existing Module IDs

---

## Versioning

See [docs/VERSIONING.md](docs/VERSIONING.md) for complete versioning rules.

In brief: the ontology uses semantic versioning. The CI pipeline automatically detects changes, calculates version bumps (cascading through the module dependency graph), generates artifacts, and tags releases.
