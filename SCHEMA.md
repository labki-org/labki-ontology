# Labki Schemas Specification

This document defines the schema and data structures for the Labki community ontology. These schemas are used with the SemanticSchemas MediaWiki extension in concert with Semantic MediaWiki.

## Overview

The ontology is organized into a hierarchy of concepts:

```
Bundle
  └── Module
        └── Category
              ├── Property
              ├── Subobject
              └── (inherits from parent Category)
```

| Concept | Purpose | Location |
|---------|---------|----------|
| **Bundle** | A curated collection of Modules for specific use cases | `bundles/` |
| **Module** | A logical grouping of related Categories | `modules/` |
| **Category** | An entity type (e.g., Person, Project) | `categories/` |
| **Property** | An attribute that can be assigned to Categories | `properties/` |
| **Subobject** | A nested structure embedded within a Category | `subobjects/` |
| **Template** | A display template for rendering Property values | `templates/` |

---

## Category

A Category defines an entity type in the ontology. Categories support multiple inheritance and distinguish between required and optional properties/subobjects.

### File Location

`categories/{CategoryName}.json`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "parents": ["string"] (optional),
  "required_properties": ["string"] (optional),
  "optional_properties": ["string"] (optional),
  "required_subobjects": ["string"] (optional),
  "optional_subobjects": ["string"] (optional)
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`) |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Category represents |
| `parents` | string[] | No | Array of parent Category IDs to inherit from (supports multiple inheritance) |
| `required_properties` | string[] | No | Property IDs that must be provided for instances of this Category |
| `optional_properties` | string[] | No | Property IDs that may optionally be provided |
| `required_subobjects` | string[] | No | Subobject IDs that must be provided for instances of this Category |
| `optional_subobjects` | string[] | No | Subobject IDs that may optionally be provided |

### Inheritance

Categories support multiple inheritance through the `parents` array:

- A Category inherits all properties and subobjects from every parent
- Inherited properties/subobjects retain their required/optional status from the parent
- Child-defined properties/subobjects are merged with inherited ones
- The inheritance chain can be multiple levels deep
- When the same property is inherited from multiple parents, it is included only once

**Constraint Narrowing (Future):** Child Categories will be able to further constrain inherited properties (e.g., making an optional property required), but cannot loosen constraints. This ensures a child instance is always valid as an instance of its parents.

### Example: Single Parent

```json
{
  "id": "Person",
  "label": "Person",
  "description": "A human being",
  "parents": ["Agent"],
  "required_properties": ["Has_name"],
  "optional_properties": ["Has_email", "Has_birthdate"],
  "optional_subobjects": ["Address"]
}
```

### Example: Multiple Inheritance

```json
{
  "id": "Research_student",
  "label": "Research Student",
  "description": "A student who also conducts research",
  "parents": ["Student", "Researcher"],
  "required_properties": ["Has_advisor"],
  "optional_properties": ["Has_thesis_title"]
}
```

---

## Property

A Property defines an attribute that can be assigned to Categories. Properties specify the data type, cardinality, and optional constraints.

### File Location

`properties/{property_id}.json`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "datatype": "string (required)",
  "cardinality": "string (required)",
  "allowed_values": ["string"] (optional),
  "allowed_pattern": "string (optional)",
  "allowed_value_list": "string (optional)",
  "display_units": ["string"] (optional),
  "display_precision": "number (optional)",
  "unique_values": "boolean (optional)",
  "parent_property": "string (optional)",
  "has_display_template": "string (optional)"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`). Convention: `Has_*` or `Is_*` prefix |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Property represents |
| `datatype` | string | Yes | The Semantic MediaWiki data type (see Datatypes below) |
| `cardinality` | string | Yes | Either `"single"` or `"multiple"` |
| `allowed_values` | string[] | No | Enumeration of permitted values (for constrained fields) |
| `allowed_pattern` | string | No | Regex pattern for validating values (maps to SMW `Allows pattern`) |
| `allowed_value_list` | string | No | Reference to a wiki page containing a list of allowed values |
| `display_units` | string[] | No | Units or formats for display (e.g., `["km", "mi"]` for distances) |
| `display_precision` | number | No | Number of decimal places for numeric display |
| `unique_values` | boolean | No | If true, each value can only be assigned once across all pages |
| `parent_property` | string | No | ID of a parent Property (creates property hierarchy via `Subproperty of`) |
| `has_display_template` | string | No | Reference to a Template for custom rendering |

