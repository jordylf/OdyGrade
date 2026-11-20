/* OdyGrade color engine. Explicit source profiles normalize into sRGB / SDR.
 * No per-frame re-analysis: a fitted match is immutable until the user refits it.
 * UMD deliberately supports CEP 11's Chromium and dependency-free Node tests. */
(function(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require('./color-management.js'));
  else root.OdyColor = factory(root.OdyInput);
})(typeof window !== "undefined" ? window : this, function(CM) {
  "use strict";
  var VERSION = 2;
  var DEFAULTS = {strength:1, exposure:0, temperature:0, tint:0, contrast:1,
    saturation:1, preserveSkin:0.65, fade:0, shoulder:0, look:"neutral", inputProfile:"srgb", stock:"none", stockAmount:1};
  var LOOKS = {
    neutral:{name:"Neutral",shadow:[0,0],highlight:[0,0],sat:1,contrast:1},
    amber:{name:"Amber Hour",shadow:[-0.006,-0.009],highlight:[0.012,0.027],sat:0.95,contrast:1.06},
    nocturne:{name:"Nocturne",shadow:[-0.012,-0.025],highlight:[0.007,0.008],sat:0.8,contrast:1.12},
    evergreen:{name:"Evergreen",shadow:[-0.018,0.009],highlight:[0.005,0.017],sat:0.84,contrast:1.04},
    rose:{name:"Rose Memory",shadow:[0.012,-0.008],highlight:[0.018,0.011],sat:0.86,contrast:0.94},
    silver:{name:"Silver Screen",shadow:[0,-0.005],highlight:[0,0.006],sat:0.12,contrast:1.14},
    coast:{name:"Coastal Blue",shadow:[-0.014,-0.017],highlight:[0.008,0.020],sat:1.03,contrast:1.05},
    earth:{name:"Earth & Ochre",shadow:[0.005,0.013],highlight:[0.009,0.025],sat:0.73,contrast:1.08},
    cyan:{name:"Cyan District",shadow:[-0.023,-0.019],highlight:[0.018,0.020],sat:0.9,contrast:1.14},
    velvet:{name:"Velvet Night",shadow:[0.014,-0.018],highlight:[0.012,0.012],sat:0.85,contrast:1.08}
  };
  // Film stock emulation (own design; names are generic, not any manufacturer's product).
  // curve [S-curve gamma, black level, white level] on OKLab L; sat [mid, shadow, highlight];
  // shadow/highlight a,b split tone; hue = rotation (rad) of warm, green and blue hue bands.
  var STOCKS = {
    none:{name:"None",curve:[1,0,1],sat:[1,1,1],shadow:[0,0],highlight:[0,0],hue:[0,0,0]},
    tungsten:{name:"Tungsten 500",curve:[1.08,0.12,0.97],sat:[0.92,0.8,0.85],shadow:[-0.012,-0.012],highlight:[0.006,0.014],hue:[0.05,0.18,-0.05]},
    daylight:{name:"Daylight 250",curve:[1.05,0.08,0.98],sat:[1,0.9,0.9],shadow:[-0.004,-0.006],highlight:[0.004,0.01],hue:[0.03,0.08,0]},
    portrait:{name:"Portrait 400",curve:[0.9,0.14,0.96],sat:[0.85,0.85,0.75],shadow:[-0.004,-0.008],highlight:[0.008,0.012],hue:[-0.04,0.22,0.05]},
    chrome:{name:"Chrome 100",curve:[1.3,0,1],sat:[1.2,1.05,0.95],shadow:[0.004,-0.014],highlight:[0,0.006],hue:[-0.05,-0.06,0.08]},
    consumer:{name:"Consumer 200",curve:[1.12,0.07,0.97],sat:[1.08,0.9,0.9],shadow:[-0.01,0.004],highlight:[0.006,0.02],hue:[0.08,-0.1,0]},
    print:{name:"Cinema Print",curve:[1.22,0.04,0.95],sat:[0.9,0.7,0.8],shadow:[-0.016,-0.018],highlight:[0.012,0.022],hue:[0,0.15,-0.06]},
    mono:{name:"Mono 400",curve:[1.15,0.08,0.98],sat:[0,1,1],shadow:[0,0],highlight:[0,0],hue:[0,0,0]},
    expired:{name:"Expired",curve:[0.85,0.2,0.92],sat:[0.78,0.9,0.8],shadow:[0.01,-0.01],highlight:[0.014,0.03],hue:[0.06,0.12,0.1]}
  };
  var HUE_BANDS=[0.9,2.5,-1.7];  // OKLab hue centres: warm/skin, green, blue
  function stock(c,k,amount){
    if(amount<=0||k===STOCKS.none)return c;
    var L=clamp(c[0]),g=k.curve[0],p=Math.pow(L,g),y=p/(p+Math.pow(1-L,g));
    var l=k.curve[1]+(k.curve[2]-k.curve[1])*y;
    var sat=k.sat[0]*mix(k.sat[1],1,smooth(0,0.35,L))*mix(1,k.sat[2],smooth(0.7,1,L));
    var a=c[1]*sat,b=c[2]*sat,ch=Math.hypot(a,b);
    if(ch>1e-6){
      var h=Math.atan2(b,a),rot=0;
      for(var i=0;i<3;i++){var d=h-HUE_BANDS[i];d-=2*Math.PI*Math.round(d/(2*Math.PI));rot+=k.hue[i]*Math.exp(-(d/0.6)*(d/0.6));}
      rot*=smooth(0.01,0.05,ch);var cs=Math.cos(rot),sn=Math.sin(rot),a0=a;a=a0*cs-b*sn;b=a0*sn+b*cs;
    }
    var t=smooth(0.15,0.85,l);a+=mix(k.shadow[0],k.highlight[0],t);b+=mix(k.shadow[1],k.highlight[1],t);
    return [mix(c[0],l,amount),mix(c[1],a,amount),mix(c[2],b,amount)];
  }
  function clamp(x,lo,hi){return Math.max(lo === undefined ? 0:lo,Math.min(hi === undefined ? 1:hi,x));}
  function mix(a,b,t){return a+(b-a)*t;}
  function smooth(a,b,x){var t=clamp((x-a)/(b-a));return t*t*(3-2*t);}
  function decode(x){return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);}
  function encode(x){return x<=0.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-0.055;}
  function toLab(rgb){
    var r=decode(rgb[0]),g=decode(rgb[1]),b=decode(rgb[2]);
    var l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
    var m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
    var s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
    return [0.2104542553*l+0.793617785*m-0.0040720468*s,
      1.9779984951*l-2.428592205*m+0.4505937099*s,
      0.0259040371*l+0.7827717662*m-0.808675766*s];
  }
  function fromLab(c){
    var l=Math.pow(c[0]+0.3963377774*c[1]+0.2158037573*c[2],3);
    var m=Math.pow(c[0]-0.1055613458*c[1]-0.0638541728*c[2],3);
    var s=Math.pow(c[0]-0.0894841775*c[1]-1.291485548*c[2],3);
    return [encode(4.0767416621*l-3.3077115913*m+0.2309699292*s),
      encode(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
      encode(-0.0041960863*l-0.7034186147*m+1.707614701*s)];
  }
  function settings(input){
    var o=Object.assign({},DEFAULTS),ranges={strength:[0,1],exposure:[-4,4],
      temperature:[-1,1],tint:[-1,1],contrast:[0.5,1.8],saturation:[0,2],
      preserveSkin:[0,1],fade:[0,0.2],shoulder:[0,1],stockAmount:[0,1]};
    Object.keys(DEFAULTS).forEach(function(k){if(input&&Object.prototype.hasOwnProperty.call(input,k))o[k]=input[k];});
    Object.keys(ranges).forEach(function(k){
      if(typeof o[k]!=="number"||!Number.isFinite(o[k])) throw Error("Invalid setting: "+k);
      o[k]=clamp(o[k],ranges[k][0],ranges[k][1]);
    });
    if(!Object.prototype.hasOwnProperty.call(LOOKS,o.look)) throw Error("Unknown look");
    if(!Object.prototype.hasOwnProperty.call(STOCKS,o.stock)) throw Error("Unknown film stock");
    CM.profile(o.inputProfile);
    return o;
  }
  function correct(rgb,o){
    var gain=Math.pow(2,o.exposure);
    return [encode(decode(rgb[0])*gain*Math.pow(2,o.temperature*0.35+o.tint*0.12)),
      encode(decode(rgb[1])*gain*Math.pow(2,-o.tint*0.24)),
      encode(decode(rgb[2])*gain*Math.pow(2,-o.temperature*0.35+o.tint*0.12))];
  }
  function validateImage(image){
    if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||
      image.width<1||image.height<1||image.width*image.height>40000000||
      !image.data||image.data.length!==image.width*image.height*4) throw Error("Invalid RGBA image");
  }
  function samplesFor(image,o,budget){
    validateImage(image);
    var normalize=CM.create(o?o.inputProfile:'srgb');
    var samples=[], step=Math.max(1,Math.ceil(image.width*image.height/budget));
    for(var i=0;i<image.width*image.height;i+=step){
      var p=i*4,d=image.data;
      if(d[p+3]<128)continue;
      var rgb=[d[p]/255,d[p+1]/255,d[p+2]/255];
      rgb=normalize(rgb);
      // Exclude matte/below-black samples in the normalized domain: log black
      // lives above code zero and must not skew the source/reference statistics.
      if(Math.max(rgb[0],rgb[1],rgb[2])<4/255)continue;
      samples.push(toLab(o?correct(rgb,o):rgb));
    }
    if(samples.length<16) throw Error("Image needs at least 16 nontransparent, nonblack pixels");
    return samples;
  }
  function summarize(samples){
    var lum=samples.map(function(c){return c[0];}).sort(function(a,b){return a-b;});
    var qs=[0,0.05,0.15,0.3,0.5,0.7,0.85,0.95,1].map(function(q){return lum[Math.floor(q*(lum.length-1))];});
    var zones=[{n:0,a:0,b:0,aa:0,bb:0},{n:0,a:0,b:0,aa:0,bb:0},{n:0,a:0,b:0,aa:0,bb:0}];
    // Tonal ranks separate palette from scene brightness.
    samples.forEach(function(c){
      var z=zones[c[0]<qs[3]?0:c[0]>qs[5]?2:1];
      z.n++;z.a+=c[1];z.b+=c[2];z.aa+=c[1]*c[1];z.bb+=c[2]*c[2];
    });
    var all={n:samples.length,a:0,b:0,aa:0,bb:0};
    zones.forEach(function(z){["a","b","aa","bb"].forEach(function(k){all[k]+=z[k];});});
    function finish(z){
      return {a:z.a/z.n,b:z.b/z.n,sa:Math.sqrt(Math.max(0,z.aa/z.n-Math.pow(z.a/z.n,2))),
        sb:Math.sqrt(Math.max(0,z.bb/z.n-Math.pow(z.b/z.n,2)))};
    }
    // Chroma tail (p90, p99): zone std devs follow the bulk, so a muted reference
    // still left the most saturated source colours vivid. See createTransform.
    var ch=samples.map(function(c){return Math.hypot(c[1],c[2]);}).sort(function(a,b){return a-b;});
    var cq=[0.9,0.99].map(function(p){return ch[Math.min(ch.length-1,Math.floor(p*ch.length))];});
    return {quantiles:qs,zones:zones.map(function(z){return finish(z.n>=8?z:all);}),chroma:cq,count:samples.length};
  }
  function distribution(image,o){return summarize(samplesFor(image,o,60000));}
  function fitDistributions(a,b,o){
    return {version:VERSION,inputSpace:"srgb",inputProfile:o.inputProfile,source:a,reference:b,
      correction:{exposure:o.exposure,temperature:o.temperature,tint:o.tint},
      warnings:(a.quantiles[7]-a.quantiles[1]<0.12?["Source has little tonal variation; matching may be unreliable."]:[])
        .concat(b.quantiles[7]-b.quantiles[1]<0.12?["Reference has little tonal variation; matching may be unreliable."]:[])};
  }
  function fit(source,reference,options){
    var o=settings(options);
    return fitDistributions(distribution(source,o),distribution(reference),o);
  }
  // Equal candidate-pixel budgets per sampled frame; alpha/matte rejection still
  // applies. This pools one shot once, not a model that follows every frame.
  function shotStatistics(frames,o){
    if(!Array.isArray(frames)||frames.length<1||frames.length>32)throw Error("Shot needs 1 to 32 sampled frames");
    var samples=[],medians=[],budget=Math.floor(60000/frames.length);
    frames.forEach(function(frame){
      var current=samplesFor(frame,o,budget);
      medians.push(summarize(current).quantiles[4]);
      samples=samples.concat(current);
    });
    return {distribution:summarize(samples),spread:Math.max.apply(null,medians)-Math.min.apply(null,medians)};
  }
  function fitFrames(frames,reference,options){
    var o=settings(options),shot=shotStatistics(frames,o);
    var model=fitDistributions(shot.distribution,distribution(reference),o);
    if(shot.spread>.25)
      model.warnings.push("Sampled frame brightness varies substantially. Check the shot range for cuts or lighting changes.");
    return model;
  }
  function validateModel(model){
    if(!model||[1,VERSION].indexOf(model.version)<0||model.inputSpace!=="srgb")throw Error("Unsupported grade model");
    CM.profile(model.version===1?'srgb':model.inputProfile);
    if(model.version===1&&model.inputProfile&&model.inputProfile!=='srgb')throw Error("Legacy model must use sRGB");
    if(!model.correction||["exposure","temperature","tint"].some(function(k){return !Number.isFinite(model.correction[k]);}))throw Error("Invalid model correction");
    [model.source,model.reference].forEach(function(d){
      if(!d||!Array.isArray(d.quantiles)||d.quantiles.length!==9||!Array.isArray(d.zones)||d.zones.length!==3)throw Error("Invalid grade distribution");
      d.quantiles.forEach(function(v,i){if(!Number.isFinite(v)||v<0||v>4||(i&&v<d.quantiles[i-1]))throw Error("Invalid quantiles");});
      d.zones.forEach(function(z){["a","b","sa","sb"].forEach(function(k){if(!Number.isFinite(z[k])||Math.abs(z[k])>4)throw Error("Invalid palette");});if(z.sa<0||z.sb<0)throw Error("Invalid palette spread");});
      if(d.chroma!==undefined&&(!Array.isArray(d.chroma)||d.chroma.length!==2||!d.chroma.every(function(v){return Number.isFinite(v)&&v>=0&&v<=1;})||d.chroma[1]<d.chroma[0]))throw Error("Invalid chroma tail");
    });
    if(!model.source.chroma!==!model.reference.chroma)throw Error("Chroma tail must be on both distributions");
    return model;
  }
  function toneMap(x,a,b){
    // Compress extreme mappings. Anchored endpoints avoid unpredictable extrapolation.
    if(x<=a[0])return mix(x,b[0],0.85);
    for(var i=1;i<a.length;i++)if(x<=a[i]){
      var t=clamp((x-a[i-1])/Math.max(0.00001,a[i]-a[i-1]));
      return mix(x,mix(b[i-1],b[i],t),0.85);
    }
    return mix(x,b[b.length-1]+x-a[a.length-1],0.85);
  }
  function zoneColor(x,z,mid){
    var t;
    if(x<mid){t=smooth(0,Math.max(0.01,mid),x);return {a:mix(z[0].a,z[1].a,t),b:mix(z[0].b,z[1].b,t),sa:mix(z[0].sa,z[1].sa,t),sb:mix(z[0].sb,z[1].sb,t)};}
    t=smooth(mid,Math.max(mid+0.01,1),x);
    return {a:mix(z[1].a,z[2].a,t),b:mix(z[1].b,z[2].b,t),sa:mix(z[1].sa,z[2].sa,t),sb:mix(z[1].sb,z[2].sb,t)};
  }
  function skinWeight(lab){
    var hue=Math.atan2(lab[2],lab[1]),chroma=Math.hypot(lab[1],lab[2]);
    // Heuristic hue protection, not semantic face detection.
    return smooth(0.2,0.45,lab[0])*(1-smooth(0.85,0.98,lab[0]))*
      Math.exp(-Math.pow((hue-0.8)/0.45,2))*smooth(0.015,0.06,chroma);
  }
  // Compress-only chroma tail match: pixels whose ORIGINAL chroma lies above the source
  // p90 are pulled toward the reference's quantile-equivalent chroma (p90->p90,
  // p99->p99, extrapolated), blended in smoothly from p90 to p99. Models without
  // chroma statistics (older recipes) are unchanged.
  function chromaTail(c,base,s,r,amount){
    if(!s||!r||amount<=0)return c;
    var c0=Math.hypot(base[1],base[2]),w=smooth(s[0],Math.max(s[0]+0.0001,s[1]),c0)*amount;
    if(w<=0)return c;
    var target=r[0]+(c0-s[0])*clamp((r[1]-r[0])/Math.max(0.0001,s[1]-s[0])),c1=Math.hypot(c[1],c[2]);
    if(c1<=target)return c;
    var k=mix(1,target/c1,w);return [c[0],c[1]*k,c[2]*k];
  }
  function createTransform(model,options){
    var o=settings(options);
    if(model)validateModel(model);
    if(model&&(model.version===1?'srgb':model.inputProfile)!==o.inputProfile)throw Error("Input profile changed: refit the match");
    if(model && ["exposure","temperature","tint"].some(function(k){return Math.abs(model.correction[k]-o[k])>0.000001;}))
      throw Error("Correction changed: refit the match before exporting");
    var look=LOOKS[o.look],film=STOCKS[o.stock],normalize=CM.create(o.inputProfile);
    return function(rgb){
      var base=toLab(correct(normalize(rgb),o)),c=base.slice();
      if(model && o.strength>0){
        var source=model.source,ref=model.reference;
        var sc=zoneColor(c[0],source.zones,source.quantiles[4]),rc=zoneColor(c[0],ref.zones,source.quantiles[4]);
        var ar=clamp((rc.sa+0.015)/(sc.sa+0.015),0.5,2),br=clamp((rc.sb+0.015)/(sc.sb+0.015),0.5,2);
        var protect=1-o.preserveSkin*skinWeight(base)*0.85;
        c[0]=mix(c[0],toneMap(c[0],source.quantiles,ref.quantiles),o.strength);
        c[1]=mix(c[1],clamp((c[1]-sc.a)*ar+rc.a,-0.3,0.3),o.strength*protect);
        c[2]=mix(c[2],clamp((c[2]-sc.b)*br+rc.b,-0.3,0.3),o.strength*protect);
        c=chromaTail(c,base,source.chroma,ref.chroma,o.strength*protect);
      }
      var t=smooth(0.15,0.85,c[0]),sat=o.saturation*look.sat;
      c[1]=c[1]*sat+mix(look.shadow[0],look.highlight[0],t);
      c[2]=c[2]*sat+mix(look.shadow[1],look.highlight[1],t);
      c[0]=(c[0]-0.5)*o.contrast*look.contrast+0.5;
      c=stock(c,film,o.stockAmount);
      c[0]=mix(c[0],o.fade+(1-o.fade)*c[0],1);
      if(o.shoulder>0&&c[0]>0.65)c[0]=mix(c[0],0.65+0.35*(1-Math.exp(-(c[0]-0.65)/0.35)),o.shoulder);
      return fromLab(c).map(function(x){return clamp(x);});
    };
  }
  function render(image,model,options){
    validateImage(image);
    var fn=createTransform(model,options),out=new Uint8ClampedArray(image.data.length);
    for(var i=0;i<out.length;i+=4){
      var c=fn([image.data[i]/255,image.data[i+1]/255,image.data[i+2]/255]);
      out[i]=Math.round(c[0]*255);out[i+1]=Math.round(c[1]*255);out[i+2]=Math.round(c[2]*255);out[i+3]=image.data[i+3];
    }
    return {width:image.width,height:image.height,data:out};
  }
  function autoCorrect(image,options){
    var o=settings(options);o.exposure=0;o.temperature=0;o.tint=0;
    return correctionFrom(distribution(image,o));
  }
  function autoCorrectFrames(frames,options){
    var o=settings(options);o.exposure=0;o.temperature=0;o.tint=0;
    return correctionFrom(shotStatistics(frames,o).distribution);
  }
  function correctionFrom(d){
    var median=d.quantiles[4],z=d.zones[1];
    return {exposure:clamp(3*Math.log2(0.65/Math.max(0.1,median)),-1.5,1.5),
      temperature:clamp(-z.b*3,-0.35,0.35),tint:clamp(-z.a*3,-0.35,0.35)};
  }
  function cube(model,options,size){
    size=size||33;if([17,33,65].indexOf(size)<0)throw Error("LUT size must be 17, 33 or 65");
    var o=settings(options),fn=createTransform(model,o),lines=['TITLE "OdyGrade"',"# input profile: "+o.inputProfile+"; output: sRGB SDR",
      "# Color transform only. Spatial film effects are not included.","LUT_3D_SIZE "+size,"DOMAIN_MIN 0 0 0","DOMAIN_MAX 1 1 1"];
    // .cube order: red changes fastest.
    for(var b=0;b<size;b++)for(var g=0;g<size;g++)for(var r=0;r<size;r++)
      lines.push(fn([r/(size-1),g/(size-1),b/(size-1)]).map(function(v){return v.toFixed(7);}).join(" "));
    return lines.join("\n")+"\n";
  }
  function serialize(model,options,film){
    if(model)validateModel(model);
    var o=settings(options);createTransform(model,o);
    return JSON.stringify({format:"odygrade",version:VERSION,inputSpace:o.inputProfile,outputSpace:"srgb",model:model||null,
      settings:o,film:film||{}},null,2);
  }
  function parse(text){
    var x=JSON.parse(text);
    if(!x||x.format!=="odygrade"||[1,VERSION].indexOf(x.version)<0)throw Error("Unsupported OdyGrade recipe");
    if(x.version===1){
      if(x.inputSpace!=="srgb"||(x.settings&&x.settings.inputProfile&&x.settings.inputProfile!=="srgb"))throw Error("Unsupported legacy input space");
      x.version=VERSION;x.outputSpace="srgb";
    }
    CM.profile(x.inputSpace);
    if(x.outputSpace!=="srgb")throw Error("Unsupported output space");
    if(x.model)validateModel(x.model);x.settings=settings(x.settings);
    if(x.inputSpace!==x.settings.inputProfile)throw Error("Recipe input profile mismatch");
    createTransform(x.model,x.settings);
    return x;
  }
  return {VERSION:VERSION,DEFAULTS:DEFAULTS,LOOKS:LOOKS,STOCKS:STOCKS,toLab:toLab,fromLab:fromLab,
    fit:fit,fitFrames:fitFrames,render:render,createTransform:createTransform,cube:cube,serialize:serialize,parse:parse,settings:settings,autoCorrect:autoCorrect,autoCorrectFrames:autoCorrectFrames};
});
