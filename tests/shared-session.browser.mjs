// Run with PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/shared-session.browser.mjs
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await webkit.launch({headless:true});
const pages=[],journal=[];
const session=await readFile(new URL('../src/injected/shared-session.js',import.meta.url),'utf8');
const swift=await readFile(new URL('../native/Preview.swift',import.meta.url),'utf8');
const touch=swift.split('static let touchScript="""')[1].split('"""')[0];
const fixture=`<!doctype html><style>body{margin:0}.scroll{width:100px;height:30px;overflow:auto;touch-action:pan-x}.wide{width:500px}#meter{width:var(--peak,0px);height:5px;background:green}#folded{display:none}</style><button id="fold">Fold</button><div id="piano">Piano</div><button id="play">Play</button><div id="meter"></div><button id="filter">Filter</button><dialog id="dialog"><input id="cutoff" value="500"><button id="close">Close</button><canvas id="canvas" width="10" height="10"></canvas></dialog><button id="dropdown">Options</button><div id="options" class="custom-options" popover="manual">Option</div><div id="gesture" style="width:240px;height:80px;touch-action:none">Gesture</div><div class="scroll"><div class="wide">scroll</div></div><script>fold.onclick=()=>{piano.hidden=!piano.hidden;fold.setAttribute('aria-expanded',String(!piano.hidden))};play.onclick=()=>{play.textContent=play.textContent==='Play'?'Stop':'Play';meter.style.setProperty('--peak','70px');play.classList.toggle('playing')};filter.onclick=()=>{dialog.showModal();canvas.getContext('2d').fillStyle='red';canvas.getContext('2d').fillRect(0,0,10,10)};document.getElementById('close').onclick=()=>dialog.close();cutoff.oninput=()=>cutoff.setAttribute('data-edited',cutoff.value);dropdown.onclick=()=>options.showPopover();const touches=new Map();gesture.onpointerdown=e=>{touches.set(e.pointerId,e.clientX);gesture.dataset.touches=touches.size};gesture.onpointermove=e=>{if(touches.has(e.pointerId)){touches.set(e.pointerId,e.clientX);gesture.dataset.distance=Math.abs((touches.get(700)||0)-(touches.get(701)||0))}};gesture.onpointerup=e=>{touches.delete(e.pointerId);gesture.dataset.touches=touches.size};</script>`;
try{
 for(let i=0;i<3;i++){
  const page=await browser.newPage({viewport:i?{width:926,height:428}:{width:428,height:926}});pages.push(page);
  await page.exposeFunction('relay',async packet=>{
   if(['interaction','event','scroll'].includes(packet.kind))journal.push({view:i,...packet});
   if(packet.kind==='ready'){await pages[0].evaluate(()=>window.__debugResnapshot?.());return;}
   if(i===0&&packet.kind!=='interaction'){await Promise.all(pages.slice(1).map(p=>p.evaluate(data=>window.__debugSessionReceive?.(data),packet)));}
   else if(i&&['event','scroll'].includes(packet.kind))await pages[0].evaluate(data=>window.__debugSessionReceive?.(data),packet);
  });
  await page.addInitScript(`window.__debugView=${i};window.__debugInsets=[0,0,0,0];window.webkit={messageHandlers:{session:{postMessage:data=>window.relay(data)}}};${touch}\n${session}`);
  await page.route('http://debugger.test/',route=>route.fulfill({contentType:'text/html',body:i?'<!doctype html><body></body>':fixture}));
  await page.goto('http://debugger.test/');
 }
 const wait=async(fn)=>{for(let i=0;i<60;i++){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for mirrored state')};
 await wait(async()=>await pages[2].locator('#fold').count()===1);
 await pages[2].locator('#fold').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#piano').evaluate(n=>n.hidden)))).every(Boolean));
 console.log('PASS: follower fold updates all three views');
 await pages[1].locator('#play').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#play').textContent()))).every(t=>t==='Stop'));
 assert.ok((await Promise.all(pages.map(p=>p.locator('#meter').getAttribute('style')))).every(t=>t.includes('70px')));
 console.log('PASS: play/stop shape state and meter styles synchronize');
 await pages[2].locator('#filter').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#dialog').evaluate(n=>n.matches(':modal'))))).every(Boolean));
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#canvas').evaluate(n=>n.getContext('2d').getImageData(1,1,1,1).data[0])))).every(v=>v===255));
 console.log('PASS: modal filter and canvas pixels synchronize');
 await pages[1].locator('#cutoff').fill('1234');
 try{await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#cutoff').inputValue()))).every(v=>v==='1234'));}catch(e){console.log('VALUES',await Promise.all(pages.map(p=>p.locator('#cutoff').inputValue())),journal.slice(-8));throw e}
 console.log('PASS: text edits from follower synchronize');
 await pages[1].locator('#close').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#dialog').evaluate(n=>n.open||n.matches(':modal'))))).every(v=>!v));
 await pages[2].locator('.scroll').evaluate(n=>{n.scrollLeft=80});
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('.scroll').evaluate(n=>n.scrollLeft)))).every(v=>v===80));
 console.log('PASS: dialog closure and scroll synchronize');
 await pages[2].locator('#dropdown').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#options').evaluate(n=>n.matches(':popover-open'))))).every(Boolean));
 console.log('PASS: native dropdown popover top layer synchronizes');
 const box=await pages[2].locator('#gesture').boundingBox();
 await pages[2].keyboard.down('Meta');await pages[2].mouse.move(box.x+120,box.y+30);await pages[2].mouse.down();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#gesture').getAttribute('data-touches')))).every(v=>v==='2'));
 await pages[2].mouse.move(box.x+150,box.y+30);await pages[2].mouse.up();await pages[2].keyboard.up('Meta');
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#gesture').getAttribute('data-touches')))).every(v=>v==='0'));
 assert.ok(journal.some(e=>e.pointerId===700)&&journal.some(e=>e.pointerId===701));
 console.log('PASS: two-finger pinch forwards both contacts and release');
 assert.ok(journal.some(e=>e.kind==='event'&&e.type==='click'));
 assert.ok(journal.some(e=>e.kind==='scroll'));
 await pages[0].locator('#fold').click();
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#piano').evaluate(n=>n.hidden)))).every(v=>!v));
 console.log('PASS: leader interactions, reverse direction and local event logging');
 await pages[0].evaluate(()=>{const parent=document.createElement('div');document.body.append(parent);const child=document.createElement('button');child.id='nested-probe';parent.append(child);child.textContent='Nested';});
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#nested-probe').count()))).every(v=>v===1));
 await pages[0].evaluate(()=>window.__debugResnapshot());
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#cutoff').inputValue()))).every(v=>v==='1234'));
 await wait(async()=> (await Promise.all(pages.map(p=>p.locator('#canvas').evaluate(n=>n.getContext('2d').getImageData(1,1,1,1).data[0])))).every(v=>v===255));
 console.log('PASS: nested mutations retain identity and full resnapshot restores visual state');
 await pages[0].evaluate(()=>{const scroller=document.querySelector('.scroll');scroller.style.width='90vw';scroller.firstElementChild.style.width='1000px';});
 await new Promise(r=>setTimeout(r,100));
 await pages[0].locator('.scroll').evaluate(n=>{n.scrollLeft=500});
 await wait(async()=>await pages[0].locator('.scroll').evaluate(n=>n.scrollLeft)===500);
 await new Promise(r=>setTimeout(r,300));
 assert.equal(await pages[0].locator('.scroll').evaluate(n=>n.scrollLeft),500);
 await wait(async()=>await pages[2].locator('.scroll').evaluate(n=>n.scrollLeft)===167);
 await pages[2].locator('.scroll').evaluate(n=>{n.scrollLeft=80});
 await wait(async()=>await pages[0].locator('.scroll').evaluate(n=>n.scrollLeft)===80);
 await pages[0].locator('.scroll').evaluate(n=>{n.scrollLeft=120});
 await wait(async()=>(await Promise.all(pages.map(p=>p.locator('.scroll').evaluate(n=>n.scrollLeft)))).every(x=>x===120));
 console.log('PASS: responsive viewport clamping cannot echo back and overwrite leader scrolling');
}finally{await browser.close()}
