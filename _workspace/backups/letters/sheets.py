from PIL import Image
import glob, os
ims=[Image.open(f).resize((640,365)) for f in sorted(glob.glob('dbg2/p*.jpg'))]
W=Image.new('RGB',(1280,1095))
for i,im in enumerate(ims): W.paste(im,((i%2)*640,(i//2)*365))
W.save('split_sheet.png')
order=['G','E','N','E2','R','I','C','dot']
G=Image.new('RGB',(8*140,6*140),(40,90,40))
for r in range(6):
  for c,g in enumerate(order):
    im=Image.open(f'glyphs/p{r}_{g}.png'); im.thumbnail((130,130)); G.paste(im,(c*140+5,r*140+5),im)
G.save('glyph_grid.png')
