// Builds the user-facing Windows package: release/OdyGrade-<version>-win64 + ../OdyGrade-<version>-win64.zip.
// Needs the Adobe effect built first (node tools/adobe.cjs --sdk ...). Unsigned panel; see README.txt inside.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version,name='OdyGrade-'+version+'-win64';
const aex=path.join(root,'.adobe-build/adobe/Release/OdyGrade.aex'),stage=path.join(root,'release',name),zip=path.join(root,'..',name+'.zip');
if(!fs.existsSync(aex))throw Error('Build the Adobe effect first: '+aex);
if(fs.existsSync(zip))throw Error('Refusing to overwrite '+zip);
cp.execFileSync(process.execPath,[path.join(__dirname,'package.cjs')],{stdio:'inherit'});
fs.rmSync(stage,{recursive:true,force:true});  // generated folder under release/ only
fs.mkdirSync(path.join(stage,'plugin'),{recursive:true});
fs.cpSync(path.join(root,'release/OdyGrade-CEP'),path.join(stage,'panel/com.odyworks.odygrade'),{recursive:true});
fs.copyFileSync(aex,path.join(stage,'plugin/OdyGrade.aex'));
const sha256=crypto.createHash('sha256').update(fs.readFileSync(aex)).digest('hex').toUpperCase();
fs.writeFileSync(path.join(stage,'plugin/manifest.json'),JSON.stringify({name:'OdyGrade',version,architecture:'Windows x64',sha256},null,2)+'\n');
const inst=path.join(__dirname,'installer');
fs.copyFileSync(path.join(inst,'InstallPlugin.ps1'),path.join(stage,'plugin/InstallPlugin.ps1'));
for(const f of ['Install.cmd','Install.ps1','Uninstall.cmd','Uninstall.ps1','README.txt'])fs.copyFileSync(path.join(inst,f),path.join(stage,f));
cp.execFileSync(path.join(process.env.SystemRoot||'C:/Windows','System32','tar.exe'),['-a','-c','-f',zip,'-C',path.join(root,'release'),name],{stdio:'inherit'});
console.log('Package:',zip,'('+fs.statSync(zip).size+' bytes), plugin sha256',sha256);
