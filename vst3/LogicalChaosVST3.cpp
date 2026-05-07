#include "LogicalChaosEngine.h"

#include "pluginterfaces/base/funknown.h"
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivstcomponent.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivstevents.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"
#include "public.sdk/source/main/pluginfactory.h"
#include "public.sdk/source/vst/vstaudioeffect.h"
#include "public.sdk/source/vst/vsteditcontroller.h"

#include <array>
#include <cmath>
#include <cstring>

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace
{
    // Fixed IDs are important: hosts use them to recognise plugin + controller.
    static const FUID kProcessorUID (0x4C6F6769, 0x63684368, 0x616F7350, 0x726F6331); // LogicChaosProc1
    static const FUID kControllerUID (0x4C6F6769, 0x63684368, 0x616F7343, 0x74726C31); // LogicChaosCtrl1

    enum ParamIDs : ParamID
    {
        kParamTempo = 100,
        kParamChaos,
        kParamMutation,
        kParamDensity,
        kParamGate,
        kParamPatternLength,
        kParamRootNote,
        kParamMasterVolume,
        kParamStyleType,
        kParamScaleType,
        kParamComplexityType,
        kParamProgressionType,
        kParamShapeType,
        kParamSynthWave,
        kParamSynthCutoff,
        kParamSynthRes,
        kParamSynthEnvMod,
        kParamSynthDecay,
        kParamGenerate,
        kParamMutate,
        kParamClear
    };

    double fromNormalised (double n, double lo, double hi)
    {
        if (n < 0.0) n = 0.0;
        if (n > 1.0) n = 1.0;
        return lo + (hi - lo) * n;
    }

    int fromNormalisedInt (double n, int lo, int hi)
    {
        return static_cast<int> (std::lround (fromNormalised (n, static_cast<double> (lo), static_cast<double> (hi))));
    }

    float midiNoteToHz (int note)
    {
        return 440.0f * std::pow (2.0f, (static_cast<float> (note) - 69.0f) / 12.0f);
    }

    void addRangeParam (ParameterContainer& params, const TChar* title, ParamID id, double defaultNormalised)
    {
        params.addParameter (title, nullptr, 0, defaultNormalised, ParameterInfo::kCanAutomate, id);
    }
}

class LogicalChaosProcessor final : public AudioEffect
{
public:
    LogicalChaosProcessor()
    {
        setControllerClass (kControllerUID);
        engine_.queuePatternDump();
    }

    static FUnknown* createInstance (void*)
    {
        return static_cast<IAudioProcessor*> (new LogicalChaosProcessor());
    }

    tresult PLUGIN_API initialize (FUnknown* context) override
    {
        auto result = AudioEffect::initialize (context);
        if (result != kResultOk)
            return result;

        addAudioOutput (STR16 ("Stereo Out"), SpeakerArr::kStereo);
        return kResultOk;
    }

    tresult PLUGIN_API setBusArrangements (SpeakerArrangement* inputs, int32 numIns,
                                           SpeakerArrangement* outputs, int32 numOuts) override
    {
        (void) inputs;
        (void) numIns;
        if (numOuts == 1 && outputs[0] == SpeakerArr::kStereo)
            return AudioEffect::setBusArrangements (inputs, numIns, outputs, numOuts);
        return kResultFalse;
    }

    tresult PLUGIN_API setupProcessing (ProcessSetup& setup) override
    {
        sampleRate_ = setup.sampleRate > 0.0 ? setup.sampleRate : 48000.0;
        return AudioEffect::setupProcessing (setup);
    }

    tresult PLUGIN_API process (ProcessData& data) override
    {
        applyParameterChanges (data.inputParameterChanges);

        if (data.numOutputs <= 0 || data.outputs[0].numChannels <= 0 || data.numSamples <= 0)
            return kResultOk;

        auto** out = data.outputs[0].channelBuffers32;
        const int channels = data.outputs[0].numChannels;

        for (int32 i = 0; i < data.numSamples; ++i)
        {
            if (playing_)
            {
                if (samplesUntilStep_ <= 0)
                    advanceStep();

                --samplesUntilStep_;
            }

            currentFreq_ += (targetFreq_ - currentFreq_) * 0.001f;

            if (envLevel_ > 0.0f)
            {
                const float safeDecay = std::fmax (0.001f, synthDecay_);
                envLevel_ -= 1.0f / (safeDecay * static_cast<float> (sampleRate_));
                if (envLevel_ < 0.0f)
                    envLevel_ = 0.0f;
            }

            phase_ += currentFreq_ / static_cast<float> (sampleRate_);
            if (phase_ >= 1.0f)
                phase_ -= 1.0f;

            const float osc = renderOscillator();
            const float filtered = renderFilter (osc);
            const float sample = filtered * envLevel_ * 0.5f * masterVolume_;

            for (int ch = 0; ch < channels; ++ch)
                out[ch][i] = sample;
        }

        return kResultOk;
    }

private:
    void applyParameterChanges (IParameterChanges* changes)
    {
        if (changes == nullptr)
            return;

        const int32 count = changes->getParameterCount();
        for (int32 i = 0; i < count; ++i)
        {
            if (auto* queue = changes->getParameterData (i))
            {
                int32 sampleOffset = 0;
                ParamValue value = 0.0;
                if (queue->getPoint (queue->getPointCount() - 1, sampleOffset, value) == kResultOk)
                    setParamNormalised (queue->getParameterId(), value);
            }
        }
    }

