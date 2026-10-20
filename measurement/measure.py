"""Rectify a bright screen photo and extract its boundary. Inspect outputs before fitting."""
import argparse,json
from pathlib import Path
import cv2,numpy as np

def measure(source,width,height,output,threshold=None,quad=None,roi=None):
 im=cv2.imread(str(source));
 if im is None:raise ValueError('Cannot decode input. Extract HEIC to PNG first.')
 gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
 if threshold is None:_,mask=cv2.threshold(gray,0,255,cv2.THRESH_BINARY+cv2.THRESH_OTSU)
 else:_,mask=cv2.threshold(gray,threshold,255,cv2.THRESH_BINARY)
 if roi:
  x,y,w,h=roi;restrict=np.zeros_like(mask);restrict[y:y+h,x:x+w]=255;mask=cv2.bitwise_and(mask,restrict)
 contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)
 if not contours:raise ValueError('No bright screen found. Specify --threshold/--roi.')
 c=max(contours,key=cv2.contourArea).reshape(-1,2).astype(float)
 if quad is None:
  box=cv2.boxPoints(cv2.minAreaRect(c.astype(np.float32)));box=box[np.argsort(box[:,1])];t=box[:2][np.argsort(box[:2,0])];b=box[2:][np.argsort(box[2:,0])];rough=np.array([t[0],t[1],b[1],b[0]],np.float32)
  dest=np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32)
  H=cv2.getPerspectiveTransform(rough,dest);q=cv2.perspectiveTransform(c[None].astype(np.float32),H)[0]
  def line(sel):
   if sel.sum()<15:raise ValueError('Too few straight-edge points. Use --quad.')
   vx,vy,x,y=cv2.fitLine(c[sel].astype(np.float32),cv2.DIST_HUBER,0,.01,.01).ravel();return np.array([-vy,vx,vy*x-vx*y])
  T=line((q[:,1]<height*.025)&(q[:,0]>width*.12)&(q[:,0]<width*.85));B=line((q[:,1]>height*.975)&(q[:,0]>width*.12)&(q[:,0]<width*.65));L=line((q[:,0]<width*.015)&(q[:,1]>height*.1)&(q[:,1]<height*.23));R=line((q[:,0]>width*.985)&(q[:,1]>height*.15)&(q[:,1]<height*.85))
  def cross(a,b):v=np.cross(a,b);return v[:2]/v[2]
  quad=np.array([cross(T,L),cross(T,R),cross(B,R),cross(B,L)],np.float32)
 quad=np.asarray(quad,np.float32).reshape(4,2)
 H=cv2.getPerspectiveTransform(quad,np.array([[0,0],[width-1,0],[width-1,height-1],[0,height-1]],np.float32))
 warped=cv2.warpPerspective(im,H,(width,height));raw=cv2.warpPerspective(mask,H,(width,height));cs,_=cv2.findContours(raw,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE);boundary=max(cs,key=cv2.contourArea)
 clean=np.zeros_like(raw);cv2.drawContours(clean,[boundary],-1,255,-1)
 output.mkdir(parents=True,exist_ok=True);cv2.imwrite(str(output/'rectified-white.png'),warped);cv2.imwrite(str(output/'screen-mask.png'),clean)
 overlay=warped.copy();cv2.drawContours(overlay,[boundary],-1,(0,0,255),2);cv2.imwrite(str(output/'boundary-check.png'),overlay)
 np.savez(output/'measurement.npz',homography=H,quadrilateral=quad,screen_mask=clean)
 (output/'measurement.json').write_text(json.dumps({'source':source.name,'width':width,'height':height,'quadrilateral':quad.tolist(),'threshold':threshold,'note':'Perspective rectification only. Lens distortion remains unless corrected separately. Check boundary-check.png.'},indent=2))
 return clean
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--white',type=Path,required=True);p.add_argument('--width',type=int,default=2778);p.add_argument('--height',type=int,default=1284);p.add_argument('--output',type=Path,required=True);p.add_argument('--threshold',type=int);p.add_argument('--quad',nargs=8,type=float);p.add_argument('--roi',nargs=4,type=int);a=p.parse_args();measure(a.white,a.width,a.height,a.output,a.threshold,a.quad,a.roi)
