import bpy, sys, math
src, out, deg = sys.argv[sys.argv.index('--')+1:]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=src)
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
d=ob.dimensions; print('DIM', [round(x,3) for x in d])
# the strap runs along the longest axis; bend it gently round the widest of the other two
m=ob.modifiers.new('bend','SIMPLE_DEFORM'); m.deform_method='BEND'; m.angle=math.radians(float(deg))
long_i=max(range(3), key=lambda i:d[i]); others=[i for i in range(3) if i!=long_i]
m.deform_axis='XYZ'[max(others, key=lambda i:d[i])]
bpy.context.view_layer.objects.active=ob; bpy.ops.object.modifier_apply(modifier='bend')
print('DIM2', [round(x,3) for x in ob.dimensions], 'axis', m.deform_axis if False else 'XYZ'[max(others, key=lambda i:d[i])])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
