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
#include <pthread.h>
#include <string>
#include <unistd.h>
#include <sys/types.h>
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
        char buf[256];
        // gettid() is the Linux-specific thread id; pthread_self() is more
        // useful for matching with our LOGI calls.  Print BOTH so the user
        // can tell which thread crashed (audio vs message vs JS bridge).
        std::snprintf (buf, sizeof (buf),
                       "Native signal %d (%s)\n"
                       "tid=%d  pthread=%lx\n"
                       "See logcat tag '%s' for the tombstone and the\n"
                       "last LOGI line printed before the crash — that will\n"
                       "narrow down which thread/operation segfaulted.",
                       sig, strsignal (sig),
                       (int) gettid(),
                       (unsigned long) pthread_self(),
                       LOG_TAG);
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
    // Step 1: create the JUCE processor and prepareToPlay.  Does NOT open
    // any audio stream — the WebView UI loads after this, and the user
    // explicitly starts audio with startAudio() (so if audio crashes, the
    // UI is still visible as evidence the engine itself initialised cleanly).
    std::string create()
    {
        std::lock_guard<std::mutex> lock (mutex_);

        if (processor_ != nullptr)
            return {};

        try
        {
            // IMPORTANT (Android): do NOT pre-create juce::MessageManager here.
            // In this minimal Activity/Oboe bootstrap the JUCE Java side may
            // not be initialised yet, and MessageManager::getInstance() can
            // crash while trying to bind Android looper helpers.
            // This engine path is audio-only and does not require a JUCE
            // message thread to construct the processor.

            LOGI ("Engine::create — calling createPluginFilter()");
            processor_.reset (createPluginFilter());
            if (processor_ == nullptr)
                return "createPluginFilter() returned nullptr";

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

            numProcChannels_ = juce::jmax (2, juce::jmax (busIns, busOuts));

            constexpr int    kMaxBlock  = 2048;
            constexpr double kDefaultSR = 48000.0;
            processor_->setPlayConfigDetails (busIns, busOuts, kDefaultSR, kMaxBlock);
            processor_->prepareToPlay (kDefaultSR, kMaxBlock);
            maxBlock_ = kMaxBlock;

            scratch_.assign ((size_t) numProcChannels_,
                             std::vector<float> ((size_t) kMaxBlock, 0.0f));
            chanPtrs_.assign ((size_t) numProcChannels_, nullptr);
            for (int i = 0; i < numProcChannels_; ++i)
                chanPtrs_[(size_t) i] = scratch_[(size_t) i].data();

            LOGI ("Engine ready: maxBlock=%d numProcChannels=%d", maxBlock_, numProcChannels_);
            return {};
        }
        catch (const std::exception& e)
        {
            processor_.reset();
            return std::string ("Engine create threw: ") + e.what();
        }
        catch (...)
        {
            processor_.reset();
            return "Engine create threw unknown exception";
        }
    }

    // Step 2: open the Oboe stream and start the audio thread.  Called from
    // JS via AndroidHost.startAudio() once the user is ready.
    std::string startAudio()
    {
        std::lock_guard<std::mutex> lock (mutex_);

        if (processor_ == nullptr)
            return "engine not initialised — call nativeStart first";
        if (stream_ != nullptr)
            return {}; // already running

        try
        {
            const auto sr = processor_->getSampleRate() > 0
                          ? processor_->getSampleRate() : 48000.0;

            oboe::AudioStreamBuilder b;
            b.setDirection (oboe::Direction::Output);
            b.setPerformanceMode (oboe::PerformanceMode::LowLatency);
            b.setSharingMode (oboe::SharingMode::Exclusive);
            b.setFormat (oboe::AudioFormat::Float);
            b.setChannelCount (2);
            b.setSampleRate (static_cast<int32_t> (sr));
            b.setDataCallback (this);
            b.setErrorCallback (this);

            auto r = b.openStream (stream_);
            if (r != oboe::Result::OK)
            {
                std::string err = std::string ("Oboe openStream failed: ") + oboe::convertToText (r);
                LOGE ("%s", err.c_str());
                return err;
            }

            const auto actualSR    = stream_->getSampleRate();
            const auto framesBurst = stream_->getFramesPerBurst();
            LOGI ("Oboe stream opened: SR=%d, framesPerBurst=%d", actualSR, framesBurst);

            // Re-prepare with the actual sample rate (still keep maxBlock).
            processor_->setPlayConfigDetails (
                processor_->getTotalNumInputChannels(),
                processor_->getTotalNumOutputChannels(),
                (double) actualSR, maxBlock_);
            processor_->prepareToPlay ((double) actualSR, maxBlock_);

            r = stream_->requestStart();
            if (r != oboe::Result::OK)
            {
                std::string err = std::string ("Oboe requestStart failed: ") + oboe::convertToText (r);
                LOGE ("%s", err.c_str());
                stream_->close();
                stream_.reset();
                return err;
            }

            LOGI ("Audio stream started.");
            return {};
        }
        catch (const std::exception& e)
        {
            if (stream_) { stream_->close(); stream_.reset(); }
            return std::string ("startAudio threw: ") + e.what();
        }
        catch (...)
        {
            if (stream_) { stream_->close(); stream_.reset(); }
            return "startAudio threw unknown exception";
        }
    }

    void stopAudio()
    {
        std::lock_guard<std::mutex> lock (mutex_);
        if (stream_)
        {
            stream_->requestStop();
            stream_->close();
            stream_.reset();
            LOGI ("Audio stream stopped.");
        }
    }

    void destroy()
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
        LOGI ("Engine destroyed.");
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
        auto err = g_engine.create();
        return env->NewStringUTF (err.c_str());
    }
    catch (const std::exception& e)
    {
        writeCrashLog ("Engine create threw std::exception", e.what());
        return env->NewStringUTF (e.what());
    }
    catch (...)
    {
        writeCrashLog ("Engine create threw unknown exception", "");
        return env->NewStringUTF ("unknown exception");
    }
}

JNIEXPORT jstring JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStartAudio
    (JNIEnv* env, jobject)
{
    try
    {
        auto err = g_engine.startAudio();
        return env->NewStringUTF (err.c_str());
    }
    catch (const std::exception& e) { return env->NewStringUTF (e.what()); }
    catch (...)                     { return env->NewStringUTF ("unknown"); }
}

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStopAudio (JNIEnv*, jobject)
{
    g_engine.stopAudio();
}

JNIEXPORT void JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStop (JNIEnv*, jobject)
{
    g_engine.destroy();
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
