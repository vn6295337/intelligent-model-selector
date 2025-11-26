# Intelligent Model Selector - Documentation Index

**All documentation consolidated in `00_docs/` directory following MECE principles.**

---

## Navigation

**Start here:** [README.md](README.md) - Project overview, quick start

**Then explore:**
- [Project Overview](#1-project-overview) - Mission, goals, technical decisions
- [Getting Started](#2-getting-started) - Setup and installation
- [Architecture](#3-architecture) - System design and algorithms
- [Database](#4-database) - Schema and 3-table architecture
- [Testing](#5-testing) - Testing strategies
- [Configuration](#6-configuration) - Environment variables
- [Implementation Status](#7-implementation-status) - Progress tracking
- [Migration History](#8-migration-history) - Data architecture migration

---

## Documentation Files

### 1. Project Overview
**File:** [00_docs/01_project_overview.md](00_docs/01_project_overview.md)

**Contents:**
- Project mission and value proposition
- Problem statement
- MVP goals by phase
- Technical decisions and rationale
- Success metrics
- Risk assessment
- Decision log

**Use this to:** Understand project goals, architectural decisions, and success criteria

---

### 2. Getting Started
**File:** [00_docs/02_getting_started.md](00_docs/02_getting_started.md)

**Contents:**
- Prerequisites
- Installation steps
- Environment configuration
- Running the service
- Verification and testing
- Troubleshooting

**Use this to:** Set up development environment, configure service, verify installation

---

### 3. Architecture
**File:** [00_docs/03_architecture.md](00_docs/03_architecture.md)

**Contents:**
- High-level architecture diagram
- Component design
- Selection algorithm (5-factor scoring)
- 3-table data architecture
- Caching strategy (24-hour TTL)
- Rate limit intelligence
- Integration points with askme_v2

**Use this to:** Understand system design, selection algorithm, data flows

---

### 4. Database Schema
**File:** [00_docs/04_database_schema.md](00_docs/04_database_schema.md)

**Contents:**
- 3-table architecture overview
- Table schemas (working_version, model_aa_mapping, aa_performance_metrics)
- Query patterns
- Application-level JOIN implementation
- RLS policies
- Maintenance procedures

**Use this to:** Query database, understand data model, maintain mappings

---

### 5. Testing Strategy
**File:** [00_docs/05_testing_strategy.md](00_docs/05_testing_strategy.md)

**Contents:**
- Coverage requirements (80%)
- Testing pyramid
- Unit testing approach
- Integration testing scenarios
- API testing
- Mocking strategies

**Use this to:** Write tests, understand test structure, achieve coverage goals

---

### 6. Configuration
**File:** [00_docs/06_configuration.md](00_docs/06_configuration.md)

**Contents:**
- Environment variables (required & optional)
- Configuration constants
- Selection weights
- Rate limit defaults
- Cache TTLs
- Deployment configurations
- Troubleshooting

**Use this to:** Configure service, adjust scoring weights, troubleshoot issues

---

### 7. Implementation Status
**File:** [00_docs/07_implementation_status.md](00_docs/07_implementation_status.md)

**Contents:**
- Overall progress (98% complete)
- Phase-by-phase completion status
- Remaining tasks
- Key metrics (performance, quality, integration)
- API endpoints
- Deployment status

**Use this to:** Track progress, understand what's complete, identify remaining work

---

### 8. Migration History
**File:** [00_docs/08_migration_history.md](00_docs/08_migration_history.md)

**Contents:**
- Migration from custom `models` table to `working_version`
- 3-table architecture implementation
- Challenges and solutions
- Fuzzy matching algorithm
- Benefits achieved
- Future maintenance

**Use this to:** Understand migration decisions, maintain mappings, improve coverage

---

## Quick Reference

| Task | Document |
|------|----------|
| Understand project goals | 01_project_overview.md |
| Set up development environment | 02_getting_started.md |
| Understand selection algorithm | 03_architecture.md |
| Query database tables | 04_database_schema.md |
| Write tests | 05_testing_strategy.md |
| Configure service | 06_configuration.md |
| Track development progress | 07_implementation_status.md |
| Understand data migration | 08_migration_history.md |

---

## File Organization

```
intelligent-model-selector/
├── 00_docs/                  # All documentation (8 consolidated files)
│   ├── 01_project_overview.md
│   ├── 02_getting_started.md
│   ├── 03_architecture.md
│   ├── 04_database_schema.md
│   ├── 05_testing_strategy.md
│   ├── 06_configuration.md
│   ├── 07_implementation_status.md
│   └── 08_migration_history.md
│
├── selector-service/         # Service code
│   ├── src/
│   │   ├── config/           # Configuration modules
│   │   ├── services/         # Business logic
│   │   ├── utils/            # Utility functions
│   │   └── __tests__/        # Test files
│   ├── .env.example          # Environment template
│   ├── package.json          # NPM configuration
│   └── README.md             # Service-specific docs
│
├── INDEX.md                  # This file
├── README.md                 # Project overview
├── CLAUDE.md                 # AI assistant guide
└── LICENSE                   # MIT License
```

---

## Documentation Principles

### MECE Compliance
✅ Each document covers distinct topic area
✅ No content overlap between documents
✅ All aspects of project are documented
✅ Clear navigation path for any task

### Consolidated Structure
✅ All docs in single `00_docs/` directory
✅ Serial numbering (01-08) for logical order
✅ Essential information only (fluff removed)
✅ Cross-references for related content

### Naming Convention
- Documentation: `##_descriptive_name.md` (serial numbered)
- Root files: `UPPERCASE.md` (README, INDEX, CLAUDE)
- Code: `camelCase.js` (utilities) or `PascalCase.js` (classes)
- Folders: `kebab-case/` (services) or `lowercase/` (src modules)

---

**Last Updated:** 2025-11-24
**Total Documentation:** 8 consolidated files in `00_docs/`
