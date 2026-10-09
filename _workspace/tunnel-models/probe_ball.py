import bpy, os, time, bmesh
HERE=os.path.dirname(__file__)
t=time.time()
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE,'tennis_ball_2','model.glb'))
ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
print('T import', round(time.time()-t,1), 'objs', len(ms), 'mats', len({m.name for o in ms for m in o.data.materials if m}), flush=True)
for o in ms:
    print('  ', o.name, len(o.data.polygons), [m.name for m in o.data.materials if m][:3], flush=True) if len(o.data.polygons)>20000 else None
big=sorted(ms,key=lambda o:-len(o.data.polygons))[:3]
print('T done', flush=True)
