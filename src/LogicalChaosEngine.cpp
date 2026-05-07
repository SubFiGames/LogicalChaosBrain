#include "LogicalChaosEngine.h"

#include <cmath>
#include <cstdio>

namespace logicalchaos
{
    LogicalChaosEngine::LogicalChaosEngine()
    {
        resetToDefaults();
    }

    int LogicalChaosEngine::clampInt (int v, int lo, int hi)
    {
        return (v < lo ? lo : (v > hi ? hi : v));
    }

    float LogicalChaosEngine::clampFloat (float v, float lo, float hi)
    {
        return (v < lo ? lo : (v > hi ? hi : v));
    }

    void LogicalChaosEngine::resetToDefaults()
    {
        for (int i = 0; i < kMaxSteps; ++i)
        {
            steps_[(size_t) i].note = 48;
            steps_[(size_t) i].active = (i < 16 ? 1 : 0);
            steps_[(size_t) i].glide = 0;
            steps_[(size_t) i].randomise = 0;
        }

        patternLength_ = 16;
        pendingUiEvents_.clear();
    }

    const LogicalChaosEngine::Step& LogicalChaosEngine::getStep (int index) const
    {
        return steps_[(size_t) clampInt (index, 0, kMaxSteps - 1)];
    }

    void LogicalChaosEngine::setParameter (const std::string& id, float value)
    {
        if (id == "tempo")           { tempo_ = clampFloat (value, 50.0f, 220.0f); return; }
        if (id == "chaos")           { chaos_ = clampFloat (value, 0.0f, 100.0f); return; }
        if (id == "mutation")        { mutation_ = clampFloat (value, 0.0f, 100.0f); return; }
        if (id == "density")         { density_ = clampFloat (value, 0.0f, 100.0f); return; }
        if (id == "gate")            { gate_ = clampFloat (value, 5.0f, 100.0f); return; }
        if (id == "patternLength")   { patternLength_ = clampInt ((int) std::lround (value), 8, kMaxSteps); return; }
        if (id == "timeSigNumerator")   { timeSigNumerator_ = clampInt ((int) std::lround (value), 2, 12); return; }
        if (id == "timeSigDenominator") { timeSigDenominator_ = clampInt ((int) std::lround (value), 4, 8); return; }
        if (id == "rootNote")        { rootNote_ = clampInt ((int) std::lround (value), 36, 72); return; }
        if (id == "masterVolume")    { masterVolume_ = clampFloat (value, 0.0f, 1.0f); return; }
        if (id == "styleType")       { styleType_ = clampInt ((int) std::lround (value), 0, 9); return; }
        if (id == "scaleType")       { scaleType_ = clampInt ((int) std::lround (value), 0, 10); return; }
        if (id == "complexityType")  { complexityType_ = clampInt ((int) std::lround (value), 0, 3); return; }
        if (id == "progressionType") { progressionType_ = clampInt ((int) std::lround (value), 0, 5); return; }
        if (id == "shapeType")       { shapeType_ = clampInt ((int) std::lround (value), 0, 5); return; }
        if (id == "synthCutoff")     { synthCutoff_ = clampFloat (value, 50.0f, 5000.0f); return; }
        if (id == "synthRes")        { synthRes_ = clampFloat (value, 0.1f, 0.95f); return; }
        if (id == "synthEnvMod")     { synthEnvMod_ = clampFloat (value, 0.0f, 5000.0f); return; }
        if (id == "synthDecay")      { synthDecay_ = clampFloat (value, 0.05f, 2.0f); return; }
        if (id == "synthWave")       { synthWave_ = clampInt ((int) std::lround (value), 0, 3); return; }
    }

    void LogicalChaosEngine::triggerEvent (const std::string& id, double value)
    {
        if (value == 0.0)
            return;

        if (id == "generate")
        {
            generatePattern();
            queuePatternDump();
            return;
        }

        if (id == "mutate")
        {
            mutatePattern();
            queuePatternDump();
            return;
        }

        if (id == "clearPattern")
        {
            clearPattern();
            queuePatternDump();
            return;
        }

        if (id == "requestPatternDump")
        {
            queuePatternDump();
            return;
        }

        if (id == "setStepPacked")
        {
            setStepPacked ((int) std::llround (value));
            return;
        }
    }

