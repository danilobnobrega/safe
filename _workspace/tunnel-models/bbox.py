import bpy, sys, os
n=sys.argv[sys.argv.index('--')+1]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(os.path.dirname(__file__), n, 'model.glb'))
bpy.context.view_layer.update()
pts=[o.matrix_world @ v.co for o in bpy.context.scene.objects if o.type=='MESH' for v in o.data.vertices]
mn=[min(p[i] for p in pts) for i in range(3)]; mx=[max(p[i] for p in pts) for i in range(3)]
print('BBOX', n, [round(mx[i]-mn[i],3) for i in range(3)], 'faces', sum(len(o.data.polygons) for o in bpy.context.scene.objects if o.type=='MESH'))
