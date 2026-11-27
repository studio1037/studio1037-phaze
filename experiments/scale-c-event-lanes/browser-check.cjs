const assert = require('node:assert/strict');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { mkdir } = require('node:fs/promises');
const { chromium } = require('playwright');

const scenarios = [
 {name:'portrait',width:375,height:812},
 {name:'landscape',width:812,height:375},
 {name:'tablet',width:1024,height:768},
 {name:'desktop',width:1440,height:900}
];
const expected = [[4,300,660,2,0],[8,510,450,2,0],[12,540,420,4,1],[20,560,400,6,9]];

(async () => {
 const output = join(process.cwd(),'visual-evidence');
 await mkdir(output,{recursive:true});
 const browser = await chromium.launch({headless:true,executablePath:process.env.PHAZE_CHROMIUM});
 try {
  for (const {name,width,height} of scenarios) {
   const page=await browser.newPage({viewport:{width,height},isMobile:name==='portrait'||name==='landscape',hasTouch:name!=='desktop'});
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.goto(pathToFileURL(join(__dirname,'index.html')).href);
   for (const [count,occupied,free,peak,overflow] of expected) {
    await page.locator(`[data-density="${count}"]`).click();
    const stats=await page.locator('#stats strong').allTextContents();
    assert.deepEqual([stats[0],stats[1],stats[3]],[occupied+' мин',free+' мин',String(peak)]);
    const anchors=await page.locator('#hybrid .anchor').allTextContents();
    assert.deepEqual(anchors,['07','11','15','19']);
    assert.equal(await page.locator('#events tr').count(),count);
    assert.equal(await page.locator('#hybrid [data-overflow]').count(),overflow);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth),true);
    if(overflow) {
     await page.locator('#overlap-summary').click();
     const rows=page.locator('#overlap-list button');
     assert.equal(await rows.count(),overflow);
     const button=overflow===9?rows.filter({hasText:'+3'}).first():rows.first();
     await button.click();
     assert.equal(await button.getAttribute('aria-pressed'),'true');
     assert.ok((await button.boundingBox()).height>=44);
     assert.match(await page.locator('#detail').innerText(),overflow===9?/ещё 3/:/ещё 1/);
     const text=await button.innerText();
     const index=Number(await button.getAttribute('data-overflow'));
     const arc=page.locator(`#hybrid [data-overflow="${index}"]`);
     await arc.focus();
     await arc.press('Enter');
     assert.ok((await page.locator('#detail').innerText()).startsWith(text.split(' · ')[0]));
     if(count===12) await page.locator('#overlap-summary').click();
    }
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:join(output,`${name}-${count}.png`),fullPage:true,animations:'disabled'});
    console.log(`PASS ${name} ${width}x${height} · ${count} events · ${occupied}/${free} · peak ${peak} · ${overflow} overflow spans`);
   }
   await page.locator('[data-mode="clock"]').click();
   assert.equal(await page.locator('#hybrid [tabindex]').count(),0);
   await page.locator('#wake').fill('23:05');
   assert.deepEqual(await page.locator('#hybrid .anchor').allTextContents(),['23:05','03:05','07:05','11:05']);
   await page.locator('#phase').selectOption('night');
   assert.equal(await page.locator('#hybrid .late').textContent(),'Иди спать');
   await page.reload();
   assert.equal(await page.locator('#stats strong').first().textContent(),'510 мин');
   assert.deepEqual(errors,[]);
   await page.close();
  }
 } finally {
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
