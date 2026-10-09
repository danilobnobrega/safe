from PIL import Image
order=['G','E','N','E2','R','I','C','dot']
rows=[0,3,5,1]
G=Image.new('RGB',(8*170,len(rows)*230),(25,25,25))
for r,p in enumerate(rows):
  for c,g in enumerate(order):
    im=Image.open(f'glyphs2/p{p}_{g}.png'); im.thumbnail((165,225)); G.paste(im,(c*170+2,r*230+2),im)
G.save('zoom_dark2.png')
