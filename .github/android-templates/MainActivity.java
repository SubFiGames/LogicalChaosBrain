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
 * Design goals (the app-crashes-silently problem)
 * -----------------------------------------------
 * The user testing this APK doesn't have adb access, so whenever the app
 * dies we need to display the reason on the next launch.  We do this with
 * two layers:
 *
 *   1. A Thread.UncaughtExceptionHandler that writes any Java stack trace
 *      (including the UnsatisfiedLinkError / RuntimeException from a failed
 *      native init) to {@code getFilesDir()/last-crash.log}.
 *   2. A native-side signal handler (installed by the JNI bridge once we
 *      pass it the crash-file path) that catches SIGSEGV / SIGABRT etc.
 *      and records a short description into {@code native-crash.log} before
 *      letting Android produce its normal tombstone.
 *
 * On every subsequent launch, if either file exists we show it on-screen
 * and delete it.  Nothing is silent.
 */
public class MainActivity extends Activity
{
    private static final String TAG = "LogicalChaos";

    private static final String JAVA_CRASH_FILE   = "last-crash.log";
    private static final String NATIVE_CRASH_FILE = "native-crash.log";

    // Candidate shared-library names we might find in lib/.
    private static final String[] CANDIDATE_LIBS = {
        "LogicalChaosMelodyMachine",
        "LogicalChaosMelodyMachine_Standalone",
    };

    private String  loadedLib    = null;
    private String  loadError    = null;
    private String  startError   = null;
    private boolean engineStarted = false;
    private WebView webView      = null;

    // --- Native methods (android_bridge.cpp) --------------------------------
    private native void   nativeSetCrashLogPath (String path);
    private native String nativeStart();                         // create engine
    private native String nativeStartAudio();                    // open Oboe + start
    private native void   nativeStopAudio();
    private native void   nativeStop();                          // destroy engine
    private native void   nativeSendEvent       (String endpointID, double value);
    private native void   nativeSendParameter   (String endpointID, float  value);

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

        if (! tryLoadNativeLibrary())
        {
            setContentView (buildScrollableStatusLayout (
                "Failed to load native library", loadError));
            return;
        }

        // Tell native where to write crash reports.  Must happen before
        // any other native call so the signal handlers are armed.
        try
        {
            File dir = getFilesDir();
            File nativeCrash = new File (dir, NATIVE_CRASH_FILE);
            nativeSetCrashLogPath (nativeCrash.getAbsolutePath());
        }
        catch (Throwable t)
        {
            Log.w (TAG, "nativeSetCrashLogPath threw — continuing", t);
        }

        // Do not create the audio engine during Activity startup.
        // Engine creation happens lazily from AndroidHost.startAudio(), which
        // gives better diagnostics and avoids blocking or crashing the UI path.
        engineStarted = true;
        setContentView (buildWebViewLayout());
    }

    @Override
    protected void onDestroy()
    {
        try { if (engineStarted) nativeStop(); }
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
            return "lib=" + loadedLib + "; started=" + engineStarted;
        }

        // Called by the WebView UI to start/stop audio.  Returns "" on success
        // or an error string the JS can display.
        @JavascriptInterface
        public String startAudio()
        {
            try { return nativeStartAudio(); }
            catch (Throwable t) { return stackTraceString (t); }
        }

        @JavascriptInterface
        public void stopAudio()
        {
            try { nativeStopAudio(); }
            catch (Throwable t) { Log.e (TAG, "stopAudio failed", t); }
        }
    }
}
