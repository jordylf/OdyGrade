/* ES3-compatible host adapter. QE frame capture is experimental, not a supported
   Adobe API; verify on each installed Premiere version. No timeline edits here. */
var OdyHost = {
  quote:function(s){return '"'+String(s).replace(/\\/g,"\\\\").replace(/"/g,'\\"').replace(/\r/g,"\\r").replace(/\n/g,"\\n").replace(/\t/g,"\\t")+'"';},
  reply:function(obj){var out=[],k;for(k in obj)if(obj.hasOwnProperty(k))out.push(this.quote(k)+":"+(typeof obj[k]==="boolean"?(obj[k]?"true":"false"):this.quote(obj[k])));return "{"+out.join(",")+"}";},
  info:function(){try{return this.reply({ok:true,name:app.name||"Adobe",version:app.version});}catch(e){return this.reply({ok:false,error:e.toString()});}},
  capture:function(){
    try{
      var dir=new Folder(Folder.userData.fsName+"/OdyGrade/captures");
      if(!dir.exists&&!dir.create())throw Error("Cannot create per-user capture folder.");
      var base=dir.fsName+"/frame-"+new Date().getTime(),f;
      if(typeof CompItem!=="undefined"){
        var comp=app.project.activeItem;
        if(!(comp instanceof CompItem))throw Error("Open a composition first.");
        f=new File(base+".png");comp.saveFrameToPng(comp.time,f);
        // AE 24 writes the PNG asynchronously: wait until it exists and its size stops changing.
        var waited=0,last=-1;
        while(waited<15000&&!(f.exists&&f.length>0&&f.length===last)){last=f.exists?f.length:-1;$.sleep(100);waited+=100;}
      }else{
        if(!app.project.activeSequence)throw Error("Open an active sequence first.");
        app.enableQE();var seq=qe.project.getActiveSequence();
        if(!seq)throw Error("No active QE sequence.");
        if(Folder.fs==="Windows")base=base.replace(/\//g,"\\");
        seq.exportFramePNG(seq.CTI.timecode,base);
        f=new File(base+".png");
        if(!f.exists){var alternate=new File(base);if(alternate.exists)f=alternate;}
      }
      if(!f.exists)throw Error("Frame capture produced no file. Export a PNG manually and import it.");
      var profile="";try{profile=this.profileFromMeta(this.mediaMeta(this.mediaUnderPlayhead()));}catch(ignore){}
      return this.reply({ok:true,path:f.fsName,profile:profile});
    }catch(e){return this.reply({ok:false,error:e.toString()});}
  },
  /* Camera metadata -> OdyGrade profile key, "" when unknown. Only exact matches, never a guess.
     Sony: NonRealTimeMeta XML (CaptureGammaEquation / CaptureColorPrimaries).
     Panasonic: com.panasonic.Semi-Pro.metadata.xml (<CaptureGamma> / <CaptureGamut>).
     Apple: logs atom or customgamma "com.apple.rec2020.apple-log" (Apple Log 2 is not this profile).
     DJI: QuickTime key com.dji.camera.ColorGammaSxS; the colr box says Rec.709 even for D-Log.
     Panasonic, Apple and DJI were written from documentation and have not been tried on real clips. */
  profileFromMeta:function(s){
    s=s||"";var g=/CaptureGammaEquation"\s+value="([^"]+)"/.exec(s),p=/CaptureColorPrimaries"\s+value="([^"]+)"/.exec(s);
    if(g){g=g[1].toLowerCase();p=p?p[1].toLowerCase():"";
      if(g.indexOf("s-log3")===0&&p==="s-gamut3-cine")return "sony-slog3-sgamut3cine";
      if(g==="rec2100-hlg"&&(p==="rec2020"||p==="rec2100"))return "hlg-rec2020";
      return "";}
    g=/<(?:[\w-]+:)?CaptureGamma\b[^>]*>([^<]*)</.exec(s);p=/<(?:[\w-]+:)?CaptureGamut\b[^>]*>([^<]*)</.exec(s);
    if(g){g=g[1].replace(/^\s+|\s+$/g,"").toLowerCase();p=p?p[1].replace(/^\s+|\s+$/g,"").toLowerCase():"";
      return (g==="v-log"||g==="v-logl")&&p==="v-gamut"?"panasonic-vlog-vgamut":"";}  // V-Log L uses the V-Log curve
    if(/com\.apple\.rec2020\.apple-log(?![\w.-])/.test(s))return "apple-log-rec2020";
    g=this.quickTimeKeys(s)["com.dji.camera.ColorGammaSxS"];
    if(g){g=g.replace(/[\s\0]+$/,"").toLowerCase();  // D-Log M and D-Log2 are other curves: not matched
      if(g==="d-log")return "dji-dlog-dgamut";if(g==="rec.2100 hlg")return "hlg-rec2020";}
    return "";
  },
  u32:function(s,i){return s.charCodeAt(i)*16777216+(s.charCodeAt(i+1)<<16)+(s.charCodeAt(i+2)<<8)+s.charCodeAt(i+3);},
  /* QuickTime metadata: a 'keys' box (mdta names) and an 'ilst' box whose items are numbered by key. */
  quickTimeKeys:function(s){
    var out={},k=-1,names,i,j,n,sz,l,end,d,idx;
    while((k=s.indexOf("keys",k+1))!==-1){
      n=this.u32(s,k+8);i=k+12;names=[];
      if(k<4||this.u32(s,k+4)!==0||n<1||n>256)continue;
      for(j=0;j<n;j++){sz=this.u32(s,i);if(sz<8||s.substr(i+4,4)!=="mdta")break;names.push(s.substr(i+8,sz-8));i+=sz;}
      if(j<n||s.substr(i+4,4)!=="ilst")continue;
      end=i+this.u32(s,i);i+=8;
      while(i+8<=end&&i+8<=s.length){sz=this.u32(s,i);if(sz<8)break;idx=this.u32(s,i+4);d=i+8;
        if(s.substr(d+4,4)==="data"&&idx>=1&&idx<=names.length)out[names[idx-1]]=s.substr(d+16,this.u32(s,d)-16);
        i+=sz;}
      return out;
    }
    return out;
  },
  /* Bytes to search: 64 KB at each end (Sony XML), plus the first 4 MB of an MP4/MOV moov box,
     found by walking the top-level boxes (keys, ilst and sample descriptions live there). */
  mediaMeta:function(path){
    if(!path)return "";var f=new File(path),s="",len,pos=0,i,h,size;f.encoding="BINARY";if(!f.open("r"))return "";
    try{len=f.length;s=f.read(65536);if(len>65536){f.seek(Math.max(65536,len-65536));s+=f.read(65536);}
      for(i=0;i<64&&pos+8<=len;i++){f.seek(pos);h=f.read(16);if(h.length<8)break;size=this.u32(h,0);
        if(size===1)size=this.u32(h,8)*4294967296+this.u32(h,12);else if(size===0)size=len-pos;
        if(size<8)break;
        if(h.substr(4,4)==="moov"){f.seek(pos);s+=f.read(Math.min(size,4194304));break;}
        pos+=size;}
    }finally{f.close();}
    return s;
  },
  /* Source file of the selected AE layer, else the topmost footage layer/clip under the playhead. */
  mediaUnderPlayhead:function(){
    var i,L,t;
    if(typeof CompItem!=="undefined"){
      var comp=app.project.activeItem,sel=comp.selectedLayers;
      for(i=0;i<sel.length;i++)if(sel[i].source&&sel[i].source.file)return sel[i].source.file.fsName;
      for(i=1;i<=comp.numLayers;i++){L=comp.layer(i);if(L.enabled&&L.source&&L.source.file&&L.activeAtTime(comp.time))return L.source.file.fsName;}
      return "";
    }
    var seq=app.project.activeSequence,tracks=seq.videoTracks,j,c;t=seq.getPlayerPosition().seconds;
    for(i=tracks.numTracks-1;i>=0;i--)for(j=0;j<tracks[i].clips.numItems;j++){c=tracks[i].clips[j];
      if(c.start.seconds<=t&&t<c.end.seconds&&c.projectItem)return c.projectItem.getMediaPath();}
    return "";
  },
  /* Adds (or reuses) the native OdyGrade effect on selected AE layers / Premiere video
     clips and sets its controls. params: [[displayName,value,isPopup0Based],...].
     Popups: Premiere scripting is 0-based, AE 1-based (verified live 2026-11-20).
     The embedded reference grade cannot be set by script; it is written to
     last-applied.odyn for the effect's "Load native grade..." button. */
  apply:function(encoded,params){
    try{
      var dir=new Folder(Folder.userData.fsName+"/OdyGrade"),pending=new Folder(dir.fsName+"/pending"),n=0,linked=0,i,j,fx;
      if(!dir.exists&&!dir.create())throw Error("Cannot create per-user OdyGrade folder.");
      if(!pending.exists&&!pending.create())throw Error("Cannot create OdyGrade pending folder.");
      // "Grade link" token: AE embeds pending/<token>.odyn on change and acks with -token; Premiere
      // (no scripted callback) reads it at render time, so files are kept and tokens never reused.
      var token=0,text=decodeURIComponent(encoded);
      for(i=0;i<200&&!token;i++){token=1+Math.floor(Math.random()*29999);if(new File(pending.fsName+"/"+token+".odyn").exists)token=0;}
      if(!token)throw Error("OdyGrade pending grade store is full.");
      var files=[new File(dir.fsName+"/last-applied.odyn"),new File(pending.fsName+"/"+token+".odyn")],grade=files[0];
      for(i=0;i<files.length;i++){files[i].encoding="UTF-8";if(!files[i].open("w"))throw Error("Cannot write native grade file.");
        try{if(!files[i].write(text))throw Error("Cannot write native grade file.");}finally{files[i].close();}}
      if(typeof CompItem!=="undefined"){
        var comp=app.project.activeItem;
        if(!(comp instanceof CompItem))throw Error("Open a composition and select layers first.");
        var layers=comp.selectedLayers;if(!layers.length)throw Error("Select at least one layer.");
        app.beginUndoGroup("Apply OdyGrade");
        try{for(i=0;i<layers.length;i++){var parade=layers[i].property("ADBE Effect Parade");if(!parade)continue;
          fx=parade.property("OdyWorks OdyGrade")||parade.addProperty("OdyWorks OdyGrade");
          for(j=0;j<params.length;j++)fx.property(params[j][0]).setValue(params[j][2]?params[j][1]+1:params[j][1]);
          fx.property("Grade link").setValue(token);if(fx.property("Grade link").value===-token)linked++;n++;}}
        finally{app.endUndoGroup();}
      }else{
        var seq=app.project.activeSequence;if(!seq)throw Error("Open a sequence and select clips first.");
        app.enableQE();var q=qe.project.getActiveSequence(),effect=qe.project.getVideoEffectByName("OdyGrade");
        if(!effect)throw Error("OdyGrade effect is not installed.");
        for(var t=0;t<seq.videoTracks.numTracks;t++){var track=seq.videoTracks[t];
          for(var k=0;k<track.clips.numItems;k++){var clip=track.clips[k];if(!clip.isSelected())continue;
            // Premiere History records Remove/Apply Effect but not scripted setValue, so replace
            // an existing OdyGrade instead of editing it: every apply then undoes on its own.
            var item=this.qeItem(q.getVideoTrackAt(t),k);
            for(var c=item.numComponents-1;c>=0;c--)if(item.getComponentAt(c).name==="OdyGrade")item.getComponentAt(c).remove();
            this.qeItem(q.getVideoTrackAt(t),k).addVideoEffect(effect);fx=this.component(clip);
            if(!fx)throw Error("Could not add OdyGrade to "+clip.name);
            for(j=0;j<params.length;j++)this.param(fx,params[j][0]).setValue(params[j][1],true);
            var link=this.param(fx,"Grade link");link.setValue(token,true);if(link.getValue()===-token)linked++;n++;}}
      }
      if(!n)throw Error("Select at least one video layer or clip.");
      return this.reply({ok:true,count:String(n),linked:String(linked),path:grade.fsName});
    }catch(e){return this.reply({ok:false,error:e.toString()});}
  },
  component:function(clip){var c=clip.components;for(var i=0;i<c.numItems;i++)if(c[i].displayName==="OdyGrade")return c[i];return null;},
  param:function(c,name){for(var i=0;i<c.properties.numItems;i++)if(c.properties[i].displayName===name)return c.properties[i];throw Error("OdyGrade control missing: "+name);},
  // QE track items include gaps ("Empty"); the k-th DOM clip is the k-th non-empty QE item.
  qeItem:function(track,k){for(var i=0,seen=0;i<track.numItems;i++){var it=track.getItemAt(i);if(it.type==="Empty")continue;if(seen++===k)return it;}throw Error("Timeline item not found.");},
  saveText:function(encoded,kind){
    try{
      if(kind!=="cube"&&kind!=="json"&&kind!=="odyn")throw Error("Unsupported export type.");
      var text=decodeURIComponent(encoded);
      var file=File.saveDialog("Save OdyGrade "+kind,kind==="cube"?"LUT:*.cube":kind==="odyn"?"Native grade:*.odyn":"Recipe:*.json");
      if(!file)return this.reply({ok:true,cancelled:true});
      if(!new RegExp("\\."+kind+"$","i").test(file.name))file=new File(file.fsName+"."+kind);
      file.encoding="UTF-8";
      if(!file.open("w"))throw Error("Cannot open output file.");
      try{if(!file.write(text))throw Error("Cannot write output file.");}finally{file.close();}
      return this.reply({ok:true,path:file.fsName});
    }catch(e){return this.reply({ok:false,error:e.toString()});}
  }
};
