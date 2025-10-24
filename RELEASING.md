# Releasing Guide

This document describes the release process for the OAuth Connector SDK.

## Table of Contents

- [Semantic Versioning](#semantic-versioning)
- [Conventional Commits](#conventional-commits)
- [Automated Releases](#automated-releases)
- [Manual Release Process](#manual-release-process)
- [Pre-Release Checklist](#pre-release-checklist)
- [Dry-Run Release](#dry-run-release)

---

## Semantic Versioning

This project adheres to [Semantic Versioning (SemVer)](https://semver.org/spec/v2.0.0.html):

- **MAJOR** version (`X.0.0`) - Incompatible API changes
- **MINOR** version (`0.X.0`) - Backward-compatible new features
- **PATCH** version (`0.0.X`) - Backward-compatible bug fixes

### Breaking Changes Policy

**NO breaking changes** are allowed without a major version bump. Breaking changes include:

- Removing or renaming public API methods
- Changing function signatures (parameters, return types)
- Modifying behavior of existing features in incompatible ways
- Removing support for a provider
- Changing the normalized schema structure

**Non-breaking changes** include:

- Adding new optional parameters (with defaults)
- Adding new providers
- Adding new optional fields to normalized schema
- Internal refactoring that doesn't affect public API
- Performance improvements
- Bug fixes
- Documentation updates

---

## Conventional Commits

We use [Conventional Commits](https://www.conventionalcommits.org/) to automate version bumps and changelog generation.

### Commit Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Commit Types

| Type       | Description             | Version Bump |
| ---------- | ----------------------- | ------------ |
| `feat`     | New feature             | MINOR        |
| `fix`      | Bug fix                 | PATCH        |
| `perf`     | Performance improvement | PATCH        |
| `refactor` | Code refactoring        | PATCH        |
| `docs`     | Documentation only      | None         |
| `test`     | Adding/updating tests   | None         |
| `chore`    | Maintenance tasks       | None         |
| `ci`       | CI/CD changes           | None         |
| `style`    | Code style/formatting   | None         |
| `revert`   | Revert previous commit  | PATCH        |

### Breaking Changes

Add `BREAKING CHANGE:` in the footer or `!` after type:

```
feat!: remove support for OAuth 1.0a

BREAKING CHANGE: OAuth 1.0a support has been removed. Use OAuth 2.0 instead.
```

This triggers a **MAJOR** version bump.

### Examples

**Feature:**

```
feat(connectors): add support for LinkedIn OAuth

- Add LinkedInConnector with OAuth 2.0 flow
- Add mapper for LinkedIn profile data
- Update provider matrix documentation
```

**Bug Fix:**

```
fix(token-store): prevent token refresh race condition

Adds distributed lock to prevent concurrent refresh attempts
across multiple instances.

Fixes #123
```

**Breaking Change:**

```
feat(normalizer)!: change publishedAt field to always be ISO 8601 string

BREAKING CHANGE: The publishedAt field now returns ISO 8601 strings
instead of Date objects. Update your code:

Before: item.publishedAt.getTime()
After:  new Date(item.publishedAt).getTime()
```

---

## Automated Releases

Releases are **fully automated** using `semantic-release` when commits are pushed to the `main` branch.

### Release Workflow

1. **Developer commits** using conventional commits
2. **CI runs** tests and checks
3. **Semantic-release analyzes** commit messages
4. **Version is bumped** automatically (based on commit types)
5. **CHANGELOG.md** is generated
6. **Git tag** is created
7. **Package is published** to npm
8. **GitHub release** is created with release notes

### Triggering a Release

Releases are triggered automatically on push to `main`. To trigger a release:

```bash
git checkout main
git pull origin main

# Make changes and commit with conventional commits
git add .
git commit -m "feat: add new feature"
git push origin main

# CI will automatically:
# 1. Run tests
# 2. Bump version
# 3. Generate CHANGELOG
# 4. Publish to npm
# 5. Create GitHub release
```

---

## Manual Release Process

For local testing or emergency releases:

### Prerequisites

- Node.js >= 18.0.0
- npm credentials configured (`npm login`)
- GitHub token with `repo` scope (set as `GITHUB_TOKEN`)

### Steps

1. **Ensure all tests pass:**

   ```bash
   npm ci
   npm run lint
   npm run typecheck
   npm run test
   npm run coverage
   ```

2. **Build the package:**

   ```bash
   npm run build
   ```

3. **Dry-run semantic-release:**

   ```bash
   npm run semantic-release -- --dry-run
   ```

4. **Publish (if dry-run looks good):**
   ```bash
   npm run semantic-release
   ```

---

## Pre-Release Checklist

Before merging to `main`, ensure:

- [ ] All tests pass (`npm test`)
- [ ] Coverage is >= 85% (`npm run coverage`)
- [ ] Linting passes (`npm run lint`)
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] Example app works (`npm run example`)
- [ ] Documentation is updated
- [ ] Commit messages follow conventional commits
- [ ] Breaking changes are clearly documented
- [ ] CHANGELOG preview looks correct (dry-run)

---

## Dry-Run Release

To preview what would be released **without actually publishing**:

```bash
npm run semantic-release -- --dry-run
```

This will:

- Analyze commits since last release
- Determine version bump (major/minor/patch)
- Generate CHANGELOG preview
- Show what would be published
- **NOT** create tags or publish to npm

**Example output:**

```
[semantic-release] › ✔  Allowed to push to the Git repository
[semantic-release] › ℹ  Analysis of 10 commits complete: minor release
[semantic-release] › ℹ  The next release version is 1.2.0
[semantic-release] › ℹ  Release note for version 1.2.0:

## [1.2.0](https://github.com/org/repo/compare/v1.1.0...v1.2.0) (2024-10-24)

### Features

* add LinkedIn connector ([abc123](https://github.com/org/repo/commit/abc123))
* add support for refresh token rotation ([def456](https://github.com/org/repo/commit/def456))

### Bug Fixes

* fix token refresh race condition ([ghi789](https://github.com/org/repo/commit/ghi789))

[semantic-release] › ✔  Published release 1.2.0 to dist tag latest (DRY RUN)
```

---

## Versioning Strategy

### Current Version: 1.0.0

**Upcoming releases:**

- **1.1.0** - Add OpenTelemetry tracing (opt-in)
- **1.2.0** - Add PostgreSQL token store
- **1.3.0** - Add LinkedIn connector
- **2.0.0** - Breaking: Require Node.js >= 20

### Version History

- **1.0.0** (Initial release)
  - OAuth 2.0 with PKCE for all providers
  - GitHub, Google, Reddit, Twitter, RSS support
  - Token encryption and auto-refresh
  - Normalized schema
  - Prometheus metrics

---

## Emergency Hotfixes

For critical security issues:

1. Create a hotfix branch from latest release tag:

   ```bash
   git checkout -b hotfix/security-issue v1.0.0
   ```

2. Apply fix and commit:

   ```bash
   git commit -m "fix: patch critical security vulnerability"
   ```

3. Merge to main and tag manually:

   ```bash
   git checkout main
   git merge hotfix/security-issue
   git tag v1.0.1
   git push origin main --tags
   ```

4. CI will handle publishing

---

## Troubleshooting

### Release Failed Due to Test Failures

- Fix tests locally
- Commit fix: `fix(tests): resolve failing test`
- Push to trigger new release

### Wrong Version Bump

- Check commit messages follow conventional commits
- Use `!` or `BREAKING CHANGE:` for major bumps
- Use `feat:` for minor bumps
- Use `fix:` for patch bumps

### npm Publish Failed

- Ensure `NPM_TOKEN` is set in CI
- Verify package name is available
- Check npm credentials are valid

### GitHub Release Not Created

- Ensure `GITHUB_TOKEN` has `repo` scope
- Verify branch protection rules allow CI to push tags
- Check GitHub Actions logs for errors

---

## See Also

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [semantic-release Documentation](https://semantic-release.gitbook.io/)
- [Keep a Changelog](https://keepachangelog.com/)
