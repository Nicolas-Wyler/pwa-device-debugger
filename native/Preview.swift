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
        addSubview(stage);stage.addSubview(web);stage.addSubview(keyboard);stage.addSubview(home);stage.addSubview(fade)
        if let imagePath=config.keyboardPath {keyboard.image=NSImage(contentsOfFile:imagePath)}
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
        // Portrait screenshot: 1035 native pixels / 3 = 345 CSS pixels, including accessory bar.
        // No landscape keyboard image is inferred from a portrait-only reference.
        keyboard.frame=NSRect(x:0,y:0,width:phone.width,height:345)
        keyboard.isHidden = !keyboardShown || landscape || keyboard.image == nil
        home.frame=web.frame;home.needsDisplay=true
        home.isHidden = !keyboard.isHidden
    }
}
final class Host:NSObject,NSApplicationDelegate,NSWindowDelegate,WKScriptMessageHandler {
    var windows:[NSWindow]=[];var views:[WKWebView]=[];var shells:[Shell]=[]
    var reports:[String:[String:Any]]=[:]
    var baselines:[String:[String:Any]]=[:]
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage){
        if message.name == "keyboard",let data=message.body as? [String:Any],let orientation=data["orientation"] as? String,let visible=data["visible"] as? Bool {
            let i=orientation == "portrait" ? 0:1
            if shells.indices.contains(i){shells[i].keyboardShown=visible;shells[i].layoutSubtreeIfNeeded()}
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
        else if let old=reports[orientation] {for key in ["inputIdleEvents","inputEvents"] {checked[key]=old[key]}}
        reports[orientation]=checked;print("CHECK \(data)");fflush(stdout)
        if config.verify {try? JSONSerialization.data(withJSONObject:reports,options:[.prettyPrinted,.sortedKeys]).write(to:URL(fileURLWithPath:config.output+"/verification.json"))}
    }
    func applicationDidFinishLaunching(_ notification:Notification){
        NSApp.setActivationPolicy(.regular)
        let menu=NSMenu();let appMenu=NSMenuItem();menu.addItem(appMenu);let submenu=NSMenu();submenu.addItem(withTitle:"Quit",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q");appMenu.submenu=submenu;NSApp.mainMenu=menu
        for (i,orientation) in ["portrait","landscape"].enumerated(){
            let landscape=orientation=="landscape"
            let settings=WKWebViewConfiguration();settings.websiteDataStore = .nonPersistent();settings.mediaTypesRequiringUserActionForPlayback=[]
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
            windows.append(window);views.append(web);window.makeKeyAndOrderFront(nil)
            web.load(URLRequest(url:URL(string:config.url)!))
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
                        window.webkit.messageHandlers.report.postMessage({orientation:'\(i==0 ? "portrait":"landscape")',width:innerWidth,height:innerHeight,dpr:devicePixelRatio,inputIdleEvents:idle,inputEvents:seen});probe.remove();report();
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
    let held=null;
    addEventListener('blur',()=>{if(held){held.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'touch',isPrimary:true}));held=null;}});
    for(const type of ['pointerover','pointerout','pointerenter','pointerleave','mouseover','mouseout','mouseenter','mouseleave','mousemove','wheel'])document.addEventListener(type,e=>{e.stopImmediatePropagation();if(e.cancelable)e.preventDefault();},true);

    for(const type of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(type,e=>{
      if(e.pointerType!=='mouse')return;
      if(type==='pointerdown'){if(e.button!==0){e.stopImmediatePropagation();e.preventDefault();return;}held=e.target;}
      if(!held){e.stopImmediatePropagation();e.preventDefault();return;}
      if(type==='pointermove' && !e.buttons){const target=held;held=null;target.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:e.pointerId,pointerType:'touch',isPrimary:true}));e.stopImmediatePropagation();e.preventDefault();return;}
      const target=(type==='pointerdown'||type==='pointerup'||type==='pointercancel'||held.hasPointerCapture?.(e.pointerId))?held:(document.elementFromPoint(e.clientX,e.clientY)||held);
      const touch=new PointerEvent(type,{bubbles:true,cancelable:true,composed:true,pointerId:e.pointerId,pointerType:'touch',isPrimary:true,button:e.button,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY,screenX:e.screenX,screenY:e.screenY,pressure:type==='pointerup'?0:.5,ctrlKey:e.ctrlKey,metaKey:e.metaKey,shiftKey:e.shiftKey,altKey:e.altKey});
      e.stopImmediatePropagation();e.preventDefault();target.dispatchEvent(touch);
      if(type==='pointerdown'&&target.matches?.('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),textarea,[contenteditable=true]'))target.focus({preventScroll:true});
      if(type==='pointerup'||type==='pointercancel')held=null;
    },true);
    """
}
let app=NSApplication.shared;let host=Host();app.delegate=host;app.run()
