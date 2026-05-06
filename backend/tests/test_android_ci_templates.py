"""Regression checks for Android CI workflow and template files."""

import re
import subprocess
import tempfile
from pathlib import Path


REPO_ROOT = Path("/app")
BRIDGE_CPP = REPO_ROOT / ".github/android-templates/android_bridge.cpp"
WORKFLOW_YML = REPO_ROOT / ".github/workflows/build-android.yml"
APP_BUILD_GRADLE = REPO_ROOT / ".github/android-templates/app-build.gradle"
CMAKE_ANDROID_JNI_APPEND = REPO_ROOT / ".github/android-templates/cmake-android-jni-append.cmake"
MAIN_ACTIVITY_JAVA = REPO_ROOT / ".github/android-templates/MainActivity.java"
INDEX_HTML = REPO_ROOT / ".github/android-templates/index.html"
VIEW_JS = REPO_ROOT / "view.js"
MAIN_CMAJOR = REPO_ROOT / "Main.cmajor"


def _read(path: Path) -> str:
    assert path.exists(), f"Missing file: {path}"
    return path.read_text(encoding="utf-8")


def _extract_block(text: str, anchor: str) -> str:
    start = text.find(anchor)
    assert start != -1, f"Anchor not found: {anchor}"

    brace_start = text.find("{", start)
    assert brace_start != -1, f"Opening brace not found for: {anchor}"

    depth = 0
    for idx in range(brace_start, len(text)):
        ch = text[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : idx + 1]

    raise AssertionError(f"No matching closing brace for: {anchor}")


def _assert_js_syntax_valid(js_source: str, label: str) -> None:
    """Validate JS parses using Node.js parser."""
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as tmp:
        tmp.write(js_source)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["node", "--check", tmp_path],
            capture_output=True,
            text=True,
            check=False,
        )
    finally:
        Path(tmp_path).unlink(missing_ok=True)

    assert result.returncode == 0, (
        f"JS syntax invalid for {label}:\n"
        f"stdout={result.stdout}\n"
        f"stderr={result.stderr}"
    )


def _extract_inline_scripts(html: str) -> list[str]:
    return re.findall(r"<script>(.*?)</script>", html, flags=re.DOTALL)


def _extract_js_set_items(content: str, set_name: str) -> list[str]:
    pattern = re.compile(rf"{re.escape(set_name)}\s*=\s*new\s+Set\s*\(\s*\[(.*?)\]\s*\)", re.DOTALL)
    match = pattern.search(content)
    assert match, f"Set declaration not found: {set_name}"
    raw = match.group(1)
    return re.findall(r"'([^']+)'", raw)


def _extract_cmajor_inputs(cmajor_source: str, kind: str) -> set[str]:
    # kind is either "value" or "event"
    pattern = re.compile(rf"\binput\s+{kind}\s+\w+\s+(\w+)\b")
    return set(pattern.findall(cmajor_source))


# Module: native bridge C++ structural checks around create/startAudio
def test_android_bridge_create_and_startaudio_blocks_are_well_formed():
    content = _read(BRIDGE_CPP)

    create_block = _extract_block(content, "std::string create()")
    start_block = _extract_block(content, "std::string startAudio()")

    assert "catch (const std::exception& e)" in create_block
    assert "catch (...)" in create_block
    assert "catch (const std::exception& e)" in start_block
    assert "catch (...)" in start_block
    assert create_block.count("{") == create_block.count("}")
    assert start_block.count("{") == start_block.count("}")


# Module: workflow must sanitize generated CMakeLists linker/LTO settings on runner
def test_workflow_sanitizes_generated_cmakelists_linker_flags_and_lto():
    content = _read(WORKFLOW_YML)

    assert "txt.replace(\"-fuse-ld=gold\", \"-fuse-ld=lld\")" in content
    assert "patched = patched.replace(\"-flto=thin\", \"\")" in content
    assert (
        "patched = patched.replace(\"INTERPROCEDURAL_OPTIMIZATION TRUE\","
        in content
    )
    assert "Applied linker/LTO sanitization to generated CMakeLists.txt" in content


# Module: workflow build order should prioritize debug and keep release best-effort
def test_workflow_build_runs_debug_first_and_release_as_best_effort():
    content = _read(WORKFLOW_YML)

    assert "name: Build Debug and Release APKs" in content
    assert "set -o pipefail" in content
    assert "./gradlew assembleDebug" in content
    assert "./gradlew assembleRelease" in content
    assert "set +e" in content
    assert "RELEASE_RC=${PIPESTATUS[0]}" in content
    assert "WARN: assembleRelease failed; continuing with debug artifact." in content

    debug_idx = content.find("./gradlew assembleDebug")
    release_idx = content.find("./gradlew assembleRelease")
    assert debug_idx != -1 and release_idx != -1
    assert debug_idx < release_idx, "Release build appears before debug build"


