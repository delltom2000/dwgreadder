import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const modelConfig=JSON.parse(fs.readFileSync('.local/model-path.json','utf8').replace(/^\uFEFF/,''));
const drawingConfig=JSON.parse(fs.readFileSync('.local/sample-path.json','utf8').replace(/^\uFEFF/,''));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--enable-unsafe-swiftshader']});
try{
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:'))external.push(r.url());});
 await page.goto(process.env.READER_URL||'http://127.0.0.1:5173/');
 await page.locator('#file').setInputFiles(modelConfig.path);
 await page.waitForFunction(()=>document.querySelector('#space-label').textContent.includes('3DM')&&document.querySelector('#status').textContent.includes('已读取'),{},{timeout:120000});
 await page.locator('#model-host canvas').waitFor();await page.waitForTimeout(700);
 console.log('Model loaded:',await page.locator('#stats').textContent(),await page.locator('#status').textContent());
 await page.screenshot({path:'.local/model.png'});
 for(let i=0;i<40&&!await page.locator('[data-part]').count();i++){const expand=page.locator('#tree .expand[aria-expanded=false]').first();if(!await expand.count())break;await expand.click();}
 assert.ok(await page.locator('[data-part]').count()>0);await page.locator('[data-part] .row-label').first().click();await page.waitForTimeout(600);
 assert.ok((await page.locator('#properties').textContent()).includes('尺寸 Z'));await page.screenshot({path:'.local/model-focus.png'});
 await page.locator('#fit').click();await page.waitForTimeout(600);
 const canvas=page.locator('#model-host canvas'),box=await canvas.boundingBox();
 await canvas.click({position:{x:box.width*.5,y:box.height*.5}});await page.waitForTimeout(500);assert.equal(await page.locator('#selection').isVisible(),true,'Clicking model geometry selects and focuses a part');
 await page.locator('#fit').click();await page.waitForTimeout(500);
 const before=await canvas.screenshot();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height*.6,{steps:15});await page.mouse.up();await page.waitForTimeout(500);assert.ok(!before.equals(await canvas.screenshot()),'Rotation changed rendered model');
 const afterRotate=await canvas.screenshot();await page.mouse.down({button:'right'});await page.mouse.move(box.x+box.width*.72,box.y+box.height*.65,{steps:10});await page.mouse.up({button:'right'});await page.waitForTimeout(500);assert.ok(!afterRotate.equals(await canvas.screenshot()),'Panning changed rendered model');
 await page.locator('#toggle-files').click();assert.equal(await page.locator('#files-panel').isHidden(),true);await page.locator('#toggle-properties').click();assert.equal(await page.locator('#properties-panel').isHidden(),true);await page.screenshot({path:'.local/model-panels-closed.png'});await page.locator('#toggle-files').click();await page.locator('#toggle-properties').click();
 console.log('Rotation, pan and panel checks completed. Opening DWG...');
 await page.locator('#file').setInputFiles(drawingConfig.path);console.log('DWG file selected.');await page.waitForFunction(()=>document.querySelector('#space-label').textContent==='模型空间',{},{timeout:90000});assert.equal(await page.locator('#model-host').isHidden(),true);assert.equal(await page.locator('#canvas').isVisible(),true);
 await page.waitForFunction(()=>{const canvas=document.querySelector('#canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;for(let i=3;i<pixels.length;i+=4)if(pixels[i])return true;return false;});
 assert.ok(!(await page.locator('#zoom-label').textContent()).includes('∞'));await page.screenshot({path:'.local/three-column-dwg.png'});console.log('DWG switch completed with visible geometry.');
 await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-open').length===2);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#history-list .history-open').length===2);
 const modelEntry=page.locator('.history-open').filter({has:page.locator('.history-name').filter({hasText:/\.3dm$/i})});await modelEntry.click();await page.waitForFunction(()=>document.querySelector('#space-label').textContent.includes('3DM'),{},{timeout:120000});
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS: 3DM parsing, sidebar and geometry-click focus, rotation, panning, collapsible panels, DWG switch and persisted model reopening; no external requests.');
}finally{await browser.close();}
