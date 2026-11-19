const {test}=require('node:test'),assert=require('node:assert/strict'),F=require('../src/film.js');
const image={width:24,height:16,data:new Uint8ClampedArray(24*16*4).fill(180)};
test('film controls zero is identity',()=>assert.deepEqual(F.apply(image).data,image.data));
test('film effects deterministic, finite, preserve alpha',()=>{
 const o={grain:.4,bloom:.8,halation:1,vignette:.5,bleach:.3,ratio:2.39};
 const a=F.apply(image,o),b=F.apply(image,o);assert.deepEqual(a.data,b.data);
 for(let i=0;i<a.data.length;i+=4){assert.equal(a.data[i+3],180);assert.ok(a.data[i]>=0&&a.data[i]<=255);}
 assert.equal(a.data[0],0);
});
test('invalid film recipe is rejected',()=>{assert.throws(()=>F.normalize({grain:NaN}));assert.throws(()=>F.normalize({ratio:2}));});
test('invisible bright pixels do not bleed bloom or halation into visible neighbors',()=>{
 const data=new Uint8ClampedArray(5*5*4);for(let i=3;i<data.length;i+=4)data[i]=255;
 data[0]=data[1]=data[2]=255;data[3]=0;
 const out=F.apply({width:5,height:5,data},{bloom:1,halation:1});
 for(let i=4;i<out.data.length;i+=4)assert.equal(out.data[i],0);
});
