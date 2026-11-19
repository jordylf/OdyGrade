'use strict';
// Supervised binary media helpers shared by offline analysis and rendering.
const cp=require('node:child_process'),path=require('node:path');
function abortError(){const error=Error('Video render cancelled.');error.name='AbortError';return error;}
function tools(options){return {ffmpeg:options.ffmpeg||process.env.ODYGRADE_FFMPEG||'ffmpeg',ffprobe:options.ffprobe||process.env.ODYGRADE_FFPROBE||'ffprobe'};}
function context(options){
 const children=new Set(),pending=new Set(),signal=options.signal;
 function check(){if(signal?.aborted)throw abortError();}
 function kill(){for(const child of children)if(child.exitCode===null&&!child.killed)child.kill();}
 const onAbort=()=>kill();signal?.addEventListener('abort',onAbort);
 function start(command,args,cwd){
  check();const child=cp.spawn(command,args,{cwd,windowsHide:true,stdio:['pipe','pipe','pipe']});children.add(child);
  let stderr='';child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-8192);});
  const done=new Promise((resolve,reject)=>{
   child.once('error',e=>reject(Error(path.basename(command)+' could not start: '+e.message)));
   child.once('close',(code,sig)=>{children.delete(child);if(signal?.aborted)reject(abortError());
    else if(code!==0)reject(Error(path.basename(command)+' failed ('+(sig||code)+'): '+stderr.trim()));else resolve();});
  });pending.add(done);done.then(()=>pending.delete(done),()=>pending.delete(done));return {child,done};
 }
 async function collectBuffer(command,args,limit=64*1024*1024,cwd){
  const process=start(command,args,cwd),chunks=[];let length=0,overflow=false;
  process.child.stdin.end();process.child.stdout.on('data',chunk=>{length+=chunk.length;if(length>limit){overflow=true;process.child.kill();}else chunks.push(chunk);});
  try{await process.done;}catch(e){if(overflow)throw Error('Media probe exceeded its bounded output limit.');throw e;}
  check();return Buffer.concat(chunks);
 }
 async function collect(command,args,limit,cwd){return (await collectBuffer(command,args,limit,cwd)).toString('utf8');}
 async function run(command,args,cwd){await collect(command,args,1024*1024,cwd);}
 async function stop(){kill();await Promise.allSettled([...pending]);signal?.removeEventListener('abort',onAbort);}
 return {check,start,collect,collectBuffer,run,stop,signal};
}
module.exports={abortError,tools,context};
