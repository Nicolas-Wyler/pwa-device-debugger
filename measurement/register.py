"""Match a photographed noise pattern to its known reference using SIFT/RANSAC."""
import argparse,json
from pathlib import Path
import cv2,numpy as np
p=argparse.ArgumentParser(description=__doc__);p.add_argument('--photo',type=Path,required=True);p.add_argument('--reference',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--rotate',type=int,choices=[0,90,180,270],default=0);a=p.parse_args()
ref=cv2.imread(str(a.reference),0);photo=cv2.imread(str(a.photo),0)
if ref is None or photo is None:raise ValueError('Cannot decode photo/reference')
if a.rotate:ref=np.rot90(ref,a.rotate//90).copy()
sift=cv2.SIFT_create(nfeatures=10000);kr,dr=sift.detectAndCompute(ref,None);kp,dp=sift.detectAndCompute(photo,None)
if dr is None or dp is None:raise ValueError('Not enough reference texture')
matches=cv2.BFMatcher().knnMatch(dr,dp,k=2);good=[v[0] for v in matches if len(v)==2 and v[0].distance<.7*v[1].distance]
if len(good)<12:raise ValueError('Too few matches; check rotation, focus and reference selection')
x=np.float32([kr[m.queryIdx].pt for m in good]);y=np.float32([kp[m.trainIdx].pt for m in good]);H,inliers=cv2.findHomography(x,y,cv2.RANSAC,3)
if H is None or inliers.sum()<12:raise ValueError('No reliable homography')
e=np.linalg.norm(cv2.perspectiveTransform(x[None],H)[0]-y,axis=1);ok=inliers.ravel()>0
a.output.mkdir(parents=True,exist_ok=True);np.save(a.output/'reference-to-photo.npy',H)
(a.output/'registration.json').write_text(json.dumps({'inliers':int(ok.sum()),'median_error_camera_px':float(np.median(e[ok])),'p95_error_camera_px':float(np.percentile(e[ok],95)),'note':'Fitting residual is not physical-boundary accuracy.'},indent=2))
cv2.imwrite(str(a.output/'registered-photo.png'),cv2.warpPerspective(photo,np.linalg.inv(H),(ref.shape[1],ref.shape[0])))
