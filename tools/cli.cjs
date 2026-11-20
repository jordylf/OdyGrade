#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const E=require('../src/engine.js'),F=require('../src/film.js');
const N=require('../src/native-recipe.js');
const CM=require('../src/color-management.js');
function args(argv){
 const out={command:argv[0]};
 for(let i=1;i<argv.length;i+=2){if(!/^--[a-z]+$/.test(argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('Expected --key value');out[argv[i].slice(2)]=argv[i+1];}
 return out;
}
function required(o,k){if(!o[k])throw Error('Missing --'+k);return o[k];}
function readImage(filename){
 const p=cp.execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',filename],{encoding:'utf8',windowsHide:true});
 const s=JSON.parse(p).streams[0];if(!s||s.width*s.height>16000000)throw Error('Image must be at most 16 megapixels');
 const raw=cp.execFileSync('ffmpeg',['-v','error','-i',filename,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:128*1024*1024,windowsHide:true});
 // ffmpeg autorotation can swap dimensions. Refuse unexpected layout instead of misreading it.
 if(raw.length!==s.width*s.height*4)throw Error('Unexpected image dimensions; normalize image orientation first.');
 return {width:s.width,height:s.height,data:new Uint8ClampedArray(raw)};
}
function writeImage(image,filename){
 cp.execFileSync('ffmpeg',['-v','error','-n','-f','rawvideo','-pix_fmt','rgba','-s',image.width+'x'+image.height,
 '-i','pipe:0','-frames:v','1',filename],{input:Buffer.from(image.data),maxBuffer:128*1024*1024,windowsHide:true});
}
function recipe(filename){return E.parse(fs.readFileSync(filename,'utf8'));}
function main(argv){
 const a=args(argv);
 if(!a.command||a.command==='help'){console.log(
 'OdyGrade CLI (ffmpeg + ffprobe required for images/video)\n'+
 'profiles — list supported source encodings\n'+
 'fit --source frame.png --reference ref.png --output grade.json [--profile srgb]\n'+
 'fit-shot --input shot.mov --reference ref.png --output grade.json [--profile srgb] [--samples 9] [--start 0] [--duration 3]\n'+
 'cube --recipe grade.json --output look.cube [--size 33]\n'+
 'still --recipe grade.json --input frame.png --output graded.png\n'+
 'native --recipe grade.json --output grade.odyn\n'+
 'still-native --recipe grade.json --input frame.png --output graded16.png\n'+
 'video --recipe grade.json --input clip.mp4 --output graded.mov\n'+
 'video-native --recipe grade.json --input clip.mp4 --output graded-film.mov\n'+
 'Video is color-only ProRes 422 HQ 10-bit / PCM audio; spatial film controls must be zero.\n'+
 'video-native uses the compiled core for the full film stack and preserves source frame timing.\n'+
 'Source encoding is explicit in each recipe. Output is sRGB SDR. Existing files are never overwritten.');return;}
 if(a.command==='profiles'){for(const [id,p] of Object.entries(CM.PROFILES))console.log(id+' — '+p.name);return;}
 const output=path.resolve(required(a,'output'));if(fs.existsSync(output))throw Error('Output already exists: '+output);
 if(a.command==='fit'){
  const settings=E.settings({inputProfile:a.profile||'srgb'});
  const m=E.fit(readImage(required(a,'source')),readImage(required(a,'reference')),settings);
  fs.writeFileSync(output,E.serialize(m,settings,F.DEFAULTS),{flag:'wx'});
 }else if(a.command==='fit-shot'){
  const input=required(a,'input'),reference=readImage(required(a,'reference')),controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  return require('./fit-shot.cjs').fitShot(input,reference,output,{signal:controller.signal,profile:a.profile,
   samples:a.samples===undefined?9:Number(a.samples),start:a.start===undefined?0:Number(a.start),duration:a.duration===undefined?undefined:Number(a.duration)})
   .then(result=>{console.log('Saved: '+result.output+' ('+result.samples+' sampled frames)');return result;})
   .finally(()=>{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);});
 }else if(a.command==='cube'){
  const r=recipe(required(a,'recipe'));fs.writeFileSync(output,E.cube(r.model,r.settings,Number(a.size||33)),{flag:'wx'});
 }else if(a.command==='still'){
  const r=recipe(required(a,'recipe')),im=readImage(required(a,'input'));
  writeImage(F.apply(E.render(im,r.model,r.settings),r.film),output);
 }else if(a.command==='native'){
  fs.writeFileSync(output,N.compile(recipe(required(a,'recipe'))),{flag:'wx'});
 }else if(a.command==='still-native'){
  require('./native-still.cjs').renderStill(recipe(required(a,'recipe')),required(a,'input'),output);
 }else if(a.command==='video-native'){
  const controller=new AbortController(),cancel=()=>controller.abort();
  process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  return require('./native-video.cjs').renderVideo(recipe(required(a,'recipe')),required(a,'input'),output,{signal:controller.signal})
   .then(result=>{console.log('Saved: '+result.output+' ('+result.frames+' frames, '+result.mode+')');return result;})
   .finally(()=>{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);});
 }else if(a.command==='video'){
  const r=recipe(required(a,'recipe')),film=F.normalize(r.film);
  if(Object.keys(film).some(k=>film[k]!==F.DEFAULTS[k]))throw Error('Video renderer supports color only. Set spatial film controls to zero.');
  if(path.extname(output).toLowerCase()!=='.mov')throw Error('Video output must be .mov (ProRes).');
  const input=path.resolve(required(a,'input')),dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-'));
  try{
   fs.writeFileSync(path.join(dir,'grade.cube'),E.cube(r.model,r.settings,33));
   cp.execFileSync('ffmpeg',['-hide_banner','-n','-i',input,'-map','0:v:0','-map','0:a?',
    '-vf','lut3d=file=grade.cube:interp=tetrahedral','-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le',
    '-c:a','pcm_s16le',output],{cwd:dir,windowsHide:true,stdio:'inherit'});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }else throw Error('Unknown command: '+a.command);
 console.log('Saved: '+output);
}
if(require.main===module){
 const fail=e=>{console.error(e.message);process.exitCode=e.name==='AbortError'?130:1;};
 try{Promise.resolve(main(process.argv.slice(2))).catch(fail);}catch(e){fail(e);}
}
module.exports={readImage,writeImage,main};
