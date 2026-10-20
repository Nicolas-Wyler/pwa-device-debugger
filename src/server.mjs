import http from 'node:http';
import path from 'node:path';
import {realpath,readFile,stat} from 'node:fs/promises';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav','.mp3':'audio/mpeg','.zip':'application/zip'};
export async function serve(directory,port=0){
 const root=await realpath(directory);
 const server=http.createServer(async(req,res)=>{
  try{
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   let file=path.resolve(root,'.'+pathname);
   if(file!==root&&!file.startsWith(root+path.sep))throw Error('outside root');
   if((await stat(file)).isDirectory())file=path.join(file,'index.html');
   file=await realpath(file);
   if(!file.startsWith(root+path.sep))throw Error('outside root');
   res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');
   res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found')}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
 return {server,url:`http://127.0.0.1:${server.address().port}/`};
}
