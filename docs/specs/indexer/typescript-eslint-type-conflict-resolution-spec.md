# TypeScript ESLint Type Conflict Resolution Specification

## Overview

**Issue**: GitHub #130 - @typescript-eslint nested dependency type conflict
**Domain**: Indexer
**Priority**: High
**Impact**: Critical compilation failure preventing development and CI

### Problem Statement

TypeScript compilation fails in `src/indexer/ast-parser.ts` due to conflicting versions of `@typescript-eslint/types` in nested dependencies. The `ESLintProgram` type from the parser is incompatible with the expected `Program` type due to version mismatches between direct and transitive dependencies.

**Error Pattern**:
```
Type 'ESLintProgram' is not assignable to type 'Program'.
  Types of property 'body' are incompatible.
    Type 'import(".../scope-manager/node_modules/@typescript-eslint/types/...")'
    is not assignable to type 'import(".../@typescript-eslint/types/...")'
```

**Root Cause**: Two different versions of `@typescript-eslint/types` exist in the dependency tree:
- Direct dependency: `@typescript-eslint/types@^8.54.0`
- Nested dependency: `@typescript-eslint/scope-manager/node_modules/@typescript-eslint/types@8.46.1`

## Current State Analysis

### Package Dependencies
- `@typescript-eslint/parser@^8.0.0` (resolves to 8.46.1)
- `@typescript-eslint/types@^8.54.0` (pinned to exact version)
- Transitive dependencies through `@typescript-eslint/scope-manager@8.46.1`

### Affected Code Locations
- `app/src/indexer/ast-parser.ts:122` - Return type assignment
- `app/src/indexer/ast-parser.ts:162` - AST property access
- Test files using AST node types

### Type Compatibility Issues
The core issue is in the `parseFileWithRecovery` function where the parser returns an `ESLintProgram` with types from version 8.46.1, but the function signature expects a `Program` with types from version 8.54.0.

## Technical Requirements

### 1. Dependency Version Alignment

**Goal**: Ensure all `@typescript-eslint/*` packages use compatible versions.

**Implementation Options**:

#### Option A: Version Pinning (Recommended)
- Pin all `@typescript-eslint/*` packages to the same minor version
- Use exact versions (no caret `^` ranges) for critical packages
- Add package.json overrides to force consistent transitive versions

#### Option B: Dependency Consolidation
- Use Bun's package.json `overrides` field to enforce single version
- Force all nested `@typescript-eslint/types` to use the direct dependency version

#### Option C: Selective Updates
- Update `@typescript-eslint/parser` to match `@typescript-eslint/types@8.54.0`
- Ensure all packages in the ecosystem are on compatible versions

### 2. Type Safety Enhancements

**Goal**: Prevent future type conflicts and improve error handling.

**Requirements**:
- Add type assertions where necessary for version compatibility
- Implement runtime type validation for critical AST operations
- Create utility types that abstract away version-specific differences

### 3. Build System Integration

**Goal**: Catch type conflicts early in the development process.

**Requirements**:
- Ensure TypeScript strict mode catches all type mismatches
- Add pre-commit hooks that run type checking
- Integrate dependency validation into CI pipeline

## Implementation Plan

### Phase 1: Immediate Fix (Critical)

1. **Update Package Configuration**
   ```json
   {
     "dependencies": {
       "@typescript-eslint/parser": "8.54.0",
       "@typescript-eslint/types": "8.54.0"
     },
     "overrides": {
       "@typescript-eslint/types": "8.54.0"
     }
   }
   ```

2. **Validate Type Compatibility**
   - Run `bun install` to update dependency tree
   - Execute `bunx tsc --noEmit` to verify type checking passes
   - Test AST parsing functionality with representative files

3. **Update Import Statements**
   - Review all `@typescript-eslint/types` imports
   - Ensure consistent type usage across codebase
   - Update test files to use compatible node types

### Phase 2: Defensive Programming (Important)

1. **Add Type Guards**
   ```typescript
   function isValidProgram(ast: unknown): ast is TSESTree.Program {
     return ast && typeof ast === 'object' && 'type' in ast && ast.type === 'Program';
   }
   ```

