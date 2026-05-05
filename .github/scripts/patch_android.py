#!/usr/bin/env python3
"""
patch_android.py  <search_root>

Patches the CHOC + Cmajor headers that fail on Android because they reference
desktop-only or newer-JUCE-only APIs:

  - choc/gui/choc_MessageLoop.h        (no Android backend)
  - choc/gui/choc_WebView.h            (no Android backend)
  - cmajor/helpers/cmaj_JUCEPlugin.h   (uses juce::JSON::FormatOptions which
                                        is missing in older JUCE shipped with
                                        Cmajor's Android export)

CHOC strategy: keep the original file but wrap it in `#else // not __ANDROID__`
and inject a complete Android stub above it that satisfies every member used
by cmaj_Patch.h, cmaj_PatchHelpers.h, cmaj_PatchWebView.h,
cmaj_PatchWorker_WebView.h and cmaj_JUCEPlugin.h.

Cmajor JUCE plugin strategy: in-place text substitution to swap the
`juce::JSON::FormatOptions().withSpacing(juce::JSON::Spacing::none)` call for
the legacy `true` boolean overload of `juce::JSON::toString()`.
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
// choc::messageloop does not support Android natively in this Cmajor
// release.  The stubs below satisfy every symbol used by
// cmaj_Patch.h / cmaj_PatchHelpers.h / cmaj_JUCEPlugin.h so the plugin
// compiles.  Audio DSP is unaffected; UI callbacks are silent no-ops.
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
       // --- Lifecycle (called from cmaj_JUCEPlugin.h) -------------------
       inline void initialise() {}
       inline void shutdown()   {}

       // --- Called by cmaj_Patch.h to queue callbacks -------------------
       // No CHOC message loop on Android: run callback synchronously so
       // nothing silently disappears.
       inline void postMessage (std::function<void()> f) { if (f) f(); }

       // --- Called by cmaj_Patch.h to check thread affinity -------------
       inline bool callerIsOnMessageThread() { return true; }

       // --- Other helpers -----------------------------------------------
       inline void run()  {}
       inline void stop() {}
       inline bool isRunning() { return false; }

       struct Timer {
           using Callback = std::function<bool()>;
           Timer() = default;
           Timer (uint32_t /*intervalMs*/, Callback /*cb*/) {}
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
# Android stub for choc::ui::WebView (and createJUCEWebViewHolder helper)
# ---------------------------------------------------------------------------
WEBVIEW_STUB = r"""
//=======================================================================
// ANDROID COMPATIBILITY STUB  (injected by patch_android.py)
// choc::ui::WebView does not support Android in this Cmajor release.
// The stub satisfies every member accessed by cmaj_PatchWebView.h,
// cmaj_PatchWorker_WebView.h, cmaj_JUCEPlugin.h, and related Cmajor
// helpers.  The plugin UI is unavailable on Android; the audio engine
// is fine.
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
#  include <optional>
#  include <utility>

   // forward-declare juce::Component so createJUCEWebViewHolder() can
   // return a std::unique_ptr<juce::Component> without dragging the full
   // juce_gui_basics header into choc.
   namespace juce { class Component; }

   namespace choc { namespace ui {

   struct WebView
   {
       // ---- Options (defined inside WebView so webviewIsReady can
       //      reference the outer type — std::function uses type erasure
       //      so an incomplete WebView& is fine here in C++11+). --------
       struct Options
       {
           // Resource type used by cmaj_PatchWebView.h onRequest() ------
           struct Resource
           {
               std::vector<uint8_t> data;
               std::string          mimeType;

               Resource() = default;

               // string content + mime (most common Cmajor usage)
               Resource (std::string content, std::string mime)
                   : data (content.begin(), content.end()),
                     mimeType (std::move (mime)) {}

               // vector<uint8_t> content + mime
               Resource (std::vector<uint8_t> d, std::string mime)
                   : data (std::move (d)),
                     mimeType (std::move (mime)) {}

               // templated catch-all (handles std::string_view, etc.)
               template<typename T>
               Resource (const T& d, std::string mime)
                   : mimeType (std::move (mime))
               {
                   for (auto b : d) data.push_back (static_cast<uint8_t>(b));
               }
           };

           // Fields accessed by cmaj_PatchWebView.h ---------------------
           bool transparentBackground  = false;
           bool acceptsFirstMouseClick = true;
           bool enableDebugMode        = false;

           // Callback: called when the WebView is ready (stub: never fires)
           std::function<void(WebView&)> webviewIsReady;

           // Callback: serve local resources (stub: always nullopt)
           std::function<std::optional<Resource>(const std::string&)> fetchResource;
       };

       // ---- Constructors -----------------------------------------------
       // Split into no-arg + one-arg to avoid the Clang "default member
       // initializer needed outside member functions" error that fires when
       // Options={} is used as a default argument while Options is still
       // being defined inside the same enclosing class.
       WebView()                 {}
       explicit WebView(Options) {}

       WebView (const WebView&)            = delete;
       WebView& operator= (const WebView&) = delete;

       // ---- Methods accessed by Cmajor helpers -------------------------
       void* getViewHandle() const { return nullptr; }
       bool  navigate        (const std::string&) { return false; }
       bool  setHTML         (const std::string&) { return false; }
       bool  isReady         ()             const { return true;  }
       bool  addInitScript   (const std::string&) { return false; }

       // evaluateJavascript — Cmajor calls this with various callback
       // signatures (1-arg `void(const std::string*)` AND 2-arg
       // `void(const std::string& error, const choc::value::ValueView&)`).
       // Use overloads + a template to accept ANY callable so we don't
       // care about the exact signature.
       bool evaluateJavascript (const std::string&) { return false; }

       template<typename Callback>
       bool evaluateJavascript (const std::string&, Callback&&) { return false; }

       // bind() — used by cmaj_PatchWebView.h to expose JS<->C++ bridge.
       // Template so it accepts any callback signature without pulling in
       // choc::value types here.
       template<typename Callback>
       bool bind (const std::string&, Callback&&) { return true; }

       // Legacy addBinding variant (some Cmajor versions)
       void addBinding (const std::string&,
                 std::function<std::string(const std::vector<std::string>&)>) {}
   };

   // Helper used by cmaj_JUCEPlugin.h to wrap a CHOC WebView in a
   // juce::Component.  On Android we have no WebView, so return an empty
   // unique_ptr — the JUCE plugin will simply have no UI.  Construction
   // of an empty std::unique_ptr<juce::Component> only requires a forward
   // declaration of juce::Component, which is provided above.
   inline std::unique_ptr<juce::Component>
   createJUCEWebViewHolder (WebView&) { return {}; }

   }} // namespace choc::ui
