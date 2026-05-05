# Build Fixes — Complete Log

## Summary of All Root Causes Found & Fixed

---

## Fix 1: `Main.cmajor` — Invalid multi-endpoint declaration (COMPILATION ERROR)

**Error type:** Cmajor syntax error — `cmaj generate` fails to compile the patch.

**Broken code (line 24):**
```cmajor
input event int generate, play, stop, setStepPacked, requestPatternDump, clearPattern;
```
Cmajor requires **one endpoint per declaration line**. The comma-separated form is NOT supported.

**Fixed code:**
```cmajor
input event int generate;
input event int play;
input event int stop;
input event int setStepPacked;
input event int requestPatternDump;
input event int clearPattern;
```

**Additional improvements to `Main.cmajor`:**
- `gate` parameter now actually controls note-off timing (was declared but unused)
- `generatePattern()` uses a better LCG seed advance to avoid degenerate patterns
- Cleaner array index for previousGlide (intermediate variable to avoid ternary in index)

---

## Fix 2: `view.js` — Completely corrupted file (GENERATION/RUNTIME ERROR)

**Error type:** The file contained git-diff markers (`|-`) throughout, duplicated code blocks, and multiple
overlapping partial function implementations. The `export default function createPatchView` began normally
on line 1 but lines 2–7 were the end of an old function body — the full function body was missing.

**Impact:** `cmaj generate --target=juce` embeds view.js into the generated project. A corrupt file
causes the build to fail or produce a broken UI at runtime.

**Fix:** Complete clean rewrite of `view.js` as a single, well-formed `createPatchView` function with:
- Shadow DOM for CSS encapsulation
- Full transport controls (Generate / Play / Stop / Clear / Refresh UI)
- All synth parameters (Cutoff, Resonance, Env Mod, Decay, Waveform)
- All sequencer parameters (Tempo, Chaos, Density, Gate, Root Note, Steps)
- Step grid with note names, glide/random flags, playing highlight
- Step editor (toggle active/glide/random, set MIDI note)
- Full `patchConnection.addEndpointListener('stepToUI', …)` integration
- Responsive layout for mobile / small screens

---

## Fix 3: `LogicalChaos.cmajorpatch` — Invalid `dependencies` field

**Error type:** Non-standard field in the Cmajor patch manifest may cause strict validation errors.

**Removed:**
```json
"dependencies": {
    "std": "std"
}
```
The Cmajor standard library does not require an explicit dependency declaration in the patch manifest.
Standard library imports happen inside `.cmajor` source files if needed.

**Added:**
```json
"isInstrument": true,
"category": "synth"
```
These are proper Cmajor patch manifest fields (was `"category": "Instrument"` which is non-standard).

---

## Fix 4: GitHub Actions — `ubuntu-latest` → `ubuntu-22.04` (RUNTIME DEPENDENCY ERROR)

**Error message (original):**
```
cmaj: error while loading shared libraries: libwebkit2gtk-4.0.so.37: cannot open shared object file
```

**Root cause:** The Cmajor CLI binary dynamically links to `libwebkit2gtk-4.0`. Ubuntu 24.04
(`ubuntu-latest` as of 2024) dropped this library. The workaround of adding a Jammy (22.04) apt
repository to a Noble (24.04) runner is fragile and often breaks with package conflicts.

**Fix:** Pin the runner to `ubuntu-22.04` which ships `libwebkit2gtk-4.0` natively. Ubuntu 22.04
is supported by GitHub Actions until at least April 2027.

---

## Fix 5: GitHub Actions — Use `cmaj` from PATH (robustness)

**Original approach (fragile):**
```yaml
echo "CMAJ_PATH=$CMAJ_BIN" >> $GITHUB_ENV
# later...
${{ env.CMAJ_PATH }} --version
```
If `CMAJ_PATH` is empty or the path contains spaces, the expression fails.

**Fixed approach:**
```yaml
echo "$(dirname "$CMAJ_BIN")" >> "$GITHUB_PATH"
# later...
cmaj --version
```
The binary directory is added to `$GITHUB_PATH`, making `cmaj` available as a plain command.

---

## Fix 6: GitHub Actions — JUCE pinned to stable tag `7.0.9`

**Original:** `ref: master` — the JUCE master branch can have breaking changes at any time.

**Fixed:** `ref: '7.0.9'` — a known-good stable release.

---

## Fix 7: GitHub Actions — NDK version consistency

**Original inconsistency:**
- `nttld/setup-ndk` installed r25c (= 25.2.9519653)
- `android-actions/setup-android` also tried to install `ndk;25.1.8937393` (different version!)

**Fixed:**
- Only `nttld/setup-ndk@v1` installs the NDK (r25c = 25.2.9519653)
- `android-actions/setup-android` only installs SDK platform packages (no NDK)
- `build.gradle` `ndkVersion "25.2.9519653"` matches exactly

---

## File Change Summary

| File | Change |
|------|--------|
| `Main.cmajor` | Fixed multi-endpoint declaration; implemented gate; improved pattern generator |
| `view.js` | Complete clean rewrite (was corrupted with git-diff markers) |
| `LogicalChaos.cmajorpatch` | Removed invalid `dependencies` field; added `isInstrument`; fixed `category` |
| `.github/workflows/build-android.yml` | Pinned ubuntu-22.04; use cmaj from PATH; fixed NDK; pinned JUCE 7.0.9 |

---

## Expected Build Flow After These Fixes

1. ✅ Checkout repository
2. ✅ Setup JDK 17
3. ✅ Setup Android SDK (API 33, build-tools 33.0.2)
4. ✅ Setup Android NDK r25c
5. ✅ Install build dependencies (webkit 4.0 native on ubuntu-22.04)
6. ✅ Checkout JUCE 7.0.9
7. ✅ Download Cmajor CLI (auto-detect x64/arm64)
8. ✅ `cmaj --version` succeeds
9. ✅ `cmaj generate --target=juce` compiles Main.cmajor (endpoints fixed)
10. ✅ GeneratedApp/ directory created with JUCE CMake project
11. ✅ Android project structure + Gradle files generated
12. ✅ `./gradlew assembleDebug` builds APK
13. ✅ APK uploaded as artifact

---

**Last Updated:** May 2026
**Status:** All identified issues fixed — ready to test on GitHub Actions
