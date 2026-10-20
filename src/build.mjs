import {mkdir,copyFile,writeFile,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export const host=root+'build/PWA Device Debugger.app/Contents/MacOS/Preview';
export async function build(){
 if(process.platform!=='darwin')throw Error('Native preview requires macOS. Measurement tools can be used separately.');
 await mkdir(root+'build/PWA Device Debugger.app/Contents/MacOS',{recursive:true});
 let current=false;try{current=(await stat(host)).mtimeMs>=(await stat(root+'native/Preview.swift')).mtimeMs}catch{}
 if(!current)execFileSync('xcrun',['swiftc',root+'native/Preview.swift','-o',host,'-framework','Cocoa','-framework','WebKit'],{stdio:'inherit'});
 await writeFile(root+'build/PWA Device Debugger.app/Contents/Info.plist',`<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Preview</string><key>CFBundleIdentifier</key><string>local.pwa-device-debugger</string><key>CFBundleName</key><string>PWA Device Debugger</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/><key>NSPrincipalClass</key><string>NSApplication</string><key>NSMicrophoneUsageDescription</key><string>Test audio input in the PWA preview.</string><key>NSCameraUsageDescription</key><string>Test camera input in the PWA preview.</string></dict></plist>`);
 return host;
}
if(process.argv[1]===fileURLToPath(import.meta.url))await build();
