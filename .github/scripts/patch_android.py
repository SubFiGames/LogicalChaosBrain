#!/usr/bin/env python3
"""
patch_android.py  <search_root>

Patches the two CHOC library headers that hard-error on Android:
  - choc/gui/choc_MessageLoop.h
  - choc/gui/choc_WebView.h

Both files #ifdef on CHOC_LINUX (triggered by __linux__ on the Android NDK's
aarch64-linux-android target) and attempt to use X11/GTK types that don't
exist on Android.  We wrap the entire original content in
  #else  // not Android
and inject minimal Android stubs that satisfy the type requirements used by
cmaj_PatchHelpers.h and cmaj_PatchWebView.h.

Audio processing is unaffected — only the WebView UI layer is stubbed out.
"""

import os
import sys
import glob

# ---------------------------------------------------------------------------
# Android stub for choc::messageloop
# ---------------------------------------------------------------------------
MESSAGELOOP_STUB = r"""
//=======================================================================
// ANDROID COMPATIBILITY STUB  (injected by patch_android.py)
// choc::messageloop does not support Android; providing no-op stubs so
// the Cmajor/JUCE plugin compiles.  Audio DSP is unaffected.
//=======================================================================
#if defined(__ANDROID__)
#  ifndef CHOC_ANDROID
#    define CHOC_ANDROID 1
#  endif
#  ifdef CHOC_LINUX
#    undef CHOC_LINUX
#  endif
#  ifndef CHOC_MESSAGELOOP_ANDROID_STUBBED
#  define CHOC_MESSAGELOOP_ANDROID_STUBBED 1
#  include <cstdint>
#  include <functional>
#  include <memory>
   namespace choc { namespace messageloop {
       inline void run()  {}
       inline void stop() {}
       inline bool isRunning() { return false; }

       struct Timer {
           using Callback = std::function<bool()>;
           Timer() = default;
           Timer(uint32_t /*intervalMs*/, Callback /*cb*/) {}
           void clear() {}
       };
   }} // namespace choc::messageloop
#  endif // CHOC_MESSAGELOOP_ANDROID_STUBBED

// ---- Skip rest of original file on Android ----
#else // not __ANDROID__ — compile the real implementation below
"""

MESSAGELOOP_STUB_CLOSE = """
#endif // __ANDROID__ / not __ANDROID__
"""

# ---------------------------------------------------------------------------
# Android stub for choc::ui::WebView
# ---------------------------------------------------------------------------
WEBVIEW_STUB = r"""
//=======================================================================
// ANDROID COMPATIBILITY STUB  (injected by patch_android.py)
// choc::ui::WebView does not support Android; providing no-op stubs so
// the Cmajor/JUCE plugin compiles.  The plugin UI is unavailable on
// Android, but the audio engine runs correctly.
//=======================================================================
#if defined(__ANDROID__)
#  ifndef CHOC_ANDROID
#    define CHOC_ANDROID 1
#  endif
#  ifdef CHOC_LINUX
#    undef CHOC_LINUX
#  endif
#  ifndef CHOC_WEBVIEW_ANDROID_STUBBED
#  define CHOC_WEBVIEW_ANDROID_STUBBED 1
#  include <string>
#  include <functional>
#  include <vector>
#  include <memory>
   namespace choc { namespace ui {
       struct WebView {
           struct Options {
               bool enableDebugMode = false;
               std::function<void(const std::string&)> fetchResource;
           };
           explicit WebView(Options = {}) {}
           WebView(const WebView&) = delete;
           WebView& operator=(const WebView&) = delete;

           void* getViewHandle() const { return nullptr; }
           bool  navigate(const std::string&)              { return false; }
           bool  setHTML(const std::string&)               { return false; }
           bool  isReady() const                           { return true;  }
           bool  evaluateJavascript(const std::string&,
                     std::function<void(const std::string*)> = {}) { return false; }
           bool  addInitScript(const std::string&)         { return false; }
           void  addBinding(const std::string&,
                     std::function<std::string(const std::vector<std::string>&)>) {}
       };
   }} // namespace choc::ui
#  endif // CHOC_WEBVIEW_ANDROID_STUBBED

// ---- Skip rest of original file on Android ----
#else // not __ANDROID__ — compile the real implementation below
"""

WEBVIEW_STUB_CLOSE = """
#endif // __ANDROID__ / not __ANDROID__
"""


# ---------------------------------------------------------------------------
def find_files(filename, search_root):
    return glob.glob(
        os.path.join(search_root, "**", filename), recursive=True
    )


def patch_header(filepath, stub_top, stub_bottom):
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        original = f.read()

    # Pull out #pragma once so it stays at the very top (outside the guard)
    pragma = ""
    rest = original
    if "#pragma once" in original:
        pragma = "#pragma once\n"
        rest = original.replace("#pragma once", "", 1)

    patched = pragma + stub_top + rest + stub_bottom

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(patched)

    print(f"  Patched: {filepath}")


def main():
    if len(sys.argv) < 2:
        print("Usage: patch_android.py <search_root>")
        sys.exit(1)

    search_root = sys.argv[1]

    if not os.path.isdir(search_root):
        print(f"ERROR: directory not found: {search_root}")
        sys.exit(1)

    print(f"Scanning: {search_root}")

    patched = 0

    for fname in find_files("choc_MessageLoop.h", search_root):
        patch_header(fname, MESSAGELOOP_STUB, MESSAGELOOP_STUB_CLOSE)
        patched += 1

    for fname in find_files("choc_WebView.h", search_root):
        patch_header(fname, WEBVIEW_STUB, WEBVIEW_STUB_CLOSE)
        patched += 1

    if patched == 0:
        print("WARNING: no CHOC headers found to patch.")
    else:
        print(f"Done — {patched} file(s) patched for Android.")


if __name__ == "__main__":
    main()
