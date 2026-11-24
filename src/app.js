(function(){
"use strict";
var E=window.OdyColor,F=window.OdyFilm,B=window.OdyBridge,CM=window.OdyInput;
var $=function(id){return document.getElementById(id);};
var state={source:null,reference:null,sourceImage:null,model:null,settings:E.settings(),film:F.normalize(),
 sourceFrames:[],activeFrame:0,analysis:null,importedSamples:0,
 view:"graded",result:null,renderId:0,worker:null,workerJobs:{},busy:false,off:{}};
// Per-tool On switches: a switched-off tool renders/exports at its neutral value; the slider keeps its value.
var NEUTRAL={settings:{strength:0,contrast:1,saturation:1,preserveSkin:0,fade:0,shoulder:0,stockAmount:0},
 film:{grain:0,bloom:0,halation:0,vignette:0,bleach:0,weave:0,flicker:0,dust:0}};
function live(){
 var s=Object.assign({},state.settings),f=Object.assign({},state.film);
 Object.keys(state.off).forEach(function(k){if(k in NEUTRAL.settings)s[k]=NEUTRAL.settings[k];else f[k]=NEUTRAL.film[k];});
 return {settings:s,film:f};
}
var colors={
 neutral:["#66725b","#c0c6b7"],amber:["#3f5551","#dbad69"],nocturne:["#253d52","#a29168"],
 evergreen:["#374c37","#b4ad7b"],rose:["#55414b","#d4ada0"],silver:["#292b2c","#bcc0b9"],
 coast:["#306370","#d7c29d"],earth:["#514936","#c8a66c"],cyan:["#205c68","#ce9261"],velvet:["#4d365f","#be9f88"]};
function status(text,error){$("status").textContent=text;$("status").parentElement.classList.toggle("error",!!error);}
function fail(e){status(e.message||String(e),true);}
// Step summaries show progress so folded steps still tell the user where they are.
function stepStates(){
 var frames=state.sourceFrames.length,f=$("stepFrameState"),r=$("stepReferenceState");
 f.textContent=frames?frames+" frame"+(frames===1?"":"s"):"Not loaded";f.classList.toggle("done",!!frames);
 r.textContent=state.model?(state.recipeLoaded?"From saved grade":"Matched"):state.reference?"Loaded":"Not loaded";r.classList.toggle("done",!!state.model);
}
function buttons(){
 stepStates();
 Array.prototype.forEach.call(document.querySelectorAll('button,input,select'),function(el){el.disabled=state.busy;});
 $("match").disabled=!state.source||!state.reference||state.busy;
 ["exportLut","exportPng"].forEach(function(k){$(k).disabled=!state.source||state.busy;});
 $("exportNative").disabled=(!state.source&&!state.model)||state.busy;
 $("applyNative").disabled=$("exportNative").disabled||!B.available;
 $("auto").disabled=!state.source||state.busy;
 $("previousFrame").disabled=state.busy||state.activeFrame===0;
 $("nextFrame").disabled=state.busy||state.activeFrame>=state.sourceFrames.length-1;
}
async function whileBusy(action){
 if(state.busy)throw Error('Wait for the current operation to finish.');
 state.busy=true;buttons();try{return await action();}finally{state.busy=false;buttons();}
}
function guardRefit(){
 if(!state.source||!state.reference)throw Error('Load source and reference frames before refitting.');
 if(state.recipeLoaded&&state.importedSamples>1)
  throw Error('This saved grade used multiple frames. Load your shot frames and press Create grade before changing its correction or profile.');
}
function fitCurrent(settings){
 settings=Object.assign({},settings,{separateSkin:$("separateSkin").checked});
 return state.sourceFrames.length>1?E.fitFrames(state.sourceFrames.map(function(f){return f.analysis;}),state.reference,settings):E.fit(state.source,state.reference,settings);
}
function rememberFit(model){
 state.model=model;state.recipeLoaded=false;state.importedSamples=0;
 state.analysis=state.sourceFrames.length>1?{method:'selected-stills-v1',sampleCount:state.sourceFrames.length,
  precision:'8-bit RGBA analysis',singleShot:true}:null;
}
function controls(){
 var color=[
 ["strength","Look strength",0,1,.01,100,"%"],["exposure","Exposure",-4,4,.05,1," EV"],
 ["temperature","Temperature",-1,1,.01,100,""],["tint","Tint",-1,1,.01,100,""],
 ["contrast","Contrast",.5,1.8,.01,100,"%"],["saturation","Saturation",0,2,.01,100,"%"],
 ["preserveSkin","Preserve skin hue",0,1,.01,100,"%"],["fade","Faded black",0,.2,.005,100,"%"],
 ["shoulder","Highlight softness",0,1,.01,100,"%"],["stockAmount","Stock amount",0,1,.01,100,"%"]];
 var film=[["grain","Grain",0,1,.01,100,"%"],["bloom","Bloom",0,1,.01,100,"%"],
 ["halation","Halation",0,1,.01,100,"%"],["vignette","Vignette",0,1,.01,100,"%"],
 ["bleach","Bleach bypass",0,1,.01,100,"%"],["iso","Grain ISO",50,500,10,1,""],
 ["weave","Gate weave",0,1,.01,100,"%"],["flicker","Flicker",0,1,.01,100,"%"],["dust","Dust",0,1,.01,100,"%"]];
 function create(c,target,type){
  var div=document.createElement("div");div.className="control";
  var line=document.createElement("div");line.className="control-line";
  var label=document.createElement("label");label.htmlFor=c[0];label.textContent=c[1];
  var output=document.createElement("output");output.id=c[0]+"Value";output.htmlFor=c[0];
  if(c[0] in NEUTRAL[type]){var sw=document.createElement("input");sw.type="checkbox";sw.id=c[0]+"On";sw.className="tool-on";sw.checked=true;
   sw.title="On";sw.setAttribute("aria-label",c[1]+" on");line.insertBefore(sw,line.firstChild);
   sw.addEventListener("change",function(){if(sw.checked)delete state.off[c[0]];else state.off[c[0]]=true;div.classList.toggle("off",!sw.checked);requestRender().catch(fail);});}
  line.appendChild(label);line.appendChild(output);div.appendChild(line);
  var input=document.createElement("input");input.type="range";input.id=c[0];input.min=c[2];input.max=c[3];input.step=c[4];
  input.dataset.multiplier=c[5];input.dataset.suffix=c[6];div.appendChild(input);
  input.addEventListener("input",function(){
   if(state.model&&["exposure","temperature","tint"].indexOf(c[0])>=0&&(!state.source||!state.reference)){
    syncControl(c[0],state[type][c[0]]);fail(Error("Load source and reference frames before changing correction on a saved match."));return;
   }
   try{
    var next=Object.assign({},state[type]);next[c[0]]=Number(input.value);var model=state.model;
    if(state.model&&["exposure","temperature","tint"].indexOf(c[0])>=0){
     guardRefit();model=fitCurrent(next);
    }
    state[type]=next;if(model!==state.model)rememberFit(model);syncControl(c[0],state[type][c[0]]);
    requestRender().catch(fail);
   }catch(e){syncControl(c[0],state[type][c[0]]);fail(e);}
  });
  if(c[0]==="preserveSkin"){var p=document.createElement("div");p.className="control-help";p.textContent="Hue-based protection; this is not face detection.";div.appendChild(p);}
  $(target).appendChild(div);
 }
 color.forEach(function(c){create(c,"colorControls","settings");});film.forEach(function(c){create(c,"filmControls","film");});
}
function syncControl(id,v){var on=$(id+"On");if(on){on.checked=!state.off[id];on.parentElement.parentElement.classList.toggle("off",!!state.off[id]);}var el=$(id);el.value=v;$(id+"Value").textContent=(v*Number(el.dataset.multiplier)).toFixed(id==="exposure"?2:0)+el.dataset.suffix;}
function sync(){
 Object.keys(state.settings).forEach(function(k){if(k!=="look"&&k!=="inputProfile"&&k!=="stock")syncControl(k,state.settings[k]);});
 $("stock").value=state.settings.stock;
 $("sourceProfile").value=state.settings.inputProfile;
 $("profileHelp").textContent=state.settings.inputProfile==='srgb'?'Use for screenshots or footage already normalized by your editor.':
  state.settings.inputProfile==='rec709-gamma24'?'Full-range display RGB, gamma 2.4 with ideal black. This is not camera Rec.709 OETF.':
  state.settings.inputProfile==='hlg-rec2020'?'iPhone HDR (HLG) delivered unconverted, e.g. After Effects default (no working space). Premiere tone-maps HLG to Rec.709 by default: use sRGB there.':
  'Use full-range, unconverted LOG values. Our SDR highlight rolloff is included in the exported LUT.';
 var selects=["ratio","gauge","format","perfs"];Object.keys(state.film).forEach(function(k){if(selects.indexOf(k)<0)syncControl(k,state.film[k]);else $(k).value=state.film[k];});
 Array.prototype.forEach.call(document.querySelectorAll(".look"),function(b){b.classList.toggle("active",b.dataset.look===state.settings.look);b.setAttribute("aria-pressed",String(b.dataset.look===state.settings.look));});
 buttons();
}
function setupLooks(){
 Object.keys(E.LOOKS).forEach(function(k){
  var b=document.createElement("button");b.className="look";b.dataset.look=k;b.setAttribute("aria-pressed","false");
  var sw=document.createElement("span");sw.className="swatch";sw.style.background="linear-gradient(135deg,"+colors[k][0]+","+colors[k][1]+")";
  var name=document.createElement("span");name.textContent=E.LOOKS[k].name;b.appendChild(sw);b.appendChild(name);
  b.addEventListener("click",function(){state.settings.look=k;sync();requestRender().catch(fail);});$("looks").appendChild(b);
 });
}
function setupProfiles(){
 Object.keys(CM.PROFILES).forEach(function(key){var option=document.createElement('option');option.value=key;option.textContent=CM.PROFILES[key].name;$("sourceProfile").appendChild(option);});
 $("sourceProfile").addEventListener('change',async function(){
  try{
   var next=E.settings(Object.assign({},state.settings,{inputProfile:this.value})),model=state.model;
   if(model){
    guardRefit();model=fitCurrent(next);
   }
   state.settings=next;if(model!==state.model)rememberFit(model);if(CM.PROFILES[next.inputProfile].scene)$("lutSize").value='65';sync();await requestRender();
   status('Source profile: '+CM.PROFILES[next.inputProfile].name+'. Reference and output remain sRGB.');
  }catch(e){sync();fail(e);}
 });
}
function pixels(img,maxSize){
 var w=img.naturalWidth,h=img.naturalHeight,scale=Math.min(1,maxSize/w,maxSize*.625/h),c=document.createElement("canvas");
 c.width=Math.max(1,Math.round(w*scale));c.height=Math.max(1,Math.round(h*scale));
 var ctx=c.getContext("2d");ctx.drawImage(img,0,0,c.width,c.height);return ctx.getImageData(0,0,c.width,c.height);
}
function paint(canvas,image){canvas.width=image.width;canvas.height=image.height;canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);}
function loadImage(url){
 return new Promise(function(resolve,reject){var img=new Image();img.onload=function(){
  if(img.naturalWidth*img.naturalHeight>40000000)return reject(Error("Use a still image up to 40 megapixels."));
  resolve(img);};img.onerror=function(){reject(Error("Cannot decode this image. Use PNG, JPG or WebP."));};img.src=url;});
}
async function setImage(which,url,label){
 var img=await loadImage(url),image=pixels(img,960);
 if(which==='source'){
  commitSources([{label:label,url:url,preview:image,analysis:pixels(img,512)}],img);
  await requestRender();status(label+' loaded. '+(state.model?'Saved transform retained.':'Ready to create a grade.'));return;
 }
 state[which]=image;
 state.referenceName=label;
 paint($(which+"Canvas"),image);$(which+"Canvas").hidden=false;$(which+"Empty").hidden=true;$(which+"Tag").hidden=false;
 $(which+"Drop").classList.add("loaded");
 // Imported recipes retain their frozen transform until Create grade is pressed.
 if(state.model&&!state.recipeLoaded){state.model=null;state.analysis=null;}
 buttons();await requestRender();
 status(label+" loaded. "+(state.model?"Saved transform retained.":"Ready to create a grade."));
}
function showSource(index,img){
 var frame=state.sourceFrames[index];state.activeFrame=index;state.source=frame.preview;
 state.sourceImage=img;state.sourceName=frame.label;
 paint($('sourceCanvas'),state.source);$('sourceCanvas').hidden=false;$('sourceEmpty').hidden=true;$('sourceTag').hidden=false;
 $('sourceDrop').classList.add('loaded');$('shotFrame').value=String(index);
 $('sourceInfo').textContent=state.sourceFrames.length>1?state.sourceFrames.length+' SHOT FRAMES':img.naturalWidth+' × '+img.naturalHeight;
 buttons();
}
function commitSources(frames,img){
 state.sourceFrames=frames;
 $('shotFrame').textContent='';frames.forEach(function(frame,i){var option=document.createElement('option');option.value=String(i);option.textContent=(i+1)+' / '+frames.length+' · '+frame.label;$('shotFrame').appendChild(option);});
 $('shotControls').hidden=frames.length<2;
 if(state.model&&!state.recipeLoaded){state.model=null;state.analysis=null;}
 showSource(0,img);
}
async function loadSourceFiles(files){
 var list=Array.prototype.slice.call(files);
 if(!list.length||list.length>32)throw Error('Select 1 to 32 still frames from one shot.');
 if(list.reduce(function(total,file){return total+file.size;},0)>100*1024*1024)throw Error('Shot files exceed the 100 MB total limit.');
 var frames=[],first;
 // Decode sequentially. Retain small previews/analysis, the source Files, and
 // only the selected full-size image; never keep 32 full-size decoded images.
 for(var i=0;i<list.length;i++){
  status('Loading shot frame '+(i+1)+' of '+list.length+'…');
  var img=await loadImage(await readFile(list[i]));if(i===0)first=img;
  frames.push({label:list[i].name,file:list[i],preview:pixels(img,960),analysis:pixels(img,512)});
 }
 commitSources(frames,first);await requestRender();
 status(list.length+' source frame'+(list.length===1?'':'s')+' loaded. '+(state.model?'Saved transform retained.':'Create grade uses all loaded frames.'));
}
async function selectSource(index){
 if(!Number.isInteger(index)||index<0||index>=state.sourceFrames.length)return;
 try{await whileBusy(async function(){var frame=state.sourceFrames[index];
  var img=await loadImage(frame.file?await readFile(frame.file):frame.url);showSource(index,img);await requestRender();
  status('Previewing frame '+(index+1)+' of '+state.sourceFrames.length+'. The fitted grade is unchanged.');
 });}catch(e){$('shotFrame').value=String(state.activeFrame);fail(e);}
}
function readFile(file){
 if(!file)return Promise.reject(Error("No file selected."));
 if(file.size>50*1024*1024)return Promise.reject(Error("Image exceeds the 50 MB file limit."));
 return new Promise(function(resolve,reject){var reader=new FileReader();reader.onerror=function(){reject(Error("File could not be read."));};reader.onload=function(){resolve(reader.result);};reader.readAsDataURL(file);});
}
function bindImport(which){
 $(which+"Drop").addEventListener("click",function(){$(which+"Input").click();});
 async function importFiles(files){await whileBusy(async function(){if(which==='source')await loadSourceFiles(files);else{
  if(files.length!==1)throw Error('Choose one reference still.');var file=files[0];await setImage(which,await readFile(file),file.name);
 }});}
 $(which+"Input").addEventListener("change",async function(){try{if(this.files.length)await importFiles(this.files);}catch(e){fail(e);}finally{this.value="";}});
 ["dragover","dragleave","drop"].forEach(function(event){
  $(which+"Drop").addEventListener(event,async function(e){
   e.preventDefault();this.classList.toggle("dragover",event==="dragover");
   if(event==="drop"){try{await importFiles(e.dataTransfer.files);}catch(err){fail(err);}}
  });
 });
}
function renderAsync(image){
 var id=++state.renderId;
 if(!state.worker)return Promise.resolve({id:id,image:F.apply(E.render(image,state.model,live().settings),live().film)});
 return new Promise(function(resolve,reject){
  state.workerJobs[id]={resolve:resolve,reject:reject};
  state.worker.postMessage({id:id,image:{width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)},
   model:state.model,settings:live().settings,film:live().film});
 });
}
async function requestRender(){
 if(!state.source)return;
 var start=performance.now();
 try{
  var out=await renderAsync(state.source);
  if(out.id!==state.renderId)return;
  state.result=out.image;drawResult();
  $("resultEmpty").hidden=true;$("resultCanvas").hidden=false;$("viewerLabel").hidden=false;
  $("renderTime").textContent=Math.round(performance.now()-start)+" ms";
  $("resultInfo").textContent=state.source.width+" × "+state.source.height+" PREVIEW";
  $("gradeTitle").textContent=state.model?"Reference matched · "+E.LOOKS[state.settings.look].name:E.LOOKS[state.settings.look].name;
  $("gradeDescription").textContent=state.model?"Frozen color transform. Reusable across a shot.":"Manual look. Add a reference to create a match.";
  $("gradeChip").textContent=state.model?"MATCH READY":"MANUAL GRADE";
  buttons();
 }catch(e){fail(e);throw e;}
}
function drawResult(){
 if(!state.result)return;
 var canvas=$("resultCanvas"),image=state.view==="before"?state.source:state.result;
 paint(canvas,image);
 if(state.view==="split"){
  var cut=Math.round(canvas.width*Number($("wipe").value)/100),ctx=canvas.getContext("2d");
  ctx.putImageData(state.source,0,0,0,0,cut,canvas.height);
  ctx.fillStyle="#d7efb8";ctx.fillRect(cut,0,2,canvas.height);
 }
 $("viewerLabel").textContent=state.view==="before"?"ORIGINAL":state.view==="split"?"ORIGINAL / GRADED":"GRADED";
}
async function download(text,name,kind){
 if(B.available&&kind!=="png"){var result=await B.save(text,kind);status(result.cancelled?"Save cancelled.":"Saved: "+result.path);return;}
 var blob=kind==="png"?text:new Blob([text],{type:kind==="cube"?"text/plain":"application/json"});
 var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},5000);
 status("Exported "+name+".");
}
controls();setupLooks();setupProfiles();bindImport("source");bindImport("reference");sync();
try{
 state.worker=new Worker("src/worker.js");
 state.worker.onmessage=function(e){var job=state.workerJobs[e.data.id];if(!job)return;delete state.workerJobs[e.data.id];if(e.data.error)job.reject(Error(e.data.error));else job.resolve(e.data);};
 state.worker.onerror=function(){Object.keys(state.workerJobs).forEach(function(k){state.workerJobs[k].reject(Error("Preview worker failed. Reload this panel."));});state.workerJobs={};state.worker.terminate();state.worker=null;};
}catch(e){state.worker=null;}
$("separateSkin").addEventListener("change",async function(){
 if(!state.model)return;
 try{guardRefit();rememberFit(fitCurrent(state.settings));await requestRender();
  status(state.model.warnings.length?state.model.warnings.join(" "):this.checked?"Skin now follows the reference's skin tones.":"Skin and background are matched together.");
 }catch(e){this.checked=!this.checked;fail(e);}
});
$("match").addEventListener("click",async function(){
 try{rememberFit(fitCurrent(state.settings));await requestRender();
  status(state.model.warnings.length?state.model.warnings.join(" "):"Grade created. Adjust the look, or export it for your scene.");
 }catch(e){fail(e);}
});
$("auto").addEventListener("click",async function(){
 try{if(state.model)guardRefit();
  var correction=state.sourceFrames.length>1?E.autoCorrectFrames(state.sourceFrames.map(function(f){return f.analysis;}),state.settings):E.autoCorrect(state.source,state.settings);
  var next=E.settings(Object.assign({},state.settings,correction)),model=state.model?fitCurrent(next):null;
  state.settings=next;if(model)rememberFit(model);
  sync();await requestRender();status("Suggested exposure and balance applied. Fine-tune for intentional lighting.");
 }catch(e){fail(e);}
});
Object.keys(E.STOCKS).forEach(function(k){var o=document.createElement("option");o.value=k;o.textContent=E.STOCKS[k].name;$("stock").appendChild(o);});
$("stock").addEventListener("change",function(){state.settings=Object.assign({},state.settings,{stock:this.value});requestRender().catch(fail);});
["ratio","gauge","format","perfs"].forEach(function(id){$(id).addEventListener("change",function(){state.film[id]=Number(this.value);requestRender().catch(fail);});});
$("reset").addEventListener("click",function(e){e.preventDefault();state.off={};state.settings=E.settings({inputProfile:state.settings.inputProfile});state.film=F.normalize();state.model=null;state.analysis=null;state.recipeLoaded=false;sync();requestRender().catch(fail);status("Color and film controls reset. Source profile retained.");});
$("shotFrame").addEventListener('change',function(){selectSource(Number(this.value));});
$("previousFrame").addEventListener('click',function(){selectSource(state.activeFrame-1);});
$("nextFrame").addEventListener('click',function(){selectSource(state.activeFrame+1);});
["graded","before","split"].forEach(function(id){$(id).addEventListener("click",function(){state.view=id;["graded","before","split"].forEach(function(k){$(k).classList.toggle("selected",k===id);});$("splitControl").hidden=id!=="split";drawResult();});});
$("wipe").addEventListener("input",drawResult);
$("exportLut").addEventListener("click",async function(){
 state.busy=true;buttons();status("Building color LUT…");
 await new Promise(function(r){setTimeout(r,30);});
 try{var profileSuffix=state.settings.inputProfile==='srgb'?'':'-'+state.settings.inputProfile;
  await download(E.cube(state.model,live().settings,Number($("lutSize").value)),"OdyGrade-"+$("lutSize").value+profileSuffix+".cube","cube");}catch(e){fail(e);}
 finally{state.busy=false;buttons();}
});
$("saveRecipe").addEventListener("click",async function(){try{var recipe=JSON.parse(E.serialize(state.model,live().settings,live().film));
 if(state.model&&state.analysis)recipe.analysis=state.analysis;
 await download(JSON.stringify(recipe,null,2),"OdyGrade.json","json");}catch(e){fail(e);}});
