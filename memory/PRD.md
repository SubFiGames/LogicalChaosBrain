# PRD — Logical Chaos Melody Machine (Android Build Fix)

## Original Problem Statement
"I am trying to use GitHub actions to build an android app but it's always giving me error on
generate juce project from cmajor patch. Can you see what is wrong with the patch and make it better?"

## Project Overview
- **App:** Logical Chaos Melody Machine — a Cmajor-based step-sequencer / subtractive synth instrument
- **Build target:** Android APK via GitHub Actions
- **Tech stack:** Cmajor → JUCE (C++) → Gradle → Android APK
- **Repo:** SubFiGames/LogicalChaosBrain

---

## Architecture

```
LogicalChaos.cmajorpatch   ← patch manifest (JSON)
Main.cmajor                ← audio DSP processor (Cmajor language)
view.js                    ← plugin UI (JS, exported as createPatchView)
.github/workflows/
  build-android.yml        ← GitHub Actions CI workflow
.github/android-templates/ ← Gradle / Android project template files
```

### Build flow
1. `cmaj generate --target=juce` compiles Main.cmajor → JUCE C++ project
2. Android project structure created around the generated C++ code
3. `./gradlew assembleDebug` builds APK via Android NDK / CMake

---

## Root Causes Found & Fixed (May 2026)

### Fix 1 — Main.cmajor: Invalid multi-endpoint declaration (COMPILATION ERROR)
- **Bug:** `input event int generate, play, stop, ...;` on one line is NOT valid Cmajor syntax
- **Fix:** Split into one `input event int <name>;` per line
- **Bonus:** `gate` parameter now actually controls note-off timing (was declared but ignored)
- **Bonus:** `generatePattern()` uses proper LCG advances for non-degenerate patterns

### Fix 2 — view.js: Completely corrupted file (GENERATION/RUNTIME ERROR)
- **Bug:** File contained git-diff markers (`|-`), multiple duplicate/truncated implementations,
  function starting at line 1 but showing only the tail of an older version
- **Fix:** Complete clean rewrite — single `createPatchView()` function with shadow DOM,
  full synth + sequencer controls, step editor, patchConnection integration

### Fix 3 — LogicalChaos.cmajorpatch: Invalid `dependencies` field
- **Bug:** `"dependencies": {"std": "std"}` is not a Cmajor patch manifest field
- **Fix:** Removed; added correct fields `"isInstrument": true`, `"category": "synth"`

### Fix 4 — GitHub Actions: ubuntu-latest (24.04) breaks Cmajor CLI
- **Bug:** Cmajor CLI binary links to `libwebkit2gtk-4.0`, dropped in Ubuntu 24.04
- **Fix:** Pinned `runs-on: ubuntu-22.04` (webkit 4.0 ships natively; supported until 2027)

### Fix 5 — GitHub Actions: Fragile `${{ env.CMAJ_PATH }}` usage
- **Bug:** Dynamic env var used as command; fails if path is empty or contains spaces
- **Fix:** Add Cmajor bin directory to `$GITHUB_PATH`; use plain `cmaj` command

### Fix 6 — GitHub Actions: Heredoc YAML syntax errors
- **Bug:** Gradle file generation used heredocs with content at column-0 inside `run: |`,
  causing YAML parse errors
- **Fix:** Store Gradle templates as real files in `.github/android-templates/`;
  workflow just copies them

### Fix 7 — GitHub Actions: NDK version inconsistency
- **Bug:** SDK manager tried to install NDK 25.1.x while nttld installs 25.2.x (r25c)
- **Fix:** Only `nttld/setup-ndk@v1` installs NDK; Gradle `ndkVersion "25.2.9519653"` matches

### Fix 8 — GitHub Actions: JUCE pinned to stable `7.0.9`
- **Bug:** `ref: master` unpredictably pulled breaking changes
- **Fix:** `ref: "7.0.9"` — known-good stable release

