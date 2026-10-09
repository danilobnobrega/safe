"""GENERIC studio — the one-person agency's workspace, for the chalk room (src/garage).
Professional, lived-in, nothing staged as a joke: the desk setup, and around it the
things that are really his (chess mid-game, road bike, running shoes, racket, a shelf
of trophies/medals/certificates).

Blender coords: Z up; web camera at (0, -3, 0.91) looking at (0, 0, 0.8).
Run: blender -b --python studio.py -- [preview] [export] [photos] [color]"""
import bpy, glob, math, os, sys
from mathutils import Vector, Matrix, Euler

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from people_lib import build_person, finalize  # noqa: E402
import poses  # noqa: E402
import custom_props as cp  # noqa: E402

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KEEP_MATS = 'photos' in ARGS or 'color' in ARGS
OUT_GLB = os.path.join(HERE, 'out', 'garage.glb')
OUT_AO = os.path.join(HERE, 'out', 'ground-ao.png')
OUT_COLOR = os.path.join(HERE, 'out', 'garage-color.glb')
os.makedirs(os.path.join(HERE, 'out'), exist_ok=True)
os.makedirs(os.path.join(HERE, 'prev'), exist_ok=True)

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
SC = bpy.context.scene
PROPS = bpy.data.collections.new('props')
SC.collection.children.link(PROPS)


def to_props(ob):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    PROPS.objects.link(ob)
    if not KEEP_MATS:
        for s in ob.material_slots:
            s.material = None
    return ob


def place(ob, loc, rz=0.0, rx=0.0, ry=0.0, scale=1.0):
    if scale != 1.0:
        ob.data.transform(Matrix.Scale(scale, 4))
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = Euler((math.radians(rx), math.radians(ry), math.radians(rz)))
    ob.location = Vector(loc)
    return to_props(ob)


def import_ph(asset, keep=None, drop=None):
    g = glob.glob(os.path.join(HERE, 'ph', asset, '*.gltf'))[0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=g)
    new = [o for o in bpy.data.objects if o not in before]
    out = []
    bpy.context.view_layer.update()
    for o in new:
        ok = o.type == 'MESH' and (keep is None or any(k in o.name for k in keep)) and (drop is None or not any(k in o.name for k in drop))
        if ok:
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
            out.append(o)
    for o in new:
        if o not in out:
            bpy.data.objects.remove(o, do_unlink=True)
    return out


def join_base(objs, name, max_polys=7000):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = name
    pts = [v.co for v in ob.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ob.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    n = len(ob.data.polygons)
    if n > max_polys:
        m = ob.modifiers.new('dec', 'DECIMATE')
        m.ratio = max_polys / n
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier='dec')
    return ob


def ph(asset, name, loc, rz=0.0, scale=1.0, keep=None, drop=None, max_polys=7000, rx=0.0):
    return place(join_base(import_ph(asset, keep, drop), name, max_polys), loc, rz=rz, rx=rx, scale=scale)


def local(parent_loc, parent_rz, lx, ly, z=0.0):
    p = Euler((0, 0, math.radians(parent_rz))).to_matrix() @ Vector((lx, ly, 0))
    return Vector((parent_loc[0] + p.x, parent_loc[1] + p.y, z))


# ================================================================== desk block
# user sits on the desk's -Y side facing +Y; DESK_RZ turns him to face camera-left (profile)
DESK_LOC, DESK_RZ = (-0.25, 0.62), 102
place(cp.desk(), (*DESK_LOC, 0), rz=DESK_RZ)
TOP = 0.74


def on_desk(ob, lx, ly, rz=0.0, **kw):
    return place(ob, local(DESK_LOC, DESK_RZ, lx, ly, TOP), rz=DESK_RZ + rz, **kw)


on_desk(cp.monitor(), 0.0, 0.2)
on_desk(cp.laptop(), -0.5, -0.02, rz=14)
on_desk(cp.keyboard(), 0.0, -0.18)
on_desk(cp.mouse(), 0.26, -0.18)
on_desk(cp.mug(), 0.52, -0.02, rz=40)
on_desk(cp.notebook(), -0.26, -0.24, rz=-8)
on_desk(join_base(import_ph('potted_plant_04'), 'plant'), 0.66, 0.22)
on_desk(join_base(import_ph('desk_lamp_arm_01'), 'desk_lamp'), 0.7, 0.3, rz=205)
# (the duck is gone — Danilo, 2026-10-07)

# pendant over the desk
ph('modern_ceiling_lamp_01', 'pendant', (DESK_LOC[0], DESK_LOC[1], 1.68), scale=0.8)

# ================================================================== him
rig, body = build_person('employee', gender=1.0, age=0.42, weight=0.55, muscle=0.5, height=0.55,
                         clothes=('male_casualsuit04', 'shoes02'), hair='short02',
                         skin='young_caucasian_male' if KEEP_MATS else None)
