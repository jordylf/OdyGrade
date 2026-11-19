// Run via Playwright MCP browser_run_code_unsafe filename. Local synthetic PNGs
// only. This verifies browser behavior, never Adobe CEP host behavior.
async (page) => {
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5184');
 const fixtures=await page.evaluate(()=>{
  function frame(w,h,warm){const c=document.createElement('canvas');c.width=w;c.height=h;
   const x=c.getContext('2d'),d=x.createImageData(w,h);
   for(let i=0;i<w*h;i++)d.data.set([30+i%170+warm,45+(i*7)%150,60+(i*11)%130-warm,255],i*4);
   x.putImageData(d,0,0);return {width:w,height:h,data:Array.from(d.data),png:c.toDataURL('image/png').split(',')[1]};
  }
  return [frame(64,48,0),frame(96,64,20),frame(72,48,35)];
 });
 const files=fixtures.map((f,i)=>({name:'shot-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(f.png,'base64')}));
 async function ready(){await page.waitForFunction(()=>{const s=OdyGradeState();return !s.busy&&s.rendered;});}
 async function download(id){const waiting=page.waitForEvent('download');await page.locator('#'+id).click();
  const d=await waiting,chunks=[];for await(const chunk of await d.createReadStream())chunks.push(chunk);await ready();return Buffer.concat(chunks);}
 async function recipe(){return JSON.parse((await download('saveRecipe')).toString('utf8'));}
 async function expected(settings){return page.evaluate(({frames,ref,settings})=>OdyColor.fitFrames(frames,ref,settings),
  {frames:fixtures.slice(0,2).map(f=>({width:f.width,height:f.height,data:f.data})),ref:fixtures[2],settings});}
 function equal(a,b,message){assert(JSON.stringify(a)===JSON.stringify(b),message);}
 async function input(id,value){await page.locator('#'+id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);await ready();}
 await page.locator('#sourceInput').setInputFiles(files.slice(0,2));await ready();
 await page.locator('#referenceInput').setInputFiles(files[2]);await ready();
 await page.locator('#match').click();await ready();
 let grade=await recipe();equal(grade.model,await expected(grade.settings),'panel must pool both frames');
 assert(grade.analysis.sampleCount===2,'saved recipe must record pooled samples');
 await page.locator('#nextFrame').click();await ready();
 equal((await recipe()).model,grade.model,'preview navigation must preserve frozen model');
 const png=await download('exportPng');assert(png.readUInt32BE(16)===96&&png.readUInt32BE(20)===64,'still export must use selected full-size frame');
 await input('exposure',.5);grade=await recipe();equal(grade.model,await expected(grade.settings),'exposure refit must retain both source frames');
 await page.locator('#sourceProfile').selectOption('rec709-gamma24');await ready();
 grade=await recipe();equal(grade.model,await expected(grade.settings),'profile refit must retain both source frames');
 await page.locator('#auto').click();await ready();const autoSecond=await recipe();
 await page.locator('#previousFrame').click();await ready();await page.locator('#auto').click();await ready();
 const autoFirst=await recipe();equal(autoFirst.model,autoSecond.model,'auto balance must be independent of preview');
 equal(autoFirst.settings,autoSecond.settings,'auto balance settings must be pooled');
 const before=await recipe();
 await page.locator('#sourceInput').setInputFiles([files[0],{name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not a PNG')}]);
 await page.waitForFunction(()=>!OdyGradeState().busy);assert((await page.locator('#status').textContent()).includes('Cannot decode'),'invalid batch must report failure');
 equal((await recipe()).model,before.model,'failed batch must retain prior model');assert(await page.evaluate(()=>OdyGradeState().samples===2),'failed batch must retain prior frames');
 await page.locator('#sourceInput').setInputFiles(Array.from({length:33},(_,i)=>({...files[0],name:'too-many-'+i+'.png'})));
 await page.waitForFunction(()=>!OdyGradeState().busy);assert((await page.locator('#status').textContent()).includes('1 to 32'),'frame count limit must be enforced');
 equal((await recipe()).model,before.model,'oversized batch must retain prior state');
 await page.locator('#recipeInput').setInputFiles({name:'pooled.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(before))});await ready();
 await input('exposure',before.settings.exposure+.25);
 assert((await page.locator('#status').textContent()).includes('press Create grade'),'imported pooled fit must require explicit refit');
 let restored=await recipe();equal(restored.settings,before.settings,'rejected correction must roll back');equal(restored.analysis,before.analysis,'browser save must preserve pooled provenance');
 await page.locator('#sourceProfile').selectOption('srgb');await ready();restored=await recipe();equal(restored.settings,before.settings,'rejected profile must roll back');
 await page.locator('#match').click();await ready();await input('exposure',.25);
 grade=await recipe();equal(grade.model,await expected(grade.settings),'explicit Create grade must unlock pooled refitting');
 const responsive=[];
 for(const width of [390,720,1100,1500]){await page.setViewportSize({width,height:1050});responsive.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));}
 assert(!responsive.some(x=>x.overflow),'pooled controls must not cause overflow');
 assert(errors.length===0,'browser page errors: '+errors.join('; '));
 return {state:await page.evaluate(()=>OdyGradeState()),samples:2,checks:['pooled fit','frozen preview','selected full-size export','pooled correction/profile refit','preview-independent auto balance','atomic bad/count-limit imports','saved provenance','pooled import guard/rollback','explicit pooled refit'],responsive,errors};
}
