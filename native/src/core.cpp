#include "odygrade/core.hpp"
#include "looks.hpp"
#include "profiles.hpp"
#include <algorithm>
#include <cmath>
#include <optional>
#include <cstring>
#include <limits>
#include <exception>
#include <stdexcept>
#include <thread>
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
struct Gains { double gain,r,g,b; };
Gains gains_for(const Settings& s) {
    return {std::pow(2,s.exposure),std::pow(2,s.temperature*.35+s.tint*.12),std::pow(2,-s.tint*.24),std::pow(2,-s.temperature*.35+s.tint*.12)};
}
Color correct(Color c,const Gains& k) {
    return {encode(decode(c[0])*k.gain*k.r),encode(decode(c[1])*k.gain*k.g),encode(decode(c[2])*k.gain*k.b)};
}
const Look& look_for(const std::string& key) {
    for(const auto& look:kLooks)if(key==look.key)return look;
    throw std::invalid_argument("Unknown look");
}
const Stock& stock_for(const std::string& key) {
    for(const auto& s:kStocks)if(key==s.key)return s;
    throw std::invalid_argument("Unknown film stock");
}
// Mirrors stock() in src/engine.js.
Color apply_stock(Color c,const Stock& k,double amount) {
    if(amount<=0||std::strcmp(k.key,"none")==0)return c;
    constexpr double bands[3]={.9,2.5,-1.7},pi=3.14159265358979323846;
    const auto L=clamp(c[0]),p=std::pow(L,k.curve[0]),y=p/(p+std::pow(1-L,k.curve[0]));
    const auto l=k.curve[1]+(k.curve[2]-k.curve[1])*y;
    const auto sat=k.sat[0]*mix(k.sat[1],1,smooth(0,.35,L))*mix(1,k.sat[2],smooth(.7,1,L));
    auto a=c[1]*sat,b=c[2]*sat;const auto ch=std::hypot(a,b);
    if(ch>1e-6) {
        const auto h=std::atan2(b,a);double rot=0;
        for(int i=0;i<3;++i){auto d=h-bands[i];d-=2*pi*std::round(d/(2*pi));rot+=k.hue[i]*std::exp(-(d/.6)*(d/.6));}
        rot*=smooth(.01,.05,ch);const auto cs=std::cos(rot),sn=std::sin(rot),a0=a;a=a0*cs-b*sn;b=a0*sn+b*cs;
    }
    const auto t=smooth(.15,.85,l);a+=mix(k.shadow[0],k.highlight[0],t);b+=mix(k.shadow[1],k.highlight[1],t);
    return {mix(c[0],l,amount),mix(c[1],a,amount),mix(c[2],b,amount)};
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
    // 4-9 mirror src/color-management.js decode(): LogC3 EI800, C-Log3, F-Log, D-Log, Apple Log, BMD Film Gen 5.
    if(transfer==4)return x>.149658?(std::pow(10,(x-.385537)/.24719)-.052272)/5.555556:(x-.092809)/5.367655;
    if(transfer==5)return .9*(x<.097465473?-(std::pow(10,(.12783901-x)/.36726845)-1)/14.98325:
        x<=.15277891?(x-.12512219)/1.9754798:(std::pow(10,(x-.12240537)/.36726845)-1)/14.98325);
    if(transfer==6)return x<.100537775223865?(x-.092864)/8.735631:std::pow(10,(x-.790453)/.344676)/.555556-.009468/.555556;
    if(transfer==7)return x<=.14?(x-.0929)/6.025:(std::pow(10,3.89616*x-2.27752)-.0108)/.9892;
    if(transfer==8){const auto pt=47.28711236*std::pow(.01+.05641088,2);
        return x>=pt?std::pow(2,(x-.69336945)/.08550479)-.00964052:x>=0?std::sqrt(x/47.28711236)-.05641088:-.05641088;}
    if(transfer==9)return x<8.283605932402494*.005+.09246575342465753?(x-.09246575342465753)/8.283605932402494:
        std::exp((x-.5300133392291939)/.08692876065491224)-.005494072432257808;
    if(transfer==10){  // BT.2100 HLG inverse OETF, BT.2408 diffuse white (75%) = 1.0; mirrors color-management.js
        constexpr double a=.17883277,b=1-4*a;const double c=.5-a*std::log(4*a);
        const auto hlg=[&](double v){return v<=.5?v*std::abs(v)/3:(std::exp((v-c)/a)+b)/12;};
        return hlg(x)/hlg(.75);}
    throw std::invalid_argument("Unsupported transfer function");
}
Color normalize_input(Color rgb,const InputProfile& profile) {
    if(profile.transfer==0)return rgb;
    Color linear{},converted{},result{};for(int k=0;k<3;++k)linear[k]=decode_input(rgb[k],profile.transfer);
    for(int row=0;row<3;++row) {
        const auto& m=profile.matrix;
        converted[row]=m[row*3]*linear[0]+m[row*3+1]*linear[1]+m[row*3+2]*linear[2];
    }
    // Mirrors color-management.js sceneToDisplay: peak compression, then fade to white (peak 1x..4x).
    if(profile.scene) {
        for(auto& v:converted)v=std::max(0.0,v);
        const auto peak=std::max({converted[0],converted[1],converted[2]});
        const auto d=peak<=.8?peak:.8+.2*(1-std::exp(-(peak-.8)/.2)),s=peak>.8?d/peak:1.0;
        const auto w=smooth(0,2,std::log2(std::max(peak,1e-6)));
        for(auto& v:converted)v=d+(v*s-d)*(1-w);
    }
    for(int k=0;k<3;++k)result[k]=clamp(encode(converted[k]));
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
    if(d.has_chroma&&(!std::isfinite(d.chroma[0])||!std::isfinite(d.chroma[1])||d.chroma[0]<0||d.chroma[1]>1||d.chroma[1]<d.chroma[0]))
        throw std::invalid_argument("Invalid model chroma tail");
}
// Mirrors engine.js chromaTail: compress-only pull of the source chroma tail toward the reference.
Color chroma_tail(Color c,Color base,const Distribution& s,const Distribution& r,double amount) {
    if(!s.has_chroma||!r.has_chroma||amount<=0)return c;
    const auto c0=std::hypot(base[1],base[2]),w=smooth(s.chroma[0],std::max(s.chroma[0]+.0001,s.chroma[1]),c0)*amount;
    if(w<=0)return c;
    const auto target=r.chroma[0]+(c0-s.chroma[0])*clamp((r.chroma[1]-r.chroma[0])/std::max(.0001,s.chroma[1]-s.chroma[0]));
    const auto c1=std::hypot(c[1],c[2]);
    if(c1<=target)return c;
    const auto k=mix(1,target/c1,w);return {c[0],c[1]*k,c[2]*k};
}
Zone zone_color(double x,const Distribution& d,double mid) {
    const auto low=x<mid;
    const auto t=low?smooth(0,std::max(.01,mid),x):smooth(mid,std::max(mid+.01,1.0),x);
    const auto& a=d.zones[low?0:1];const auto& b=d.zones[low?1:2];
    return {mix(a.a,b.a,t),mix(a.b,b.b,t),mix(a.sa,b.sa,t),mix(a.sb,b.sb,t)};
}
using Knots=std::array<double,9>;
// Mirrors engine.js boundedKnots: reference knots with each segment's expansion capped at
// 2x the source segment, so crowded highlights (clipped sky) are not stretched into blotches.
Knots bounded_knots(const Distribution& a,const Distribution& b) {
    Knots out{};out[0]=b.quantiles[0];
    for(std::size_t i=1;i<out.size();++i)out[i]=out[i-1]+std::min(b.quantiles[i]-b.quantiles[i-1],2*(a.quantiles[i]-a.quantiles[i-1]));
    return out;
}
double tone_map(double x,const Distribution& a,const Knots& b) {
    if(x<=a.quantiles[0])return mix(x,b[0],.85);
    for(std::size_t i=1;i<a.quantiles.size();++i)if(x<=a.quantiles[i]) {
        const auto t=clamp((x-a.quantiles[i-1])/std::max(.00001,a.quantiles[i]-a.quantiles[i-1]));
        return mix(x,mix(b[i-1],b[i],t),.85);
    }
    return mix(x,b.back()+x-a.quantiles.back(),.85);
}
double skin_weight(Color c) {
    const auto hue=std::atan2(c[2],c[1]),chroma=std::hypot(c[1],c[2]);
    return smooth(.2,.45,c[0])*(1-smooth(.85,.98,c[0]))*
        std::exp(-std::pow((hue-.8)/.45,2))*smooth(.015,.06,chroma);
}
// Lookups and per-frame constants resolved once per render, not per pixel.
struct Prepared { const Look& look; const InputProfile& profile; const Stock& stock; Gains gains; Knots knots; };
Prepared prepare(const Recipe& r) {
    const auto& s=r.settings;return {look_for(s.look),profile_for(s.input_profile),stock_for(s.stock),gains_for(s),
        bounded_knots(r.model.source,r.model.reference)};
}
Color apply_color(Color rgb,const Recipe& r,const Prepared& p) {
    const auto& s=r.settings;const auto& look=p.look;const auto base=to_lab(correct(normalize_input(rgb,p.profile),p.gains));auto c=base;
    if(r.model.enabled&&s.strength>0) {
        const auto& source=r.model.source;const auto& ref=r.model.reference;
        const auto sc=zone_color(c[0],source,source.quantiles[4]);
        // JS uses source median to interpolate both palettes.
        const auto rc=zone_color(c[0],ref,source.quantiles[4]);
        const auto ar=clamp((rc.sa+.015)/(sc.sa+.015),.5,2),br=clamp((rc.sb+.015)/(sc.sb+.015),.5,2);
        const auto protect=1-s.preserve_skin*skin_weight(base)*.85;
        c[0]=mix(c[0],tone_map(c[0],source,p.knots),s.strength);
        c[1]=mix(c[1],clamp((c[1]-sc.a)*ar+rc.a,-.3,.3),s.strength*protect);
        c[2]=mix(c[2],clamp((c[2]-sc.b)*br+rc.b,-.3,.3),s.strength*protect);
        c=chroma_tail(c,base,source,ref,s.strength*protect);
    }
    const auto t=smooth(.15,.85,c[0]),sat=s.saturation*look.saturation;
    c[1]=c[1]*sat+mix(look.shadow[0],look.highlight[0],t);
    c[2]=c[2]*sat+mix(look.shadow[1],look.highlight[1],t);
    c[0]=(c[0]-.5)*s.contrast*look.contrast+.5;
    c=apply_stock(c,p.stock,s.stock_amount);
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
thread_local int thread_limit=0;
// Splits rows over the cores; each row is independent, so output is identical to one thread.
template<class F> void parallel_rows(int h,F&& body) {
    auto cores=std::max(1u,std::thread::hardware_concurrency());
    if(thread_limit>0)cores=std::min(cores,static_cast<unsigned>(thread_limit));
    const auto n=static_cast<int>(std::min<unsigned>(cores,static_cast<unsigned>((h+31)/32)));
    if(n<=1){body(0,h);return;}
    std::vector<std::exception_ptr> errors(n);
    auto run=[&](int t){try{body(int(1LL*h*t/n),int(1LL*h*(t+1)/n));}catch(...){errors[t]=std::current_exception();}};
    std::vector<std::thread> workers;workers.reserve(n);int started=0;
    // A failed thread start must not unwind past joinable threads (std::terminate kills the host):
    // the ranges that got no thread run on this one instead.
    try{for(;started<n;++started)workers.emplace_back(run,started);}catch(...){}
    for(int t=started;t<n;++t)run(t);
    for(auto& w:workers)w.join();
    for(auto& e:errors)if(e)std::rethrow_exception(e);
}
std::vector<float> blur(const std::vector<float>& in,int w,int h,int radius) {
    std::vector<float> temp(in.size()),out(in.size());const auto count=2*radius+1;
    parallel_rows(h,[&](int r0,int r1){for(int y=r0;y<r1;++y)for(int c=0;c<3;++c) {
        double sum=0;for(int k=-radius;k<=radius;++k)sum+=in[(y*w+std::clamp(k,0,w-1))*3+c];
        for(int x=0;x<w;++x) {
            temp[(y*w+x)*3+c]=static_cast<float>(sum/count);
            sum+=in[(y*w+std::min(w-1,x+radius+1))*3+c]-in[(y*w+std::max(0,x-radius))*3+c];
        }
    }});
    parallel_rows(w,[&](int x0,int x1){for(int x=x0;x<x1;++x)for(int c=0;c<3;++c) {
        double sum=0;for(int k=-radius;k<=radius;++k)sum+=temp[(std::clamp(k,0,h-1)*w+x)*3+c];
        for(int y=0;y<h;++y) {
            out[(y*w+x)*3+c]=static_cast<float>(sum/count);
            sum+=temp[(std::min(h-1,y+radius+1)*w+x)*3+c]-temp[(std::max(0,y-radius)*w+x)*3+c];
        }
    }});
    return out;
}
// Film gauge / format tables and helpers: equation-for-equation mirror of src/film.js.
struct Gauge { double size, amplitude; };
const Gauge* gauge_for(double g) {
    static const Gauge g8{4,1.3},g16{2.4,1.15},g35{1.4,1},g65{.9,.8};
    return g==8?&g8:g==16?&g16:g==35?&g35:g==65?&g65:nullptr;
}
struct Format { double weave,flicker,dust,speck,perfs,phase,perf_h,perf_w,both; };
constexpr Format Formats[]={{},
    {.006,1,1.6,2.2,1,0,.18,.12,0},{.005,.9,1.4,2,1,.5,.16,.11,0},{.0035,.7,1.2,1.6,1,0,.17,.12,1},
    {.003,.6,1.1,1.4,1,0,.17,.12,0},{.0015,.4,.8,1,4,.125,.1,.08,1},{.0008,.25,.5,.8,0,0,0,0,0}};
double fract(double v) { return v-std::floor(v); }
double hash(double a,double b) { return fract(std::sin(a*12.9898+b*78.233)*43758.5453); }
double value_noise(double x,double y,double seed) {
    const auto ix=std::floor(x),iy=std::floor(y);auto u=x-ix,v=y-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
    const auto a=hash(ix+seed,iy),b=hash(ix+1+seed,iy),c=hash(ix+seed,iy+1),d=hash(ix+1+seed,iy+1);
    return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v-.5;
}
double grain_noise(double x,double y,double cell,double seed) {  // film.js grainNoise
    const auto u=(x*.8+y*.6)/cell,v=(y*.8-x*.6)/cell;
    return .7*value_noise(u,v,seed)+.45*value_noise(u*2.1+17.3,v*2.1+5.1,seed);
}
struct FormatState { double dx{},dy{},gain{1};std::vector<float> mask;const Format* f{}; };
FormatState format_pass(const Film& o,int w,int h,std::uint64_t frame) {
    FormatState s;if(o.format<1)return s;
    const auto& f=Formats[static_cast<int>(o.format)];s.f=&f;const auto n=static_cast<double>(frame%1048576);
    const double u=std::min(w,h);  // sizes follow the short side (vertical video), as in film.js
    if(o.weave){s.dx=o.weave*f.weave*u*(hash(n,2.5)-.5)*1.2;s.dy=o.weave*f.weave*u*(hash(n,3.5)-.5)*2;}
    if(o.flicker)s.gain=1+o.flicker*f.flicker*.12*(hash(n,1.5)-.5)*2;
    if(o.dust) {
        s.mask.assign(static_cast<std::size_t>(w)*h,0.f);const auto scale=u/1080;
        const auto count=static_cast<int>(std::floor(o.dust*30*f.dust+hash(n,4.5)*o.dust*10));
        for(int k=0;k<count;++k) {
            const auto key=n*7+k,cx=hash(key,5.5)*w,cy=hash(key,6.5)*h,r=(.6+2.4*std::pow(hash(key,7.5),2))*scale*f.speck;
            const auto sign=hash(key,8.5)<.7?1.0:-1.0,strength=.5+.5*hash(key,9.5);
            for(int y=std::max(0,static_cast<int>(std::floor(cy-r-1)));y<=std::min(h-1,static_cast<int>(std::ceil(cy+r+1)));++y)
                for(int x=std::max(0,static_cast<int>(std::floor(cx-r-1)));x<=std::min(w-1,static_cast<int>(std::ceil(cx+r+1)));++x) {
                    const auto a=clamp(r+.5-std::hypot(x+.5-cx,y+.5-cy))*strength*sign;auto& m=s.mask[static_cast<std::size_t>(y)*w+x];
                    m=static_cast<float>(std::clamp(m+a,-1.0,1.0));
                }
        }
        if(hash(n,10.5)<o.dust*.35) {
            const auto sx=hash(n,11.5)*w,sw=std::max(1.0,scale*1.2);
            for(int y=0;y<h;++y)for(int x=std::max(0,static_cast<int>(std::floor(sx-sw-1)));x<=std::min(w-1,static_cast<int>(std::ceil(sx+sw+1)));++x) {
                auto& m=s.mask[static_cast<std::size_t>(y)*w+x];m=static_cast<float>(std::min(1.0,m+clamp(sw+.5-std::abs(x+.5-sx))*.35));
            }
        }
    }
    return s;
}
double perforation(const Format& f,int x,int y,int w,int h) {
    if(!f.perfs)return 0;
    const double u=std::min(w,h);const auto ph=f.perf_h*u,pw=f.perf_w*u,r=.25*std::min(ph,pw),inset=.012*u,px=x+.5,py=y+.5;
    const auto ex=f.both?std::min(px,w-px):px;if(ex>inset+pw+1)return 0;
    const auto qx=std::abs(ex-inset-pw/2)-pw/2+r,pitch=h/f.perfs;double best=0;
    for(int j=-1;j<=static_cast<int>(f.perfs);++j) {
        const auto qy=std::abs(py-(j+f.phase)*pitch)-ph/2+r;
        const auto d=std::hypot(std::max(qx,0.0),std::max(qy,0.0))+std::min(std::max(qx,qy),0.0)-r;
        best=std::max(best,clamp(.5-d));
    }
    return best;
}
std::vector<std::array<double,4>> shift(const std::vector<std::array<double,4>>& d,int w,int h,double dx,double dy) {
    std::vector<std::array<double,4>> out(d.size());
    parallel_rows(h,[&](int r0,int r1){for(int y=r0;y<r1;++y)for(int x=0;x<w;++x) {
        const auto sx=std::clamp(x-dx,0.0,w-1.0),sy=std::clamp(y-dy,0.0,h-1.0);
        const auto x0=static_cast<int>(sx),y0=static_cast<int>(sy),x1=std::min(w-1,x0+1),y1=std::min(h-1,y0+1);const auto u=sx-x0,v=sy-y0;
        const auto& a=d[static_cast<std::size_t>(y0)*w+x0];const auto& b=d[static_cast<std::size_t>(y0)*w+x1];
        const auto& e=d[static_cast<std::size_t>(y1)*w+x0];const auto& g=d[static_cast<std::size_t>(y1)*w+x1];
        for(int c=0;c<4;++c)out[static_cast<std::size_t>(y)*w+x][c]=(a[c]+(b[c]-a[c])*u)*(1-v)+(e[c]+(g[c]-e[c])*u)*v;
    }});
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
    (void)stock_for(s.stock);check_range(s.stock_amount,0,1,"Invalid stock amount");
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
    if(f.gauge!=0&&!gauge_for(f.gauge))throw std::invalid_argument("Unsupported grain gauge");
    check_range(f.iso,50,500,"Invalid grain ISO");
    if(f.format!=std::round(f.format)||f.format<0||f.format>=static_cast<double>(std::size(Formats)))throw std::invalid_argument("Unsupported film format");
    check_range(f.weave,0,1,"Invalid gate weave");check_range(f.flicker,0,1,"Invalid flicker");check_range(f.dust,0,1,"Invalid dust");
    if(f.perfs!=0&&f.perfs!=1)throw std::invalid_argument("Invalid perforation flag");
    check_range(r.trim[0],-4,4,"Invalid exposure trim");check_range(r.trim[1],-1,1,"Invalid temperature trim");check_range(r.trim[2],-1,1,"Invalid tint trim");
}
namespace {
std::optional<Recipe> trim_recipe(const Recipe& r) {
    if(!r.trim[0]&&!r.trim[1]&&!r.trim[2])return std::nullopt;
    Recipe t;t.settings.exposure=r.trim[0];t.settings.temperature=r.trim[1];t.settings.tint=r.trim[2];return t;
}
}
Color transform(Color color,const Recipe& recipe) {
    validate(recipe);for(auto v:color)if(!std::isfinite(v))throw std::invalid_argument("Nonfinite input color");
    const auto t=trim_recipe(recipe);const auto c=apply_color(color,recipe,prepare(recipe));
    return t?apply_color(c,*t,prepare(*t)):c;
}
void set_thread_limit(int threads){thread_limit=std::max(0,threads);}
void render(const ConstFrame& input,const Frame& output,const Recipe& recipe,std::uint64_t frame_index,double pixel_aspect) {
    validate(recipe);
    check_range(pixel_aspect,1.0/16,16,"Invalid pixel aspect ratio");
    check_frame(input.data,input.width,input.height,input.row_bytes,input.format,input.alpha);
    check_frame(output.data,output.width,output.height,output.row_bytes,output.format,output.alpha);
    if(input.width!=output.width||input.height!=output.height)throw std::invalid_argument("Frame size mismatch");
    const auto w=input.width,h=input.height;const auto in_layout=layout(input.format),out_layout=layout(output.format);
    const auto prepared=prepare(recipe);const auto& film=recipe.film;
    const auto trim=trim_recipe(recipe);const auto trimmed=prepare(trim?*trim:recipe);
    const auto graded=[&](int x,int y)->std::array<double,4>{
        const auto p=static_cast<const std::uint8_t*>(input.data)+y*input.row_bytes+x*pixel_bytes(input.format);
        const auto alpha=clamp(read_scalar(p+in_layout.channels[3]*in_layout.scalar_bytes,in_layout));
        Color c{};for(int k=0;k<3;++k)c[k]=read_scalar(p+in_layout.channels[k]*in_layout.scalar_bytes,in_layout);
        if(input.alpha==AlphaMode::Premultiplied)for(auto& v:c)v=alpha>0?v/alpha:0;
        c=apply_color(c,recipe,prepared);if(trim)c=apply_color(c,*trim,trimmed);
        return {c[0],c[1],c[2],alpha};
    };
    const auto fmt=format_pass(film,w,h,frame_index);
    // Without weave or glow every output pixel depends only on its own input pixel: grade and
    // finish in one sweep, skipping the full-frame double buffer (memory bandwidth under MFR).
    const bool direct=!(fmt.dx||fmt.dy)&&!(film.bloom||film.halation);
    std::vector<std::array<double,4>> pixels(direct?0:static_cast<std::size_t>(w)*h);
    if(!direct)parallel_rows(h,[&](int r0,int r1){for(int y=r0;y<r1;++y)for(int x=0;x<w;++x)pixels[static_cast<std::size_t>(y)*w+x]=graded(x,y);});
    if(fmt.dx||fmt.dy)pixels=shift(pixels,w,h,fmt.dx,fmt.dy);
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
    // Frame zero matches the JS still-grain equation. Later frames get a
    // deterministic changing pattern, independent of render order.
    const auto seed=static_cast<double>(frame_index%1048576)*19.193;const auto gauge=gauge_for(film.gauge);
    const auto cell=gauge?std::max(.5,std::min(w,h)/1080.0*gauge->size*std::pow(film.iso/200,.35)):1.0;
    const auto amp=gauge?film.grain*32*gauge->amplitude*std::sqrt(film.iso/200):0.0;
    parallel_rows(h,[&](int r0,int r1){for(int y=r0;y<r1;++y)for(int x=0;x<w;++x) {
        const auto i=static_cast<std::size_t>(y)*w+x;const auto c=direct?graded(x,y):pixels[i];
        const auto dx=(x+.5)/w-.5,dy=(y+.5)/h-.5;
        const auto vignette=1-film.vignette*std::min(1.0,std::pow((dx*dx+dy*dy)*2,1.2));
        const auto l=(c[0]*.2126+c[1]*.7152+c[2]*.0722)*255;
        const auto hs=fract(std::sin((i+1)*12.9898+78.233+seed)*43758.5453);
        const auto lw=gauge?.6+1.6*(l/255)*(1-l/255):0.0;
        const auto noise=gauge?grain_noise(x,y,cell,seed)*amp*lw:(hs-.5)*film.grain*32;
        const auto mask=fmt.mask.empty()?0.0:static_cast<double>(fmt.mask[i]);
        const auto hole=fmt.f&&film.perfs?perforation(*fmt.f,x,y,w,h):0.0;
        const auto display_width=w*pixel_aspect;
        const auto matte=film.ratio&&(display_width/h>film.ratio?
            std::abs(dx)*display_width>h*film.ratio/2:std::abs(dy)*h>display_width/film.ratio/2);
        auto p=static_cast<std::uint8_t*>(output.data)+y*output.row_bytes+x*pixel_bytes(output.format);
        for(int k=0;k<3;++k) {
            const auto desat=c[k]*255*(1-film.bleach*.65)+l*film.bleach*.65;
            auto v=desat+(desat-127.5)*film.bleach*.22;
            if(!light.empty())v+=light[i*3+k]*film.bloom*.45+(k==0?light[i*3]*film.halation*.55:0);
            v=v*fmt.gain*vignette+noise+(gauge?(fract(hs*(k+1)*7.13)-.5)*amp*.25*lw:0);
            if(mask)v+=mask>0?(255-v)*mask:v*mask;
            v=matte?0:clamp(v/255);
            if(hole)v+=(235.0/255-v)*hole;
            if(output.alpha==AlphaMode::Premultiplied)v*=c[3];
            write_scalar(p+out_layout.channels[k]*out_layout.scalar_bytes,out_layout,v);
        }
        write_scalar(p+out_layout.channels[3]*out_layout.scalar_bytes,out_layout,c[3]);
    }});
}
} // namespace odygrade
