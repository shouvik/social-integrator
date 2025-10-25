# RC Branch Workflow Documentation

## Overview

The RC (Release Candidate) branch workflow automatically creates and maintains a dedicated branch containing pre-built binaries whenever changes are merged to the `main` branch. This enables users to install the SDK directly from GitHub without needing to build it locally.

## Purpose

The RC branch serves as a distribution channel for:

- **Development installations**: Install the latest main branch with pre-built binaries
- **Testing**: Test the SDK without local build steps
- **CI/CD**: Use in CI pipelines without build overhead
- **Quick prototyping**: Rapidly integrate the SDK in test projects

## Installation

### From RC Branch

```bash
npm install github:shouvik/oauth-connector-sdk#rc
```

This will install the latest version from the main branch with pre-compiled binaries.

### From Main Branch (requires build)

```bash
git clone https://github.com/shouvik/oauth-connector-sdk.git
cd oauth-connector-sdk
npm install
npm run build
```

## How It Works

### Workflow Trigger

The workflow triggers automatically on:

- ✅ Merged pull requests to `main`
- ✅ Direct commits to `main` (with commit message check)

The workflow does NOT trigger on:

- ❌ Pull request creation or updates
- ❌ Commits to other branches
- ❌ Tag pushes

### Workflow Steps

1. **Checkout & Setup**
   - Checks out main branch with full history
   - Sets up Node.js 20 with npm caching
   - Installs all dependencies

2. **Quality Checks**
   - Runs full test suite (`npm test`)
   - Fails the workflow if tests don't pass
   - Ensures code quality before building

3. **Build Process**
   - Compiles TypeScript to `dist/` folder
   - Generates JSON schema to `src/core/normalizer/schema.json`
   - Verifies all build artifacts exist

4. **Artifact Verification**
   - Checks `dist/index.js` exists
   - Checks `dist/index.d.ts` exists
   - Checks `src/core/normalizer/schema.json` exists
   - Lists dist contents and size

5. **RC Branch Management**
   - Fetches or creates `rc` branch
   - Resets RC branch to latest main
   - Stages built artifacts and necessary files
   - Creates commit with metadata
   - Force pushes to RC branch

6. **Notifications**
   - Posts commit comment with installation instructions
   - Generates workflow summary with links
   - Notifies on failure with troubleshooting steps

### Files Included in RC Branch

The RC branch includes only these files:

- `dist/` - Complete TypeScript build output
- `src/core/normalizer/schema.json` - Generated JSON schema
- `package.json` - Package metadata and dependencies
- `README.md` - Documentation
- `LICENSE` - License file (if exists)
- `.releaserc.json` - Release configuration (if exists)

### Files Excluded from RC Branch

These files are NOT included (to keep the branch clean):

- `src/` - Source TypeScript files (not needed, use dist/)
- `tests/` - Test files
- `node_modules/` - Dependencies (npm installs these)
- `.github/` - Workflow files
- `docs/` - Additional documentation
- Dev configuration files (`.eslintrc`, `.prettierrc`, etc.)

## Build Metadata

Each RC branch commit includes metadata:

```
chore(rc): update RC branch with built artifacts from main@<SHA>

Build date: 2025-10-25 12:34:56 UTC
Main branch SHA: abc1234567890
Triggered by: Merge pull request #123 from user/feature

This commit contains pre-built binaries for easy installation:
npm install github:shouvik/oauth-connector-sdk#rc
```

## Workflow Outputs

### Success Output

When successful, the workflow:

1. ✅ Updates RC branch with latest build
2. 📝 Posts commit comment with installation instructions
3. 📊 Generates workflow summary with links
4. 🔗 Provides direct links to RC branch and diff

### Failure Output

When failed, the workflow:

1. ❌ Does not update RC branch
2. 📝 Posts failure comment with troubleshooting steps
3. 🔍 Links to workflow logs for debugging

## Troubleshooting

### Build Failures

**Issue**: Build fails with TypeScript errors

```
Error: dist directory not found
```

**Solution**:

1. Run `npm run typecheck` locally to identify issues
2. Fix TypeScript errors in source files
3. Commit fixes and merge to main

### Test Failures

**Issue**: Tests fail during workflow

```
Error: test suite failed
```

**Solution**:

