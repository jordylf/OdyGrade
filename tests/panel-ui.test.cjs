'use strict';
// Pins the panel's DOM contract (ids src/app.js relies on) and the readability/responsive rules.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../src/style.css'),'utf8');
const ids=('host loadRecipe saveRecipe looks demo sourceInfo sourceDrop sourceCanvas sourceEmpty sourceTag shotControls previousFrame '+
 'shotFrame nextFrame shotHelp capture auto sourceProfile profileHelp referenceDrop referenceCanvas referenceEmpty referenceTag match '+
 'resultInfo viewer resultCanvas resultEmpty viewerLabel graded before split renderTime exportPng splitControl wipe gradeTitle '+
 'gradeDescription gradeChip lutSize exportLut applyNative exportNative status reset stock colorControls filmControls ratio gauge '+
 'format perfs sourceInput referenceInput recipeInput').split(' ');
const count=id=>html.split('id="'+id+'"').length-1;
test('every existing id survives exactly once',()=>{for(const id of ids)assert.equal(count(id),1,id);});
test('action bar holds the main actions',()=>{
 const start=html.indexOf('id="actionBar"');assert.ok(start>0,'actionBar');
 const bar=html.slice(start,html.indexOf('</footer>',start));
 for(const id of ['applyNative','exportLut','exportNative','status'])assert.ok(bar.includes('id="'+id+'"'),id);
});
test('steps are foldable details with status',()=>{
 for(const id of ['stepFrame','stepReference','stepAdjust'])assert.match(html,new RegExp('<details[^>]*id="'+id+'"'));
 for(const id of ['stepFrameState','stepReferenceState'])assert.equal(count(id),1,id);
});
test('text is readable (no font below 11px)',()=>{
 const sizes=[...css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
 assert.ok(sizes.length>0);for(const s of sizes)assert.ok(s>=11,'font '+s+'px');
});
test('responsive breakpoints for medium and wide panels',()=>{
 assert.ok(css.includes('@media(min-width:640px)'));assert.ok(css.includes('@media(min-width:1100px)'));
});
