import bpy, sys, os
from mathutils import Vector
f=sys.argv[sys.argv.index('--')+1]; out=sys.argv[sys.argv.index('--')+2]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=f)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'
sc.render.resolution_x=sc.render.resolution_y=700
pts=[o.matrix_world@v.co for o in sc.objects if o.type=='MESH' for v in o.data.vertices]
c=sum(pts,Vector())/len(pts); r=max((p-c).length for p in pts)
cd=bpy.data.cameras.new('c'); cam=bpy.data.objects.new('c',cd); sc.collection.objects.link(cam); sc.camera=cam
for i,d in enumerate([(0.3,-0.4,2.4),(2.2,0.2,0.8),(-2.2,0.2,0.8),(0.2,2.2,1.2)]):
    cam.location=c+Vector(d).normalized()*r*2.6; cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler()
    sc.render.filepath=out.replace('.png',f'_{i}.png'); bpy.ops.render.render(write_still=True)
