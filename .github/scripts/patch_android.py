#!/usr/bin/env python3
"""
patch_android.py  <search_root>

Patches the two CHOC library headers that hard-error on Android:
  - choc/gui/choc_MessageLoop.h
  - choc/gui/choc_WebView.h

Strategy: wrap the entire original file content in
  #else  // not __ANDROID__
and inject complete Android stubs ABOVE it that satisfy every member
used by cmaj_Patch.h, cmaj_PatchHelpers.h, cmaj_PatchWebView.h and
cmaj_PatchWorker_WebView.h.

Confirmed-needed additions vs. previous attempt
  choc::messageloop  : postMessage(fn), callerIsOnMessageThread()
  choc::ui::WebView  : bind(name,cb)  [template]
  choc::ui::WebView::Options : Resource struct,
                                transparentBackground,
                                acceptsFirstMouseClick,
                                webviewIsReady callback,
                                fetchResource callback
  Constructor        : split into WebView() + WebView(Options) to avoid the
                       Clang "default member initializer outside of member
                       functions" error that fires when Options={} is used
                       as a default argument while Options is defined inside
                       the same enclosing class.
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
// cmaj_Patch.h / cmaj_PatchHelpers.h so the plugin compiles.
// Audio DSP is unaffected; UI callbacks are silent no-ops.
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
       // --- Called by cmaj_Patch.h many times to queue callbacks --------
       // On Android there is no CHOC message loop; run the callback
       // synchronously so nothing silently disappears.
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
# Android stub for choc::ui::WebView
# ---------------------------------------------------------------------------
WEBVIEW_STUB = r"""
//=======================================================================
// ANDROID COMPATIBILITY STUB  (injected by patch_android.py)
// choc::ui::WebView does not support Android in this Cmajor release.
// The stub satisfies every member accessed by cmaj_PatchWebView.h,
// cmaj_PatchWorker_WebView.h, and related Cmajor helpers.
// The plugin UI is unavailable on Android; the audio engine is fine.
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

       bool  evaluateJavascript (const std::string&,
                 std::function<void(const std::string*)> = {}) { return false; }

       // bind() — used by cmaj_PatchWebView.h to expose JS<->C++ bridge.
       // Template so it accepts any callback signature without pulling in
       // choc::value types here.
       template<typename Callback>
       bool bind (const std::string&, Callback&&) { return true; }

       // Legacy addBinding variant (some Cmajor versions)
       void addBinding (const std::string&,
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

    if patched == 0:
        print ("WARNING: no CHOC headers found to patch — check search_root path.")
    else:
        print (f"Done — {patched} file(s) patched for Android.")


if __name__ == "__main__":
    main()
