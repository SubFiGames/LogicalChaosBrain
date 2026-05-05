//==============================================================================
//  android_bridge.cpp  —  Oboe-driven version
//  ------------------------------------------
//  Rather than using juce::AudioDeviceManager (which on Android expects the
//  Projucer-generated Java helper class `com.rmsl.juce.Java` to exist), we
//  drive audio I/O with Oboe directly and feed each output block through the
//  JUCE AudioProcessor produced by createPluginFilter().  Oboe is already
//  compiled into the shared library as part of juce_audio_devices, so no new
//  dependency is introduced.
//
//  Crash safety: JNI methods write any fatal error into a file in the app's
//  files-dir (passed in from Java) so MainActivity can display the message
//  on next launch.  Useful when the user doesn't have adb access.
//==============================================================================

#include <jni.h>
#include <android/log.h>
#include <csignal>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

#include <oboe/Oboe.h>
#include <juce_audio_processors/juce_audio_processors.h>

#define LOG_TAG "LogicalChaosNative"
#define LOGI(...) __android_log_print (ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print (ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print (ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

// Standard JUCE plugin entry point — implemented by cmajor_plugin.cpp.
extern juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter();

// ---------------------------------------------------------------------------
// Crash file: full absolute path set once via setCrashLogPath JNI call.
// ---------------------------------------------------------------------------
namespace
{
    std::string g_crashLogPath;

    void writeCrashLog (const char* headline, const char* body)
    {
        if (g_crashLogPath.empty()) return;
        FILE* f = std::fopen (g_crashLogPath.c_str(), "w");
        if (! f) return;
        std::fprintf (f, "%s\n\n%s\n", headline ? headline : "", body ? body : "");
        std::fclose (f);
    }

    void signalHandler (int sig)
    {
        char buf[128];
        std::snprintf (buf, sizeof (buf),
                       "Native signal %d (%s) caught in audio thread.\n"
                       "The shared library crashed — see logcat tag '%s' "
                       "for the tombstone.",
                       sig, strsignal (sig), LOG_TAG);
        writeCrashLog ("Native crash", buf);
        // Re-raise with default disposition so Android can still produce a tombstone.
        std::signal (sig, SIG_DFL);
        std::raise (sig);
    }

    void installSignalHandlers()
    {
        std::signal (SIGSEGV, signalHandler);
        std::signal (SIGABRT, signalHandler);
        std::signal (SIGFPE,  signalHandler);
        std::signal (SIGILL,  signalHandler);
        std::signal (SIGBUS,  signalHandler);
    }
}