#  endif // CHOC_WEBVIEW_ANDROID_STUBBED

// ---- Skip rest of original file on Android ----
#else // not __ANDROID__ — compile the real implementation below
"""

WEBVIEW_STUB_CLOSE = """
#endif // __ANDROID__ / not __ANDROID__
"""


# ---------------------------------------------------------------------------
# In-place patches for cmaj_JUCEPlugin.h
# ---------------------------------------------------------------------------
# The shipped Cmajor helper uses juce::JSON::FormatOptions (added in JUCE
# 7.0.10+).  The Android JUCE bundled with the Cmajor export here is older
# and only exposes the legacy `juce::JSON::toString (v, bool oneLine)`
# overload, so substitute the call accordingly.
JUCEPLUGIN_REPLACEMENTS = [
    (
        "juce::JSON::toString (v, juce::JSON::FormatOptions().withSpacing (juce::JSON::Spacing::none))",
        "juce::JSON::toString (v, true)",
    ),
    # Defensive variants in case Cmajor reformats the line in future versions
    (
        "juce::JSON::FormatOptions().withSpacing (juce::JSON::Spacing::none)",
        "true /* compact */",
    ),
]


def patch_juce_plugin (filepath):
    with open (filepath, "r", encoding="utf-8", errors="replace") as f:
        original = f.read()

    patched = original
    changed = False
    for needle, replacement in JUCEPLUGIN_REPLACEMENTS:
        if needle in patched:
            patched = patched.replace (needle, replacement)
            changed = True

    if changed:
        with open (filepath, "w", encoding="utf-8") as f:
            f.write (patched)
        print (f"  Patched JUCE-JSON line in: {filepath}")
    else:
        print (f"  No JUCE-JSON match in: {filepath} (already patched or signature drift)")


# ---------------------------------------------------------------------------
def find_files (filename, search_root):
    return glob.glob (
        os.path.join (search_root, "**", filename), recursive=True
    )


def patch_header (filepath, stub_top, stub_bottom):
    with open (filepath, "r", encoding="utf-8", errors="replace") as f:
        original = f.read()

    # Keep #pragma once at the very top, outside all guards
    pragma = ""
    rest   = original
    if "#pragma once" in original:
        pragma = "#pragma once\n"
        rest   = original.replace ("#pragma once", "", 1)

    patched = pragma + stub_top + rest + stub_bottom

    with open (filepath, "w", encoding="utf-8") as f:
        f.write (patched)

    print (f"  Patched: {filepath}")


def main():
    if len (sys.argv) < 2:
        print ("Usage: patch_android.py <search_root>")
        sys.exit (1)

    search_root = sys.argv[1]

    if not os.path.isdir (search_root):
        print (f"ERROR: directory not found: {search_root}")
        sys.exit (1)

    print (f"Scanning: {search_root}")
    patched = 0

    for fname in find_files ("choc_MessageLoop.h", search_root):
        patch_header (fname, MESSAGELOOP_STUB, MESSAGELOOP_STUB_CLOSE)
        patched += 1

    for fname in find_files ("choc_WebView.h", search_root):
        patch_header (fname, WEBVIEW_STUB, WEBVIEW_STUB_CLOSE)
        patched += 1

    # Cmajor JUCE plugin helper – swap unsupported juce::JSON::FormatOptions
    for fname in find_files ("cmaj_JUCEPlugin.h", search_root):
        patch_juce_plugin (fname)
        patched += 1

    if patched == 0:
        print ("WARNING: no headers found to patch — check search_root path.")
    else:
        print (f"Done — {patched} file(s) patched for Android.")


if __name__ == "__main__":
    main()