poses.typing(rig)
emp = finalize(rig, 'employee')
bpy.context.view_layer.update()
emp.data.transform(Matrix.Translation((0, 0, -min(v.co.z for v in emp.data.vertices))))
# MakeHuman faces -Y; he must face the desk's +Y
place(emp, local(DESK_LOC, DESK_RZ, 0.0, -0.68), rz=DESK_RZ + 180)
bpy.context.view_layer.update()
_inv = Euler((0, 0, math.radians(-DESK_RZ))).to_matrix()
_back = min((_inv @ ((emp.matrix_world @ v.co) - Vector((*DESK_LOC, 0))))[1]
            for v in emp.data.vertices if 0.6 < (emp.matrix_world @ v.co).z < 1.0)
print('BACK Y', _back)
# chair faces away from the desk; its backrest front face is 0.245 m behind the seat centre
place(cp.office_chair(), local(DESK_LOC, DESK_RZ, 0.0, _back + 0.245 - 0.01), rz=DESK_RZ + 180)

# ================================================================== shelf: the proof
# turned to face the camera and pulled toward the centre (the edges of the frame are blurred)
SHELF_LOC, SHELF_RZ = (-1.75, 1.2), 25
shelf = ph('steel_frame_shelves_01', 'shelves', (*SHELF_LOC, 0), rz=SHELF_RZ, scale=0.1)


def shelf_levels(ob):
    """z of each board: heights where a lot of vertices sit (the flat boards)"""
    from collections import Counter
    c = Counter(round(v.co.z, 2) for v in ob.data.vertices)
    zs = sorted(z for z, n in c.items() if n >= 40)
    groups = []
    for z in zs:
        if not groups or z - groups[-1][-1] > 0.15:
            groups.append([z])
        else:
            groups[-1].append(z)
    return [max(g) for g in groups]              # the TOP surface of each board, not its underside


LEVELS = shelf_levels(shelf)
bpy.context.view_layer.update()
sx = max(v.co.x for v in shelf.data.vertices) - min(v.co.x for v in shelf.data.vertices)
print('SHELF LEVELS', LEVELS, 'WIDTH', sx)


def on_shelf(ob, level, lx, ly=0.0, rz=0.0, **kw):
    z = LEVELS[min(level, len(LEVELS) - 1)] + 0.002
    return place(ob, local(SHELF_LOC, SHELF_RZ, lx * sx, ly, z), rz=SHELF_RZ + rz, **kw)


# few, big, clear silhouettes — one idea per board
on_shelf(cp.trophy(0.42), 3, -0.22, 0.02)
on_shelf(cp.trophy(0.32), 3, 0.2, 0.02, rz=20)
on_shelf(cp.certificate(), 2, -0.18, 0.06)
on_shelf(cp.chess_king(0.36), 2, 0.25, 0.02)
on_shelf(cp.books(), 1, -0.05, 0.03)
on_shelf(cp.racket_bag(), 0, 0.0, 0.02)
for lx in (-0.3, -0.05, 0.2):                        # medals hanging off the front edge of board 2
    m = cp.medal_big()
    on_shelf(m, 2, lx, -0.26)
    m.location.z -= 0.29
# the racket leaning on the shelf's left upright (the right one sits behind the desk)
# upside down: head on the floor, grip up, butt cap touching the front-left upright.
# Measured, not guessed: tilt the racket in its own plane, then slide it until its highest
# point touches the upright's outer face (both in shelf-local coordinates).
RK_T = 12.0
rk = cp.racket()
rk.data.transform(Matrix.Rotation(math.pi, 4, 'Y'))                    # head down
rk.data.transform(Matrix.Rotation(math.radians(RK_T), 4, 'Y'))         # lean toward +x (the shelf)
rk.data.transform(Matrix.Translation((0, 0, -min(v.co.z for v in rk.data.vertices))))
top_z = max(v.co.z for v in rk.data.vertices)
tip_x = max(v.co.x for v in rk.data.vertices if v.co.z > top_z - 0.03)
sv = [v.co for v in shelf.data.vertices]
front_y = min(p.y for p in sv)
upright_x = min(p.x for p in sv if p.y < front_y + 0.05 and 0.3 < p.z < 1.0)
upright_y = sum(p.y for p in sv if p.y < front_y + 0.05 and 0.3 < p.z < 1.0 and p.x < upright_x + 0.04) / max(1, len([1 for p in sv if p.y < front_y + 0.05 and 0.3 < p.z < 1.0 and p.x < upright_x + 0.04]))
print('RACKET contact', upright_x, tip_x, top_z, upright_y)
place(rk, local(SHELF_LOC, SHELF_RZ, upright_x - tip_x - 0.001, upright_y - 0.03, 0.0), rz=SHELF_RZ)
ph('potted_plant_02', 'floor_plant', (-0.95, 2.1, 0), rz=30, max_polys=9000)

# ================================================================== chess, mid-game
TABLE_LOC = (1.05, -0.3)
ph('side_table_01', 'side_table', (*TABLE_LOC, 0), rz=-20)
TABLE_TOP = 0.55
FEN = 'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N1P/PP1P1PP1/RNBQR1K1'  # Closed Ruy Lopez, 9.h3


