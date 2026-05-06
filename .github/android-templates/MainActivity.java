package com.subfigames.logicalchaos.melodymachine;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;

/**
 * Android entry point for Logical Chaos Melody Machine.
 *
 * Launch sequence (May 2026 rewrite — UI-first)
 * --------------------------------------------
 * Earlier versions tried to construct the JUCE/Cmajor audio engine inside
 * onCreate().  When the engine crashed, the user never saw the UI and the
 * app appeared to "open and immediately error out".  The new flow:
 *
 *   onCreate()
 *     -> install Java + native crash handlers
 *     -> show previous-launch crash file (if any) and stop
 *     -> System.loadLibrary  (just the native shared object, no engine)
 *     -> setContentView(WebView)             <-- UI is up here, always
 *
 *   user taps "Start Audio" in the WebView
 *     -> AndroidHost.startEngine()
 *          -> nativeStart()       (create JUCE plugin + prepareToPlay)
 *          -> nativeStartAudio()  (open Oboe stream)
 *
 * Even if the engine init crashes, the WebView is already on screen and the
 * crash details are captured in last-crash.log + native-crash.log + the
 * progress.log checkpoint trail (see android_bridge.cpp).
 */
public class MainActivity extends Activity
{
    private static final String TAG = "LogicalChaos";

    private static final String JAVA_CRASH_FILE   = "last-crash.log";
    private static final String NATIVE_CRASH_FILE = "native-crash.log";
    private static final String PROGRESS_FILE     = "progress.log";

    // Candidate shared-library names we might find in lib/.
    private static final String[] CANDIDATE_LIBS = {
        "LogicalChaosMelodyMachine",
        "LogicalChaosMelodyMachine_Standalone",
    };

    private String  loadedLib    = null;
    private String  loadError    = null;
    private String  startError   = null;
    private boolean engineStarted = false;
    // Back-compat alias for older conflict-resolved variants
    private boolean engineCreated = false;
    // Back-compat alias for conflict variants that manage audio state in Java
    private boolean audioRunning = false;
    private WebView webView      = null;

    // --- Native methods (android_bridge.cpp) --------------------------------
    private native void   nativeSetCrashLogPath (String crashPath, String progressPath);
    private native String nativeStart();                         // create engine
    private native String nativeStartAudio();                    // open Oboe + start
    private native void   nativeStopAudio();
    private native void   nativeStop();                          // destroy engine
    private native void   nativeSendEvent       (String endpointID, double value);
    private native void   nativeSendParameter   (String endpointID, float  value);
    private native String nativeReadProgressLog();

    //------------------------------------------------------------------------
    @Override
    protected void onCreate (Bundle savedInstanceState)
    {
        super.onCreate (savedInstanceState);
        installJavaCrashHandler();

        // If a previous run left a crash file, show it first and stop —
        // don't re-trigger the same crash on the same device state.
        String previousCrash = readAndDeletePreviousCrash();
        if (previousCrash != null)
        {
            setContentView (buildScrollableStatusLayout (
                "Previous launch crashed", previousCrash));
            return;
        }

        // Always try to load the .so so we can wire the WebView bridge.
        // If loading fails we still show a useful error layout.
        if (! tryLoadNativeLibrary())
        {
            setContentView (buildScrollableStatusLayout (
                "Failed to load native library", loadError));
            return;
        }

        // Tell native where to write crash + progress reports.  Must happen
        // before any other native call so the signal handlers are armed.
        try
        {
            File dir = getFilesDir();
            File nativeCrash = new File (dir, NATIVE_CRASH_FILE);
            File progress    = new File (dir, PROGRESS_FILE);
            nativeSetCrashLogPath (nativeCrash.getAbsolutePath(),
                                   progress.getAbsolutePath());
        }
        catch (Throwable t)
        {
            Log.w (TAG, "nativeSetCrashLogPath threw — continuing", t);
        }

        // Do not create the audio engine during Activity startup.
        // Engine creation happens lazily from AndroidHost.startAudio(), which
        // gives better diagnostics and avoids blocking or crashing the UI path.
        engineStarted = true;
        engineCreated = true;
        setContentView (buildWebViewLayout());
    }

    @Override
    protected void onDestroy()
    {
        try { if (engineStarted || engineCreated) nativeStop(); }
        catch (Throwable t) { Log.e (TAG, "nativeStop failed", t); }
        super.onDestroy();
    }