    void LogicalChaosEngine::setStepPacked (int packed)
    {
        const int step = (packed >> 20) & 255;
        if (step < 0 || step >= kMaxSteps)
            return;

        auto& s = steps_[(size_t) step];
        s.note      = (packed >> 13) & 127;
        s.active    = (packed >>  2) &   1;
        s.glide     = (packed >>  1) &   1;
        s.randomise =  packed        &   1;
        queueUiEvent (packStepMessage (2, step));
    }

    int LogicalChaosEngine::packStepMessage (int kind, int step) const
    {
        const int i = clampInt (step, 0, kMaxSteps - 1);
        const auto& s = steps_[(size_t) i];
        return (kind << 28)
             | ((i           & 255) << 20)
             | ((s.note      & 127) << 13)
             | ((s.active    &   1) <<  2)
             | ((s.glide     &   1) <<  1)
             |  (s.randomise &   1);
    }

    void LogicalChaosEngine::queueUiEvent (int packed)
    {
        if (pendingUiEvents_.size() < 4096)
            pendingUiEvents_.push_back (packed);
    }

    void LogicalChaosEngine::queuePatternDump()
    {
        for (int i = 0; i < kMaxSteps; ++i)
            queueUiEvent (packStepMessage (2, i));
    }

    std::string LogicalChaosEngine::popQueuedUiEvents()
    {
        if (pendingUiEvents_.empty())
            return {};

        std::string out;
        out.reserve (pendingUiEvents_.size() * 12);
        for (size_t i = 0; i < pendingUiEvents_.size(); ++i)
        {
            if (i != 0) out.push_back ('\n');
            out += std::to_string (pendingUiEvents_[i]);
        }
        pendingUiEvents_.clear();
        return out;
    }

    int LogicalChaosEngine::nextSeed()
    {
        seed_ = seed_ * 1103515245u + 12345u;
        return (int) ((seed_ >> 8) & 0x7fffffffu);
    }

    bool LogicalChaosEngine::chance (int percent)
    {
        percent = clampInt (percent, 0, 100);
        return (nextSeed() % 100) < percent;
    }

    int LogicalChaosEngine::scaleSize (int scale) const
    {
        switch (scale)
        {
            case 7:  return 5;
            case 8:  return 5;
            case 10: return 12;
            default: return 7;
        }
    }

    int LogicalChaosEngine::scaleSemitone (int scale, int degree) const
    {
        static const int major[7]         = { 0, 2, 4, 5, 7, 9, 11 };
        static const int naturalMinor[7]  = { 0, 2, 3, 5, 7, 8, 10 };
        static const int harmonicMinor[7] = { 0, 2, 3, 5, 7, 8, 11 };
        static const int dorian[7]        = { 0, 2, 3, 5, 7, 9, 10 };
        static const int phrygian[7]      = { 0, 1, 3, 5, 7, 8, 10 };
        static const int lydian[7]        = { 0, 2, 4, 6, 7, 9, 11 };
        static const int mixolydian[7]    = { 0, 2, 4, 5, 7, 9, 10 };
        static const int minorPent[5]     = { 0, 3, 5, 7, 10 };
        static const int majorPent[5]     = { 0, 2, 4, 7, 9 };
        static const int blues[7]         = { 0, 3, 5, 6, 7, 10, 12 };
        static const int chromatic[12]    = { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 };

        const int size = scaleSize (scale);
        int octave = 0;
        while (degree < 0) { degree += size; --octave; }
        while (degree >= size) { degree -= size; ++octave; }

        const int* table = major;
        switch (scale)
        {
            case 1:  table = naturalMinor;  break;
            case 2:  table = harmonicMinor; break;
            case 3:  table = dorian;        break;
            case 4:  table = phrygian;      break;
            case 5:  table = lydian;        break;
            case 6:  table = mixolydian;    break;
            case 7:  table = minorPent;     break;
            case 8:  table = majorPent;     break;
            case 9:  table = blues;         break;
            case 10: table = chromatic;     break;
            default: table = major;         break;
        }

        return table[degree] + octave * 12;
    }

