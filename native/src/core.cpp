#include "odygrade/core.hpp"
#include "looks.hpp"
#include "profiles.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <vector>

namespace odygrade {
namespace {
double clamp(double x, double lo=0, double hi=1) { return std::max(lo,std::min(hi,x)); }
double mix(double a,double b,double t) { return a+(b-a)*t; }
double smooth(double a,double b,double x) { const auto t=clamp((x-a)/(b-a));return t*t*(3-2*t); }
double decode(double x) { return x<=0.04045?x/12.92:std::pow((x+0.055)/1.055,2.4); }
double encode(double x) { return x<=0.0031308?12.92*x:1.055*std::pow(x,1/2.4)-0.055; }
Color to_lab(Color c) {
    const auto r=decode(c[0]),g=decode(c[1]),b=decode(c[2]);
    const auto l=std::cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
    const auto m=std::cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
    const auto s=std::cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
    return {0.2104542553*l+0.793617785*m-0.0040720468*s,
        1.9779984951*l-2.428592205*m+0.4505937099*s,
        0.0259040371*l+0.7827717662*m-0.808675766*s};
}
Color from_lab(Color c) {
    const auto l=std::pow(c[0]+0.3963377774*c[1]+0.2158037573*c[2],3);
    const auto m=std::pow(c[0]-0.1055613458*c[1]-0.0638541728*c[2],3);
    const auto s=std::pow(c[0]-0.0894841775*c[1]-1.291485548*c[2],3);
    return {encode(4.0767416621*l-3.3077115913*m+0.2309699292*s),
        encode(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
        encode(-0.0041960863*l-0.7034186147*m+1.707614701*s)};
}
Color correct(Color c,const Settings& s) {
    const auto gain=std::pow(2,s.exposure);
    return {encode(decode(c[0])*gain*std::pow(2,s.temperature*.35+s.tint*.12)),
        encode(decode(c[1])*gain*std::pow(2,-s.tint*.24)),
        encode(decode(c[2])*gain*std::pow(2,-s.temperature*.35+s.tint*.12))};
}
const Look& look_for(const std::string& key) {
    for(const auto& look:kLooks)if(key==look.key)return look;
    throw std::invalid_argument("Unknown look");
}
const InputProfile& profile_for(const std::string& key) {
    for(const auto& profile:kInputProfiles)if(key==profile.key)return profile;
    throw std::invalid_argument("Unsupported input profile");
}
double decode_input(double x,int transfer) {
    if(transfer==0)return decode(x);
    if(transfer==1)return std::pow(std::max(0.0,x),2.4);
    if(transfer==2)return x>=171.2102946929/1023?
        std::pow(10,(x*1023-420)/261.5)*.19-.01:(x*1023-95)*.01125/(171.2102946929-95);
    if(transfer==3)return x<.181?(x-.125)/5.6:std::pow(10,(x-.598206)/.241514)-.00873;
    throw std::invalid_argument("Unsupported transfer function");
}
Color normalize_input(Color rgb,const InputProfile& profile) {
    if(profile.transfer==0)return rgb;
    Color linear{},converted{},result{};for(int k=0;k<3;++k)linear[k]=decode_input(rgb[k],profile.transfer);
    for(int row=0;row<3;++row) {
        const auto& m=profile.matrix;
        converted[row]=m[row*3]*linear[0]+m[row*3+1]*linear[1]+m[row*3+2]*linear[2];
    }
    const auto peak=std::max({converted[0],converted[1],converted[2],0.0});
    const auto scale=profile.scene&&peak>.8?(.8+.2*(1-std::exp(-(peak-.8)/.2)))/peak:1;
    for(int k=0;k<3;++k)result[k]=clamp(encode(converted[k]*scale));
    return result;
}
void check_range(double x,double lo,double hi,const char* field) {
    if(!std::isfinite(x)||x<lo||x>hi)throw std::invalid_argument(field);
}
void check_correction(const Correction& c) {
    check_range(c.exposure,-4,4,"Invalid model exposure");
    check_range(c.temperature,-1,1,"Invalid model temperature");
    check_range(c.tint,-1,1,"Invalid model tint");
}
void check_distribution(const Distribution& d) {
    double previous=-std::numeric_limits<double>::infinity();
    for(auto q:d.quantiles) {
        if(!std::isfinite(q)||q<0||q>4||q<previous)throw std::invalid_argument("Invalid model quantiles");
        previous=q;
    }
    for(const auto& z:d.zones) {
        if(!std::isfinite(z.a)||!std::isfinite(z.b)||!std::isfinite(z.sa)||!std::isfinite(z.sb)||
           std::abs(z.a)>4||std::abs(z.b)>4||z.sa<0||z.sb<0||z.sa>4||z.sb>4)
            throw std::invalid_argument("Invalid model palette");
    }
}
Zone zone_color(double x,const Distribution& d,double mid) {
    const auto low=x<mid;
    const auto t=low?smooth(0,std::max(.01,mid),x):smooth(mid,std::max(mid+.01,1.0),x);
    const auto& a=d.zones[low?0:1];const auto& b=d.zones[low?1:2];
    return {mix(a.a,b.a,t),mix(a.b,b.b,t),mix(a.sa,b.sa,t),mix(a.sb,b.sb,t)};
}
double tone_map(double x,const Distribution& a,const Distribution& b) {
    if(x<=a.quantiles[0])return mix(x,b.quantiles[0],.85);
    for(std::size_t i=1;i<a.quantiles.size();++i)if(x<=a.quantiles[i]) {
        const auto t=clamp((x-a.quantiles[i-1])/std::max(.00001,a.quantiles[i]-a.quantiles[i-1]));
        return mix(x,mix(b.quantiles[i-1],b.quantiles[i],t),.85);
    }
    return mix(x,b.quantiles.back()+x-a.quantiles.back(),.85);
}
double skin_weight(Color c) {
    const auto hue=std::atan2(c[2],c[1]),chroma=std::hypot(c[1],c[2]);
    return smooth(.2,.45,c[0])*(1-smooth(.85,.98,c[0]))*
        std::exp(-std::pow((hue-.8)/.45,2))*smooth(.015,.06,chroma);
}
Color apply_color(Color rgb,const Recipe& r,const Look& look,const InputProfile& profile) {
    const auto& s=r.settings;const auto base=to_lab(correct(normalize_input(rgb,profile),s));auto c=base;
    if(r.model.enabled&&s.strength>0) {
        const auto& source=r.model.source;const auto& ref=r.model.reference;
        const auto sc=zone_color(c[0],source,source.quantiles[4]);
        // JS uses source median to interpolate both palettes.
        const auto rc=zone_color(c[0],ref,source.quantiles[4]);
        const auto ar=clamp((rc.sa+.015)/(sc.sa+.015),.5,2),br=clamp((rc.sb+.015)/(sc.sb+.015),.5,2);
        const auto protect=1-s.preserve_skin*skin_weight(base)*.85;
        c[0]=mix(c[0],tone_map(c[0],source,ref),s.strength);
        c[1]=mix(c[1],clamp((c[1]-sc.a)*ar+rc.a,-.3,.3),s.strength*protect);
        c[2]=mix(c[2],clamp((c[2]-sc.b)*br+rc.b,-.3,.3),s.strength*protect);
    }
    const auto t=smooth(.15,.85,c[0]),sat=s.saturation*look.saturation;
    c[1]=c[1]*sat+mix(look.shadow[0],look.highlight[0],t);
    c[2]=c[2]*sat+mix(look.shadow[1],look.highlight[1],t);
    c[0]=(c[0]-.5)*s.contrast*look.contrast+.5;
    c[0]=s.fade+(1-s.fade)*c[0];
    if(s.shoulder>0&&c[0]>.65)c[0]=mix(c[0],.65+.35*(1-std::exp(-(c[0]-.65)/.35)),s.shoulder);
    auto result=from_lab(c);for(auto& v:result)v=clamp(v);return result;
}
struct Layout { int scalar_bytes; double maximum; std::array<int,4> channels; bool floating; };
Layout layout(PixelFormat f) {
    switch(f) {
        case PixelFormat::RGBA8:return {1,255,{0,1,2,3},false};
        case PixelFormat::BGRA8:return {1,255,{2,1,0,3},false};
        case PixelFormat::ARGB8:return {1,255,{1,2,3,0},false};
        case PixelFormat::RGBA16:return {2,65535,{0,1,2,3},false};
        case PixelFormat::ARGB16:return {2,65535,{1,2,3,0},false};
        case PixelFormat::RGBA16AE:return {2,32768,{0,1,2,3},false};
        case PixelFormat::ARGB16AE:return {2,32768,{1,2,3,0},false};
        case PixelFormat::RGBA32F:return {4,1,{0,1,2,3},true};
        case PixelFormat::BGRA32F:return {4,1,{2,1,0,3},true};
        case PixelFormat::ARGB32F:return {4,1,{1,2,3,0},true};
    }
    throw std::invalid_argument("Unsupported pixel format");
}
double read_scalar(const std::uint8_t* p,const Layout& l) {
    if(l.floating){float v;std::memcpy(&v,p,4);if(!std::isfinite(v))throw std::invalid_argument("Nonfinite input pixel");return v;}
    if(l.scalar_bytes==1)return *p/l.maximum;
    std::uint16_t v;std::memcpy(&v,p,2);return v/l.maximum;
}
void write_scalar(std::uint8_t* p,const Layout& l,double value) {
    value=clamp(value);
    if(l.floating){const auto v=static_cast<float>(value);std::memcpy(p,&v,4);}
    else if(l.scalar_bytes==1)*p=static_cast<std::uint8_t>(std::round(value*l.maximum));
    else {const auto v=static_cast<std::uint16_t>(std::round(value*l.maximum));std::memcpy(p,&v,2);}
}
void check_frame(const void* data,int w,int h,std::ptrdiff_t stride,PixelFormat format,AlphaMode alpha) {
    if(!data||w<1||h<1||static_cast<std::uint64_t>(w)*h>40000000)
        throw std::invalid_argument("Invalid frame dimensions/data");
    if(alpha!=AlphaMode::Straight&&alpha!=AlphaMode::Premultiplied)throw std::invalid_argument("Invalid alpha mode");
    const auto needed=static_cast<std::ptrdiff_t>(pixel_bytes(format)*w);
    if(stride==std::numeric_limits<std::ptrdiff_t>::min()||std::abs(stride)<needed)
        throw std::invalid_argument("Invalid frame stride");
    if(std::abs(stride)>std::numeric_limits<std::ptrdiff_t>::max()/h)
        throw std::invalid_argument("Frame stride overflow");
}
std::vector<float> blur(const std::vector<float>& in,int w,int h,int radius) {
    std::vector<float> temp(in.size()),out(in.size());const auto count=2*radius+1;
    for(int y=0;y<h;++y)for(int c=0;c<3;++c) {
        double sum=0;for(int k=-radius;k<=radius;++k)sum+=in[(y*w+std::clamp(k,0,w-1))*3+c];
        for(int x=0;x<w;++x) {
            temp[(y*w+x)*3+c]=static_cast<float>(sum/count);
            sum+=in[(y*w+std::min(w-1,x+radius+1))*3+c]-in[(y*w+std::max(0,x-radius))*3+c];
        }
    }
    for(int x=0;x<w;++x)for(int c=0;c<3;++c) {
        double sum=0;for(int k=-radius;k<=radius;++k)sum+=temp[(std::clamp(k,0,h-1)*w+x)*3+c];
        for(int y=0;y<h;++y) {
            out[(y*w+x)*3+c]=static_cast<float>(sum/count);
            sum+=temp[(std::min(h-1,y+radius+1)*w+x)*3+c]-temp[(std::max(0,y-radius)*w+x)*3+c];
        }
    }
    return out;
}
} // namespace

std::size_t pixel_bytes(PixelFormat f) { return static_cast<std::size_t>(layout(f).scalar_bytes)*4; }
PixelFormat parse_pixel_format(const std::string& name) {
    const std::array<std::pair<const char*,PixelFormat>,10> names{{
        {"rgba8",PixelFormat::RGBA8},{"bgra8",PixelFormat::BGRA8},{"argb8",PixelFormat::ARGB8},
        {"rgba16",PixelFormat::RGBA16},{"argb16",PixelFormat::ARGB16},
        {"rgba16ae",PixelFormat::RGBA16AE},{"argb16ae",PixelFormat::ARGB16AE},
        {"rgba32f",PixelFormat::RGBA32F},{"bgra32f",PixelFormat::BGRA32F},{"argb32f",PixelFormat::ARGB32F}}};
    for(const auto& item:names)if(name==item.first)return item.second;
    throw std::invalid_argument("Unsupported pixel format name");
}
void validate(const Recipe& r) {
    const auto& s=r.settings;
    check_range(s.strength,0,1,"Invalid strength");check_range(s.exposure,-4,4,"Invalid exposure");
    check_range(s.temperature,-1,1,"Invalid temperature");check_range(s.tint,-1,1,"Invalid tint");
    check_range(s.contrast,.5,1.8,"Invalid contrast");check_range(s.saturation,0,2,"Invalid saturation");
    check_range(s.preserve_skin,0,1,"Invalid skin control");check_range(s.fade,0,.2,"Invalid fade");
    check_range(s.shoulder,0,1,"Invalid shoulder");(void)look_for(s.look);(void)profile_for(s.input_profile);
    if(r.model.enabled) {
        check_correction(r.model.correction);check_distribution(r.model.source);check_distribution(r.model.reference);
        if(r.model.input_profile!=s.input_profile)throw std::invalid_argument("Input profile changed: refit the match");
        if(std::abs(r.model.correction.exposure-s.exposure)>.000001||
           std::abs(r.model.correction.temperature-s.temperature)>.000001||
           std::abs(r.model.correction.tint-s.tint)>.000001)throw std::invalid_argument("Correction changed: refit the match");
    }
    const auto& f=r.film;
    check_range(f.grain,0,1,"Invalid grain");check_range(f.bloom,0,1,"Invalid bloom");
    check_range(f.halation,0,1,"Invalid halation");check_range(f.vignette,0,1,"Invalid vignette");
    check_range(f.bleach,0,1,"Invalid bleach");
    if(f.ratio!=0&&f.ratio!=1.33&&f.ratio!=1.85&&f.ratio!=2.39)throw std::invalid_argument("Unsupported ratio");
}
Color transform(Color color,const Recipe& recipe) {
    validate(recipe);for(auto v:color)if(!std::isfinite(v))throw std::invalid_argument("Nonfinite input color");
    return apply_color(color,recipe,look_for(recipe.settings.look),profile_for(recipe.settings.input_profile));
}
void render(const ConstFrame& input,const Frame& output,const Recipe& recipe,std::uint64_t frame_index,double pixel_aspect) {
    validate(recipe);
    check_range(pixel_aspect,1.0/16,16,"Invalid pixel aspect ratio");
    check_frame(input.data,input.width,input.height,input.row_bytes,input.format,input.alpha);
    check_frame(output.data,output.width,output.height,output.row_bytes,output.format,output.alpha);
    if(input.width!=output.width||input.height!=output.height)throw std::invalid_argument("Frame size mismatch");
    const auto w=input.width,h=input.height;const auto in_layout=layout(input.format),out_layout=layout(output.format);
    const auto& look=look_for(recipe.settings.look);const auto& profile=profile_for(recipe.settings.input_profile);const auto& film=recipe.film;
    std::vector<std::array<double,4>> pixels(static_cast<std::size_t>(w)*h);
    for(int y=0;y<h;++y)for(int x=0;x<w;++x) {
        const auto p=static_cast<const std::uint8_t*>(input.data)+y*input.row_bytes+x*pixel_bytes(input.format);
        const auto alpha=clamp(read_scalar(p+in_layout.channels[3]*in_layout.scalar_bytes,in_layout));
        Color c{};for(int k=0;k<3;++k)c[k]=read_scalar(p+in_layout.channels[k]*in_layout.scalar_bytes,in_layout);
        if(input.alpha==AlphaMode::Premultiplied)for(auto& v:c)v=alpha>0?v/alpha:0;
        c=apply_color(c,recipe,look,profile);
        pixels[static_cast<std::size_t>(y)*w+x]={c[0],c[1],c[2],alpha};
    }
    std::vector<float> light;
    if(film.bloom||film.halation) {
        light.resize(pixels.size()*3);
        for(std::size_t i=0;i<pixels.size();++i) {
            const auto& c=pixels[i];const auto l=c[0]*.2126+c[1]*.7152+c[2]*.0722;
            // Alpha weighting prevents invisible pixels contributing a glow.
            const auto threshold=std::max(0.0,(l-.6)/.4)*c[3];
            for(int k=0;k<3;++k)light[i*3+k]=static_cast<float>(c[k]*255*threshold);
        }
        light=blur(light,w,h,std::max(1,static_cast<int>(std::round(std::min(w,h)*.018))));
    }
    for(int y=0;y<h;++y)for(int x=0;x<w;++x) {
        const auto i=static_cast<std::size_t>(y)*w+x;const auto& c=pixels[i];
        const auto dx=(x+.5)/w-.5,dy=(y+.5)/h-.5;
        const auto vignette=1-film.vignette*std::min(1.0,std::pow((dx*dx+dy*dy)*2,1.2));
        // Frame zero matches the JS still-grain equation. Later frames get a
        // deterministic changing pattern, independent of render order.
        const auto seed=static_cast<double>(frame_index%1048576)*19.193;
        const auto hash=std::sin((i+1)*12.9898+78.233+seed)*43758.5453;
        const auto noise=(hash-std::floor(hash)-.5)*film.grain*32;
        const auto l=(c[0]*.2126+c[1]*.7152+c[2]*.0722)*255;
        const auto display_width=w*pixel_aspect;
        const auto matte=film.ratio&&(display_width/h>film.ratio?
            std::abs(dx)*display_width>h*film.ratio/2:std::abs(dy)*h>display_width/film.ratio/2);
        auto p=static_cast<std::uint8_t*>(output.data)+y*output.row_bytes+x*pixel_bytes(output.format);
        for(int k=0;k<3;++k) {
            const auto desat=c[k]*255*(1-film.bleach*.65)+l*film.bleach*.65;
            auto v=desat+(desat-127.5)*film.bleach*.22;
            if(!light.empty())v+=light[i*3+k]*film.bloom*.45+(k==0?light[i*3]*film.halation*.55:0);
            v=matte?0:clamp((v*vignette+noise)/255);
            if(output.alpha==AlphaMode::Premultiplied)v*=c[3];
            write_scalar(p+out_layout.channels[k]*out_layout.scalar_bytes,out_layout,v);
        }
        write_scalar(p+out_layout.channels[3]*out_layout.scalar_bytes,out_layout,c[3]);
    }
}
} // namespace odygrade
