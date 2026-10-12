# A sheet of paper crumpled into a ball, simulated (Blender cloth) and baked into shape keys, for
# /hero-paper.html: the drag scrubs through them. Run headless:
#   blender -b -P tools/behind/crumple.py -- <out.glb> [preview_dir]
# The sheet is A4 landscape (297 x 210 mm), its UVs the whole print. Paper-like cloth: stiff to
# bend (sharp creases, few soft folds), no stretch; pulled to its centre by an attracting force
# field, self-colliding so it piles up into a ball instead of collapsing to a point.
import bpy, sys, os, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'crumple.glb'
PREVIEW = argv[1] if len(argv) > 1 else None
FRAMES = int(os.environ.get('FRAMES', 90))
KEYS = int(os.environ.get('KEYS', 30))  # shape keys baked (evenly over the frames)
RES = int(os.environ.get('RES', 72))  # grid cuts along the long side
BEND = float(os.environ.get('BEND', 2.0))
PULL = float(os.environ.get('PULL', -6.0))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, FRAMES
scene.gravity = (0, 0, 0)

W, H = 0.297, 0.210
bpy.ops.mesh.primitive_grid_add(x_subdivisions=RES, y_subdivisions=round(RES * H / W), size=1)
sheet = bpy.context.object
sheet.name = 'paper'
sheet.scale = (W, H, 1)
bpy.ops.object.transform_apply(scale=True)
# a slight random lift so the collapse isn't perfectly symmetric (real paper never is)
import random
random.seed(7)
for v in sheet.data.vertices:
    v.co.z += (random.random() - 0.5) * float(os.environ.get('JIT', 0.0002))

cloth = sheet.modifiers.new('cloth', 'CLOTH')
s = cloth.settings
s.quality = int(os.environ.get('Q', 20))
s.mass = 0.08
s.air_damping = 4.0
s.tension_stiffness = 80
s.compression_stiffness = 80
s.shear_stiffness = 80
s.bending_stiffness = BEND
s.bending_model = os.environ.get('BM', 'LINEAR')
s.tension_damping = 10
s.bending_damping = 2
s.effector_weights.gravity = 0
c = cloth.collision_settings
c.use_self_collision = True
c.self_distance_min = 0.0018
c.distance_min = 0.002
c.collision_quality = 4
cloth.point_cache.frame_start, cloth.point_cache.frame_end = 1, FRAMES

# MODE=shrink: the sheet shrinks into itself (self-colliding, so it bunches up into a ball);
# MODE=pull: an attracting field at the centre does it
MODE = os.environ.get('MODE', 'shrink')
if MODE == 'shrink':
    s.shrink_min = 0.0
    s.keyframe_insert('shrink_min', frame=1)
    s.shrink_min = float(os.environ.get('SHRINK', 0.75))
    s.keyframe_insert('shrink_min', frame=int(FRAMES * 0.8))
# the hands: an attracting field at the centre, ramping up
bpy.ops.object.effector_add(type='FORCE', location=(0, 0, 0))
f = bpy.context.object
f.field.strength = 0
f.field.flow = 1.0
f.field.falloff_type = 'SPHERE'
f.field.falloff_power = 0
f.field.keyframe_insert('strength', frame=1)
f.field.strength = PULL if MODE == 'pull' else 0
f.field.keyframe_insert('strength', frame=int(FRAMES * 0.6))

# bake by stepping, grabbing each key frame's evaluated shape
coords = []
pick = [round(1 + (FRAMES - 1) * k / (KEYS - 1)) for k in range(KEYS)]
for fr in range(1, FRAMES + 1):
    scene.frame_set(fr)
    if fr in pick:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = sheet.evaluated_get(dg)
        coords.append([v.co.copy() for v in ev.data.vertices])
print('[crumple] baked', len(coords), 'keys')

sheet.modifiers.remove(cloth)
bpy.data.objects.remove(f)
sheet.shape_key_add(name='flat')
for k, co in enumerate(coords[1:], 1):
    kb = sheet.shape_key_add(name=f'c{k:02d}')
    for i, v in enumerate(co):
        kb.data[i].co = v
bpy.ops.object.shade_flat()

if PREVIEW:
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = 480, 360
    bpy.ops.object.camera_add(location=(0.0, -0.42, 0.42), rotation=(math.radians(45), 0, 0))
    scene.camera = bpy.context.object
    keys = sheet.data.shape_keys.key_blocks
    for k in [0, 5, 10, 15, 20, 25, KEYS - 1]:
        for kb in keys[1:]:
            kb.value = 0
        if k:
            keys[k].value = 1
        scene.render.filepath = os.path.join(PREVIEW, f'k{k:02d}.png')
        bpy.ops.render.render(write_still=True)
    for kb in keys[1:]:
        kb.value = 0

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_morph=True, export_morph_normal=False, use_selection=False, export_apply=False)
print('[crumple] wrote', OUT)
