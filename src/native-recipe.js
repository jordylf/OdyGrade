/* Validated interchange for the portable C++ renderer. JSON remains the editable
 * user recipe. This internal snapshot contains no file paths or executable code. */
(function(root,factory){
  if(typeof module==='object'&&module.exports&&typeof window==='undefined'&&typeof importScripts==='undefined')module.exports=factory(require('./engine.js'),require('./film.js'));
  else root.OdyNativeRecipe=factory(root.OdyColor,root.OdyFilm);
})(typeof window!=='undefined'?window:this,function(E,F){
  'use strict';
  function compile(recipe){
    var r=E.parse(JSON.stringify(recipe)),film=F.normalize(r.film),s=r.settings;
    // v6 adds the skin line; grades without a separate skin match stay v5 for older effects.
    // v7 adds the hue line and a skin flag; older snapshots stay readable by older effects.
    // v8 adds the output line (HDR delivery) and a hue flag; it is also used for face-measured skin
    // (skin flag 2) so older effects fail with a clear version error. Other grades keep v5-v7.
    var v=s.output!=='sdr'||r.model&&r.model.skin&&r.model.skin.face?8:r.model&&r.model.hue?7:r.model&&r.model.skin?6:5;
    var lines=['ODYGRADE_NATIVE '+v,'settings '+[s.strength,s.exposure,s.temperature,s.tint,
      s.contrast,s.saturation,s.preserveSkin,s.fade,s.shoulder].join(' '),'look '+s.look,'profile '+s.inputProfile,'stock '+s.stock+' '+s.stockAmount].concat(v===8?['output '+s.output]:[],['model '+(r.model?1:0)]);
    function distribution(d){
      // v3: chroma tail p90 p99, or -1 -1 for models fitted before it existed.
      return d.quantiles.concat(d.zones.reduce(function(values,z){return values.concat([z.a,z.b,z.sa,z.sb]);},[]),d.chroma||[-1,-1]).join(' ');
    }
    if(r.model){
      lines.push('correction '+[r.model.correction.exposure,r.model.correction.temperature,r.model.correction.tint].join(' '));
      lines.push('model-profile '+(r.model.version===1?'srgb':r.model.inputProfile));
      lines.push('source '+distribution(r.model.source),'reference '+distribution(r.model.reference));
      var bands=r.model.hue?r.model.hue.reduce(function(x,h){return x.concat(h);},[]).join(' '):'';
      // v8 hue flag: 0 = model fitted before hue bands (no hue match), 1 = 12 band numbers follow.
      if(v===7)lines.push('hue '+bands);else if(v===8)lines.push('hue '+(r.model.hue?'1 '+bands:'0'));
      var skin=r.model.skin?[r.model.skin.source,r.model.skin.reference].reduce(function(x,z){return x.concat([z.a,z.b,z.sa,z.sb]);},[]).join(' '):'';
      // v7 skin flag: 0 none, 1 hue-picked skin, 2 face-measured skin (older effects reject 2).
      if(v>=7)lines.push('skin '+(r.model.skin?(r.model.skin.face?'2 ':'1 ')+skin:'0'));else if(r.model.skin)lines.push('skin '+skin);
    }
    // v4: grain gauge/ISO and film format (weave, flicker, dust, perforations) follow the v1 film fields.
    lines.push('film '+[film.grain,film.bloom,film.halation,film.vignette,film.bleach,film.ratio,
      film.gauge,film.iso,film.format,film.weave,film.flicker,film.dust,film.perfs].join(' '),'end');
    return lines.join('\n')+'\n';
  }
  return {compile:compile};
});
