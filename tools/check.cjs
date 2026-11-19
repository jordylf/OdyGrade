const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const dir of ['src','tools','tests','host']){
 for(const name of fs.readdirSync(path.join(__dirname,'..',dir))){
  if(/\.(js|cjs|jsx)$/.test(name)){
   const file=path.join(__dirname,'..',dir,name);new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});console.log('Syntax OK:',dir+'/'+name);
  }
 }
}
