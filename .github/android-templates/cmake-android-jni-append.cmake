
# ---------------------------------------------------------------------------
# Android JNI bridge (appended by build-android.yml)
# Attaches android_bridge.cpp to the Standalone sub-target (the one that
# actually becomes lib<APP>_Standalone.so loaded by MainActivity).
# JUCE_TARGET is injected via `sed` in the workflow before this file is
# appended to the generated CMakeLists.txt.
# ---------------------------------------------------------------------------
if(ANDROID)
    set(_JNI_CANDIDATES "@JUCE_TARGET@_Standalone" "@JUCE_TARGET@")
    set(_JNI_ATTACHED FALSE)
    foreach(_cand IN LISTS _JNI_CANDIDATES)
        if(TARGET ${_cand})
            target_sources(${_cand} PRIVATE
                "${CMAKE_CURRENT_SOURCE_DIR}/android_bridge.cpp")
            set_property(TARGET ${_cand} PROPERTY INTERPROCEDURAL_OPTIMIZATION FALSE)
            target_link_options(${_cand} PRIVATE -fuse-ld=lld)
            target_link_libraries(${_cand} PRIVATE log android)
            message(STATUS "Android JNI bridge attached to target: ${_cand}")
            set(_JNI_ATTACHED TRUE)
        endif()
    endforeach()
    if(NOT _JNI_ATTACHED)
        message(FATAL_ERROR "android_bridge.cpp could not be attached to any target")
    endif()
endif()