1. Run `npm test` locally to reproduce
2. Fix failing tests
3. Ensure all tests pass before merging

### Permission Issues

**Issue**: Workflow fails with permission errors

```
Error: Permission denied (publickey)
```

**Solution**:

1. Check repository settings → Actions → Workflow permissions
2. Ensure "Read and write permissions" is enabled
3. Verify `GITHUB_TOKEN` has `contents: write` permission

### Git Conflicts

**Issue**: RC branch has conflicts with main

```
Error: failed to push some refs
```

**Solution**:

1. The workflow uses `git reset --hard` and force push
2. This should automatically resolve conflicts
3. If persists, manually delete RC branch and re-run workflow:
   ```bash
   git push origin --delete rc
   ```

### Schema Generation Failures

**Issue**: JSON schema not generated

```
Error: schema.json not found
```

**Solution**:

1. Verify `scripts/generate-schema.ts` exists
2. Check schema generation script for errors
3. Run `npm run generate:schema` locally to debug

## Maintenance

### Updating the Workflow

To modify the RC branch workflow:

1. Edit `.github/workflows/create-rc-branch.yml`
2. Test changes on a feature branch first
3. Merge to main after verification

### Cleaning Up Old RC Branches

The RC branch is force-pushed on every update, so:

- ✅ History is automatically cleaned
- ✅ No manual cleanup needed
- ✅ Old commits are garbage collected

### Monitoring Workflow Health

Check workflow status:

1. Go to Actions tab in GitHub
2. Select "Create RC Branch" workflow
3. View recent runs and success rate
4. Check logs for any warnings

## Integration with CI/CD

### Using RC Branch in Downstream Projects

```json
{
  "dependencies": {
    "oauth-connector-sdk": "github:shouvik/oauth-connector-sdk#rc"
  }
}
```

### Locking to Specific Commit

```json
{
  "dependencies": {
    "oauth-connector-sdk": "github:shouvik/oauth-connector-sdk#abc1234"
  }
}
```

Where `abc1234` is the RC branch commit SHA.

## Best Practices

### For Contributors

1. ✅ Always run tests locally before merging to main
2. ✅ Ensure build succeeds locally (`npm run build`)
3. ✅ Review RC branch after merge to verify artifacts
4. ❌ Don't commit directly to RC branch (auto-generated)

### For Maintainers

1. ✅ Monitor workflow success rate (should be >99%)
2. ✅ Review RC branch periodically for correctness
3. ✅ Update workflow as dependencies change
4. ✅ Document any RC branch usage in README

### For Users

1. ✅ Use RC branch for development and testing
2. ✅ Pin to specific commits for production
3. ✅ Report issues if RC branch installation fails
4. ❌ Don't expect stable versioning from RC branch

## FAQ

### Q: How often is RC branch updated?

**A**: On every merge to main branch.

### Q: Can I install from RC branch in production?

**A**: Not recommended. RC branch is for development/testing. Use npm releases for production.

### Q: What if I need an older RC version?

**A**: RC branch is force-pushed, so history is lost. Use git tags or npm releases for versioning.

### Q: Why not just publish to npm on every commit?

**A**: RC branch provides faster iteration without polluting npm registry. Semantic releases control npm publishing.

### Q: Can I manually trigger the RC workflow?

**A**: Currently no. It triggers automatically on main merges. You can add `workflow_dispatch` if needed.

### Q: What's the difference between RC and release?

**A**: RC branch is continuous deployment from main (unversioned). Releases are semantic versions published to npm (versioned).

### Q: How do I test the workflow locally?

**A**: Use `act` (GitHub Actions local runner) or push to a test repository.

## Related Documentation

- [CI/CD Workflow](../.github/workflows/ci.yml) - Main CI pipeline
- [Semantic Release](../.releaserc.json) - Release configuration
- [Package Configuration](../package.json) - Build scripts and dependencies
- [Contributing Guide](../CONTRIBUTING.md) - Development workflow

## Changelog

### v1.0.0 (2025-10-25)

- Initial RC branch workflow implementation
- Automatic build and deployment on main merges
- Commit comments and workflow summaries
- Failure notifications with troubleshooting

---

**Last Updated**: 2025-10-25
**Workflow File**: `.github/workflows/create-rc-branch.yml`
**Maintainer**: GitHub Actions Bot