    //------------------------------------------------------------------------
    // Java crash plumbing
    //------------------------------------------------------------------------
    private void installJavaCrashHandler()
    {
        final Thread.UncaughtExceptionHandler prev =
            Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler ((t, e) ->
        {
            try
            {
                File f = new File (getFilesDir(), JAVA_CRASH_FILE);
                FileOutputStream os = new FileOutputStream (f);
                PrintStream ps = new PrintStream (os, true,
                                                  StandardCharsets.UTF_8.name());
                ps.println ("Thread: " + t.getName());
                ps.println ("Time:   " + System.currentTimeMillis());
                ps.println();
                e.printStackTrace (ps);
                ps.close();
            }
            catch (Throwable io)
            {
                Log.e (TAG, "Couldn't write Java crash file", io);
            }
            if (prev != null) prev.uncaughtException (t, e);
        });
    }

    private String readAndDeletePreviousCrash()
    {
        String java   = readAndDelete (new File (getFilesDir(), JAVA_CRASH_FILE));
        String native_ = readAndDelete (new File (getFilesDir(), NATIVE_CRASH_FILE));

        if (java == null && native_ == null) return null;

        StringBuilder sb = new StringBuilder();
        if (native_ != null)
        {
            sb.append ("=== Native ===\n").append (native_).append ("\n\n");
        }
        if (java != null)
        {
            sb.append ("=== Java ===\n").append (java);
        }
        return sb.toString();
    }

    private static String readAndDelete (File f)
    {
        if (! f.exists()) return null;
        try
        {
            java.io.FileInputStream in = new java.io.FileInputStream (f);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read (buf)) > 0) bos.write (buf, 0, n);
            in.close();
            return new String (bos.toByteArray(), StandardCharsets.UTF_8);
        }
        catch (IOException e)
        {
            return "Could not read " + f.getName() + ": " + e.getMessage();
        }
        finally
        {
            //noinspection ResultOfMethodCallIgnored
            f.delete();
        }
    }

    private static String stackTraceString (Throwable t)
    {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        try
        {
            PrintStream ps = new PrintStream (bos, true,
                                              StandardCharsets.UTF_8.name());
            t.printStackTrace (ps);
            ps.close();
        }
        catch (Throwable ignore) { return String.valueOf (t); }
        return bos.toString();
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
    private ScrollView buildScrollableStatusLayout (String headline, String body)
    {
        ScrollView sv = new ScrollView (this);
        sv.setBackgroundColor (Color.parseColor ("#0d0d12"));

        LinearLayout root = new LinearLayout (this);
        root.setOrientation (LinearLayout.VERTICAL);
        root.setPadding (48, 96, 48, 96);

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
        t2.setText (headline == null ? "" : headline);
        root.addView (t2);

        TextView t3 = new TextView (this);
        t3.setTextColor (Color.parseColor ("#9999b3"));
        t3.setTextSize (12);
        t3.setTypeface (android.graphics.Typeface.MONOSPACE);
        t3.setText (body == null ? "(no details)" : body);
        t3.setTextIsSelectable (true);
        root.addView (t3);

        sv.addView (root, new ViewGroup.LayoutParams (
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT));
        return sv;
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
            if (! engineCreated) return;
            try { nativeSendEvent (endpointID, value); }
            catch (Throwable t) { Log.e (TAG, "sendEvent failed", t); }
        }

        @JavascriptInterface
        public void sendParameter (String endpointID, float value)
        {
            if (! engineCreated) return;
            try { nativeSendParameter (endpointID, value); }
            catch (Throwable t) { Log.e (TAG, "sendParameter failed", t); }
        }

        @JavascriptInterface
        public String getNativeStatus()
        {
            return "lib=" + loadedLib + "; started=" + (engineStarted || engineCreated);
        }

        // Combined "create + start" used by the WebView's Start Audio button.
        // Returns "" on success or an error string the JS can show.
        @JavascriptInterface
        public String startEngine()
        {
            try
            {
                if (! engineCreated)
                {
                    String err = nativeStart();
                    if (err != null && ! err.isEmpty())
                        return "create: " + err;
                    engineCreated = true;
                }

                if (! audioRunning)
                {
                    String err = nativeStartAudio();
                    if (err != null && ! err.isEmpty())
                        return "audio: " + err;
                    audioRunning = true;
                }
                return "";
            }
            catch (Throwable t)
            {
                return stackTraceString (t);
            }
        }

        // Backwards-compatible alias used by older index.html builds.
        @JavascriptInterface
        public String startAudio() { return startEngine(); }

        @JavascriptInterface
        public void stopAudio()
        {
            try { nativeStopAudio(); audioRunning = false; }
            catch (Throwable t) { Log.e (TAG, "stopAudio failed", t); }
        }

        @JavascriptInterface
        public String readProgressLog()
        {
            try { return nativeReadProgressLog(); }
            catch (Throwable t) { return "(could not read progress: " + t.getMessage() + ")"; }
        }
    }
}
