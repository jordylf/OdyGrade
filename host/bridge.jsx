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
      return this.reply({ok:true,path:f.fsName});
    }catch(e){return this.reply({ok:false,error:e.toString()});}
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
      var old=pending.getFiles("*.odyn");for(i=0;i<old.length;i++)old[i].remove();  // only our own pending grades
      // "Grade link" token: the effect embeds pending/<token>.odyn on change and acks with -token.
      var token=1+Math.floor(Math.random()*29999),text=decodeURIComponent(encoded);
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
            fx=this.component(clip);
            if(!fx){this.qeItem(q.getVideoTrackAt(t),k).addVideoEffect(effect);fx=this.component(clip);}
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
