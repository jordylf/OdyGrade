const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const E=require('../src/engine.js'),F=require('../src/film.js'),cli=require('../tools/cli.cjs');
const available=cp.spawnSync('ffmpeg',['-version'],{windowsHide:true}).status===0&&cp.spawnSync('ffprobe',['-version'],{windowsHide:true}).status===0;
const command=path.resolve(__dirname,'../tools/cli.cjs');
function run(args){return cp.execFileSync(process.execPath,[command,...args],{encoding:'utf8',windowsHide:true,maxBuffer:1024*1024*10});}
function image(){const data=new Uint8ClampedArray(64*48*4);for(let i=0;i<64*48;i++)data.set([20+i%220,30+(i*7)%200,40+(i*13)%180,255],i*4);return {width:64,height:48,data};}
test('real PNG + FFmpeg .cube interoperability and no overwrite',{skip:!available},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-test-'));
 try{
  const input=path.join(dir,'input with spaces.png'),output=path.join(dir,'output.png'),cube=path.join(dir,'grade.cube'),r=path.join(dir,'grade.json');
  cli.writeImage(image(),input);const im=cli.readImage(input);assert.deepEqual(im.data,image().data);
  fs.writeFileSync(r,E.serialize(null,{look:'amber'},F.DEFAULTS));
  run(['still','--recipe',r,'--input',input,'--output',output]);
  const direct=cli.readImage(output);
  run(['cube','--recipe',r,'--output',cube,'--size','33']);
  const lutOutput=path.join(dir,'lut.png');
  cp.execFileSync('ffmpeg',['-v','error','-i',input,'-vf','lut3d=file=grade.cube:interp=tetrahedral','-frames:v','1',lutOutput],{cwd:dir,windowsHide:true});
  const baked=cli.readImage(lutOutput);let sum=0,max=0;
  for(let i=0;i<baked.data.length;i++){const d=Math.abs(baked.data[i]-direct.data[i]);sum+=d;max=Math.max(max,d);}
  assert.ok(sum/baked.data.length<1.1,'mean cube error: '+sum/baked.data.length);
  assert.ok(max<12,'max cube error: '+max);
  assert.throws(()=>run(['still','--recipe',r,'--input',input,'--output',output]));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('real video render preserves frame count, emits 10-bit ProRes and audio',{skip:!available},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-video-test-'));
 try{
  const input=path.join(dir,'clip with spaces.mov'),output=path.join(dir,'graded.mov'),r=path.join(dir,'grade.json');
  cp.execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=64x48:rate=12:duration=1',
   '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=1','-c:v','prores_ks','-profile:v','1',
   '-c:a','pcm_s16le','-shortest',input],{windowsHide:true});
  fs.writeFileSync(r,E.serialize(null,{look:'coast'},F.DEFAULTS));
  run(['video','--recipe',r,'--input',input,'--output',output]);
  const p=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_entries','stream=codec_name,nb_frames,pix_fmt','-of','json',output],{encoding:'utf8',windowsHide:true}));
  assert.equal(p.streams[0].codec_name,'prores');assert.equal(p.streams[0].pix_fmt,'yuv422p10le');
  assert.equal(Number(p.streams[0].nb_frames),12);assert.equal(p.streams[1].codec_name,'pcm_s16le');
  fs.writeFileSync(r,E.serialize(null,{},Object.assign({},F.DEFAULTS,{grain:.5})));
  assert.throws(()=>run(['video','--recipe',r,'--input',input,'--output',path.join(dir,'bad.mov')]));
  assert.equal(fs.existsSync(path.join(dir,'bad.mov')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('camera profile persists through CLI fitting and exported 65-cube is read by FFmpeg',{skip:!available},t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-camera-test-'));
 try{
  const source=image(),input=path.join(dir,'camera.png');cli.writeImage(source,input);
  for(const profile of ['sony-slog3-sgamut3cine','panasonic-vlog-vgamut']){
   const direct=E.render(source,null,{inputProfile:profile}),reference=path.join(dir,profile+'-ref.png');
   cli.writeImage(direct,reference);
   const grade=path.join(dir,profile+'.json');
   run(['fit','--source',input,'--reference',reference,'--output',grade,'--profile',profile]);
   const r=E.parse(fs.readFileSync(grade,'utf8'));assert.equal(r.settings.inputProfile,profile);assert.equal(r.model.inputProfile,profile);
   fs.writeFileSync(path.join(dir,'camera.cube'),E.cube(null,{inputProfile:profile},65));
   const output=path.join(dir,profile+'-lut.png');
   cp.execFileSync('ffmpeg',['-v','error','-i',input,'-vf','lut3d=file=camera.cube:interp=tetrahedral','-frames:v','1',output],{cwd:dir,windowsHide:true});
   const baked=cli.readImage(output);let sum=0,max=0;
   for(let i=0;i<baked.data.length;i++){const delta=Math.abs(baked.data[i]-direct.data[i]);sum+=delta;max=Math.max(max,delta);}
   const mean=sum/baked.data.length;t.diagnostic(profile+' LUT error: mean='+mean.toFixed(4)+', max='+max+' code values');
   assert.ok(mean<2,'camera LUT mean error: '+mean);assert.ok(max<25,'camera LUT max error: '+max);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
