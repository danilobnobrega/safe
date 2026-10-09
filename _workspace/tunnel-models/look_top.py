import bpy, sys, os, math
from mathutils import Vector
f=sys.argv[sys.argv.index('--')+1]; out=sys.argv[sys.argv.index('--')+2]
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=f)
sc=bpy.context.scene; sc.render.engine='BLENDER_WORKBENCH'; sc.display.shading.light='STUDIO'; sc.display.shading.color_type='TEXTURE'; sc.render.resolution_x=sc.render.resolution_y=500
w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True; w.node_tree.nodes['Background'].inputs[1].default_value=1.0
pts=[o.matrix_world@v.co for o in sc.objects if o.type=='MESH' for v in o.data.vertices]
c=sum(pts,Vector())/len(pts); r=max((p-c).length for p in pts)
cd=bpy.data.cameras.new('c'); cam=bpy.data.objects.new('c',cd); sc.collection.objects.link(cam); sc.camera=cam
cam.location=c+Vector((r*0.6,-r*1.0,r*2.4)); cam.rotation_euler=(c-cam.location).to_track_quat('-Z','Y').to_euler()
l=bpy.data.lights.new('l','SUN'); l.energy=3; lo=bpy.data.objects.new('l',l); sc.collection.objects.link(lo); lo.rotation_euler=(0.8,0.2,0.6)
sc.render.filepath=out; bpy.ops.render.render(write_still=True)
