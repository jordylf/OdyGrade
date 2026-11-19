/* Validated interchange for the portable C++ renderer. JSON remains the editable
 * user recipe. This internal snapshot contains no file paths or executable code. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'),require('./film.js'));
  else root.OdyNativeRecipe=factory(root.OdyColor,root.OdyFilm);
})(typeof window!=='undefined'?window:this,function(E,F){
  'use strict';
  function compile(recipe){
    var r=E.parse(JSON.stringify(recipe)),film=F.normalize(r.film),s=r.settings;
    var lines=['ODYGRADE_NATIVE 2','settings '+[s.strength,s.exposure,s.temperature,s.tint,
      s.contrast,s.saturation,s.preserveSkin,s.fade,s.shoulder].join(' '),'look '+s.look,'profile '+s.inputProfile,'model '+(r.model?1:0)];
    function distribution(d){
      return d.quantiles.concat(d.zones.reduce(function(values,z){return values.concat([z.a,z.b,z.sa,z.sb]);},[])).join(' ');
    }
    if(r.model){
      lines.push('correction '+[r.model.correction.exposure,r.model.correction.temperature,r.model.correction.tint].join(' '));
      lines.push('model-profile '+(r.model.version===1?'srgb':r.model.inputProfile));
      lines.push('source '+distribution(r.model.source),'reference '+distribution(r.model.reference));
    }
    lines.push('film '+[film.grain,film.bloom,film.halation,film.vignette,film.bleach,film.ratio].join(' '),'end');
    return lines.join('\n')+'\n';
  }
  return {compile:compile};
});
