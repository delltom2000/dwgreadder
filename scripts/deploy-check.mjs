import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=process.env.READER_URL||'http://127.0.0.1:7861/';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],modelRequests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET'||r.url().includes('generated-smoke.3dm'))modelRequests.push(r.method()+' '+r.url());});
 await page.goto(base);await page.locator('#choose').waitFor();
 const wasm=await context.request.get(new URL('libredwg-web.wasm',base).href);assert.equal(wasm.status(),200);assert.match(wasm.headers()['content-type'],/application\/wasm/);assert.deepEqual((await wasm.body()).subarray(0,4),Buffer.from([0,97,115,109]));
 // This is a generated two-cube test fixture, never a private user model.
 await page.locator('#file').setInputFiles({name:'generated-smoke.3dm',mimeType:'application/octet-stream',buffer:fs.readFileSync('.local/generated-smoke.3dm')});
 await page.waitForFunction(()=>document.querySelector('#space-label').textContent.includes('3DM')&&document.querySelector('#status').textContent.includes('已读取'),{},{timeout:120000});
 for(let i=0;i<40&&await page.locator('[data-part]').count()<2;i++){const expand=page.locator('#tree .expand[aria-expanded=false]').first();if(!await expand.count())break;await expand.click();}
 assert.equal(await page.locator('[data-part]').count(),2);await page.locator('[data-part] .row-label').first().click();await page.waitForTimeout(500);assert.match(await page.locator('#properties').textContent(),/Test cube 1/);
 await page.locator('#toggle-files').click();assert.equal(await page.locator('#files-panel').isHidden(),true);await page.locator('#toggle-properties').click();assert.equal(await page.locator('#properties-panel').isHidden(),true);
 for(const route of ['.local/model-path.json','api/sample','src/main.ts','package.json','deploy/serve.py'])assert.equal((await context.request.get(new URL(route,base).href)).status(),404);
 assert.equal((await context.request.post(new URL('upload',base).href,{data:'synthetic test'})).status(),501);
 assert.deepEqual(errors,[]);assert.deepEqual(modelRequests,[]);console.log('PASS: static deployment, DWG WASM MIME, synthetic 3DM rendering/focus, collapsible panels; private paths unavailable, no upload endpoint and no model network request.');
}finally{await browser.close();}
