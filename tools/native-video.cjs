'use strict';
// Offline validation/render pipeline for the portable core. It is not timeline
// integration. Raw pixels use binary Node streams; original PTS are verified.
const fs=require('node:fs'),path=require('node:path');
const {abortError,tools,context}=require('./media-process.cjs');
const {Transform}=require('node:stream'),{pipeline}=require('node:stream/promises');
const N=require('../src/native-recipe.js'),native=require('./native.cjs');
function rational(text,separator='/'){
 const parts=String(text).split(separator).map(Number);
 if(parts.length!==2||parts.some(x=>!Number.isSafeInteger(x)||x<=0)||parts.some(x=>x>2147483647))throw Error('Invalid media timebase or aspect ratio: '+text);
 return {num:parts[0],den:parts[1],value:parts[0]/parts[1],text:parts.join('/')};
}
function gcd(a,b){while(b){const next=a%b;a=b;b=next;}return a;}
function rateFromTicks(timebase,ticks){const num=timebase.den,den=timebase.num*ticks,g=gcd(num,den);return (num/g)+'/'+(den/g);}
function plan(metadata,frameData,alpha){
 const video=metadata.streams.find(s=>s.codec_type==='video'&&!(s.disposition&&s.disposition.attached_pic));
 if(!video)throw Error('Input has no video stream.');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer))throw Error('HDR input needs an explicit supported conversion before SDR rendering.');
 if(video.field_order&&!['unknown','progressive'].includes(video.field_order))throw Error('Native video rendering currently requires progressive input.');
 const tb=rational(video.time_base),frames=frameData.frames||[];
 if(!frames.length)throw Error('Input has no decoded video frames.');
 const pts=frames.map(f=>Number(f.best_effort_timestamp));
 if(pts.some((p,i)=>!Number.isSafeInteger(p)||(i&&p<=pts[i-1])))throw Error('Input needs strictly increasing, known presentation timestamps.');
 if(frames.some(f=>f.width!==video.width||f.height!==video.height))throw Error('Changing frame dimensions are not supported.');
 const durations=pts.slice(1).map((p,i)=>p-pts[i]);
 let last=Number(frames.at(-1).duration||frames.at(-1).pkt_duration);
 if(!Number.isSafeInteger(last)||last<=0){
  const end=Number(video.start_pts)+Number(video.duration_ts);
  last=Number.isSafeInteger(end)&&end>pts.at(-1)?end-pts.at(-1):NaN;
 }
 if(!Number.isSafeInteger(last)||last<=0)throw Error('Cannot determine final frame duration.');
 durations.push(last);
 let rotation=Number((video.side_data_list||[]).find(s=>s.rotation!==undefined)?.rotation||video.tags?.rotate||0);
 if(!Number.isFinite(rotation)||Math.abs(rotation/90-Math.round(rotation/90))>1e-6)throw Error('Normalize non-right-angle rotation before rendering.');
 rotation=((rotation%360)+360)%360;
 let sar=video.sample_aspect_ratio&&!['N/A','0:1'].includes(video.sample_aspect_ratio)?rational(video.sample_aspect_ratio,':'):rational('1/1');
 let width=video.width,height=video.height;
 if(rotation===90||rotation===270){[width,height]=[height,width];sar=rational(sar.den+'/'+sar.num);}
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>16000000)throw Error('Video must be at most 16 megapixels per frame.');
 if(sar.value<1/16||sar.value>16)throw Error('Unsupported pixel aspect ratio.');
 const cfr=durations.every(d=>d===durations[0]);
 const audio=metadata.streams.filter(s=>s.codec_type==='audio'),videoOrigin=pts[0]*tb.value;
 const origin=Math.min(videoOrigin,...audio.map(s=>Number(s.start_time||0)));
 if(!Number.isFinite(origin))throw Error('Audio stream has an unknown start time.');
 return {video,width,height,sar,tb,pts,durations,cfr,alpha,frames:frames.length,
  origin,videoOrigin,rate:rateFromTicks(tb,durations[0]),audio};
}
async function probe(input,ctx,commands){
 const metadata=JSON.parse(await ctx.collect(commands.ffprobe,['-v','error','-show_streams','-show_format','-of','json',input]));
 const videos=metadata.streams.filter(s=>s.codec_type==='video');
 const video=videos.find(s=>!s.disposition?.attached_pic);
 if(!video)throw Error('Input has no video stream.');
 const frames=JSON.parse(await ctx.collect(commands.ffprobe,['-v','error','-select_streams',String(video.index),
  '-show_frames','-show_entries','frame=best_effort_timestamp,duration,pkt_duration,width,height','-of','json',input]));
 const formats=JSON.parse(await ctx.collect(commands.ffprobe,['-v','error','-show_pixel_formats','-of','json']));
 const descriptor=formats.pixel_formats.find(p=>p.name===video.pix_fmt);
 if(!descriptor)throw Error('Unknown input pixel format: '+video.pix_fmt);
 return plan(metadata,frames,!!descriptor.flags.alpha);
}
function encoderOptions(p){
 const alpha=p.alpha||p.width%2!==0;
 return ['-vf','scale=out_color_matrix=bt709:out_range=tv,setsar='+p.sar.text+':max=2147483647,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709',
  '-c:v','prores_ks','-profile:v',alpha?'4':'3','-pix_fmt',alpha?'yuva444p10le':'yuv422p10le',
  '-alpha_bits',p.alpha?'16':'0',
  '-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-color_range','tv',
  '-fps_mode','passthrough','-enc_time_base:v',p.tb.text,'-video_track_timescale',String(p.tb.den),'-movflags','+write_colr','-an','-map_metadata','-1'];
}
function clockedImages(p){
 const lines=['ffconcat version 1.0'];
 // A duplicate endpoint makes the previous (real) frame's duration explicit.
 // It is removed by stream-copying only the original frame count at publish.
 for(let i=0;i<=p.frames;i++){
  lines.push('file frame-'+String(Math.min(i,p.frames-1)+1).padStart(8,'0')+'.png');
  lines.push('option framerate '+p.tb.den+'/'+p.tb.num);
  lines.push('duration '+(i<p.frames?p.durations[i]*p.tb.value:p.tb.value).toFixed(12));
 }
 return lines.join('\n')+'\n';
}
async function renderVideo(recipe,input,output,options={}){
 input=path.resolve(input);output=path.resolve(output);
 if(path.extname(output).toLowerCase()!=='.mov')throw Error('Native video output must be .mov (ProRes).');
 if(fs.existsSync(output))throw Error('Output already exists: '+output);
 const snapshot=N.compile(recipe),exe=options.renderer||native.executable();
 if(!fs.existsSync(exe))throw Error('Native renderer is not built. Run npm run native:build.');
 const ctx=context(options),commands=tools(options);let job=null;
 const emit=event=>options.onProgress?.(event);
 try{
  ctx.check();const initial=fs.statSync(input),identity={size:initial.size,mtimeMs:initial.mtimeMs,ino:initial.ino};
  await emit({phase:'probe'});const p=await probe(input,ctx,commands);ctx.check();
  const parent=fs.realpathSync(path.dirname(output));job=fs.mkdtempSync(path.join(parent,'.odygrade-job-'));
  if(path.dirname(path.resolve(job))!==parent||!path.basename(job).startsWith('.odygrade-job-'))throw Error('Unexpected render staging directory.');
  const spec=path.join(job,'grade.odyn'),intermediate=path.join(job,'graded-video.mov'),staged=path.join(job,'complete.mov');fs.writeFileSync(spec,snapshot);
  const bytes=p.width*p.height*8,expected=bytes*p.frames;let received=0,lastProgress=-1;
  await emit({phase:'render',frames:0,total:p.frames,mode:p.cfr?'stream-cfr':'cache-vfr'});
  const decode=ctx.start(commands.ffmpeg,['-v','error','-xerror','-i',input,'-map','0:'+p.video.index,'-an','-sn','-dn',
   '-fps_mode','passthrough','-pix_fmt','rgba64le','-f','rawvideo','pipe:1'],job);
  const render=ctx.start(exe,[spec,String(p.width),String(p.height),'rgba16','rgba16','0',String(p.sar.value)],job);
  const sinkArgs=p.cfr?['-v','error','-n','-f','rawvideo','-pix_fmt','rgba64le','-s',p.width+'x'+p.height,
    '-framerate',p.rate,'-i','pipe:0',...encoderOptions(p),intermediate]:
   ['-v','error','-n','-f','rawvideo','-pix_fmt','rgba64le','-s',p.width+'x'+p.height,
    '-framerate',p.rate,'-i','pipe:0','-fps_mode','passthrough','-c:v','png','-compression_level','1','-pix_fmt','rgba64be',
    path.join(job,'frame-%08d.png')];
  const sink=ctx.start(commands.ffmpeg,sinkArgs,job);decode.child.stdin.end();sink.child.stdout.resume();
  const counter=new Transform({transform(chunk,encoding,callback){
   received+=chunk.length;const frames=Math.floor(received/bytes);
   if(received>expected){callback(Error('Renderer produced more pixels than the source timeline.'));return;}
   if(frames!==lastProgress){lastProgress=frames;Promise.resolve().then(()=>emit({phase:'render',frames,total:p.frames})).then(()=>callback(null,chunk),callback);}
   else callback(null,chunk);
  }});
  try{await Promise.all([pipeline(decode.child.stdout,render.child.stdin),pipeline(render.child.stdout,counter,sink.child.stdin),decode.done,render.done,sink.done]);}
  catch(e){await ctx.stop();await Promise.allSettled([decode.done,render.done,sink.done]);throw e;}
  if(received!==expected)throw Error('Renderer frame count differs from the probed source timeline.');ctx.check();
  let videoForMux=intermediate;
  if(!p.cfr){
   await emit({phase:'timing',frames:p.frames,total:p.frames});fs.writeFileSync(path.join(job,'frames.ffconcat'),clockedImages(p));
   await ctx.run(commands.ffmpeg,['-v','error','-n','-f','concat','-safe','0','-i','frames.ffconcat',...encoderOptions(p),intermediate],job);
   // Trim the extra timing endpoint before adding audio. A shared -frames:v cap
   // during final muxing could otherwise stop processing before the audio tail.
   videoForMux=path.join(job,'clocked-video.mov');
   await ctx.run(commands.ffmpeg,['-v','error','-n','-copyts','-i',intermediate,'-map','0:v:0','-c:v','copy',
   '-frames:v',String(p.frames),'-video_track_timescale',String(p.tb.den),'-movflags','+write_colr',videoForMux],job);
  }
  await emit({phase:'audio',frames:p.frames,total:p.frames});ctx.check();
  const mux=['-v','error','-n','-copyts','-itsoffset',(p.videoOrigin-p.origin).toFixed(12),'-i',videoForMux,'-i',input,'-map','0:v:0','-map','1:a?',
   '-c:v','copy','-map_metadata','-1','-avoid_negative_ts','disabled','-video_track_timescale',String(p.tb.den),'-movflags','+write_colr'];
  if(p.audio.length)mux.push('-af','asetpts=PTS-('+p.origin.toFixed(12)+')/TB','-c:a','pcm_s24le');
  mux.push(staged);await ctx.run(commands.ffmpeg,mux,job);
  await emit({phase:'verify',frames:p.frames,total:p.frames});const actual=await probe(staged,ctx,commands);
  const tolerance=p.tb.value+actual.tb.value+1e-7;
  if(actual.frames!==p.frames||actual.width!==p.width||actual.height!==p.height)throw Error('Output frame count or dimensions changed.');
  if(Math.abs(actual.sar.value-p.sar.value)>1e-7)throw Error('Output pixel aspect ratio changed.');
  if(p.alpha&&!actual.alpha)throw Error('Output lost the alpha channel.');
  if(actual.video.color_primaries!=='bt709'||actual.video.color_transfer!=='iec61966-2-1'||actual.video.color_space!=='bt709')
   throw Error('Output color metadata does not match the sRGB/BT.709 encoding.');
  for(let i=0;i<p.frames;i++){
   const got=actual.pts[i]*actual.tb.value,wanted=p.pts[i]*p.tb.value-p.origin;
   if(Math.abs(got-wanted)>tolerance)throw Error('Output timestamp changed at frame '+i+' ('+wanted+' -> '+got+').');
  }
  if(Math.abs(actual.durations.at(-1)*actual.tb.value-p.durations.at(-1)*p.tb.value)>tolerance)
   throw Error('Final frame duration changed ('+p.durations.at(-1)*p.tb.value+' -> '+actual.durations.at(-1)*actual.tb.value+').');
  if(actual.audio.length!==p.audio.length)throw Error('Output audio stream count changed.');
  for(let i=0;i<p.audio.length;i++){
   const expectedStart=Number(p.audio[i].start_time||0)-p.origin,actualStart=Number(actual.audio[i].start_time||0);
   if(Math.abs(actualStart-expectedStart)>1/Number(p.audio[i].sample_rate)+.0001)throw Error('Output audio start is not aligned with the source video.');
  }
  ctx.check();await emit({phase:'publish',frames:p.frames,total:p.frames});ctx.check();
  const finalInput=fs.statSync(input);
  if(finalInput.size!==identity.size||finalInput.mtimeMs!==identity.mtimeMs||finalInput.ino!==identity.ino)
   throw Error('Source media changed during rendering; no output was published.');
  // Atomic no-replace hard link on supported filesystems; exclusive copy fallback.
  try{fs.linkSync(staged,output);}catch(e){if(!['EPERM','ENOTSUP','EOPNOTSUPP','EXDEV'].includes(e.code))throw e;fs.copyFileSync(staged,output,fs.constants.COPYFILE_EXCL);}
  return {output,frames:p.frames,width:p.width,height:p.height,mode:p.cfr?'stream-cfr':'cache-vfr',audioStreams:p.audio.length,alpha:p.alpha};
 }catch(e){if(ctx.signal?.aborted)throw abortError();throw e;}
 finally{
  await ctx.stop();
  if(job){const resolved=path.resolve(job);if(path.dirname(resolved)!==fs.realpathSync(path.dirname(output))||!path.basename(resolved).startsWith('.odygrade-job-'))throw Error('Refusing cleanup outside render staging');fs.rmSync(resolved,{recursive:true,force:true});}
 }
}
async function inspectVideo(input,options={}){
 const ctx=context(options);try{return await probe(path.resolve(input),ctx,tools(options));}finally{await ctx.stop();}
}
module.exports={renderVideo,inspectVideo,plan,clockedImages};
