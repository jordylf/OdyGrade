'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const E=require('../src/engine.js'),V=require('../tools/native-video.cjs'),native=require('../tools/native.cjs');
const available=fs.existsSync(native.executable())&&cp.spawnSync('ffmpeg',['-version'],{stdio:'ignore',windowsHide:true}).status===0&&cp.spawnSync('ffprobe',['-version'],{stdio:'ignore',windowsHide:true}).status===0;
const recipe=(settings={},film={})=>E.parse(E.serialize(null,settings,film));
function run(command,args,options={}){return cp.execFileSync(command,args,{windowsHide:true,maxBuffer:64*1024*1024,...options});}
function ffmpeg(args,options){return run('ffmpeg',['-v','error',...args],options);}
function metadata(file){return JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'}));}
function timing(file){return JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,duration_time','-of','json',file],{encoding:'utf8'})).frames;}
function audio(file){return ffmpeg(['-i',file,'-map','0:a:0','-f','s24le','pipe:1']);}
function pixels(file){return ffmpeg(['-i',file,'-map','0:v:0','-pix_fmt','rgba64le','-f','rawvideo','pipe:1']);}
function clean(dir){assert.equal(fs.readdirSync(dir).filter(x=>x.startsWith('.odygrade-job-')).length,0);}
function baseProbe(pts=[0,100,200],durations=[100,100,100]){
 const stream={index:0,codec_type:'video',width:48,height:32,time_base:'1/1000',sample_aspect_ratio:'1:1',field_order:'progressive',pix_fmt:'yuv422p10le',start_pts:pts[0],duration_ts:pts.at(-1)-pts[0]+durations.at(-1)};
 return [{streams:[stream]}, {frames:pts.map((p,i)=>({best_effort_timestamp:p,duration:durations[i],width:48,height:32}))}];
}
test('video plan preserves nonzero origin, VFR durations, rotation and sample aspect',()=>{
 const [meta,frames]=baseProbe([2000,2040,2140],[40,100,60]);
 meta.streams[0].sample_aspect_ratio='4:3';meta.streams[0].side_data_list=[{rotation:90}];
 meta.streams.push({codec_type:'audio',start_time:'1.875',sample_rate:'48000'});
 const p=V.plan(meta,frames,false);assert.equal(p.cfr,false);assert.equal(p.origin,1.875);assert.equal(p.videoOrigin,2);
 assert.equal(p.width,32);assert.equal(p.height,48);assert.equal(p.sar.value,.75);assert.deepEqual(p.durations,[40,100,60]);
 const concat=V.clockedImages(p);assert.match(concat,/option framerate 1000\/1/);assert.equal((concat.match(/file frame-/g)||[]).length,4);
});
test('video plan rejects ambiguous timing and unsupported frames before any output work',()=>{
 let [meta,frames]=baseProbe([0,100,100]);assert.throws(()=>V.plan(meta,frames,false),/increasing/);
 [meta,frames]=baseProbe();meta.streams[0].color_transfer='smpte2084';assert.throws(()=>V.plan(meta,frames,false),/HDR/);
 [meta,frames]=baseProbe();frames.frames[1].height=30;assert.throws(()=>V.plan(meta,frames,false),/dimensions/);
 [meta,frames]=baseProbe();meta.streams[0].side_data_list=[{rotation:45}];assert.throws(()=>V.plan(meta,frames,false),/rotation/);
});
test('video plan never invents an unknown final frame duration from the preceding cadence',()=>{
 const [meta,frames]=baseProbe([0,100,250],[100,150,0]);delete meta.streams[0].duration_ts;
 assert.throws(()=>V.plan(meta,frames,false),/final frame duration/);
 meta.streams[0].duration_ts=400;assert.equal(V.plan(meta,frames,false).durations.at(-1),150);
});
test('native full-film video uses all frames, changing grain and complete PCM audio',{skip:!available,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-film-video-'));
 try{
  const input=path.join(dir,'clip with spaces 色.mov'),output=path.join(dir,'graded film 色.mov');
  ffmpeg(['-f','lavfi','-i','color=c=gray:size=48x32:rate=12:duration=1','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1',
   '-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le','-c:a','pcm_s24le',input]);
  const report=await V.renderVideo(recipe({look:'amber'},{grain:.6,bloom:.4,halation:.6,vignette:.2,bleach:.1,ratio:2.39}),input,output);
  assert.equal(report.frames,12);assert.equal(report.mode,'stream-cfr');assert.equal(report.audioStreams,1);
  const m=metadata(output);assert.equal(m.streams[0].codec_name,'prores');assert.equal(m.streams[1].codec_name,'pcm_s24le');
  assert.equal(m.streams[0].color_primaries,'bt709');assert.equal(m.streams[0].color_transfer,'iec61966-2-1');assert.equal(m.streams[0].color_space,'bt709');
  assert.deepEqual(audio(output),audio(input));
  const rgba=pixels(output),frameBytes=48*32*8;assert.equal(rgba.length,frameBytes*12);
  assert.notDeepEqual(rgba.subarray(0,frameBytes),rgba.subarray(frameBytes,frameBytes*2));
  assert.ok(rgba.readUInt16LE(0)<256,'scope matte missing');clean(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native VFR path preserves individual timestamps, final duration and delayed audio',{skip:!available,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-vfr-video-'));
 try{
  const input=path.join(dir,'vfr.mov'),output=path.join(dir,'graded.mov');
  ffmpeg(['-f','lavfi','-i','testsrc2=size=48x32:rate=24:duration=0.34','-itsoffset','0.125','-f','lavfi','-i','sine=frequency=550:sample_rate=48000:duration=0.4',
   '-vf',"select='eq(n,0)+eq(n,1)+eq(n,4)+eq(n,7)'",'-fps_mode','vfr','-c:v','prores_ks','-pix_fmt','yuv422p10le','-c:a','pcm_s24le',input]);
  const before=timing(input),report=await V.renderVideo(recipe({look:'coast'},{grain:.2}),input,output);
  assert.equal(report.mode,'cache-vfr');assert.equal(report.frames,4);const after=timing(output);
  assert.equal(after.length,before.length);
  for(let i=0;i<before.length;i++)assert.ok(Math.abs(Number(after[i].best_effort_timestamp_time)-Number(before[i].best_effort_timestamp_time))<.0001);
  assert.ok(Math.abs(Number(after.at(-1).duration_time)-Number(before.at(-1).duration_time))<.0001);
  assert.deepEqual(audio(output),audio(input));assert.equal(Number(metadata(output).streams[1].start_time),.125);clean(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native video normalizes rotation, preserves anamorphic geometry and an earlier audio start',{skip:!available,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-rotated-video-'));
 try{
  const original=path.join(dir,'original.mov'),input=path.join(dir,'rotated.mov'),output=path.join(dir,'graded.mov');
  ffmpeg(['-copyts','-itsoffset','2.0','-f','lavfi','-i','testsrc2=size=48x32:rate=8:duration=0.375',
   '-itsoffset','1.875','-f','lavfi','-i','sine=frequency=330:sample_rate=48000:duration=0.4',
   '-vf','setsar=4/3','-fps_mode','passthrough','-c:v','prores_ks','-pix_fmt','yuv422p10le','-c:a','pcm_s24le',original]);
  ffmpeg(['-copyts','-display_rotation','90','-i',original,'-map','0','-c','copy',input]);
  assert.ok(metadata(input).streams[0].side_data_list.some(s=>Math.abs(s.rotation)===90));
  const report=await V.renderVideo(recipe(),input,output);
  assert.equal(report.width,32);assert.equal(report.height,48);
  const after=metadata(output);assert.equal(after.streams[0].sample_aspect_ratio,'3:4');
  assert.ok(Math.abs(Number(after.streams[0].start_time)-.125)<.0001);assert.equal(Number(after.streams[1].start_time),0);
  assert.deepEqual(audio(output),audio(input));
  const a=pixels(input),b=pixels(output);assert.equal(a.length,b.length);let sum=0;
  for(let i=0;i<a.length;i+=2)sum+=Math.abs(a.readUInt16LE(i)-b.readUInt16LE(i));
  assert.ok(sum/(a.length/2)<1000,'identity render changed orientation or color substantially');clean(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native video preserves a real transparent ProRes stream',{skip:!available,timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-alpha-video-'));
 try{
  const input=path.join(dir,'alpha.mov'),output=path.join(dir,'graded.mov'),values=new Uint16Array(16*16*4*3);
  for(let i=0;i<16*16*3;i++)values.set([30000+(i%16)*1000,20000,40000,[0,16384,32768,65535][i%4]],i*4);
  ffmpeg(['-f','rawvideo','-pix_fmt','rgba64le','-s','16x16','-framerate','6','-i','pipe:0',
   '-c:v','prores_ks','-profile:v','4','-pix_fmt','yuva444p10le','-alpha_bits','16',input],{input:Buffer.from(values.buffer)});
  const grade=path.join(dir,'grade.json');fs.writeFileSync(grade,JSON.stringify(recipe({look:'velvet'},{bloom:.4,halation:.3})));
  const log=run(process.execPath,[path.resolve(__dirname,'../tools/cli.cjs'),'video-native','--recipe',grade,'--input',input,'--output',output],{encoding:'utf8'});
  assert.match(log,/Saved:.*3 frames/);assert.equal(metadata(output).streams.filter(s=>s.codec_type==='audio').length,0);assert.match(metadata(output).streams[0].pix_fmt,/^yuva/);
  const a=pixels(input),b=pixels(output);assert.equal(a.length,b.length);
  for(let i=6;i<a.length;i+=8)assert.ok(Math.abs(a.readUInt16LE(i)-b.readUInt16LE(i))<=128,'alpha changed beyond output quantization');clean(dir);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('cancelled/failed video jobs and publish races never replace a user output',{skip:!available,timeout:120000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-video-failure-'));
 try{
  const input=path.join(dir,'source.mov'),output=path.join(dir,'graded.mov');
  ffmpeg(['-f','lavfi','-i','color=c=gray:size=32x24:rate=12:duration=0.5','-c:v','prores_ks','-pix_fmt','yuv422p10le',input]);
  const controller=new AbortController();let active=false;
  await assert.rejects(V.renderVideo(recipe({}, {grain:.5}),input,output,{signal:controller.signal,onProgress(event){
   if(event.phase==='render'&&event.frames>0){active=true;controller.abort();}
  }}),e=>e.name==='AbortError');
  assert.equal(active,true);assert.equal(fs.existsSync(output),false);clean(dir);
  await assert.rejects(V.renderVideo(recipe(),input,output,{onProgress(event){
   if(event.phase==='render'&&event.frames>0)throw Error('progress callback failed');
  }}),/progress callback failed/);
  assert.equal(fs.existsSync(output),false);clean(dir);
  await assert.rejects(V.renderVideo(recipe(),input,output,{renderer:process.execPath}));
  assert.equal(fs.existsSync(output),false);clean(dir);
  await assert.rejects(V.renderVideo(recipe(),input,output,{onProgress(event){
   if(event.phase==='publish'){const s=fs.statSync(input);fs.utimesSync(input,s.atime,new Date(s.mtimeMs+2000));}
  }}),/Source media changed/);
  assert.equal(fs.existsSync(output),false);clean(dir);
  await assert.rejects(V.renderVideo(recipe(),input,output,{onProgress(event){
   if(event.phase==='publish')fs.writeFileSync(output,'keep this existing result');
  }}),e=>e.code==='EEXIST');
  assert.equal(fs.readFileSync(output,'utf8'),'keep this existing result');clean(dir);
  await assert.rejects(V.renderVideo(recipe(),input,output),/exists/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
