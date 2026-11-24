'use strict';
// Camera metadata -> profile detection in the ExtendScript bridge (pure part, run in a VM).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../host/bridge.jsx'),'utf8')+';this.OdyHost=OdyHost;',ctx);
const CM=require('../src/color-management.js'),H=ctx.OdyHost,detect=s=>H.profileFromMeta(s);
const sony=(g,p)=>'<Group name="CameraUnitMetadataSet">\n\t<Item name="CaptureGammaEquation" value="'+g+'"/>\n\t<Item name="CaptureColorPrimaries" value="'+p+'"/>\n</Group>';
const pana=(g,p)=>'<?xml version="1.0"?><ClipMain><Camera><CaptureGamma>'+g+'</CaptureGamma><CaptureGamut>'+p+'</CaptureGamut></Camera></ClipMain>';
// Binary MP4 boxes as latin1 strings, the way ExtendScript reads them with encoding BINARY.
const u32=n=>String.fromCharCode(n>>>24&255,n>>>16&255,n>>>8&255,n&255);
const box=(type,body)=>u32(8+body.length)+type+body;
function quickTime(entries){  // [[key,value],...] -> moov/meta/keys+ilst
 const keys=box('keys',u32(0)+u32(entries.length)+entries.map(([k])=>box('mdta',k)).join(''));
 const ilst=box('ilst',entries.map(([,v],i)=>u32(8+16+v.length)+u32(i+1)+box('data',u32(1)+u32(0)+v)).join(''));
 return 'monkeys and donkeys\0\0'+box('moov',box('meta',u32(0)+box('hdlr',u32(0)+'\0\0\0\0mdta')+keys+ilst));
}
const dji=v=>quickTime([['com.apple.quicktime.model','DJI Mini 4 Pro'],['com.dji.camera.ColorGammaSxS',v]]);
test('Sony S-Log3 / S-Gamut3.Cine is detected',()=>{
 assert.equal(detect(sony('s-log3-cine','s-gamut3-cine')),'sony-slog3-sgamut3cine');
 assert.equal(detect(sony('s-log3','s-gamut3-cine')),'sony-slog3-sgamut3cine');
});
test('Sony HLG maps to the HLG profile',()=>{assert.equal(detect(sony('rec2100-hlg','rec2020')),'hlg-rec2020');});
test('Panasonic V-Log and V-Log L with V-Gamut are detected from the clip XML',()=>{
 assert.equal(detect(pana('V-Log','V-Gamut')),'panasonic-vlog-vgamut');
 assert.equal(detect(pana('V-LogL','V-Gamut')),'panasonic-vlog-vgamut');
 assert.equal(detect('<pn:CaptureGamma> V-Log </pn:CaptureGamma><pn:CaptureGamut>V-Gamut</pn:CaptureGamut>'),'panasonic-vlog-vgamut');
});
test('Apple Log is detected from its tag; Apple Log 2 is not',()=>{
 assert.equal(detect('\0\0\0#logscom.apple.rec2020.apple-log\0'),'apple-log-rec2020');
 assert.equal(detect(quickTime([['com.apple.proapps.customgamma','com.apple.rec2020.apple-log']])),'apple-log-rec2020');
 assert.equal(detect('logscom.apple.rec2020.apple-log2\0'),'');
});
test('DJI D-Log and HLG are read from the QuickTime keys',()=>{
 assert.equal(detect(dji('D-Log')),'dji-dlog-dgamut');
 assert.equal(detect(dji('Rec.2100 HLG')),'hlg-rec2020');
 assert.equal(H.quickTimeKeys(dji('D-Log'))['com.apple.quicktime.model'],'DJI Mini 4 Pro');
});
test('DJI D-Log M, D-Log2 and Rec.709 are other curves: no guess',()=>{
 for(const v of ['D-Log M','D-LogM','D-Log2','Rec.709'])assert.equal(detect(dji(v)),'',v);
});
test('no exact profile -> empty, never a guess',()=>{
 for(const x of [sony('s-log3','s-gamut3'),sony('s-log2','s-gamut'),sony('rec709','rec709'),pana('V-Log','BT.709'),pana('Natural','BT.709'),
  quickTime([['com.dji.camera.Other','D-Log']]),'keys\0\0\0\0\xff\xff\xff\xff','',null,'random bytes'])assert.equal(detect(x),'');
});
test('detected keys exist in the panel profile list',()=>{
 for(const k of ['sony-slog3-sgamut3cine','hlg-rec2020','panasonic-vlog-vgamut','apple-log-rec2020','dji-dlog-dgamut'])assert.ok(CM.PROFILES[k],k);
});
