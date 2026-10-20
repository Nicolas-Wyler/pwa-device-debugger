import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function gesture(inverse,translate=false){
 const source=fs.readFileSync(new URL('../native/Preview.swift',import.meta.url),'utf8').split('static let touchScript="""')[1].split('"""')[0];
 const handlers={},seen=[],target={dispatchEvent:e=>seen.push(e)};
 class PointerEvent{constructor(type,opts){Object.assign(this,opts,{type})}}
 vm.runInNewContext(source,{performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},getComputedStyle:()=>({touchAction:"none"}),PointerEvent,addEventListener(){},document:{addEventListener:(t,f)=>handlers[t]=f,elementFromPoint:()=>target}});
 for(const [type,x] of [['pointerdown',200],['pointermove',230],['pointermove',500],['pointerup',500]])handlers[type]({type,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,metaKey:!translate,ctrlKey:false,shiftKey:inverse||translate,clientX:x,clientY:100,target,stopImmediatePropagation(){},preventDefault(){}});
 return seen;
}
test('Command pinch expands about a fixed center with stable touch IDs',()=>{
 const e=gesture(false);assert.equal(e.length,8);
 for(let i=0;i<e.length;i+=2){assert.equal((e[i].clientX+e[i+1].clientX)/2,188);assert.equal(e[i].pointerId,700);assert.equal(e[i+1].pointerId,701)}
 assert.equal(e[2].clientX-e[3].clientX,84);assert.equal(e[6].buttons,0);
});
test('Shift Command pinch contracts outward motion and clamps at minimum spacing',()=>{
 const e=gesture(true);
 for(let i=0;i<e.length;i+=2)assert.equal((e[i].clientX+e[i+1].clientX)/2,140);
 assert.equal(e[0].clientX-e[1].clientX,120);assert.equal(e[2].clientX-e[3].clientX,60);
 assert.equal(e[4].clientX-e[5].clientX,24);assert.equal(e[6].buttons,0);
});

test('Shift translates two touches together at fixed spacing',()=>{
 const e=gesture(false,true);
 for(let i=0;i<e.length;i+=2)assert.equal(e[i].clientX-e[i+1].clientX,24);
 assert.equal(e[2].clientX-e[0].clientX,30);assert.equal(e[3].clientX-e[1].clientX,30);
 assert.equal(e[6].buttons,0);
});
