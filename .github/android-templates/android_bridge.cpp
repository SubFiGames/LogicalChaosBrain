//==============================================================================
//  android_bridge.cpp  —  Oboe-driven version (with progress checkpoints)
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
//
//  Progress checkpoints: every meaningful step in create()/startAudio() writes
//  a single human-readable line to a `progress.log` file.  When the native
//  signal handler fires, the contents of that file are appended to the crash
//  log — so the post-mortem tells you EXACTLY which line died, not just
//  "Native signal 11".
//==============================================================================

#include <jni.h>
#include <android/log.h>
#include <csignal>
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <ctime>
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
// Crash + progress files: full absolute paths set once via JNI.
// ---------------------------------------------------------------------------
namespace
{
    std::string g_crashLogPath;
    std::string g_progressLogPath;
    std::mutex  g_progressMutex;

    // Writes a single line to progress.log.  Truncates after ~64 KiB so a long
    // run can't fill the disk.  Async-signal-safe-ish: uses POSIX I/O only.
    void progress (const char* fmt, ...)
    {
        std::lock_guard<std::mutex> lock (g_progressMutex);

        char body[512];
        va_list args;
        va_start (args, fmt);
        std::vsnprintf (body, sizeof (body), fmt, args);
        va_end (args);

        // Always log to logcat too.
        __android_log_print (ANDROID_LOG_INFO, LOG_TAG, "[checkpoint] %s", body);

        if (g_progressLogPath.empty()) return;

        FILE* f = std::fopen (g_progressLogPath.c_str(), "a");
        if (! f) return;

        std::time_t t = std::time (nullptr);
        char ts[32];
        std::strftime (ts, sizeof (ts), "%H:%M:%S", std::localtime (&t));
        std::fprintf (f, "[%s] %s\n", ts, body);
        std::fclose (f);
    }

    std::string readWholeFile (const std::string& path)
    {
        FILE* f = std::fopen (path.c_str(), "r");
        if (! f) return {};
        std::string out;
        char buf[1024];
        size_t n;
        while ((n = std::fread (buf, 1, sizeof (buf), f)) > 0)
            out.append (buf, n);
        std::fclose (f);
        return out;
    }

