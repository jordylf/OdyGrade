'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const E=require('../src/engine.js'),N=require('../src/native-recipe.js'),S=require('../tools/fit-shot.cjs'),CLI=require('../tools/cli.cjs');
const available=cp.spawnSync('ffmpeg',['-version'],{windowsHide:true}).status===0&&cp.spawnSync('ffprobe',['-version'],{windowsHide:true}).status===0;
function image(color,w=24,h=16){const data=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++)data.set([...color(i),255],i*4);return {width:w,height:h,data};}
const a=image(i=>[40+i%160,50+i%140,60+i%130]),b=image(i=>[70+i%160,60+i%140,40+i%130]);
function ffmpeg(args){return cp.execFileSync('ffmpeg',['-v','error',...args],{windowsHide:true,maxBuffer:64*1024*1024});}
function clean(dir){assert.ok(!fs.readdirSync(dir).some(n=>n.startsWith('.odygrade-analysis-')));}

test('one-frame shot matches still fitting; pooled statistics include every sampled context',()=>{
 assert.deepEqual(E.fitFrames([a],b),E.fit(a,b));
 const stacked={width:a.width,height:a.height*2,data:new Uint8ClampedArray([...a.data,...b.data])};
 const pooled=E.fitFrames([a,b],b),expected=E.fit(stacked,b);
 assert.deepEqual(pooled,expected);assert.equal(pooled.source.count,768);
 const restored=E.parse(E.serialize(pooled,{}));
 assert.deepEqual(E.render(a,pooled).data,E.render(a,restored.model,restored.settings).data);
 assert.match(N.compile(restored),/^ODYGRADE_NATIVE 7/);
 assert.deepEqual(E.createTransform(pooled)([.3,.4,.5]),E.createTransform(restored.model)([.3,.4,.5]));
});
test('shot pooling is bounded, explicit about invalid frames and changing brightness',()=>{
 assert.throws(()=>E.fitFrames([],b),/1 to 32/);assert.throws(()=>E.fitFrames(Array(33).fill(a),b),/1 to 32/);
 assert.throws(()=>E.fitFrames([a,image(()=>[0,0,0])],b),/16/);
 const many=E.fitFrames(Array(32).fill(image(()=>[80,90,100],512,512)),b);
 assert.ok(many.source.count<=60000);
 const changing=E.fitFrames([image(()=>[15,15,15]),image(()=>[220,220,220])],b);
 assert.ok(changing.warnings.some(w=>/brightness varies/.test(w)));
 const camera=E.fitFrames([a,b],b,{inputProfile:'sony-slog3-sgamut3cine',exposure:.2});
 assert.equal(camera.inputProfile,'sony-slog3-sgamut3cine');
 assert.throws(()=>E.render(a,camera,{inputProfile:camera.inputProfile}),/refit/);
});
test('pooled automatic correction is independent of preview choice and ignores stale corrections',()=>{
 const stacked={width:a.width,height:a.height*2,data:new Uint8ClampedArray([...a.data,...b.data])};
 assert.deepEqual(E.autoCorrectFrames([a,b]),E.autoCorrect(stacked));
 assert.deepEqual(E.autoCorrectFrames([a,b],{exposure:2,temperature:.7,tint:-.5}),E.autoCorrectFrames([a,b]));
 assert.deepEqual(E.autoCorrectFrames([a]),E.autoCorrect(a));
 assert.throws(()=>E.autoCorrectFrames([]),/1 to 32/);
});
test('shot sampling uses presentation time and explicit half-open ranges, including nonzero origin',()=>{
 const video={pts:[100,110,120,900,1000],durations:[10,10,780,100,100],tb:{value:.001},width:1920,height:1080};
 const p=S.samplePlan(video,{samples:3});assert.deepEqual(p.indices,[0,3,4]);assert.deepEqual(p.times,[0,.8,.9]);
 assert.equal(p.width,512);assert.equal(p.height,288);
 assert.deepEqual(S.samplePlan(video,{samples:9,start:.01,duration:.02}).indices,[1,2]);
 assert.throws(()=>S.samplePlan(video,{samples:0}),/Samples/);
 assert.throws(()=>S.samplePlan(video,{samples:1.5}),/Samples/);
 assert.throws(()=>S.samplePlan(video,{start:-1}),/range/);
 assert.throws(()=>S.samplePlan(video,{start:.9,duration:1}),/exceeds/);
 assert.throws(()=>S.samplePlan(video,{start:.1,duration:.1}),/no frame/);
});
test('real shot CLI samples requested video frames and persists a reusable frozen recipe',{skip:!available,timeout:60000},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-fit-shot-'));
 try{
  const input=path.join(dir,'shot with spaces.mov'),ref=path.join(dir,'reference.png'),output=path.join(dir,'shot.json');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=64x48:rate=12:duration=2','-c:v','prores_ks','-profile:v','3',input]);
  CLI.writeImage(b,ref);
  const text=cp.execFileSync(process.execPath,[path.resolve(__dirname,'../tools/cli.cjs'),'fit-shot','--input',input,'--reference',ref,
   '--output',output,'--samples','3','--start','0.5','--duration','1','--profile','rec709-gamma24'],{encoding:'utf8',windowsHide:true});
  assert.match(text,/3 sampled frames/);const r=E.parse(fs.readFileSync(output,'utf8'));
  assert.deepEqual(r.analysis.sampleIndices,[6,12,17]);assert.equal(r.settings.inputProfile,'rec709-gamma24');
  const raw=ffmpeg(['-i',input,'-vf',"select='eq(n,6)+eq(n,12)+eq(n,17)'",'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
  const frames=[0,1,2].map(i=>({width:64,height:48,data:new Uint8ClampedArray(raw.subarray(i*64*48*4,(i+1)*64*48*4))}));
  assert.deepEqual(r.model,E.fitFrames(frames,CLI.readImage(ref),r.settings));
  assert.ok(E.cube(r.model,r.settings,17).includes('LUT_3D_SIZE 17'));
  assert.throws(()=>cp.execFileSync(process.execPath,[path.resolve(__dirname,'../tools/cli.cjs'),'fit-shot','--input',input,'--reference',ref,'--output',output],{windowsHide:true,stdio:'pipe'}));
  clean(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('shot analysis cancellation, callback failure, source mutation and publication race preserve outputs',{skip:!available,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-fit-fail-'));
 try{
  const input=path.join(dir,'source.mov');ffmpeg(['-f','lavfi','-i','testsrc2=size=64x48:rate=12:duration=1','-c:v','prores_ks',input]);
  for(const mode of ['abort','active-abort','callback','mutation','race']){
   const output=path.join(dir,mode+'.json'),controller=new AbortController();
   await assert.rejects(S.fitShot(input,b,output,{signal:controller.signal,onProgress(event){
    if(mode==='abort')controller.abort();
    if(mode==='active-abort'&&event.phase==='sample')setTimeout(()=>controller.abort(),1);
    if(mode==='callback')throw Error('callback failed');
    if(event.phase==='publish'&&mode==='mutation'){const now=new Date(Date.now()+10000);fs.utimesSync(input,now,now);}
    if(event.phase==='publish'&&mode==='race')fs.writeFileSync(output,'existing');
   }}),mode.endsWith('abort')?{name:'AbortError'}:mode==='callback'?/callback failed/:mode==='mutation'?/Source changed/:/EEXIST/);
   if(mode==='race')assert.equal(fs.readFileSync(output,'utf8'),'existing');else assert.ok(!fs.existsSync(output));
   clean(dir);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
