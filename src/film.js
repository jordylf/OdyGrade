(function(root,factory){var api=factory();if(typeof module==="object"&&module.exports&&typeof window==='undefined'&&typeof importScripts==='undefined')module.exports=api;else root.OdyFilm=api;})(typeof window!=="undefined"?window:this,function(){
"use strict";
// gauge 0 = classic per-pixel grain; 8/16/35/65 = gauge-sized grain. format: index into FORMATS (0 off).
// The native core (native/src/core.cpp render) mirrors this file equation for equation.
var DEFAULTS={grain:0,bloom:0,halation:0,vignette:0,bleach:0,ratio:0,gauge:0,iso:200,format:0,weave:0,flicker:0,dust:0,perfs:0};
var GAUGES={8:[4,1.3],16:[2.4,1.15],35:[1.4,1],65:[.9,.8]};  // [grain cell px at 1080 lines, amplitude]
// [weave (frame heights), flicker, dust count, speck size, perfs per frame, perf phase, perf h, perf w (frame heights), both sides]
var FORMATS=[null,
 [.006,1,1.6,2.2,1,0,.18,.12,0],  // Regular 8
 [.005,.9,1.4,2,1,.5,.16,.11,0],  // Super 8
 [.0035,.7,1.2,1.6,1,0,.17,.12,1],// 16 mm
 [.003,.6,1.1,1.4,1,0,.17,.12,0], // Super 16
 [.0015,.4,.8,1,4,.125,.1,.08,1], // 35 mm
 [.0008,.25,.5,.8,0,0,0,0,0]];    // IMAX (no perforations drawn)
var LIMITS={iso:[50,500],ratio:[0,3],gauge:[0,65],format:[0,FORMATS.length-1]};
function normalize(x){var o=Object.assign({},DEFAULTS,x||{});Object.keys(DEFAULTS).forEach(function(k){if(!Number.isFinite(o[k]))throw Error("Invalid film control: "+k);var l=LIMITS[k]||[0,1];o[k]=Math.max(l[0],Math.min(l[1],o[k]));});
 if([0,1.33,1.85,2.39].indexOf(o.ratio)<0)throw Error("Unsupported frame ratio");
 if(o.gauge&&!GAUGES[o.gauge])throw Error("Unsupported grain gauge");
 if(o.format!==Math.round(o.format)||(o.perfs!==0&&o.perfs!==1))throw Error("Unsupported film format");return o;}
function fract(v){return v-Math.floor(v);}
function hash(a,b){return fract(Math.sin(a*12.9898+b*78.233)*43758.5453);}
function noise(x,y,seed){  // smooth value noise in [-.5,.5]
 var ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);
 var a=hash(ix+seed,iy),b=hash(ix+1+seed,iy),c=hash(ix+seed,iy+1),d=hash(ix+1+seed,iy+1);
 return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v-.5;
}
// Film grain: two octaves of value noise on a rotated lattice, so no grid axis shows.
function grainNoise(x,y,cell,seed){
 var u=(x*.8+y*.6)/cell,v=(y*.8-x*.6)/cell;
 return .7*noise(u,v,seed)+.45*noise(u*2.1+17.3,v*2.1+5.1,seed);
}
function blur(input,w,h,r){
 var temp=new Float32Array(input.length),out=new Float32Array(input.length),count=2*r+1;
 for(var y=0;y<h;y++)for(var c=0;c<3;c++){
  var sum=0;for(var k=-r;k<=r;k++)sum+=input[(y*w+Math.max(0,Math.min(w-1,k)))*3+c];
  for(var x=0;x<w;x++){temp[(y*w+x)*3+c]=sum/count;sum+=input[(y*w+Math.min(w-1,x+r+1))*3+c]-input[(y*w+Math.max(0,x-r))*3+c];}
 }
 for(var x=0;x<w;x++)for(var c=0;c<3;c++){
  var sum=0;for(var k=-r;k<=r;k++)sum+=temp[(Math.max(0,Math.min(h-1,k))*w+x)*3+c];
  for(var y=0;y<h;y++){out[(y*w+x)*3+c]=sum/count;sum+=temp[(Math.min(h-1,y+r+1)*w+x)*3+c]-temp[(Math.max(0,y-r)*w+x)*3+c];}
 }
 return out;
}
// Per-frame film format state: gate weave offset, flicker gain and dust/scratch mask.
function formatPass(o,w,h,frame){
 var f=FORMATS[o.format];if(!f)return null;
 var n=frame%1048576,s={dx:0,dy:0,gain:1,mask:null,f:f};
 var u=Math.min(w,h);  // sizes follow the short side so vertical video gets the same film scale
 if(o.weave){s.dx=o.weave*f[0]*u*(hash(n,2.5)-.5)*1.2;s.dy=o.weave*f[0]*u*(hash(n,3.5)-.5)*2;}
 if(o.flicker)s.gain=1+o.flicker*f[1]*.12*(hash(n,1.5)-.5)*2;
 if(o.dust){
  var mask=new Float32Array(w*h),scale=u/1080,count=Math.floor(o.dust*30*f[2]+hash(n,4.5)*o.dust*10);
  for(var k=0;k<count;k++){
   var key=n*7+k,cx=hash(key,5.5)*w,cy=hash(key,6.5)*h,r=(.6+2.4*Math.pow(hash(key,7.5),2))*scale*f[3];
   var sign=hash(key,8.5)<.7?1:-1,strength=.5+.5*hash(key,9.5);
   for(var y=Math.max(0,Math.floor(cy-r-1));y<=Math.min(h-1,Math.ceil(cy+r+1));y++)
    for(var x=Math.max(0,Math.floor(cx-r-1));x<=Math.min(w-1,Math.ceil(cx+r+1));x++){
     var a=Math.max(0,Math.min(1,r+.5-Math.hypot(x+.5-cx,y+.5-cy)))*strength*sign,i=y*w+x;
     mask[i]=Math.max(-1,Math.min(1,mask[i]+a));
    }
  }
  if(hash(n,10.5)<o.dust*.35){var sx=hash(n,11.5)*w,sw=Math.max(1,scale*1.2);
   for(var y=0;y<h;y++)for(var x=Math.max(0,Math.floor(sx-sw-1));x<=Math.min(w-1,Math.ceil(sx+sw+1));x++){
    var i=y*w+x;mask[i]=Math.min(1,mask[i]+Math.max(0,Math.min(1,sw+.5-Math.abs(x+.5-sx)))*.35);}}
  s.mask=mask;
 }
 return s;
}
function perforation(f,x,y,w,h){  // coverage 0..1 of a sprocket hole at the pixel centre
 if(!f[4])return 0;
 var u=Math.min(w,h),ph=f[6]*u,pw=f[7]*u,r=.25*Math.min(ph,pw),inset=.012*u,px=x+.5,py=y+.5;
 var ex=f[8]?Math.min(px,w-px):px;if(ex>inset+pw+1)return 0;
 var qx=Math.abs(ex-inset-pw/2)-pw/2+r,best=0,pitch=h/f[4];
 for(var j=-1;j<=f[4];j++){
  var qy=Math.abs(py-(j+f[5])*pitch)-ph/2+r;
  var d=Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
  best=Math.max(best,Math.max(0,Math.min(1,.5-d)));
 }
 return best;
}
function shift(d,w,h,dx,dy){  // bilinear gate weave resample, edges clamped
 var out=new Float32Array(d.length);
 for(var y=0;y<h;y++)for(var x=0;x<w;x++){
  var sx=Math.max(0,Math.min(w-1,x-dx)),sy=Math.max(0,Math.min(h-1,y-dy)),x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1),u=sx-x0,v=sy-y0;
  for(var c=0;c<4;c++){var a=d[(y0*w+x0)*4+c],b=d[(y0*w+x1)*4+c],e=d[(y1*w+x0)*4+c],g=d[(y1*w+x1)*4+c];
   out[(y*w+x)*4+c]=(a+(b-a)*u)*(1-v)+(e+(g-e)*u)*v;}
 }
 return out;
}
function apply(image,options,frame){
 var o=normalize(options),w=image.width,h=image.height,d=image.data,out=new Uint8ClampedArray(d),light;
 var fmt=formatPass(o,w,h,frame||0);
 if(fmt&&(fmt.dx||fmt.dy))d=shift(d,w,h,fmt.dx,fmt.dy);
 if(o.bloom||o.halation){
  light=new Float32Array(w*h*3);
  for(var i=0;i<w*h;i++){var l=(d[i*4]*.2126+d[i*4+1]*.7152+d[i*4+2]*.0722)/255,t=Math.max(0,(l-.6)/.4);
   for(var c=0;c<3;c++)light[i*3+c]=d[i*4+c]*t*d[i*4+3]/255;
  }
  light=blur(light,w,h,Math.max(1,Math.round(Math.min(w,h)*.018)));
 }
 var seed=(frame||0)%1048576*19.193,g=GAUGES[o.gauge],cell=g?Math.max(.5,Math.min(w,h)/1080*g[0]*Math.pow(o.iso/200,.35)):1;
 var amp=g?o.grain*32*g[1]*Math.sqrt(o.iso/200):0;
 for(var y=0;y<h;y++)for(var x=0;x<w;x++){
  var i=y*w+x,p=i*4,dx=(x+.5)/w-.5,dy=(y+.5)/h-.5;
  var vig=1-o.vignette*Math.min(1,Math.pow((dx*dx+dy*dy)*2,1.2));
  var l=d[p]*.2126+d[p+1]*.7152+d[p+2]*.0722,hs=fract(Math.sin((i+1)*12.9898+78.233+seed)*43758.5453),grain,lw=0;
  if(g){lw=.6+1.6*(l/255)*(1-l/255);grain=grainNoise(x,y,cell,seed)*amp*lw;}
  else grain=(hs-.5)*o.grain*32;
  var matte=o.ratio&&(w/h>o.ratio?Math.abs(dx)*w>h*o.ratio/2:Math.abs(dy)*h>w/o.ratio/2);
  var m=fmt&&fmt.mask?fmt.mask[i]:0,hole=fmt&&o.perfs?perforation(fmt.f,x,y,w,h):0;
  for(var c=0;c<3;c++){
   var v=d[p+c],desat=v*(1-o.bleach*.65)+l*o.bleach*.65;
   v=desat+(desat-127.5)*o.bleach*.22;
   if(light)v+=light[i*3+c]*o.bloom*.45+(c===0?light[i*3]*o.halation*.55:0);
   v=v*(fmt?fmt.gain:1)*vig+grain+(g?(fract(hs*(c+1)*7.13)-.5)*amp*.25*lw:0);
   if(m)v+=m>0?(255-v)*m:v*m;
   v=matte?0:Math.max(0,Math.min(255,v));
   out[p+c]=hole?v+(235-v)*hole:v;
  }
  if(d!==image.data)out[p+3]=d[p+3];
 }
 return {width:w,height:h,data:out};
}
return {DEFAULTS:DEFAULTS,GAUGES:GAUGES,FORMATS:FORMATS,normalize:normalize,apply:apply};
});
