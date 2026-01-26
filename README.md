# Labki Ontology

A community-developed ontology for structuring data across MediaWiki installations using the SemanticSchemas extension with [Semantic MediaWiki](https://www.semantic-mediawiki.org/).

## Overview

This repository contains schema definitions for standardized entity types, properties, and data structures. The ontology is modular, allowing wikis to install only the components they need.

## Structure

```
labki-ontology/
├── bundles/        # Curated collections of modules for specific use cases
├── modules/        # Logical groupings of related entities
├── categories/     # Entity type definitions (e.g., Person, Organization)
├── properties/     # Attribute definitions (e.g., Has_name, Has_email)
├── subobjects/     # Reusable nested structures (e.g., Address)
├── templates/      # Display templates for rendering property values
├── SCHEMA.md       # Complete specification document
└── VERSION         # Current schema version
```

## Entity Types

| Type | Description | Example |
|------|-------------|---------|
| **Category** | Entity types with inheritance | Person, Organization |
| **Property** | Attributes with datatypes | Has_name, Has_email |
| **Subobject** | Nested structures | Address |
| **Template** | Display formatting | Property/Page |
| **Module** | Entity groupings | Core |
| **Bundle** | Module collections | Default |

## Naming Conventions

All IDs follow MediaWiki page title conventions:
- First letter capitalized
- Underscores between words
- Properties use `Has_*` or `Is_*` prefixes

Examples:
- Category: `Person`, `Research_student`
- Property: `Has_name`, `Has_email`, `Is_active`
- Subobject: `Address`, `Contact_info`

## Validation

Each entity type has a JSON Schema for validation:

```bash
# Validate a category
npx ajv validate -s categories/_schema.json -d categories/Person.json

# Validate a property
npx ajv validate -s properties/_schema.json -d properties/Has_name.json
```

## Documentation

See [SCHEMA.md](SCHEMA.md) for the complete specification including:
- Detailed field descriptions for each entity type
- Inheritance and dependency rules
- Validation constraints
- Examples

## Contributing

Contributions are welcome!

The easiest way to contribute is through [schemas.labki.org](https://schemas.labki.org), which provides a user-friendly interface for browsing, creating, and editing schema entities. The frontend is powered by the [ontology-hub](https://github.com/labki-org/ontology-hub) project.

For direct contributions to this repository:

1. Follow the naming conventions above
2. Validate against the appropriate `_schema.json`
3. Add entities to an appropriate module
4. Update the module's entity lists

## License

[TBD]