// ---------------------------------------------------------------------------
// Audio engine.
// ---------------------------------------------------------------------------
class Engine : public oboe::AudioStreamDataCallback,
               public oboe::AudioStreamErrorCallback
{
public:
    std::string start()
    {
        std::lock_guard<std::mutex> lock (mutex_);

        if (stream_ != nullptr)
            return {}; // already running

        try
        {
            LOGI ("Engine::start — creating JUCE processor");
            processor_.reset (createPluginFilter());
            if (processor_ == nullptr)
                return "createPluginFilter() returned nullptr";

            // Log what the Cmajor-generated JUCE processor actually reports.
            // Useful to know whether the channel layout we assume (stereo out)
            // matches what Cmajor exposes.
            const int busIns  = processor_->getTotalNumInputChannels();
            const int busOuts = processor_->getTotalNumOutputChannels();
            LOGI ("Processor reports: inputs=%d outputs=%d latency=%d params=%d",
                  busIns, busOuts,
                  processor_->getLatencySamples(),
                  processor_->getParameters().size());

            for (auto* p : processor_->getParameters())
            {
                juce::String id = p->getName (256);
                if (auto* withID = dynamic_cast<juce::AudioProcessorParameterWithID*> (p))
                    id = withID->paramID + " (" + p->getName (64) + ")";
                LOGI ("  param: %s", id.toRawUTF8());
            }

            // Size our internal buffer to whatever the processor claims, with a
            // floor of 2 (so we can always deliver stereo to Oboe).
            numProcChannels_ = juce::jmax (2, juce::jmax (busIns, busOuts));

            // ---- Prepare the processor with a GENEROUS maximum block size.
            //
            // Oboe's onAudioReady can deliver MORE frames than
            // `framesPerBurst`, so prepareToPlay must be called with a safe
            // upper bound — otherwise Cmajor's internal buffers are too small
            // and processBlock writes past the end → SIGSEGV.  2048 is the
            // effective cap; anything larger gets processed in chunks below.
            constexpr int    kMaxBlock = 2048;
            constexpr double kDefaultSR = 48000.0;

            processor_->setPlayConfigDetails (busIns, busOuts, kDefaultSR, kMaxBlock);
            processor_->prepareToPlay (kDefaultSR, kMaxBlock);

            oboe::AudioStreamBuilder b;
            b.setDirection (oboe::Direction::Output);
            b.setPerformanceMode (oboe::PerformanceMode::LowLatency);
            b.setSharingMode (oboe::SharingMode::Exclusive);
            b.setFormat (oboe::AudioFormat::Float);
            b.setChannelCount (2);
            b.setSampleRate (static_cast<int32_t> (kDefaultSR));
            b.setDataCallback (this);
            b.setErrorCallback (this);

            auto r = b.openStream (stream_);
            if (r != oboe::Result::OK)
            {
                std::string err = std::string ("Oboe openStream failed: ") + oboe::convertToText (r);
                LOGE ("%s", err.c_str());
                processor_.reset();
                return err;
            }

            const auto actualSR    = stream_->getSampleRate();
            const auto framesBurst = stream_->getFramesPerBurst();
            LOGI ("Oboe stream opened: SR=%d, framesPerBurst=%d", actualSR, framesBurst);

            // Re-prepare at the actual sample rate but KEEP the generous max.
            processor_->setPlayConfigDetails (busIns, busOuts, (double) actualSR, kMaxBlock);
            processor_->prepareToPlay ((double) actualSR, kMaxBlock);

            // Pre-allocate per-channel scratch at the same max size.
            scratch_.assign ((size_t) numProcChannels_,
                             std::vector<float> ((size_t) kMaxBlock, 0.0f));
            chanPtrs_.assign ((size_t) numProcChannels_, nullptr);
            for (int i = 0; i < numProcChannels_; ++i)
                chanPtrs_[(size_t) i] = scratch_[(size_t) i].data();
            maxBlock_ = kMaxBlock;

            r = stream_->requestStart();
            if (r != oboe::Result::OK)
            {
                std::string err = std::string ("Oboe requestStart failed: ") + oboe::convertToText (r);
                LOGE ("%s", err.c_str());
                stream_->close();
                stream_.reset();
                processor_.reset();
                return err;
            }

            LOGI ("Engine started. maxBlock=%d numProcChannels=%d", maxBlock_, numProcChannels_);
            return {};
        }
        catch (const std::exception& e)
        {
            processor_.reset();
            if (stream_) { stream_->close(); stream_.reset(); }
            return std::string ("Engine start threw: ") + e.what();
        }
        catch (...)
        {
            processor_.reset();
            if (stream_) { stream_->close(); stream_.reset(); }
            return "Engine start threw unknown exception";
        }
    }

    void stop()
    {
        std::lock_guard<std::mutex> lock (mutex_);
        if (stream_)
        {
            stream_->requestStop();
            stream_->close();
            stream_.reset();
        }
        if (processor_)
        {
            processor_->releaseResources();
            processor_.reset();
        }
        LOGI ("Engine stopped.");
    }

    void sendParameter (const std::string& id, float value)
    {
        std::lock_guard<std::mutex> lock (mutex_);
        if (auto* p = findParam (id))
        {
            p->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, value));
            LOGI ("Param set: %s = %f", id.c_str(), value);
        }
        else
        {
            LOGW ("Param NOT FOUND: %s", id.c_str());
        }
    }

    void sendEvent (const std::string& id, float value)
    {
        std::lock_guard<std::mutex> lock (mutex_);
        if (auto* p = findParam (id))
        {
            // Rising-edge trigger for Cmajor event endpoints exported as
            // momentary parameters.
            p->beginChangeGesture();
            p->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, value));
            p->setValueNotifyingHost (0.0f);
            p->endChangeGesture();
            LOGI ("Event fired: %s (val=%f)", id.c_str(), value);
        }
        else
        {
            LOGW ("Event endpoint NOT FOUND: %s", id.c_str());
        }
    }

    // --- oboe::AudioStreamDataCallback -----------------------------------
    oboe::DataCallbackResult onAudioReady (oboe::AudioStream*,
                                           void* audioData,
                                           int32_t numFrames) override
    {
        auto* out = static_cast<float*> (audioData);

        if (processor_ == nullptr || numProcChannels_ == 0)
        {
            std::memset (out, 0, sizeof (float) * 2 * (size_t) numFrames);
            return oboe::DataCallbackResult::Continue;
        }

        // Process in chunks of at most maxBlock_ frames — Cmajor's internal
        // buffers were allocated for that size by prepareToPlay, and going
        // larger would overrun them.
        int processed = 0;
        while (processed < numFrames)
        {
            const int chunk = juce::jmin (numFrames - processed, maxBlock_);

            juce::AudioBuffer<float> buf (chanPtrs_.data(), numProcChannels_, chunk);
            buf.clear();

            juce::MidiBuffer midi;
            try
            {
                processor_->processBlock (buf, midi);
            }
            catch (...)
            {
                // Belt-and-braces: any uncaught C++ exception inside Cmajor
                // fills the buffer with silence rather than crashing the app.
                // SIGSEGV won't hit this path — the signal handler covers it.
                buf.clear();
            }

            // Interleave the first two channels into Oboe's stereo output.
            const float* l = chanPtrs_[0];
            const float* r = numProcChannels_ > 1 ? chanPtrs_[1] : chanPtrs_[0];
            for (int i = 0; i < chunk; ++i)
            {
                out[2 * (processed + i)    ] = l[i];
                out[2 * (processed + i) + 1] = r[i];
            }
            processed += chunk;
        }
        return oboe::DataCallbackResult::Continue;
    }

    void onErrorBeforeClose (oboe::AudioStream*, oboe::Result r) override
    {
        LOGE ("Oboe onErrorBeforeClose: %s", oboe::convertToText (r));
    }

    void onErrorAfterClose (oboe::AudioStream*, oboe::Result r) override
    {
        LOGE ("Oboe onErrorAfterClose: %s", oboe::convertToText (r));
    }

