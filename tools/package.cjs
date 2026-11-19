const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release'),stage=path.join(out,'OdyGrade-CEP');
if(path.resolve(stage)!==path.join(root,'release','OdyGrade-CEP'))throw Error('Unexpected staging path');
// Only remove the verified generated payload, never the source or signing files.
if(fs.existsSync(stage))fs.rmSync(stage,{recursive:true,force:true});
fs.mkdirSync(stage,{recursive:true});
for(const name of ['index.html','src','host','CSXS','assets'])fs.cpSync(path.join(root,name),path.join(stage,name),{recursive:true});
for(const name of ['README.md','THIRD_PARTY_NOTICES.md'])fs.copyFileSync(path.join(root,name),path.join(stage,name));
console.log('Unsigned development CEP payload:',stage);
console.log('This is not a signed ZXP installer. See README.');
