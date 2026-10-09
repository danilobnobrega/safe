import bpy, sys, os, math
from mathutils import Vector, Matrix
ratio=float(sys.argv[sys.argv.index('--')+1]); out=sys.argv[sys.argv.index('--')+2]
short=float(os.environ.get('SHORT','1'))  # how much of the fibres' length is kept
HERE=os.path.dirname(__file__)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE,'tennis_ball_2','model.glb'))
ms=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in ms:
    mw=o.matrix_world.copy(); o.parent=None; o.matrix_world=mw
for o in list(bpy.context.scene.objects):
    if o.type!='MESH': bpy.data.objects.remove(o, do_unlink=True)
# the felt patches: everything but the core
if ratio<1:
    for o in ms:
        if o.name=='Object_2': continue
        m=o.modifiers.new('d','DECIMATE'); m.ratio=ratio; m.use_collapse_triangulate=True
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='d')
# shorter felt: pull every fibre point toward the ball, keeping its direction — the part of it
# that stands out of the core shrinks to `short` of its length
if short<1:
    core=[o for o in ms if o.name=='Object_2'][0]
    cpts=[core.matrix_world@v.co for v in core.data.vertices]
    cc=sum(cpts,Vector())/len(cpts); rc=sum((p-cc).length for p in cpts)/len(cpts)
    for o in ms:
        if o is core: continue
        mw=o.matrix_world; inv=mw.inverted()
        for v in o.data.vertices:
            p=mw@v.co; d=p-cc; r=d.length
            if r>rc: v.co=inv@(cc+d.normalized()*(rc+(r-rc)*short))
bpy.ops.object.select_all(action='DESELECT')
for o in ms: o.select_set(True)
bpy.context.view_layer.objects.active=ms[0]; bpy.ops.object.join(); ob=bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
pts=[v.co for v in ob.data.vertices]; mn=Vector([min(p[i] for p in pts) for i in range(3)]); mx=Vector([max(p[i] for p in pts) for i in range(3)])
k=0.067/max(mx-mn); c=(mn+mx)/2
ob.data.transform(Matrix.Translation(-c)); ob.data.transform(Matrix.Scale(k,4))
for img in bpy.data.images:
    mt=int(os.environ.get('MAX_TEX','512'))
    if img.size[0]>mt: img.scale(mt,mt)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=False, export_apply=True, export_image_format='JPEG', export_jpeg_quality=85, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('FUZZ', ratio, 'faces', len(ob.data.polygons), 'bytes', os.path.getsize(out))
