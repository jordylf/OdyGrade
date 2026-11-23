'use strict';
// Offline 16-bit PNG path using the actual compiled core. No shell pipe strings:
// every subprocess receives an argument array and binary stdin/stdout buffers.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const N=require('../src/native-recipe.js'),native=require('./native.cjs');
function run(command,args,options={}){
 return cp.execFileSync(command,args,Object.assign({windowsHide:true,maxBuffer:256*1024*1024},options));
}
function renderStill(recipe,input,output){
 if(path.extname(output).toLowerCase()!=='.png')throw Error('Native still output must be .png to preserve 16-bit channels.');
 if(fs.existsSync(output))throw Error('Output already exists: '+output);
 const snapshot=N.compile(recipe),exe=native.executable();
 if(!fs.existsSync(exe))throw Error('Native renderer is not built. Run npm run native:build.');
 const probe=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',input],{encoding:'utf8'}));
 const stream=probe.streams[0];
 if(!stream||stream.width<1||stream.height<1||stream.width*stream.height>40000000)throw Error('Image must be at most 40 megapixels.');
 const {width,height}=stream,raw=run('ffmpeg',['-v','error','-i',input,'-frames:v','1','-pix_fmt','rgba64le','-f','rawvideo','pipe:1']);
 if(raw.length!==width*height*8)throw Error('Unexpected image dimensions; normalize orientation first.');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-native-'));
 try{
  const file=path.join(temp,'grade.odyn');fs.writeFileSync(file,snapshot);
  const graded=run(exe,[file,String(width),String(height),'rgba16','rgba16'],{input:raw});
  if(graded.length!==raw.length)throw Error('Native renderer produced an incomplete frame.');
  run('ffmpeg',['-v','error','-n','-f','rawvideo','-pix_fmt','rgba64le','-s',width+'x'+height,
   '-i','pipe:0','-frames:v','1','-pix_fmt','rgba64be',output],{input:graded});
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
module.exports={renderStill};
