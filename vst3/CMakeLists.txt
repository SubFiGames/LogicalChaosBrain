cmake_minimum_required(VERSION 3.22)

project(LogicalChaosFallbackVST3 VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT DEFINED VST3_SDK_ROOT)
    message(FATAL_ERROR "VST3_SDK_ROOT must point to a cloned Steinberg VST3 SDK checkout")
endif()

get_filename_component(VST3_SDK_ROOT "${VST3_SDK_ROOT}" ABSOLUTE)
message(STATUS "Using VST3 SDK: ${VST3_SDK_ROOT}")

set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "Disable VSTGUI for the first lightweight fallback build" FORCE)
set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "Do not build SDK examples" FORCE)
set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "Do not build SDK hosting examples" FORCE)
set(SMTG_RUN_VST_VALIDATOR OFF CACHE BOOL "Do not run validator during this early build" FORCE)

add_subdirectory(${VST3_SDK_ROOT} ${CMAKE_BINARY_DIR}/vst3sdk)

smtg_add_vst3plugin(LogicalChaosFallbackVST3
    LogicalChaosVST3.cpp
    ../src/LogicalChaosEngine.cpp
)

target_include_directories(LogicalChaosFallbackVST3 PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../src
    ${VST3_SDK_ROOT}
)

target_compile_definitions(LogicalChaosFallbackVST3 PRIVATE
    LOGICAL_CHAOS_VERSION="0.1.0"
)

if(MSVC)
    target_compile_options(LogicalChaosFallbackVST3 PRIVATE /W4)
else()
    target_compile_options(LogicalChaosFallbackVST3 PRIVATE -Wall -Wextra -Wpedantic)
endif()
