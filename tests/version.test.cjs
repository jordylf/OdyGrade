'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
test('panel, core and Adobe effect all carry the package.json version',()=>{
 const v=require('../package.json').version,[a,b,c]=v.split('.').map(Number);
 const m=read('CSXS/manifest.xml');
 assert.match(m,new RegExp('ExtensionBundleVersion="'+v+'"'));assert.match(m,new RegExp('panel" Version="'+v+'"'));
 assert.match(read('native/CMakeLists.txt'),new RegExp('VERSION '+v+' LANGUAGES'));
 assert.ok(read('native/adobe/adapter.cpp').includes('PF_VERSION('+a+','+b+','+c+',PF_Stage_RELEASE,0)'),'adapter my_version');
 // AE compares the PiPL version with my_version: PF_VERSION packs vers<<19|subvers<<15|bugfix<<11|stage<<9|build.
 const pipl=(a<<19)|(b<<15)|(c<<11)|(3<<9);
 assert.ok(read('native/adobe/OdyGradePiPL.r').includes('AE_Effect_Version { '+pipl+' }'),'PiPL version '+pipl);
});
