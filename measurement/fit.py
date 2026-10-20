from pathlib import Path
import cv2,numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
import matplotlib;matplotlib.use('Agg')
import matplotlib.pyplot as plt
import argparse
parser=argparse.ArgumentParser(description='Fit identical axis-locked corners, straight edges and a mirrored left notch. Input must be landscape with notch on the left.')
parser.add_argument('--measurement',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--name',default='Measured phone');parser.add_argument('--scale',type=float,default=3)
args=parser.parse_args();p=args.output;p.mkdir(parents=True,exist_ok=True);m=np.load(args.measurement)['screen_mask'];raw=max(cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_NONE)[0],key=cv2.contourArea).reshape(-1,2).astype(float)
W,H=float(m.shape[1]-1),float(m.shape[0]-1)
# Fit in reference coordinates, then scale exported segments to the input dimensions.
originalW,originalH=W,H
raw*=np.array([2777/W,1283/H]);W,H=2777.,1283.
def bez(q,n=140):
 t=np.linspace(0,1,n)[:,None];a,b,c,d=q;return (1-t)**3*a+3*(1-t)**2*t*b+3*(1-t)*t*t*c+t**3*d
pool=[]
for fx,fy in [(False,False),(True,False),(False,True),(True,True)]:
 v=raw.copy();v[:,0]=W-v[:,0] if fx else v[:,0];v[:,1]=H-v[:,1] if fy else v[:,1];pool.append(v[(v[:,0]<210)&(v[:,1]<210)])
pool=np.vstack(pool)
def corner(v):
 r,k=v;return np.array([[0,r],[0,r*(1-k)],[r*(1-k),0],[r,0]])
def err(v):return cKDTree(bez(corner(v),500)).query(pool)[0]
f=least_squares(err,[170,.55],bounds=([100,.3],[220,.8]));r,k=f.x
# Fit the two notch transitions jointly under reflection across the long axis.
notch=raw[(raw[:,0]<150)&(raw[:,1]>240)&(raw[:,1]<1040)].copy();notch[:,1]=np.minimum(notch[:,1],H-notch[:,1]);notch=notch[notch[:,1]<480]
def notchCurves(v):
 a,d,s,dy,span=v
 q1=np.array([[0,a],[0,a+dy],[s*.3,a+dy],[s,a+dy]])
 q2=np.array([[s,a+dy],[d,a+dy],[d,a+span*.45],[d,a+span]])
 return [q1,q2]
def ne(v):
 qs=notchCurves(v);a,d,s,dy,span=v
 samples=np.vstack([bez(q,200) for q in qs]+[np.array([[d,y] for y in np.linspace(a+span,H/2,200)])])
 return cKDTree(samples).query(notch)[0]
nf=least_squares(ne,[310,100,25,12,90],bounds=([270,70,5,2,40],[350,130,55,35,130]),max_nfev=150)
a,d,s,dy,span=nf.x
segments=[]
def curve(q):segments.append(('Bézier',np.asarray(q)))
def line(a,b):segments.append(('Line',np.array([a,b],float)))
q=corner(f.x)
curve(q);line([r,0],[W-r,0]);curve(np.column_stack([W-q[::-1,0],q[::-1,1]]));line([W,r],[W,H-r]);curve(np.column_stack([W-q[:,0],H-q[:,1]]));line([W-r,H],[r,H]);curve(np.column_stack([q[::-1,0],H-q[::-1,1]]));line([0,H-r],[0,H-a])
for qn in notchCurves(nf.x):curve(np.column_stack([qn[:,0],H-qn[:,1]]))
line([d,H-(a+span)],[d,a+span])
for qn in notchCurves(nf.x)[::-1]:curve(qn[::-1])
line([0,a],[0,r])
# Verify every Bézier endpoint handle is axis-aligned.
for kind,q in segments:
 if len(q)==4:
  for delta in [q[1]-q[0],q[2]-q[3]]:
   assert abs(delta[0])<1e-8 or abs(delta[1])<1e-8, delta
# Figure: common corners, straight physical sides, reflected notch, explicit nodes.
fig=plt.figure(figsize=(16,10));gs=fig.add_gridspec(2,3,height_ratios=[1.25,1]);axes=[fig.add_subplot(gs[0,:]),fig.add_subplot(gs[1,0]),fig.add_subplot(gs[1,1]),fig.add_subplot(gs[1,2])]
for ax in axes:
 ax.plot(raw[:,0],raw[:,1],color='#8da3b8',lw=.9,label='Raw measured outline')
 for i,(kind,q) in enumerate(segments):
  v=bez(q) if len(q)==4 else q
  ax.plot(v[:,0],v[:,1],color='#df6b18',lw=1.4,label='Constrained fit' if i==0 else None)
  ax.plot(q[[0,-1],0],q[[0,-1],1],'o',ms=4,mfc='white',mec='#b73a12',zorder=5,label='Endpoints / joins' if i==0 else None)
  if len(q)==4:
   ax.plot(q[:2,0],q[:2,1],color='#39815c',lw=.7);ax.plot(q[2:,0],q[2:,1],color='#39815c',lw=.7)
   ax.plot(q[1:3,0],q[1:3,1],'s',ms=3,color='#39815c',label='Axis-locked control nodes' if i==0 else None)
 ax.axhline(H/2,color='#777',ls=':',lw=.7);ax.set_aspect('equal');ax.set_xlabel('Reference x (pixels; 2778 × 1284)');ax.set_ylabel('Reference y (pixels; 2778 × 1284)')
axes[0].set_ylim(H+50,-50);axes[0].legend(loc='center',ncol=2);axes[0].set_title('Locked horizontal / vertical handles • shared corners • mirror symmetry • straight edges')
axes[1].set_xlim(-15,230);axes[1].set_ylim(230,-15);axes[1].set_title('Corner curve and control nodes (all four identical)')
axes[2].set_xlim(-15,145);axes[2].set_ylim(1040,240);axes[2].set_title('Symmetric notch and transition nodes')
axes[3].set_xlim(1600,1980);axes[3].set_ylim(1305,1220);axes[3].set_title('Edge artifact replaced by a straight line')
fig.suptitle(f'H/V-locked Bézier model | shared corner extent {r:.1f} px | corner Bézier factor {k:.4f}',fontsize=14)
fig.text(.03,.015,'Measured image trace is the reference, not a certified hardware drawing. Node locations are fitted; symmetry and straight edges are imposed physical constraints.',fontsize=10)
fig.tight_layout(rect=[0,.04,1,.96]);fig.savefig(p/'axis-locked-boundary-nodes.png',dpi=180)
import json
(p/'segments.json').write_text(json.dumps([{'type':kind,'points':(q*np.array([originalW/W,originalH/H])).tolist()} for kind,q in segments],indent=2))
print('corner',f.x,'notch',nf.x)

profile={'name':args.name,'width':m.shape[0]/args.scale,'height':m.shape[1]/args.scale,'nativeWidth':m.shape[0],'nativeHeight':m.shape[1],'minimumDensity':2,'segments':'segments.json','safeAreas':{'portrait':[47,0,34,0],'landscape':[0,47,21,47]},'provenance':'Photo approximation. Safe areas are placeholder profile inputs: verify or edit for your device.'}
(p/'profile.json').write_text(json.dumps(profile,indent=2))
