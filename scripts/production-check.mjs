import {chromium} from '@playwright/test';
import fs from 'node:fs';
const config=JSON.parse(fs.readFileSync('.local/sample-path.json','utf8').replace(/^\uFEFF/,''));
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5174/');
 await page.locator('#file').setInputFiles(config.path);
 await page.waitForFunction(()=>document.querySelector('#welcome').hidden,{},{timeout:90000});
 console.log('Production DWG:',await page.locator('#stats').textContent());
 await page.locator('[data-tab=blocks]').click();const expand=page.locator('.expand').first();await expand.click();
 if(await expand.getAttribute('aria-expanded')!=='true')throw new Error('Block tree did not expand');
 await page.locator('.row-label').nth(1).click();
 if(await page.locator('#selection').isHidden())throw new Error('Nested item not focused');
 await page.locator('[data-tab=layers]').click();const eye=page.locator('.eye').first();await eye.click();
 if(await eye.getAttribute('aria-pressed')!=='false')throw new Error('Layer did not hide');
 await eye.click();if(errors.length)throw new Error(errors.join('\n'));
 console.log('Production worker/WASM, nested tree focus and layer visibility passed.');
}finally{await browser.close();}
