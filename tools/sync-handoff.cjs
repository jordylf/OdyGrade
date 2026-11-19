'use strict';
// Always builds the user-facing snapshot. --vault-note is an explicit fallback
// destination to use only after the authorized Obsidian CLI could not connect.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(path.dirname(root),'OdyGrade-Claude-Handoff.md');
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--vault-note'))throw Error('Expected optional --vault-note absolute-note.md');
const handoff=fs.readFileSync(path.join(root,'docs/HANDOFF.md'),'utf8');
const updated=handoff.match(/^Updated: (\d{4}-\d{2}-\d{2}) /m);
if(!updated)throw Error('Handoff must declare its update date');
const header='---\ntitle: OdyGrade - Reference Color Plugin\ntags: [project, adobe, premiere, after-effects, color-grading, claude-handoff]\nupdated: '+updated[1]+'\nstatus: in-progress\n---\n\n';
const note=header+handoff+
 '\n\n## Verification snapshot\n\n'+fs.readFileSync(path.join(root,'docs/VERIFICATION.md'),'utf8')+
 '\n\n## Related notes\n\n[[00 - Codebase Memory Hub]] · [[After Effects Automation (Motion & OBS)]]\n';
fs.writeFileSync(output,note,'utf8');
console.log('Updated handoff snapshot:',output);
if(args.length){
 const target=args[1];
 if(!path.isAbsolute(target)||path.extname(target).toLowerCase()!=='.md')throw Error('Vault destination must be an absolute .md path');
 if(!fs.existsSync(path.dirname(target)))throw Error('Vault note folder does not exist');
 fs.writeFileSync(target,note,'utf8');
 if(fs.readFileSync(target,'utf8')!==note)throw Error('Vault verification failed');
 console.log('Verified Obsidian note:',target);
}
