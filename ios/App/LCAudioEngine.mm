#import "LCAudioEngine.h"

#import <AVFoundation/AVFoundation.h>

#include "LogicalChaosEngine.h"

#include <algorithm>
#include <cmath>

using logicalchaos::LogicalChaosEngine;

namespace
{
    static float midiNoteToHz (int note)
    {
        return 440.0f * std::pow (2.0f, (static_cast<float> (note) - 69.0f) / 12.0f);
    }

    static float clampFloat (float v, float lo, float hi)
    {
        return std::max (lo, std::min (hi, v));
    }
}

@implementation LCAudioEngine
{
    LogicalChaosEngine* patternEngine_;
    AVAudioEngine* audioEngine_;
    AVAudioSourceNode* sourceNode_;

    double sampleRate_;
    double phase_;
    float currentFreq_;
    float targetFreq_;
    float envLevel_;
    float lp_;
    float bp_;

    BOOL playing_;
    int currentStep_;
    int samplesUntilStep_;

    float tempo_;
    float masterVolume_;
    float synthCutoff_;
    float synthRes_;
    float synthEnvMod_;
    float synthDecay_;
    int synthWave_;
}

- (instancetype)initWithEngine:(LogicalChaosEngine*)engine
{
    self = [super init];
    if (self)
    {
        patternEngine_ = engine;
        sampleRate_ = 48000.0;
        phase_ = 0.0;
        currentFreq_ = 100.0f;
        targetFreq_ = 100.0f;
        envLevel_ = 0.0f;
        lp_ = 0.0f;
        bp_ = 0.0f;
        playing_ = YES;
        currentStep_ = 0;
        samplesUntilStep_ = 0;
        tempo_ = 120.0f;
        masterVolume_ = 0.80f;
        synthCutoff_ = 800.0f;
        synthRes_ = 0.6f;
        synthEnvMod_ = 2000.0f;
        synthDecay_ = 0.3f;
        synthWave_ = 0;
    }
    return self;
}

- (BOOL)startAndReturnError:(NSError**)error
{
    if (audioEngine_ != nil && audioEngine_.isRunning)
        return YES;

    AVAudioSession* session = AVAudioSession.sharedInstance;
    if (! [session setCategory:AVAudioSessionCategoryPlayback error:error])
        return NO;
    if (! [session setActive:YES error:error])
        return NO;

    audioEngine_ = [[AVAudioEngine alloc] init];

    AVAudioFormat* outputFormat = [audioEngine_.outputNode inputFormatForBus:0];
    sampleRate_ = outputFormat.sampleRate > 0.0 ? outputFormat.sampleRate : 48000.0;

    __unsafe_unretained LCAudioEngine* owner = self;
    sourceNode_ = [[AVAudioSourceNode alloc] initWithRenderBlock:^OSStatus(BOOL* isSilence,
                                                                          const AudioTimeStamp* timestamp,
                                                                          AVAudioFrameCount frameCount,
                                                                          AudioBufferList* outputData)
    {
        (void) timestamp;

        if (owner == nil)
        {
            if (isSilence != nullptr)
                *isSilence = YES;
            return noErr;
        }

        [owner renderFrames:frameCount outputData:outputData];

        if (isSilence != nullptr)
            *isSilence = NO;

        return noErr;
    }];

    [audioEngine_ attachNode:sourceNode_];
    [audioEngine_ connect:sourceNode_ to:audioEngine_.mainMixerNode format:outputFormat];

    [self resetPlayback];

    return [audioEngine_ startAndReturnError:error];
}

- (void)stop
{
    [audioEngine_ stop];
    audioEngine_ = nil;
    sourceNode_ = nil;
}

- (BOOL)isRunning
{
    return audioEngine_ != nil && audioEngine_.isRunning;
}

- (void)resetPlayback
{
    currentStep_ = 0;
    samplesUntilStep_ = 0;
    phase_ = 0.0;
    currentFreq_ = 100.0f;
    targetFreq_ = 100.0f;
    envLevel_ = 0.0f;
    lp_ = 0.0f;
    bp_ = 0.0f;
}

- (void)renderFrames:(AVAudioFrameCount)frameCount outputData:(AudioBufferList*)outputData
{
    const UInt32 bufferCount = outputData->mNumberBuffers;

    for (AVAudioFrameCount i = 0; i < frameCount; ++i)
    {
        if (playing_)
        {
            if (samplesUntilStep_ <= 0)
                [self advanceStep];

            --samplesUntilStep_;
        }

        currentFreq_ += (targetFreq_ - currentFreq_) * 0.001f;

        if (envLevel_ > 0.0f)
        {
            const float safeDecay = std::max (0.001f, synthDecay_);
            envLevel_ -= 1.0f / (safeDecay * static_cast<float> (sampleRate_));
            if (envLevel_ < 0.0f)
                envLevel_ = 0.0f;
        }

        phase_ += currentFreq_ / sampleRate_;
        if (phase_ >= 1.0)
            phase_ -= 1.0;

        const float osc = [self renderOscillator];
        const float filtered = [self renderFilter:osc];
        const float sample = filtered * envLevel_ * 0.50f * masterVolume_;

        for (UInt32 b = 0; b < bufferCount; ++b)
        {
            float* channel = static_cast<float*> (outputData->mBuffers[b].mData);
            channel[i] = sample;
        }
    }
}

- (void)advanceStep
{
    if (patternEngine_ == nullptr)
        return;

    const int len = std::max (1, std::min (LogicalChaosEngine::kMaxSteps, patternEngine_->getPatternLength()));

    if (currentStep_ < 0 || currentStep_ >= len)
        currentStep_ = 0;

    const auto& step = patternEngine_->getStep (currentStep_);
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

    const double quarterSamples = sampleRate_ * 60.0 / std::max (1.0f, tempo_);
    const int stepSamples = static_cast<int> (quarterSamples * 0.25);
    samplesUntilStep_ = std::max (1, stepSamples);

    currentStep_ = (currentStep_ + 1) % len;
}

- (float)renderOscillator
{
    switch (synthWave_)
    {
        case 1: return phase_ < 0.5 ? 1.0f : -1.0f;
        case 2: return static_cast<float> (1.0 - 4.0 * std::abs (phase_ - 0.5));
        case 3: return std::sin (static_cast<float> (phase_) * 6.28318530718f);
        default: return static_cast<float> (phase_ * 2.0 - 1.0);
    }
}

- (float)renderFilter:(float)osc
{
    float modCutoff = synthCutoff_ + synthEnvMod_ * envLevel_;
    modCutoff = clampFloat (modCutoff, 20.0f, 10000.0f);

    float f = modCutoff * 2.0f * 3.14159265359f / static_cast<float> (sampleRate_);
    f = clampFloat (f, 0.0f, 0.99f);

    float q = 1.0f - synthRes_;
    q = clampFloat (q, 0.01f, 0.99f);

    const float hp = osc - lp_ - (q * bp_);
    bp_ += f * hp;
    lp_ += f * bp_;
    return lp_;
}

@end
