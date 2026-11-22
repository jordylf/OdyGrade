#include "odygrade/core.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <future>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <vector>

using namespace odygrade;
namespace {
void require(bool ok,const char* message) { if(!ok)throw std::runtime_error(message); }
template<class F> void rejects(F fn,const char* message) { bool failed=false;try{fn();}catch(const std::exception&){failed=true;}require(failed,message); }
void close(double a,double b,double tolerance,const char* message) { require(std::abs(a-b)<=tolerance,message); }
void test_formats_and_padding() {
    const std::array<PixelFormat,10> formats{PixelFormat::RGBA8,PixelFormat::BGRA8,PixelFormat::ARGB8,
        PixelFormat::RGBA16,PixelFormat::ARGB16,PixelFormat::RGBA16AE,PixelFormat::ARGB16AE,
        PixelFormat::RGBA32F,PixelFormat::BGRA32F,PixelFormat::ARGB32F};
    std::array<float,16> input{.2f,.4f,.6f,.8f,.8f,.6f,.4f,1.f,.4f,.2f,.1f,.5f,.1f,.3f,.7f,0.f};
    Recipe recipe;
    for(auto format:formats) {
        const auto row=static_cast<std::ptrdiff_t>(2*pixel_bytes(format)+17);
        std::vector<std::uint8_t> encoded(static_cast<std::size_t>(row)*2,0xCD);
        render({input.data(),2,2,32,PixelFormat::RGBA32F,AlphaMode::Straight},
            {encoded.data(),2,2,row,format,AlphaMode::Straight},recipe);
        for(int y=0;y<2;++y)for(std::size_t i=2*pixel_bytes(format);i<static_cast<std::size_t>(row);++i)
            require(encoded[static_cast<std::size_t>(y)*row+i]==0xCD,"Row padding overwritten");
        std::array<float,16> decoded{};
        render({encoded.data(),2,2,row,format,AlphaMode::Straight},
            {decoded.data(),2,2,32,PixelFormat::RGBA32F,AlphaMode::Straight},recipe);
        for(std::size_t i=0;i<input.size();++i)close(decoded[i],input[i],.0041,"Pixel format roundtrip drift");
    }
}
void test_precision_and_alpha() {
    Recipe recipe;
    const std::array<std::uint16_t,4> white_ae{32768,32768,32768,32768};
    std::array<float,4> white{};
    render({white_ae.data(),1,1,8,PixelFormat::RGBA16AE,AlphaMode::Straight},
        {white.data(),1,1,16,PixelFormat::RGBA32F,AlphaMode::Straight},recipe);
    for(auto v:white)close(v,1,1e-6,"AE white must be 32768, not 65535");
    const std::array<float,8> original{.2f,.3f,.4f,.5f,.9f,.4f,.2f,0.f};std::array<float,8> out{};
    render({original.data(),2,1,32,PixelFormat::RGBA32F,AlphaMode::Premultiplied},
        {out.data(),2,1,32,PixelFormat::RGBA32F,AlphaMode::Premultiplied},recipe);
    for(std::size_t i=0;i<4;++i)close(out[i],original[i],1e-6,"Premultiplied identity drift");
    for(std::size_t i=4;i<8;++i)close(out[i],0,1e-6,"Zero-alpha color must be finite zero");
    const std::array<float,8> fine{.5001f,.2f,.1f,1,.5002f,.2f,.1f,1};
    render({fine.data(),2,1,32,PixelFormat::RGBA32F,AlphaMode::Straight},
        {out.data(),2,1,32,PixelFormat::RGBA32F,AlphaMode::Straight},recipe);
    require(out[4]>out[0]+.00009,"Float path was quantized to 8 bits");
}
void test_negative_rows_and_in_place() {
    Recipe recipe;std::array<std::uint8_t,16> pixels{20,40,60,255,80,100,120,255,140,160,180,255,200,210,220,255};
    const auto original=pixels;
    render({pixels.data()+8,2,2,-8,PixelFormat::RGBA8,AlphaMode::Straight},
        {pixels.data()+8,2,2,-8,PixelFormat::RGBA8,AlphaMode::Straight},recipe);
    require(pixels==original,"Negative-stride in-place rendering failed");
}
void test_pixel_aspect_matte() {
    Recipe recipe;recipe.film.ratio=2.39;
    std::array<float,8*8*4> input{},square{},wide{};
    for(std::size_t i=0;i<input.size();i+=4){input[i]=input[i+1]=input[i+2]=.5f;input[i+3]=1;}
    const ConstFrame source{input.data(),8,8,8*16,PixelFormat::RGBA32F,AlphaMode::Straight};
    render(source,{square.data(),8,8,8*16,PixelFormat::RGBA32F,AlphaMode::Straight},recipe,0,1);
    render(source,{wide.data(),8,8,8*16,PixelFormat::RGBA32F,AlphaMode::Straight},recipe,0,2.39);
    require(square[0]==0&&wide[0]>.49,"Matte ignored pixel aspect ratio");
    rejects([&]{render(source,{wide.data(),8,8,8*16,PixelFormat::RGBA32F,AlphaMode::Straight},recipe,0,0);},"Invalid pixel aspect accepted");
}
void test_validation_is_before_writes() {
    Recipe recipe;std::array<std::uint8_t,4> in{20,40,60,255},out{1,2,3,4};
    rejects([&]{render({in.data(),1,1,3,PixelFormat::RGBA8,AlphaMode::Straight},
        {out.data(),1,1,4,PixelFormat::RGBA8,AlphaMode::Straight},recipe);},"Invalid stride accepted");
    require(out==std::array<std::uint8_t,4>{1,2,3,4},"Invalid render wrote output");
    std::array<float,4> bad{std::numeric_limits<float>::quiet_NaN(),0,0,1};
    rejects([&]{render({bad.data(),1,1,16,PixelFormat::RGBA32F,AlphaMode::Straight},
        {out.data(),1,1,4,PixelFormat::RGBA8,AlphaMode::Straight},recipe);},"NaN accepted");
    require(out==std::array<std::uint8_t,4>{1,2,3,4},"NaN input wrote output");
    recipe.settings.look="not-a-look";rejects([&]{validate(recipe);},"Unknown look accepted");
    rejects([]{parse_pixel_format("rgb-not-rgba");},"Unknown pixel format accepted");
    rejects([]{read_recipe("ODYGRADE_NATIVE 3\n");},"Unknown recipe version accepted");
    rejects([]{read_recipe(std::string(65537,'x'));},"Unbounded recipe accepted");
}
void test_temporal_and_transparent_glow() {
    Recipe recipe;recipe.film.grain=.4;recipe.film.bloom=.7;recipe.film.halation=.5;
    std::vector<float> input(16*12*4,.6f),a(input.size()),b(input.size()),other(input.size());
    for(std::size_t i=3;i<input.size();i+=4)input[i]=1;
    const auto draw=[&](std::vector<float>& output,std::uint64_t frame){render(
        {input.data(),16,12,16*16,PixelFormat::RGBA32F,AlphaMode::Straight},
        {output.data(),16,12,16*16,PixelFormat::RGBA32F,AlphaMode::Straight},recipe,frame);};
    draw(a,32);draw(other,33);draw(b,32);
    require(a==b,"Frame depends on render order");require(a!=other,"Temporal grain does not change");
    recipe.film.grain=0;
    for(std::size_t i=0;i<input.size();i+=4){input[i]=input[i+1]=input[i+2]=0;input[i+3]=1;}
    input[0]=input[1]=input[2]=1;input[3]=0;draw(a,0);
    for(std::size_t i=4;i<a.size();i+=4)require(a[i]<.000001,"Invisible pixel bled glow into neighbors");
    recipe.film.grain=.2;
    auto one=std::async(std::launch::async,[&]{std::vector<float> x(input.size());draw(x,71);return x;});
    draw(b,71);require(one.get()==b,"Concurrent rendering has shared mutable state");
    {// Thread limit (MFR core split) must not change pixels; frame tall enough to use many threads.
     const int w=96,h=400;Recipe film;film.film.grain=.4;film.film.bloom=.6;film.film.halation=.5;film.film.vignette=.3;
     std::vector<float> in(w*h*4),all(in.size()),single(in.size());for(std::size_t i=0;i<in.size();++i)in[i]=(i%4==3)?1.f:float((i*37)%251)/251.f;
     const auto go=[&](std::vector<float>& o){render({in.data(),w,h,w*16,PixelFormat::RGBA32F,AlphaMode::Straight},{o.data(),w,h,w*16,PixelFormat::RGBA32F,AlphaMode::Straight},film,9);};
     go(all);set_thread_limit(1);go(single);set_thread_limit(0);require(all==single,"Thread limit changes output");}
}
}
void test_trim_matches_two_passes() {// trims in one sweep == old host path: grade, then neutral trim pass + film
    const int w=40,h=30;std::vector<float> in(w*h*4),stage(in.size()),two(in.size()),one(in.size());
    for(std::size_t i=0;i<in.size();++i)in[i]=(i%4==3)?1.f:float((i*53)%241)/241.f;
    Recipe base;base.settings.look="amber";base.settings.contrast=1.2;base.settings.saturation=1.3;
    Recipe fin;fin.settings.exposure=.7;fin.settings.temperature=-.4;fin.settings.tint=.25;
    fin.film.grain=.3;fin.film.bloom=.5;fin.film.vignette=.4;
    const auto F=[&](std::vector<float>& v){return Frame{v.data(),w,h,w*16,PixelFormat::RGBA32F,AlphaMode::Straight};};
    const ConstFrame src{in.data(),w,h,w*16,PixelFormat::RGBA32F,AlphaMode::Straight};
    render(src,F(stage),base);render({stage.data(),w,h,w*16,PixelFormat::RGBA32F,AlphaMode::Straight},F(two),fin,5);
    Recipe folded=base;folded.film=fin.film;folded.trim={.7,-.4,.25};render(src,F(one),folded,5);
    double worst=0;for(std::size_t i=0;i<one.size();++i)worst=std::max(worst,double(std::abs(one[i]-two[i])));
    require(worst<1e-5,"Folded trims differ from two passes");require(one!=stage,"Trim had no effect");
    const auto c=transform({.3,.5,.2},folded),d=transform(transform({.3,.5,.2},base),fin);
    for(int k=0;k<3;++k)close(c[k],d[k],1e-12,"transform ignores trim");
    folded.trim={5,0,0};rejects([&]{validate(folded);},"Out-of-range trim accepted");
}
int main() {
    try {
        test_formats_and_padding();std::cout<<"PASS 10 pixel layouts and padding\n";
        test_precision_and_alpha();std::cout<<"PASS high precision and alpha\n";
        test_negative_rows_and_in_place();std::cout<<"PASS negative rows and in-place buffers\n";
        test_pixel_aspect_matte();std::cout<<"PASS pixel-aspect-aware matte\n";
        test_validation_is_before_writes();std::cout<<"PASS failure-before-write contracts\n";
        test_temporal_and_transparent_glow();std::cout<<"PASS temporal determinism, transparent glow and concurrency\n";
        test_trim_matches_two_passes();std::cout<<"PASS trims folded into one pass\n";
        return 0;
    }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';return 1;}
}