$("exportNative").addEventListener('click',async function(){try{
 var recipe=E.parse(E.serialize(state.model,live().settings,live().film));
 await download(window.OdyNativeRecipe.compile(recipe),'OdyGrade.odyn','odyn');
}catch(e){fail(e);}});
// Effect control values; popup entries are 0-based indices (host adapter maps per host).
// Names/ranges must match native/adobe/adapter.cpp setup(). Trims carry exposure/WB until
// the embedded grade is loaded (the effect then zeroes them; the snapshot holds them).
function effectParams(recipe){
 var s=recipe.settings,f=F.normalize(recipe.film),look=Math.max(0,["neutral","amber","nocturne","evergreen","rose","silver","coast","earth","cyan","velvet"].indexOf(s.look)),ratio=Math.max(0,[0,1.33,1.85,2.39].indexOf(f.ratio));
 return [["Look",look,1],["Match strength",s.strength*100,0],["Exposure trim",s.exposure,0],["Temperature trim",s.temperature*100,0],["Tint trim",s.tint*100,0],
  ["Contrast",s.contrast*100,0],["Saturation",s.saturation*100,0],["Skin hue protection",s.preserveSkin*100,0],["Faded black",s.fade*100,0],["Highlight softness",s.shoulder*100,0],
  ["Grain",f.grain*100,0],["Bloom",f.bloom*100,0],["Halation",f.halation*100,0],["Vignette",f.vignette*100,0],["Bleach bypass",f.bleach*100,0],["Frame ratio",ratio,1],
  ["Grain format",[0,8,16,35,65].indexOf(f.gauge),1],["Grain ISO",f.iso,0],["Film format",f.format,1],["Gate weave",f.weave*100,0],["Flicker",f.flicker*100,0],["Dust",f.dust*100,0],["Perforations",f.perfs,1],
  ["Film stock",Math.max(0,Object.keys(E.STOCKS).indexOf(s.stock)),1],["Stock amount",s.stockAmount*100,0]];
}
$("applyNative").addEventListener('click',async function(){try{
 var recipe=E.parse(E.serialize(state.model,live().settings,live().film));
 var x=await B.apply(window.OdyNativeRecipe.compile(recipe),effectParams(recipe));
 var manual=recipe.model&&x.linked!==x.count;  // Premiere: grade read from this computer's store at render time
 status("OdyGrade applied to "+x.count+" clip(s)."+(manual?" Reference match is live on this computer. To embed it in the project (for moving it elsewhere), click OdyGrade > Load native grade... and pick "+x.path:""));
}catch(e){fail(e);}});
$("loadRecipe").addEventListener("click",function(){$("recipeInput").click();});
$("recipeInput").addEventListener("change",async function(){
 try{
  var file=this.files[0];if(!file)return;await whileBusy(async function(){
  if(file.size>1024*1024)throw Error("Recipe exceeds 1 MB.");
  var recipe=E.parse(await file.text()),film=F.normalize(recipe.film);
  state.model=recipe.model;state.settings=recipe.settings;state.film=film;state.recipeLoaded=true;$("separateSkin").checked=!!(recipe.model&&recipe.model.skin);
  state.analysis=recipe.analysis||null;state.importedSamples=state.analysis?(state.analysis.sampleCount||(Array.isArray(state.analysis.sampleIndices)?state.analysis.sampleIndices.length:0)):0;
  if(CM.PROFILES[state.settings.inputProfile].scene)$("lutSize").value='65';sync();
  await requestRender();status("Saved grade restored. Its fitted transform is retained across source images.");
  });
 }catch(e){fail(e);}finally{this.value="";}
});
$("exportPng").addEventListener("click",async function(){
 state.busy=true;buttons();status("Rendering full-resolution still…");
 try{
  var img=pixels(state.sourceImage,Math.max(state.sourceImage.naturalWidth,state.sourceImage.naturalHeight/0.625));
  var result=await renderAsync(img),c=document.createElement("canvas");paint(c,result.image);
  var blob=await new Promise(function(r){c.toBlob(r,"image/png");});if(!blob)throw Error("Still export failed.");
  if(B.available){
   if(!window.cep||!window.cep.fs)throw Error("CEP filesystem not available. Export from browser preview.");
   var base64=await new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(reader.result.split(",")[1]);};reader.onerror=reject;reader.readAsDataURL(blob);});
   var dialog=window.cep.fs.showSaveDialogEx("Save graded still","","",["png"],"OdyGrade.png");
   if(dialog.err!==0)throw Error("Save dialog failed: "+dialog.err);
   if(!dialog.data){status("Save cancelled.");return;}
   var filePath=/\.png$/i.test(dialog.data)?dialog.data:dialog.data+".png";
   var written=window.cep.fs.writeFile(filePath,base64,window.cep.encoding.Base64);
   if(written.err!==0)throw Error("Could not write still: "+written.err);status("Saved: "+filePath);
  }else await download(blob,"OdyGrade-still.png","png");
 }catch(e){fail(e);}finally{state.busy=false;buttons();requestRender().catch(fail);}
});
$("capture").addEventListener("click",async function(){
 try{var x=await whileBusy(async function(){var x=await B.capture();var url="file:///"+x.path.replace(/\\/g,"/").split("/").map(function(part,i){return i===0?part:encodeURIComponent(part);}).join("/");
  await setImage("source",url,"Adobe captured frame");return x;});
  // Camera metadata (Sony XML) names the profile: select it through the normal profile handler.
  if(x.profile&&CM.PROFILES[x.profile]&&x.profile!==state.settings.inputProfile){$("sourceProfile").value=x.profile;$("sourceProfile").dispatchEvent(new Event('change'));}
 }catch(e){fail(e);}
});
$("demo").addEventListener("click",async function(){
 try{await whileBusy(async function(){
  var profile=state.settings.inputProfile;
  var sampleFiles={srgb:'sample-source.png','rec709-gamma24':'sample-gamma24.png',
   'sony-slog3-sgamut3cine':'sample-slog3.png','panasonic-vlog-vgamut':'sample-vlog.png'};
  state.model=null;state.analysis=null;state.recipeLoaded=false;state.settings=E.settings({inputProfile:profile});state.film=F.normalize();sync();
  if(!sampleFiles[profile]){profile='srgb';state.settings=E.settings({inputProfile:profile});sync();}  // no synthetic log sample for this camera
  await setImage("source","assets/"+sampleFiles[profile],"Synthetic sample · "+CM.PROFILES[profile].name);
  await setImage("reference","assets/sample-reference.png","Synthetic sample reference");
  status("Synthetic sample frames loaded. Press Create grade to explore matching.");
 });}catch(e){fail(e);}
});
if(B.available){B.info().then(function(x){$("host").textContent=x.name+" "+x.version;status("Adobe connected. Import a reference or capture the current frame.");}).catch(fail);}
else{$("capture").title="Available inside the Adobe CEP panel";}
// Deliberately limited read-only snapshot for UI verification.
window.OdyGradeState=function(){return {source:!!state.source,reference:!!state.reference,matched:!!state.model,
 samples:state.sourceFrames.length,activeFrame:state.activeFrame,busy:state.busy,
 settings:Object.assign({},state.settings),film:Object.assign({},state.film),rendered:!!state.result,view:state.view};};
})();
