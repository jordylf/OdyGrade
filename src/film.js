(function(root,factory){var api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.OdyFilm=api;})(typeof window!=="undefined"?window:this,function(){
"use strict";
var DEFAULTS={grain:0,bloom:0,halation:0,vignette:0,bleach:0,ratio:0};
function normalize(x){var o=Object.assign({},DEFAULTS,x||{});Object.keys(DEFAULTS).forEach(function(k){if(!Number.isFinite(o[k]))throw Error("Invalid film control: "+k);o[k]=Math.max(0,Math.min(k==="ratio"?3:1,o[k]));});if([0,1.33,1.85,2.39].indexOf(o.ratio)<0)throw Error("Unsupported frame ratio");return o;}
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
function apply(image,options){
 var o=normalize(options),w=image.width,h=image.height,d=image.data,out=new Uint8ClampedArray(d),light;
 if(o.bloom||o.halation){
  light=new Float32Array(w*h*3);
  for(var i=0;i<w*h;i++){var l=(d[i*4]*.2126+d[i*4+1]*.7152+d[i*4+2]*.0722)/255,t=Math.max(0,(l-.6)/.4);
   for(var c=0;c<3;c++)light[i*3+c]=d[i*4+c]*t*d[i*4+3]/255;
  }
  light=blur(light,w,h,Math.max(1,Math.round(Math.min(w,h)*.018)));
 }
 for(var y=0;y<h;y++)for(var x=0;x<w;x++){
  var i=y*w+x,p=i*4,dx=(x+.5)/w-.5,dy=(y+.5)/h-.5;
  var vig=1-o.vignette*Math.min(1,Math.pow((dx*dx+dy*dy)*2,1.2));
  var hash=Math.sin((i+1)*12.9898+78.233)*43758.5453,noise=(hash-Math.floor(hash)-.5)*o.grain*32;
  var l=d[p]*.2126+d[p+1]*.7152+d[p+2]*.0722;
  var matte=o.ratio&&(w/h>o.ratio?Math.abs(dx)*w>h*o.ratio/2:Math.abs(dy)*h>w/o.ratio/2);
  for(var c=0;c<3;c++){
   var v=d[p+c],desat=v*(1-o.bleach*.65)+l*o.bleach*.65;
   v=desat+(desat-127.5)*o.bleach*.22;
   if(light)v+=light[i*3+c]*o.bloom*.45+(c===0?light[i*3]*o.halation*.55:0);
   out[p+c]=matte?0:Math.max(0,Math.min(255,v*vig+noise));
  }
 }
 return {width:w,height:h,data:out};
}
return {DEFAULTS:DEFAULTS,normalize:normalize,apply:apply};
});
