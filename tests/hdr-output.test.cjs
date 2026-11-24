'use strict';
// HDR delivery (Rec.2100 HLG / PQ): the grade stays SDR, the output is encoded last.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const CM=require('../src/color-management.js'),E=require('../src/engine.js'),N=require('../src/native-recipe.js');
const exe=require('../tools/native.cjs').executable();
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,a+' vs '+b);
const M1=2610/16384,M2=2523/4096*128,C1=3424/4096,C2=2413/4096*32,C3=2392/4096*32;
const pqSignal=nits=>{const p=Math.pow(nits/10000,M1);return Math.pow((C1+C2*p)/(1+C3*p),M2);};
const pqNits=v=>{const p=Math.pow(v,1/M2);return 10000*Math.pow(Math.max(0,p-C1)/(C2-C3*p),1/M1);};
const srgbLinear=x=>x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4);
test('SDR white lands on BT.2408 reference white; black stays black',()=>{
 CM.encodeOutput([1,1,1],'hlg',false).forEach(v=>close(v,.75));
 CM.encodeOutput([1,1,1],'pq',false).forEach(v=>close(v,pqSignal(203)));close(pqSignal(203),.5807,1e-3);
 CM.encodeOutput([0,0,0],'pq',false).forEach(v=>close(v,0,1e-6));
 assert.deepEqual(CM.encodeOutput([.2,.5,.9],'sdr',true),[.2,.5,.9]);
 assert.throws(()=>CM.encodeOutput([1,1,1],'hdr10',false),/output/);
});
test('Rec.709 -> Rec.2020 matrix matches the primaries; PQ/HLG output decodes back to the graded colour',()=>{
 const to709=CM.PROFILES['pq-rec2020'].matrix;  // 2020 -> 709, built from the primaries
 for(let r=0;r<3;r++)for(let c=0;c<3;c++){let s=0;for(let k=0;k<3;k++)s+=to709[r*3+k]*CM.TO2020[k*3+c];close(s,r===c?1:0,2e-6);}
 for(const rgb of [[1,1,1],[.18,.18,.18],[.8,.4,.2],[.1,.6,.3],[.3,.3,.9]]){
  CM.toLinear709(CM.encodeOutput(rgb,'pq',false),'pq-rec2020').forEach((v,i)=>close(v,srgbLinear(rgb[i]),1e-5));
  CM.toLinear709(CM.encodeOutput(rgb,'hlg',false),'hlg-rec2020').forEach((v,i)=>close(v,srgbLinear(rgb[i]),1e-5));
 }
});
test('scene sources get their highlights back: smooth from 0.8, peak at 1000 cd/m2 (HLG signal 1.0)',()=>{
 close(CM.encodeOutput([1,1,1],'hlg',true)[0],1,1e-7);
 close(pqNits(CM.encodeOutput([1,1,1],'pq',true)[0]),1000,.01);
 const at=(linear,expand)=>CM.encodeOutput([0,1,2].map(()=>CM.encodeSRGB(linear)),'pq',expand)[0];
 close(at(.8,true),at(.8,false),1e-9);close(at(.5,true),at(.5,false),1e-12);
 let last=0;for(let x=.5;x<=1;x+=.002){const v=at(x,true);assert.ok(v>=last,'monotone at '+x);last=v;}
 const d=1e-4;close((at(.8+d,true)-at(.8,true))/(at(.8,true)-at(.8-d,true)),1,.01);  // no kink where expansion starts
 // A neutral grade from an HDR source back to the same HDR format leaves the picture alone (found live in Premiere).
 for(const k of ['hlg','pq']){const fn=E.createTransform(null,{inputProfile:k+'-rec2020',output:k});
  for(const v of k==="hlg"?[.1,.3,.5,.6,.7,.75,.85]:[.1,.3,.5,.6,.7])fn([v,v,v]).forEach(o=>close(o,v,5e-4));}
});
test('HDR output is part of the recipe: JSON round trip, native v8, SDR keeps older versions',()=>{
 const two=(a,b)=>{const d=new Uint8ClampedArray(8*4*4);for(let i=0;i<32;i++)d.set((i%2?b:a).concat(255),i*4);return {width:8,height:4,data:d};};
 const src=two([200,150,125],[60,140,70]),ref=two([215,140,100],[40,70,150]);
 const model=E.fit(src,ref,{});
 const x=JSON.parse(E.serialize(model,{output:'pq'},{}));assert.equal(x.outputSpace,'rec2100-pq');
 const r=E.parse(JSON.stringify(x));assert.equal(r.settings.output,'pq');
 assert.match(N.compile(r),/^ODYGRADE_NATIVE 8\n[\s\S]*\nstock none 1\noutput pq\nmodel 1\n[\s\S]*\nhue 1( \S+){12}\nskin 0\n/);
 assert.match(N.compile(E.parse(E.serialize(model,{},{}))),/^ODYGRADE_NATIVE 7\n/);
 x.outputSpace='srgb';assert.throws(()=>E.parse(JSON.stringify(x)),/output space/);
 assert.throws(()=>E.settings({output:'dolby'}),/output/);
 const old=E.fit(src,ref,{});delete old.hue;
 assert.match(N.compile(E.parse(E.serialize(old,{output:'hlg'},{}))),/\nhue 0\nskin 0\n/);
 assert.throws(()=>require('../tools/native-still.cjs').renderStill(r,'in.png','out.png'),/SDR/);
 // Previews and stills stay SDR whatever the delivery.
 assert.deepEqual(E.render(src,model,{output:'hlg'}).data,E.render(src,model,{}).data);
 assert.match(E.cube(null,{output:'hlg'},17),/output: Rec\.2100 HLG/);
});
test('native HDR output matches JS (S-Log3 source, HLG and PQ)',{skip:!fs.existsSync(exe)},()=>{
 const w=32,h=8,data=new Uint8ClampedArray(w*h*4);
 for(let i=0;i<w*h;i++)data.set([(i*37)%256,(i*91+40)%256,(i*13+200)%256,255],i*4);
 const img={width:w,height:h,data},settings={inputProfile:'sony-slog3-sgamut3cine',look:'amber',strength:.8};
 const model=E.fit(img,{width:w,height:h,data:data.slice().reverse()},settings),dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-hdr-'));
 const run=file=>cp.spawnSync(exe,[file,String(w),String(h),'rgba8','rgba32f','0'],{input:Buffer.from(data),windowsHide:true,maxBuffer:1<<24});
 try{
  for(const output of ['hlg','pq']){
   const s=Object.assign({},settings,{output}),file=path.join(dir,output+'.odyn');fs.writeFileSync(file,N.compile(E.parse(E.serialize(model,s,{}))));
   const out=run(file);assert.equal(out.status,0,out.stderr?.toString());
   const f=new Float32Array(out.stdout.buffer.slice(out.stdout.byteOffset,out.stdout.byteOffset+w*h*16)),fn=E.createTransform(model,s);let max=0;
   for(let i=0;i<w*h;i++){const c=fn([data[i*4]/255,data[i*4+1]/255,data[i*4+2]/255]);for(let k=0;k<3;k++)max=Math.max(max,Math.abs(f[i*4+k]-c[k]));}
   assert.ok(max<1e-4,output+' max diff '+max);
  }
  const file=path.join(dir,'bad.odyn');
  fs.writeFileSync(file,N.compile(E.parse(E.serialize(model,Object.assign({},settings,{output:'pq'}),{}))).replace('output pq','output dolby'));
  assert.notEqual(run(file).status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