### Datatypes

| Datatype | Description | Example Values |
|----------|-------------|----------------|
| `Text` | Plain text string | `"John Doe"` |
| `Email` | Email address | `"user@example.com"` |
| `Date` | Calendar date | `"2024-01-15"` |
| `URL` | Web address | `"https://example.com"` |
| `Page` | Internal wiki page reference | `"Organization:Acme Corp"` |
| `Number` | Numeric value | `42`, `3.14` |
| `Boolean` | True/false value | `true`, `false` |
| `Telephone` | Phone number | `"+1-555-123-4567"` |
| `Geographic coordinate` | Lat/long coordinates | `"37.7749, -122.4194"` |

### Cardinality

- `"single"`: Property accepts exactly one value
- `"multiple"`: Property accepts zero or more values (stored as a list)

### Example

```json
{
  "id": "Has_email",
  "label": "Email",
  "description": "Contact email address",
  "datatype": "Email",
  "cardinality": "multiple"
}
```

### Example with Constraints

```json
{
  "id": "Has_status",
  "label": "Status",
  "description": "Current status of the entity",
  "datatype": "Text",
  "cardinality": "single",
  "allowed_values": ["planned", "active", "completed", "cancelled"]
}
```

### Example with Display Template

```json
{
  "id": "Has_related_page",
  "label": "Related Page",
  "description": "Link to a related wiki page",
  "datatype": "Page",
  "cardinality": "multiple",
  "has_display_template": "Template:Property/Page"
}
```

### Example with Units and Precision

```json
{
  "id": "Has_distance",
  "label": "Distance",
  "description": "Distance measurement",
  "datatype": "Number",
  "cardinality": "single",
  "display_units": ["km", "mi", "m"],
  "display_precision": 2
}
```

### Example with Pattern Validation

```json
{
  "id": "Has_orcid",
  "label": "ORCID",
  "description": "Open Researcher and Contributor ID",
  "datatype": "Text",
  "cardinality": "single",
  "allowed_pattern": "^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$",
  "unique_values": true
}
```

### Example with Property Hierarchy

```json
{
  "id": "Has_work_email",
  "label": "Work Email",
  "description": "Professional email address",
  "datatype": "Email",
  "cardinality": "single",
  "parent_property": "Has_email"
}
```

---

## Subobject

A Subobject defines a reusable nested structure that can be embedded within Categories. Like Categories, Subobjects reference existing Properties and distinguish between required and optional properties.

### File Location

`subobjects/{SubobjectName}.json`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "required_properties": ["string"] (optional),
  "optional_properties": ["string"] (optional)
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`) |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Subobject represents |
| `required_properties` | string[] | No | Property IDs that must be provided when using this Subobject |
| `optional_properties` | string[] | No | Property IDs that may optionally be provided |

### Example

```json
{
  "id": "Address",
  "label": "Address",
  "description": "A physical or mailing address",
  "required_properties": ["Has_street", "Has_city", "Has_country"],
  "optional_properties": ["Has_postal_code", "Has_state"]
}
```

### Example: Display Section

```json
{
  "id": "Display_section",
  "label": "Display Section",
  "description": "Defines a section for property grouping in display templates",
  "required_properties": ["Has_display_section_name"],
  "optional_properties": ["Has_display_section_property"]
}
```

---

## Template

A Template defines how Property values are rendered in the wiki. Templates contain MediaWiki wikitext with placeholders.

### File Location

`templates/{TemplatePath}.json`

Templates can use nested folders to create subpage hierarchies. The folder structure maps to `/` in the MediaWiki template name:
- `templates/Property/Page.json` → `Template:Property/Page`
- `templates/Display/Table.json` → `Template:Display/Table`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "wikitext": "string (required)"
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`) |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Template does |
| `wikitext` | string | Yes | The MediaWiki wikitext template content |

