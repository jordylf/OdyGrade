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
 var reopen=root.indexOf('reopen ')===0,applying=root.indexOf('apply ')===0,probe=root.indexOf('probe ')===0,exporting=root.indexOf('export ')===0;
 if(reopen||exporting)root=root.substring(7);if(applying||probe)root=root.substring(6);
 if(probe){  // read-only: report each clip's Grade link value in the active sequence
  var pr=new File(root+'/probe-'+new Date().getTime()+'.txt'),ps=app.project.activeSequence,pv=[];
  for(var pi=0;ps&&pi<ps.videoTracks[0].clips.numItems;pi++){var pcs=ps.videoTracks[0].clips[pi].components;
   for(var pj=0;pj<pcs.numItems;pj++)if(pcs[pj].displayName==='OdyGrade')for(var pk=0;pk<pcs[pj].properties.numItems;pk++)if(pcs[pj].properties[pk].displayName==='Grade link')pv.push(pi+':'+pcs[pj].properties[pk].getValue());}
  pr.open('w');pr.write(pv.join(' '));pr.close();return;}
 var dir=new Folder(root),report=new File(dir.fsName+(reopen?'/host-result.json':applying?'/apply-result.json':exporting?'/export-queued.json':'/phase1.json')),log=[];
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
