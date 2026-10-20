import http from 'node:http';
import {watch} from 'node:fs';
import path from 'node:path';
import {realpath,readFile,stat} from 'node:fs/promises';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.mp3':'audio/mpeg','.zip':'application/zip'};
export async function serve(directory,port=0){
 const root=await realpath(directory);
 let revision=0,timer;const started=Date.now();
 const watcher=watch(root,{recursive:true},(_,file)=>{
  if(!file||/(^|\/)(node_modules|artifacts|dist|\.git)(\/|$)/.test(file)||! /\.(html|css|js|mjs|wasm|json|svg)$/.test(file))return;
  clearTimeout(timer);timer=setTimeout(()=>revision++,250);
 });
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/src/version.js'){
    const original=await readFile(path.join(root,'src/version.js'),'utf8');
    const base=/APP_VERSION\s*=\s*["']([^"']+)/.exec(original)?.[1]||'0.0.0';
    res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');
    res.end(`export const APP_VERSION = ${JSON.stringify(base.split('-dev.')[0]+'-dev.'+started+'.'+revision)};`);return;
   }
   if(pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");return;}
   if(pathname==='/__debug_version'){res.setHeader('Cache-Control','no-store');res.end(String(revision));return;}
   let file=path.resolve(root,'.'+pathname);
   if(file!==root&&!file.startsWith(root+path.sep))throw Error('outside root');
   if((await stat(file)).isDirectory())file=path.join(file,'index.html');
   file=await realpath(file);
   if(!file.startsWith(root+path.sep))throw Error('outside root');
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
   let data=await readFile(file);
   if(path.extname(file)==='.html'){
    const reload=`<script>(()=>{window.__PWA_DEVICE_DEBUGGER__=true;let version=null;setInterval(async()=>{try{const next=await(await fetch('/__debug_version',{cache:'no-store'})).text();if(version!==null&&next!==version){version=next;const waits=[];dispatchEvent(new CustomEvent('debugger-before-reload',{detail:{waitUntil:p=>waits.push(Promise.resolve(p))}}));await Promise.all(waits);location.reload();}version=next;}catch{}},500)})();</script>`;
    data=Buffer.from(data.toString().replace('</body>',reload+'</body>'));
   }
   res.end(data);
  }catch{res.writeHead(404);res.end('Not found')}
 });
 server.once('close',()=>{watcher.close();clearTimeout(timer)});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return {server,url:`http://127.0.0.1:${server.address().port}/`};
}