    void setParamNormalised (ParamID id, double value)
    {
        switch (id)
        {
            case kParamTempo:          tempo_ = static_cast<float> (fromNormalised (value, 50.0, 220.0)); engine_.setParameter ("tempo", tempo_); break;
            case kParamChaos:          engine_.setParameter ("chaos", static_cast<float> (fromNormalised (value, 0.0, 100.0))); break;
            case kParamMutation:       engine_.setParameter ("mutation", static_cast<float> (fromNormalised (value, 0.0, 100.0))); break;
            case kParamDensity:        engine_.setParameter ("density", static_cast<float> (fromNormalised (value, 0.0, 100.0))); break;
            case kParamGate:           gate_ = static_cast<float> (fromNormalised (value, 5.0, 100.0)); engine_.setParameter ("gate", gate_); break;
            case kParamPatternLength:  engine_.setParameter ("patternLength", static_cast<float> (fromNormalisedInt (value, 8, 64))); break;
            case kParamRootNote:       engine_.setParameter ("rootNote", static_cast<float> (fromNormalisedInt (value, 36, 72))); break;
            case kParamMasterVolume:   masterVolume_ = static_cast<float> (fromNormalised (value, 0.0, 1.0)); engine_.setParameter ("masterVolume", masterVolume_); break;
            case kParamStyleType:      engine_.setParameter ("styleType", static_cast<float> (fromNormalisedInt (value, 0, 9))); break;
            case kParamScaleType:      engine_.setParameter ("scaleType", static_cast<float> (fromNormalisedInt (value, 0, 10))); break;
            case kParamComplexityType: engine_.setParameter ("complexityType", static_cast<float> (fromNormalisedInt (value, 0, 3))); break;
            case kParamProgressionType:engine_.setParameter ("progressionType", static_cast<float> (fromNormalisedInt (value, 0, 5))); break;
            case kParamShapeType:      engine_.setParameter ("shapeType", static_cast<float> (fromNormalisedInt (value, 0, 5))); break;
            case kParamSynthWave:      synthWave_ = fromNormalisedInt (value, 0, 3); engine_.setParameter ("synthWave", static_cast<float> (synthWave_)); break;
            case kParamSynthCutoff:    synthCutoff_ = static_cast<float> (fromNormalised (value, 50.0, 5000.0)); engine_.setParameter ("synthCutoff", synthCutoff_); break;
            case kParamSynthRes:       synthRes_ = static_cast<float> (fromNormalised (value, 0.1, 0.95)); engine_.setParameter ("synthRes", synthRes_); break;
            case kParamSynthEnvMod:    synthEnvMod_ = static_cast<float> (fromNormalised (value, 0.0, 5000.0)); engine_.setParameter ("synthEnvMod", synthEnvMod_); break;
            case kParamSynthDecay:     synthDecay_ = static_cast<float> (fromNormalised (value, 0.05, 2.0)); engine_.setParameter ("synthDecay", synthDecay_); break;
            case kParamGenerate:       if (value > 0.5) engine_.triggerEvent ("generate", 1.0); break;
            case kParamMutate:         if (value > 0.5) engine_.triggerEvent ("mutate", 1.0); break;
            case kParamClear:          if (value > 0.5) engine_.triggerEvent ("clearPattern", 1.0); break;
            default: break;
        }
    }

    void advanceStep()
    {
        const int len = engine_.getPatternLength();
        if (currentStep_ < 0 || currentStep_ >= len)
            currentStep_ = 0;

        const auto& step = engine_.getStep (currentStep_);
        if (step.active)
        {
            targetFreq_ = midiNoteToHz (step.note);
            envLevel_ = 1.0f;
            if (! step.glide)
                currentFreq_ = targetFreq_;
        }
        else
        {
            envLevel_ = 0.0f;
        }

        const double quarter = sampleRate_ * 60.0 / std::fmax (1.0f, tempo_);
        const int stepSamples = static_cast<int> (quarter * 0.25);
        samplesUntilStep_ = stepSamples > 1 ? stepSamples : 1;

        currentStep_ = (currentStep_ + 1) % len;
    }

    float renderOscillator()
    {
        switch (synthWave_)
        {
            case 1: return phase_ < 0.5f ? 1.0f : -1.0f;
            case 2: return static_cast<float> (1.0 - 4.0 * std::fabs (phase_ - 0.5));
            case 3: return std::sin (phase_ * 6.28318530718f);
            default: return phase_ * 2.0f - 1.0f;
        }
    }

