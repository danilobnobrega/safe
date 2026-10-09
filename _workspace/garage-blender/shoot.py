"""The photo ring's content: a deadpan corporate photo shoot of the garage itself.
24 stills of the same scene, real textures + the CC0 'garage' HDRI, rendered with
EEVEE at 1024x576 into prev/photos/NN.png (then packed into the 4x6 atlas)."""
import bpy, math, os
from mathutils import Vector

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, 'prev', 'photos')
RES = (1024, 576)  # the studio shoot switches this to portrait

# (object to frame, azimuth deg (0 = from -Y, the web camera side), elevation deg, distance m, lens mm, target z-offset)
SHOTS = [
    ('employee', 35, 8, 2.1, 50, 0.1),      # 0 the agency at work
    ('duck', 20, 12, 0.55, 85, 0.0),       # 1 the mascot
    ('stapler', -30, 25, 0.5, 85, 0.0),    # 2 infrastructure
    ('manager', -25, 4, 2.2, 50, 0.25),     # 3 leadership
    ('laptop', -100, 14, 1.3, 50, 0.1),     # 4 the stack
    ('car', 25, 10, 5.0, 35, 0.0),          # 5 the fleet
    ('shelves', 20, 6, 3.0, 35, 0.0),       # 6 storage solutions
    ('tool_chest', -20, 22, 1.4, 50, 0.0),  # 7 tooling
    ('wet_floor', 10, 10, 1.2, 50, 0.0),    # 8 compliance
    ('hanging_lamp', 0, -40, 1.6, 35, 0.0), # 9 lighting design
    ('desk', 0, 18, 3.6, 35, 0.2),          # 10 the headquarters
    ('plant', 30, 15, 0.6, 85, 0.0),        # 11 wellness program
    ('chair', 160, 14, 1.4, 50, 0.0),       # 12 ergonomics
    ('tyre', -40, 12, 1.3, 50, 0.0),        # 13 R&D
    ('toolbox', 25, 20, 1.2, 50, 0.0),      # 14 toolbox (literal)
    ('ladder', 15, 10, 2.8, 35, 0.0),       # 15 career ladder
    ('box_a', -30, 18, 1.8, 50, 0.2),       # 16 logistics
    ('crate', 40, 25, 1.1, 50, 0.0),        # 17 inventory
    ('employee', 12, 4, 1.0, 85, 0.45),     # 18 portrait: the agency
    ('manager', -60, 3, 0.9, 85, 0.7),      # 19 portrait: leadership
    ('jerrycan', 35, 15, 0.9, 50, 0.0),     # 20 energy
    ('manager', 20, 5, 3.2, 35, 0.3),       # 21 leadership, on site
    ('desk_lamp', -60, 20, 1.3, 50, 0.1),   # 22 ideas
    ('desk', 30, 55, 6.5, 28, 0.0),         # 23 the campus
]


def bbox_center(ob):
    pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return sum(pts, Vector()) / 8


def setup_world():
    sc = bpy.context.scene
    world = sc.world or bpy.data.worlds.new('w')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    env.image = bpy.data.images.load(os.path.join(HERE, 'garage_2k.hdr'))
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = 1.9
    out = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])


def floor_material(ground):
    mat = bpy.data.materials.new('floor_concrete')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.32, 0.31, 0.29, 1)
    bsdf.inputs['Roughness'].default_value = 0.8
    ground.data.materials.clear()
    ground.data.materials.append(mat)


def run():
    os.makedirs(OUT, exist_ok=True)
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    sc.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in engines else 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    setup_world()
    floor_material(bpy.data.objects['ground'])
    cd = bpy.data.cameras.new('shoot')
    cam = bpy.data.objects.new('shoot', cd)
    sc.collection.objects.link(cam)
    sc.camera = cam
    for i, (name, az, el, dist, lens, dz) in enumerate(SHOTS):
        ob = bpy.data.objects.get(name)
        if ob is None:
            print('SHOT missing', name)
            continue
        t = bbox_center(ob) + Vector((0, 0, dz))
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = t + d * dist
        cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cd.lens = lens
        sc.render.filepath = os.path.join(OUT, f'{i:02d}.png')
        bpy.ops.render.render(write_still=True)
        print('SHOT', i, name)