def chess_board():
    objs = import_ph('chess_set')
    board = next(o for o in objs if o.name.startswith('board'))
    pieces = [o for o in objs if o is not board]
    bpy.context.view_layer.update()

    def c(o):
        return sum((o.matrix_world @ Vector(b) for b in o.bound_box), Vector()) / 8
    wp = [c(o) for o in pieces if 'pawn_white' in o.name]
    bp = [c(o) for o in pieces if 'pawn_black' in o.name]
    white_y, black_y = sum(p.y for p in wp) / 8, sum(p.y for p in bp) / 8
    xs = sorted(p.x for p in wp)
    sq = (xs[-1] - xs[0]) / 7
    x0 = xs[0] if white_y < black_y else xs[-1]
    fdir = 1 if white_y < black_y else -1          # a->h direction in x
    rdir = 1 if black_y > white_y else -1          # rank 1->8 direction in y
    y_r2 = white_y

    def square(file, rank):
        return Vector((x0 + fdir * file * sq, y_r2 + rdir * (rank - 2) * sq, 0))
    pool = {}
    for o in pieces:
        n = o.name.split('.')[0]
        kind, color = n.split('_')[1], n.split('_')[2]
        pool.setdefault((kind, color), []).append(o)
    letter = {'p': 'pawn', 'n': 'knight', 'b': 'bishop', 'r': 'rook', 'q': 'queen', 'k': 'king'}
    used = set()
    for r_i, row in enumerate(FEN.split('/')):
        rank, file = 8 - r_i, 0
        for ch in row:
            if ch.isdigit():
                file += int(ch)
                continue
            color = 'white' if ch.isupper() else 'black'
            o = pool[(letter[ch.lower()], color)].pop()
            pc = c(o)
            tgt = square(file, rank)
            o.location += Vector((tgt.x - pc.x, tgt.y - pc.y, 0))
            used.add(o.name)
            file += 1
    for o in pieces:                                 # nothing captured in this line; drop leftovers
        if o.name not in used:
            bpy.data.objects.remove(o, do_unlink=True)
    return join_base([board] + [o for o in pieces if o.name in used], 'chess', max_polys=30000)


place(chess_board(), (*TABLE_LOC, TABLE_TOP), rz=-20 + 90)

# ================================================================== training
BIKE_LOC, BIKE_RZ = (1.95, 1.45), 166   # rear wheel + trainer on the right, clear of the chess table
LIFT = 0.045                                            # rear tyre sits up on the roller, front on the riser
place(cp.road_bike(), (BIKE_LOC[0], BIKE_LOC[1], LIFT), rz=BIKE_RZ)
place(cp.trainer(axle_h=0.34 + LIFT), local(BIKE_LOC, BIKE_RZ, -0.495, 0.0, 0.0), rz=BIKE_RZ)
place(cp.riser_block(), local(BIKE_LOC, BIKE_RZ, 0.495, 0.0, 0.0), rz=BIKE_RZ)

# ================================================================== ground + AO, preview, export, photos
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, 0))
ground = bpy.context.active_object
ground.name = 'ground'
to_props(ground)


def bake_ao():
    img = bpy.data.images.new('ground_ao', 1024, 1024, alpha=False)
    mat = bpy.data.materials.new('ground')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
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
    SC.camera = cam
    for suffix, loc, look in (('', (0, -3, 0.91), (0, 0, 0.8)), ('_close', (0.4, -1.6, 1.1), (0.2, 0.6, 0.75)),
                              ('_top', (0, 0.5, 9), None),
                              ('_shelf', (-0.82, -0.79, 1.0), (-1.75, 1.2, 0.85))):
        cam.location = Vector(loc)
        cam.rotation_euler = (0, 0, 0) if look is None else (Vector(look) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        SC.render.filepath = path.replace('.png', f'{suffix}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


if 'preview' in ARGS:
    preview(os.path.join(HERE, 'prev', 'studio.png'))

if 'export' in ARGS:
    bake_ao()
    for o in PROPS.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_yup=True)
    print('EXPORTED', OUT_GLB, os.path.getsize(OUT_GLB))

if 'photos' in ARGS:
    import shoot_studio
    shoot_studio.run()

if 'color' in ARGS:
    # the same set with its real materials (Poly Haven textures, MakeHuman skin/clothes, the
    # photo shoot's flat materials on the hand-built props) — for the page's click-to-focus.
    # Same geometry as garage.glb, so it lines up; textures down to 512 px JPEG
    import shoot_studio
    shoot_studio.materials()
    for img in bpy.data.images:
        if img.size[0] > 512 or img.size[1] > 512:
            k = 512 / max(img.size[0], img.size[1])
            img.scale(max(1, int(img.size[0] * k)), max(1, int(img.size[1] * k)))
    bpy.ops.object.select_all(action='DESELECT')
    for o in PROPS.objects:
        if o.name != 'ground':
            o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT_COLOR, export_format='GLB', use_selection=True, export_apply=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT',
                              export_image_format='JPEG', export_jpeg_quality=80,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_yup=True)
    print('EXPORTED', OUT_COLOR, os.path.getsize(OUT_COLOR))

