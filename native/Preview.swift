import Cocoa
import WebKit

struct Profile: Decodable {
    let name:String
    let width:CGFloat
    let height:CGFloat
    let nativeWidth:CGFloat
    let nativeHeight:CGFloat
    let minimumDensity:CGFloat
    let safeAreas:[String:[CGFloat]]
}
struct Segment:Decodable {let type:String;let points:[[CGFloat]]}
struct Config:Decodable {
    let url:String
    let profile:Profile
    let segments:[Segment]
    let keyboardPath:String?
    let keyboardLandscapePath:String?
    let keyboardOpacity:Double?
    let bothNotches:Bool
    let verify:Bool
    let output:String
}
let configURL=URL(fileURLWithPath:CommandLine.arguments[1])
let config=try JSONDecoder().decode(Config.self,from:Data(contentsOf:configURL))
final class RetinaWindow:NSWindow {
    override var backingScaleFactor:CGFloat { max(config.profile.minimumDensity,super.backingScaleFactor) }
}
final class PassiveImage:NSImageView {
    override func hitTest(_ point:NSPoint)->NSView? {nil}
}
// Native-only feedback: never participates in page layout or hit testing.
final class TouchFeedback:NSView {
    var dot:CALayer?
    var pair:[CALayer]=[]
    var center:NSPoint?
    var pinching=false
    var inversePinch=false
    var translating=false
    override var isFlipped:Bool {true}
    override func hitTest(_ point:NSPoint)->NSView? {nil}
    func showPair(_ point:NSPoint,active:Bool,inverse:Bool=false,translate:Bool=false){
        wantsLayer=true
        if !active || center == nil {translating=translate;inversePinch=inverse;center=NSPoint(x:point.x-(inverse ? 60:12),y:point.y)}
        if translating {center=NSPoint(x:point.x-12,y:point.y)}
        guard let c=center else{return}
        CATransaction.begin();CATransaction.setDisableActions(true)
        if pair.isEmpty {
            for size:CGFloat in [18,18,4] {
                let l=CALayer();l.bounds=CGRect(x:0,y:0,width:size,height:size);l.cornerRadius=size/2
                layer?.addSublayer(l);pair.append(l)
            }
        }
        let dx=point.x-c.x,dy=point.y-c.y,distance=hypot(dx,dy)
        let radius=inversePinch ? max(12,120-distance):distance
        let ux=distance>0.001 ? dx/distance:1,uy=distance>0.001 ? dy/distance:0
        let first=NSPoint(x:c.x+ux*radius,y:c.y+uy*radius)
        let positions=[first,NSPoint(x:2*c.x-first.x,y:2*c.y-first.y),c]
        for (i,l) in pair.enumerated(){l.position=positions[i];l.backgroundColor=NSColor.white.withAlphaComponent(active ? 0.3:0.1).cgColor;l.borderColor=NSColor.white.withAlphaComponent(active ? 0.85:0.45).cgColor;l.borderWidth=active ? 1.5:1}
        CATransaction.commit()
    }
    func clearPair(){pair.forEach{$0.removeFromSuperlayer()};pair=[];center=nil;pinching=false}
    func begin(_ point:NSPoint){
        dot?.removeFromSuperlayer();wantsLayer=true
        let circle=CALayer();circle.bounds=CGRect(x:0,y:0,width:18,height:18)
        circle.position=point;circle.cornerRadius=9
        circle.backgroundColor=NSColor.white.withAlphaComponent(0.28).cgColor
        circle.borderColor=NSColor.white.withAlphaComponent(0.5).cgColor;circle.borderWidth=1
        layer?.addSublayer(circle);dot=circle
        let pop=CAKeyframeAnimation(keyPath:"transform.scale")
        pop.values=[0.25,1.45,1];pop.keyTimes=[0,0.55,1];pop.duration=0.12
        circle.add(pop,forKey:"pop")
    }
    func move(_ point:NSPoint){CATransaction.begin();CATransaction.setDisableActions(true);dot?.position=point;CATransaction.commit()}
    func end(){
        guard let circle=dot else{return};dot=nil
        let fade=CABasicAnimation(keyPath:"opacity");fade.fromValue=1;fade.toValue=0;fade.duration=0.14
        circle.opacity=0;circle.add(fade,forKey:"fade")
        DispatchQueue.main.asyncAfter(deadline:.now()+0.15){circle.removeFromSuperlayer()}
    }
}
final class HomeIndicator:NSView {
    override var isFlipped:Bool {true}
    override func hitTest(_ point:NSPoint)->NSView? {nil}
    override func draw(_ dirtyRect:NSRect) {
        NSColor.white.withAlphaComponent(0.9).setFill()
        let length:CGFloat=bounds.width>bounds.height ? 238:154
        NSBezierPath(roundedRect:NSRect(x:(bounds.width-length)/2,y:bounds.height-13,width:length,height:5),xRadius:2.5,yRadius:2.5).fill()
    }
}
final class Fade:NSView {
    var landscape=false
    override var isFlipped:Bool {true}
    override func hitTest(_ point:NSPoint)->NSView? {nil}
    func screenPath(mirror:Bool=false)->NSBezierPath {
        let path=NSBezierPath()
        for (index,segment) in config.segments.enumerated() {
            let points=segment.points.map{v -> NSPoint in
                var x=v[0],y=v[1]
                if mirror {x=config.profile.nativeHeight-1-x}
                if !landscape {let old=x;x=config.profile.nativeWidth-1-y;y=old}
                let scale=config.profile.nativeWidth/config.profile.width
                return NSPoint(x:x/scale,y:y/scale)
            }
            if index==0 {path.move(to:points[0])}
            if points.count==4 {path.curve(to:points[3],controlPoint1:points[1],controlPoint2:points[2])}
            else {path.line(to:points.last!)}
        }
        path.close();return path
    }
    override func draw(_ dirtyRect:NSRect) {
        // Composite exclusions once: intersect screen interiors, then fade the complement.
        let context=NSGraphicsContext.current!.cgContext
        let layer=CGLayer(context,size:bounds.size,auxiliaryInfo:nil)!
        let g=layer.context!
        g.setFillColor(NSColor.gray.cgColor);g.fill(bounds)
        g.setBlendMode(.clear)
        // NSBezierPath supplies a platform-independent CGPath conversion below.
        if landscape && config.bothNotches {
            g.addPath(screenPath().asCGPath);g.clip()
            g.addPath(screenPath(mirror:true).asCGPath);g.fillPath()
        } else {g.addPath(screenPath().asCGPath);g.fillPath()}
        context.saveGState();context.setAlpha(0.5);context.draw(layer,in:bounds);context.restoreGState()
    }
}
extension NSBezierPath {
    var asCGPath:CGPath {
        let result=CGMutablePath();let pts=UnsafeMutablePointer<NSPoint>.allocate(capacity:3);defer{pts.deallocate()}
        for i in 0..<elementCount {
            switch element(at:i,associatedPoints:pts) {
            case .moveTo:result.move(to:pts[0])
            case .lineTo:result.addLine(to:pts[0])
            case .curveTo:result.addCurve(to:pts[2],control1:pts[0],control2:pts[1])
            case .closePath:result.closeSubpath()
            default:break
            }
        }
        return result
    }
}
final class Shell:NSView {
    let stage=NSView()
    let web:WKWebView
    let fade=Fade()
    let keyboard=PassiveImage()
    let home=HomeIndicator()
    let touch=TouchFeedback()
    var keyboardShown=false {didSet {needsLayout=true}}
    var landscape=false
    let phone:NSSize
    override var isFlipped:Bool {true}
    init(frame:NSRect,web:WKWebView,landscape:Bool) {
        self.web=web
        self.landscape=landscape
        phone=landscape ? NSSize(width:config.profile.height,height:config.profile.width):NSSize(width:config.profile.width,height:config.profile.height)
        super.init(frame:frame)
        wantsLayer=true;layer?.backgroundColor=NSColor(calibratedWhite:0.15,alpha:1).cgColor
        addSubview(stage);stage.addSubview(web);stage.addSubview(keyboard);stage.addSubview(home);stage.addSubview(fade);stage.addSubview(touch)
        if let imagePath=(landscape ? config.keyboardLandscapePath : config.keyboardPath) {keyboard.image=NSImage(contentsOfFile:imagePath)}
        keyboard.alphaValue=CGFloat(config.keyboardOpacity ?? 0.45)
        keyboard.imageScaling = .scaleAxesIndependently;keyboard.isHidden=true
        fade.landscape=landscape
        web.frame=NSRect(origin:.zero,size:phone);fade.frame=web.frame
        autoresizingMask=[.width,.height]
    }
    required init?(coder:NSCoder){fatalError()}
    override func layout() {
        super.layout()
        let scale=max(0.01,min((bounds.width-12)/phone.width,(bounds.height-12)/phone.height))
        stage.frame=NSRect(x:(bounds.width-phone.width*scale)/2,y:(bounds.height-phone.height*scale)/2,width:phone.width*scale,height:phone.height*scale)
        stage.bounds=NSRect(origin:.zero,size:phone)
        // Child frame/bounds stay fixed: only the ancestor's presentation transform changes.
        web.frame=NSRect(origin:.zero,size:phone);fade.frame=web.frame;fade.needsDisplay=true
        // Use each crop's actual aspect ratio, including its accessory bar.
        let imageSize=keyboard.image?.size ?? NSSize(width:phone.width,height:345)
        let height=phone.width*imageSize.height/imageSize.width
        keyboard.frame=NSRect(x:0,y:0,width:phone.width,height:height)
        keyboard.isHidden = !keyboardShown || keyboard.image == nil
        touch.frame=web.frame
        home.frame=web.frame;home.needsDisplay=true
        home.isHidden=false
    }
}
final class Host:NSObject,NSApplicationDelegate,NSWindowDelegate,WKScriptMessageHandler,WKNavigationDelegate {
    var windows:[NSWindow]=[];var views:[WKWebView]=[];var shells:[Shell]=[]
    var reports:[String:[String:Any]]=[:]
    var baselines:[String:[String:Any]]=[:]
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
        if message.name == "keyboard",let data=message.body as? [String:Any],let orientation=data["orientation"] as? String,let visible=data["visible"] as? Bool {
            let i=orientation == "portrait" ? 0:1
            if shells.indices.contains(i){shells[i].keyboardShown=visible;shells[i].layoutSubtreeIfNeeded();if config.verify {print("KEYBOARD \(orientation) visible=\(!shells[i].keyboard.isHidden) height=\(shells[i].keyboard.frame.height) opacity=\(shells[i].keyboard.alphaValue)");fflush(stdout)}}
            return
        }
        guard let data=message.body as? [String:Any], let orientation=data["orientation"] as? String else{return}
        if baselines[orientation] == nil {baselines[orientation]=data}
        var checked=data
        let expectedWidth=orientation == "portrait" ? config.profile.width : config.profile.height
        let expectedHeight=orientation == "portrait" ? config.profile.height : config.profile.width
        checked["passed"] = (data["width"] as? Double == Double(expectedWidth)) && (data["height"] as? Double == Double(expectedHeight)) && ((data["dpr"] as? Double ?? 0) >= Double(config.profile.minimumDensity))
        if let before=baselines[orientation]?["layout"] as? NSDictionary,let after=data["layout"] as? NSDictionary {checked["layoutUnchanged"] = before.isEqual(to:after as! [AnyHashable:Any])}
        if let idle=data["inputIdleEvents"] {checked["inputIdleEvents"]=idle}
        else if let old=reports[orientation] {for key in ["inputIdleEvents","inputEvents","allowedPanPixels","lockedPanPixels"] {checked[key]=old[key]}}
        reports[orientation]=checked;print("CHECK \(data)");fflush(stdout)
        if config.verify {try? JSONSerialization.data(withJSONObject:reports,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:config.output+"/verification.json"))}
    }
    func webView(_ webView:WKWebView,didFailProvisionalNavigation navigation:WKNavigation!,withError error:Error){print("NAVIGATION FAILED: \(error)");fflush(stdout)}
    func webView(_ webView:WKWebView,didFail navigation:WKNavigation!,withError error:Error){print("NAVIGATION FAILED: \(error)");fflush(stdout)}
    func webView(_ webView:WKWebView,didFinish navigation:WKNavigation!){
        webView.evaluateJavaScript("JSON.stringify({title:document.title,bodyCharacters:document.body?.innerText.length||0})"){value,error in print("PAGE LOADED: \(value ?? "unknown") \(error?.localizedDescription ?? "")");fflush(stdout)}
    }
    func applicationDidFinishLaunching(_ notification:Notification){
        NSApp.setActivationPolicy(.regular)
        let menu=NSMenu();let appMenu=NSMenuItem();menu.addItem(appMenu);let submenu=NSMenu();submenu.addItem(withTitle:"Quit",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");appMenu.submenu=submenu;NSApp.mainMenu=menu
        for (i,orientation) in ["portrait","landscape"].enumerated(){
            let landscape=orientation=="landscape"
            let settings=WKWebViewConfiguration();settings.websiteDataStore = .default();settings.mediaTypesRequiringUserActionForPlayback=[]
            settings.userContentController.add(self,name:"report");settings.userContentController.add(self,name:"keyboard")
            let insets=config.profile.safeAreas[orientation]!
            let vars=zip(["top","right","bottom","left"],insets).map{"--debug-safe-\($0.0):\($0.1)px"}.joined(separator:";")
            let script=Self.touchScript + """
            Object.defineProperty(navigator,'standalone',{get:()=>true});
            Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});
            const originalMM=window.matchMedia.bind(window);
            window.matchMedia=q=>{const m=originalMM(q);if(/display-mode\\s*:\\s*standalone|pointer\\s*:\\s*coarse|hover\\s*:\\s*none/.test(q))Object.defineProperty(m,'matches',{value:true});return m;};
            function adaptStyles(){
              document.documentElement.style.cssText+=';\(vars)';
              function adapt(rules){for(const rule of rules){if(rule.selectorText?.includes(':hover'))rule.selectorText=rule.selectorText.replace(/:hover/g,'[data-debug-touch-hover]');if(rule.style){for(const name of [...rule.style]){const old=rule.style.getPropertyValue(name);const updated=old.replace(/env\\(safe-area-inset-(top|right|bottom|left)(?:,\\s*[^)]+)?\\)/g,(_,side)=>'var(--debug-safe-'+side+',0px)');if(updated!==old)rule.style.setProperty(name,updated,rule.style.getPropertyPriority(name));}}if(rule.conditionText?.match(/\\(pointer:\\s*coarse\\)/))rule.conditionText=rule.conditionText.replace(/\\(pointer:\\s*coarse\\)/g,'(min-width:0px)');if(rule.cssRules)adapt(rule.cssRules);}}
              for(const sheet of document.styleSheets)try{adapt(sheet.cssRules)}catch{}
            }
            function keyboardState(){const e=document.activeElement;const visible=!!e&&(e.matches('textarea,[contenteditable=true]')||(e.matches('input')&&!['button','submit','reset','checkbox','radio','range','color','file','hidden'].includes(e.type)));window.webkit.messageHandlers.keyboard.postMessage({orientation:'\(orientation)',visible});}
            addEventListener('focusin',keyboardState,true);addEventListener('focusout',()=>setTimeout(keyboardState,0),true);
            addEventListener('load',()=>{adaptStyles();setTimeout(report,400)});
            addEventListener('resize',()=>setTimeout(report,200));
            function report(){if(window!==window.top)return;window.webkit.messageHandlers.report.postMessage({orientation:'\(orientation)',width:innerWidth,height:innerHeight,dpr:devicePixelRatio,buttonCount:document.querySelectorAll('button').length,layout:document.querySelector('main')?.getBoundingClientRect().toJSON()??null});}
            """
            settings.userContentController.addUserScript(WKUserScript(source:script,injectionTime:.atDocumentStart,forMainFrameOnly:false))
            let web=WKWebView(frame:.zero,configuration:settings)
            web.customUserAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 Version/18.3 Mobile/15E148 Safari/604.1"
            let size=landscape ? NSSize(width:820,height:420):NSSize(width:430,height:750)
            let window=RetinaWindow(contentRect:NSRect(origin:NSPoint(x:70+i*460,y:100),size:size),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
            window.title="\(config.profile.name) \(orientation) · PWA debugger";window.delegate=self;window.isReleasedWhenClosed=false
            let shell=Shell(frame:NSRect(origin:.zero,size:size),web:web,landscape:landscape);shells.append(shell);window.contentView=shell
            window.acceptsMouseMovedEvents=true
            windows.append(window);views.append(web);window.makeKeyAndOrderFront(nil)
            web.navigationDelegate=self
            web.load(URLRequest(url:URL(string:config.url)!))
        }
        NSEvent.addLocalMonitorForEvents(matching:[.leftMouseDown,.leftMouseDragged,.leftMouseUp,.mouseMoved,.flagsChanged]){[weak self] event in
            guard let self=self,let index=self.windows.firstIndex(where:{$0 === event.window}) else{return event}
            let overlay=self.shells[index].touch
            let point=overlay.convert(event.locationInWindow,from:nil)
            if event.type == .flagsChanged || event.type == .mouseMoved {
                if !overlay.pinching {if (event.modifierFlags.contains(.command) || event.modifierFlags.contains(.shift)) && overlay.bounds.contains(point){overlay.showPair(point,active:false,inverse:event.modifierFlags.contains(.shift) && event.modifierFlags.contains(.command),translate:!event.modifierFlags.contains(.command))}else{overlay.clearPair()}}
            }
            else if event.type == .leftMouseDown {if overlay.bounds.contains(point){
                if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.shift){overlay.center=nil;overlay.pinching=true;overlay.showPair(point,active:true,inverse:event.modifierFlags.contains(.shift) && event.modifierFlags.contains(.command),translate:!event.modifierFlags.contains(.command))}else{overlay.clearPair();overlay.begin(point)}
            }}
            else if event.type == .leftMouseDragged {if overlay.pinching{overlay.showPair(point,active:true)}else{overlay.move(point)}}
            else {overlay.end();overlay.clearPair();if event.modifierFlags.contains(.command) || event.modifierFlags.contains(.shift){overlay.showPair(point,active:false,inverse:event.modifierFlags.contains(.shift) && event.modifierFlags.contains(.command),translate:!event.modifierFlags.contains(.command))}}
            return event
        }
        NSApp.activate(ignoringOtherApps:true)
        if config.verify {
            DispatchQueue.main.asyncAfter(deadline:.now()+4){
                for (i,window) in self.windows.enumerated(){window.setContentSize(NSSize(width:620+i*100,height:650));window.contentView?.layoutSubtreeIfNeeded()}
                DispatchQueue.main.asyncAfter(deadline:.now()+2){
                    for (i,web) in self.views.enumerated(){
                        web.evaluateJavaScript("""
                        (()=>{
                        const probe=document.createElement('div');probe.style.cssText='position:fixed;left:10px;top:10px;width:20px;height:20px;z-index:999999';document.body.append(probe);
                        const seen=[];const log=e=>seen.push(e.type+':'+e.pointerType);
                        for(const type of ['pointerdown','pointermove','pointerup','pointerover'])probe.addEventListener(type,log);
                        const send=(type,buttons=0)=>probe.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:987,button:0,buttons,clientX:15,clientY:15}));
                        send('pointerover');send('pointermove');const idle=seen.length;
                        send('pointerdown',1);send('pointermove',1);send('pointerup');send('pointermove');
                        probe.remove();
                        const area=document.createElement('div');area.style.cssText='position:fixed;left:10px;top:10px;width:120px;height:60px;overflow:auto;touch-action:pan-x;z-index:999999';area.innerHTML='<div style="width:600px;height:40px"></div>';document.body.append(area);
                        const drag=()=>{for(const [type,x,buttons] of [['pointerdown',90,1],['pointermove',30,1],['pointerup',30,0]])area.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'mouse',pointerId:988,button:0,buttons,clientX:x,clientY:30}));};
                        drag();const allowedPanPixels=area.scrollLeft;area.scrollLeft=0;area.style.touchAction='none';drag();const lockedPanPixels=area.scrollLeft;area.remove();
                        window.webkit.messageHandlers.report.postMessage({orientation:'\(i==0 ? "portrait":"landscape")',width:innerWidth,height:innerHeight,dpr:devicePixelRatio,inputIdleEvents:idle,inputEvents:seen,allowedPanPixels,lockedPanPixels});report();document.getElementById('text')?.focus();
                        })()
                        """,completionHandler:nil)
                        let snap=WKSnapshotConfiguration();snap.snapshotWidth=NSNumber(value:Double(web.bounds.width*max(2,web.window?.backingScaleFactor ?? 2)))
                        web.takeSnapshot(with:snap){image,error in
                            guard let image=image,let rep=image.representations.first else{return}
                            print("SNAPSHOT \(i): \(rep.pixelsWide)x\(rep.pixelsHigh) for \(web.bounds.size) CSS frame");fflush(stdout)
                            if let data=image.tiffRepresentation,let bitmap=NSBitmapImageRep(data:data),let png=bitmap.representation(using:.png,properties:[:]){try? png.write(to:URL(fileURLWithPath:config.output+"/retina-\(i).png"))}
                        }
                    }
                }
            }
        }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool{true}
    static let touchScript="""
    let held=null,pan=null,pinch=null,momentum=null,coastFrame=0;
    function stopCoast(){if(coastFrame)cancelAnimationFrame(coastFrame);coastFrame=0;}
    function beginMomentum(target){stopCoast();const a=scrollTarget(target);momentum=a?{...a,last:performance.now(),left:a.el.scrollLeft,top:a.el.scrollTop,vx:0,vy:0}:null;}
    function sampleMomentum(){if(!momentum)return;const m=momentum,now=performance.now(),dt=Math.max(1,now-m.last),dx=m.el.scrollLeft-m.left,dy=m.el.scrollTop-m.top;if(dx||dy){m.vx=dx/dt;m.vy=dy/dt;m.last=now;m.left=m.el.scrollLeft;m.top=m.el.scrollTop;}}
    function releaseMomentum(cancel=false){
      const m=momentum;momentum=null;
      if(cancel||!m||performance.now()-m.last>90)return;
      let vx=m.allowX?Math.max(-3,Math.min(3,m.vx)):0,vy=m.allowY?Math.max(-3,Math.min(3,m.vy)):0,last=performance.now();
      function step(now){const dt=Math.min(32,now-last);last=now;const x=m.el.scrollLeft,y=m.el.scrollTop;m.el.scrollLeft+=vx*dt;m.el.scrollTop+=vy*dt;if(Math.abs(m.el.scrollLeft-x)<0.1)vx=0;if(Math.abs(m.el.scrollTop-y)<0.1)vy=0;const decay=Math.exp(-dt/180);vx*=decay;vy*=decay;if(Math.hypot(vx,vy)>0.015)coastFrame=requestAnimationFrame(step);else coastFrame=0;}
      if(Math.hypot(vx,vy)>0.015)coastFrame=requestAnimationFrame(step);
    }
    function scrollTarget(target){
      let allowX=true,allowY=true,candidate=null;
      for(let el=target;el&&el.nodeType===1;el=el.parentElement){
        const style=getComputedStyle(el),action=style.touchAction;
        if(action==='none'){allowX=false;allowY=false;}
        else if(action.includes('pan-x')&&!action.includes('pan-y'))allowY=false;
        else if(action.includes('pan-y')&&!action.includes('pan-x'))allowX=false;
        if(!candidate&&((/auto|scroll/.test(style.overflowX)&&el.scrollWidth>el.clientWidth)||(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight)))candidate=el;
      }
      return candidate?{el:candidate,allowX,allowY}:null;
    }
    addEventListener('blur',()=>{stopCoast();momentum=null;if(pinch){pinch.targets.forEach((target,i)=>target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:700+i,pointerType:'touch',isPrimary:i===0})));pinch=null;}if(held){held.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true}));held=null;}});
    for(const type of ['pointerover','pointerout','pointerenter','pointerleave','mouseover','mouseout','mouseenter','mouseleave','mousemove','wheel'])document.addEventListener(type,e=>{e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();},true);

    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>{
      if(e.pointerType!=='mouse')return;
      if(type==='pointerdown')beginMomentum(e.target);
      if(type==='pointerdown' && e.button===0 && (e.metaKey||e.shiftKey)){
        const translate=!e.metaKey,inverse=e.metaKey&&e.shiftKey,offset=inverse?60:12;
        const center={x:e.clientX-offset,y:e.clientY};
        pinch={center,inverse,translate,targets:[e.target,document.elementFromPoint(e.clientX-2*offset,e.clientY)||e.target]};
      }
      if(pinch){
        e.stopImmediatePropagation();e.preventDefault();
        if(pinch.translate){pinch.center={x:e.clientX-12,y:e.clientY};}
        const p=pinch,dx=e.clientX-p.center.x,dy=e.clientY-p.center.y,distance=Math.hypot(dx,dy);
        const radius=p.inverse?Math.max(12,120-distance):distance;
        const firstX=p.center.x+(distance>0.001?dx/distance:1)*radius,firstY=p.center.y+(distance>0.001?dy/distance:0)*radius;
        for(let i=0;i<2;i++){
          const x=i?2*p.center.x-firstX:firstX,y=i?2*p.center.y-firstY:firstY;
          p.targets[i].dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerType:'touch',pointerId:700+i,isPrimary:i===0,clientX:x,clientY:y,button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1,pressure:type==='pointerup'?0:0.5}));
        }
        sampleMomentum();
        if(type==='pointerup'||type==='pointercancel'){releaseMomentum(type==='pointercancel');pinch=null;}
        return;
      }
      if(type==='pointerdown'){if(e.button!==0){e.stopImmediatePropagation();e.preventDefault();return;}held=e.target;const area=scrollTarget(held);pan=area?{...area,x:e.clientX,y:e.clientY,left:area.el.scrollLeft,top:area.el.scrollTop,moving:false}:null;}
      if(!held){e.stopImmediatePropagation();e.preventDefault();return;}
      if(type==='pointermove' && !e.buttons){const target=held;held=null;target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:e.pointerId,pointerType:'touch',isPrimary:true}));e.stopImmediatePropagation();e.preventDefault();return;}
      const target=(type==='pointerdown'||type==='pointerup'||type==='pointercancel'||held.hasPointerCapture?.(e.pointerId))?held:(document.elementFromPoint(e.clientX,e.clientY)||held);
      const touch=new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:e.pointerId,pointerType:'touch',isPrimary:true,button:e.button,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pressure:type==='pointerup'?0:.5,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey});
      e.stopImmediatePropagation();e.preventDefault();target.dispatchEvent(touch);
      if(type==='pointermove'&&pan&&!touch.defaultPrevented){
        const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
        if((pan.allowX&&Math.abs(dx)>8)||(pan.allowY&&Math.abs(dy)>8)){
          if(!pan.moving){held.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:e.pointerId,pointerType:'touch',isPrimary:true}));pan.moving=true;}
          if(pan.allowX)pan.el.scrollLeft=pan.left-dx;
          if(pan.allowY)pan.el.scrollTop=pan.top-dy;
        }
      }
      if(type==='pointerdown'&&target.matches?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,[contenteditable=true]'))target.focus({preventScroll:true});
      sampleMomentum();
      if(type==='pointerup'||type==='pointercancel'){releaseMomentum(type==='pointercancel');held=null;pan=null;}
    },true);
    """
}
let app=NSApplication.shared;let host=Host();app.delegate=host;app.run()
