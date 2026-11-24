#include "adapter.hpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <map>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>
#include <commdlg.h>
namespace odygrade_adobe {
namespace {
constexpr std::size_t Limit=65536;
constexpr const char* Looks[]={"neutral","amber","nocturne","evergreen","rose","silver","coast","earth","cyan","velvet"};
constexpr double Ratios[]={0,1.33,1.85,2.39};
constexpr double Gauges[]={0,8,16,35,65};
constexpr const char* Stocks[]={"none","tungsten","daylight","portrait","chrome","consumer","print","mono","expired"};  // order of src/engine.js STOCKS
std::string text(PF_InData* in_data,PF_Handle h){
 if(!h)return {};
 const auto n=PF_GET_HANDLE_SIZE(h);
 if(n<1||n>Limit+1)throw std::invalid_argument("Invalid stored grade size");
 auto p=static_cast<const char*>(PF_LOCK_HANDLE(h));if(!p)throw std::bad_alloc();
 if(p[n-1]!=0){PF_UNLOCK_HANDLE(h);throw std::invalid_argument("Invalid stored grade terminator");}
 std::string value(p,n-1);PF_UNLOCK_HANDLE(h);return value;
}
PF_Handle make(PF_InData* in_data,const std::string& value){
 if(value.size()>Limit)throw std::invalid_argument("Grade exceeds 64 KB");
 auto h=PF_NEW_HANDLE(static_cast<A_HandleSize>(value.size()+1));if(!h)throw std::bad_alloc();
 auto p=PF_LOCK_HANDLE(h);if(!p){PF_DISPOSE_HANDLE(h);throw std::bad_alloc();}
 std::memcpy(p,value.c_str(),value.size()+1);PF_UNLOCK_HANDLE(h);return h;
}
void valid_text(const std::string& value){if(!value.empty())(void)odygrade::read_recipe(value);}
PF_Err arbitrary(PF_InData* in_data,PF_ArbParamsExtra* x){
 if(!x||x->id!=Stored)return PF_Err_INVALID_CALLBACK;
 auto& u=x->u;
 switch(x->which_function){
 case PF_Arbitrary_NEW_FUNC:*u.new_func_params.arbPH=make(in_data,"");break;
 case PF_Arbitrary_DISPOSE_FUNC:if(u.dispose_func_params.arbH)PF_DISPOSE_HANDLE(u.dispose_func_params.arbH);break;
 case PF_Arbitrary_COPY_FUNC:*u.copy_func_params.dst_arbPH=make(in_data,text(in_data,u.copy_func_params.src_arbH));break;
 case PF_Arbitrary_FLAT_SIZE_FUNC:*u.flat_size_func_params.flat_data_sizePLu=static_cast<A_u_long>(text(in_data,u.flat_size_func_params.arbH).size()+1);break;
 case PF_Arbitrary_FLATTEN_FUNC:{const auto s=text(in_data,u.flatten_func_params.arbH);if(u.flatten_func_params.buf_sizeLu<s.size()+1||!u.flatten_func_params.flat_dataPV)return PF_Err_BAD_CALLBACK_PARAM;std::memcpy(u.flatten_func_params.flat_dataPV,s.c_str(),s.size()+1);break;}
 case PF_Arbitrary_UNFLATTEN_FUNC:{auto& f=u.unflatten_func_params;if(f.buf_sizeLu<1||f.buf_sizeLu>Limit+1||!f.flat_dataPV)return PF_Err_BAD_CALLBACK_PARAM;const auto p=static_cast<const char*>(f.flat_dataPV);if(p[f.buf_sizeLu-1])return PF_Err_BAD_CALLBACK_PARAM;std::string s(p,f.buf_sizeLu-1);valid_text(s);*f.arbPH=make(in_data,s);break;}
 case PF_Arbitrary_INTERP_FUNC:*u.interp_func_params.interpPH=make(in_data,text(in_data,u.interp_func_params.tF<1?u.interp_func_params.left_arbH:u.interp_func_params.right_arbH));break;
 case PF_Arbitrary_COMPARE_FUNC:*u.compare_func_params.compareP=text(in_data,u.compare_func_params.a_arbH)==text(in_data,u.compare_func_params.b_arbH)?PF_ArbCompare_EQUAL:PF_ArbCompare_NOT_EQUAL;break;
 case PF_Arbitrary_PRINT_SIZE_FUNC:*u.print_size_func_params.print_sizePLu=static_cast<A_u_long>(text(in_data,u.print_size_func_params.arbH).size()+1);break;
 case PF_Arbitrary_PRINT_FUNC:{auto& f=u.print_func_params;const auto s=text(in_data,f.arbH);if(f.print_sizeLu<s.size()+1||!f.print_bufferPC)return PF_Err_BAD_CALLBACK_PARAM;std::memcpy(f.print_bufferPC,s.c_str(),s.size()+1);break;}
 case PF_Arbitrary_SCAN_FUNC:{auto& f=u.scan_func_params;if(f.bytes_to_scanLu>Limit+1||(!f.bufPC&&f.bytes_to_scanLu))return PF_Err_BAD_CALLBACK_PARAM;std::string s(f.bufPC?f.bufPC:"",f.bytes_to_scanLu);if(!s.empty()&&s.back()==0)s.pop_back();valid_text(s);*f.arbPH=make(in_data,s);break;}
 default:return PF_Err_INVALID_CALLBACK;
 }return PF_Err_NONE;
}
PF_Err setup(PF_InData* in_data,PF_OutData* out_data){
 PF_ParamDef def{};
 PF_ADD_BUTTON("Reference grade","Load native grade...",0,PF_ParamFlag_SUPERVISE,Load);
 AEFX_CLR_STRUCT(def);
 // AE 24.6 host rules found live: CANNOT_TIME_VARY|CANNOT_INTERP + PUI_INVISIBLE crashed
 // inside add_param; nonzero ui size without PF_OutFlag_CUSTOM_UI is rejected.
 PF_ADD_ARBITRARY2("Embedded reference grade",0,0,0,PF_PUI_NO_ECW_UI,make(in_data,""),Stored,nullptr);
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Look",10,1,"Neutral|Amber Hour|Nocturne|Evergreen|Rose Memory|Silver Screen|Coastal Blue|Earth and Ochre|Cyan District|Velvet Night",Look);
 struct Slider{const char* label;double lo,hi,initial;int id;};
 const Slider sliders[]={
 {"Match strength",0,100,100,Strength},{"Exposure trim",-4,4,0,Exposure},{"Temperature trim",-100,100,0,Temperature},{"Tint trim",-100,100,0,Tint},
 {"Contrast",50,180,100,Contrast},{"Saturation",0,200,100,Saturation},{"Skin hue protection",0,100,65,Skin},{"Faded black",0,20,0,Fade},{"Highlight softness",0,100,0,Shoulder},
 {"Grain",0,100,0,Grain},{"Bloom",0,100,0,Bloom},{"Halation",0,100,0,Halation},{"Vignette",0,100,0,Vignette},{"Bleach bypass",0,100,0,Bleach}};
 for(const auto& s:sliders){AEFX_CLR_STRUCT(def);PF_ADD_FLOAT_SLIDERX(s.label,s.lo,s.hi,s.lo,s.hi,s.initial,PF_Precision_HUNDREDTHS,0,0,s.id);}
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Frame ratio",4,1,"Original|1.33 Academy|1.85 Flat|2.39 Scope",Ratio);
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Alpha encoding",2,1,"Premultiplied|Straight",Alpha);
 // Panel apply sets this to a positive token; we embed pending/<token>.odyn and flip it
 // negative as the success acknowledgement the panel reads back.
 AEFX_CLR_STRUCT(def);def.flags=PF_ParamFlag_SUPERVISE;PF_ADD_SLIDER("Grade link",-30000,30000,-30000,30000,0,Link);
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Grain format",5,1,"Classic|8 mm|16 mm|35 mm|65 mm",GrainGauge);
 AEFX_CLR_STRUCT(def);PF_ADD_FLOAT_SLIDERX("Grain ISO",50,500,50,500,200,PF_Precision_INTEGER,0,0,GrainIso);
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Film format",7,1,"Off|Regular 8|Super 8|16 mm|Super 16|35 mm|IMAX",FilmFormat);
 const Slider format[]={{"Gate weave",0,100,0,Weave},{"Flicker",0,100,0,Flicker},{"Dust",0,100,0,Dust}};
 for(const auto& s:format){AEFX_CLR_STRUCT(def);PF_ADD_FLOAT_SLIDERX(s.label,s.lo,s.hi,s.lo,s.hi,s.initial,PF_Precision_HUNDREDTHS,0,0,s.id);}
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Perforations",2,1,"Off|On",Perfs);
 AEFX_CLR_STRUCT(def);PF_ADD_POPUP("Film stock",9,1,"None|Tungsten 500|Daylight 250|Portrait 400|Chrome 100|Consumer 200|Cinema Print|Mono 400|Expired",FilmStock);
 AEFX_CLR_STRUCT(def);PF_ADD_FLOAT_SLIDERX("Stock amount",0,100,0,100,100,PF_Precision_HUNDREDTHS,0,0,StockAmount);
 out_data->num_params=Count;return PF_Err_NONE;
}
struct PremierePixels {
 PF_InData* data;const PF_PixelFormatSuite1* suite{};
 explicit PremierePixels(PF_InData* d):data(d){
  if(d->appl_id==kAppID_Premiere&&d->pica_basicP->AcquireSuite(kPFPixelFormatSuite,kPFPixelFormatSuiteVersion1,reinterpret_cast<const void**>(&suite))!=kSPNoError)
   throw std::runtime_error("Premiere pixel format suite is unavailable");
 }
 ~PremierePixels(){if(suite)data->pica_basicP->ReleaseSuite(kPFPixelFormatSuite,kPFPixelFormatSuiteVersion1);}
 odygrade::PixelFormat format(PF_EffectWorld* w){
  if(!suite)return PF_WORLD_IS_DEEP(w)?odygrade::PixelFormat::ARGB16AE:odygrade::PixelFormat::ARGB8;
  PrPixelFormat f{};if(suite->GetPixelFormat(w,&f))throw std::runtime_error("Cannot read Premiere pixel format");
  if(f==PrPixelFormat_BGRA_4444_32f)return odygrade::PixelFormat::BGRA32F;
  if(f==PrPixelFormat_BGRA_4444_8u)return odygrade::PixelFormat::BGRA8;
  throw std::runtime_error("Unsupported Premiere pixel format");
 }
};
PF_Err global(PF_InData* in_data,PF_OutData* out_data){
 out_data->my_version=PF_VERSION(0,5,4,PF_Stage_RELEASE,0);
 out_data->out_flags=PF_OutFlag_DEEP_COLOR_AWARE|PF_OutFlag_NON_PARAM_VARY;
 // Multi-Frame Rendering: render only reads params and the arb handle; the shared pending
 // cache is mutex-guarded; no global or sequence data. Must match the PiPL OutFlags_2.
 out_data->out_flags2=PF_OutFlag2_SUPPORTS_THREADED_RENDERING;
 PremierePixels pixels(in_data);
 if(pixels.suite){auto err=pixels.suite->ClearSupportedPixelFormats(in_data->effect_ref);if(err)return err;
  err=pixels.suite->AddSupportedPixelFormat(in_data->effect_ref,PrPixelFormat_BGRA_4444_32f);if(err)return err;
  return pixels.suite->AddSupportedPixelFormat(in_data->effect_ref,PrPixelFormat_BGRA_4444_8u);}
 return PF_Err_NONE;
}
std::string read_grade(const std::filesystem::path& path){
 if(std::filesystem::file_size(path)>Limit)throw std::invalid_argument("Grade exceeds 64 KB");
 std::ifstream input(path,std::ios::binary);if(!input)throw std::runtime_error("Cannot open native grade");
 return std::string((std::istreambuf_iterator<char>(input)),{});
}
std::filesystem::path pending(int token){
 wchar_t* appdata=nullptr;std::size_t n=0;if(_wdupenv_s(&appdata,&n,L"APPDATA")||!appdata)return {};
 const auto path=std::filesystem::path(appdata)/L"OdyGrade"/L"pending"/(std::to_wstring(token)+L".odyn");std::free(appdata);
 return std::filesystem::is_regular_file(path)?path:std::filesystem::path{};
}
// Premiere sends no param callback for scripted values, so a positive "Grade link" token
// is resolved at render time. Panel never reuses a token, so cached files are immutable.
// ponytail: unbounded per-process cache (~1 KB/grade); add eviction if it ever matters.
std::string linked_grade(int token){
 static std::mutex m;static std::map<int,std::string> cache;
 std::lock_guard<std::mutex> lock(m);
 if(const auto it=cache.find(token);it!=cache.end())return it->second;
 const auto path=pending(token);if(path.empty())return {};
 auto grade=read_grade(path);(void)odygrade::read_recipe(grade);return cache[token]=std::move(grade);
}
double value(PF_ParamDef* p[],int id){const double v=p[id]->u.fs_d.value;if(!std::isfinite(v))throw std::invalid_argument("Nonfinite effect parameter");return v;}
PF_Err render(PF_InData* in_data,PF_ParamDef* p[],PF_LayerDef* output){
 if(!output||!p||!p[Input])return PF_Err_BAD_CALLBACK_PARAM;
 auto& input=p[Input]->u.ld;
 if(input.width!=output->width||input.height!=output->height)throw std::invalid_argument("Full-frame matching input/output required");
 if(in_data->field!=PF_Field_FRAME)throw std::invalid_argument("Progressive frames required; deinterlace before OdyGrade");
 if(input.width<1||input.height<1)return PF_Err_NONE;
 if(static_cast<std::uint64_t>(input.width)*input.height>40000000)throw std::invalid_argument("OdyGrade supports frames up to 40 megapixels");
 // MFR: frames rendering at once share the cores instead of each spawning one thread per core.
 static std::atomic<int> active{0};
 struct Active{Active(){odygrade::set_thread_limit(static_cast<int>(std::max(1u,std::thread::hardware_concurrency()/static_cast<unsigned>(++active))));}~Active(){--active;}} busy;
 const auto token=p[Link]->u.sd.value;auto encoded=token>0?linked_grade(token):std::string{};
 if(encoded.empty())encoded=text(in_data,p[Stored]->u.arb_d.value);
 auto base=encoded.empty()?odygrade::Recipe{}:odygrade::read_recipe(encoded);
 const auto look=p[Look]->u.pd.value-1,ratio=p[Ratio]->u.pd.value-1;
 if(look<0||look>=10||ratio<0||ratio>=4)throw std::invalid_argument("Invalid look or ratio");
 base.settings.look=Looks[look];base.settings.strength=value(p,Strength)/100;
 base.settings.contrast=value(p,Contrast)/100;base.settings.saturation=value(p,Saturation)/100;
 const auto stock=p[FilmStock]->u.pd.value-1;if(stock<0||stock>=9)throw std::invalid_argument("Invalid film stock");
 base.settings.stock=Stocks[stock];base.settings.stock_amount=value(p,StockAmount)/100;
 base.settings.preserve_skin=value(p,Skin)/100;base.settings.fade=value(p,Fade)/100;base.settings.shoulder=value(p,Shoulder)/100;
 base.film={};
 odygrade::Recipe finishing;
 finishing.settings.exposure=value(p,Exposure);finishing.settings.temperature=value(p,Temperature)/100;finishing.settings.tint=value(p,Tint)/100;
 finishing.film={value(p,Grain)/100,value(p,Bloom)/100,value(p,Halation)/100,value(p,Vignette)/100,value(p,Bleach)/100,Ratios[ratio]};
 const auto gauge=p[GrainGauge]->u.pd.value-1,format=p[FilmFormat]->u.pd.value-1,perfs=p[Perfs]->u.pd.value-1;
 if(gauge<0||gauge>=5||format<0||format>=7||perfs<0||perfs>1)throw std::invalid_argument("Invalid grain or film format");
 auto& f=finishing.film;f.gauge=Gauges[gauge];f.iso=value(p,GrainIso);f.format=format;
 f.weave=value(p,Weave)/100;f.flicker=value(p,Flicker)/100;f.dust=value(p,Dust)/100;f.perfs=perfs;
 odygrade::validate(base);odygrade::validate(finishing);
 PremierePixels pixels(in_data);const auto inputFormat=pixels.format(&input),outputFormat=pixels.format(output);
 const auto alpha=p[Alpha]->u.pd.value==1?odygrade::AlphaMode::Premultiplied:odygrade::AlphaMode::Straight;
 if(p[Alpha]->u.pd.value<1||p[Alpha]->u.pd.value>2)throw std::invalid_argument("Invalid alpha mode");
 odygrade::ConstFrame source{input.data,input.width,input.height,input.rowbytes,inputFormat,alpha};
 odygrade::Frame target{output->data,output->width,output->height,output->rowbytes,outputFormat,alpha};
 const auto frame=in_data->time_step?static_cast<std::int64_t>(std::floor(static_cast<double>(in_data->current_time)/std::abs(static_cast<double>(in_data->time_step)))):0;
 const double par=in_data->pixel_aspect_ratio.den?static_cast<double>(in_data->pixel_aspect_ratio.num)/in_data->pixel_aspect_ratio.den:1;
 // Grade, post-match trims and film in one pass (trims == the former second neutral pass).
 base.film=finishing.film;base.trim={finishing.settings.exposure,finishing.settings.temperature,finishing.settings.tint};
 odygrade::render(source,target,base,static_cast<std::uint64_t>(frame),par);
 return PF_ABORT(in_data)?PF_Interrupt_CANCEL:PF_Err_NONE;
}
PF_Err link(PF_InData* in_data,PF_OutData* out_data,PF_ParamDef* p[]){
 const auto token=p[Link]->u.sd.value;if(token<=0)return PF_Err_NONE;  // <=0: idle or acknowledged
 const auto path=pending(token);if(path.empty())return PF_Err_NONE;  // manual edit without a pending grade
 const auto err=set_snapshot(in_data,p,read_grade(path));if(err)return err;
 p[Link]->u.sd.value=-token;p[Link]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;
 out_data->out_flags|=PF_OutFlag_REFRESH_UI;return PF_Err_NONE;
}
PF_Err load(PF_InData* in_data,PF_OutData* out_data,PF_ParamDef* p[],PF_UserChangedParamExtra* x){
 if(x&&x->param_index==Link)return link(in_data,out_data,p);
 if(!x||x->param_index!=Load)return PF_Err_NONE;
 wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.lpstrFile=filename;dialog.nMaxFile=32768;
 dialog.lpstrFilter=L"OdyGrade native grade (*.odyn)\0*.odyn\0\0";dialog.Flags=OFN_FILEMUSTEXIST|OFN_PATHMUSTEXIST|OFN_NOCHANGEDIR;
 if(!GetOpenFileNameW(&dialog)){if(CommDlgExtendedError())throw std::runtime_error("Native grade dialog failed");return PF_Err_NONE;}
 const auto err=set_snapshot(in_data,p,read_grade(std::filesystem::path(filename)));
 if(!err){p[Link]->u.sd.value=0;p[Link]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;  // manual grade wins over a linked one
  out_data->out_flags|=PF_OutFlag_REFRESH_UI;std::snprintf(out_data->return_msg,sizeof(out_data->return_msg),"Reference grade embedded in this effect. Exposure/WB trims apply after matching.");}return err;
}
} // namespace
PF_Err set_snapshot(PF_InData* in_data,PF_ParamDef* p[],const std::string& snapshot){
 if(snapshot.size()>Limit)throw std::invalid_argument("Grade exceeds 64 KB");
 const auto recipe=odygrade::read_recipe(snapshot);
 auto h=p[Stored]->u.arb_d.value;
 if(!h){h=make(in_data,snapshot);}else{
  auto err=PF_RESIZE_HANDLE(static_cast<A_HandleSize>(snapshot.size()+1),&h);if(err)return err;
  auto dest=PF_LOCK_HANDLE(h);if(!dest)throw std::bad_alloc();std::memcpy(dest,snapshot.c_str(),snapshot.size()+1);PF_UNLOCK_HANDLE(h);
 }
 p[Stored]->u.arb_d.value=h;p[Stored]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;
 const auto change=[&](int id,double v){p[id]->u.fs_d.value=v;p[id]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;};
 const auto& s=recipe.settings;const auto& f=recipe.film;
 change(Strength,s.strength*100);change(Exposure,0);change(Temperature,0);change(Tint,0);change(Contrast,s.contrast*100);change(Saturation,s.saturation*100);
 change(Skin,s.preserve_skin*100);change(Fade,s.fade*100);change(Shoulder,s.shoulder*100);change(Grain,f.grain*100);change(Bloom,f.bloom*100);change(Halation,f.halation*100);change(Vignette,f.vignette*100);change(Bleach,f.bleach*100);
 p[Look]->u.pd.value=1;for(int i=0;i<10;++i)if(s.look==Looks[i])p[Look]->u.pd.value=static_cast<A_short>(i+1);
 p[Ratio]->u.pd.value=1;for(int i=0;i<4;++i)if(f.ratio==Ratios[i])p[Ratio]->u.pd.value=static_cast<A_short>(i+1);
 p[Look]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;p[Ratio]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;
 change(GrainIso,f.iso);change(Weave,f.weave*100);change(Flicker,f.flicker*100);change(Dust,f.dust*100);
 const auto popup=[&](int id,int index){p[id]->u.pd.value=static_cast<A_short>(index+1);p[id]->uu.change_flags|=PF_ChangeFlag_CHANGED_VALUE;};
 int gauge=0;for(int i=0;i<5;++i)if(f.gauge==Gauges[i])gauge=i;
 popup(GrainGauge,gauge);popup(FilmFormat,static_cast<int>(f.format));popup(Perfs,static_cast<int>(f.perfs));
 int stock=0;for(int i=0;i<9;++i)if(s.stock==Stocks[i])stock=i;
 popup(FilmStock,stock);change(StockAmount,s.stock_amount*100);
 return PF_Err_NONE;
}
} // namespace odygrade_adobe
extern "C" DllExport PF_Err PluginDataEntryFunction2(PF_PluginDataPtr ptr,PF_PluginDataCB2 callback,SPBasicSuite*,const char*,const char*){
 PF_Err result=PF_Err_INVALID_CALLBACK;
 PF_REGISTER_EFFECT_EXT2(ptr,callback,"OdyGrade","OdyWorks OdyGrade","OdyWorks",AE_RESERVED_INFO,"EffectMain","");
 return result;
}
extern "C" DllExport PF_Err EffectMain(PF_Cmd cmd,PF_InData* in_data,PF_OutData* out_data,PF_ParamDef* p[],PF_LayerDef* output,void* extra){
 try{using namespace odygrade_adobe;switch(cmd){
 case PF_Cmd_ABOUT:std::snprintf(out_data->return_msg,sizeof(out_data->return_msg),"OdyGrade 0.4 native development build. SDR reference grade and film. AE 8/16 bpc; Premiere BGRA 8/float. Host compatibility must be tested.");break;
 case PF_Cmd_GLOBAL_SETUP:return global(in_data,out_data);
 case PF_Cmd_PARAMS_SETUP:return setup(in_data,out_data);
 case PF_Cmd_RENDER:return render(in_data,p,output);
 case PF_Cmd_USER_CHANGED_PARAM:return load(in_data,out_data,p,static_cast<PF_UserChangedParamExtra*>(extra));
 case PF_Cmd_ARBITRARY_CALLBACK:return arbitrary(in_data,static_cast<PF_ArbParamsExtra*>(extra));
 default:break;
 }return PF_Err_NONE;
 }catch(const std::bad_alloc&){return PF_Err_OUT_OF_MEMORY;}
 catch(const std::exception& e){if(out_data){std::snprintf(out_data->return_msg,sizeof(out_data->return_msg),"OdyGrade: %s",e.what());out_data->out_flags|=PF_OutFlag_DISPLAY_ERROR_MESSAGE;}return PF_Err_INTERNAL_STRUCT_DAMAGED;}
 catch(...){return PF_Err_INTERNAL_STRUCT_DAMAGED;}
}
