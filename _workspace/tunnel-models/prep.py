"""Prepare the Sketchfab models for the hero tunnel: real size (longest side, metres), centred,
decimated to a web budget, textures down to 1k, Draco GLB out.
Run: blender -b --python prep.py -- <name> <longest_m> <out_dir>"""
import bpy, sys, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
name, longest, out_dir = args[:3]
longest = float(longest)
HERE = os.path.dirname(__file__)
MAX_FACES = int(args[3]) if len(args) > 3 else 60000
MAX_TEX = int(os.environ.get('MAX_TEX', '1024'))

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE, name, 'model.glb'))
bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# optional 5th arg: keep only these objects (comma list) — e.g. a ball's core without its
# thousand modelled felt hairs, which no decimation survives
if len(args) > 4:
    keep = set(args[4].split(','))
    for o in [o for o in meshes if o.name not in keep]:
        bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']

# bake every transform in, drop empties / armatures
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# size + centre
pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
size = mx - mn
k = longest / max(size)
c = (mn + mx) / 2
for o in meshes:
    o.data.transform(__import__('mathutils').Matrix.Translation(-c))
    o.data.transform(__import__('mathutils').Matrix.Scale(k, 4))

# one object, then weld split seams (a model of loose pieces decimates into a crumpled mess)
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
meshes = [bpy.context.view_layer.objects.active]
import bmesh, time
if os.environ.get('RAW') != '1':
    _t = time.time()
    bm = bmesh.new()
    bm.from_mesh(meshes[0].data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=longest * 0.0005)
    bm.to_mesh(meshes[0].data)
    bm.free()
    print('WELD', round(time.time() - _t, 1), 's', flush=True)
# decimate to the budget
faces = sum(len(o.data.polygons) for o in meshes)
if faces > MAX_FACES:
    r = MAX_FACES / faces
    for o in meshes:
        m = o.modifiers.new('dec', 'DECIMATE')
        m.ratio = r
        m.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier='dec')

for img in bpy.data.images:
    if img.size[0] > MAX_TEX or img.size[1] > MAX_TEX:
        s = MAX_TEX / max(img.size[0], img.size[1])
        img.scale(max(1, int(img.size[0] * s)), max(1, int(img.size[1] * s)))

# one object: the export then makes one draw call per MATERIAL, not per loose piece
bpy.ops.object.select_all(action='DESELECT')
for o in meshes:
    o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
meshes = [bpy.context.view_layer.objects.active]
out = os.environ.get('OUTFILE') or os.path.join(out_dir, f"sf_{name}{os.environ.get('SUFFIX', '')}.glb")
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True,
                          export_image_format='JPEG', export_jpeg_quality=85,
                          export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('PREP', name, 'faces', faces, '->', sum(len(o.data.polygons) for o in meshes), 'size', [round(x * k, 3) for x in size], 'bytes', os.path.getsize(out))