### Fix 9 — Android NDK CMake: Cmajor's CHOC headers + cmaj_JUCEPlugin.h fail on Android (Feb 2026)
- **Bug A:** `choc::messageloop` and `choc::ui::WebView` have no Android backend; NDK build fails with missing `postMessage`, `initialise`, `bind`, `Options` members, and incompatible `evaluateJavascript` callback signature.
- **Bug B:** `cmaj_JUCEPlugin.h` calls `juce::JSON::toString(v, juce::JSON::FormatOptions().withSpacing(juce::JSON::Spacing::none))` — `FormatOptions` / `Spacing` were added in JUCE 7.0.10+, missing from the JUCE version Cmajor's Android export uses.
- **Bug C:** `cmaj_JUCEPlugin.h` calls `choc::ui::createJUCEWebViewHolder(...)` — only defined in CHOC's desktop window helper, missing on Android.
- **Fix:** `/app/.github/scripts/patch_android.py` now:
  - Wraps `choc_MessageLoop.h` original content in `#else // not __ANDROID__` and injects an Android stub providing `initialise()`, `shutdown()`, `postMessage()`, `callerIsOnMessageThread()`, `Timer`, `run/stop/isRunning`.
  - Wraps `choc_WebView.h` similarly with a full `WebView` stub (Options + Resource + transparentBackground + acceptsFirstMouseClick + webviewIsReady + fetchResource), `bind()` template, **two `evaluateJavascript` overloads** (no-callback + templated callback) so any callback signature compiles, and a `createJUCEWebViewHolder()` returning an empty `std::unique_ptr<juce::Component>` (forward-declared).
  - In-place patches `cmaj_JUCEPlugin.h` to swap the unsupported `juce::JSON::FormatOptions(...)` call for the legacy `juce::JSON::toString(v, true)` boolean overload.

### Fix 10 — Android APK launched then crashed silently (Feb 2026)
- **Bug A — `ClassNotFoundException`:** `AndroidManifest.xml` declared `<activity android:name=".MainActivity"/>` but **no `MainActivity.java` file was ever created**, so Android failed to instantiate the activity on launch and killed the app instantly ("opens a window and immediately closes it").
- **Bug B — wrong Java package path:** Workflow created `app/src/main/java/com/subfigames/logicalchaos/` but the `applicationId` is `com.subfigames.logicalchaos.melodymachine`; the last segment was missing.
- **Bug C — no native lib loader:** Nothing called `System.loadLibrary("LogicalChaosMelodyMachine")`, so even if an activity had existed the JUCE/Cmajor shared library would never have loaded and all audio init code (C++ static constructors) would never have run.
- **Bug D — AppCompat theme with no AppCompat wiring:** Manifest used `Theme.AppCompat.NoActionBar` but the activity didn't extend `AppCompatActivity`; this would have crashed in its own right once MainActivity existed.
- **Fix:** Added `.github/android-templates/MainActivity.java` — minimal Activity that:
  1. Attempts to load the native library from a list of candidate names and records which one succeeded.
  2. Shows a dark status screen (app title + "Native engine loaded" or a visible error message) so any future crash is diagnosable instead of silent.
- Fixed the Java package directory in the workflow to match the `applicationId` exactly.
- Swapped `Theme.AppCompat.NoActionBar` → `@android:style/Theme.Material.NoActionBar` and removed the AppCompat Gradle dependency — no AndroidX wiring needed for the bootstrap screen.

---
- **Bug A:** `choc::messageloop` and `choc::ui::WebView` have no Android backend; NDK build fails with missing `postMessage`, `initialise`, `bind`, `Options` members, and incompatible `evaluateJavascript` callback signature.
- **Bug B:** `cmaj_JUCEPlugin.h` calls `juce::JSON::toString(v, juce::JSON::FormatOptions().withSpacing(juce::JSON::Spacing::none))` — `FormatOptions` / `Spacing` were added in JUCE 7.0.10+, missing from the JUCE version Cmajor's Android export uses.
- **Bug C:** `cmaj_JUCEPlugin.h` calls `choc::ui::createJUCEWebViewHolder(...)` — only defined in CHOC's desktop window helper, missing on Android.
- **Fix:** `/app/.github/scripts/patch_android.py` now:
  - Wraps `choc_MessageLoop.h` original content in `#else // not __ANDROID__` and injects an Android stub providing `initialise()`, `shutdown()`, `postMessage()`, `callerIsOnMessageThread()`, `Timer`, `run/stop/isRunning`.
  - Wraps `choc_WebView.h` similarly with a full `WebView` stub (Options + Resource + transparentBackground + acceptsFirstMouseClick + webviewIsReady + fetchResource), `bind()` template, **two `evaluateJavascript` overloads** (no-callback + templated callback) so any callback signature compiles, and a `createJUCEWebViewHolder()` returning an empty `std::unique_ptr<juce::Component>` (forward-declared).
  - In-place patches `cmaj_JUCEPlugin.h` to swap the unsupported `juce::JSON::FormatOptions(...)` call for the legacy `juce::JSON::toString(v, true)` boolean overload.
