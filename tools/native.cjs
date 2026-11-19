'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),build=path.join(root,'.native-build');
function findCmake(){
  if(process.env.ODYGRADE_CMAKE)return process.env.ODYGRADE_CMAKE;
  const probe=cp.spawnSync('cmake',['--version'],{windowsHide:true,stdio:'ignore'});
  if(probe.status===0)return 'cmake';
  if(process.platform==='win32'){
    const vswhere=path.join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft Visual Studio','Installer','vswhere.exe');
    if(fs.existsSync(vswhere)){
      const result=cp.spawnSync(vswhere,['-latest','-products','*','-requires','Microsoft.VisualStudio.Component.VC.Tools.x86.x64','-property','installationPath'],{encoding:'utf8',windowsHide:true});
      if(result.status===0){const candidate=path.join(result.stdout.trim(),'Common7','IDE','CommonExtensions','Microsoft','CMake','CMake','bin','cmake.exe');if(fs.existsSync(candidate))return candidate;}
    }
  }
  throw Error('CMake not found. Install CMake/compiler or set ODYGRADE_CMAKE to its executable. No fake renderer is built.');
}
function executable(name='odygrade-render'){
  return path.join(build,process.platform==='win32'?'Release':'',name+(process.platform==='win32'?'.exe':''));
}
function run(command,args){cp.execFileSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true});}
function main(){
  const command=process.argv[2]||'build',cmake=findCmake();
  if(command==='build'){
    const args=['-S',path.join(root,'native'),'-B',build];
    if(process.platform==='win32')args.push('-G','Visual Studio 17 2022','-A','x64');else args.push('-DCMAKE_BUILD_TYPE=Release');
    run(cmake,args);run(cmake,['--build',build,'--config','Release']);
    console.log('Built SDK-independent core renderer:',executable());
  }else if(command==='test'){
    if(!fs.existsSync(executable('odygrade-core-tests')))throw Error('Run npm run native:build first.');
    run(executable('odygrade-core-tests'),[]);
    run(process.execPath,['--test','tests/native.test.cjs']);
  }else throw Error('Expected build or test');
}
if(require.main===module){try{main();}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={executable,findCmake};
