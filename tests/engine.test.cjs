const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../src/engine.js');
function image(fn,w=32,h=24){const d=new Uint8ClampedArray(w*h*4);for(let i=0;i<w*h;i++){const c=fn(i,w*h);d.set([...c,255],i*4);}return {width:w,height:h,data:d};}
const ramp=image((i,n)=>{const v=20+210*i/n;return [v,v*.92,v*.85];});
const warm=image((i,n)=>{const v=30+190*i/n;return [v,v*.8,v*.65];});
function mae(a,b){let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);return sum/a.length;}
test('neutral render preserves RGBA within one code value',()=>assert.ok(mae(E.render(ramp,null).data,ramp.data)<0.15));
test('sRGB/OKLab roundtrip includes black and saturated colors',()=>{
  for(const c of [[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1],[.4,.2,.1]]){
    const back=E.fromLab(E.toLab(c));assert.ok(c.every((v,i)=>Math.abs(v-back[i])<0.00001));
  }
});
test('matching identical image is identity',()=>{
  const m=E.fit(ramp,ramp);assert.ok(mae(E.render(ramp,m).data,ramp.data)<0.15);
});
test('matching improves distance to reference for a palette/exposure change',()=>{
  const m=E.fit(ramp,warm),out=E.render(ramp,m,{preserveSkin:0});
  assert.ok(mae(out.data,warm.data)<mae(ramp.data,warm.data)*.6);
});
test('strength zero is ungraded even with a fitted reference',()=>{
  const m=E.fit(ramp,warm);assert.ok(mae(E.render(ramp,m,{strength:0}).data,ramp.data)<.15);
});
test('alpha is preserved and transparent pixels excluded from fitting',()=>{
  const src=image(()=>[80,100,120]);src.data[3]=0;
  const m=E.fit(src,warm);assert.equal(m.source.count,src.width*src.height-1);
  assert.equal(E.render(src,m).data[3],0);
});
test('black images and malformed images fail explicitly',()=>{
  assert.throws(()=>E.fit(image(()=>[0,0,0]),warm),/16/);
  assert.throws(()=>E.render({width:2,height:2,data:[]}),/RGBA/);
});
test('flat gray and highly saturated input produce finite clipped outputs',()=>{
  const m=E.fit(image(()=>[120,120,120]),warm);
  assert.ok(m.warnings.length);const f=E.createTransform(m);
  for(const rgb of [[0,0,0],[1,1,1],[1,0,0],[0,1,0],[0,0,1]]) assert.ok(f(rgb).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
});
test('recipe roundtrips with identical output and rejects incompatible/malformed state',()=>{
  const m=E.fit(ramp,warm),s={strength:.7,look:'cyan'};
  const p=E.parse(E.serialize(m,s,{grain:.2}));
  assert.deepEqual(E.render(ramp,m,s).data,E.render(ramp,p.model,p.settings).data);
  assert.throws(()=>E.parse('{"format":"other","version":1}'));
  assert.throws(()=>E.settings({strength:NaN}));
  const x=JSON.parse(E.serialize(m,s));x.model.source.quantiles=[0];
  assert.throws(()=>E.parse(JSON.stringify(x)),/distribution/);
});
test('correction requires refit and is not silently exported stale',()=>{
  const m=E.fit(ramp,warm);assert.throws(()=>E.cube(m,{exposure:1},17),/refit/);
  const n=E.fit(ramp,warm,{exposure:1});assert.doesNotThrow(()=>E.render(ramp,n,{exposure:1}));
});
test('cube has correct count, red-fastest order, endpoints and RGB values',()=>{
  const text=E.cube(null,null,17),rows=text.split('\n').filter(x=>/^\d+\.\d+ /.test(x)).map(x=>x.split(' ').map(Number));
  assert.equal(rows.length,17**3);assert.ok(rows[1][0]>.06&&rows[1][1]<1e-5);
  assert.deepEqual(rows[0],[0,0,0]);assert.ok(rows.at(-1).every(x=>x>.99999));
  assert.throws(()=>E.cube(null,null,32),/size/);
});
test('skin protection reduces warm hue drift',()=>{
  const skin=image(()=>[180,120,90]);const ref=image(()=>[70,140,150]);
  const m=E.fit(skin,ref);const a=E.render(skin,m,{preserveSkin:0}),b=E.render(skin,m,{preserveSkin:1});
  assert.ok(mae(b.data,skin.data)<mae(a.data,skin.data));
});
test('frozen model returns the same color independent of image context',()=>{
  const f=E.createTransform(E.fit(ramp,warm));assert.deepEqual(f([.3,.4,.5]),f([.3,.4,.5]));
});

test('recipe rejects missing or nonfinite model correction',()=>{
 const m=E.fit(ramp,warm);const x=JSON.parse(E.serialize(m,{}));delete x.model.correction;
 assert.throws(()=>E.parse(JSON.stringify(x)),/correction/);
 x.model.correction={exposure:null,temperature:0,tint:0};assert.throws(()=>E.parse(JSON.stringify(x)),/correction/);
});
test('prototype look IDs, negative spreads and overflow-sized distributions are rejected',()=>{
 for(const look of ['__proto__','constructor','toString'])assert.throws(()=>E.settings({look}),/look/);
 const x=JSON.parse(E.serialize(E.fit(ramp,warm),{}));x.model.source.zones[0].sa=-.1;
 assert.throws(()=>E.parse(JSON.stringify(x)),/spread/);
 const large=JSON.parse(E.serialize(E.fit(ramp,warm),{}));large.model.source.quantiles=Array(9).fill(1e300);
 assert.throws(()=>E.parse(JSON.stringify(large)),/quantiles/);
});
