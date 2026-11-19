'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const CM=require('../src/color-management.js'),E=require('../src/engine.js');
function close(actual,expected,tolerance=1e-9){assert.ok(Math.abs(actual-expected)<=tolerance,actual+' != '+expected);}
test('Sony published black and middle-gray code values decode to scene reflection',()=>{
 close(CM.decode(95/1023,2),0);close(CM.decode(420/1023,2),.18);
 close(CM.decode(598/1023,2),.9,.004);
 close(CM.decode(171.2102946929/1023-1e-10,2),.01125,1e-8);
 close(CM.decode(171.2102946929/1023+1e-10,2),.01125,1e-8);
});
test('Panasonic reference formula and published rounded gray/white code values decode correctly',()=>{
 close(CM.decode(.125,3),0);close(CM.decode(433/1023,3),.18,.0002);close(CM.decode(602/1023,3),.9,.004);
 close(CM.decode(.181-1e-10,3),.01,1e-8);close(CM.decode(.181+1e-10,3),.01,3e-6);
});
test('V-Gamut matrix derived from primaries agrees with manufacturer matrix',()=>{
 const published=[1.806576,-.695697,-.110879,-.170090,1.305955,-.135865,-.025206,-.154468,1.179674];
 CM.PROFILES['panasonic-vlog-vgamut'].matrix.forEach((v,i)=>close(v,published[i],.00000051));
});
test('camera transforms preserve D65 neutrals through gamut conversion',()=>{
 const sources=[['sony-slog3-sgamut3cine',420/1023],['panasonic-vlog-vgamut',.241514*Math.log10(.18+.00873)+.598206]];
 for(const [id,gray] of sources){
  const linear=CM.toLinear709([gray,gray,gray],id);linear.forEach(v=>close(v,.18,1e-9));
  const display=CM.create(id)([gray,gray,gray]);display.forEach(v=>close(v,CM.encodeSRGB(.18),1e-9));
 }
});
test('gamma 2.4 display conversion is distinct from sRGB, preserves black and white',()=>{
 const convert=CM.create('rec709-gamma24');close(convert([0,0,0])[0],0);close(convert([1,1,1])[0],1);
 close(convert([.5,.5,.5])[0],CM.encodeSRGB(Math.pow(.5,2.4)));
 assert.ok(convert([.5,.5,.5])[0]<.49);assert.deepEqual(CM.create('srgb')([.1,.5,1]),[.1,.5,1]);
});
test('our SDR display rolloff is continuous, monotone and bounds camera outputs',()=>{
 close(CM.displayMap(.8-1e-9),CM.displayMap(.8+1e-9),3e-9);
 assert.ok(CM.displayMap(2)>CM.displayMap(1));assert.ok(CM.displayMap(2)<1);
 for(const id of Object.keys(CM.PROFILES))for(const rgb of [[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1]])
  assert.ok(CM.create(id)(rgb).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
test('profile selection is validated and a fitted grade cannot silently change input encoding',()=>{
 for(const id of ['__proto__','log','sony-venice','constructor'])assert.throws(()=>E.settings({inputProfile:id}),/profile/);
 const source={width:16,height:16,data:new Uint8ClampedArray(16*16*4)};
 for(let i=0;i<256;i++)source.data.set([80+i%130,100+i%100,90+i%120,255],i*4);
 const options={inputProfile:'sony-slog3-sgamut3cine'},reference=E.render(source,null,options),model=E.fit(source,reference,options);
 assert.equal(model.inputProfile,options.inputProfile);
 assert.doesNotThrow(()=>E.render(source,model,options));
 assert.throws(()=>E.render(source,model,{}),/profile changed/);
 const cube=E.cube(null,options,17);assert.match(cube,/# input profile: sony-slog3-sgamut3cine; output: sRGB SDR/);
});
test('camera black/matte bars are excluded after normalization, not counted as log midtones',()=>{
 for(const [id,black,gray] of [['sony-slog3-sgamut3cine',24,105],['panasonic-vlog-vgamut',32,108]]){
  const data=new Uint8ClampedArray(16*16*4);for(let i=0;i<256;i++){const v=i<128?black:gray;data.set([v,v,v,255],i*4);}
  const source={width:16,height:16,data},settings={inputProfile:id},reference=E.render(source,null,settings);
  const model=E.fit(source,reference,settings);assert.equal(model.source.count,128);assert.equal(model.reference.count,128);
 }
});
test('JSON v1 sample migrates to v2 sRGB without changing its frozen model',()=>{
 const text=fs.readFileSync(path.resolve(__dirname,'../assets/sample-grade.json'),'utf8');
 const legacy=JSON.parse(text);assert.equal(legacy.version,1);
 const r=E.parse(text);assert.equal(r.version,2);assert.equal(r.settings.inputProfile,'srgb');assert.equal(r.outputSpace,'srgb');
 assert.deepEqual(r.model,legacy.model);
 const saved=E.parse(E.serialize(r.model,r.settings,r.film));assert.deepEqual(saved.model,r.model);
});
test('JSON v2 stores the input domain and rejects inconsistent or disguised legacy profiles',()=>{
 const options={inputProfile:'panasonic-vlog-vgamut'},r=E.parse(E.serialize(null,options));
 assert.equal(r.inputSpace,options.inputProfile);assert.equal(r.outputSpace,'srgb');
 r.settings.inputProfile='srgb';assert.throws(()=>E.parse(JSON.stringify(r)),/mismatch/);
 const old={format:'odygrade',version:1,inputSpace:'srgb',settings:options};
 assert.throws(()=>E.parse(JSON.stringify(old)),/legacy/);
 assert.equal(E.settings({unknownControl:'ignored'}).unknownControl,undefined);
});
