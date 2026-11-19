#include "odygrade/core.hpp"
#include <fstream>
#include <filesystem>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <vector>
#ifdef _WIN32
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <fcntl.h>
#include <io.h>
#endif
namespace {
int dimension(const char* text) {
    std::size_t count=0;const auto x=std::stoll(text,&count);
    if(count!=std::string(text).size()||x<1||x>40000000)throw std::invalid_argument("Invalid frame dimension");
    return static_cast<int>(x);
}
}
int run(int argc,char** argv) {
    try {
        if(argc<6||argc>8)throw std::invalid_argument(
            "Usage: odygrade-render grade.odyn width height input-format output-format [first-frame-index] [pixel-aspect]\n"
            "Streams tightly packed full frames on stdin/stdout. Formats: rgba8 bgra8 argb8 rgba16 argb16 rgba16ae argb16ae rgba32f bgra32f argb32f");
        std::ifstream file(std::filesystem::u8path(argv[1]),std::ios::binary);if(!file)throw std::invalid_argument("Cannot open native recipe");
        // Bound file reading before allocating from an untrusted recipe size.
        std::string text;char ch;while(file.get(ch)){if(text.size()>=65536)throw std::invalid_argument("Native recipe exceeds 64 KB");text+=ch;}
        const auto recipe=odygrade::read_recipe(text);const auto w=dimension(argv[2]),h=dimension(argv[3]);
        if(static_cast<std::uint64_t>(w)*h>40000000)throw std::invalid_argument("Frame exceeds 40 megapixels");
        const auto inf=odygrade::parse_pixel_format(argv[4]),outf=odygrade::parse_pixel_format(argv[5]);
        std::uint64_t frame_index=0;
        if(argc>=7){std::size_t used=0;std::string value=argv[6];if(value.empty()||value[0]=='-')throw std::invalid_argument("Invalid frame index");
            frame_index=std::stoull(value,&used);if(used!=value.size())throw std::invalid_argument("Invalid frame index");}
        double pixel_aspect=1;
        if(argc==8){std::size_t used=0;pixel_aspect=std::stod(argv[7],&used);
            if(used!=std::string(argv[7]).size())throw std::invalid_argument("Invalid pixel aspect ratio");}
        const auto in_row=static_cast<std::ptrdiff_t>(w*odygrade::pixel_bytes(inf));
        const auto out_row=static_cast<std::ptrdiff_t>(w*odygrade::pixel_bytes(outf));
        std::vector<std::uint8_t> input(static_cast<std::size_t>(in_row)*h),output(static_cast<std::size_t>(out_row)*h);
#ifdef _WIN32
        _setmode(_fileno(stdin),_O_BINARY);_setmode(_fileno(stdout),_O_BINARY);
#endif
        std::ios::sync_with_stdio(false);
        for(;;) {
            std::cin.read(reinterpret_cast<char*>(input.data()),static_cast<std::streamsize>(input.size()));
            const auto n=std::cin.gcount();if(n==0&&std::cin.eof())break;
            if(n!=static_cast<std::streamsize>(input.size()))throw std::invalid_argument("Truncated input frame");
            odygrade::render({input.data(),w,h,in_row,inf,odygrade::AlphaMode::Straight},
                {output.data(),w,h,out_row,outf,odygrade::AlphaMode::Straight},recipe,frame_index++,pixel_aspect);
            std::cout.write(reinterpret_cast<const char*>(output.data()),static_cast<std::streamsize>(output.size()));
            if(!std::cout)throw std::runtime_error("Output stream failed");
        }
        return 0;
    }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
#ifdef _WIN32
int wmain(int argc,wchar_t** wide) {
    std::vector<std::string> values;values.reserve(argc);
    for(int i=0;i<argc;++i) {
        const auto length=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,wide[i],-1,nullptr,0,nullptr,nullptr);
        if(!length){std::cerr<<"Invalid Unicode argument\n";return 1;}
        std::string value(static_cast<std::size_t>(length),'\0');
        WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,wide[i],-1,value.data(),length,nullptr,nullptr);
        value.pop_back();values.push_back(std::move(value));
    }
    std::vector<char*> args;for(auto& value:values)args.push_back(value.data());
    return run(argc,args.data());
}
#else
int main(int argc,char** argv) { return run(argc,argv); }
#endif
