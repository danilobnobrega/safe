import bpy, sys
from mathutils import Vector
f=sys.argv[sys.argv.index('--')+1]; out=sys.argv[sys.argv.index('--')+2]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=f)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=sc.render.resolution_y=420
cd=bpy.data.cameras.new('c'); cd.lens=50; cam=bpy.data.objects.new('c',cd); sc.collection.objects.link(cam); sc.camera=cam
cam.location=Vector((0.09,-0.12,0.05)); cam.rotation_euler=(Vector((0,0,0))-cam.location).to_track_quat('-Z','Y').to_euler()
sc.render.filepath=out; bpy.ops.render.render(write_still=True)
