import bpy, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from people_lib import build_person, render_preview

for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
import addon_utils  # noqa
rig, body = build_person('guy')
bpy.context.view_layer.update()
print('RIG', rig.name, 'dims', tuple(round(x, 3) for x in body.dimensions))
for o in rig.children_recursive:
    print('CHILD', o.name, o.type, [m.type for m in o.modifiers])
render_preview(os.path.join(os.path.dirname(__file__), 'prev', 'tpose.png'))
