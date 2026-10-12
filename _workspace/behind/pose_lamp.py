# Pose Poly Haven's desk_lamp_arm_01 lower (its rig's top-position control), bake it into three rigid
# parts with their pivots, and export for /hero-paper*:
#   lamp_base    the clamp/holder — stays put
#   lamp_swivel  everything that turns on the base pivot (arms, springs, wires) — origin at that pivot
#   lamp_head    the shade and its button — origin at the top pivot, child of the swivel
#   blender -b lamp.blend -P pose_lamp.py -- <out.glb> <headY> <headZ> [preview.png]
import bpy, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, HY, HZ = argv[0], float(argv[1]), float(argv[2])
PREVIEW = argv[3] if len(argv) > 3 else None

rig = bpy.data.objects['rig_lamp']
pb = rig.pose.bones['ctrl_top-position']
rest = rig.data.bones['ctrl_top-position'].matrix_local
pb.matrix = Matrix.Translation(Vector((0, HY, HZ))) @ Matrix(rest.to_3x3()).to_4x4()
bpy.context.view_layer.update()

dg = bpy.context.evaluated_depsgraph_get()
HEAD = {'geo_lamp-head', 'geo_lamp-head-button'}
BASE = {'geo_pivot-holder'}
groups = {'lamp_base': [], 'lamp_swivel': [], 'lamp_head': []}
for o in list(bpy.data.objects):
    if o.type not in ('MESH',) or o.name.startswith('wdg_'):
        continue
    ev = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, depsgraph=dg)
    me.transform(o.matrix_world)
    n = bpy.data.objects.new(o.name + '_baked', me)
    bpy.context.scene.collection.objects.link(n)
    key = 'lamp_head' if o.name in HEAD else 'lamp_base' if o.name in BASE else 'lamp_swivel'
    groups[key].append(n)

# pivots, from the posed rig (armature space -> world)
def bone_head(name):
    return rig.matrix_world @ rig.pose.bones[name].head
piv_swivel = bone_head('def_lamp-base-pivot')
piv_head = bone_head('def_lamp_head')
print('PIVOTS', tuple(round(x, 3) for x in piv_swivel), tuple(round(x, 3) for x in piv_head))

# everything else out
for o in list(bpy.data.objects):
    if not o.name.endswith('_baked'):
        bpy.data.objects.remove(o)
made = {}
for key, objs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = key
    j.data.materials.clear()
    pivot = {'lamp_base': piv_swivel, 'lamp_swivel': piv_swivel, 'lamp_head': piv_head}[key]
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    made[key] = j
# hierarchy: head under swivel (keep transforms)
h, s = made['lamp_head'], made['lamp_swivel']
h.parent = s
h.matrix_parent_inverse = s.matrix_world.inverted()
for o in made.values():
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    print('PART', o.name, len(o.data.polygons), [round(min(v[i] for v in bb), 3) for i in range(3)], [round(max(v[i] for v in bb), 3) for i in range(3)])

if PREVIEW:
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.render.resolution_x, sc.render.resolution_y = 500, 500
    bpy.ops.object.camera_add(location=(1.4, -1.0, 0.6), rotation=(math.radians(80), 0, math.radians(55)))
    sc.camera = bpy.context.object
    sc.render.filepath = PREVIEW
    bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=False, export_apply=True, export_materials='NONE')
print('WROTE', OUT)
