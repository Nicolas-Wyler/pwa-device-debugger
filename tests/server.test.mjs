import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,symlink,rm,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {serve} from '../src/server.mjs';
test('Static server serves app assets and refuses external symlink targets',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'pwa-debug-test-'));const root=path.join(temp,'app');await mkdir(root);await writeFile(path.join(root,'index.html'),'fixture');await writeFile(path.join(temp,'secret.txt'),'secret');await symlink(path.join(temp,'secret.txt'),path.join(root,'leak.txt'));
 const {server,url}=await serve(root);try{assert.equal(await(await fetch(url)).text(),'fixture');assert.equal((await fetch(url+'leak.txt')).status,404);assert.equal((await fetch(url+'missing')).status,404)}finally{await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
});
test('Profile geometry is continuous, axis-locked, and has consistent dimensions',async()=>{
 const profile=JSON.parse(await readFile(new URL('../profiles/iphone-12-pro-max.json',import.meta.url)));const segments=JSON.parse(await readFile(new URL('../profiles/'+profile.segments,import.meta.url)));assert.equal(profile.width*3,profile.nativeWidth);assert.equal(profile.height*3,profile.nativeHeight);
 for(let i=0;i<segments.length;i++){const p=segments[i].points;const end=p.at(-1);const next=segments[(i+1)%segments.length].points[0];assert.ok(Math.hypot(end[0]-next[0],end[1]-next[1])<1e-6);if(p.length===4)for(const [a,b] of [[p[0],p[1]],[p[2],p[3]]])assert.ok(Math.abs(a[0]-b[0])<1e-6||Math.abs(a[1]-b[1])<1e-6)}
});
test('Local source edits advance reload revision and development version',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'pwa-live-test-'));await mkdir(path.join(root,'src'));await writeFile(path.join(root,'src/version.js'),'export const APP_VERSION="0.2.30";');await writeFile(path.join(root,'index.html'),'<body>fixture</body>');
 const {server,url}=await serve(root);
 try{
  const html=await(await fetch(url)).text();assert.ok(html.includes('debugger-before-reload'));assert.ok(html.includes('__PWA_DEVICE_DEBUGGER__'));
  const before=await(await fetch(url+'src/version.js')).text();assert.ok(before.includes('0.2.30-dev.'));
  await writeFile(path.join(root,'style.css'),'body{color:red}');
  let revision='0';for(let i=0;i<30&&revision==='0';i++){await new Promise(r=>setTimeout(r,50));revision=await(await fetch(url+'__debug_version')).text()}
  assert.notEqual(revision,'0');assert.notEqual(await(await fetch(url+'src/version.js')).text(),before);
 }finally{await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true})}
});
