'use strict';
// Camera metadata -> profile detection in the ExtendScript bridge (pure part, run in a VM).
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ctx={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../host/bridge.jsx'),'utf8')+';this.OdyHost=OdyHost;',ctx);
const CM=require('../src/color-management.js');
const sony=(g,p)=>'<Group name="CameraUnitMetadataSet">\n\t<Item name="CaptureGammaEquation" value="'+g+'"/>\n\t<Item name="CaptureColorPrimaries" value="'+p+'"/>\n</Group>';
test('Sony S-Log3 / S-Gamut3.Cine is detected',()=>{
 assert.equal(ctx.OdyHost.profileFromXml(sony('s-log3-cine','s-gamut3-cine')),'sony-slog3-sgamut3cine');
 assert.equal(ctx.OdyHost.profileFromXml(sony('s-log3','s-gamut3-cine')),'sony-slog3-sgamut3cine');
});
test('Sony HLG maps to the HLG profile',()=>{assert.equal(ctx.OdyHost.profileFromXml(sony('rec2100-hlg','rec2020')),'hlg-rec2020');});
test('no exact profile -> empty, never a guess',()=>{
 for(const x of [sony('s-log3','s-gamut3'),sony('s-log2','s-gamut'),sony('rec709','rec709'),'',null,'random bytes'])assert.equal(ctx.OdyHost.profileFromXml(x),'');
});
test('detected keys exist in the panel profile list',()=>{for(const k of ['sony-slog3-sgamut3cine','hlg-rec2020'])assert.ok(CM.PROFILES[k],k);});
