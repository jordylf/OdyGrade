'use strict';
// Dark references: the match keeps shadow shape (SHADOW_TOE) and darkened colours do not turn dense (DARK_CHROMA).
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const E=require('../src/engine.js'),N=require('../src/native-recipe.js');
const exe=require('../tools/native.cjs').executable();
// Columns of the given colours with a little per-pixel variation.
function strips(colors,w=64,h=48){
 const data=new Uint8ClampedArray(w*h*4),n=colors.length;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=colors[Math.floor(x*n/w)],v=((x*7+y*13)%11-5);data.set([c[0]+v,c[1]+v,c[2]+v,255],(y*w+x)*4);}
 return {width:w,height:h,data};
}
// A flat, lifted source (no true black) and references with deep or lifted blacks.
const red=[140,70,60],source=strips([[95,95,95],red,[130,130,130],[170,170,170],[210,210,210]]);
const dark=strips([[8,8,8],[30,25,22],[55,48,42],[90,80,70],[200,190,170]]),faded=strips([[150,150,150],[160,160,160],[175,175,175],[200,200,200],[230,230,230]]);
const L=rgb=>E.toLab(rgb)[0];
test('a deeper reference black moves the source black only halfway down',()=>{
 const m=E.fit(source,dark,{}),a=m.source.quantiles[0],b=m.reference.quantiles[0];assert.ok(b<a-.2,'reference black is deeper');
 const out=L(E.createTransform(m,{})(E.fromLab([a,0,0]))),want=.15*a+.85*(.5*a+.5*b);  // the source's darkest level
 assert.ok(Math.abs(out-want)<2e-3,out+' vs '+want);
 assert.ok(out>b+.1,'shadows are not crushed to the reference black');
});
test('a lifted (faded) reference black is still matched in full',()=>{
 const m=E.fit(source,faded,{}),a=m.source.quantiles[0],b=m.reference.quantiles[0];assert.ok(b>a);
 const out=L(E.createTransform(m,{})(E.fromLab([a,0,0])));
 assert.ok(Math.abs(out-(.15*a+.85*b))<2e-3,out+' vs '+(.15*a+.85*b));
});
test('colours the match darkens lose chroma with their lightness',()=>{
 const m=E.fit(source,dark,{}),px=red.map(v=>v/255),i=E.toLab(px),o=E.toLab(E.createTransform(m,{})(px));
 assert.ok(o[0]<i[0]-.05,'the red is darkened');
 const ci=Math.hypot(i[1],i[2]),co=Math.hypot(o[1],o[2]);
 assert.ok(co/o[0]<1.35*ci/i[0],'relative saturation '+(co/o[0]).toFixed(3)+' vs source '+(ci/i[0]).toFixed(3));
});
test('native shadow handling matches JS',{skip:!fs.existsSync(exe)},()=>{
 const settings={strength:.9},model=E.fit(source,dark,settings),dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-shadow-'));
 try{
  const file=path.join(dir,'g.odyn');fs.writeFileSync(file,N.compile(E.parse(E.serialize(model,settings,{}))));
  const out=cp.spawnSync(exe,[file,String(source.width),String(source.height),'rgba8','rgba8','0'],{input:Buffer.from(source.data),windowsHide:true,maxBuffer:1<<24});
  assert.equal(out.status,0,out.stderr?.toString());
  const expected=E.render(source,model,settings).data;let max=0;
  for(let i=0;i<expected.length;i++)max=Math.max(max,Math.abs(out.stdout[i]-expected[i]));
  assert.ok(max<=1,'max diff '+max);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