- Verified locally with a synthetic test directory; awaiting CI re-run for end-to-end validation.
- **Verified on device (Feb 2026):** user confirmed APK launches and shows "Native engine loaded: libLogicalChaosMelodyMachine_Standalone.so".

### Fix 11 — Full audio + WebView UI pipeline (Feb 2026)
- **Goal:** Turn the bootstrap APK into a playable synth + UI, not just a status screen.
- **Added:** `.github/android-templates/android_bridge.cpp` — JNI bridge exposing:
  - `nativeStart()` → creates JUCE processor via `createPluginFilter()`, brings up `juce::AudioDeviceManager` (Oboe-backed on Android), wires them together with `juce::AudioProcessorPlayer`.
  - `nativeStop()` → tears the graph down cleanly on `onDestroy`.
  - `nativeSendEvent(id, value)` / `nativeSendParameter(id, value)` → forwarded from the WebView's JS bridge. Cmajor event endpoints are fired as momentary parameter gestures (rising edge).
  - All parameters logged to logcat (`LogicalChaosNative` tag) on start so we can see what the Cmajor patch exposes.
- **Added:** `.github/android-templates/index.html` — wrapper that defines a `patchConnection` shim routing to the Android `AndroidHost` `@JavascriptInterface`, then dynamically imports and mounts `view.js`.
- **Added:** `.github/android-templates/cmake-android-jni-append.cmake` — template appended to the Cmajor-generated `CMakeLists.txt`; auto-detects the JUCE target name, attaches `android_bridge.cpp` to the `_Standalone` sub-target, links `log` + `android` libs.
- **Rewrote:** `MainActivity.java` — hosts a full-screen `WebView` loading `file:///android_asset/index.html` on success; falls back to a readable diagnostic screen if `nativeStart()` returns non-zero or throws `UnsatisfiedLinkError`. WebView has a `WebChromeClient` that pipes JS `console.*` calls to logcat (`LogicalChaosWebView` tag).
- **Workflow:** copies `view.js` + `index.html` to `app/src/main/assets/`, copies the JNI bridge C++ into `cpp/`, runs the CMake patcher right after the CHOC patcher.
- **Status:** Built, awaiting on-device verification.

---

## Files Changed

| File | Action |
|------|--------|
| `Main.cmajor` | Fixed event declarations; implemented gate; improved pattern gen |
| `view.js` | Complete rewrite (corrupted → clean single function) |
| `LogicalChaos.cmajorpatch` | Removed invalid field; fixed category; added isInstrument |
| `.github/workflows/build-android.yml` | Full rewrite — all 8 fixes applied |
| `.github/android-templates/*.gradle` | New — Gradle template files (6 files) |
| `BUILD_ERRORS_LOG.md` | Updated with all findings |

---

## Build Status (after fixes)
- Expected: `cmaj generate --target=juce` succeeds (Cmajor compiles without error)
- Expected: `./gradlew assembleDebug` builds APK
- Status: Fixes ready to push and test on GitHub Actions

## Next Steps / Backlog
- P0: Push fixes to GitHub and verify Actions run passes end-to-end
- P1: Test APK on physical Android device
- P1: Add release build workflow (signed APK)
- P2: Build macOS VST3 + Windows VST3 workflows (already in repo as stubs)
- P2: Add `cmaj validate` pre-check step once headless validation is reliable
- P3: Switch to self-hosted runner or cache Cmajor CLI + NDK to speed up builds

---

**Version:** 4.0.0
**Last Updated:** May 2026
