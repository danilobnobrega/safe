import bpy
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
from mathutils import Vector
bpy.ops.import_scene.gltf(filepath="C:/Users/GETÚLIO/generic/public/hero/tunnel/sf_galaxy_watch.glb")
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]; me=ob.data
for i,m in enumerate(me.materials):
    if m:
        ps=[p for p in me.polygons if p.material_index==i]
        if not ps: continue
        c=sum((p.center for p in ps),Vector())/len(ps); n=sum((p.normal for p in ps),Vector()).normalized()
        d=[ (p.center-c).dot(n) for p in ps]
        print('MAT', m.name, 'faces', len(ps), 'centre', [round(x,4) for x in c], 'normal', [round(x,2) for x in n], 'depth range', round(min(d),5), round(max(d),5))
