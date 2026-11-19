/* Run this function through Playwright MCP browser_run_code_unsafe.
   Start npm run dev first. No external websites or user footage required. */
async function smoke(page) {
 const errors=[];page.on("pageerror",function(e){errors.push(e.message);});
 await page.goto("http://127.0.0.1:5184");
 await page.locator("#demo").click();
 await page.waitForFunction(function(){var s=window.OdyGradeState();return s.source&&s.reference&&s.rendered;});
 await page.locator("#match").click();
 await page.waitForFunction(function(){return document.querySelector("#gradeChip").textContent==="MATCH READY";});
 await page.locator("#split").click();
 var responsive=[];
 for(var width of [390,720,1100,1500]){
  await page.setViewportSize({width:width,height:1050});
  responsive.push(await page.evaluate(function(){return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};}));
 }
 var downloads=[];
 for(var id of ["saveRecipe","exportLut","exportPng"]){
  var pending=page.waitForEvent("download");await page.locator("#"+id).click();
  var download=await pending;downloads.push(download.suggestedFilename());
 }
 await page.waitForFunction(function(){return !document.querySelector("#exportPng").disabled;});
 if(errors.length||responsive.some(function(x){return x.overflow;}))throw Error(JSON.stringify({errors:errors,responsive:responsive}));
 return {state:await page.evaluate(function(){return window.OdyGradeState();}),responsive:responsive,downloads:downloads,errors:errors};
}
