'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const E=require('../src/engine.js'),F=require('../src/film.js'),N=require('../src/native-recipe.js');
const CM=require('../src/color-management.js');
const exe=require('../tools/native.cjs').executable();
const available=fs.existsSync(exe);
const ffmpegAvailable=cp.spawnSync('ffmpeg',['-version'],{windowsHide:true,stdio:'ignore'}).status===0;
function image(w=32,h=24){
 const data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)data.set([10+(i*37)%240,15+(i*17)%235,5+(i*13)%245,255],i*4);
 return {width:w,height:h,data};
}
function recipe(model=null,settings={},film={}){return E.parse(E.serialize(model,settings,film));}
function render(r,input,width,height,inFormat='rgba8',outFormat='rgba8',frame=0){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-native-test-'));
 try {
  const file=path.join(dir,'grade-色.odyn');fs.writeFileSync(file,N.compile(r));
  return cp.spawnSync(exe,[file,String(width),String(height),inFormat,outFormat,String(frame)],
   {input:Buffer.from(input),maxBuffer:128*1024*1024,windowsHide:true});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
function success(result){assert.equal(result.status,0,result.stderr?.toString());return result.stdout;}
function difference(a,b){let sum=0,max=0;assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){
 const delta=Math.abs(a[i]-b[i]);sum+=delta;max=Math.max(max,delta);}return {mean:sum/a.length,max};}
test('native snapshot canonicalizes valid recipes and rejects invalid JSON state',()=>{
 const r=recipe();assert.match(N.compile(r),/^ODYGRADE_NATIVE 4\n/);
 r.settings.look='not-a-look';assert.throws(()=>N.compile(r),/look/i);
});
test('native color output matches JS across all ten looks and fitted correction',{skip:!available},()=>{
 const source=image(),reference=E.render(source,null,{look:'cyan',contrast:1.1,exposure:-.3});
 for(const look of Object.keys(E.LOOKS)){
  const settings={look,strength:.73,exposure:.2,temperature:-.1,tint:.04,
   contrast:1.13,saturation:.85,preserveSkin:.8,fade:.025,shoulder:.4};
  const model=E.fit(source,reference,settings),r=recipe(model,settings);
  const actual=success(render(r,source.data,source.width,source.height)),expected=E.render(source,model,settings).data;
  const error=difference(actual,expected);assert.ok(error.max<=1,look+': '+JSON.stringify(error));
 }
});
test('native float colors match analytic JS, retain sub-8-bit variation and alpha',{skip:!available},()=>{
 const source=image(),settings={look:'velvet',contrast:1.05,saturation:.92,shoulder:.4};
 const model=E.fit(source,E.render(source,null,{look:'amber'})),r=recipe(model,settings);
 const values=new Float32Array([.5001,.3333,.7777,.12345,.5002,.3333,.7777,.87654,0,0,0,0,1,1,1,1]);
 const actual=success(render(r,Buffer.from(values.buffer),4,1,'rgba32f','rgba32f'));
 const fn=E.createTransform(model,settings);
 for(let i=0;i<4;i++){
  const expected=fn(Array.from(values.slice(i*4,i*4+3)));
  for(let k=0;k<3;k++)assert.ok(Math.abs(actual.readFloatLE((i*4+k)*4)-expected[k])<2e-6);
  assert.equal(actual.readFloatLE((i*4+3)*4),values[i*4+3]);
 }
 assert.notEqual(actual.readFloatLE(0),actual.readFloatLE(16));
});
test('native input profiles agree with JS on decoded and matched float colors',{skip:!available},()=>{
 const source=image(),values=new Float32Array([.093,.181,.42,1,.5,.6,.4,.5,.95,.7,.4,1,0,0,0,1]);
 for(const inputProfile of Object.keys(CM.PROFILES)){
  const settings={inputProfile,look:'amber',contrast:1.1,shoulder:.2};
  const reference=E.render(source,null,settings),model=E.fit(source,reference,settings);
  const output=success(render(recipe(model,settings),Buffer.from(values.buffer),4,1,'rgba32f','rgba32f'));
  const fn=E.createTransform(model,settings);
  for(let i=0;i<4;i++)for(let k=0;k<3;k++)closeFloat(output.readFloatLE((i*4+k)*4),fn(Array.from(values.slice(i*4,i*4+3)))[k]);
 }
 function closeFloat(a,b){assert.ok(Math.abs(a-b)<2e-6,a+' != '+b);}
});
test('native reader retains v1 snapshot compatibility',{skip:!available},()=>{
 const source=image(4,4),r=recipe(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-native-legacy-'));
 try{
  const legacy=N.compile(r).replace('ODYGRADE_NATIVE 4','ODYGRADE_NATIVE 1').replace(/^profile .*\n/m,'').replace(/^(film(?: \S+){6})(?: \S+){7}$/m,'$1');
  const file=path.join(dir,'legacy.odyn');fs.writeFileSync(file,legacy);
  const old=cp.spawnSync(exe,[file,'4','4','rgba8','rgba8'],{input:Buffer.from(source.data),windowsHide:true});
  assert.deepEqual(success(old),success(render(r,source.data,4,4)));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native 16-bit path is not an 8-bit processing roundtrip',{skip:!available},()=>{
 const values=new Uint16Array([32771,13000,17000,65535,32772,13000,17000,65535]);
 const result=success(render(recipe(),Buffer.from(values.buffer),2,1,'rgba16','rgba16'));
 assert.equal(result.readUInt16LE(0),32771);assert.equal(result.readUInt16LE(8),32772);
 assert.equal(result.readUInt16LE(6),65535);
});
test('native film matches JS still within intermediate quantization tolerance',{skip:!available},()=>{
 const source=image(),settings={look:'coast'},film={grain:.3,bloom:.5,halation:.7,vignette:.25,bleach:.4,ratio:2.39};
 const actual=success(render(recipe(null,settings,film),source.data,source.width,source.height));
 const expected=F.apply(E.render(source,null,settings),film).data,error=difference(actual,expected);
 assert.ok(error.mean<.5,JSON.stringify(error));assert.ok(error.max<=2,JSON.stringify(error));
});
test('native gauge grain and film format match JS on several frames',{skip:!available},()=>{
 const source=image(160,120),settings={look:'amber'};
 for(const film of [{grain:.5,gauge:8,iso:400},{grain:.4,gauge:65,iso:50,vignette:.2},
  {grain:.3,gauge:16,format:2,weave:1,flicker:1,dust:1,perfs:1},{format:5,perfs:1,dust:.6,ratio:1.85},{format:3,weave:.7,perfs:1,bloom:.4}])
  for(const frame of [0,5,41]){
   const actual=success(render(recipe(null,settings,film),source.data,source.width,source.height,'rgba8','rgba8',frame));
   const expected=F.apply(E.render(source,null,settings),film,frame).data,error=difference(actual,expected);
   assert.ok(error.mean<.5&&error.max<=3,JSON.stringify({film,frame,error}));
  }
});
test('native stream supports consecutive frames and repeatable temporal grain',{skip:!available},()=>{
 const source=image(16,12),r=recipe(null,{}, {grain:.5}),frame=Buffer.from(source.data);
 const output=success(render(r,Buffer.concat([frame,frame]),16,12));
 assert.equal(output.length,frame.length*2);assert.notDeepEqual(output.subarray(0,frame.length),output.subarray(frame.length));
 assert.deepEqual(output.subarray(frame.length),success(render(r,frame,16,12,'rgba8','rgba8',1)));
});
test('native rejects malformed recipe and truncated frame without fake success',{skip:!available},()=>{
 const result=render(recipe(),Buffer.from([1,2,3]),1,1);assert.notEqual(result.status,0);
 assert.match(result.stderr.toString(),/Truncated/);assert.equal(result.stdout.length,0);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-native-bad-'));
 try{
  const file=path.join(dir,'bad.odyn');fs.writeFileSync(file,N.compile(recipe())+'trailing junk');
  const bad=cp.spawnSync(exe,[file,'1','1','rgba8','rgba8'],{input:Buffer.from([0,0,0,255]),windowsHide:true});
  assert.notEqual(bad.status,0);assert.match(bad.stderr.toString(),/trailing/);assert.equal(bad.stdout.length,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native still CLI processes real 16-bit PNG and preserves one-code-value differences',{skip:!available||!ffmpegAvailable},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-native-png-'));
 try{
  const values=new Uint16Array([32771,13000,17000,65535,32772,13000,17000,65535,
   50000,40000,30000,32000,0,0,0,0]);
  const input=path.join(dir,'input 色.png'),output=path.join(dir,'graded 色.png'),grade=path.join(dir,'grade.json');
  cp.execFileSync('ffmpeg',['-v','error','-f','rawvideo','-pix_fmt','rgba64le','-s','4x1','-i','pipe:0',
   '-frames:v','1','-pix_fmt','rgba64be',input],{input:Buffer.from(values.buffer),windowsHide:true});
  fs.writeFileSync(grade,JSON.stringify(recipe()));
  cp.execFileSync(process.execPath,[path.resolve(__dirname,'../tools/cli.cjs'),'still-native',
   '--recipe',grade,'--input',input,'--output',output],{windowsHide:true});
  const actual=cp.execFileSync('ffmpeg',['-v','error','-i',output,'-frames:v','1','-pix_fmt','rgba64le','-f','rawvideo','pipe:1'],{windowsHide:true});
  assert.equal(actual.length,values.byteLength);
  for(let i=0;i<values.length;i++)assert.ok(Math.abs(actual.readUInt16LE(i*2)-values[i])<=1);
  assert.equal(actual.readUInt16LE(8)-actual.readUInt16LE(0),1);
  assert.throws(()=>require('../tools/native-still.cjs').renderStill(recipe(),input,output),/exists/);
  assert.throws(()=>require('../tools/native-still.cjs').renderStill(recipe(),input,path.join(dir,'bad.jpg')),/png/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
