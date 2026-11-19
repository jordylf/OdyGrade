'use strict';
// Reproducible synthetic moving-frame demo; no third-party footage or downloads.
// Call with explicit work/output directories, keeping scratch media out of outputs.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const E=require('../src/engine.js'),CLI=require('./cli.cjs'),{renderVideo}=require('./native-video.cjs');
async function main(){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!['--work','--output'].includes(args[i])||!args[i+1])throw Error('Expected --work directory --output directory');options[args[i].slice(2)]=path.resolve(args[i+1]);}
 if(!options.work||!options.output)throw Error('Use explicit --work and --output directories.');
 if(options.work===options.output)throw Error('Keep scratch work separate from user-facing outputs.');
 fs.mkdirSync(options.work,{recursive:true});fs.mkdirSync(options.output,{recursive:true});
 const ffmpeg=process.env.ODYGRADE_FFMPEG||'ffmpeg',root=path.resolve(__dirname,'..');
 const source=path.join(options.work,'synthetic-source-log.mov'),grade=path.join(options.work,'synthetic-grade.json');
 const movie=path.join(options.output,'OdyGrade-film-demo.mov'),preview=path.join(options.output,'OdyGrade-film-demo.mp4');
 for(const file of [source,grade,movie,preview])if(fs.existsSync(file))throw Error('Demo file already exists: '+file);
 cp.execFileSync(ffmpeg,['-v','error','-n','-loop','1','-framerate','12','-i',path.join(root,'assets/sample-slog3.png'),
  '-f','lavfi','-i','sine=frequency=330:sample_rate=48000:duration=2',
  '-vf','zoompan=z=1+0.001*on:x=iw/2-iw/(zoom*2):y=ih/2-ih/(zoom*2):d=1:s=480x270:fps=12,scale=out_color_matrix=bt709:out_range=tv',
  '-t','2','-c:v','prores_ks','-profile:v','3','-pix_fmt','yuv422p10le','-colorspace','bt709','-color_primaries','unknown','-color_trc','unknown','-c:a','pcm_s24le',source],{windowsHide:true});
 const settings=E.settings({inputProfile:'sony-slog3-sgamut3cine',strength:.85,look:'amber',shoulder:.2});
 const model=E.fit(CLI.readImage(path.join(root,'assets/sample-slog3.png')),CLI.readImage(path.join(root,'assets/sample-reference.png')),settings);
 const recipe=E.parse(E.serialize(model,settings,{grain:.5,bloom:.25,halation:.35,vignette:.2,bleach:.05,ratio:2.39}));
 fs.writeFileSync(grade,JSON.stringify(recipe,null,2));
 const report=await renderVideo(recipe,source,movie);
 if(report.frames!==24)throw Error('Synthetic demo did not contain the expected 24 frames.');
 cp.execFileSync(ffmpeg,['-v','error','-n','-i',source,'-i',movie,'-filter_complex',
  '[0:v][1:v]hstack=inputs=2,setparams=range=limited:color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709[v]',
  '-map','[v]','-map','1:a:0','-c:v','libx264','-crf','16','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','iec61966-2-1','-colorspace','bt709','-color_range','tv',
  '-c:a','aac','-b:a','128k','-movflags','+faststart',preview],{windowsHide:true});
 fs.writeFileSync(path.join(options.output,'OdyGrade-film-demo.json'),JSON.stringify({
  description:'Synthetic moving illustration: left is encoded source LOG, right is actual native graded output. Not camera footage or an Adobe timeline capture.',
  render:report,inputProfile:settings.inputProfile,settings,film:recipe.film,frames:24,durationSeconds:2,
  audio:'Generated 330 Hz reference tone; mute playback if not needed.'},null,2));
 console.log('Created native synthetic demo:',movie);console.log('Comparison preview (left source LOG / right graded):',preview);
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