2. **Enhanced Error Handling**
   - Add version detection for `@typescript-eslint/types`
   - Log warnings for potential type mismatches
   - Graceful degradation for AST parsing failures

3. **Utility Functions**
   - Create type-safe wrappers for common AST operations
   - Abstract version-specific type differences
   - Provide fallback mechanisms for type coercion

### Phase 3: Long-term Stability (Nice-to-have)

1. **Dependency Management Strategy**
   - Establish version pinning policy for critical TypeScript tooling
   - Implement automated dependency update validation
   - Create dependency conflict detection scripts

2. **Testing Enhancements**
   - Add integration tests for AST parsing with various TypeScript versions
   - Test type compatibility across different node environments
   - Validate parsing behavior with edge cases

3. **Documentation and Monitoring**
   - Document TypeScript version compatibility requirements
   - Add dependency version monitoring to CI
   - Create troubleshooting guide for future type conflicts

## Success Criteria

### Primary Goals
- [ ] TypeScript compilation passes without errors
- [ ] All existing AST parsing functionality preserved
- [ ] No regression in indexer performance or accuracy
- [ ] CI pipeline executes successfully

### Secondary Goals
- [ ] Future type conflicts prevented through dependency management
- [ ] Clear error messages for developers encountering similar issues
- [ ] Robust type safety without sacrificing functionality

### Quality Metrics
- [ ] Zero TypeScript compilation errors
- [ ] All existing tests pass
- [ ] No performance degradation in AST parsing (< 5% overhead)
- [ ] Type coverage maintained at 100% for indexer module

## Risk Assessment

### High Risk
- **Breaking Changes**: Version updates may introduce behavioral changes
- **Performance Impact**: Type assertions may add runtime overhead
- **Dependency Conflicts**: Future package updates may reintroduce conflicts

### Medium Risk
- **Test Coverage**: Type changes may require test updates
- **API Changes**: TypeScript-ESLint API differences between versions

### Mitigation Strategies
- Pin exact versions for critical dependencies
- Comprehensive testing before deploying changes
- Staged rollout with rollback capability
- Documentation of known version compatibility issues

## Implementation Timeline

### Immediate (0-2 hours)
- Update package.json with exact versions
- Add dependency overrides
- Test compilation and basic functionality

### Short-term (1-2 days)
- Implement type guards and enhanced error handling
- Update tests and documentation
- Validate with full test suite

### Long-term (1-2 weeks)
- Establish dependency management policies
- Add monitoring and automated validation
- Create comprehensive troubleshooting documentation

## Files to Modify

### Configuration Files
- `app/package.json` - Update dependencies and add overrides
- `app/bun.lock` - Regenerate with new versions (via bun install)

### Source Code
- `app/src/indexer/ast-parser.ts` - Add type guards and error handling
- `app/src/indexer/ast-types.ts` - Update type exports if needed
- `app/src/indexer/symbol-extractor.ts` - Verify type compatibility
- `app/src/indexer/reference-extractor.ts` - Verify type compatibility

### Test Files
- `app/tests/indexer/ast-parser.test.ts` - Update for new types
- `app/tests/indexer/regex-fallback.test.ts` - Verify compatibility

### Documentation
- Update AST parser documentation with version requirements
- Add troubleshooting guide for type conflicts

## Validation Steps

1. **Pre-implementation**
   - [ ] Backup current package-lock/bun.lock
   - [ ] Document current working state
   - [ ] Identify all affected components

2. **During implementation**
   - [ ] Incremental testing after each change
   - [ ] Type checking at each step
   - [ ] Functional testing of AST parsing

3. **Post-implementation**
   - [ ] Full test suite execution
   - [ ] Performance benchmarking
   - [ ] Integration testing with real codebases
   - [ ] CI pipeline validation

## Notes

- This specification addresses a critical blocking issue that prevents development
- The solution must maintain backward compatibility with existing AST parsing logic
- Type safety improvements should not sacrifice runtime performance
- Future dependency updates should be validated against this specification

---

**Specification Author**: Indexer Plan Agent
**Created**: 2026-02-03
**Status**: Draft
**Review Required**: Yes