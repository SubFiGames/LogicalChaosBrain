cmake_minimum_required(VERSION 3.22)

project(LogicalChaosIOS LANGUAGES C CXX OBJC OBJCXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_OBJCXX_STANDARD 17)
set(CMAKE_OBJCXX_STANDARD_REQUIRED ON)

set(APP_SOURCES
    App/main.mm
    App/LCAppDelegate.mm
    App/LCViewController.mm
    ../src/LogicalChaosEngine.cpp
)

add_executable(LogicalChaosIOS MACOSX_BUNDLE ${APP_SOURCES})

set_target_properties(LogicalChaosIOS PROPERTIES
    MACOSX_BUNDLE_INFO_PLIST ${CMAKE_CURRENT_SOURCE_DIR}/App/Info.plist
    XCODE_ATTRIBUTE_PRODUCT_BUNDLE_IDENTIFIER "com.subfigames.logicalchaos.ios"
    XCODE_ATTRIBUTE_PRODUCT_NAME "Logical Chaos"
    XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1,2"
    XCODE_ATTRIBUTE_IPHONEOS_DEPLOYMENT_TARGET "15.0"
    XCODE_ATTRIBUTE_ASSETCATALOG_COMPILER_APPICON_NAME ""
    XCODE_ATTRIBUTE_CODE_SIGNING_ALLOWED "NO"
    XCODE_ATTRIBUTE_CODE_SIGNING_REQUIRED "NO"
    XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY ""
)

target_include_directories(LogicalChaosIOS PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/App
    ${CMAKE_CURRENT_SOURCE_DIR}/../src
)

target_link_libraries(LogicalChaosIOS PRIVATE
    "-framework UIKit"
    "-framework Foundation"
    "-framework QuartzCore"
)

if(CMAKE_CXX_COMPILER_ID MATCHES "Clang")
    target_compile_options(LogicalChaosIOS PRIVATE
        -Wall
        -Wextra
        -Wpedantic
    )
endif()