# Module: explicit artifact guard must require debug APK only
def test_workflow_build_guard_requires_debug_apk_release_optional():
    content = _read(WORKFLOW_YML)

    assert 'DEBUG_APK="app/build/outputs/apk/debug/app-debug.apk"' in content
    assert 'RELEASE_APK="app/build/outputs/apk/release/app-release-unsigned.apk"' in content
    assert 'if [ ! -f "$DEBUG_APK" ]; then' in content
    assert 'echo "ERROR: Debug APK not found at $DEBUG_APK"' in content
    assert "exit 1" in content
    assert 'if [ -f "$RELEASE_APK" ]; then' in content
    assert 'echo "WARN: Release APK not produced in this run (see gradle-build.log)."' in content


# Module: step summary must report debug success when release APK is absent
def test_workflow_summary_reports_debug_success_even_when_release_missing():
    content = _read(WORKFLOW_YML)

    assert 'elif [ -f "$DEBUG_APK" ]; then' in content
    assert "**Status:** Debug build successful (release build not produced in this run)" in content
    assert "Debug APK size: $DEBUG_SZ" in content


# Module: workflow artifact uploads for both build variants
def test_workflow_uploads_debug_and_release_artifacts():
    content = _read(WORKFLOW_YML)

    assert "name: Upload Debug APK Artifact" in content
    assert "AndroidProject/app/build/outputs/apk/debug/*.apk" in content
    assert "name: Upload Release APK Artifact" in content
    assert "AndroidProject/app/build/outputs/apk/release/*.apk" in content


# Module: Gradle template build type configuration for native build
def test_gradle_template_defines_debug_and_release_native_build_types():
    content = _read(APP_BUILD_GRADLE)

    assert "buildTypes" in content
    assert "debug {" in content
    assert "release {" in content
    assert "-DCMAKE_BUILD_TYPE=Debug" in content
    assert "-DCMAKE_BUILD_TYPE=Release" in content


# Module: Gradle template must force lld and disable IPO/LTO in native CMake args
def test_gradle_template_forces_lld_and_disables_interprocedural_optimization_across_variants():
    content = _read(APP_BUILD_GRADLE)

    assert "-DANDROID_LD=lld" in content
    assert content.count("-DANDROID_LD=lld") >= 3
    assert "-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF" in content
    assert content.count("-DCMAKE_INTERPROCEDURAL_OPTIMIZATION=OFF") >= 3


# Module: CMake append template must disable target IPO and force lld linker
def test_cmake_android_jni_append_disables_target_ipo_and_sets_lld_link_option():
    content = _read(CMAKE_ANDROID_JNI_APPEND)

    assert "set_property(TARGET ${_cand} PROPERTY INTERPROCEDURAL_OPTIMIZATION FALSE)" in content
    assert "target_link_options(${_cand} PRIVATE -fuse-ld=lld)" in content


# Module: workflow must append the cmake Android JNI template into generated CMakeLists
def test_workflow_appends_android_jni_cmake_template():
    content = _read(WORKFLOW_YML)

    assert "Patch CMakeLists.txt to include Android JNI bridge" in content
    assert "TPL=\".github/android-templates/cmake-android-jni-append.cmake\"" in content
    assert "sed \"s/@JUCE_TARGET@/${JUCE_TARGET}/g\" \"$TPL\" >> \"$CMK\"" in content


# Module: MainActivity symbol regression for stale engineStarted reference
def test_main_activity_has_no_stale_engine_started_symbol():
    content = _read(MAIN_ACTIVITY_JAVA)

    assert "engineStarted" not in content


# Module: MainActivity runtime state consistency for engine/audio booleans
def test_main_activity_declares_and_uses_engine_and_audio_state_flags():
    content = _read(MAIN_ACTIVITY_JAVA)

    assert "private boolean engineCreated" in content
    assert "private boolean audioRunning" in content

    # Both flags must be actively used in runtime checks/transitions.
    assert content.count("engineCreated") >= 6
    assert content.count("audioRunning") >= 6


# Module: workflow ensures Java source is copied from tracked template
def test_workflow_copies_main_activity_from_android_template():
    content = _read(WORKFLOW_YML)

    assert 'cp "$TPLS/MainActivity.java" \\' in content
    assert (
        "AndroidProject/app/src/main/java/com/subfigames/logicalchaos/melodymachine/"
        "MainActivity.java"
    ) in content


# Module: Android index template mount/bridge and inline replacement regressions
def test_index_template_contains_single_inline_view_placeholder():
    content = _read(INDEX_HTML)
    assert content.count("/*__INLINE_VIEW_JS__*/") == 1


# Module: Android index template should not contain duplicated IIFE closers
def test_index_template_has_no_duplicate_iife_closer_sequence():
    content = _read(INDEX_HTML)
    assert "})();})();" not in content


# Module: index template must not trigger mount before inline view.js executes
def test_index_template_has_no_pre_inline_mount_invocation():
    content = _read(INDEX_HTML)
    marker = "/*__INLINE_VIEW_JS__*/"
    marker_idx = content.find(marker)
    assert marker_idx != -1, "Inline placeholder marker missing"

    pre_inline = content[:marker_idx]
    assert "window.mountPatchView();" not in pre_inline
    assert "mountPatchView();" not in pre_inline


