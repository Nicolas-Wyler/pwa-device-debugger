import {readFile,mkdir,writeFile,mkdtemp,rm,realpath,access} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {serve} from './server.mjs';import {build} from './build.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);const value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1]};
if(args.includes('--help')||(!value('--url')&&!value('--dir'))){console.log('PWA Device Debugger\nnode src/cli.mjs --url https://your-pwa.example/\nnode src/cli.mjs --dir /path/to/static/app\nOptions: --profile profiles/iphone-12-pro-max.json --single-notch --verify --output artifacts/check');process.exit(0)}
if(value('--url')&&value('--dir'))throw Error('Choose --url OR --dir');
const profilePath=path.resolve(value('--profile')||root+'profiles/iphone-12-pro-max.json');const profile=JSON.parse(await readFile(profilePath,'utf8'));
const segments=JSON.parse(await readFile(path.resolve(path.dirname(profilePath),profile.segments),'utf8'));
let server;let url=value('--url');if(value('--dir')){const local=await serve(value('--dir'));server=local.server;url=local.url}
const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol))throw Error('Only http(s) URLs are supported');
const opacity=Number(value('--keyboard-opacity')??'0.45');if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('Keyboard opacity must be between 0 and 1');
async function keyboardFile(option,local){const explicit=value(option);if(explicit){const file=path.resolve(explicit);await access(file);return file;}try{await access(root+local);return root+local}catch{return null}}
const keyboardPortrait=await keyboardFile('--keyboard-image','artifacts/keyboards/portrait.png');
const keyboardLandscape=await keyboardFile('--keyboard-landscape-image','artifacts/keyboards/landscape.png');
const output=path.resolve(value('--output')||root+'artifacts/check');await mkdir(output,{recursive:true});
const temp=await mkdtemp(path.join(os.tmpdir(),'pwa-device-debugger-'));const configPath=path.join(temp,'config.json');
await writeFile(configPath,JSON.stringify({url,profile,segments,keyboardPath:keyboardPortrait,keyboardLandscapePath:keyboardLandscape,keyboardOpacity:opacity,bothNotches:!args.includes('--single-notch'),verify:args.includes('--verify'),output}));
let binary;try{binary=await build()}catch(error){server?.close();await rm(temp,{recursive:true,force:true});throw error}
console.log(`Opening portrait and landscape: ${url}`);
const child=spawn(binary,[configPath],{stdio:'inherit'});
let stopped=false;const stop=()=>{if(stopped)return;stopped=true;child.kill();server?.close();void rm(temp,{recursive:true,force:true})};
process.once('SIGINT',stop);process.once('SIGTERM',stop);child.once('exit',stop);child.once('error',error=>{console.error(error.message);stop();process.exitCode=1});
