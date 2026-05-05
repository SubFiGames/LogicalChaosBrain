# Logical Chaos Brain - Android Audio Plugin

A controllable random melody and step sequencer with a built-in subtractive synthesizer, built with Cmajor and JUCE for Android.

## 🎵 Features

- **Controllable Random Melody Generator** - Create evolving melodic patterns
- **16-32 Step Sequencer** - Flexible pattern lengths
- **Built-in Subtractive Synthesizer** - Saw and square waveforms with filter
- **Glide/Portamento** - Smooth note transitions
- **Real-time Parameter Control**:
  - Tempo (50-220 BPM)
  - Chaos (randomization amount)
  - Density (note probability)
  - Gate length
  - Filter cutoff & resonance
  - Envelope modulation

- **Android Compatibility**:
  - Standalone audio app
  - USB MIDI support (for external hardware)
  - Compatible with DAWs like FL Studio Mobile

## 🏗️ Project Structure

```
LogicalChaosBrain/
├── LogicalChaos.cmajorpatch   # Cmajor patch definition
├── Main.cmajor                 # Audio processing code
├── view.js                     # UI definition
├── .github/workflows/
│   ├── build-android.yml       # Android build workflow (✅ FIXED)
│   ├── build-mac-vst3.yml      # macOS VST3 build
│   └── build-windows-vst3.yml  # Windows VST3 build
└── README.md                   # This file
```

## 🔧 Building for Android

### Prerequisites

