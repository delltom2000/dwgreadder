import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('.local/sample-path.json','utf8').replace(/^\uFEFF/,''));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
try{
 const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/');
 assert.equal(await page.locator('#workspace').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(232, 242, 251)');
 await page.locator('#recent').click();await page.locator('.history-empty').waitFor();await page.locator('#history-close').click();
 await page.locator('#file').setInputFiles(config.path);
 await page.waitForFunction(()=>document.querySelector('#welcome').hidden,{},{timeout:90000});
 await page.locator('[data-tab=texts]').click();await page.locator('#search').fill('客厅');await page.locator('.row-label').first().click();
 await page.screenshot({path:'.local/light-blue-focus.png'});
 await page.locator('#recent').click();await page.locator('.history-open').waitFor();assert.equal(await page.locator('.history-open').count(),1);
 await page.screenshot({path:'.local/history.png'});
 // Reload the page and reopen only from IndexedDB; no fresh file selection or sample request.
 await page.reload();await page.locator('#recent').click();await page.locator('.history-open').waitFor();
 await page.locator('.history-open').click();await page.waitForFunction(()=>document.querySelector('#welcome').hidden,{},{timeout:90000});
 assert.match(await page.locator('#stats').textContent(),/14,101/);
 await page.locator('#recent').click();await page.locator('.history-open').waitFor();assert.equal(await page.locator('.history-open').count(),1);await page.locator('#history-close').click();
 await page.locator('#file').setInputFiles({name:'bad.dwg',mimeType:'application/octet-stream',buffer:Buffer.from('bad')});await page.locator('#toast').waitFor({state:'visible'});
 await page.locator('#recent').click();await page.locator('.history-open').waitFor();assert.equal(await page.locator('.history-open').count(),1);
 await page.locator('.history-remove').click();await page.locator('.history-empty').waitFor();
 // Exercise the retention policy with small local fixtures in the isolated browser context.
 await page.evaluate(async()=>{const history=await import('/src/history.ts');for(let n=0;n<12;n++)await history.rememberDrawing(new File([`fixture-${n}`],`${n}.dwg`,{lastModified:n}));});
 await page.locator('#history-close').click();await page.locator('#recent').click();await page.waitForFunction(()=>document.querySelectorAll('.history-open').length===10);
 await page.locator('#history-clear').click();await page.locator('.history-empty').waitFor();await page.reload();await page.locator('#recent').click();await page.locator('.history-empty').waitFor();
 assert.deepEqual(errors,[]);console.log('PASS: light blue theme, persisted DWG reopening, deduplication, invalid-file exclusion, 10-file retention, removal and clearing across reload.');
}finally{await browser.close();}
