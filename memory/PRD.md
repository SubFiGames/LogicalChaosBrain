# PRD — GitHub Actions Android APK Build Fix (LogicalChaosBrain)

## Original Problem Statement
"Can you please see if you can find errors on my repository? I'm trying to build an app with GitHub actions but keeps giving me error on the build apk with gradle q"

## Confirmed Scope from User
- Failure location: **GitHub Actions only**
- Evidence: C/C++ compile errors in `android_bridge.cpp`, then Java compile error in `MainActivity.java` (`cannot find symbol engineStarted`)
- Change scope: **workflow + Android project files**
- Target: **both debug and release builds**

## Architecture Decisions
- Keep CI runner pinned to Ubuntu 22.04 + existing Android SDK/NDK setup.
- Treat `.github/android-templates/` as source-of-truth for generated Android project files.
- Fix native compile blocker in JNI bridge template (`android_bridge.cpp`) so generated project compiles in CI.
- Extend CI workflow to build and publish **both** debug and release APK outputs.

## What Was Implemented
1. **Native C++ compile fix**
   - File: `.github/android-templates/android_bridge.cpp`
   - Removed a stray `}` in `Engine::create()` that broke class parsing and caused cascading errors (`mutex_`, `isCreated_`, `processor_`, etc. reported as undeclared).

2. **Safer start flow in JNI bridge**
   - File: `.github/android-templates/android_bridge.cpp`
   - Removed duplicated `create()` calls inside `startAudio()` and replaced with a clear guard:
     - returns error if engine not initialized (`nativeStart` must run first).

3. **Debug + Release CI build support**
   - File: `.github/workflows/build-android.yml`
   - Updated Gradle command to run:
     - `./gradlew assembleDebug assembleRelease`
   - Added explicit output checks for:
     - `app/build/outputs/apk/debug/app-debug.apk`
     - `app/build/outputs/apk/release/app-release-unsigned.apk`
   - Added separate artifact uploads for both debug and release APKs.
   - Updated job summary to report both APK sizes when present.

4. **Build-type-aware native CMake flags**
   - File: `.github/android-templates/app-build.gradle`
   - Moved `-DCMAKE_BUILD_TYPE=Debug` out of default config.
   - Added per-buildType native flags:
     - debug → `-DCMAKE_BUILD_TYPE=Debug`
     - release → `-DCMAKE_BUILD_TYPE=Release`

5. **Java compile fix in activity template**
   - File: `.github/android-templates/MainActivity.java`
   - Removed stale undeclared variable usage: `engineStarted = true;`
   - Keeps runtime state consistent with declared fields: `engineCreated`, `audioRunning`.

6. **WebView UI mount fix (blank UI root cause)**
   - File: `.github/android-templates/index.html`
   - Removed malformed script close sequence `})();})();` that broke JS parsing/execution.
   - Removed duplicate `/*__INLINE_VIEW_JS__*/` placeholder so inline `view.js` injection is single and deterministic.

7. **WebView mount-order fix (createPatchView race)**
   - File: `.github/android-templates/index.html`
   - Changed immediate mount IIFE to deferred function: `window.mountPatchView = async function ...`.
   - Added explicit post-inline trigger script to call `window.mountPatchView()` only after inlined `view.js` executes.

8. **Release linker/LTO fix for GitHub runner**
   - Files: `.github/android-templates/app-build.gradle`, `.github/android-templates/cmake-android-jni-append.cmake`
   - Forced Android linker to lld: `-DANDROID_LD=lld`.
   - Disabled IPO/LTO at CMake config + target levels to avoid `ld.gold`/`LLVMgold.so` release-link failures.

## Validation Performed
- Testing agent runs completed with passing checks.
- Test reports: `/app/test_reports/iteration_1.json`, `/app/test_reports/iteration_2.json`, `/app/test_reports/iteration_3.json`, `/app/test_reports/iteration_4.json`, `/app/test_reports/iteration_5.json`
- Added test coverage artifact: `/app/backend/tests/test_android_ci_templates.py`
- Validated:
  - bridge structure no longer broken,
  - workflow builds debug+release,
  - both APK artifact upload steps exist,
  - gradle template has debug/release native configuration.
  - MainActivity template has no stale `engineStarted` symbol.
  - index.html + workflow-style inlined output script blocks parse successfully.
  - mount trigger now runs after inline `createPatchView` definition.
  - release template now enforces lld + IPO/LTO-off safeguards.

## Prioritized Backlog
- **P0**
  - Trigger GitHub Actions run and confirm CI completes on your repo with actual toolchain.
  - Confirm debug APK and release APK artifacts are produced and downloadable.
- **P1**
  - If release signing is needed, add keystore-based signed release/AAB pipeline.
  - Add matrix builds for ABI splits if APK size optimization is needed.
- **P2**
  - Add workflow cache tuning (Gradle + NDK/CMake) for faster CI cycles.
  - Add workflow validation step that fails early on template syntax regressions.

## Next Tasks
1. Push/merge these template and workflow changes.
2. Re-run the Android workflow.
3. If any new CI error appears, capture first failing stacktrace block and patch incrementally.
