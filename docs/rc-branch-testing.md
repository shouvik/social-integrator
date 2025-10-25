# RC Branch Workflow Testing Checklist

This document provides a comprehensive testing plan for the RC branch workflow.

## Pre-Deployment Checklist

Before merging the RC workflow, verify:

- [ ] `.github/workflows/create-rc-branch.yml` exists
- [ ] Workflow file has valid YAML syntax
- [ ] All required permissions are set (contents: write, actions: read)
- [ ] Node.js version matches CI (20)
- [ ] Build scripts exist in package.json
  - [ ] `npm run build` - TypeScript compilation
  - [ ] `npm run generate:schema` - Schema generation
  - [ ] `npm test` - Test execution

## Initial Deployment Test

### Step 1: Create Test Branch

```bash
git checkout -b test/rc-workflow
git add .github/workflows/create-rc-branch.yml docs/rc-branch-workflow.md
git commit -m "feat: add RC branch workflow"
git push origin test/rc-workflow
```

### Step 2: Create Pull Request

- [ ] Create PR from `test/rc-workflow` to `main`
- [ ] Verify CI checks pass
- [ ] Review workflow file changes
- [ ] Get approval from maintainer

### Step 3: Merge and Observe

- [ ] Merge PR to main
- [ ] Go to Actions tab
- [ ] Watch "Create RC Branch" workflow execute
- [ ] Verify workflow completes successfully

### Expected Workflow Behavior

- [ ] Workflow starts within 10 seconds of merge
- [ ] Dependencies install successfully
- [ ] Tests pass
- [ ] Build completes without errors
- [ ] Schema generates successfully
- [ ] RC branch is created/updated
- [ ] Commit comment is posted
- [ ] Workflow summary is generated

## Post-Deployment Validation

### Verify RC Branch Exists

```bash
git fetch origin
git branch -r | grep rc
# Expected: origin/rc
```

### Verify RC Branch Contents

```bash
git checkout rc
ls -la

# Expected files:
# - dist/
# - src/core/normalizer/schema.json
# - package.json
# - README.md
# - LICENSE (if exists)
```

### Verify Build Artifacts

```bash
git checkout rc
ls -la dist/

# Expected:
# - dist/index.js (main entry)
# - dist/index.d.ts (type definitions)
# - dist/core/ (compiled core modules)
# - dist/connectors/ (compiled connectors)
# - dist/utils/ (compiled utilities)
```

### Verify Schema File

```bash
git checkout rc
cat src/core/normalizer/schema.json | jq .

# Expected: Valid JSON schema with:
# - $schema property
# - type: "object"
# - properties with all normalized fields
```

### Test Installation from RC Branch

```bash
# Create test directory
mkdir /tmp/test-rc-install
cd /tmp/test-rc-install

# Initialize test project
npm init -y

# Install from RC branch
npm install github:shouvik/oauth-connector-sdk#rc

# Verify installation
ls -la node_modules/oauth-connector-sdk/

# Expected:
# - dist/ folder exists
# - package.json exists
# - No src/ folder (source files excluded)
# - No tests/ folder (test files excluded)
```

### Test Package Import

```bash
cd /tmp/test-rc-install

# Create test file
cat > test.js << 'EOF'
const sdk = require('oauth-connector-sdk');
console.log('SDK loaded:', typeof sdk);
console.log('ConnectorSDK available:', typeof sdk.ConnectorSDK);
EOF

# Run test
node test.js

# Expected output:
# SDK loaded: object
# ConnectorSDK available: function
```

### Test TypeScript Definitions

```bash
cd /tmp/test-rc-install

# Create TypeScript test file
cat > test.ts << 'EOF'
import { ConnectorSDK } from 'oauth-connector-sdk';

const config = {
  tokenStore: { backend: 'memory' as const },
  providers: {},
};

// Type checking only - don't execute
const testTypes = async () => {
  const sdk = await ConnectorSDK.init(config);
  console.log('TypeScript definitions working');
};
EOF

# Check types
npx tsc --noEmit test.ts

# Expected: No type errors
```

## Continuous Monitoring

### Daily Checks (Automated)

- [ ] Monitor workflow success rate (should be >99%)
- [ ] Check for workflow failures in Actions tab
- [ ] Review failure notifications if any

### Weekly Checks (Manual)

- [ ] Verify RC branch is up to date with main
- [ ] Test installation from RC branch
- [ ] Check RC branch size (should be reasonable)
- [ ] Review workflow run times (should be <5 minutes)

### Monthly Checks (Manual)

- [ ] Audit workflow permissions
- [ ] Review workflow logs for warnings
- [ ] Test installation on fresh machines
- [ ] Validate build artifacts integrity

## Troubleshooting Tests

### Test 1: Build Failure Recovery

