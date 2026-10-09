"""GENERIC garage-office — assembled headless in Blender, exported as one GLB for the
steven.com-style chalk pipeline (src/garage). Blender coords: Z up, the web camera sits
at (0, -3, 0.91) looking at (0, 0, 0.8) (= three.js (0, .91, 3) -> (0, .8, 0)).
People face -Y (towards the camera) by default.

Run:  blender -b --python scene.py -- [preview] [export]"""
import bpy, bmesh, glob, math, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from people_lib import build_person, rot, finalize  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KEEP_MATS = 'photos' in ARGS  # the photo shoot needs the real textures; the web export strips them
OUT_GLB = os.path.join(HERE, 'out', 'garage.glb')
OUT_AO = os.path.join(HERE, 'out', 'ground-ao.png')
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
os.makedirs(os.path.join(HERE, 'prev'), exist_ok=True)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SC = bpy.context.scene
PROPS = bpy.data.collections.new('props')
SC.collection.children.link(PROPS)


# ---------------------------------------------------------------- props
def prop(asset, name, loc, rz=0.0, scale=1.0, keep=None, drop=None, max_polys=7000, rx=0.0, ry=0.0):
    """import a Poly Haven glTF, keep/drop sub-meshes by name, join into ONE object,
    rest it on its own base (min z = 0 before placing), decimate if heavy, place it."""
    g = glob.glob(os.path.join(HERE, 'ph', asset, '*.gltf'))[0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=g)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = []
    for o in new:
        ok = o.type == 'MESH'
        if ok and keep is not None:
            ok = any(k in o.name for k in keep)
        if ok and drop is not None:
            ok = not any(k in o.name for k in drop)
        if ok:
            meshes.append(o)
    bpy.context.view_layer.update()
    # un-parent + bake transforms so the join keeps world placement
    for o in meshes:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
    for o in new:
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = name
    for c in ob.users_collection:
        c.objects.unlink(ob)
    PROPS.objects.link(ob)
    # base at z = 0, centred in xy
    pts = [Vector(v.co) for v in ob.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    off = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    ob.data.transform(Matrix.Translation(-off))
    ob.data.transform(Matrix.Scale(scale, 4))
    n = len(ob.data.polygons)
    if n > max_polys:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = max_polys / n
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier='dec')
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)))
    ob.location = Vector(loc)
    if not KEEP_MATS:
        for mat_slot in ob.material_slots:
            mat_slot.material = None
    return ob


def top_z(ob):
    bpy.context.view_layer.update()
    return max((ob.matrix_world @ v.co).z for v in ob.data.vertices)


# desk block — centre stage, turned three-quarters to the camera
DESK_RZ = -78
desk = prop('metal_office_desk', 'desk', (-0.3, 0.5, 0.0), rz=DESK_RZ)
DESK_TOP = top_z(desk)
dm = Matrix.Translation(desk.location) @ Euler((0, 0, math.radians(DESK_RZ))).to_matrix().to_4x4()


def on_desk(asset, name, lx, ly, rz=0.0, **kw):
    p = dm @ Vector((lx, ly, 0))
    return prop(asset, name, (p.x, p.y, DESK_TOP), rz=DESK_RZ + rz, **kw)


on_desk('classic_laptop', 'laptop', 0.05, 0.12, rz=0, scale=0.8, keep=['classic_laptop', 'classic_laptop_screen'], drop=['stand'])
on_desk('desk_lamp_arm_01', 'desk_lamp', -0.78, 0.28, rz=150)
on_desk('vintage_stapler', 'stapler', 0.55, -0.12, rz=-20)
on_desk('office_notepads', 'notepad', 0.42, 0.2, rz=12, keep=['a4_stack'])
on_desk('rubber_duck_toy', 'duck', -0.52, -0.2, rz=205, scale=0.36)
on_desk('potted_plant_04', 'plant', -0.84, -0.22, rz=0)
on_desk('clipboard', 'desk_clipboard', -0.25, -0.25, rz=35)

CHAIR_RZ_FIX = 180  # turns the monobloc's back away from the desk

# left: storage wall
prop('steel_frame_shelves_01', 'shelves', (-2.35, 1.35, 0), rz=62, scale=0.1)
prop('cardboard_box_01', 'box_a', (-1.75, 0.35, 0), rz=18, max_polys=1500)
b = prop('cardboard_box_01', 'box_b', (-1.72, 0.37, 0.34), rz=-9, max_polys=1500)
prop('cardboard_box_01', 'box_c', (-1.3, 0.05, 0), rz=41, max_polys=1500)
prop('metal_tool_chest', 'tool_chest', (-2.0, -0.35, 0), rz=70)
prop('ladder_sectioned_01', 'ladder', (-1.55, 2.05, 0.0), rz=-35, rx=-12)
prop('plastic_crate_01', 'crate', (-1.05, -0.55, 0), rz=-14)
prop('WetFloorSign_01', 'wet_floor', (-1.35, -0.45, 0), rz=-35)

# right: the covered car + garage junk
prop('covered_car', 'car', (3.05, 2.2, 0), rz=-58)
prop('old_tyre', 'tyre', (2.05, 0.75, 0), rz=-50, rx=-14)
prop('wooden_stool_01', 'stool', (1.2, -0.95, 0), rz=10)
t = prop('metal_toolbox', 'toolbox', (1.2, -0.95, 0.44), rz=-25)
prop('plastic_jerrycan', 'jerrycan', (1.85, 0.25, 0), rz=35)
prop('tire_pump', 'tire_pump', (1.6, -0.75, 0), rz=-10)

