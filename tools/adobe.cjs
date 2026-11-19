'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),{findCmake}=require('./native.cjs');
const root=path.resolve(__dirname,'..'),build=path.join(root,'.adobe-build');
function main(){
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--sdk')throw Error('Use node tools/adobe.cjs --sdk <extracted-AfterEffectsSDK-root>');
 const sdk=path.resolve(args[1]);if(!fs.existsSync(path.join(sdk,'Examples/Headers/AE_Effect.h')))throw Error('Real Adobe SDK headers not found.');
 if(process.platform!=='win32')throw Error('This initial adapter builds with Windows x64/MSVC.');
 const cmake=findCmake();const run=args=>cp.execFileSync(cmake,args,{cwd:root,windowsHide:true,stdio:'inherit'});
 run(['-S',path.join(root,'native'),'-B',build,'-G','Visual Studio 17 2022','-A','x64','-DODYGRADE_ADOBE_SDK='+sdk]);
 run(['--build',build,'--config','Release','--target','OdyGrade','odygrade-adobe-tests']);
 console.log('Built native Adobe development effect:',path.join(build,'adobe/Release/OdyGrade.aex'));
 console.log('Compilation is not host compatibility validation. No plugin was installed.');
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
