#include "odygrade/core.hpp"
#include <cmath>
#include <locale>
#include <sstream>
#include <stdexcept>

namespace odygrade {
namespace {
void token(std::istream& in,const char* expected) {
    std::string actual;if(!(in>>actual)||actual!=expected)throw std::invalid_argument(std::string("Expected recipe field: ")+expected);
}
double number(std::istream& in) {
    double value;if(!(in>>value)||!std::isfinite(value))throw std::invalid_argument("Invalid recipe number");return value;
}
Distribution distribution(std::istream& in,double version) {
    Distribution d;for(auto& q:d.quantiles)q=number(in);
    for(auto& z:d.zones){z.a=number(in);z.b=number(in);z.sa=number(in);z.sb=number(in);}
    if(version>=3){d.chroma={number(in),number(in)};d.has_chroma=d.chroma[0]>=0||d.chroma[1]>=0;}  // -1 -1 = none
    return d;
}
}
Recipe read_recipe(const std::string& text) {
    if(text.size()>65536)throw std::invalid_argument("Native recipe exceeds 64 KB");
    std::istringstream in(text);in.imbue(std::locale::classic());
    token(in,"ODYGRADE_NATIVE");const auto version=number(in);
    if(version!=1&&version!=2&&version!=3&&version!=4&&version!=5&&version!=6)throw std::invalid_argument("Unsupported native recipe version");
    Recipe r;auto& s=r.settings;auto& f=r.film;
    token(in,"settings");s.strength=number(in);s.exposure=number(in);s.temperature=number(in);s.tint=number(in);
    s.contrast=number(in);s.saturation=number(in);s.preserve_skin=number(in);s.fade=number(in);s.shoulder=number(in);
    token(in,"look");if(!(in>>s.look))throw std::invalid_argument("Missing look");
    if(version>=2){token(in,"profile");if(!(in>>s.input_profile))throw std::invalid_argument("Missing input profile");}
    if(version>=5){token(in,"stock");if(!(in>>s.stock))throw std::invalid_argument("Missing film stock");s.stock_amount=number(in);}
    token(in,"model");const auto enabled=number(in);if(enabled!=0&&enabled!=1)throw std::invalid_argument("Invalid model flag");
    r.model.enabled=enabled==1;
    if(r.model.enabled) {
        token(in,"correction");r.model.correction={number(in),number(in),number(in)};
        if(version>=2){token(in,"model-profile");if(!(in>>r.model.input_profile))throw std::invalid_argument("Missing model profile");}
        token(in,"source");r.model.source=distribution(in,version);
        token(in,"reference");r.model.reference=distribution(in,version);
        if(version>=6){token(in,"skin");r.model.has_skin=true;
            for(auto* z:{&r.model.skin_source,&r.model.skin_reference}){z->a=number(in);z->b=number(in);z->sa=number(in);z->sb=number(in);}}
    }
    token(in,"film");f.grain=number(in);f.bloom=number(in);f.halation=number(in);
    f.vignette=number(in);f.bleach=number(in);f.ratio=number(in);
    if(version>=4){f.gauge=number(in);f.iso=number(in);f.format=number(in);f.weave=number(in);f.flicker=number(in);f.dust=number(in);f.perfs=number(in);}
    token(in,"end");std::string extra;if(in>>extra)throw std::invalid_argument("Unexpected trailing recipe data");
    validate(r);return r;
}
} // namespace odygrade
