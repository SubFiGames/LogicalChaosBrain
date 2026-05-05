package com.subfigames.logicalchaos.melodymachine;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Minimal bootstrap Activity for the Logical Chaos Melody Machine
 * Android build.
 *
 * This exists because the Cmajor/JUCE CMake export produces only a
 * native shared library ({@code libLogicalChaosMelodyMachine.so}).
 * Android still needs a Java entry-point class that matches the
 * {@code <activity android:name=".MainActivity"/>} declaration in
 * {@code AndroidManifest.xml} — otherwise the OS throws
 * {@code ClassNotFoundException} and kills the app on launch.
 *
 * Current scope:
 *   1. Load the native library so the JUCE/Cmajor audio engine
 *      initializes (global C++ constructors run at dlopen time).
 *   2. Display a visible status screen — this turns silent crashes
 *      into readable messages, which is critical while we iterate
 *      on the native build.
 *
 * Backlog (tracked in PRD.md): wire this activity up to a proper
 * WebView that loads {@code view.js} so the patch UI is usable.
 */
public class MainActivity extends Activity
{
    private static final String TAG = "LogicalChaos";

    // JUCE generates the shared library using the target name set in
    // its CMakeLists.txt.  With JUCE_SHARED_CODE=1 + standalone target
    // the common names are:
    //   libLogicalChaosMelodyMachine.so          (the main target)
    //   libLogicalChaosMelodyMachine_Standalone.so (standalone wrapper)
    // Try each candidate in order and remember which one succeeded.
    private static final String[] CANDIDATE_LIBS = {
        "LogicalChaosMelodyMachine",
        "LogicalChaosMelodyMachine_Standalone",
        "juce_jni"
    };

    private String loadedLib   = null;
    private String loadError   = null;

    @Override
    protected void onCreate (Bundle savedInstanceState)
    {
        super.onCreate (savedInstanceState);

        tryLoadNativeLibrary();
        setContentView (buildStatusLayout());
    }

    private void tryLoadNativeLibrary()
    {
        StringBuilder errors = new StringBuilder();

        for (String name : CANDIDATE_LIBS)
        {
            try
            {
                System.loadLibrary (name);
                loadedLib = name;
                Log.i (TAG, "Loaded native library: " + name);
                return;
            }
            catch (UnsatisfiedLinkError | SecurityException e)
            {
                Log.w (TAG, "Could not load lib" + name + ".so: " + e.getMessage());
                errors.append (name).append (": ").append (e.getMessage()).append ('\n');
            }
        }

        loadError = errors.toString();
    }

    private LinearLayout buildStatusLayout()
    {
        LinearLayout root = new LinearLayout (this);
        root.setOrientation (LinearLayout.VERTICAL);
        root.setGravity (Gravity.CENTER);
        root.setBackgroundColor (Color.parseColor ("#0d0d12"));
        root.setPadding (48, 48, 48, 48);

        TextView title = new TextView (this);
        title.setText ("Logical Chaos Melody Machine");
        title.setTextColor (Color.parseColor ("#e0e0ff"));
        title.setTextSize (22);
        title.setPadding (0, 0, 0, 24);
        root.addView (title);

        TextView status = new TextView (this);
        status.setTextColor (Color.parseColor ("#9999b3"));
        status.setTextSize (14);

        if (loadedLib != null)
        {
            status.setText ("Native engine loaded: lib" + loadedLib + ".so\n\n"
                          + "Audio DSP is running in the background.\n"
                          + "UI (WebView) is a pending backlog item.");
        }
        else
        {
            status.setTextColor (Color.parseColor ("#ff8080"));
            status.setText ("Failed to load native library.\n\nAttempts:\n" + loadError);
        }
        root.addView (status);

        return root;
    }
}
