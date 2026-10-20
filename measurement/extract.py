"""Extract full HEIC images, or sample separate Live Photo MOV companions."""
import argparse,json,subprocess
from pathlib import Path
from PIL import Image,ImageOps
import pillow_heif
p=argparse.ArgumentParser(description=__doc__);p.add_argument('files',nargs='+',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--fps',type=float,default=2);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True);report=[]
for source in a.files:
 if source.suffix.lower() in ['.mov','.mp4']:
  subprocess.run(['ffmpeg','-v','error','-i',str(source),'-vf',f'fps={a.fps}',str(a.output/(source.stem+'-motion-%04d.png'))],check=True)
  report.append({'file':source.name,'kind':'motion companion','fps':a.fps})
 elif source.suffix.lower() in ['.heic','.heif']:
  h=pillow_heif.open_heif(source)
  for i,frame in enumerate(h):
   im=Image.frombytes(frame.mode,frame.size,frame.data,'raw',frame.mode,frame.stride)
   im.save(a.output/f'{source.stem}-{i}.png')
  report.append({'file':source.name,'full_images':len(h),'note':'Tiled image items and gain maps are not motion frames. Supply MOV companion separately.'})
 else:
  im=ImageOps.exif_transpose(Image.open(source));im.save(a.output/f'{source.stem}-0.png');report.append({'file':source.name,'full_images':1})
(a.output/'extraction.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
