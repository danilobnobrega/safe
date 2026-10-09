import bpy, os
from collections import Counter
HERE=os.path.dirname(__file__)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE,'tennis_ball_2','model.glb'))
ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
c=Counter(); n=Counter()
for o in ms:
    mat=o.data.materials[0].name if o.data.materials else '-'
    c[mat]+=len(o.data.polygons); n[mat]+=1
print('BYMAT', dict(c), dict(n))
sizes=sorted(((len(o.data.polygons), o.name, max(o.dimensions)) for o in ms), reverse=True)[:6]
print('BIG', [(f, nm, round(d,3)) for f,nm,d in sizes])
