from rembg import remove, new_session
from PIL import Image
import numpy as np, glob, os
os.makedirs('alpha', exist_ok=True)
sess = new_session('isnet-general-use')
for f in sorted(glob.glob('src/p*.jpg')):
    im = Image.open(f).convert('RGB')
    out = remove(im, session=sess, post_process_mask=True)
    out.save('alpha/' + os.path.basename(f).replace('.jpg', '.png'))
    a = np.array(out)[..., 3]
    print(f, 'alpha>128:', (a > 128).mean().round(3))