    int LogicalChaosEngine::pickAutoScale()
    {
        switch (styleType_)
        {
            case 1:  return chance (45) ? 2 : 0;
            case 2:  return chance (65) ? 0 : 1;
            case 3:  return chance (50) ? 5 : 8;
            case 4:  return chance (70) ? 1 : 3;
            case 5:  return chance (60) ? 1 : 4;
            case 6:  return chance (60) ? 3 : 6;
            case 7:  return chance (70) ? 7 : 9;
            case 8:  return chance (60) ? 2 : 1;
            case 9:  return chance (50) ? 4 : 10;
            default: return scaleType_;
        }
    }

    int LogicalChaosEngine::pickAutoProgression()
    {
        if (progressionType_ != 0)
            return progressionType_;

        switch (styleType_)
        {
            case 1:  return chance (50) ? 2 : 4;
            case 2:  return 1;
            case 3:  return chance (50) ? 2 : 3;
            case 4:  return 3;
            case 5:  return chance (50) ? 3 : 4;
            case 6:  return chance (50) ? 5 : 1;
            case 7:  return chance (50) ? 3 : 4;
            case 8:  return chance (50) ? 4 : 3;
            case 9:  return chance (50) ? 5 : 3;
            default: return chance (50) ? 1 : 2;
        }
    }

    int LogicalChaosEngine::progressionRoot (int progression, int phrase) const
    {
        phrase = clampInt (phrase, 0, 3);
        static const int pop[4]       = { 0, 4, 5, 3 };
        static const int classical[4] = { 0, 3, 4, 0 };
        static const int minorEpic[4] = { 0, 5, 2, 6 };
        static const int dark[4]      = { 0, 3, 4, 0 };
        static const int jazzish[4]   = { 1, 4, 0, 5 };

        switch (progression)
        {
            case 1:  return pop[phrase];
            case 2:  return classical[phrase];
            case 3:  return minorEpic[phrase];
            case 4:  return dark[phrase];
            case 5:  return jazzish[phrase];
            default: return pop[phrase];
        }
    }

    int LogicalChaosEngine::shapeOffset (int step, int len) const
    {
        const int effectiveShape = (shapeType_ == 0)
                               ? ((styleType_ == 3) ? 4 :
                                  (styleType_ == 8) ? 3 :
                                  (styleType_ == 1) ? 3 :
                                  (styleType_ == 9) ? 5 : 0)
                               : shapeType_;

        const float pos = (len <= 1) ? 0.0f : (float) step / (float) (len - 1);
        switch (effectiveShape)
        {
            case 1:  return (int) std::lround (pos * 4.0f);
            case 2:  return (int) std::lround ((1.0f - pos) * 4.0f);
            case 3:  return (int) std::lround ((1.0f - std::fabs (pos * 2.0f - 1.0f)) * 5.0f);
            case 4:  return (step % 8 < 4) ? 2 : -1;
            case 5:  return (step % 8 < 4) ? 0 : 2;
            default: return 0;
        }
    }