- **Android Studio** (2023.1 or later)
- **Android SDK** (API 33 or later)
- **Android NDK** (25.1.8937393 or later)
- **CMake** (3.22.1 or later)
- **Java JDK** 17
- **Cmajor CLI** ([Download](https://github.com/cmajor-lang/cmajor/releases))
- **JUCE Framework** ([Download](https://github.com/juce-framework/JUCE))

### Method 1: GitHub Actions (Automated)

The Android build workflow has been fixed and optimized. Simply push to the `main` branch:

```bash
git push origin main
```

The workflow will automatically:
1. ✅ Download correct Cmajor CLI for the build platform
2. ✅ Fix the `std::math::pow` compilation error  
3. ✅ Generate JUCE project from Cmajor patch
4. ✅ Create Android Studio project structure
5. ✅ Build APK with Gradle
6. ✅ Upload APK as artifact

**Download the APK:**
1. Go to the Actions tab in your GitHub repository
2. Click on the latest successful workflow run
3. Download the `LogicalChaosMelodyMachine-Android-APK` artifact

### Method 2: Local Build

#### Step 1: Install Dependencies

```bash
# Install Java JDK 17
sudo apt-get install openjdk-17-jdk

# Install build tools
sudo apt-get install cmake ninja-build pkg-config unzip wget git

# Download Cmajor CLI
wget https://github.com/cmajor-lang/cmajor/releases/latest/download/cmajor.linux.x64.zip
unzip cmajor.linux.x64.zip -d cmajor-cli
chmod +x cmajor-cli/linux/x64/cmaj

# Clone JUCE
git clone --depth=1 https://github.com/juce-framework/JUCE.git
```

#### Step 2: Generate JUCE Project

```bash
# Fix the pow function issue first
sed -i 's/std::math::pow/pow/g' Main.cmajor

# Generate JUCE project
./cmajor-cli/linux/x64/cmaj generate \
  --target=juce \
  --jucePath=./JUCE \
  LogicalChaos.cmajorpatch \
  --output=GeneratedApp
```

#### Step 3: Set Up Android Project

The workflow creates a complete Android Studio project. For manual setup:

1. Open Android Studio
2. Create a new "Native C++" project
3. Copy the generated JUCE code to `app/src/main/cpp/`
4. Configure `build.gradle` with JUCE dependencies
5. Add Android manifest permissions:
   ```xml
   <uses-permission android:name="android.permission.RECORD_AUDIO"/>
   <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
   <uses-feature android:name="android.hardware.usb.host"/>
   ```

#### Step 4: Build APK

```bash
cd AndroidProject
./gradlew assembleDebug

# Output: app/build/outputs/apk/debug/app-debug.apk
```

## 🐛 Fixed Issues

### ✅ GitHub Actions Workflow Errors (build-android.yml)

**Previous Issues:**
- ❌ Duplicate workflow steps (lines 40-100)
- ❌ Malformed YAML structure with orphaned commands
- ❌ Wrong architecture Cmajor CLI (x64 instead of arm64)
- ❌ Compilation error: `std::math::pow` not found
- ❌ Missing Android Gradle configuration

**Fixes Applied:**
1. ✅ Removed all duplicate steps
2. ✅ Fixed YAML structure and step hierarchy
3. ✅ Auto-detect and download correct Cmajor CLI architecture
4. ✅ Automatic fix for `std::math::pow` → `pow`
5. ✅ Added complete Android Studio + Gradle setup
6. ✅ Proper NDK and SDK configuration
7. ✅ Build logs uploaded for debugging
8. ✅ Fallback error handling

## 📱 Using the Android App

### Standalone Mode
1. Install the APK on your Android device
2. Launch "Logical Chaos Melody Machine"
3. Adjust parameters with on-screen controls
4. Tap "Generate" to create new patterns
5. Tap "Play" to hear the sequencer

### With External MIDI Hardware
1. Connect MIDI hardware via USB-C (OTG adapter if needed)
2. Launch the app
3. The app will receive MIDI input from your hardware
4. Control the synth with external MIDI controllers

### In FL Studio Mobile
1. Install FL Studio Mobile on your Android device
2. Open FL Studio Mobile
3. Add "Logical Chaos Melody Machine" as an audio plugin
4. Control it within your FL Studio project

## 🎛️ Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| **Tempo** | 50-220 BPM | Sequencer speed |
| **Chaos** | 0-100% | Randomization amount (glide probability) |
| **Density** | 0-100% | Note probability (how many steps are active) |
| **Gate** | 5-100% | Note length |
| **Steps** | 8-32 | Pattern length |
| **Root Note** | C2-C5 | Base note for melodies |
| **Cutoff** | 50-5000 Hz | Low-pass filter cutoff frequency |
| **Resonance** | 0.1-0.95 | Filter resonance/Q |
| **Env Mod** | 0-5000 Hz | Filter envelope modulation amount |
| **Decay** | 0.05-2.0 s | Envelope decay time |
| **Waveform** | Saw/Square | Oscillator waveform |

## 🔊 Audio Signal Path

```
Step Sequencer → Note Generator → Oscillator (Saw/Square) 
→ State Variable Filter (LP) → Envelope → Stereo Output
```

## 🧪 Testing

The workflow automatically runs on:
- Push to `main` branch
- Pull requests
- Manual workflow dispatch

To test manually:
```bash
# In GitHub Actions tab, click "Run workflow"
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test the build locally or with GitHub Actions
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project uses:
- **Cmajor** - Check [Cmajor license](https://cmajor.dev)
- **JUCE** - GPL/Commercial dual license

## 🐛 Known Issues

- ⚠️ Android audio latency may vary by device
- ⚠️ Some Android devices may require USB debugging enabled for MIDI
- ⚠️ First build may take 10-15 minutes (NDK download + compilation)

## 📞 Support

For issues related to:
- **Cmajor**: https://github.com/cmajor-lang/cmajor/issues
- **JUCE Android**: https://forum.juce.com
- **This project**: Open an issue in this repository

## 🌟 Credits

- **Developer**: SubFi Games
- **Cmajor**: Cmajor Software Ltd.
- **JUCE Framework**: JUCE
- **Audio DSP**: Original implementation in Cmajor

---

**Version**: 4.0.0  
**Last Updated**: May 2026  
**Build Status**: ✅ Passing
