"""Photo ring for the studio scene: 24 stills with real textures (Poly Haven props,
MakeHuman skin/clothes) + simple materials on the hand-built props, CC0 'garage' HDRI."""
import bpy, math, os
from mathutils import Vector
import shoot  # reuse world/camera helpers

HERE = os.path.dirname(__file__)

MATS = {  # object name prefix -> (base colour, metallic, roughness); longer prefixes first
    'racket_bag': ((0.55, 0.03, 0.03), 0.0, 0.45),
    'desk': ((0.55, 0.42, 0.30), 0.0, 0.5), 'monitor': ((0.02, 0.02, 0.02), 0.2, 0.3),
    'laptop_modern': ((0.55, 0.56, 0.58), 0.9, 0.3), 'keyboard': ((0.08, 0.08, 0.09), 0.0, 0.6),
    'mouse': ((0.9, 0.9, 0.9), 0.0, 0.4), 'mug': ((0.92, 0.92, 0.9), 0.0, 0.2),
    'notebook': ((0.05, 0.05, 0.05), 0.0, 0.7), 'office_chair': ((0.03, 0.03, 0.03), 0.1, 0.6),
    'road_bike': ((0.04, 0.04, 0.05), 0.6, 0.25), 'bike_stand': ((0.1, 0.1, 0.1), 0.8, 0.4),
    'racket': ((0.02, 0.02, 0.02), 0.3, 0.4), 'trophy': ((0.9, 0.7, 0.3), 1.0, 0.2),
    'medal': ((0.85, 0.65, 0.25), 1.0, 0.25), 'certificate': ((0.85, 0.82, 0.74), 0.0, 0.6),
    'racket_bag': ((0.55, 0.03, 0.03), 0.0, 0.45), 'books': ((0.12, 0.16, 0.25), 0.0, 0.7),
    'chess_king': ((0.02, 0.02, 0.02), 0.2, 0.15), 'trainer': ((0.05, 0.05, 0.05), 0.5, 0.4),
    'riser': ((0.05, 0.05, 0.05), 0.0, 0.6),
}

SHOTS = [
    ('employee', 62, 14, 2.0, 50, 0.15),     # 0 at work, over the shoulder
    ('monitor', 118, 10, 1.3, 50, 0.1),      # 1 the setup
    ('keyboard', 100, 72, 1.0, 35, 0.0),     # 2 the desk from above
    ('chess', 10, 40, 0.9, 50, 0.0),         # 3 the game
    ('road_bike', 5, 8, 2.4, 50, -0.1),      # 4 the bike
    ('trophy_42', 25, 6, 1.6, 85, 0.0),      # 5 trophy
    ('duck', -140, 12, 0.5, 85, 0.0),        # 6 the duck
    ('mug', 70, 25, 0.6, 85, 0.0),           # 7 coffee
    ('employee', -150, 4, 1.0, 85, 0.45),    # 8 portrait
    ('shelves', 25, 6, 2.8, 35, 0.0),        # 9 the shelf
    ('racket', 25, 4, 1.3, 50, 0.1),         # 10 racket
    ('medal', 25, 4, 1.2, 85, -0.05),       # 11 medals
    ('road_bike', -25, 28, 1.3, 50, 0.25),   # 12 frame detail
    ('laptop_modern', 118, 30, 0.8, 50, 0.0), # 13 laptop
    ('plant', -110, 10, 0.5, 85, 0.0),       # 14 desk plant
    ('desk_lamp', -40, 10, 1.1, 50, 0.1),    # 15 lamp
    ('chess', 120, 18, 0.7, 85, 0.0),        # 16 the game, low
    ('road_bike', 60, 15, 1.4, 50, 0.1),     # 17 cockpit
    ('office_chair', 60, 10, 1.6, 50, 0.0),  # 18 chair
    ('racket_bag', 25, 12, 1.3, 50, 0.0),       # 19 pendant
    ('books', 25, 8, 0.9, 50, 0.0),          # 20 books
    ('desk', -30, 30, 3.0, 35, 0.2),         # 21 the desk, wide
    ('floor_plant', 20, 10, 1.8, 50, 0.0),   # 22 plant
    ('desk', 0, 55, 6.0, 28, 0.0),           # 23 overview
]


def materials():
    for ob in bpy.data.objects:
        if ob.type != 'MESH' or ob.material_slots and any(s.material for s in ob.material_slots):
            continue
        for pre, (col, met, rough) in MATS.items():
            if ob.name.startswith(pre):
                m = bpy.data.materials.new(pre)
                m.use_nodes = True
                b = m.node_tree.nodes['Principled BSDF']
                b.inputs['Base Color'].default_value = (*col, 1)
                b.inputs['Metallic'].default_value = met
                b.inputs['Roughness'].default_value = rough
                ob.data.materials.clear()
                ob.data.materials.append(m)
                break


def run():
    materials()
    shoot.SHOTS[:] = SHOTS
    # portrait 9:16 for the vertical-columns layout; lenses shortened so the subject still fits
    shoot.RES = (576, 1024)
    shoot.OUT = os.path.join(HERE, 'prev', 'photos_v')
    shoot.SHOTS[:] = [(n, az, el, d, max(24, lens * 0.62), dz) for (n, az, el, d, lens, dz) in SHOTS]
    shoot.run()
