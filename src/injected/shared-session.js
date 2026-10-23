/* Debugger-only single-runtime DOM projection. No application source changes. */
(() => {
  const leader = window.__debugView === 0;
  let applying = false, next = 1, lastCSS='', cssTick=0, forceVisual=true;
  let visualState=new WeakMap();
  const projectedScroll=new WeakMap();
  function setProjectedScroll(n,left,top){const beforeX=n.scrollLeft,beforeY=n.scrollTop;n.scrollLeft=left;n.scrollTop=top;if(n.scrollLeft!==beforeX||n.scrollTop!==beforeY)projectedScroll.set(n,{left:n.scrollLeft,top:n.scrollTop});}
  const ids = new WeakMap(), nodes = new Map(), captures=new Map(), pointerOrigins=new Map(), desiredScroll=new Map();
  addEventListener('error',e=>send({kind:'error',message:e.message,file:e.filename,line:e.lineno}));
  addEventListener('unhandledrejection',e=>send({kind:'error',message:String(e.reason?.stack||e.reason)}));
  const send = data => window.webkit.messageHandlers.session.postMessage(JSON.parse(JSON.stringify(data)));
  function id(n) { if (!ids.has(n)) { ids.set(n,next);nodes.set(next++,n); } nodes.set(ids.get(n),n);return ids.get(n); }
  function encode(n) {
    const out={id:id(n),type:n.nodeType};
    if(n.nodeType===3||n.nodeType===8)out.text=n.nodeValue;
    if(n.nodeType===1){out.tag=n.localName;out.ns=n.namespaceURI;out.attrs=[...n.attributes].filter(a=>!a.name.startsWith('on')).map(a=>[a.name,a.value]);out.children=[...n.childNodes].map(encode);}
    return out;
  }
  function decode(o) {
    if(nodes.has(o.id))return nodes.get(o.id);
    let n;
    if(o.type===3)n=document.createTextNode(o.text);
    else if(o.type===8)n=document.createComment(o.text);
    else if(o.type===1){n=document.createElementNS(o.ns,o.tag);for(const [k,v] of o.attrs)try{n.setAttribute(k,v)}catch{};if(o.tag==='script')n.setAttribute('type','application/x-debug-inert');for(const child of o.children)n.appendChild(decode(child));}
    else n=document.createComment('unsupported');
    nodes.set(o.id,n);ids.set(n,o.id);return n;
  }
  function targetInfo(e){let t=e.target;return {target:ids.get(t),x:e.clientX,y:e.clientY,rx:(e.clientX-t.getBoundingClientRect().left)/Math.max(1,t.getBoundingClientRect().width),ry:(e.clientY-t.getBoundingClientRect().top)/Math.max(1,t.getBoundingClientRect().height),targetWidth:t.getBoundingClientRect().width,targetHeight:t.getBoundingClientRect().height,gesture:e.pointerId>=700?(typeof pinch!=='undefined'&&pinch?.translate?'two-finger-pan':typeof pinch!=='undefined'&&pinch?.inverse?'inverse-pinch':'pinch'):undefined,pointerId:e.pointerId,pointerType:e.pointerType,buttons:e.buttons,button:e.button,key:e.key,code:e.code,metaKey:e.metaKey,shiftKey:e.shiftKey,ctrlKey:e.ctrlKey,altKey:e.altKey,sensitive:t.type==='password'||/password/i.test(t.autocomplete||''),value:t.value,checked:t.checked,label:t.getAttribute?.('aria-label')||t.id||t.textContent?.slice(0,100)};}
  const projections=new Map();
  function project(){for(const [key,item] of projections){const n=nodes.get(key);if(!n?.isConnected){projections.delete(key);continue;}if(item.ratioX!==undefined)setProjectedScroll(n,item.ratioX*Math.max(0,n.scrollWidth-n.clientWidth),n.scrollTop);if(item.piano){const area=n.closest('#keyboard-scroll');if(area){const ratio=area.clientWidth/Math.max(1,item.piano.viewport);n.style.width=item.piano.width*ratio+'px';for(const key of n.querySelectorAll('.piano-key')){const original=item.piano.keys.find(k=>k.id===ids.get(key));if(original){key.style.left=original.left*ratio+'px';key.style.width=original.width*ratio+'px';}}}}if(item.anchor){const owner=nodes.get(item.anchor.id);if(!owner)continue;const r=owner.getBoundingClientRect();if(item.anchor.kind==='menu'){n.style.left=Math.max(8,Math.min(r.left,innerWidth-n.offsetWidth-8))+'px';n.style.top=(r.bottom+n.offsetHeight<innerHeight-8?r.bottom+3:Math.max(8,r.top-n.offsetHeight-3))+'px';}else{const x=item.anchor.axis==='x';n.style.left=(x?r.left+item.anchor.inset:r.right-item.anchor.thickness-1)+'px';n.style.top=(x?(item.anchor.top?r.top+1:r.bottom-item.anchor.thickness-1):r.top)+'px';const size=Math.max(0,(x?r.width:r.height)-2);n.style[x?'width':'height']=size+'px';const extent=x?owner.scrollWidth:owner.scrollHeight,visible=x?owner.clientWidth:owner.clientHeight;const thumb=n.firstElementChild;if(thumb){const length=Math.min(size,Math.max(44,size*visible/Math.max(1,extent)));thumb.style[x?'width':'height']=length+'px';thumb.style.transform='translate'+(x?'X':'Y')+'('+((x?owner.scrollLeft:owner.scrollTop)/Math.max(1,extent-visible)*(size-length))+'px)';}}}}}
  const events=['pointerdown','pointermove','pointerup','pointercancel','click','input','change','keydown','keyup','focusin','focusout'];
  for(const type of events)addEventListener(type,e=>{
    if(applying)return;
    if(type.startsWith('pointer')&&e.pointerType!=='touch')return;
    if(type==='pointermove'&&!e.buttons)return;
    if(type==='click'&&e.pointerType&&e.pointerType!=='touch')return;
    const data=targetInfo(e);
    if(leader){if(type==='pointermove'&&e.buttons){for(let n=e.target;n&&n.nodeType===1;n=n.parentElement)desiredScroll.delete(ids.get(n));}send({kind:'interaction',type,...data});if(type==='pointerup'||type==='pointercancel')queueMicrotask(()=>{captures.delete(e.pointerId);pointerOrigins.delete(e.pointerId)});return;}
    if(!data.target)return;
    e.stopImmediatePropagation();
    // Keep native text editing available; all other effects belong to the leader.
    if(type==='click')e.preventDefault();
    send({kind:'event',type,...data});
  },true);
  addEventListener('scroll',e=>{
    if(applying)return;const t=e.target;const expected=projectedScroll.get(t);if(expected){projectedScroll.delete(t);if(Math.abs(t.scrollLeft-expected.left)<1&&Math.abs(t.scrollTop-expected.top)<1)return;}
    if(!leader&&ids.has(t))send({kind:'scroll',target:ids.get(t),left:t.scrollLeft,top:t.scrollTop,ratioX:t.id==='keyboard-scroll'?t.scrollLeft/Math.max(1,t.scrollWidth-t.clientWidth):undefined});
    if(leader){desiredScroll.delete(ids.get(t));const desired=desiredScroll.get(ids.get(t));send({kind:'scroll-state',target:ids.get(t),left:desired?.left??t.scrollLeft,top:desired?.top??t.scrollTop,ratioX:desired?.ratioX??(t.id==='keyboard-scroll'?t.scrollLeft/Math.max(1,t.scrollWidth-t.clientWidth):undefined)});}
  },true);
  window.__debugTouchProjection=packet=>{const n=nodes.get(packet.target);if(!n)return;const r=n.getBoundingClientRect();send({kind:'touch-visual',type:packet.type,pointerId:packet.pointerId,x:r.left+packet.rx*r.width,y:r.top+packet.ry*r.height})};
  window.__debugSessionReceive = packet => {
    applying=true;
    try {
      if(leader){
        const t=packet.type?.startsWith('pointer')?(captures.get(packet.pointerId)||nodes.get(packet.target)):nodes.get(packet.target);if(!t)return;
        if(packet.kind==='scroll'){desiredScroll.set(packet.target,{left:packet.left,top:packet.top,ratioX:packet.ratioX});setProjectedScroll(t,packet.ratioX===undefined?packet.left:packet.ratioX*(t.scrollWidth-t.clientWidth),packet.top);return;}
        if(packet.kind!=='event')return;
        const type=packet.type;
        if(type==='pointerdown'&&document.activeElement?.matches('input,textarea,[contenteditable=true]')&&!t.closest('input,textarea,[contenteditable=true]'))document.activeElement.blur();
        if(type==='focusin'){t.focus({preventScroll:true});return;}
        if(type==='focusout'){t.blur();return;}
        if(type==='input'||type==='change'){if('value'in t)t.value=packet.value;if('checked'in t)t.checked=packet.checked;t.dispatchEvent(new Event(type,{bubbles:true}));return;}
        const r=t.getBoundingClientRect(),props={...packet,bubbles:true,cancelable:true,composed:true,clientX:r.left+packet.rx*r.width,clientY:r.top+packet.ry*r.height,isPrimary:packet.pointerId!==701};
        if(type==='pointerdown')pointerOrigins.set(packet.pointerId,{x:packet.x,y:packet.y,sx:props.clientX,sy:props.clientY,ratioX:r.width/Math.max(1,packet.targetWidth),ratioY:r.height/Math.max(1,packet.targetHeight)});
        const origin=pointerOrigins.get(packet.pointerId);if(origin&&captures.has(packet.pointerId)&&type!=='pointerdown'){props.clientX=origin.sx+(packet.x-origin.x)*origin.ratioX;props.clientY=origin.sy+(packet.y-origin.y)*origin.ratioY;}
        if(type.startsWith('key'))t.dispatchEvent(new KeyboardEvent(type,props));
        else t.dispatchEvent(new PointerEvent(type,{...props,pointerType:'touch'}));
        if(type==='pointerup'||type==='pointercancel'){captures.delete(packet.pointerId);pointerOrigins.delete(packet.pointerId);}
        return;
      }
      if(packet.kind==='snapshot'){
        nodes.clear();const root=decode(packet.tree);document.replaceChild(root,document.documentElement);
        // Scripts are inert: only the leader owns application logic and audio.
      }else if(packet.kind==='mutations'){
        for(const m of packet.items){const t=nodes.get(m.target);if(!t)continue;
          if(m.type==='attributes'){if(m.name.startsWith('on')||t.localName==='script')continue;if(t.localName==='dialog'&&m.name==='open'&&m.value===null){try{t.close()}catch{}t.removeAttribute('open');}else if(m.value===null)t.removeAttribute(m.name);else t.setAttribute(m.name,m.value);}
          else if(m.type==='characterData')t.nodeValue=m.value;
          else {for(const n of m.removed)nodes.get(n)?.remove();const before=nodes.get(m.before);for(const child of m.added)t.insertBefore(decode(child),before?.parentNode===t?before:null);}
        }
      for(const [key,node] of nodes)if(!node.isConnected){nodes.delete(key);desiredScroll.delete(key);}
      }else if(packet.kind==='visual'){
        for(const item of packet.items){const n=nodes.get(item.id);if(!n)continue;
          if(item.value!==undefined&&n.value!==String(item.value))n.value=item.value;
          if(item.checked!==undefined)n.checked=item.checked;
          if(item.open!==undefined){if(item.open&&item.modal&&!n.matches(':modal')){n.removeAttribute('open');try{n.showModal()}catch{n.setAttribute('open','')}}else if(!item.open){try{n.close()}catch{}n.removeAttribute('open');}else n.setAttribute('open','');}
          if(item.anchor||item.piano||item.ratioX!==undefined)projections.set(item.id,item);
          if(item.popover!==undefined){try{if(item.popover&&!n.matches(':popover-open'))n.showPopover();else if(!item.popover&&n.matches(':popover-open'))n.hidePopover()}catch{}}
          if(item.canvas){const im=new Image(),frame=(n.__debugCanvasFrame||0)+1;n.__debugCanvasFrame=frame;im.onload=()=>{if(n.__debugCanvasFrame!==frame)return;if(n.width!==item.width)n.width=item.width;if(n.height!==item.height)n.height=item.height;const ctx=n.getContext('2d');ctx?.clearRect(0,0,n.width,n.height);ctx?.drawImage(im,0,0)};im.src=item.canvas;}
          const left=item.ratioX===undefined?item.left:item.ratioX*(n.scrollWidth-n.clientWidth);if(Math.abs(n.scrollLeft-left)>1||Math.abs(n.scrollTop-item.top)>1)setProjectedScroll(n,left,item.top);
        }
        let style=document.getElementById('__debugMirrorCSS');if(!style){style=document.createElement('style');style.id='__debugMirrorCSS';document.head.appendChild(style)}
        if(packet.css!==undefined&&style.textContent!==packet.css)style.textContent=packet.css;
        const active=nodes.get(packet.active);if(active?.matches('input:not([type=checkbox]):not([type=range]):not([type=color]),textarea,[contenteditable=true]')){if(document.activeElement!==active)active.focus({preventScroll:true});if(packet.selection)try{active.setSelectionRange(...packet.selection)}catch{}}else if(document.activeElement?.matches('input,textarea,[contenteditable=true]'))document.activeElement.blur();
        for(const state of packet.animations||[]){const target=nodes.get(state.target);const animation=target?.getAnimations().find(a=>a.animationName===state.name);if(animation&&typeof state.currentTime==='number'){animation.currentTime=state.currentTime;animation.playbackRate=state.playbackRate;if(state.playState==='paused')animation.pause();else if(state.playState==='running'&&animation.playState!=='running')animation.play();}}
      }else if(packet.kind==='scroll-state'){const n=nodes.get(packet.target);if(n){setProjectedScroll(n,packet.ratioX===undefined?packet.left:packet.ratioX*(n.scrollWidth-n.clientWidth),packet.top);}}
      // A projection has its own orientation and safe area, never the leader's.
      document.documentElement.style.setProperty('--debug-safe-top',window.__debugInsets[0]+'px');
      document.documentElement.style.setProperty('--debug-safe-right',window.__debugInsets[1]+'px');
      document.documentElement.style.setProperty('--debug-safe-bottom',window.__debugInsets[2]+'px');
      document.documentElement.style.setProperty('--debug-safe-left',window.__debugInsets[3]+'px');
    if(!leader)project();
    } finally { applying=false; }
  };
  if(!leader)addEventListener('DOMContentLoaded',()=>send({kind:'ready'}));
  if(leader){
    window.__debugResnapshot=()=>{lastCSS='';cssTick=0;forceVisual=true;visualState=new WeakMap();if(document.readyState!=='loading')send({kind:'snapshot',tree:encode(document.documentElement)})};
    const capture=Element.prototype.setPointerCapture,release=Element.prototype.releasePointerCapture,hasCapture=Element.prototype.hasPointerCapture;Element.prototype.setPointerCapture=function(p){captures.set(p,this);try{return capture.call(this,p)}catch{}};Element.prototype.releasePointerCapture=function(p){captures.delete(p);try{return release.call(this,p)}catch{}};Element.prototype.hasPointerCapture=function(p){return captures.get(p)===this||hasCapture.call(this,p)};
    addEventListener('DOMContentLoaded',()=>{
      send({kind:'snapshot',tree:encode(document.documentElement)});
      new MutationObserver(records=>send({kind:'mutations',items:records.map(m=>m.type==='childList'?{type:m.type,target:id(m.target),removed:[...m.removedNodes].map(id),added:[...m.addedNodes].map(encode),before:m.nextSibling?id(m.nextSibling):null}:m.type==='attributes'?{type:m.type,target:id(m.target),name:m.attributeName,value:m.target.getAttribute(m.attributeName)}:{type:m.type,target:id(m.target),value:m.target.nodeValue})})).observe(document.documentElement,{subtree:true,attributes:true,characterData:true,childList:true});
      setInterval(()=>{
        const items=[];
        for(const n of document.querySelectorAll('input,textarea,select,dialog,canvas,[popover],[class*=scroll],#keyboard')){
          const desired=desiredScroll.get(id(n));const item={id:id(n),left:desired?.left??n.scrollLeft,top:desired?.top??n.scrollTop,ratioX:desired?.ratioX??(n.id==='keyboard-scroll'?n.scrollLeft/Math.max(1,n.scrollWidth-n.clientWidth):undefined)};
          if('value'in n&&n.type!=='password'&&!/password/i.test(n.autocomplete||''))item.value=n.value;
          if('checked'in n)item.checked=n.checked;
          if(n.localName==='dialog'){item.open=n.open;item.modal=n.matches(':modal');}if(n.hasAttribute('popover'))item.popover=n.matches(':popover-open');
          if(n.localName==='canvas'&&n.width&&n.height&&(forceVisual||n.getClientRects().length))try{item.canvas=n.toDataURL();item.width=n.width;item.height=n.height}catch{}
          const signature=JSON.stringify(item);if(visualState.get(n)!==signature){visualState.set(n,signature);items.push(item);}
        }
        const piano=document.getElementById('keyboard');if(piano){const area=piano.closest('#keyboard-scroll');if(area)items.push({id:id(piano),left:0,top:0,piano:{viewport:area.clientWidth,width:parseFloat(piano.style.width)||piano.scrollWidth,keys:[...piano.querySelectorAll('.piano-key')].map(k=>({id:id(k),left:parseFloat(k.style.left)||0,width:parseFloat(k.style.width)||0}))}});}
        for(const n of document.querySelectorAll('.custom-options')){const button=document.querySelector('.custom-select[aria-expanded=true]');if(button)items.push({id:id(n),left:n.scrollLeft,top:n.scrollTop,anchor:{kind:'menu',id:id(button)}});}
        const scrollers=[...document.querySelectorAll('[id],dialog')].filter(n=>{const c=getComputedStyle(n);return /auto|scroll/.test(c.overflowX+' '+c.overflowY)});
        for(const n of document.querySelectorAll('.custom-scrollbar')){const x=n.classList.contains('x'),r=n.getBoundingClientRect();let owner,score=Infinity;for(const el of scrollers){const a=el.getBoundingClientRect();const delta=x?Math.abs(a.left-r.left)+Math.min(Math.abs(a.top+1-r.top),Math.abs(a.bottom-r.bottom)):Math.abs(a.right-r.right)+Math.abs(a.top-r.top);if(delta<score){owner=el;score=delta;}}if(owner&&score<100){const a=owner.getBoundingClientRect();items.push({id:id(n),left:0,top:0,anchor:{kind:'track',id:id(owner),axis:x?'x':'y',top:x&&Math.abs(a.top+1-r.top)<5,inset:x?Math.max(0,r.left-a.left):0,thickness:x?r.height:r.width}});}}
        forceVisual=false;
        const animations=document.getAnimations().map(a=>({target:ids.get(a.effect?.target),name:a.animationName,currentTime:a.currentTime,playbackRate:a.playbackRate,playState:a.playState})).filter(a=>a.target);
        let css;if(++cssTick%20===1){for(const [key,node] of nodes)if(!node.isConnected){nodes.delete(key);desiredScroll.delete(key);}const currentCSS=[...document.styleSheets].filter(s=>s.ownerNode?.id!=='__debugMirrorCSS').map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n')}catch{return ''}}).join('\n');if(currentCSS!==lastCSS){lastCSS=currentCSS;css=currentCSS;}}
        send({kind:'visual',items,css,animations,active:ids.get(document.activeElement),selection:document.activeElement?.selectionStart===undefined?undefined:[document.activeElement.selectionStart,document.activeElement.selectionEnd]});
      },50);
    });
  }
})();