    float renderFilter (float osc)
    {
        float modCutoff = synthCutoff_ + synthEnvMod_ * envLevel_;
        if (modCutoff < 20.0f) modCutoff = 20.0f;
        if (modCutoff > 10000.0f) modCutoff = 10000.0f;

        float f = modCutoff * 2.0f * 3.14159265359f / static_cast<float> (sampleRate_);
        if (f < 0.0f) f = 0.0f;
        if (f > 0.99f) f = 0.99f;

        float q = 1.0f - synthRes_;
        if (q < 0.01f) q = 0.01f;
        if (q > 0.99f) q = 0.99f;

        const float hp = osc - lp_ - (q * bp_);
        bp_ += f * hp;
        lp_ += f * bp_;
        return lp_;
    }

    logicalchaos::LogicalChaosEngine engine_;

    double sampleRate_ = 48000.0;
    bool playing_ = true;
    int currentStep_ = 0;
    int samplesUntilStep_ = 0;

    float tempo_ = 120.0f;
    float gate_ = 72.0f;
    float masterVolume_ = 0.8f;
    float synthCutoff_ = 800.0f;
    float synthRes_ = 0.6f;
    float synthEnvMod_ = 2000.0f;
    float synthDecay_ = 0.3f;
    int synthWave_ = 0;

    float phase_ = 0.0f;
    float currentFreq_ = 100.0f;
    float targetFreq_ = 100.0f;
    float envLevel_ = 0.0f;
    float lp_ = 0.0f;
    float bp_ = 0.0f;
};

class LogicalChaosController final : public EditController
{
public:
    static FUnknown* createInstance (void*)
    {
        return static_cast<IEditController*> (new LogicalChaosController());
    }

    tresult PLUGIN_API initialize (FUnknown* context) override
    {
        auto result = EditController::initialize (context);
        if (result != kResultOk)
            return result;

        addRangeParam (parameters, STR16 ("Tempo"), kParamTempo, (120.0 - 50.0) / (220.0 - 50.0));
        addRangeParam (parameters, STR16 ("Chaos"), kParamChaos, 0.35);
        addRangeParam (parameters, STR16 ("Mutation"), kParamMutation, 0.20);
        addRangeParam (parameters, STR16 ("Density"), kParamDensity, 0.78);
        addRangeParam (parameters, STR16 ("Gate"), kParamGate, (72.0 - 5.0) / (100.0 - 5.0));
        addRangeParam (parameters, STR16 ("Pattern Length"), kParamPatternLength, (16.0 - 8.0) / (64.0 - 8.0));
        addRangeParam (parameters, STR16 ("Root Note"), kParamRootNote, (48.0 - 36.0) / (72.0 - 36.0));
        addRangeParam (parameters, STR16 ("Master Volume"), kParamMasterVolume, 0.80);
        addRangeParam (parameters, STR16 ("Style"), kParamStyleType, 0.0);
        addRangeParam (parameters, STR16 ("Scale"), kParamScaleType, 0.0);
        addRangeParam (parameters, STR16 ("Complexity"), kParamComplexityType, 1.0 / 3.0);
        addRangeParam (parameters, STR16 ("Progression"), kParamProgressionType, 0.0);
        addRangeParam (parameters, STR16 ("Shape"), kParamShapeType, 0.0);
        addRangeParam (parameters, STR16 ("Waveform"), kParamSynthWave, 0.0);
        addRangeParam (parameters, STR16 ("Cutoff"), kParamSynthCutoff, (800.0 - 50.0) / (5000.0 - 50.0));
        addRangeParam (parameters, STR16 ("Resonance"), kParamSynthRes, (0.6 - 0.1) / (0.95 - 0.1));
        addRangeParam (parameters, STR16 ("Env Mod"), kParamSynthEnvMod, 2000.0 / 5000.0);
        addRangeParam (parameters, STR16 ("Decay"), kParamSynthDecay, (0.3 - 0.05) / (2.0 - 0.05));
        addRangeParam (parameters, STR16 ("Generate"), kParamGenerate, 0.0);
        addRangeParam (parameters, STR16 ("Mutate"), kParamMutate, 0.0);
        addRangeParam (parameters, STR16 ("Clear"), kParamClear, 0.0);

        return kResultOk;
    }
};

BEGIN_FACTORY_DEF ("SubFiGames", "https://github.com/SubFiGames", "support@subfigames.com")

    DEF_CLASS2 (INLINE_UID_FROM_FUID (kProcessorUID),
                PClassInfo::kManyInstances,
                kVstAudioEffectClass,
                "Logical Chaos Fallback",
                Vst::kDistributable,
                "Instrument|Synth",
                LOGICAL_CHAOS_VERSION,
                kVstVersionString,
                LogicalChaosProcessor::createInstance)

    DEF_CLASS2 (INLINE_UID_FROM_FUID (kControllerUID),
                PClassInfo::kManyInstances,
                kVstComponentControllerClass,
                "Logical Chaos Fallback Controller",
                0,
                "",
                LOGICAL_CHAOS_VERSION,
                kVstVersionString,
                LogicalChaosController::createInstance)

END_FACTORY
