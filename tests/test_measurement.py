import sys,tempfile,unittest
from pathlib import Path
import cv2,numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'measurement'))
from calibrate import generate
from measure import measure
from PIL import Image
class Pipeline(unittest.TestCase):
 def test_patterns(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp);generate(128,278,3,out)
   self.assertEqual(len(list(out.glob('*.png'))),7)
   self.assertEqual(set(np.unique(Image.open(out/'bw-1.png'))),{False,True})
   self.assertTrue(np.all(np.asarray(Image.open(out/'white.png'))==255))
 def test_perspective_rectification(self):
  with tempfile.TemporaryDirectory() as tmp:
   out=Path(tmp);im=np.zeros((850,1400,3),np.uint8);cv2.rectangle(im,(120,150),(1220,700),(230,230,230),-1);cv2.rectangle(im,(120,350),(160,500),(0,0,0),-1);cv2.imwrite(str(out/'white.png'),im)
   mask=measure(out/'white.png',1101,551,out/'result',threshold=120)
   self.assertEqual(mask.shape,(551,1101));self.assertEqual(mask[275,20],0);self.assertEqual(mask[275,500],255)
if __name__=='__main__':unittest.main()
