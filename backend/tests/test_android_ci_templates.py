"""Regression checks for Android CI workflow and template files."""

from pathlib import Path


REPO_ROOT = Path("/app")
BRIDGE_CPP = REPO_ROOT / ".github/android-templates/android_bridge.cpp"
WORKFLOW_YML = REPO_ROOT / ".github/workflows/build-android.yml"
APP_BUILD_GRADLE = REPO_ROOT / ".github/android-templates/app-build.gradle"


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


# Module: workflow Gradle build steps for debug + release
def test_workflow_builds_both_debug_and_release_apks():
    content = _read(WORKFLOW_YML)

    assert "name: Build Debug and Release APKs" in content
    assert "./gradlew assembleDebug assembleRelease" in content
    assert "app/build/outputs/apk/debug/app-debug.apk" in content
    assert "app/build/outputs/apk/release/app-release-unsigned.apk" in content


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
