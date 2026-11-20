// SDK callback harness. Uses actual Adobe structures with simulated host services;
// this proves adapter contracts, not live Adobe loading/rendering.
#include "adapter.hpp"
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <filesystem>
#include <iostream>
#include <map>
#include <stdexcept>
#include <vector>
using namespace odygrade_adobe;
namespace {
std::map<PF_Handle,std::size_t> handles;
PF_ParamDef params[Count]{};int nextParam=1;bool cancelled=false;
void require(bool ok,const char* message){if(!ok)throw std::runtime_error(message);}
PF_Handle allocate(A_u_longlong n){auto h=static_cast<PF_Handle>(std::malloc(sizeof(void*)));if(!h)return nullptr;*h=std::calloc(1,static_cast<std::size_t>(n));if(!*h){std::free(h);return nullptr;}handles[h]=static_cast<std::size_t>(n);return h;}
void dispose(PF_Handle h){if(!h)return;require(handles.count(h)!=0,"dispose unknown handle");std::free(*h);std::free(h);handles.erase(h);}
void* lock(PF_Handle h){return h?*h:nullptr;}
void unlock(PF_Handle){}
A_u_longlong size(PF_Handle h){return handles.at(h);}
PF_Err resize(A_u_longlong n,PF_Handle* h){auto p=std::realloc(**h,static_cast<std::size_t>(n));if(!p)return PF_Err_OUT_OF_MEMORY;**h=p;handles[*h]=static_cast<std::size_t>(n);return PF_Err_NONE;}
PF_Err add(PF_ProgPtr,PF_ParamIndex,PF_ParamDef* def){require(nextParam<Count,"too many params");params[nextParam]=*def;if(def->param_type==PF_Param_ARBITRARY_DATA){auto h=allocate(size(def->u.arb_d.dephault));std::memcpy(*h,*def->u.arb_d.dephault,static_cast<std::size_t>(size(h)));params[nextParam].u.arb_d.value=h;}++nextParam;return PF_Err_NONE;}
PF_Err abortRender(PF_ProgPtr){return cancelled?PF_Interrupt_CANCEL:PF_Err_NONE;}
}
int main(int argc,char** argv){
 try{
  require(argc==2,"supply a native snapshot fixture");
  PF_UtilCallbacks utils{};utils.host_new_handle=allocate;utils.host_dispose_handle=dispose;utils.host_lock_handle=lock;utils.host_unlock_handle=unlock;utils.host_get_handle_size=size;utils.host_resize_handle=resize;
  PF_InData in{};in.utils=&utils;in.inter.add_param=add;in.inter.abort=abortRender;in.appl_id=kAppID_AfterEffects;in.pixel_aspect_ratio.num=1;in.pixel_aspect_ratio.den=1;in.time_step=1;in.time_scale=12;in.field=PF_Field_FRAME;
  PF_OutData out{};PF_ParamDef* p[Count];for(int i=0;i<Count;++i)p[i]=&params[i];
  require(EffectMain(PF_Cmd_GLOBAL_SETUP,&in,&out,p,nullptr,nullptr)==0,"global setup");require(out.out_flags==(PF_OutFlag_DEEP_COLOR_AWARE|PF_OutFlag_NON_PARAM_VARY),"global flags");
  require(EffectMain(PF_Cmd_PARAMS_SETUP,&in,&out,p,nullptr,nullptr)==0&&out.num_params==Count&&nextParam==Count,"parameter setup");
  const int w=24,h=16;std::vector<PF_Pixel8> source(w*h),dest(w*h),expected(w*h);
  for(int i=0;i<w*h;++i)source[i]={255,static_cast<A_u_char>(30+i%180),static_cast<A_u_char>(40+i%160),static_cast<A_u_char>(50+i%140)};
  params[Input].u.ld.width=w;params[Input].u.ld.height=h;params[Input].u.ld.rowbytes=w*4;params[Input].u.ld.data=reinterpret_cast<PF_PixelPtr>(source.data());
  PF_LayerDef world=params[Input].u.ld;world.data=reinterpret_cast<PF_PixelPtr>(dest.data());
  require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"8-bit native callback");
  for(std::size_t i=0;i<source.size()*4;++i)require(std::abs(reinterpret_cast<unsigned char*>(source.data())[i]-reinterpret_cast<unsigned char*>(dest.data())[i])<=1,"neutral callback identity");
  params[Look].u.pd.value=2;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"look callback");
  odygrade::Recipe r;r.settings.look="amber";
  odygrade::render({source.data(),w,h,w*4,odygrade::PixelFormat::ARGB8,odygrade::AlphaMode::Premultiplied},{expected.data(),w,h,w*4,odygrade::PixelFormat::ARGB8,odygrade::AlphaMode::Premultiplied},r);
  for(std::size_t i=0;i<dest.size()*4;++i)require(std::abs(reinterpret_cast<unsigned char*>(expected.data())[i]-reinterpret_cast<unsigned char*>(dest.data())[i])<=1,"look callback differential");
  {// Appended grain/format params reach the core and default back to identical output.
   const auto lookOnly=dest;params[GrainGauge].u.pd.value=3;params[Grain].u.fs_d.value=50;params[GrainIso].u.fs_d.value=400;
   params[FilmFormat].u.pd.value=2;params[Weave].u.fs_d.value=100;params[Flicker].u.fs_d.value=100;params[Dust].u.fs_d.value=100;params[Perfs].u.pd.value=2;
   require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(lookOnly.data(),dest.data(),dest.size()*4)!=0,"grain/format params must render");
   params[FilmFormat].u.pd.value=8;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)!=0,"out-of-range film format must fail");
   params[GrainGauge].u.pd.value=1;params[Grain].u.fs_d.value=0;params[GrainIso].u.fs_d.value=200;params[FilmFormat].u.pd.value=1;
   params[Weave].u.fs_d.value=params[Flicker].u.fs_d.value=params[Dust].u.fs_d.value=0;params[Perfs].u.pd.value=1;
   require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(lookOnly.data(),dest.data(),dest.size()*4)==0,"film format off restores output");}
  {// Film stock param reaches the core colour path (matches a direct core render) and None restores output.
   const auto lookOnly=dest;params[FilmStock].u.pd.value=5;params[StockAmount].u.fs_d.value=70;
   require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"stock callback");
   odygrade::Recipe sr;sr.settings.look="amber";sr.settings.stock="chrome";sr.settings.stock_amount=.7;
   odygrade::render({source.data(),w,h,w*4,odygrade::PixelFormat::ARGB8,odygrade::AlphaMode::Premultiplied},{expected.data(),w,h,w*4,odygrade::PixelFormat::ARGB8,odygrade::AlphaMode::Premultiplied},sr);
   for(std::size_t i=0;i<dest.size()*4;++i)require(std::abs(reinterpret_cast<unsigned char*>(expected.data())[i]-reinterpret_cast<unsigned char*>(dest.data())[i])<=1,"stock callback differential");
   require(std::memcmp(lookOnly.data(),dest.data(),dest.size()*4)!=0,"stock must change output");
   params[FilmStock].u.pd.value=10;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)!=0,"out-of-range stock must fail");
   params[FilmStock].u.pd.value=1;params[StockAmount].u.fs_d.value=100;
   require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(lookOnly.data(),dest.data(),dest.size()*4)==0,"stock none restores output");}
  std::ifstream file(std::filesystem::u8path(argv[1]),std::ios::binary);const std::string snapshot((std::istreambuf_iterator<char>(file)),{});require(!snapshot.empty(),"fixture missing");
  require(set_snapshot(&in,p,snapshot)==0,"load snapshot");
  PF_ArbParamsExtra arb{};arb.id=Stored;arb.which_function=PF_Arbitrary_FLAT_SIZE_FUNC;A_u_long flatSize{};arb.u.flat_size_func_params={nullptr,params[Stored].u.arb_d.value,&flatSize};
  require(EffectMain(PF_Cmd_ARBITRARY_CALLBACK,&in,&out,p,nullptr,&arb)==0&&flatSize==snapshot.size()+1,"flat size");
  std::vector<char> flat(flatSize);arb.which_function=PF_Arbitrary_FLATTEN_FUNC;arb.u.flatten_func_params={nullptr,params[Stored].u.arb_d.value,flatSize,flat.data()};require(EffectMain(PF_Cmd_ARBITRARY_CALLBACK,&in,&out,p,nullptr,&arb)==0,"flatten");
  PF_Handle restored{};arb.which_function=PF_Arbitrary_UNFLATTEN_FUNC;arb.u.unflatten_func_params={nullptr,flatSize,flat.data(),&restored};require(EffectMain(PF_Cmd_ARBITRARY_CALLBACK,&in,&out,p,nullptr,&arb)==0,"unflatten");require(std::string(static_cast<char*>(*restored))==snapshot,"embedded model must survive project serialization");
  require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"stored reference callback render");
  auto original=dest;params[Exposure].u.fs_d.value=.5;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"post-match trim must not invalidate fitted model");require(std::memcmp(original.data(),dest.data(),dest.size()*4)!=0,"trim must affect pixels");
  flat.back()='X';arb.u.unflatten_func_params.arbPH=&restored;require(EffectMain(PF_Cmd_ARBITRARY_CALLBACK,&in,&out,p,nullptr,&arb)!=0,"corrupt flattened model must fail");
  {// Panel auto-embed: positive "Grade link" token loads %APPDATA%/OdyGrade/pending/<token>.odyn, acks with -token.
   const auto appdata=std::filesystem::temp_directory_path()/"odygrade-harness-appdata";std::filesystem::create_directories(appdata/"OdyGrade"/"pending");
   {std::ofstream(appdata/"OdyGrade"/"pending"/"123.odyn",std::ios::binary)<<snapshot;}
   require(_wputenv_s(L"APPDATA",appdata.wstring().c_str())==0,"set APPDATA");
   PF_UserChangedParamExtra changed{};changed.param_index=Link;params[Exposure].u.fs_d.value=.5;
   params[Link].u.sd.value=124;require(EffectMain(PF_Cmd_USER_CHANGED_PARAM,&in,&out,p,nullptr,&changed)==0&&params[Link].u.sd.value==124,"missing pending grade is a no-op");
   params[Link].u.sd.value=123;require(EffectMain(PF_Cmd_USER_CHANGED_PARAM,&in,&out,p,nullptr,&changed)==0,"link embed");
   require(params[Link].u.sd.value==-123&&params[Exposure].u.fs_d.value==0,"link must embed and acknowledge");
   require(std::string(static_cast<char*>(*params[Stored].u.arb_d.value))==snapshot,"linked snapshot stored");
   // Premiere path: no callback ran, store empty, positive token -> render resolves the pending grade.
   require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"embedded render");const auto embedded=dest;
   const auto stored=params[Stored].u.arb_d.value,empty=allocate(1);params[Stored].u.arb_d.value=empty;
   params[Link].u.sd.value=0;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(embedded.data(),dest.data(),dest.size()*4)!=0,"empty store renders params only");
   params[Link].u.sd.value=123;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(embedded.data(),dest.data(),dest.size()*4)==0,"render-time link must match embedded grade");
   params[Link].u.sd.value=124;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0&&std::memcmp(embedded.data(),dest.data(),dest.size()*4)!=0,"unknown token falls back to store");
   params[Stored].u.arb_d.value=stored;dispose(empty);params[Link].u.sd.value=0;
   std::filesystem::remove_all(appdata);}
  cancelled=true;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==PF_Interrupt_CANCEL,"host abort propagation");cancelled=false;
  std::vector<PF_Pixel16> deep(w*h),deepOut(w*h);for(int i=0;i<w*h;++i)deep[i]={32768,8000,16000,24000};
  params[Input].u.ld.data=reinterpret_cast<PF_PixelPtr>(deep.data());params[Input].u.ld.rowbytes=w*8;params[Input].u.ld.world_flags=PF_WorldFlag_DEEP;
  world=params[Input].u.ld;world.data=reinterpret_cast<PF_PixelPtr>(deepOut.data());require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)==0,"16-bit AE callback");require(deepOut[0].alpha==32768,"AE white/alpha normalization");
  in.field=PF_Field_UPPER;require(EffectMain(PF_Cmd_RENDER,&in,&out,p,&world,nullptr)!=0,"interlace must fail visibly");
  while(!handles.empty())dispose(handles.begin()->first);
  std::cout<<"PASS actual-SDK adapter: setup, 8/16-bit rendering, reference persistence, post-match trim, invalid data and host abort\n";return 0;
 }catch(const std::exception& e){std::cerr<<"FAIL "<<e.what()<<'\n';while(!handles.empty())dispose(handles.begin()->first);return 1;}
}
