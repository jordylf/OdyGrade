/* Validated interchange for the portable C++ renderer. JSON remains the editable
 * user recipe. This internal snapshot contains no file paths or executable code. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./film.js'));
  else root.OdyNativeRecipe=factory(root.OdyColor,root.OdyFilm);
})(typeof window!=='undefined'?window:this,function(E,F){
  'use strict';
  function compile(recipe){
    var r=E.parse(JSON.stringify(recipe)),film=F.normalize(r.film),s=r.settings;
    // v6 adds the skin line; grades without a separate skin match stay v5 for older effects.
    // v7 adds the hue line and a skin flag; older snapshots stay readable by older effects.
    var v=r.model&&r.model.hue?7:r.model&&r.model.skin?6:5;
    var lines=['ODYGRADE_NATIVE '+v,'settings '+[s.strength,s.exposure,s.temperature,s.tint,
      s.contrast,s.saturation,s.preserveSkin,s.fade,s.shoulder].join(' '),'look '+s.look,'profile '+s.inputProfile,'stock '+s.stock+' '+s.stockAmount,'model '+(r.model?1:0)];
    function distribution(d){
      // v3: chroma tail p90 p99, or -1 -1 for models fitted before it existed.
      return d.quantiles.concat(d.zones.reduce(function(values,z){return values.concat([z.a,z.b,z.sa,z.sb]);},[]),d.chroma||[-1,-1]).join(' ');
    }
    if(r.model){
      lines.push('correction '+[r.model.correction.exposure,r.model.correction.temperature,r.model.correction.tint].join(' '));
      lines.push('model-profile '+(r.model.version===1?'srgb':r.model.inputProfile));
      lines.push('source '+distribution(r.model.source),'reference '+distribution(r.model.reference));
      if(v===7)lines.push('hue '+r.model.hue.reduce(function(x,h){return x.concat(h);},[]).join(' '));
      var skin=r.model.skin?[r.model.skin.source,r.model.skin.reference].reduce(function(x,z){return x.concat([z.a,z.b,z.sa,z.sb]);},[]).join(' '):'';
      if(v===7)lines.push('skin '+(r.model.skin?'1 '+skin:'0'));else if(r.model.skin)lines.push('skin '+skin);
    }
    // v4: grain gauge/ISO and film format (weave, flicker, dust, perforations) follow the v1 film fields.
    lines.push('film '+[film.grain,film.bloom,film.halation,film.vignette,film.bleach,film.ratio,
      film.gauge,film.iso,film.format,film.weave,film.flicker,film.dust,film.perfs].join(' '),'end');
    return lines.join('\n')+'\n';
  }
  return {compile:compile};
});
