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
// Independent forward (encoding) formulas from the same manufacturer references; decode must invert them.
const ENCODE={
 10:(()=>{const a=.17883277,b=1-4*a,c=.5-a*Math.log(4*a),W=(Math.exp((.75-c)/a)+b)/12;return x=>{const e=x*W;return e<=1/12?Math.sign(e)*Math.sqrt(3*Math.abs(e)):a*Math.log(12*e-b)+c;};})(),
 4:x=>x>.010591?.24719*Math.log10(5.555556*x+.052272)+.385537:5.367655*x+.092809,
 5:r=>{const x=r/.9;return x<-.014?-.36726845*Math.log10(1-14.98325*x)+.12783901:x<=.014?1.9754798*x+.12512219:.36726845*Math.log10(14.98325*x+1)+.12240537;},
 6:x=>x>=.00089?.344676*Math.log10(.555556*x+.009468)+.790453:8.735631*x+.092864,
 7:x=>x<=.0078?6.025*x+.0929:Math.log10(x*.9892+.0108)*.256663+.584555,
 8:x=>x>=.01?.08550479*Math.log2(x+.00964052)+.69336945:x>-.05641088?47.28711236*Math.pow(x+.05641088,2):0,
 9:x=>x<.005?8.283605932402494*x+.09246575342465753:.08692876065491224*Math.log(x+.005494072432257808)+.5300133392291939};
test('new camera log curves invert their published encodings and hit published 18% gray',()=>{
 for(const t of Object.keys(ENCODE).map(Number))for(const x of [-.005,0,.001,.01,.05,.18,.9,4,16])close(CM.decode(ENCODE[t](x),t),x,2e-6*Math.max(1,x));
 close(ENCODE[4](.18),.391,.0005);close(ENCODE[5](.18),.343,.001);close(ENCODE[6](.18),470/1023,.001);
});
// D-Gamut is published to 4 decimals; BMD publishes with its own white (0.312717,0.3290312), we use D65 so neutrals stay exact.
test('derived camera gamut matrices agree with manufacturer RGB->XYZ matrices',()=>{
 const published={awg3:[.638008,.214704,.097744,.291954,.823841,-.115795,.002798,-.067034,1.153294],
  dgamut:[.6482,.1940,.1082,.2830,.8132,-.0962,-.0183,-.0832,1.1903],
  bmdwg:[.606530,.220408,.123479,.267989,.832731,-.100720,-.029442,-.086611,1.204861]};
 const primaries={awg3:[[.684,.313],[.221,.848],[.0861,-.102]],dgamut:[[.71,.31],[.21,.88],[.09,-.08]],
  bmdwg:[[.7177215,.3171181],[.228041,.861569],[.1005841,-.0820452]]};
 for(const k of Object.keys(published))CM.rgbToXYZ(primaries[k]).forEach((v,i)=>close(v,published[k][i],k==='awg3'?.0001:.0003));
});
test('camera transforms preserve D65 neutrals through gamut conversion',()=>{
 for(const [id,t] of [['arri-logc3-awg3',4],['canon-clog3-cinemagamut',5],['fujifilm-flog-fgamut',6],['dji-dlog-dgamut',7],['apple-log-rec2020',8],['blackmagic-film5-wg5',9],['hlg-rec2020',10]]){
  assert.equal(CM.PROFILES[id].transfer,t);const gray=ENCODE[t](.18);
  CM.toLinear709([gray,gray,gray],id).forEach(v=>close(v,.18,1e-6));
 }
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
test('HLG decodes BT.2408 reference levels and inverts the BT.2100 OETF',()=>{
 close(CM.decode(.75,10),1,1e-12);close(CM.decode(0,10),0);close(CM.decode(.38,10),.1817,.0005);
 close(CM.decode(.5-1e-12,10),CM.decode(.5+1e-12,10),1e-9);assert.ok(CM.decode(1,10)>3.7&&CM.decode(1,10)<3.8);
 for(const x of [.01,.2,.5,.6,.9,1])close(ENCODE[10](CM.decode(x,10)),x,1e-9);
});