    void LogicalChaosEngine::generatePattern()
    {
        const int len = kMaxSteps;
        const int chosenScale = (scaleType_ == 0 && styleType_ != 0) ? pickAutoScale() : scaleType_;
        const int chosenProgression = pickAutoProgression();
        const int complexity = clampInt (complexityType_, 0, 3);

        int lastDegree = 0;
        for (int i = 0; i < kMaxSteps; ++i)
        {
            const int phrase = clampInt ((i * 4) / len, 0, 3);
            const int beatInPhrase = i % 4;
            const bool strongBeat = (beatInPhrase == 0 || beatInPhrase == 2);
            const int chordRoot = progressionRoot (chosenProgression, phrase);

            int baseDensity = (int) std::lround (density_);
            if (complexity == 0) baseDensity -= 8;
            if (complexity == 2) baseDensity += 6;
            if (complexity == 3) baseDensity += 12;
            baseDensity = clampInt (baseDensity, 20, 100);

            auto& step = steps_[(size_t) i];
            step.active = chance (baseDensity) ? 1 : 0;
            if (i == 0 || i == len - 1 || strongBeat)
                step.active = 1;

            int degree = chordRoot;
            if (strongBeat)
            {
                const int chordChoice = nextSeed() % 3;
                degree = chordRoot + (chordChoice == 0 ? 0 : (chordChoice == 1 ? 2 : 4));
            }
            else if (complexity == 0)
            {
                degree = lastDegree + ((nextSeed() % 3) - 1);
            }
            else if (complexity == 1)
            {
                degree = chordRoot + ((nextSeed() % 5) - 2) + ((beatInPhrase == 1) ? 1 : 0);
            }
            else if (complexity == 2)
            {
                degree = lastDegree + ((nextSeed() % 7) - 3) + ((i % 8 >= 4) ? 1 : 0);
            }
            else
            {
                degree = chordRoot + ((nextSeed() % 11) - 5);
            }

            degree += shapeOffset (i, len);

            const int chaosAmount = clampInt ((int) std::lround (chaos_), 0, 100);
            if (chance (chaosAmount / 5))
                degree += (nextSeed() % (3 + complexity * 2)) - (1 + complexity);
            if (chance ((int) std::lround (mutation_) / 8))
                degree += (nextSeed() % 3) - 1;

            int octave = 0;
            if (styleType_ == 3) octave = 1;
            if (styleType_ == 4) octave = chance (45) ? 1 : 0;
            if (styleType_ == 7) octave = chance (35) ? -1 : 0;
            if (styleType_ == 8) octave = chance (40) ? 1 : 0;
            if (complexity == 3 && chance (25)) octave += chance (50) ? 1 : -1;

            int note = rootNote_ + scaleSemitone (chosenScale, degree) + octave * 12;
            while (note < 36) note += 12;
            while (note > 84) note -= 12;
            step.note = clampInt (note, 0, 127);
            lastDegree = degree;

            int glideChance = 0;
            if (complexity == 1) glideChance = chaosAmount / 10;
            if (complexity == 2) glideChance = chaosAmount / 6;
            if (complexity == 3) glideChance = chaosAmount / 4;
            if (styleType_ == 4) glideChance += 10;
            if (styleType_ == 7) glideChance += 8;
            if (styleType_ == 1) glideChance -= 8;
            step.glide = chance (clampInt (glideChance, 0, 65)) ? 1 : 0;

            int randomChance = 4 + complexity * 5;
            if (styleType_ == 9) randomChance += 10;
            if (styleType_ == 1) randomChance -= 4;
            step.randomise = chance (clampInt (randomChance, 0, 40)) ? 1 : 0;
        }
    }

    void LogicalChaosEngine::mutatePattern()
    {
        const int amount = clampInt ((int) std::lround (mutation_), 0, 100);
        const int noteChance   = clampInt (6 + amount / 2, 6, 58);
        const int activeChance = clampInt (2 + amount / 9, 2, 18);
        const int glideChance  = clampInt (4 + amount / 5, 4, 28);
        const int randomChance = clampInt (3 + amount / 6, 3, 22);

        for (int i = 0; i < kMaxSteps; ++i)
        {
            auto& step = steps_[(size_t) i];
            if (i == 0)
                step.active = 1;
            else if (chance (activeChance))
                step.active = step.active ? 0 : 1;

            if (chance (noteChance))
            {
                int interval = 0;
                if (amount < 25)
                {
                    static const int smallMoves[4] = { -2, -1, 1, 2 };
                    interval = smallMoves[nextSeed() % 4];
                }
                else if (amount < 60)
                {
                    static const int mediumMoves[8] = { -5, -3, -2, -1, 1, 2, 3, 5 };
                    interval = mediumMoves[nextSeed() % 8];
                }
                else
                {
                    static const int largeMoves[12] = { -12, -7, -5, -3, -2, -1, 1, 2, 3, 5, 7, 12 };
                    interval = largeMoves[nextSeed() % 12];
                }

                int nextNote = step.note + interval;
                while (nextNote < 36) nextNote += 12;
                while (nextNote > 84) nextNote -= 12;
                step.note = clampInt (nextNote, 0, 127);
            }

            if (chance (glideChance))
                step.glide = step.glide ? 0 : 1;
            if (chance (randomChance))
                step.randomise = step.randomise ? 0 : 1;
        }
    }

    void LogicalChaosEngine::clearPattern()
    {
        for (auto& step : steps_)
        {
            step.note = 48;
            step.active = 0;
            step.glide = 0;
            step.randomise = 0;
        }
    }
}