# Module: index template must include explicit post-inline mount trigger
def test_index_template_has_post_inline_mount_trigger_after_placeholder():
    content = _read(INDEX_HTML)
    marker = "/*__INLINE_VIEW_JS__*/"

    marker_idx = content.find(marker)
    trigger_idx = content.find("window.mountPatchView();")

    assert marker_idx != -1, "Inline placeholder marker missing"
    assert trigger_idx != -1, "Post-inline mount trigger missing"
    assert trigger_idx > marker_idx, "Mount trigger appears before inline view injection"


# Module: Android index template script blocks must be valid JS before inlining
def test_index_template_inline_scripts_are_syntax_valid():
    content = _read(INDEX_HTML)
    scripts = _extract_inline_scripts(content)
    assert len(scripts) >= 3

    for idx, script in enumerate(scripts, start=1):
        # Placeholder block is not JS until replaced by workflow.
        if "/*__INLINE_VIEW_JS__*/" in script:
            continue
        _assert_js_syntax_valid(script, f"index.html script #{idx}")


# Module: workflow-style inlined output should parse after view.js transform
def test_workflow_inlined_index_output_scripts_are_syntax_valid():
    template = _read(INDEX_HTML)
    view = _read(VIEW_JS)

    transformed_view = view.replace(
        "export default function createPatchView",
        "window.createPatchView = function createPatchView",
        1,
    )
    inlined_html = template.replace("/*__INLINE_VIEW_JS__*/", transformed_view)

    scripts = _extract_inline_scripts(inlined_html)
    assert len(scripts) >= 3
    for idx, script in enumerate(scripts, start=1):
        _assert_js_syntax_valid(script, f"inlined index.html script #{idx}")


# Module: workflow-style inline output should define createPatchView before mount call script
def test_workflow_inlined_output_executes_mount_after_create_patch_view_definition():
    template = _read(INDEX_HTML)
    view = _read(VIEW_JS)

    transformed_view = view.replace(
        "export default function createPatchView",
        "window.createPatchView = function createPatchView",
        1,
    )
    inlined_html = template.replace("/*__INLINE_VIEW_JS__*/", transformed_view)

    scripts = _extract_inline_scripts(inlined_html)
    assert len(scripts) >= 3

    inline_script_idx = None
    mount_trigger_idx = None
    for idx, script in enumerate(scripts):
        if "window.createPatchView = function createPatchView" in script:
            inline_script_idx = idx
        if "window.mountPatchView();" in script:
            mount_trigger_idx = idx

    assert inline_script_idx is not None, "Transformed inline createPatchView definition not found"
    assert mount_trigger_idx is not None, "Mount trigger script not found"
    assert mount_trigger_idx > inline_script_idx, "Mount trigger executes before createPatchView definition"


# Module: native bridge must run in functional JUCE processor mode (not forced fallback)
def test_android_bridge_create_enables_juce_processor_functional_mode():
    content = _read(BRIDGE_CPP)
    create_block = _extract_block(content, "std::string create()")

    assert "useJuceProcessor_ = true;" in create_block
    assert "processor_.reset (createPluginFilter());" in create_block
    assert "if (processor_ == nullptr)" in create_block


# Module: native parameter bridge must convert raw value using JUCE normalize helper
def test_android_bridge_send_parameter_uses_convert_to_0to1_before_host_notify():
    content = _read(BRIDGE_CPP)
    send_param_block = _extract_block(content, "void sendParameter (const std::string& id, float value)")

    assert "p->convertTo0to1 (value)" in send_param_block
    assert "const float normalised" in send_param_block
    assert "p->setValueNotifyingHost (normalised);" in send_param_block


# Module: JS bridge should route event endpoints to sendEvent and others to sendParameter
def test_index_bridge_routes_event_and_value_endpoints_to_correct_native_methods():
    content = _read(INDEX_HTML)
    script_blocks = _extract_inline_scripts(content)
    bridge_script = next((s for s in script_blocks if "sendEventOrValue" in s and "eventEndpoints" in s), None)
    assert bridge_script is not None, "Bridge script with sendEventOrValue not found"

    assert "if (eventEndpoints.has (id))" in bridge_script
    assert "if (host.sendEvent) host.sendEvent (id, v);" in bridge_script
    assert "if (host.sendParameter)" in bridge_script
    assert "host.sendParameter (id, v);" in bridge_script


# Module: endpoint routing set must align with Main.cmajor endpoint kinds
def test_index_event_endpoint_set_matches_cmajor_event_definitions_and_excludes_values():
    index_content = _read(INDEX_HTML)
    cmajor_content = _read(MAIN_CMAJOR)

    event_endpoints = set(_extract_js_set_items(index_content, "eventEndpoints"))
    cmajor_events = _extract_cmajor_inputs(cmajor_content, "event")
    cmajor_values = _extract_cmajor_inputs(cmajor_content, "value")

    expected_events = {
        "generate",
        "play",
        "stop",
        "setStepPacked",
        "requestPatternDump",
        "clearPattern",
    }
    assert event_endpoints == expected_events

    assert expected_events.issubset(cmajor_events)
    assert event_endpoints.isdisjoint(cmajor_values)
