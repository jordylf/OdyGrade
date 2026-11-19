/* Actual Adobe host smoke (AE). Launch ONLY via tools/run-ae-smoke.ps1, which
   refuses when After Effects is already running and sets ODY_TEST_DIR.
   Safety contract:
   - Runs only inside an UNTITLED, EMPTY project (app.project.file===null and
     numItems===0). Any saved or nonempty project is refused untouched.
   - Never calls app.newProject, app.open, project.close or app.quit: no project
     is ever closed, replaced or discarded.
   - Save/reopen is verified by saving the scratch project to a NEW file in the
     scratch folder and re-importing that .aep (re-parses effect data) into it.
   - Never overwrites files; never touches preferences, activation or plugins. */
(function(){
 // AE may be relaunched by a broker that drops env vars; Kinetic passes KineticArgs.dir.
 var root=$.getenv('ODY_TEST_DIR')||(typeof KineticArgs!=='undefined'&&KineticArgs.dir);
 if(!root)return;  // no report location; nothing touched
 var dir=new Folder(root),report=new File(dir.fsName+'/host-result.json');
 function quote(s){return '"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n')+'"';}
 function write(ok,message){if(report.exists)return;if(!report.open('w'))return;report.encoding='UTF-8';report.write('{"ok":'+(ok?'true':'false')+',"version":'+quote(app.version)+',"message":'+quote(message)+'}');report.close();}
 function output(comp,name){var f=new File(dir.fsName+'/'+name+'.png');if(f.exists)throw Error('Existing test output preserved: '+f.fsName);comp.saveFrameToPng(comp.time,f);
  // saveFrameToPng is asynchronous in AE 24: wait (max 30 s) for a nonempty file.
  for(var t=0;t<300&&!(f.exists&&f.length>0);t++)$.sleep(100);
  if(!(f.exists&&f.length>0))throw Error('No PNG output: '+name);}
 function findEffect(layer){return layer.property('ADBE Effect Parade').property('OdyWorks OdyGrade');}
 try{
  if(!dir.exists)throw Error('Scratch folder missing');
  if(!app.project)throw Error('No project object; refusing to create one.');
  if(app.project.file!==null)throw Error('A saved project is open ('+app.project.file.fsName+'). Refused; nothing modified.');
  if(app.project.numItems>0)throw Error('Untitled project is not empty. Refused; nothing modified.');
  var found=false;for(var i=0;i<app.effects.length;i++)if(app.effects[i].matchName==='OdyWorks OdyGrade')found=true;
  if(!found)throw Error('OdyGrade not present in app.effects; native load not verified.');
  var projectFile=new File(dir.fsName+'/host-smoke.aep');if(projectFile.exists)throw Error('Existing AEP preserved; use a fresh scratch folder');

  app.project.bitsPerChannel=8;app.project.workingSpace='';
  var source=app.project.importFile(new ImportOptions(new File(dir.fsName+'/source.png')));
  var comp=app.project.items.addComp('OdyGrade native smoke',192,128,1,1,12),layer=comp.layers.add(source);comp.time=0;
  output(comp,'before8');
  var effect=layer.property('ADBE Effect Parade').addProperty('OdyWorks OdyGrade');if(!effect)throw Error('Cannot instantiate native effect');
  effect.property('Look').setValue(2);output(comp,'after8');
  app.project.bitsPerChannel=16;effect.enabled=false;output(comp,'before16');effect.enabled=true;output(comp,'after16');
  effect.property('Grain').setValue(20);effect.property('Bloom').setValue(30);effect.property('Frame ratio').setValue(4);output(comp,'film16');
  effect.property('Exposure trim').setValueAtTime(0,0);effect.property('Exposure trim').setValueAtTime(.5,.5);

  app.project.save(projectFile);  // untitled scratch project -> new scratch file
  if(!projectFile.exists)throw Error('AEP save failed');
  var folder=app.project.importFile(new ImportOptions(projectFile));  // re-parse saved effect data
  var reopened=null;
  for(i=1;i<=app.project.numItems;i++){var it=app.project.item(i);if(it instanceof CompItem&&it!==comp&&it.name===comp.name)reopened=it;}
  if(!reopened||!folder)throw Error('Saved composition missing after AEP re-import');
  var restored=findEffect(reopened.layer(1));
  if(!restored||restored.property('Look').value!==2||restored.property('Exposure trim').numKeys!==2)throw Error('Effect controls/keyframes did not survive AEP save/re-import');
  reopened.time=0;output(reopened,'reopened16');
  write(true,'Native effect loaded and instantiated; 8/16-bpc PNGs rendered, nonzero film rendered, controls/keyframes survived AEP save + re-import. Scratch project left open; pixel comparisons are separate.');
 }catch(e){write(false,e.toString());}
})();
