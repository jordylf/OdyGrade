'use strict';
// Explicit single-shot analysis: time-uniform samples, one frozen match model.
const fs=require('node:fs'),path=require('node:path');
const E=require('../src/engine.js'),F=require('../src/film.js');
const {inspectVideo}=require('./native-video.cjs'),{context,tools}=require('./media-process.cjs');

function samplePlan(video,{samples=9,start=0,duration}={}){
 if(!Number.isInteger(samples)||samples<1||samples>32)throw Error('Samples must be an integer from 1 to 32.');
 if(!Number.isFinite(start)||start<0||duration!==undefined&&(!Number.isFinite(duration)||duration<=0))throw Error('Invalid shot range in seconds.');
 const times=video.pts.map(p=>(p-video.pts[0])*video.tb.value);
 const end=(video.pts.at(-1)-video.pts[0]+video.durations.at(-1))*video.tb.value;
 const until=duration===undefined?end:start+duration;
 if(start>=end||until>end+1e-7)throw Error('Shot range exceeds the video duration.');
 const candidates=times.map((time,index)=>({time,index})).filter(x=>x.time>=start-1e-9&&x.time<until-1e-9);
 if(!candidates.length)throw Error('Shot range contains no frame presentation timestamps.');
 const count=Math.min(samples,candidates.length),selected=new Set();
 // Nearest PTS to uniformly spaced times, never nearest frame number for VFR.
 for(let i=0;i<count;i++){
  const target=count===1?(start+until)/2:start+(until-start)*i/(count-1);
  let nearest=candidates[0];
  for(const c of candidates)if(Math.abs(c.time-target)<Math.abs(nearest.time-target))nearest=c;
  selected.add(nearest.index);
 }
 const indices=[...selected].sort((a,b)=>a-b);
 const scale=Math.min(1,512/Math.max(video.width,video.height));
 return {indices,times:indices.map(i=>times[i]),start,end:until,
  width:Math.max(1,Math.round(video.width*scale)),height:Math.max(1,Math.round(video.height*scale))};
}
function identity(file){const s=fs.statSync(file);return [s.size,s.mtimeMs,s.ino].join(':');}
async function fitShot(input,reference,output,options={}){
 input=path.resolve(input);output=path.resolve(output);
 if(fs.existsSync(output))throw Error('Output already exists: '+output);
 // The reference is an already decoded sRGB still, just as for E.fit.
 const settings=E.settings({inputProfile:options.profile||'srgb'}),before=identity(input);
 const video=await inspectVideo(input,options),p=samplePlan(video,options),ctx=context(options),commands=tools(options);
 let job;
 try{
  ctx.check();await options.onProgress?.({phase:'sample',indices:p.indices,times:p.times});ctx.check();
  const select=p.indices.map(i=>'eq(n,'+i+')').join('+');
  const raw=await ctx.collectBuffer(commands.ffmpeg,['-v','error','-xerror','-i',input,'-map','0:'+video.video.index,
   '-an','-sn','-dn','-vf',"select='"+select+"',scale="+p.width+':'+p.height+':flags=area',
   '-frames:v',String(p.indices.length),'-fps_mode','passthrough','-f','rawvideo','-pix_fmt','rgba','pipe:1'],
   p.width*p.height*4*p.indices.length);
  const frameBytes=p.width*p.height*4;
  if(raw.length!==frameBytes*p.indices.length)throw Error('Shot decoder returned an unexpected frame count.');
  const frames=p.indices.map((_,i)=>({width:p.width,height:p.height,
   data:new Uint8ClampedArray(raw.subarray(i*frameBytes,(i+1)*frameBytes))}));
  const model=E.fitFrames(frames,reference,settings);
  const recipe=JSON.parse(E.serialize(model,settings,F.DEFAULTS));
  recipe.analysis={method:'time-uniform-shot-v1',sampleIndices:p.indices,sampleSeconds:p.times,
   rangeStart:p.start,rangeEnd:p.end,width:p.width,height:p.height,
   sourceFrames:video.frames,precision:'8-bit RGBA analysis',singleShot:true};
  await options.onProgress?.({phase:'publish',samples:frames.length});ctx.check();
  if(identity(input)!==before)throw Error('Source changed during shot analysis.');
  const parent=fs.realpathSync(path.dirname(output));job=fs.mkdtempSync(path.join(parent,'.odygrade-analysis-'));
  const staged=path.join(job,'grade.json');fs.writeFileSync(staged,JSON.stringify(recipe,null,2)+'\n');
  E.parse(fs.readFileSync(staged,'utf8'));
  try{fs.linkSync(staged,output);}catch(e){if(!['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(e.code))throw e;fs.copyFileSync(staged,output,fs.constants.COPYFILE_EXCL);}
  return {output,samples:frames.length,analysis:recipe.analysis,warnings:model.warnings};
 }finally{
  await ctx.stop();
  if(job){
   if(path.dirname(path.resolve(job))!==fs.realpathSync(path.dirname(output))||!path.basename(job).startsWith('.odygrade-analysis-'))throw Error('Refusing cleanup outside analysis staging');
   fs.rmSync(job,{recursive:true,force:true});
  }
 }
}
module.exports={fitShot,samplePlan};