**Scenario**: Introduce TypeScript error

```bash
# Introduce error in source file
echo "const x: string = 123;" >> src/index.ts
git add src/index.ts
git commit -m "test: introduce build error"
git push origin main
```

**Expected**:

- [ ] Workflow fails at build step
- [ ] RC branch is NOT updated
- [ ] Failure notification is posted
- [ ] Error message indicates TypeScript error

**Recovery**:

```bash
# Fix error
git revert HEAD
git push origin main
```

- [ ] Workflow succeeds
- [ ] RC branch is updated

### Test 2: Test Failure Recovery

**Scenario**: Introduce failing test

```bash
# Create failing test
cat > tests/fail.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
describe('Fail test', () => {
  it('should fail', () => {
    expect(true).toBe(false);
  });
});
EOF
git add tests/fail.test.ts
git commit -m "test: introduce failing test"
git push origin main
```

**Expected**:

- [ ] Workflow fails at test step
- [ ] RC branch is NOT updated
- [ ] Failure notification is posted

**Recovery**:

```bash
# Remove failing test
git revert HEAD
git push origin main
```

### Test 3: Permission Issues

**Scenario**: Verify permissions are correct

```bash
# Check workflow permissions in GitHub UI:
# Settings → Actions → General → Workflow permissions
```

**Expected**:

- [ ] "Read and write permissions" is enabled
- [ ] Workflow has contents:write permission

### Test 4: Force Push Handling

**Scenario**: Manually modify RC branch

```bash
git checkout rc
echo "manual change" >> README.md
git add README.md
git commit -m "manual: test force push"
git push origin rc
```

**Expected**:

- [ ] Next main merge force-pushes RC branch
- [ ] Manual changes are overwritten
- [ ] RC branch matches main + built artifacts

## Performance Benchmarks

### Workflow Execution Time

- [ ] Total time < 5 minutes
- [ ] Dependency installation < 1 minute
- [ ] Test execution < 2 minutes
- [ ] Build execution < 1 minute
- [ ] Git operations < 30 seconds

### RC Branch Size

- [ ] Branch size < 50 MB
- [ ] dist/ folder < 10 MB
- [ ] No unnecessary files included

### Installation Time

```bash
time npm install github:shouvik/oauth-connector-sdk#rc
```

- [ ] Installation time < 30 seconds
- [ ] No build steps required
- [ ] Dependencies install correctly

## Regression Tests

### Test After Each Change

When modifying the workflow, re-run these tests:

1. **Build Integrity**

   ```bash
   git checkout rc
   node -e "require('oauth-connector-sdk')"
   ```

2. **Type Definitions**

   ```bash
   npx tsc --noEmit test.ts
   ```

3. **Schema Validation**

   ```bash
   cat src/core/normalizer/schema.json | jq . > /dev/null && echo "Valid JSON"
   ```

4. **Package Metadata**
   ```bash
   cat package.json | jq '.version, .main, .types'
   ```

## Success Criteria

The RC workflow is considered successful when:

- ✅ Workflow runs on every main merge
- ✅ Build artifacts are correct and complete
- ✅ Installation from RC branch works
- ✅ TypeScript definitions are available
- ✅ No source files in RC branch
- ✅ Failure notifications work correctly
- ✅ Workflow execution time < 5 minutes
- ✅ Success rate > 99%

## Failure Scenarios

Known failure scenarios and expected behavior:

| Scenario                | Expected Behavior                 |
| ----------------------- | --------------------------------- |
| TypeScript errors       | Workflow fails, RC not updated    |
| Test failures           | Workflow fails, RC not updated    |
| Schema generation error | Workflow fails, RC not updated    |
| Permission denied       | Workflow fails, error in logs     |
| Git conflicts           | Force push resolves automatically |
| Missing dependencies    | Install fails, workflow fails     |
| Invalid workflow YAML   | Workflow doesn't start            |

## Rollback Plan

If the RC workflow causes issues:

### Immediate Actions

1. Disable workflow (GitHub UI)
2. Revert workflow file PR
3. Delete RC branch if corrupted
4. Investigate logs
5. Fix issues
6. Re-enable workflow

### Emergency Rollback

```bash
# Disable workflow
gh workflow disable "Create RC Branch"

# Delete RC branch
git push origin --delete rc

# Revert workflow addition
git revert <workflow-pr-commit-sha>
git push origin main
```

## Contact

For issues with the RC workflow:

- Check workflow logs: https://github.com/shouvik/oauth-connector-sdk/actions
- Review documentation: `/docs/rc-branch-workflow.md`
- Open issue: https://github.com/shouvik/oauth-connector-sdk/issues

---

**Last Updated**: 2025-10-25
**Version**: 1.0.0
**Status**: Ready for Testing
