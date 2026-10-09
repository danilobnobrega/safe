from PIL import Image
order=['G','E','N','E2','R','I','C','dot']
G=Image.new('RGB',(8*150,7*150),(25,25,25))
for r in range(7):
  for c,g in enumerate(order):
    im=Image.open(f'glyphs/p{r}_{g}.png'); im.thumbnail((145,145)); G.paste(im,(c*150+2,r*150+2),im)
G.save('grid.png')
