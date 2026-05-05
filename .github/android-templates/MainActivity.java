package com.subfigames.logicalchaos.melodymachine;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Android entry point for Logical Chaos Melody Machine.
 *
 * Responsibilities:
 *   1. Load the Cmajor/JUCE native library (libLogicalChaosMelodyMachine_Standalone.so).
 *   2. Call native start → spins up the JUCE AudioProcessor and Oboe-backed
 *      AudioDeviceManager.  If that fails we show a readable status screen.
 *   3. Host a WebView that loads file:///android_asset/index.html which in
 *      turn imports view.js (the patch UI).  view.js talks to a `patchConnection`
 *      JS object injected by index.html, which forwards every call to the
 *      `AndroidHost` @JavascriptInterface bridge below — which in turn calls
 *      native methods implemented in android_bridge.cpp.
 */
public class MainActivity extends Activity
{
    private static final String TAG = "LogicalChaos";

    // The native .so ships as the JUCE Standalone wrapper lib.  We don't
    // actually use the standalone wrapper (we drive the processor ourselves
    // from android_bridge.cpp) — we just need dlopen() to succeed so that
    // C++ global constructors and our JNI functions are registered.
    private static final String[] CANDIDATE_LIBS = {
        "LogicalChaosMelodyMachine",
        "LogicalChaosMelodyMachine_Standalone",
    };

    private String  loadedLib  = null;
    private String  loadError  = null;
    private int     startError = -1;
    private WebView webView    = null;

    // --- Native methods (implemented in android_bridge.cpp) ------------------
    private native int  nativeStart();
    private native void nativeStop();
    private native void nativeSendEvent     (String endpointID, double value);
    private native void nativeSendParameter (String endpointID, float  value);

    @Override
    protected void onCreate (Bundle savedInstanceState)
    {
        super.onCreate (savedInstanceState);

        if (! tryLoadNativeLibrary())
        {
            setContentView (buildStatusLayout ("Failed to load native library", loadError));
            return;
        }

        try
        {
            startError = nativeStart();
        }
        catch (UnsatisfiedLinkError e)
        {
            Log.e (TAG, "nativeStart link error", e);
            setContentView (buildStatusLayout ("Native start symbol missing",
                     "The .so loaded but Java_...nativeStart isn't exported:\n\n" + e.getMessage()));
            return;
        }

        if (startError != 0)
        {
            setContentView (buildStatusLayout (
                "Audio engine failed to start (code " + startError + ")",
                "Check logcat tag '" + TAG + "Native' for details."));
            return;
        }

        setContentView (buildWebViewLayout());
    }

    @Override
    protected void onDestroy()
    {
        try { if (startError == 0) nativeStop(); }
        catch (Throwable t) { Log.e (TAG, "nativeStop failed", t); }
        super.onDestroy();
    }

    //------------------------------------------------------------------------
    private boolean tryLoadNativeLibrary()
    {
        StringBuilder errors = new StringBuilder();
        for (String name : CANDIDATE_LIBS)
        {
            try
            {
                System.loadLibrary (name);
                loadedLib = name;
                Log.i (TAG, "Loaded native library: " + name);
                return true;
            }
            catch (UnsatisfiedLinkError | SecurityException e)
            {
                errors.append (name).append (": ").append (e.getMessage()).append ('\n');
            }
        }
        loadError = errors.toString();
        return false;
    }

    //------------------------------------------------------------------------
    // Diagnostic fallback screen (only shown if something goes wrong).
    private LinearLayout buildStatusLayout (String headline, String body)
    {
        LinearLayout root = new LinearLayout (this);
        root.setOrientation (LinearLayout.VERTICAL);
        root.setGravity (Gravity.CENTER);
        root.setBackgroundColor (Color.parseColor ("#0d0d12"));
        root.setPadding (48, 48, 48, 48);

        TextView t1 = new TextView (this);
        t1.setText ("Logical Chaos Melody Machine");
        t1.setTextColor (Color.parseColor ("#e0e0ff"));
        t1.setTextSize (22);
        t1.setPadding (0, 0, 0, 24);
        root.addView (t1);

        TextView t2 = new TextView (this);
        t2.setTextColor (Color.parseColor ("#ff8080"));
        t2.setTextSize (14);
        t2.setPadding (0, 0, 0, 16);
        t2.setText (headline);
        root.addView (t2);

        TextView t3 = new TextView (this);
        t3.setTextColor (Color.parseColor ("#9999b3"));
        t3.setTextSize (12);
        t3.setText (body == null ? "" : body);
        root.addView (t3);

        return root;
    }

    //------------------------------------------------------------------------
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private FrameLayout buildWebViewLayout()
    {
        FrameLayout container = new FrameLayout (this);
        container.setBackgroundColor (Color.parseColor ("#0d0d12"));

        webView = new WebView (this);
        webView.setBackgroundColor (Color.parseColor ("#0d0d12"));

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled (true);
        s.setDomStorageEnabled (true);
        s.setAllowFileAccess (true);
        s.setAllowContentAccess (true);
        s.setMediaPlaybackRequiresUserGesture (false);

        webView.setWebViewClient (new WebViewClient());
        webView.setWebChromeClient (new WebChromeClient()
        {
            @Override
            public boolean onConsoleMessage (android.webkit.ConsoleMessage cm)
            {
                Log.i (TAG + "WebView",
                       cm.sourceId() + ":" + cm.lineNumber() + " " + cm.message());
                return true;
            }
        });

        webView.addJavascriptInterface (new AndroidHost(), "AndroidHost");
        webView.loadUrl ("file:///android_asset/index.html");

        container.addView (webView, new FrameLayout.LayoutParams (
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT));
        return container;
    }

    //------------------------------------------------------------------------
    // JS<->native bridge.  Every public @JavascriptInterface method is
    // callable as `AndroidHost.<name>(...)` from the WebView's JS.
    private class AndroidHost
    {
        @JavascriptInterface
        public void sendEvent (String endpointID, double value)
        {
            try { nativeSendEvent (endpointID, value); }
            catch (Throwable t) { Log.e (TAG, "sendEvent failed", t); }
        }

        @JavascriptInterface
        public void sendParameter (String endpointID, float value)
        {
            try { nativeSendParameter (endpointID, value); }
            catch (Throwable t) { Log.e (TAG, "sendParameter failed", t); }
        }

        @JavascriptInterface
        public String getNativeStatus()
        {
            return "lib=" + loadedLib + "; startCode=" + startError;
        }
    }
}