# the light over the desk: bare industrial lamp hanging from nowhere (steven's boom mic)
lamp = prop('hanging_industrial_lamp', 'hanging_lamp', (-0.15, 0.6, 1.62))

# ---------------------------------------------------------------- people
import poses  # noqa: E402

people = []


def person_to_props(p):
    for c in list(p.users_collection):
        c.objects.unlink(p)
    PROPS.objects.link(p)
    if not KEEP_MATS:
        for s_ in p.material_slots:
            s_.material = None


# the agency: one man, typing. Feet flat on the floor puts his thighs at seat height.
rig, body = build_person('employee', gender=1.0, age=0.42, weight=0.55, muscle=0.5, height=0.55,
                         clothes=('male_casualsuit04', 'shoes02'), hair='short02',
                         skin='young_caucasian_male' if KEEP_MATS else None)
poses.typing(rig)
emp = finalize(rig, 'employee')
bpy.context.view_layer.update()
emp.data.transform(Matrix.Translation((0, 0, -min(v.co.z for v in emp.data.vertices))))
emp.rotation_mode = 'XYZ'
emp.rotation_euler = Euler((0, 0, math.radians(DESK_RZ)))
seat = dm @ Vector((0.02, 0.62, 0))
emp.location = (seat.x, seat.y, 0)
person_to_props(emp)
people.append(emp)

# the leadership team: standing by the car with a clipboard
rig, body = build_person('manager', gender=0.0, age=0.55, weight=0.5, muscle=0.45, height=0.55,
                         clothes=('female_elegantsuit01', 'shoes05'), hair='bob01',
                         skin='middleage_african_female' if KEEP_MATS else None)
poses.clipboard(rig)
bpy.context.view_layer.update()
hand_local = rig.matrix_world @ rig.pose.bones['wrist.R'].tail
mgr = finalize(rig, 'manager')
MGR_RZ = -62
mgr.rotation_mode = 'XYZ'
mgr.rotation_euler = Euler((0, 0, math.radians(MGR_RZ)))
mgr.location = (1.2, 0.5, 0)
person_to_props(mgr)
people.append(mgr)
bpy.context.view_layer.update()

# his chair: seat centre a little behind his hip line
cp = dm @ Vector((0.02, 0.74, 0))
chair = prop('plastic_monobloc_chair_01', 'chair', (cp.x, cp.y, 0), rz=DESK_RZ + CHAIR_RZ_FIX)

# the clipboard in her hand, tilted up toward her face (grip on its top edge)
clip = prop('clipboard', 'mgr_clipboard', (0, 0, 0))
clip.data.transform(Matrix.Translation((0, 0.12, 0)))
bpy.context.view_layer.update()
clip.location = mgr.matrix_world @ hand_local
clip.rotation_euler = Euler((math.radians(58), 0, math.radians(MGR_RZ)))

# ---------------------------------------------------------------- ground + baked AO
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
for c in list(ground.users_collection):
    c.objects.unlink(ground)
PROPS.objects.link(ground)


def bake_ao():
    img = bpy.data.images.new('ground_ao', 1024, 1024, alpha=False)
    mat = bpy.data.materials.new('ground')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    bsdf = nt.nodes['Principled BSDF']
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    nt.nodes.active = tex
    ground.data.materials.clear()
    ground.data.materials.append(mat)
    SC.render.engine = 'CYCLES'
    SC.cycles.samples = 128
    SC.cycles.device = 'CPU'
    SC.world = SC.world or bpy.data.worlds.new('w')
    SC.world.use_nodes = True
    SC.world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
    SC.world.light_settings.distance = 2.2
    bpy.ops.object.select_all(action='DESELECT')
    ground.select_set(True)
    bpy.context.view_layer.objects.active = ground
    bpy.ops.object.bake(type='AO', margin=4)
    img.filepath_raw = OUT_AO
    img.file_format = 'PNG'
    img.save()


# ---------------------------------------------------------------- preview from the web camera
def preview(path):
    SC.render.engine = 'BLENDER_WORKBENCH'
    SC.display.shading.light = 'STUDIO'
    SC.display.shading.color_type = 'SINGLE'
    SC.display.shading.show_cavity = True
    SC.render.resolution_x, SC.render.resolution_y = 1600, 900
    cd = bpy.data.cameras.new('web')
    cd.sensor_fit = 'VERTICAL'
    cd.angle_y = math.radians(67)
    cam = bpy.data.objects.new('web', cd)
    SC.collection.objects.link(cam)
    cam.location = Vector((0, -3, 0.91))
    cam.rotation_euler = (Vector((0, 0, 0.8)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    SC.camera = cam
    SC.render.filepath = path
    bpy.ops.render.render(write_still=True)
    # top-down layout check
    cam.location = Vector((0, 0.5, 9))
    cam.rotation_euler = (0, 0, 0)
    SC.render.filepath = path.replace('.png', '_top.png')
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


if 'preview' in ARGS:
    preview(os.path.join(HERE, 'prev', 'scene.png'))

if 'export' in ARGS:
    bake_ao()
    for o in PROPS.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True,
                              export_apply=True, export_texcoords=True, export_normals=True,
                              export_materials='EXPORT', export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6, export_yup=True)
    print('EXPORTED', OUT_GLB, os.path.getsize(OUT_GLB))

if 'photos' in ARGS:
    import shoot
    shoot.run()
