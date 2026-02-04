# Documentation Standardization and Content Sync Specification

**Issue:** [#157](https://github.com/jayminwest/kotadb/issues/157)
**Status:** Approved
**Owner:** documentation-build-agent
**Complexity:** High
**Priority:** High
**Created:** 2026-02-04
**Updated:** 2026-02-04

## Summary

Comprehensive documentation update to resolve version mismatches, standardize references, fix broken links, sync content between directories, and document missing v2.2.0 features across all KotaDB documentation.

## Problem Statement

The KotaDB documentation contains multiple critical inconsistencies:

1. **Version Mismatches**: Documentation references outdated version 2.0.1 instead of current 2.2.0
2. **Database Location Inconsistencies**: Mixed references to database locations (some use outdated paths)
3. **Package Name Inconsistencies**: Some docs reference `@next` variants instead of standard `kotadb`
4. **Broken Internal Links**: Multi-repo guide references point to non-existent sections
5. **CHANGELOG Issues**: Duplicate headers and date inconsistencies
6. **Missing v2.2.0 Features**: Undocumented features from latest release
7. **Content Divergence**: `docs/` and `web/docs/` directories are out of sync
8. **Outdated CLAUDE.md**: Missing web expert domain and memory layer tools
9. **Stale Content**: Thin documentation sections and outdated references
10. **Blog/Sitemap Issues**: Incorrect dates and missing content

## Solution Overview

### Phase 1: Version and Reference Standardization

**Target Files:**
- `web/docs/content/installation.md` - Fix version 2.0.1 → 2.2.0
- `web/docs/content/configuration.md` - Update version references
- `web/docs/content/api-reference.md` - Update version and references
- `web/docs/content/architecture.md` - Update version and database paths
- All documentation files with version references

**Actions:**
1. Update all version references from `2.0.1` to `2.2.0`
2. Standardize database location references to `.kotadb/kota.db`
3. Replace all `@next` package references with `kotadb`
4. Update `last_updated` dates to `2026-02-04`

### Phase 2: CHANGELOG Cleanup

**Target File:** `CHANGELOG.md`

**Issues to Fix:**
- Remove duplicate `## [2.0.0] - 2025-01-28` header at lines 64-65
- Ensure consistent date formatting
- Verify chronological order of releases

### Phase 3: Internal Link Resolution

**Target Files:**
- `docs/multi-repo-guide.md`
- Any files referencing multi-repo guide sections

**Actions:**
1. Audit all internal markdown links using pattern `[text](#section)`
2. Fix broken references to multi-repo guide
3. Update cross-references between `docs/` and `web/docs/` directories

### Phase 4: Missing v2.2.0 Features Documentation

**New Content Required:**

1. **Unified Search Tool** (`mcp__kotadb-bunx__search_unified`)
   - Document consolidated search operations
   - Usage examples and API reference
   - Integration patterns

2. **CLI --toolset Flag**
   - Document tool filtering by category
   - Examples of focused workflows
   - Available toolset categories

3. **Memory Layer Tools**
   - Document persistent intelligence features
   - API reference for memory tools
   - Cross-session context patterns

4. **Web Expert Domain**
   - Document web/marketing site capabilities
   - Integration with existing domains
   - Usage patterns and examples

### Phase 5: CLAUDE.md Updates

**Target File:** `CLAUDE.md`

**Updates Required:**
1. Add `web` expert domain to table:
   ```
   | `web` | Web content, design system, marketing site | `.claude/agents/experts/web/` |
   ```
2. Document memory layer tools in MCP tool selection guide
3. Add web domain usage examples
4. Update expert domain count (Nine → Ten)

### Phase 6: Content Synchronization

**Directory Sync:**
- `docs/` ↔ `web/docs/content/`

**Files to Sync:**
1. `docs/architecture.md` ↔ `web/docs/content/architecture.md`
2. `docs/api-reference.md` ↔ `web/docs/content/api-reference.md`
3. Create missing files in either directory
4. Resolve content conflicts with preference for most recent updates

**Sync Strategy:**
1. Compare file modification times
2. Merge unique content from both versions
3. Standardize frontmatter format
4. Ensure consistent cross-references

### Phase 7: Content Enhancement

**Thin Documentation Sections:**
1. Expand installation troubleshooting
2. Add more configuration examples
3. Enhance API reference with request/response examples
4. Add integration guides for different frameworks

**New Sections:**
1. Memory Layer Architecture
2. Expert Domain Relationships
3. Workflow Automation Patterns
4. Advanced MCP Tool Usage

### Phase 8: Blog and Sitemap Updates

**Blog Posts:**
- `web/blog/content/2026-01-15-launch-announcement.md` - Update content for v2.2.0
- `web/blog/content/2026-01-20-local-first-philosophy.md` - Add memory layer discussion

**Actions:**
1. Update blog post dates if needed
2. Add new blog post for v2.2.0 features
3. Update sitemap.xml with correct dates
4. Verify all blog content reflects current features

## Implementation Plan

### Step 1: Audit and Assessment
- [ ] Create comprehensive file inventory with version references
- [ ] Identify all broken internal links
- [ ] Map content differences between `docs/` and `web/docs/`
- [ ] Document all v2.2.0 features requiring documentation

### Step 2: Version Standardization
- [ ] Update all version references in documentation files
- [ ] Standardize database path references
- [ ] Replace package name variants
- [ ] Update modification dates

### Step 3: Structural Fixes
- [ ] Fix CHANGELOG duplicate headers
- [ ] Resolve broken internal links
- [ ] Sync directory contents
- [ ] Update CLAUDE.md expert domain table

### Step 4: Content Creation
- [ ] Document unified search tool
- [ ] Document CLI --toolset flag
- [ ] Document memory layer features
- [ ] Document web expert domain

### Step 5: Content Enhancement
- [ ] Expand thin sections
- [ ] Add missing examples
- [ ] Create new integration guides
- [ ] Update blog content

### Step 6: Validation
- [ ] Verify all links work
- [ ] Check version consistency
- [ ] Validate content accuracy
- [ ] Test documentation examples

## Files Affected

### Primary Updates
- `CHANGELOG.md` - Fix duplicate headers
- `CLAUDE.md` - Add web domain, memory tools
- `web/docs/content/installation.md` - Version update
- `web/docs/content/configuration.md` - Version and references
- `web/docs/content/api-reference.md` - Version and features
- `web/docs/content/architecture.md` - Version and database paths
- `docs/multi-repo-guide.md` - Link fixes
- `web/blog/content/2026-01-15-launch-announcement.md` - Feature updates
- `web/blog/content/2026-01-20-local-first-philosophy.md` - Memory layer

### New Files
- `docs/memory-layer-guide.md` - Memory layer documentation
- `docs/web-expert-domain.md` - Web domain guide
- `docs/unified-search-guide.md` - Search tool documentation
- `web/blog/content/2026-02-04-v2-2-0-release.md` - Release announcement

### Directory Sync
- All files in `docs/` requiring sync with `web/docs/content/`
- All files in `web/docs/content/` requiring sync with `docs/`

## Validation Criteria

### Version Consistency
- [ ] All documentation references version 2.2.0
- [ ] No outdated version references remain
- [ ] Package names consistently use `kotadb`

### Database References
- [ ] All database paths reference `.kotadb/kota.db`
- [ ] No inconsistent database location references

### Link Integrity
- [ ] All internal markdown links resolve correctly
- [ ] Cross-references between directories work
- [ ] No broken anchor links

### Content Completeness
- [ ] All v2.2.0 features documented
- [ ] Memory layer tools documented
- [ ] Web expert domain documented
- [ ] Examples work with current version

### Directory Synchronization
- [ ] `docs/` and `web/docs/content/` contain consistent content
- [ ] No conflicting information between directories
- [ ] Frontmatter consistently formatted

## Risk Assessment

**Low Risk:**
- Version number updates
- Database path standardization
- Broken link fixes

**Medium Risk:**
- Content synchronization (potential conflicts)
- CHANGELOG cleanup (history preservation)

**High Risk:**
- Large-scale content creation for missing features
- Directory structure changes

## Dependencies

**Upstream:**
- Completion of v2.2.0 feature development
- Finalization of memory layer implementation
- Web expert domain agent completion

**Downstream:**
- Website deployment after content updates
- Search indexing refresh for new content
- User-facing documentation updates

## Success Metrics

1. **Zero version inconsistencies** across all documentation
2. **All internal links resolve** correctly
3. **Complete feature coverage** for v2.2.0
4. **Content synchronization** between directories
5. **Enhanced documentation** with expanded sections
6. **Updated blog content** reflecting current capabilities

## Timeline

**Phase 1-3 (Standardization):** 1 day
**Phase 4-5 (New Content):** 2 days
**Phase 6-7 (Sync/Enhancement):** 1 day
**Phase 8 (Blog/Validation):** 1 day

**Total Estimated Effort:** 5 days

## Notes

- Preserve all existing content while fixing inconsistencies
- Maintain backward compatibility for external links where possible
- Ensure all examples use current API patterns
- Validate documentation accuracy against actual implementation
- Consider automated link checking for future maintenance