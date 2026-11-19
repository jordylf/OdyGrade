/* Minimal CEP transport, not a replacement for Adobe's CSInterface library. */
window.OdyBridge=(function(){
 var cep=window.__adobe_cep__;
 function call(name,args){
  return new Promise(function(resolve,reject){
   if(!cep)return reject(Error("Open this panel in Adobe to use this action."));
   var script="OdyHost."+name+"("+(args||[]).map(function(x){return JSON.stringify(x);}).join(",")+")";
   cep.evalScript(script,function(raw){
    try{var x=JSON.parse(raw);if(!x.ok)throw Error(x.error||"Adobe operation failed");resolve(x);}
    catch(e){reject(Error(raw==="EvalScript error."?"Adobe bridge did not load. Reopen the panel.":e.message));}
   });
  });
 }
 return {available:!!cep,info:function(){return call("info");},capture:function(){return call("capture");},
  save:function(text,kind){return call("saveText",[encodeURIComponent(text),kind]);},
  apply:function(snapshot,params){return call("apply",[encodeURIComponent(snapshot),params]);}};
})();