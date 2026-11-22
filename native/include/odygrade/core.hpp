#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace odygrade {
using Color = std::array<double, 3>;
struct Zone { double a{}, b{}, sa{}, sb{}; };
struct Distribution {
    std::array<double, 9> quantiles{};
    std::array<Zone, 3> zones{};
    std::array<double, 2> chroma{};  // OKLab chroma p90, p99 (snapshot v3)
    bool has_chroma{};
};
struct Correction { double exposure{}, temperature{}, tint{}; };
struct Model {
    bool enabled{};
    Distribution source{}, reference{};
    Correction correction{};
    std::string input_profile{"srgb"};
};
struct Settings {
    double strength{1}, exposure{}, temperature{}, tint{}, contrast{1}, saturation{1};
    double preserve_skin{0.65}, fade{}, shoulder{};
    std::string look{"neutral"};
    std::string input_profile{"srgb"};
    std::string stock{"none"};  // film stock emulation key (src/engine.js STOCKS)
    double stock_amount{1};
};
struct Film {
    double grain{}, bloom{}, halation{}, vignette{}, bleach{}, ratio{};
    // Mirrors src/film.js: gauge 0 = classic pixel grain, else 8/16/35/65 mm; format 0 = off,
    // 1..6 = Regular 8, Super 8, 16 mm, Super 16, 35 mm, IMAX. perfs is 0 or 1.
    double gauge{}, iso{200}, format{}, weave{}, flicker{}, dust{}, perfs{};
};
// trim: host exposure (stops), temperature, tint (-1..1) applied to the graded colour before film,
// exactly like a second neutral pass but in the same sweep. Not part of the recipe file.
struct Recipe { Model model{}; Settings settings{}; Film film{}; std::array<double,3> trim{}; };

enum class PixelFormat { RGBA8, BGRA8, ARGB8, RGBA16, ARGB16, RGBA16AE, ARGB16AE,
                         RGBA32F, BGRA32F, ARGB32F };
enum class AlphaMode { Straight, Premultiplied };
struct ConstFrame {
    const void* data{};
    int width{}, height{};
    // Data points to the logical first row, even when row_bytes is negative.
    std::ptrdiff_t row_bytes{};
    PixelFormat format{PixelFormat::RGBA8};
    AlphaMode alpha{AlphaMode::Straight};
};
struct Frame {
    void* data{};
    int width{}, height{};
    std::ptrdiff_t row_bytes{};
    PixelFormat format{PixelFormat::RGBA8};
    AlphaMode alpha{AlphaMode::Straight};
};

std::size_t pixel_bytes(PixelFormat format);
PixelFormat parse_pixel_format(const std::string& name);
void validate(const Recipe& recipe);
Color transform(Color color, const Recipe& recipe);
// Full-frame rendering only. Spatial effects require the whole frame; tiled host
// adapters must supply full-frame pixels rather than independently render tiles.
// No host state, filesystem access, static mutable caches or per-frame refitting.
void render(const ConstFrame& input, const Frame& output, const Recipe& recipe,
            std::uint64_t frame_index = 0, double pixel_aspect = 1);
// Max worker threads for render() calls made from the calling thread; 0 = all cores.
// Hosts rendering several frames at once (AE Multi-Frame Rendering) split the cores.
void set_thread_limit(int threads);
// Bounded internal interchange generated from the validated JSON recipe by JS.
// This is not an Adobe effect parameter block or an Adobe plugin binary.
Recipe read_recipe(const std::string& text);
} // namespace odygrade
