import bpy, sys, os
HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from people_lib import build_person, finalize, render_preview
import poses

which = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'typing'
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
if which == 'typing':
    rig, body = build_person('employee', gender=1.0, age=0.42, weight=0.55, height=0.55,
                             clothes=('male_casualsuit04', 'shoes02'), hair='short02')
    poses.typing(rig)
else:
    rig, body = build_person('manager', gender=0.0, age=0.55, weight=0.5, height=0.55,
                             clothes=('female_elegantsuit01', 'shoes05'), hair='bob02')
    poses.clipboard(rig)
p = finalize(rig, which)
print('DIMS', tuple(round(x, 3) for x in p.dimensions))
render_preview(os.path.join(HERE, 'prev', f'pose_{which}.png'), target=(0, 0, 0.8), dist=3.0,
               views=((0.35, -1), (1, 0), (0.7, 0.7)))
