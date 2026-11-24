'use strict';
// Separate skin/background match (panel: "Match skin and background separately").
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const E=require('../src/engine.js'),N=require('../src/native-recipe.js');
const exe=require('../tools/native.cjs').executable();
// Left half skin tones, right half a second colour, with small per-pixel variation.
function image(skin,other,w=64,h=48){
 const data=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=x<w/2?skin:other,v=((x*7+y*13)%11-5)*2;
  data.set([c[0]+v,c[1]+v,c[2]+v,255],(y*w+x)*4);}
 return {width:w,height:h,data};
}
const source=image([200,150,125],[60,140,70]),reference=image([215,140,100],[40,70,150]);
const skinPx=[200/255,150/255,125/255],greenPx=[60/255,140/255,70/255];
function ab(rgb){const l=E.toLab(rgb);return [l[1],l[2]];}
test('separate skin fit stores both skin palettes and round-trips through the recipe',()=>{
 const plain=E.fit(source,reference,{}),split=E.fit(source,reference,{separateSkin:true});
 assert.equal(plain.skin,undefined);assert.ok(split.skin&&split.skin.source&&split.skin.reference);
 assert.equal(split.source.skin,undefined,'skin stats are not left on the distribution');
 const r=E.parse(E.serialize(split,{},{}));assert.deepEqual(r.model.skin,split.skin);
 assert.match(N.compile(r),/^ODYGRADE_NATIVE 6\n[\s\S]*\nskin( \S+){8}\n/);
 assert.match(N.compile(E.parse(E.serialize(plain,{},{}))),/^ODYGRADE_NATIVE 5\n/);
});
test('skin follows the reference skin; background pixels are unchanged by the split',()=>{
 const plain=E.fit(source,reference,{}),split=E.fit(source,reference,{separateSkin:true});
 const target=ab([215/255,140/255,100/255]);
 const dist=m=>{const o=ab(E.createTransform(m,{})(skinPx));return Math.hypot(o[0]-target[0],o[1]-target[1]);};
 assert.ok(dist(split)<dist(plain)*.6,dist(split)+' vs '+dist(plain));
 const g1=E.createTransform(split,{})(greenPx),g0=E.createTransform(plain,{})(greenPx);g1.forEach((v,k)=>assert.ok(Math.abs(v-g0[k])<1e-5));
});
test('no skin in the reference falls back to one match with a warning',()=>{
 const model=E.fit(source,image([60,140,70],[40,70,150]),{separateSkin:true});
 assert.equal(model.skin,undefined);assert.ok(model.warnings.some(w=>/No skin tones found in the reference/.test(w)));
});
test('invalid skin palettes are rejected',()=>{
 const m=E.fit(source,reference,{separateSkin:true});m.skin.reference.sa=-1;
 assert.throws(()=>E.serialize(m,{},{}),/skin/i);
});
test('native skin split matches JS',{skip:!fs.existsSync(exe)},()=>{
 const settings={strength:.8,look:'amber',preserveSkin:.5},model=E.fit(source,reference,Object.assign({separateSkin:true},settings));
 const r=E.parse(E.serialize(model,settings,{})),dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-skin-'));
 try{
  const file=path.join(dir,'g.odyn');fs.writeFileSync(file,N.compile(r));
  const out=cp.spawnSync(exe,[file,String(source.width),String(source.height),'rgba8','rgba8','0'],{input:Buffer.from(source.data),windowsHide:true,maxBuffer:1<<24});
  assert.equal(out.status,0,out.stderr?.toString());
  const expected=E.render(source,model,settings).data;let max=0;
  for(let i=0;i<expected.length;i++)max=Math.max(max,Math.abs(out.stdout[i]-expected[i]));
  assert.ok(max<=1,'max diff '+max);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
