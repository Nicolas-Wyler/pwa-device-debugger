"""Generate deterministic multiscale references. No camera or app access required."""
import argparse,json
from pathlib import Path
import numpy as np
from PIL import Image

def generate(width,height,count,output):
 output.mkdir(parents=True,exist_ok=True)
 seeds=[]
 for i in range(count):
  seed=20261031+i;seeds.append(seed);rng=np.random.default_rng(seed)
  sizes=[max(2,round(width*f)) for f in [1/10,1/20,1/40,1/80,1/160,1/320,1/640]]
  yy,xx=np.indices((height,width));distance=np.minimum.reduce([xx,yy,width-1-xx,height-1-yy])
  detail=6*np.maximum(0,1-distance/(width*.405))**1.5;lo=np.minimum(5,detail.astype(int));fraction=detail-lo
  layers=[]
  for cell in sizes:
   w=(width+cell-1)//cell;h=(height+cell-1)//cell
   base=Image.fromarray(rng.integers(0,256,(h,w),dtype=np.uint8))
   layers.append(np.asarray(base.resize((w*cell,h*cell),Image.Resampling.NEAREST))[:height,:width])
  stack=np.stack(layers);a=np.take_along_axis(stack,lo[None],axis=0)[0];b=np.take_along_axis(stack,(lo+1)[None],axis=0)[0]
  value=a*(1-fraction)+b*fraction
  Image.fromarray(np.round(45+value*185/255).astype('uint8')).save(output/f'gray-{i+1}.png')
  Image.fromarray(np.where(value>=127.5,255,0).astype('uint8')).convert('1').save(output/f'bw-{i+1}.png')
 Image.new('RGB',(width,height),'white').save(output/'white.png')
 (output/'references.json').write_text(json.dumps({'width':width,'height':height,'seeds':seeds,'algorithm':'PCG64 multiscale, v1'},indent=2))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--width',type=int,default=1284);p.add_argument('--height',type=int,default=2778);p.add_argument('--count',type=int,default=3);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 if min(a.width,a.height)<32 or a.count<1:p.error('Dimensions must be >=32 and count >=1')
 generate(a.width,a.height,a.count,a.output)