### Placeholders

Templates receive the property value via `{{{value|}}}` placeholder.

### Example

```json
{
  "id": "Property/Page",
  "label": "Page Link Template",
  "description": "Renders page references as clickable wiki links",
  "wikitext": "<includeonly>{{#if:{{{value|}}}|{{#arraymap:{{{value|}}}|,|@@item@@|[[:@@item@@]]|,&#32;}}|}}</includeonly>"
}
```

---

## Module

A Module is a logical grouping of related schema entities. Modules explicitly declare all the Categories, Properties, Subobjects, and Templates they provide, and can depend on other Modules.

### File Location

`modules/{module_id}.json`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "categories": ["string"] (optional),
  "properties": ["string"] (optional),
  "subobjects": ["string"] (optional),
  "templates": ["string"] (optional),
  "dependencies": ["string"] (optional)
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`) |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Module provides |
| `categories` | string[] | No | List of Category IDs included in this Module |
| `properties` | string[] | No | List of Property IDs included in this Module |
| `subobjects` | string[] | No | List of Subobject IDs included in this Module |
| `templates` | string[] | No | List of Template IDs included in this Module |
| `dependencies` | string[] | No | List of Module IDs that must be installed first |

**Note:** At least one of `categories`, `properties`, `subobjects`, or `templates` must be present.

### Dependency Resolution

When a Module is installed:
1. All Modules in `dependencies` are installed first (recursively)
2. All entities (Categories, Properties, Subobjects, Templates) declared in the Module are installed
3. Duplicate entities from overlapping modules are installed only once

### Example

```json
{
  "id": "Research",
  "label": "Research Module",
  "description": "Categories for academic and research contexts",
  "categories": ["Researcher", "Student"],
  "properties": ["Has_orcid", "Has_affiliation", "Has_major"],
  "subobjects": [],
  "templates": [],
  "dependencies": ["Core"]
}
```

### Example: Properties-Only Module

```json
{
  "id": "Contact_info",
  "label": "Contact Info Module",
  "description": "Common contact-related properties",
  "properties": ["Has_email", "Has_phone", "Has_website"],
  "templates": ["Property/Email", "Property/Phone"]
}
```

---

## Bundle

A Bundle is a curated collection of Modules designed for a specific use case or deployment scenario.

### File Location

`bundles/{bundle_id}.json`

### Schema

```json
{
  "id": "string (required)",
  "label": "string (required)",
  "description": "string (required)",
  "modules": ["string"] (required)
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique identifier matching the filename (without `.json`) |
| `label` | string | Yes | Human-readable display name |
| `description` | string | Yes | Explanation of what this Bundle is designed for |
| `modules` | string[] | Yes | List of Module IDs to include |

### Module Resolution

When a Bundle is installed:
1. Each Module in `modules` is resolved (including its dependencies)
2. Duplicate Modules (from overlapping dependencies) are installed only once
3. All Categories, Properties, Subobjects, and Templates are collected and installed

### Example

```json
{
  "id": "Full",
  "label": "Full Bundle",
  "description": "Complete installation with all available modules",
  "modules": ["Core", "Research", "Projects"]
}
```

---

## Directory Structure

```
labki-ontology/
├── SCHEMA.md           # This specification document
├── VERSION             # Version file
├── bundles/            # Bundle definitions
│   ├── Default.json
│   └── Full.json
├── modules/            # Module definitions
│   ├── Core.json
│   ├── Research.json
│   └── Projects.json
├── categories/         # Category definitions
│   ├── Agent.json
│   ├── Person.json
│   └── ...
├── properties/         # Property definitions
│   ├── Has_name.json
│   ├── Has_email.json
│   └── ...
├── subobjects/         # Subobject definitions
│   └── Address.json
└── templates/          # Template definitions
    └── Property/
        └── Page.json
```

---

## Naming Conventions

### ID Format

All entity IDs follow MediaWiki page title conventions:
- **First letter capitalized**
- **Underscores between words**
- **All other letters lowercase**

This ensures IDs can be used directly as MediaWiki page titles.

### Examples by Type

| Concept | File Name | ID | MediaWiki Page Title |
|---------|-----------|----|-----------------------|
| Category | `Person.json` | `Person` | `Category:Person` |
| Category | `Research_student.json` | `Research_student` | `Category:Research_student` |
| Property | `Has_name.json` | `Has_name` | `Property:Has_name` |
| Property | `Has_university_id.json` | `Has_university_id` | `Property:Has_university_id` |
| Subobject | `Address.json` | `Address` | `Subobject:Address` |
| Subobject | `Display_section.json` | `Display_section` | `Subobject:Display_section` |
| Module | `Core.json` | `Core` | N/A |
| Module | `Lab_equipment.json` | `Lab_equipment` | N/A |
| Bundle | `Full.json` | `Full` | N/A |
| Bundle | `Lab_core.json` | `Lab_core` | N/A |
| Template | `Property/Page.json` | `Property/Page` | `Template:Property/Page` |

### Property ID Prefixes

Properties should use semantic prefixes:
- `Has_*` - indicates possession or association (e.g., `Has_name`, `Has_email`)
- `Is_*` - indicates boolean state or classification (e.g., `Is_active`, `Is_verified`)

---

## Validation Rules

### General

- All `id` fields must match the filename (without `.json`)
- All required fields must be present and non-empty
- References to other entities must resolve to existing files

### Categories

- All IDs in `parents` must reference existing Categories
- Circular inheritance is not allowed (a Category cannot be its own ancestor)
- All IDs in `required_properties` and `optional_properties` must reference existing Property IDs
- A Property ID cannot appear in both `required_properties` and `optional_properties`
- All IDs in `required_subobjects` and `optional_subobjects` must reference existing Subobject IDs
- A Subobject ID cannot appear in both `required_subobjects` and `optional_subobjects`

### Properties

- `datatype` must be a valid Semantic MediaWiki datatype
- `cardinality` must be either `"single"` or `"multiple"`
- `allowed_values` (if present) must be a non-empty array of strings
- `allowed_pattern` (if present) must be a valid regex pattern
- `allowed_value_list` (if present) must reference a valid wiki page
- `display_units` (if present) must be a non-empty array of strings
- `display_precision` (if present) must be a non-negative integer
- `parent_property` (if present) must reference an existing Property ID
- `has_display_template` (if present) must reference an existing Template
- Mutually exclusive: `allowed_values`, `allowed_pattern`, and `allowed_value_list` should not be combined

### Subobjects

- All IDs in `required_properties` and `optional_properties` must reference existing Property IDs
- A Property ID cannot appear in both `required_properties` and `optional_properties`

### Modules

- At least one of `categories`, `properties`, `subobjects`, or `templates` must be present
- All IDs in `categories` must reference existing Category IDs
- All IDs in `properties` must reference existing Property IDs
- All IDs in `subobjects` must reference existing Subobject IDs
- All IDs in `templates` must reference existing Template IDs
- All IDs in `dependencies` must reference existing Module IDs
- Circular dependencies are not allowed

### Bundles

- `modules` must reference existing Module IDs

### JSON Schema Validation

Each entity type has a formal JSON Schema file for automated validation:

| Entity Type | Schema Location |
|-------------|-----------------|
| Category | `categories/_schema.json` |
| Property | `properties/_schema.json` |
| Subobject | `subobjects/_schema.json` |
| Module | `modules/_schema.json` |
| Bundle | `bundles/_schema.json` |
| Template | `templates/_schema.json` |

These schemas enforce:
- Required fields are present
- Field types are correct
- ID naming conventions are followed
- Arrays contain unique items

To validate a file against its schema:
```bash
# Using ajv-cli
npx ajv validate -s categories/_schema.json -d categories/Person.json
```

---

## Versioning

Schema files should follow semantic versioning principles:
- **Major**: Breaking changes to schema structure
- **Minor**: New optional fields or concepts
- **Patch**: Documentation and bug fixes

Version information is tracked via git tags and releases.
