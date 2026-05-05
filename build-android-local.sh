#!/bin/bash

# Logical Chaos Brain - Android Build Script
# This script builds the Android APK locally

set -e

echo "======================================"
echo "Logical Chaos Android Build Script"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PATCH_FILE="LogicalChaos.cmajorpatch"
APP_NAME="LogicalChaosMelodyMachine"
BUILD_DIR="build"

# Function to print colored messages
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
print_info "Checking prerequisites..."

if ! command -v java &> /dev/null; then
    print_error "Java JDK not found. Please install Java 17."
    exit 1
fi

if ! command -v cmake &> /dev/null; then
    print_error "CMake not found. Please install CMake 3.22 or later."
    exit 1
fi

print_info "✓ Prerequisites check passed"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    CMAJ_ARCH="x64"
elif [ "$ARCH" = "aarch64" ]; then
    CMAJ_ARCH="arm64"
else
    print_warn "Unknown architecture $ARCH, defaulting to x64"
    CMAJ_ARCH="x64"
fi

print_info "Detected architecture: $ARCH (using Cmajor $CMAJ_ARCH)"

# Download Cmajor CLI if not present
if [ ! -f "cmajor-cli/linux/$CMAJ_ARCH/cmaj" ]; then
    print_info "Downloading Cmajor CLI..."
    wget -q https://github.com/cmajor-lang/cmajor/releases/latest/download/cmajor.linux.${CMAJ_ARCH}.zip -O cmajor.zip
    unzip -q cmajor.zip -d cmajor-cli
    rm cmajor.zip
    chmod +x cmajor-cli/linux/$CMAJ_ARCH/cmaj
    print_info "✓ Cmajor CLI downloaded"
else
    print_info "✓ Cmajor CLI already installed"
fi

CMAJ_BIN="./cmajor-cli/linux/$CMAJ_ARCH/cmaj"

# Clone JUCE if not present
if [ ! -d "JUCE" ]; then
    print_info "Cloning JUCE framework..."
    git clone --depth=1 https://github.com/juce-framework/JUCE.git
    print_info "✓ JUCE cloned"
else
    print_info "✓ JUCE already present"
fi

# Fix Main.cmajor if needed
if grep -q "std::math::pow" Main.cmajor; then
    print_info "Fixing std::math::pow issue..."
    sed -i 's/std::math::pow/pow/g' Main.cmajor
    print_info "✓ Fixed std::math::pow"
fi

# Generate JUCE project
print_info "Generating JUCE project from Cmajor patch..."
$CMAJ_BIN generate \
    --target=juce \
    --jucePath=./JUCE \
    $PATCH_FILE \
    --output=GeneratedApp 2>&1 | tee cmaj-generate.log

if [ ! -d "GeneratedApp" ]; then
    print_error "JUCE project generation failed!"
    cat cmaj-generate.log
    exit 1
fi

print_info "✓ JUCE project generated"

# Create Android project structure
print_info "Creating Android project structure..."
mkdir -p AndroidProject/app/src/main/{cpp,java,res}
mkdir -p AndroidProject/app/src/main/java/com/subfigames/logicalchaos

# Copy generated JUCE code
cp -r GeneratedApp/* AndroidProject/app/src/main/cpp/

print_info "✓ Android project structure created"

# Generate build.gradle files
print_info "Generating Gradle configuration..."

# Root build.gradle
cat > AndroidProject/build.gradle << 'EOFROOT'
buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.1.0'
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}
EOFROOT

# App build.gradle
cat > AndroidProject/app/build.gradle << 'EOFAPP'
plugins {
    id 'com.android.application'
}

android {
    namespace 'com.subfigames.logicalchaos.melodymachine'
    compileSdk 33
    ndkVersion "25.1.8937393"

    defaultConfig {
        applicationId "com.subfigames.logicalchaos.melodymachine"
        minSdk 24
        targetSdk 33
        versionCode 1
        versionName "4.0.0"

        externalNativeBuild {
            cmake {
                cppFlags "-std=c++17 -frtti -fexceptions"
                arguments "-DANDROID_STL=c++_shared",
                          "-DANDROID_PLATFORM=android-24",
                          "-DJUCE_PATH=${projectDir}/../../../../../../JUCE"
            }
        }

        ndk {
            abiFilters 'arm64-v8a', 'armeabi-v7a'
        }
    }

    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }

    externalNativeBuild {
        cmake {
            path "src/main/cpp/CMakeLists.txt"
            version "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
EOFAPP

# settings.gradle
cat > AndroidProject/settings.gradle << 'EOFSETTINGS'
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "LogicalChaosMelodyMachine"
include ':app'
EOFSETTINGS

# gradle.properties
cat > AndroidProject/gradle.properties << 'EOFPROPS'
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
android.enableJetifier=true
EOFPROPS

print_info "✓ Gradle configuration generated"

# Install Gradle wrapper if not present
if [ ! -f "AndroidProject/gradlew" ]; then
    print_info "Installing Gradle wrapper..."
    cd AndroidProject
    if command -v gradle &> /dev/null; then
        gradle wrapper --gradle-version 8.2
    else
        print_warn "Gradle not found. Please install Gradle or use Android Studio."
        cd ..
        exit 1
    fi
    chmod +x gradlew
    cd ..
    print_info "✓ Gradle wrapper installed"
fi

# Build APK
print_info "Building Android APK (this may take several minutes)..."
cd AndroidProject

./gradlew assembleDebug --stacktrace 2>&1 | tee ../gradle-build.log

# Check if APK was built
if [ -f "app/build/outputs/apk/debug/app-debug.apk" ]; then
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    APK_SIZE=$(du -h "$APK_PATH" | cut -f1)
    print_info "✓ APK built successfully!"
    echo ""
    echo "======================================"
    echo -e "${GREEN}Build Complete!${NC}"
    echo "======================================"
    echo ""
    echo "APK Location: AndroidProject/$APK_PATH"
    echo "APK Size: $APK_SIZE"
    echo ""
    echo "To install on device:"
    echo "  adb install AndroidProject/$APK_PATH"
    echo ""
else
    print_error "APK build failed. Check gradle-build.log for details."
    cd ..
    exit 1
fi

cd ..
