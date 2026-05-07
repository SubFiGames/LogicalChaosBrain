#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace logicalchaos
{
    class LogicalChaosEngine
    {
    public:
        static constexpr int kMaxSteps = 64;

        struct Step
        {
            int note = 48;
            int active = 0;
            int glide = 0;
            int randomise = 0;
        };

        LogicalChaosEngine();

        void resetToDefaults();

        void setParameter (const std::string& id, float value);
        void triggerEvent (const std::string& id, double value);

        void setStepPacked (int packed);
        int  packStepMessage (int kind, int step) const;

        void queuePatternDump();
        std::string popQueuedUiEvents();

        const Step& getStep (int index) const;
        int getPatternLength() const { return patternLength_; }

    private:
        static int clampInt (int v, int lo, int hi);
        static float clampFloat (float v, float lo, float hi);

        int nextSeed();
        bool chance (int percent);

        int scaleSize (int scale) const;
        int scaleSemitone (int scale, int degree) const;
        int pickAutoScale();
        int pickAutoProgression();
        int progressionRoot (int progression, int phrase) const;
        int shapeOffset (int step, int len) const;

        void generatePattern();
        void mutatePattern();
        void clearPattern();
        void queueUiEvent (int packed);

        std::array<Step, kMaxSteps> steps_ {};
        std::vector<int> pendingUiEvents_;

        float tempo_ = 120.0f;
        float chaos_ = 35.0f;
        float mutation_ = 20.0f;
        float density_ = 78.0f;
        float gate_ = 72.0f;
        float masterVolume_ = 0.80f;

        int patternLength_ = 16;
        int timeSigNumerator_ = 4;
        int timeSigDenominator_ = 4;
        int rootNote_ = 48;

        int styleType_ = 0;
        int scaleType_ = 0;
        int complexityType_ = 1;
        int progressionType_ = 0;
        int shapeType_ = 0;

        float synthCutoff_ = 800.0f;
        float synthRes_ = 0.6f;
        float synthEnvMod_ = 2000.0f;
        float synthDecay_ = 0.3f;
        int synthWave_ = 0;

        std::uint32_t seed_ = 1234567u;
    };
}
