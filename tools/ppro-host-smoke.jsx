/* Premiere 2024 host smoke for the native OdyGrade effect. Started by the dev-only
   CEP runner in tools/ppro-smoke-runner (installed temporarily by run-ppro-smoke.ps1).
   Safety contract:
   - Inert unless %TEMP%/odygrade-ppro-job.txt exists; the job file is deleted first,
     so each job runs once.
   - Refuses unless NO project is open: never closes, saves or replaces a user project.
   - Creates its own NEW project in the scratch folder; only that project is saved,
     closed and reopened (path checked before each). Never overwrites files. */
(function(){
 var job=new File(Folder.temp.fsName+'/odygrade-ppro-job.txt');
 if(!job.exists)return;
 job.open('r');var root=job.read().replace(/^\s+|\s+$/g,'');job.close();job.remove();
 // "reopen <dir>" = phase 2. Phase 1 stops after save: closeDocument ends the script in PPro 24.
 // "apply <dir>" = phase 3: exercise host/bridge.jsx OdyHost.apply in that open scratch project.
 // "export <dir>": queue the scratch sequence in Media Encoder (PNG sequence) + Premiere reference frame.
 // "depth <dir>": render clip-2 frame with sequence Maximum Bit Depth off, then on (32f path).
 // "real <dir>": NEW scratch project with <dir>/source.mov, src frames, panel apply (params only).
 // "rframes <dir>": after the manual "Load native grade..." click, export graded frames.
 var reopen=root.indexOf('reopen ')===0,applying=root.indexOf('apply ')===0,probe=root.indexOf('probe ')===0,exporting=root.indexOf('export ')===0,depth=root.indexOf('depth ')===0;
 // "reapply <dir>": panel apply again onto the clip that already has OdyGrade (Look Amber, Grain 35).
 // "snap <dir>|<name>": read-only except one PNG <name>.png at 1.5 s + Look/Grain/link values.
 var real=root.indexOf('real ')===0,rframes=root.indexOf('rframes ')===0,reapply=root.indexOf('reapply ')===0,snap=root.indexOf('snap ')===0,sname='';
 if(reopen||exporting)root=root.substring(7);if(applying||probe||depth)root=root.substring(6);if(real||snap)root=root.substring(5);if(rframes||reapply)root=root.substring(8);
 if(snap){sname=root.substring(root.lastIndexOf('|')+1);root=root.substring(0,root.lastIndexOf('|'));}
 if(probe){  // read-only: report each clip's Grade link value in the active sequence
  var pr=new File(root+'/probe-'+new Date().getTime()+'.txt'),ps=app.project.activeSequence,pv=[];
  for(var pi=0;ps&&pi<ps.videoTracks[0].clips.numItems;pi++){var pcs=ps.videoTracks[0].clips[pi].components;
   for(var pj=0;pj<pcs.numItems;pj++)if(pcs[pj].displayName==='OdyGrade')for(var pk=0;pk<pcs[pj].properties.numItems;pk++)if(pcs[pj].properties[pk].displayName==='Grade link')pv.push(pi+':'+pcs[pj].properties[pk].getValue());}
  // API reflection (read-only): what can remove/disable an effect from script?
  var qi=null;try{app.enableQE();var qt=qe.project.getActiveSequence().getVideoTrackAt(0);for(var qk=0;qk<qt.numItems;qk++)if(qt.getItemAt(qk).type!=='Empty'){qi=qt.getItemAt(qk);break;}}catch(qx){pv.push('qe err '+qx);}
  function names(o){var r=[];try{var m=o.reflect.methods;for(var mi=0;mi<m.length;mi++)r.push(m[mi].name);}catch(rx){r.push('err '+rx);}return r.join(',');}
  if(ps&&ps.videoTracks[0].clips.numItems){var pc0=ps.videoTracks[0].clips[0];pv.push('\nTrackItem: '+names(pc0));pv.push('\nComponentCollection: '+names(pc0.components));if(pc0.components.numItems)pv.push('\nComponent: '+names(pc0.components[pc0.components.numItems-1]));}
  if(qi){pv.push('\nQE item: '+names(qi));try{pv.push('\nQE numComponents='+qi.numComponents);var qc=qi.getComponentAt(qi.numComponents-1);pv.push('\nQE component: '+names(qc)+' name='+qc.name);}catch(cx){pv.push('\nqe comp err '+cx);}}
  pr.open('w');pr.write(pv.join(' '));pr.close();return;}
 // Table, not a nested ternary: PPro 24 ExtendScript picked the wrong branch of the long chain.
 var names=[[reopen,'host-result'],[applying,'apply-result'],[exporting,'export-queued'],[real,'real-result'],[rframes,'rframes-result'],[depth,'depth-result'],[reapply,'reapply-result'],[snap,'snap-'+sname]],rn='phase1';
 for(var ni=0;ni<names.length;ni++)if(names[ni][0]){rn=names[ni][1];break;}
 var dir=new Folder(root),report=new File(dir.fsName+'/'+rn+'.json'),log=[];
 function quote(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';}
 function write(ok,message){if(report.exists)return;if(!report.open('w'))return;report.encoding='UTF-8';report.write('{"ok":'+(ok?'true':'false')+',"version":'+quote(app.version)+',"message":'+quote(message)+',"log":'+quote(log.join('; '))+'}');report.close();}
 function same(a,b){return new File(a).fsName.toLowerCase()===new File(b).fsName.toLowerCase();}
 function frame(name){
  var q=qe.project.getActiveSequence(),base=dir.fsName+'\\'+name,f=new File(base+'.png');
  if(f.exists)throw Error('Existing test output preserved: '+f.fsName);
  q.exportFramePNG(q.CTI.timecode,base);
  for(var t=0;t<300&&!(f.exists&&f.length>0);t++)$.sleep(100);  // export may be async
  if(!(f.exists&&f.length>0))throw Error('No PNG output: '+name);}
 function effect(seq){var cs=seq.videoTracks[0].clips[0].components;for(var i=0;i<cs.numItems;i++)if(cs[i].displayName==='OdyGrade')return cs[i];return null;}
 function effect2(clip){var cs=clip.components;for(var i=0;i<cs.numItems;i++)if(cs[i].displayName==='OdyGrade')return cs[i];return null;}
 function prop(c,n){for(var i=0;i<c.properties.numItems;i++)if(c.properties[i].displayName===n)return c.properties[i];throw Error('No param '+n);}
 function bySeqName(n){for(var i=0;i<app.project.sequences.numSequences;i++)if(app.project.sequences[i].name===n)return app.project.sequences[i];return null;}
 try{
  if(!dir.exists)throw Error('Scratch folder missing');
  var rp=dir.fsName+'\\ppro-real.prproj',rt=[0.5,1.5,2.5];
  function at(s,t){s.setPlayerPosition(String(Math.round(t*254016000000)));app.enableQE();}
  if(real){
   if(app.projects.numProjects>0)throw Error('A project is already open. Refused; nothing modified.');
   if(new File(rp).exists)throw Error('Existing project preserved; use a fresh scratch folder');
   if(!app.newProject(rp)||!app.project||!same(app.project.path,rp))throw Error('Could not create the scratch project');
   app.project.importFiles([dir.fsName+'\\source.mov'],true,app.project.rootItem,false);
   var ri=null;for(var r=0;r<app.project.rootItem.children.numItems;r++)if(app.project.rootItem.children[r].name==='source.mov')ri=app.project.rootItem.children[r];
   if(!ri)throw Error('Import failed');
   var rs=app.project.createNewSequenceFromClips('OdyGrade real',[ri],app.project.rootItem);if(!rs)throw Error('Sequence creation failed');
   app.project.activeSequence=rs;var fs=rs.getSettings();log.push('seq '+fs.videoFrameWidth+'x'+fs.videoFrameHeight);
   for(r=0;r<3;r++){at(rs,rt[r]);frame('src-'+r);}
   $.evalFile(new File($.fileName).parent.parent.fsName+'/host/bridge.jsx');
   rs.videoTracks[0].clips[0].setSelected(true,true);
   var rg=new File(dir.fsName+'/grade.odyn');rg.open('r');var rsnap=rg.read();rg.close();
   var rparams=[['Look',0,1],['Match strength',100,0],['Exposure trim',0,0],['Temperature trim',0,0],['Tint trim',0,0],['Contrast',100,0],['Saturation',100,0],['Skin hue protection',65,0],['Faded black',0,0],['Highlight softness',0,0],['Grain',0,0],['Bloom',0,0],['Halation',0,0],['Vignette',0,0],['Bleach bypass',0,0],['Frame ratio',0,1]];
   var rx=new File(dir.fsName+'/params.txt');  // optional extra/override params, e.g. [['Grain',60,0],['Film format',2,1]]
   if(rx.exists){rx.open('r');rparams=rparams.concat(eval('('+rx.read()+')'));rx.close();}
   var rr=eval('('+OdyHost.apply(encodeURIComponent(rsnap),rparams)+')');
   log.push('apply='+rr.ok+' count='+rr.count+' linked='+rr.linked+' err='+rr.error);if(!rr.ok)throw Error(rr.error);
   at(rs,rt[1]);frame('params-1');app.project.save();
   write(true,'Real clip imported, src frames exported, panel apply done (params only). Click "Load native grade..." then queue "rframes <dir>".');return;
  }
  if(reapply||snap){
   if(!app.project||!same(app.project.path,rp))throw Error('Real scratch project is not the active project. Refused; nothing modified.');
   var xq=bySeqName('OdyGrade real');app.project.activeSequence=xq;var xc=xq.videoTracks[0].clips[0],xe=effect2(xc);
   var vals=function(){var e=effect2(xc);return e?'look='+prop(e,'Look').getValue()+' grain='+prop(e,'Grain').getValue()+' link='+prop(e,'Grade link').getValue():'no effect';}
   log.push('before '+vals());
   if(reapply){
    if(!xe)throw Error('Clip has no OdyGrade to re-apply onto');
    $.evalFile(new File($.fileName).parent.parent.fsName+'/host/bridge.jsx');xc.setSelected(true,true);
    var xg=new File(dir.fsName+'/grade.odyn');xg.open('r');var xs=xg.read();xg.close();
    var amber=prop(xe,'Look').getValue()===1;  // toggle so before/after values always differ
    var xr=eval('('+OdyHost.apply(encodeURIComponent(xs),amber?[['Look',2,1],['Grain',0,0]]:[['Look',1,1],['Grain',35,0]])+')');
    log.push('apply='+xr.ok+' count='+xr.count+' err='+xr.error+'; after '+vals());if(!xr.ok)throw Error(xr.error);sname='reapply-1';
   }
   at(xq,1.5);frame(sname);write(true,reapply?'Re-applied onto existing OdyGrade; frame exported.':'Snapshot exported.');return;
  }
  if(rframes){
   if(!app.project||!same(app.project.path,rp))throw Error('Real scratch project is not the active project. Refused; nothing modified.');
   var fq=bySeqName('OdyGrade real');app.project.activeSequence=fq;
   var pre=new File(dir.fsName+'/graded-0.png').exists?'again-':'graded-';  // rerun (e.g. after undo/redo) never overwrites
   for(r=0;r<3;r++){at(fq,rt[r]);var ft=$.hiresTimer;frame(pre+r);log.push('graded-'+r+' '+Math.round($.hiresTimer/1000)+' ms');}
   app.project.save();write(true,'Graded frames exported; scratch project saved.');return;
  }
  if(depth){
   var isReal=app.project&&same(app.project.path,rp),dp=isReal?rp:dir.fsName+'\\ppro-smoke.prproj';  // real-footage scratch or smoke scratch
   if(app.projects.numProjects===0&&!app.openDocument(dp,true,true,true))throw Error('Cannot open scratch project');
   if(!app.project||!same(app.project.path,dp))throw Error('Scratch project is not the active project. Refused; nothing modified.');
   var ds=bySeqName(isReal?'OdyGrade real':'OdyGrade smoke');app.project.openSequence(ds.sequenceID);app.project.activeSequence=ds;app.enableQE();
   if(isReal)at(ds,1.5);else{var dtb=Number(ds.timebase),dc=ds.videoTracks[0].clips[ds.videoTracks[0].clips.numItems-1];
   ds.setPlayerPosition(String((Math.round(Number(dc.start.ticks)/dtb)+30)*dtb));}
   var st=ds.getSettings();st.maximumBitDepth=false;ds.setSettings(st);frame('depth-off');
   st=ds.getSettings();st.maximumBitDepth=true;st.maximumRenderQuality=true;ds.setSettings(st);
   log.push('maxDepth='+ds.getSettings().maximumBitDepth);frame('depth-max');
   write(true,'Rendered clip-2 frame with Maximum Bit Depth off and on.');return;
  }
  if(exporting){
   var xp=dir.fsName+'\\ppro-smoke.prproj';
   if(app.projects.numProjects===0&&!app.openDocument(xp,true,true,true))throw Error('Cannot open scratch project');
   if(!app.project||!same(app.project.path,xp))throw Error('Scratch project is not the active project. Refused; nothing modified.');
   var xs=bySeqName('OdyGrade smoke');app.project.openSequence(xs.sequenceID);app.project.activeSequence=xs;
   var tb=Number(xs.timebase),c2=xs.videoTracks[0].clips[xs.videoTracks[0].clips.numItems-1],fi=Math.round(Number(c2.start.ticks)/tb)+30;
   xs.setPlayerPosition(String(fi*tb));app.enableQE();frame('ame-ref');log.push('frameIndex='+fi);
   var out=new Folder(dir.fsName+'\\ame');if(out.exists)throw Error('Existing AME output preserved');out.create();
   app.encoder.launchEncoder();
   var id=app.encoder.encodeSequence(xs,out.fsName+'\\frame.png','C:\\Program Files\\Adobe\\Adobe Media Encoder 2024\\MediaIO\\systempresets\\3F3F3F3F_504E4720\\PNG Sequence (Match Source).epr',app.encoder.ENCODE_ENTIRE,1);
   if(!id)throw Error('encodeSequence returned no job');app.encoder.startBatch();log.push('job='+id);
   write(true,'Queued in Media Encoder; Premiere reference frame exported.');return;
  }
  if(!applying&&app.projects.numProjects>0)throw Error('A project is already open ('+app.projects[0].path+'). Refused; nothing modified.');
  var path=dir.fsName+'\\ppro-smoke.prproj';
  if(reopen){
   if(!app.openDocument(path,true,true,true))throw Error('Reopen failed');
   var s=bySeqName('OdyGrade smoke');if(!s)throw Error('Sequence missing after reopen');
   app.project.openSequence(s.sequenceID);app.project.activeSequence=s;app.enableQE();
   var e=effect(s);if(!e)throw Error('Effect missing after reopen');
   log.push('reopened look='+prop(e,'Look').getValue()+' grain='+prop(e,'Grain').getValue()+' ratio='+prop(e,'Frame ratio').getValue());
   if(prop(e,'Grain').getValue()!==20)throw Error('Grain did not survive save/reopen');
   frame('reopened');
   write(true,'Scratch project reopened; effect and controls restored; reopened PNG exported.');return;
  }
  if(applying){
   if(app.projects.numProjects===0&&!app.openDocument(path,true,true,true))throw Error('Cannot open scratch project');
   if(!app.project||!same(app.project.path,path))throw Error('Scratch project is not the active project. Refused; nothing modified.');
   $.evalFile(new File($.fileName).parent.parent.fsName+'/host/bridge.jsx');
   var sq=bySeqName('OdyGrade smoke');app.project.openSequence(sq.sequenceID);app.project.activeSequence=sq;
   var tr=sq.videoTracks[0],src=null;
   for(var a=0;a<app.project.rootItem.children.numItems;a++)if(app.project.rootItem.children[a].name==='source.png')src=app.project.rootItem.children[a];
   if(tr.clips.numItems<2)tr.insertClip(src,tr.clips[0].end.seconds);
   for(a=0;a<tr.clips.numItems;a++)tr.clips[a].setSelected(false,true);
   tr.clips[1].setSelected(true,true);  // second clip has no effect yet: tests add + QE index mapping
   var g=new File(dir.parent.parent.fsName+'/grade.odyn');g.open('r');var snap=g.read();g.close();
   var r=eval('('+OdyHost.apply(encodeURIComponent(snap),[['Look',1,1],['Grain',35,0],['Frame ratio',2,1]])+')');
   log.push('apply='+r.ok+' count='+r.count+' linked='+r.linked+' err='+r.error);if(!r.ok)throw Error(r.error);
   if(r.linked!=='1')throw Error('Effect did not acknowledge Grade link (auto-embed not run by host)');
   var c1=effect2(tr.clips[1]),c0=effect2(tr.clips[0]);if(!c1)throw Error('No effect on selected clip');
   log.push('clip1 look='+prop(c1,'Look').getValue()+' grain='+prop(c1,'Grain').getValue()+' ratio='+prop(c1,'Frame ratio').getValue()+'; clip0 grain='+prop(c0,'Grain').getValue());
   if(prop(c1,'Look').getValue()!==1||prop(c1,'Grain').getValue()!==35||prop(c1,'Frame ratio').getValue()!==2||prop(c0,'Grain').getValue()!==20)throw Error('Applied values wrong or unselected clip changed');
   sq.setPlayerPosition(String(tr.clips[1].start.ticks*1+1));app.enableQE();frame('applied');
   write(true,'OdyHost.apply added OdyGrade to the selected (second) clip only, values mapped 0-based, PNG exported.');return;
  }
  if(new File(path).exists)throw Error('Existing project preserved; use a fresh scratch folder');
  if(!app.newProject(path)||!app.project||!same(app.project.path,path))throw Error('Could not create the scratch project');
  app.project.importFiles([dir.fsName+'\\source.png'],true,app.project.rootItem,false);
  var item=null;for(var i=0;i<app.project.rootItem.children.numItems;i++)if(app.project.rootItem.children[i].name==='source.png')item=app.project.rootItem.children[i];
  if(!item)throw Error('Import failed');
  var seq=app.project.createNewSequenceFromClips('OdyGrade smoke',[item],app.project.rootItem);
  if(!seq)throw Error('Sequence creation failed');
  app.project.activeSequence=seq;app.enableQE();
  frame('before');
  var fx=qe.project.getVideoEffectByName('OdyGrade');if(!fx)throw Error('OdyGrade missing from Premiere video effects');
  qe.project.getActiveSequence().getVideoTrackAt(0).getItemAt(0).addVideoEffect(fx);
  var c=effect(seq);if(!c)throw Error('Effect not on clip after addVideoEffect');
  var names=[];for(i=0;i<c.properties.numItems;i++)names.push(c.properties[i].displayName);log.push('params='+names.join('|'));
  prop(c,'Look').setValue(2,true);frame('after');
  prop(c,'Grain').setValue(20,true);prop(c,'Bloom').setValue(30,true);prop(c,'Frame ratio').setValue(4,true);frame('film');
  var look=prop(c,'Look').getValue(),grain=prop(c,'Grain').getValue();log.push('set look='+look+' grain='+grain);
  app.project.save();
  write(true,'Native effect found in Premiere, applied; before/after/film PNGs exported; scratch project saved and left open. Close it, then queue "reopen <dir>".');
 }catch(e){write(false,e.toString());}
})();
