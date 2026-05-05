# Android SDK Setup Fix

## Issue
GitHub Actions workflow was failing at the "Setup Android SDK" step.

## Root Cause
The original workflow tried to install both SDK and NDK in a single step with the packages format:
```yaml
packages: |
  platform-tools
  platforms;android-33
  build-tools;33.0.0
  ndk;25.1.8937393
```

This format is incompatible with `android-actions/setup-android@v3` which has changed its API.

## Solution
Split the SDK and NDK setup into two separate steps using dedicated actions:

### 1. SDK Setup
```yaml
- name: Setup Android SDK
  uses: android-actions/setup-android@v3
  with:
    cmdline-tools-version: 11076708
    packages: 'platforms;android-33 build-tools;33.0.0 platform-tools'
```

### 2. NDK Setup
```yaml
- name: Setup Android NDK
  uses: nttld/setup-ndk@v1
  with:
    ndk-version: r25c
    add-to-path: true
    link-to-sdk: true
```

## Benefits
- **More reliable**: Uses specialized actions for each component
- **Better caching**: NDK action has built-in caching
- **Automatic linking**: NDK is automatically linked to SDK
- **Clearer errors**: Failures are isolated to specific components

## NDK Version
- Changed from: `25.1.8937393` (old notation)
- Changed to: `r25c` → `25.2.9519653` (current LTS)

## Next Steps
Push this commit to GitHub and the workflow should now pass the SDK setup step:

```bash
git push origin main
```

Then monitor the GitHub Actions run at:
https://github.com/SubFiGames/LogicalChaosBrain/actions

## Expected Behavior
The workflow will now:
1. ✅ Setup JDK 17
2. ✅ Setup Android SDK (platforms, build-tools)
3. ✅ Setup Android NDK r25c
4. ✅ Verify installations
5. ✅ Proceed with build steps

## Troubleshooting
If you still encounter issues, check:
- GitHub Actions log for the specific error message
- NDK version availability (r25c is LTS and should always work)
- Gradle configuration matches NDK version
