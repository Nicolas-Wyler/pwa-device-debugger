import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
function gesture(inverse,translate=false){
 const source=fs.readFileSync(new URL('../native/Preview.swift',import.meta.url),'utf8').split('static let touchScript="""')[1].split('"""')[0];
 const handlers={},seen=[],target={dispatchEvent:e=>seen.push(e)};
 class PointerEvent{constructor(type,opts){Object.assign(this,opts,{type})}}
 vm.runInNewContext(source,{performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},getComputedStyle:()=>({touchAction:"none"}),PointerEvent,addEventListener:(t,f)=>handlers[t]=f,document:{addEventListener:(t,f)=>handlers[t]=f,elementFromPoint:()=>target}});
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

test('Input firewall blocks raw mouse events and converts clicks to touches',()=>{
 const source=fs.readFileSync(new URL('../native/Preview.swift',import.meta.url),'utf8').split('static let touchScript="""')[1].split('"""')[0];
 const handlers={},seen=[],target={dispatchEvent:e=>seen.push(e)};
 class PointerEvent{constructor(type,opts){Object.assign(this,opts,{type})}}
 vm.runInNewContext(source,{performance:{now:()=>0},requestAnimationFrame:()=>1,cancelAnimationFrame(){},getComputedStyle:()=>({touchAction:'none'}),PointerEvent,addEventListener:(t,f)=>handlers[t]=f,document:{addEventListener:(t,f)=>handlers[t]=f,elementFromPoint:()=>target}});
 for(const type of ['wheel','mousemove','mousedown','mouseup','contextmenu','dblclick','gesturechange']){
  let stopped=false,prevented=false;handlers[type]({cancelable:true,stopImmediatePropagation(){stopped=true},preventDefault(){prevented=true}});assert(stopped&&prevented,type);
 }
 handlers.click({pointerType:'mouse',detail:1,target,stopImmediatePropagation(){},preventDefault(){}});
 assert.equal(seen.length,1);assert.equal(seen[0].pointerType,'touch');
});

test('Released touch pans coast on both axes and stop on a new press',()=>{
 const source=fs.readFileSync(new URL('../native/Preview.swift',import.meta.url),'utf8').split('static let touchScript="""')[1].split('"""')[0];
 const handlers={},frames=new Map();let time=0,id=0;
 const outer={nodeType:1,parentElement:null,scrollTop:100,scrollLeft:0,scrollHeight:2000,clientHeight:300,scrollWidth:300,clientWidth:300,dispatchEvent(){},style:{overflowX:'hidden',overflowY:'auto',touchAction:'auto'}};
 const inner={nodeType:1,parentElement:outer,scrollLeft:100,scrollTop:0,scrollWidth:2000,clientWidth:300,scrollHeight:300,clientHeight:300,dispatchEvent(){},style:{overflowX:'auto',overflowY:'hidden',touchAction:'auto'}};
 class PointerEvent{constructor(type,opts){Object.assign(this,opts,{type,defaultPrevented:false})}}
 vm.runInNewContext(source,{performance:{now:()=>time},requestAnimationFrame:f=>{frames.set(++id,f);return id},cancelAnimationFrame:i=>frames.delete(i),getComputedStyle:e=>e.style,PointerEvent,addEventListener:(t,f)=>handlers[t]=f,document:{elementFromPoint:()=>inner}});
 const send=(type,x,y)=>{time+=16;handlers[type]({type,pointerType:'mouse',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,target:inner,stopImmediatePropagation(){},preventDefault(){}})};
 send('pointerdown',100,100);send('pointermove',60,60);send('pointermove',20,20);send('pointerup',20,20);
 const x=inner.scrollLeft,y=outer.scrollTop;assert(frames.size>0);
 const [key,f]=frames.entries().next().value;frames.delete(key);time+=16;f(time);
 assert(inner.scrollLeft>x);assert(outer.scrollTop>y);
 send('pointerdown',20,20);assert.equal(frames.size,0);
});
