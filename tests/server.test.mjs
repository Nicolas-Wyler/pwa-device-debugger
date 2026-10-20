import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir,symlink,rm,readFile} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {serve} from '../src/server.mjs';
test('Static server serves app assets and refuses external symlink targets',async()=>{
 const temp=await mkdtemp(path.join(os.tmpdir(),'pwa-debug-test-'));const root=path.join(temp,'app');await mkdir(root);await writeFile(path.join(root,'index.html'),'fixture');await writeFile(path.join(temp,'secret.txt'),'secret');await symlink(path.join(temp,'secret.txt'),path.join(root,'leak.txt'));
 const {server,url}=await serve(root);try{assert.equal(await(await fetch(url)).text(),'fixture');assert.equal((await fetch(url+'leak.txt')).status,404);assert.equal((await fetch(url+'missing')).status,404)}finally{await new Promise(r=>server.close(r));await rm(temp,{recursive:true,force:true})}
});
test('Profile geometry is continuous, axis-locked, and has consistent dimensions',async()=>{
 const profile=JSON.parse(await readFile(new URL('../profiles/iphone-12-pro-max.json',import.meta.url)));const segments=JSON.parse(await readFile(new URL('../profiles/'+profile.segments,import.meta.url)));assert.equal(profile.width*3,profile.nativeWidth);assert.equal(profile.height*3,profile.nativeHeight);
 for(let i=0;i<segments.length;i++){const p=segments[i].points;const end=p.at(-1);const next=segments[(i+1)%segments.length].points[0];assert.ok(Math.hypot(end[0]-next[0],end[1]-next[1])<1e-6);if(p.length===4)for(const [a,b] of [[p[0],p[1]],[p[2],p[3]]])assert.ok(Math.abs(a[0]-b[0])<1e-6||Math.abs(a[1]-b[1])<1e-6)}
});
