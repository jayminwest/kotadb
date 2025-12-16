# Changelog

All notable changes to @kotadb/core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-12-16

### Added
- Initial release of @kotadb/core
- AST parsing with @typescript-eslint/parser
- Symbol extraction (functions, classes, interfaces, types, variables, constants, methods, properties, enums)
- Reference extraction (imports, function calls, property access, type references)
- Dependency graph construction (file→file and symbol→symbol dependencies)
- Import path resolution with extension and index file handling
- Circular dependency detection using depth-first search algorithm
- Storage abstraction with two implementations:
  - MemoryStorageAdapter for testing and standalone use
  - SqliteStorageAdapter for persistent storage
- Comprehensive test suite with real fixture files
- Full TypeScript type definitions
- Zero external runtime dependencies (except @typescript-eslint parser)
