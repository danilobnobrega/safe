from rembg import remove, new_session
from PIL import Image
import numpy as np, glob, os
os.makedirs('alpha', exist_ok=True)
sess = new_session('isnet-general-use')
for f in sorted(glob.glob('src/p*.jpg')):
    out = remove(Image.open(f).convert('RGB'), session=sess, post_process_mask=True)
    out.save('alpha/' + os.path.basename(f)[:-4] + '.png')
    print(f, out.size)
