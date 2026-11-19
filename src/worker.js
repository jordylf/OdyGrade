importScripts("color-management.js","engine.js","film.js");
self.onmessage=function(event){
 var x=event.data;
 try{
  var out=OdyColor.render(x.image,x.model,x.settings);
  out=OdyFilm.apply(out,x.film);
  self.postMessage({id:x.id,image:out},[out.data.buffer]);
 }catch(e){self.postMessage({id:x.id,error:e.message});}
};