private:
    juce::AudioProcessorParameter* findParam (const std::string& idOrName)
    {
        if (processor_ == nullptr) return nullptr;
        const juce::String want (idOrName);
        for (auto* p : processor_->getParameters())
        {
            if (auto* w = dynamic_cast<juce::AudioProcessorParameterWithID*> (p))
                if (w->paramID == want) return p;
            if (p->getName (256) == want) return p;
        }
        return nullptr;
    }

    std::mutex                          mutex_;
    std::unique_ptr<juce::AudioProcessor> processor_;
    std::shared_ptr<oboe::AudioStream>    stream_;

    // Pre-allocated per-channel scratch (avoid allocating on the audio thread).
    // scratch_[ch] is a numFrames-sized buffer; chanPtrs_ is the array-of-pointers
    // that JUCE's AudioBuffer<float>(float* const* ...) constructor needs.
    std::vector<std::vector<float>>       scratch_;
    std::vector<float*>                   chanPtrs_;
    int                                   numProcChannels_ = 0;
    int                                   maxBlock_        = 0;
};

static Engine g_engine;

// ---------------------------------------------------------------------------
// JNI
// ---------------------------------------------------------------------------
namespace
{
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

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeSetCrashLogPath
    (JNIEnv* env, jobject, jstring pathJ)
{
    g_crashLogPath = jstringToStd (env, pathJ);
    installSignalHandlers();
    LOGI ("Crash log path: %s", g_crashLogPath.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStart
    (JNIEnv* env, jobject)
{
    try
    {
        auto err = g_engine.start();
        return env->NewStringUTF (err.c_str()); // "" on success
    }
    catch (const std::exception& e)
    {
        writeCrashLog ("Engine start threw std::exception", e.what());
        return env->NewStringUTF (e.what());
    }
    catch (...)
    {
        writeCrashLog ("Engine start threw unknown exception", "");
        return env->NewStringUTF ("unknown exception");
    }
}

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStop (JNIEnv*, jobject)
{
    g_engine.stop();
}

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeSendParameter
    (JNIEnv* env, jobject, jstring nameJ, jfloat value)
{
    g_engine.sendParameter (jstringToStd (env, nameJ), (float) value);
}

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeSendEvent
    (JNIEnv* env, jobject, jstring nameJ, jdouble value)
{
    g_engine.sendEvent (jstringToStd (env, nameJ), (float) value);
}

} // extern "C"
