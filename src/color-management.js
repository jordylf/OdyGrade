/* Explicit input transforms. See docs/COLOR-MANAGEMENT.md for manufacturer
 * references and the distinction between log decoding and our SDR display map. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports&&typeof window==='undefined'&&typeof importScripts==='undefined')module.exports=api;else root.OdyInput=api;
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function invert(m){
    var a=m[0],b=m[1],c=m[2],d=m[3],e=m[4],f=m[5],g=m[6],h=m[7],i=m[8];
    var out=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
    var det=a*out[0]+b*out[3]+c*out[6];
    if(Math.abs(det)<1e-12)throw Error('Singular color matrix');
    return out.map(function(x){return x/det;});
  }
  function vector(m,v){return [0,1,2].map(function(r){return m[r*3]*v[0]+m[r*3+1]*v[1]+m[r*3+2]*v[2];});}
  function multiply(a,b){var out=[];for(var r=0;r<3;r++)for(var c=0;c<3;c++)out.push(a[r*3]*b[c]+a[r*3+1]*b[c+3]+a[r*3+2]*b[c+6]);return out;}
  var WHITE=[0.3127,0.3290];
  var PRIMARIES={rec709:[[.64,.33],[.30,.60],[.15,.06]],
    sgamut3cine:[[.766,.275],[.225,.800],[.089,-.087]],vgamut:[[.730,.280],[.165,.840],[.100,-.030]],
    awg3:[[.684,.313],[.221,.848],[.0861,-.102]],cinemagamut:[[.74,.27],[.17,1.14],[.08,-.1]],
    rec2020:[[.708,.292],[.170,.797],[.131,.046]],dgamut:[[.71,.31],[.21,.88],[.09,-.08]],
    bmdwg:[[.7177215,.3171181],[.228041,.861569],[.1005841,-.0820452]]};
  function camera(name,transfer,gamut){return {name:name,transfer:transfer,scene:true,matrix:multiply(inverse709,rgbToXYZ(PRIMARIES[gamut]))};}
  function rgbToXYZ(primaries){
    var m=[0,0,0,0,0,0,0,0,0];
    primaries.forEach(function(p,c){m[c]=p[0]/p[1];m[3+c]=1;m[6+c]=(1-p[0]-p[1])/p[1];});
    var scale=vector(invert(m),[WHITE[0]/WHITE[1],1,(1-WHITE[0]-WHITE[1])/WHITE[1]]);
    return m.map(function(v,i){return v*scale[i%3];});
  }
  var inverse709=invert(rgbToXYZ(PRIMARIES.rec709)),identity=[1,0,0,0,1,0,0,0,1];
  var PROFILES={
    srgb:{name:'sRGB / already normalized',transfer:0,scene:false,matrix:identity},
    'rec709-gamma24':{name:'Rec.709 display / gamma 2.4',transfer:1,scene:false,matrix:identity},
    'sony-slog3-sgamut3cine':{name:'Sony S-Log3 / S-Gamut3.Cine',transfer:2,scene:true,matrix:multiply(inverse709,rgbToXYZ(PRIMARIES.sgamut3cine))},
    'panasonic-vlog-vgamut':{name:'Panasonic V-Log / V-Gamut',transfer:3,scene:true,matrix:multiply(inverse709,rgbToXYZ(PRIMARIES.vgamut))},
    'arri-logc3-awg3':camera('ARRI LogC3 (EI 800) / AWG3',4,'awg3'),
    'canon-clog3-cinemagamut':camera('Canon C-Log3 / Cinema Gamut',5,'cinemagamut'),
    'fujifilm-flog-fgamut':camera('Fujifilm F-Log / F-Gamut',6,'rec2020'),
    'dji-dlog-dgamut':camera('DJI D-Log / D-Gamut',7,'dgamut'),
    'apple-log-rec2020':camera('Apple Log / Rec.2020',8,'rec2020'),
    'blackmagic-film5-wg5':camera('Blackmagic Film Gen 5 / Wide Gamut Gen 5',9,'bmdwg'),
    'hlg-rec2020':camera('HLG / Rec.2020 (iPhone HDR video)',10,'rec2020'),
    'pq-rec2020':camera('PQ / Rec.2020 (HDR10, Premiere PQ sequence)',11,'rec2020')
  };
  function profile(id){if(!Object.prototype.hasOwnProperty.call(PROFILES,id))throw Error('Unsupported input profile');return PROFILES[id];}
  var HLG_A=.17883277,HLG_B=1-4*HLG_A,HLG_C=.5-HLG_A*Math.log(4*HLG_A);
  function hlg(x){return x<=.5?x*Math.abs(x)/3:(Math.exp((x-HLG_C)/HLG_A)+HLG_B)/12;}
  function hlgOETF(e){return e<=1/12?Math.sqrt(3*Math.max(0,e)):HLG_A*Math.log(12*e-HLG_B)+HLG_C;}
  // SMPTE ST 2084 (PQ), absolute cd/m2 / 10000. BT.2408 HDR reference white: 203 cd/m2 = SDR 1.0.
  var PQ_M1=2610/16384,PQ_M2=2523/4096*128,PQ_C1=3424/4096,PQ_C2=2413/4096*32,PQ_C3=2392/4096*32,REF_WHITE=203;
  function pq(x){var p=Math.pow(Math.max(0,x),1/PQ_M2);return Math.pow(Math.max(0,p-PQ_C1)/(PQ_C2-PQ_C3*p),1/PQ_M1);}
  function pqOETF(y){var p=Math.pow(Math.max(0,y),PQ_M1);return Math.pow((PQ_C1+PQ_C2*p)/(1+PQ_C3*p),PQ_M2);}
  function decode(x,transfer){
    if(transfer===0)return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
    if(transfer===1)return Math.pow(Math.max(0,x),2.4);
    if(transfer===2)return x>=171.2102946929/1023?Math.pow(10,(x*1023-420)/261.5)*.19-.01:(x*1023-95)*.01125/(171.2102946929-95);
    if(transfer===3)return x<.181?(x-.125)/5.6:Math.pow(10,(x-.598206)/.241514)-.00873;
    // ARRI LogC3, EI 800, SUP 3.x, linear scene exposure factor.
    if(transfer===4)return x>.149658?(Math.pow(10,(x-.385537)/.24719)-.052272)/5.555556:(x-.092809)/5.367655;
    // Canon C-Log3 (v1.2 formula, normalized full code value) to scene reflection (x0.9).
    if(transfer===5)return .9*(x<.097465473?-(Math.pow(10,(.12783901-x)/.36726845)-1)/14.98325:
      x<=.15277891?(x-.12512219)/1.9754798:(Math.pow(10,(x-.12240537)/.36726845)-1)/14.98325);
    if(transfer===6)return x<.100537775223865?(x-.092864)/8.735631:Math.pow(10,(x-.790453)/.344676)/.555556-.009468/.555556;  // Fujifilm F-Log
    if(transfer===7)return x<=.14?(x-.0929)/6.025:(Math.pow(10,3.89616*x-2.27752)-.0108)/.9892;  // DJI D-Log
    if(transfer===8){var pt=47.28711236*Math.pow(.01+.05641088,2);  // Apple Log
      return x>=pt?Math.pow(2,(x-.69336945)/.08550479)-.00964052:x>=0?Math.sqrt(x/47.28711236)-.05641088:-.05641088;}
    if(transfer===9)return x<8.283605932402494*.005+.09246575342465753?(x-.09246575342465753)/8.283605932402494:  // Blackmagic Film Gen 5
      Math.exp((x-.5300133392291939)/.08692876065491224)-.005494072432257808;
    if(transfer===10)return hlg(x)/hlg(.75);  // BT.2100 HLG inverse OETF; BT.2408 diffuse white (75%) = 1.0
    if(transfer===11)return pq(x)*10000/REF_WHITE;  // PQ EOTF; 203 cd/m2 = 1.0
    throw Error('Unsupported transfer function');
  }
  function encodeSRGB(x){return x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;}
  // A project-owned display rendering, not Sony LC-709, Panasonic V-709 or ACES.
  // Preserve mids; compress peak RGB above 0.8 and scale all channels together (keeps hue and
  // avoids independent-channel clipping errors in an interpolated LUT). Then fade toward white
  // at that peak value as the scene peak goes from 1x to 4x: without it, a clipped sky's
  // brightness followed its tint and noisy LOG skies turned into blotches (2026-11-24).
  // Negative out-of-gamut RGB is clipped first so the fade has no kink inside a LUT cell.
  // Mirrored by normalize_input in native/src/core.cpp.
  function displayMap(x){x=Math.max(0,x);return x<=.8?x:.8+.2*(1-Math.exp(-(x-.8)/.2));}
  function smooth(a,b,x){var t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
  function sceneToDisplay(c){
    c=c.map(function(x){return Math.max(0,x);});
    var peak=Math.max(c[0],c[1],c[2]),d=displayMap(peak),s=peak>.8?d/peak:1,w=smooth(0,2,Math.log(Math.max(peak,1e-6))/Math.LN2);
    return c.map(function(x){return d+(x*s-d)*(1-w);});
  }
  // HDR delivery (Rec.2100). The grade itself stays SDR; at the very end SDR white goes to BT.2408
  // reference white (HLG 75%, PQ 203 cd/m2) in Rec.2020 primaries. With expand (scene sources:
  // LOG/HLG/PQ) the peak range 0.8..1 that displayMap compressed is undone exactly, up to a 1000 cd/m2
  // peak (HLG: signal 1.0). 8-bit hosts quantize near white, so HDR wants 32-bit rendering. Mirrored by encode_output in core.cpp.
  var OUTPUTS=['sdr','hlg','pq'];
  // BT.2087 Rec.709 -> Rec.2020 linear RGB.
  var TO2020=[.627403896,.329283039,.043313065,.069097289,.919540395,.011362316,.016391439,.088013308,.895595253];
  function encodeOutput(rgb,output,expand){
    if(output==='sdr')return rgb.slice();
    if(OUTPUTS.indexOf(output)<0)throw Error('Unsupported output');
    var c=rgb.map(function(x){x=Math.max(0,Math.min(1,x));return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);});
    var cap=output==='hlg'?1/hlg(.75):1000/REF_WHITE,peak=Math.max(c[0],c[1],c[2]);
    // Exact inverse of displayMap (a neutral HDR->HDR grade keeps diffuse white), capped at the peak.
    if(expand&&peak>.8){var k=(peak<1?Math.min(cap,.8-.2*Math.log(1-(peak-.8)/.2)):cap)/peak;c=c.map(function(x){return x*k;});}
    return vector(TO2020,c).map(function(x){
      x=Math.max(0,x);return Math.min(1,output==='hlg'?hlgOETF(Math.min(1,x*hlg(.75))):pqOETF(x*REF_WHITE/10000));});
  }
  function toLinear709(rgb,id){var p=profile(id);return vector(p.matrix,rgb.map(function(x){return decode(x,p.transfer);}));}
  function create(id){
    var p=profile(id);
    if(id==='srgb')return function(rgb){return rgb.slice();};
    return function(rgb){
      var linear=vector(p.matrix,rgb.map(function(x){return decode(x,p.transfer);}));
      if(p.scene)linear=sceneToDisplay(linear);
      return linear.map(function(x){return Math.max(0,Math.min(1,encodeSRGB(x)));});
    };
  }
  return {PROFILES:PROFILES,profile:profile,create:create,toLinear709:toLinear709,decode:decode,
    encodeSRGB:encodeSRGB,displayMap:displayMap,rgbToXYZ:rgbToXYZ,OUTPUTS:OUTPUTS,encodeOutput:encodeOutput,TO2020:TO2020};
});
