cmake_minimum_required(VERSION 3.20)
project(OdyGradeCore VERSION 0.5.0 LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Static CRT: Premiere/AE 2024 load their own msvcp140 14.23, older than our toolset; the
# dynamic CRT then crashed std::mutex (VS 17.10+ constexpr mutex) inside Premiere renders.
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
find_program(NODE_EXECUTABLE node REQUIRED)
find_package(Threads REQUIRED)
set(GENERATED_LOOKS "${CMAKE_CURRENT_BINARY_DIR}/generated/looks.hpp")
set(GENERATED_PROFILES "${CMAKE_CURRENT_BINARY_DIR}/generated/profiles.hpp")
add_custom_command(OUTPUT "${GENERATED_LOOKS}" "${GENERATED_PROFILES}"
  COMMAND "${NODE_EXECUTABLE}" "${CMAKE_CURRENT_SOURCE_DIR}/../tools/generate-native.cjs" "${GENERATED_LOOKS}"
  DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/../tools/generate-native.cjs" "${CMAKE_CURRENT_SOURCE_DIR}/../src/engine.js" "${CMAKE_CURRENT_SOURCE_DIR}/../src/color-management.js"
  VERBATIM)
add_library(odygrade-core STATIC src/core.cpp src/recipe.cpp "${GENERATED_LOOKS}" "${GENERATED_PROFILES}")
target_include_directories(odygrade-core PUBLIC include PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/generated")
if(MSVC)
  target_compile_options(odygrade-core PRIVATE /W4 /WX /fp:precise)
else()
  target_compile_options(odygrade-core PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()
add_executable(odygrade-render src/main.cpp)
target_link_libraries(odygrade-render PRIVATE odygrade-core)
add_executable(odygrade-core-tests tests/core_tests.cpp)
target_link_libraries(odygrade-core-tests PRIVATE odygrade-core Threads::Threads)
enable_testing()
add_test(NAME core-contracts COMMAND odygrade-core-tests)

if(ODYGRADE_ADOBE_SDK)
 add_subdirectory(adobe)
endif()
