//==============================================================================
//  android_bridge.cpp
//  ------------------
//  JNI glue between the Android `MainActivity` Java class and the Cmajor/JUCE
//  audio plugin that lives inside libLogicalChaosMelodyMachine_Standalone.so.
//
//  Why this file exists
//  --------------------
//  The Cmajor JUCE target produces a JUCE AudioProcessor (via the standard
//  `createPluginFilter()` entry point) plus a "Standalone" wrapper, but that
//  standalone wrapper normally expects JUCE's Projucer-generated `JuceActivity`
//  to drive it.  We don't have that — so we drive the processor ourselves:
//
//    * `nativeStart`  : creates the processor, spins up an AudioDeviceManager
//                       (which on Android uses Oboe under the hood), and plugs
//                       the two together via AudioProcessorPlayer.
//    * `nativeStop`   : tears the audio graph down cleanly.
//    * `nativeSendEvent`
//    * `nativeSendParameter`
//                     : invoked from the WebView JS bridge so `view.js` can
//                       drive the DSP (play/stop/generate events, synth knobs,
//                       step toggles …).
//
//  The WebView UI (view.js) talks to the patchConnection JS shim injected in
//  MainActivity; that shim forwards every call down to these JNI methods.
//==============================================================================

#include <jni.h>
#include <android/log.h>
#include <memory>
#include <mutex>
#include <string>

// JUCE pulls juce_audio_devices (Oboe-backed on Android), juce_audio_processors,
// and juce_audio_utils (where AudioProcessorPlayer lives).  All three modules
// are already compiled into the shared lib by the generated CMake — we just
// need to pull in their public headers here.
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>

#define LOG_TAG "LogicalChaosNative"
#define LOGI(...) __android_log_print (ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print (ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print (ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Standard JUCE plugin entry point — implemented by cmajor_plugin.cpp.
extern juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter();

namespace
{
    // Guard every access with a mutex — the JS bridge calls come in on the
    // WebView thread, while nativeStart / Stop run on the UI thread.
    std::mutex                          stateMutex;
    std::unique_ptr<juce::AudioProcessor>     processor;
    std::unique_ptr<juce::AudioDeviceManager> deviceManager;
    std::unique_ptr<juce::AudioProcessorPlayer> player;

    juce::AudioProcessorParameter* findParameter (const juce::String& idOrName)
    {
        if (processor == nullptr) return nullptr;

        for (auto* p : processor->getParameters())
        {
            if (auto* withID = dynamic_cast<juce::AudioProcessorParameterWithID*> (p))
                if (withID->paramID == idOrName)
                    return p;

            if (p->getName (256) == idOrName)
                return p;
        }
        return nullptr;
    }

    std::string jstringToStd (JNIEnv* env, jstring s)
    {
        if (s == nullptr) return {};
        const char* c = env->GetStringUTFChars (s, nullptr);
        std::string out = c ? c : "";
        if (c) env->ReleaseStringUTFChars (s, c);
        return out;
    }
}

extern "C" {

//------------------------------------------------------------------------------
// nativeStart — returns 0 on success, non-zero error code otherwise.
//------------------------------------------------------------------------------
JNIEXPORT jint JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStart (JNIEnv*, jobject)
{
    std::lock_guard<std::mutex> lock (stateMutex);

    if (processor != nullptr)
    {
        LOGW ("nativeStart: engine already running");
        return 0;
    }

    try
    {
        LOGI ("Creating JUCE AudioProcessor via createPluginFilter()");
        processor.reset (createPluginFilter());
        if (processor == nullptr)
        {
            LOGE ("createPluginFilter() returned nullptr");
            return 1;
        }

        LOGI ("Initialising AudioDeviceManager (0 in / 2 out)");
        deviceManager = std::make_unique<juce::AudioDeviceManager>();
        auto err = deviceManager->initialiseWithDefaultDevices (0, 2);
        if (err.isNotEmpty())
        {
            LOGE ("AudioDeviceManager init failed: %s", err.toRawUTF8());
            processor.reset();
            deviceManager.reset();
            return 2;
        }

        player = std::make_unique<juce::AudioProcessorPlayer>();
        player->setProcessor (processor.get());
        deviceManager->addAudioCallback (player.get());

        LOGI ("Engine started. Parameter count: %d", processor->getParameters().size());
        for (auto* p : processor->getParameters())
        {
            juce::String id = p->getName (256);
            if (auto* withID = dynamic_cast<juce::AudioProcessorParameterWithID*> (p))
                id = withID->paramID + " (" + p->getName (64) + ")";
            LOGI ("  param: %s", id.toRawUTF8());
        }

        return 0;
    }
    catch (const std::exception& e)
    {
        LOGE ("nativeStart exception: %s", e.what());
        processor.reset();
        deviceManager.reset();
        player.reset();
        return 3;
    }
    catch (...)
    {
        LOGE ("nativeStart unknown exception");
        processor.reset();
        deviceManager.reset();
        player.reset();
        return 4;
    }
}

//------------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStop (JNIEnv*, jobject)
{
    std::lock_guard<std::mutex> lock (stateMutex);

    if (deviceManager && player)
        deviceManager->removeAudioCallback (player.get());

    if (player)
        player->setProcessor (nullptr);

    player.reset();
    deviceManager.reset();
    processor.reset();
    LOGI ("Engine stopped.");
}

//------------------------------------------------------------------------------
// nativeSendParameter — sets a normalized [0,1] parameter value by ID/name.
//------------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeSendParameter
    (JNIEnv* env, jobject, jstring nameJ, jfloat value)
{
    std::lock_guard<std::mutex> lock (stateMutex);
    const auto name = jstringToStd (env, nameJ);

    if (auto* param = findParameter (name))
    {
        param->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, value));
        LOGI ("Param set: %s = %f", name.c_str(), value);
    }
    else
    {
        LOGW ("Param NOT FOUND: %s", name.c_str());
    }
}

//------------------------------------------------------------------------------
// nativeSendEvent — Cmajor "input event" triggers are exported by the JUCE
// wrapper as momentary-style parameters.  Fire them by briefly setting the
// parameter to 1.0 then back to 0.0; Cmajor only cares about the rising edge.
//------------------------------------------------------------------------------
JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeSendEvent
    (JNIEnv* env, jobject, jstring nameJ, jdouble value)
{
    std::lock_guard<std::mutex> lock (stateMutex);
    const auto name = jstringToStd (env, nameJ);

    if (auto* param = findParameter (name))
    {
        // Momentary trigger: rising edge is what Cmajor listens for.
        param->beginChangeGesture();
        param->setValueNotifyingHost ((float) juce::jlimit (0.0, 1.0, value));
        param->setValueNotifyingHost (0.0f);
        param->endChangeGesture();
        LOGI ("Event fired: %s (val=%f)", name.c_str(), (double) value);
    }
    else
    {
        LOGW ("Event endpoint NOT FOUND: %s", name.c_str());
    }
}

} // extern "C"
