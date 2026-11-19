#pragma once
#define PF_DEEP_COLOR_AWARE 1
#define NOMINMAX
#include "AEConfig.h"
#include <Windows.h>
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_Macros.h"
#include "Param_Utils.h"
#include "AE_EffectCBSuites.h"
#include "SPBasic.h"
#include "PrSDKAESupport.h"
#include "odygrade/core.hpp"
namespace odygrade_adobe {
enum Param { Input, Load, Stored, Look, Strength, Exposure, Temperature, Tint,
 Contrast, Saturation, Skin, Fade, Shoulder, Grain, Bloom, Halation, Vignette, Bleach, Ratio, Alpha, Link, Count };
PF_Err set_snapshot(PF_InData*, PF_ParamDef*[], const std::string&);
}
extern "C" DllExport PF_Err EffectMain(PF_Cmd,PF_InData*,PF_OutData*,PF_ParamDef*[],PF_LayerDef*,void*);