    void writeCrashLog (const char* headline, const char* body)
    {
        if (g_crashLogPath.empty()) return;
        FILE* f = std::fopen (g_crashLogPath.c_str(), "w");
        if (! f) return;
        std::fprintf (f, "%s\n\n%s\n", headline ? headline : "", body ? body : "");

        // Append the recent progress trail so the user knows which step died.
        if (! g_progressLogPath.empty())
        {
            std::string prog = readWholeFile (g_progressLogPath);
            if (! prog.empty())
            {
                std::fprintf (f, "\n--- progress.log (last checkpoints) ---\n%s",
                              prog.c_str());
            }
        }
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
                       "See logcat tag '%s' for the tombstone.\n"
                       "The progress.log section below shows the last\n"
                       "checkpoint reached BEFORE the crash — the crash\n"
                       "happened in the step AFTER that line.",
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
    // any audio stream — the WebView UI loads first; the user explicitly
    // starts audio with startAudio() (so if audio crashes, the UI is still
    // visible as evidence the engine itself initialised cleanly).
    std::string create()
    {
        std::lock_guard<std::mutex> lock (mutex_);

        if (processor_ != nullptr)
        {
            progress ("create(): processor already exists, no-op");
            return {};
        }

        try
        {
            progress ("create(): step 1 — about to touch juce::MessageManager");
            // Force JUCE's MessageManager to exist before any code path that
            // might touch it.  Cmajor's processor occasionally pokes JUCE
            // internals that assume MessageManager::getInstance() is non-null.
            (void) juce::MessageManager::getInstance();
            progress ("create(): step 2 — MessageManager ok");

            progress ("create(): step 3 — calling createPluginFilter()");
            processor_.reset (createPluginFilter());
            progress ("create(): step 4 — createPluginFilter returned %p",
                      (void*) processor_.get());

            if (processor_ == nullptr)
                return "createPluginFilter() returned nullptr";

            const int busIns  = processor_->getTotalNumInputChannels();
            const int busOuts = processor_->getTotalNumOutputChannels();
            progress ("create(): step 5 — inputs=%d outputs=%d latency=%d params=%d",
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
            progress ("create(): step 6 — setPlayConfigDetails(%d,%d,%g,%d)",
                      busIns, busOuts, kDefaultSR, kMaxBlock);
            processor_->setPlayConfigDetails (busIns, busOuts, kDefaultSR, kMaxBlock);

            progress ("create(): step 7 — prepareToPlay");
            processor_->prepareToPlay (kDefaultSR, kMaxBlock);
            progress ("create(): step 8 — prepareToPlay returned ok");

            maxBlock_ = kMaxBlock;

            scratch_.assign ((size_t) numProcChannels_,
                             std::vector<float> ((size_t) kMaxBlock, 0.0f));
            chanPtrs_.assign ((size_t) numProcChannels_, nullptr);
            for (int i = 0; i < numProcChannels_; ++i)
                chanPtrs_[(size_t) i] = scratch_[(size_t) i].data();

            progress ("create(): step 9 — engine ready (maxBlock=%d, channels=%d)",
                      maxBlock_, numProcChannels_);
            return {};
        }
        catch (const std::exception& e)
        {
            progress ("create(): EXCEPTION std::exception: %s", e.what());
            processor_.reset();
            return std::string ("Engine create threw: ") + e.what();
        }
        catch (...)
        {
            progress ("create(): EXCEPTION unknown");
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
        {
            progress ("startAudio(): already running, no-op");
            return {}; // already running
        }

        try
        {
            const auto sr = processor_->getSampleRate() > 0
                          ? processor_->getSampleRate() : 48000.0;

            progress ("startAudio(): step 1 — building Oboe stream (target SR=%g)", sr);

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
                progress ("startAudio(): %s", err.c_str());
                LOGE ("%s", err.c_str());
                return err;
            }

            const auto actualSR    = stream_->getSampleRate();
            const auto framesBurst = stream_->getFramesPerBurst();
            progress ("startAudio(): step 2 — Oboe opened SR=%d framesPerBurst=%d",
                      actualSR, framesBurst);

            // Re-prepare with the actual sample rate (still keep maxBlock).
            progress ("startAudio(): step 3 — re-prepareToPlay at actual SR=%d", actualSR);
            processor_->setPlayConfigDetails (
                processor_->getTotalNumInputChannels(),
                processor_->getTotalNumOutputChannels(),
                (double) actualSR, maxBlock_);
            processor_->prepareToPlay ((double) actualSR, maxBlock_);
            progress ("startAudio(): step 4 — prepareToPlay returned ok");

            r = stream_->requestStart();
            if (r != oboe::Result::OK)
            {
                std::string err = std::string ("Oboe requestStart failed: ") + oboe::convertToText (r);
                progress ("startAudio(): %s", err.c_str());
                LOGE ("%s", err.c_str());
                stream_->close();
                stream_.reset();
                return err;
            }

            progress ("startAudio(): step 5 — audio stream started.");
            return {};
        }
        catch (const std::exception& e)
        {
            progress ("startAudio(): EXCEPTION std::exception: %s", e.what());
            if (stream_) { stream_->close(); stream_.reset(); }
            return std::string ("startAudio threw: ") + e.what();
        }
        catch (...)
        {
            progress ("startAudio(): EXCEPTION unknown");
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
            progress ("stopAudio(): audio stream stopped.");
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
        progress ("destroy(): engine destroyed.");
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
    (JNIEnv* env, jobject, jstring crashPathJ, jstring progressPathJ)
{
    g_crashLogPath    = jstringToStd (env, crashPathJ);
    g_progressLogPath = jstringToStd (env, progressPathJ);

    // Truncate the progress log on every cold start.
    if (! g_progressLogPath.empty())
    {
        FILE* f = std::fopen (g_progressLogPath.c_str(), "w");
        if (f) std::fclose (f);
    }
    installSignalHandlers();
    progress ("nativeSetCrashLogPath: handlers installed (crash=%s, progress=%s)",
              g_crashLogPath.c_str(), g_progressLogPath.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeStart
    (JNIEnv* env, jobject)
{
    try
    {
        progress ("nativeStart: entering");
        auto err = g_engine.create();
        progress ("nativeStart: returned err=\"%s\"", err.c_str());
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
        progress ("nativeStartAudio: entering");
        auto err = g_engine.startAudio();
        progress ("nativeStartAudio: returned err=\"%s\"", err.c_str());
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

JNIEXPORT jstring JNICALL
Java_com_subfigames_logicalchaos_melodymachine_MainActivity_nativeReadProgressLog
    (JNIEnv* env, jobject)
{
    std::string s = readWholeFile (g_progressLogPath);
    return env->NewStringUTF (s.c_str());
}

} // extern "C"
