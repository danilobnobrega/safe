import bpy, os, glob
from mathutils import Vector
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
root = os.path.join(os.path.dirname(__file__), 'ph')
for d in sorted(os.listdir(root)):
    g = glob.glob(os.path.join(root, d, '*.gltf'))[0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=g)
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    tris = sum(len(o.data.polygons) for o in ms)
    print(f'DIM {d:30s} size=({mx.x-mn.x:.2f},{mx.y-mn.y:.2f},{mx.z-mn.z:.2f}) minz={mn.z:.2f} meshes={len(ms)} polys={tris} names={[o.name for o in ms][:6]}')
    for o in new: bpy.data.objects.remove(o, do_unlink=True)
