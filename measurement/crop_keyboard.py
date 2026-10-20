"""Extract a keyboard + accessory bar screenshot without copying any app content."""
import argparse,json
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser(description=__doc__);p.add_argument('screenshot',type=Path);p.add_argument('--top',type=int,required=True);p.add_argument('--scale',type=float,default=3);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
im=Image.open(a.screenshot)
if not 0<a.top<im.height:raise ValueError('top must fall inside screenshot')
a.output.parent.mkdir(parents=True,exist_ok=True);im.crop((0,a.top,im.width,im.height)).save(a.output)
a.output.with_suffix('.json').write_text(json.dumps({'cropTop':a.top,'width':im.width,'height':im.height-a.top,'cssHeight':(im.height-a.top)/a.scale,'scale':a.scale},indent=2))
