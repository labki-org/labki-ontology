# Labki Ontology

The versioned ground truth of the shared ontology used across MediaWiki installations. Entity definitions are stored as `.wikitext` files with semantic annotations, organized into modules and bundles.

## Ecosystem

This repository is the source of truth. It connects to MediaWiki through two extensions and is managed through a web interface:

| Project | Role |
|---------|------|
| **labki-ontology** (this repo) | Stores the canonical ontology definitions |
| [SemanticSchemas](https://github.com/labki-org/SemanticSchemas) | MediaWiki extension that provides schema-driven ontology management on each wiki |
| [OntologySync](https://github.com/labki-org/OntologySync) | MediaWiki extension that syncs this repo's ontology into wiki instances |
| [Ontology Hub](https://github.com/labki-org/ontology-hub) | Web application for browsing and editing the ontology ([schemas.labki.org](https://schemas.labki.org)) |

**Typical workflow:** Edit via Ontology Hub &rarr; changes land here as commits &rarr; OntologySync pulls updates into wiki instances &rarr; SemanticSchemas manages the schema on each wiki.

While this repo _can_ be edited directly (everything is plain `.wikitext`), the intended workflow is through Ontology Hub.

## Structure

```
labki-ontology/
├── categories/          # Entity type definitions (.wikitext)
├── properties/          # Attribute definitions (.wikitext)
├── subobjects/          # Reusable nested structures (.wikitext)
├── templates/           # Display templates (.wikitext, directory-based)
├── dashboards/          # Wiki dashboard pages (.wikitext, supports subpages)
├── resources/           # Pre-filled content pages (.wikitext, directory-based)
├── modules/             # Module vocab.json files + versioned artifacts
│   └── {Module}/versions/{version}/   # Generated artifacts
├── bundles/             # Bundle definitions + versioned artifacts
│   └── {Bundle}/versions/{version}/   # Generated artifacts
├── scripts/             # Validation, artifact generation, CI tooling
├── .github/workflows/   # CI/CD pipelines
├── SCHEMA.md            # Complete specification
├── docs/VERSIONING.md   # Versioning guide
└── VERSION              # Current ontology version
```

## Entity Types

| Type | Format | Description | Example |
|------|--------|-------------|---------|
| **Category** | `.wikitext` | Entity types with multiple inheritance | `categories/Person.wikitext` |
| **Property** | `.wikitext` | Typed attributes with constraints | `properties/Has_name.wikitext` |
| **Subobject** | `.wikitext` | Reusable nested structures | `subobjects/Address.wikitext` |
| **Template** | `.wikitext` | Display formatting for property values | `templates/Property/Page.wikitext` |
| **Dashboard** | `.wikitext` | Wiki dashboard pages with SMW queries | `dashboards/Core_overview.wikitext` |
| **Resource** | `.wikitext` | Pre-filled content pages (instances) | `resources/Person/John_doe.wikitext` |
| **Module** | `.vocab.json` | Logical groupings of entities | `modules/Core.vocab.json` |
| **Bundle** | `.json` | Curated collections of modules | `bundles/Default.json` |

## Wikitext Format

Entity definitions use MediaWiki semantic annotations inside OntologySync markers:

```wikitext
<!-- OntologySync Start -->
[[Has type::Email]]
[[Has description::Email address for contact]]
[[Display label::Email]]
[[Allows multiple values::true]]
<!-- OntologySync End -->
[[Category:OntologySync-managed-property]]
```

See [SCHEMA.md](SCHEMA.md) for the complete specification of each entity type.

## Modules and Bundles

**Modules** group related entities and declare dependencies on other modules. Each module is defined by a `vocab.json` file that lists its entities by namespace:

```
modules/Core.vocab.json    # Module definition
```

**Bundles** are curated collections of modules for specific use cases:

```
bundles/Default.json       # Bundle definition
```

The CI pipeline generates versioned artifacts under each module/bundle directory:

```
modules/Core/versions/1.0.0/
├── core.vocab.json        # SMW-importable manifest
├── categories/            # Entity wikitext files
├── properties/
└── ...
```

These artifacts are what OntologySync consumes to install ontology content into wiki instances.

## Validation

```bash
npm run validate              # Validate all entities
npm run validate -- --changed-only  # Validate only changed entities (used in CI)
```

Validation checks:
- Structural integrity (required annotations present)
- Reference integrity (all referenced entities exist)
- Cycle detection (no circular inheritance or dependencies)
- Orphan detection (entities not in any module)
- Version consistency

## Development

```bash
npm test                  # Unit tests
npm run test:integration  # Integration tests
npm run test:all          # All tests
npm run generate-artifacts -- --all  # Generate all module/bundle artifacts
```

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `validate.yml` | PR, push to main | Validates entity definitions |
| `test.yml` | PR, push to main | Runs unit and integration tests |
| `release.yml` | Push to main | Detects changes, bumps versions, generates artifacts, tags releases |

The release pipeline automatically:
1. Detects which entities changed
2. Identifies affected modules and bundles
3. Calculates version bumps (cascading through the dependency graph)
4. Generates versioned artifacts
5. Commits and tags the release

## Documentation

- [SCHEMA.md](SCHEMA.md) — Complete entity specification with wikitext examples
- [docs/VERSIONING.md](docs/VERSIONING.md) — Versioning rules and CI behavior

## License

[TBD]
# Sync test 2026-03-27T22:59:48-07:00
