'use strict';
// host/faces.ps1: the Windows face detector the panel runs for "Match skin and background separately".
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const script=path.resolve(__dirname,'../host/faces.ps1');
function bmp(w,h,rgb){  // 24-bit bottom-up BMP, rows padded to 4 bytes
 const row=Math.ceil(w*3/4)*4,b=Buffer.alloc(54+row*h);
 b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(w,18);b.writeInt32LE(h,22);
 b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(row*h,34);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)b.set([rgb[2],rgb[1],rgb[0]],54+y*row+x*3);
 return b;
}
const run=file=>cp.spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Path',file],{encoding:'utf8',windowsHide:true,timeout:60000});
test('faces.ps1 runs the Windows detector and prints nothing for a frame without faces',{skip:process.platform!=='win32'},()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'odygrade-faces-')),file=path.join(dir,'flat.bmp');
 try{fs.writeFileSync(file,bmp(96,64,[120,140,160]));const out=run(file);assert.equal(out.status,0,out.stderr);assert.equal(out.stdout.trim(),'');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('faces.ps1 fails loudly on a missing file',{skip:process.platform!=='win32'},()=>{
 assert.notEqual(run(path.join(os.tmpdir(),'odygrade-no-such-file.png')).status,0);
});
