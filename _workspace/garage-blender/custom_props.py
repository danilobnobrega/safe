"""Hand-built props (no CC0 equivalent exists): clean hard-surface geometry for the
chalk shader. Every builder returns ONE joined object, base at z = 0, facing -Y
(the side a person sitting at it would face is +Y... see each docstring), centred in x/y.
Units: metres."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, Euler

_parts = []


def _add(ob, smooth=False):
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    _parts.append(ob)
    return ob


def box(sx, sy, sz, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object
    ob.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        m = ob.modifiers.new('b', 'BEVEL')
        m.width = bevel
        m.segments = segs
        bpy.ops.object.modifier_apply(modifier='b')
    return _add(ob)


def cyl(r, depth, loc=(0, 0, 0), rot=(0, 0, 0), verts=24, smooth=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts, location=loc, rotation=rot)
    return _add(bpy.context.active_object, smooth)


def torus(R, r, loc=(0, 0, 0), rot=(0, 0, 0), major=48, minor=10):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=major, minor_segments=minor,
                                     location=loc, rotation=rot)
    return _add(bpy.context.active_object, True)


def sphere(r, loc=(0, 0, 0), scale=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=seg, ring_count=seg // 2, location=loc)
    ob = bpy.context.active_object
    ob.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return _add(ob, True)


def tube(a, b, r, verts=12):
    """cylinder from point a to point b"""
    a, b = Vector(a), Vector(b)
    d = b - a
    ob = cyl(r, d.length, loc=(a + b) / 2, verts=verts)
    ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return ob


def lathe(profile, loc=(0, 0, 0), steps=32):
    """revolve a (r, z) profile around Z"""
    me = bpy.data.meshes.new('lathe')
    bm = bmesh.new()
    rings = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(steps):
        r0, r1 = rings[i], rings[(i + 1) % steps]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('lathe', me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    bpy.context.view_layer.objects.active = ob
    return _add(ob, True)


def finish(name, autosmooth_deg=None):
    """join everything built since the last finish() into one object, base at z=0"""
    global _parts
    bpy.ops.object.select_all(action='DESELECT')
    for p in _parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = _parts[0]
    if len(_parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = name
    pts = [v.co for v in ob.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ob.data.transform(Matrix.Translation(-Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))))
    _parts = []
    return ob


# ------------------------------------------------------------------ office
def desk():
    """1.60 x 0.78 top at 0.74, two steel sled legs. Long axis = X."""
    box(1.60, 0.78, 0.03, (0, 0, 0.725), bevel=0.004)
    for x in (-0.72, 0.72):
        box(0.05, 0.70, 0.025, (x, 0, 0.0125))          # foot
        box(0.05, 0.05, 0.70, (x, -0.30, 0.36))
        box(0.05, 0.05, 0.70, (x, 0.30, 0.36))
        box(0.05, 0.62, 0.04, (x, 0, 0.69))             # top rail
    box(1.40, 0.02, 0.10, (0, 0.30, 0.64))              # modesty beam (back side)
    return finish('desk')


def monitor():
    """27-inch, screen facing -Y."""
    box(0.615, 0.022, 0.365, (0, 0, 0.30), bevel=0.003)        # panel
    box(0.58, 0.004, 0.33, (0, -0.012, 0.305))                 # glass inset (edge line)
    box(0.05, 0.03, 0.26, (0, 0.05, 0.14))                     # neck
    box(0.24, 0.18, 0.012, (0, 0.03, 0.006), bevel=0.004)      # foot plate
    return finish('monitor')


def laptop():
    """13-inch, open ~110deg, screen facing -Y (the user sits at -Y)."""
    box(0.305, 0.215, 0.012, (0, 0, 0.006), bevel=0.003)
    box(0.27, 0.10, 0.002, (0, 0.03, 0.013))                   # keyboard deck
    box(0.10, 0.06, 0.001, (0, -0.07, 0.0125))                 # trackpad
    lid = box(0.305, 0.008, 0.205, (0, 0, 0), bevel=0.003)
    lid.location = (0, 0.105 + 0.03, 0.012 + 0.1)
    lid.rotation_euler = (math.radians(-20), 0, 0)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    return finish('laptop_modern')


def keyboard():
    """75% mechanical: case + keycap grid (the grid is what reads as 'keyboard' in chalk)."""
    box(0.33, 0.125, 0.022, (0, 0, 0.011), bevel=0.004)
    kx, ky = 0.0185, 0.0185
    rows = [15, 15, 14, 13, 12]
    for r, n in enumerate(rows):
        y = 0.045 - r * ky
        x0 = -(n - 1) * kx / 2
        for c in range(n):
            box(0.0155, 0.0155, 0.008, (x0 + c * kx, y, 0.026))
    box(0.11, 0.0155, 0.008, (0, 0.045 - 5 * ky + 0.0, 0.026))     # space bar
    return finish('keyboard')


def mouse():
    sphere(0.03, (0, 0, 0.012), scale=(0.95, 1.9, 0.55))
    return finish('mouse')


def headphones():
    """lying flat on the desk"""
    torus(0.085, 0.009, (0, 0, 0.02), rot=(0, 0, 0), major=40)
    for x in (-0.085, 0.085):
        cyl(0.042, 0.035, (x, 0, 0.018), rot=(0, 0, 0), verts=28)
    # keep only the back half of the headband ring visually: squash in y
    ob = _parts[0]
    ob.scale = (1, 1.15, 1)
    bpy.ops.object.select_all(action='DESELECT')
    return finish('headphones')


def mug():
    lathe([(0.0, 0.0), (0.041, 0.0), (0.043, 0.004), (0.043, 0.095), (0.039, 0.095), (0.039, 0.008), (0.0, 0.008)])
    torus(0.026, 0.006, (0.05, 0, 0.05), rot=(math.radians(90), 0, 0), major=24, minor=8)
    return finish('mug')


def notebook():
    box(0.148, 0.21, 0.012, (0, 0, 0.006), bevel=0.002)
    tube((-0.03, -0.09, 0.016), (0.07, 0.06, 0.016), 0.004)
    return finish('notebook')


def office_chair():
    """task chair, faces -Y (you sit looking toward -Y)"""
    for i in range(5):
        a = 2 * math.pi * i / 5 + math.pi / 2
        tip = (math.cos(a) * 0.32, math.sin(a) * 0.32, 0.07)
        tube((0, 0, 0.10), tip, 0.018)
        sphere(0.025, (tip[0], tip[1], 0.03))
    cyl(0.03, 0.12, (0, 0, 0.14))                              # hub
    cyl(0.018, 0.25, (0, 0, 0.30))                             # gas lift
    box(0.50, 0.48, 0.07, (0, 0, 0.46), bevel=0.02)            # seat
    box(0.46, 0.05, 0.52, (0, 0.27, 0.82), bevel=0.02)         # back
    tube((0, 0.22, 0.46), (0, 0.27, 0.58), 0.02)               # back spine
    for x in (-0.27, 0.27):
        tube((x, 0.05, 0.46), (x, 0.05, 0.65), 0.012)
        box(0.06, 0.24, 0.025, (x, 0.02, 0.66), bevel=0.008)   # armrest
    return finish('office_chair')


# ------------------------------------------------------------------ sport
def road_bike():
    """road bike, long axis = X, front wheel at +X"""
    R = 0.34
    wb = 0.99
    rear, front = Vector((-wb / 2, 0, R)), Vector((wb / 2, 0, R))
    for c in (rear, front):
        torus(R - 0.012, 0.012, c, rot=(math.radians(90), 0, 0), major=56, minor=8)   # tyre
        torus(R - 0.03, 0.006, c, rot=(math.radians(90), 0, 0), major=56, minor=6)    # rim
        cyl(0.018, 0.10, c, rot=(math.radians(90), 0, 0), verts=12)                  # hub
        for i in range(16):
            a = 2 * math.pi * i / 16
            side = 0.035 if i % 2 else -0.035
            tube(c + Vector((0, side, 0)), c + Vector((math.cos(a) * (R - 0.035), 0, math.sin(a) * (R - 0.035))), 0.0015, verts=4)
    bb = Vector((-0.08, 0, 0.27))                   # bottom bracket
    seat_top = Vector((-0.24, 0, 0.80))
    head_top = Vector((0.38, 0, 0.76))
    head_bot = Vector((0.40, 0, 0.62))
    tube(bb, seat_top, 0.016)                       # seat tube
    tube(seat_top + Vector((0.01, 0, -0.04)), head_top, 0.015)   # top tube
    tube(bb, head_bot, 0.02)                        # down tube
    tube(head_bot, head_top, 0.02)                  # head tube
    for y in (-0.05, 0.05):
        tube(bb, rear + Vector((0, y, 0)), 0.009)                               # chainstays
        tube(seat_top + Vector((0, 0, -0.07)), rear + Vector((0, y, 0)), 0.008)  # seatstays
        tube(head_bot, front + Vector((0, y, 0)), 0.011)                        # fork
    tube(seat_top, seat_top + Vector((-0.03, 0, 0.12)), 0.012)                  # seatpost
    box(0.26, 0.07, 0.025, seat_top + Vector((-0.04, 0, 0.13)), bevel=0.012)   # saddle
    tube(head_top, head_top + Vector((0.02, 0, 0.06)), 0.014)                   # steerer
    stem_end = head_top + Vector((0.11, 0, 0.07))
    tube(head_top + Vector((0.02, 0, 0.05)), stem_end, 0.013)                   # stem
    tube(stem_end + Vector((0, -0.21, 0)), stem_end + Vector((0, 0.21, 0)), 0.012)  # bar top
    for y in (-0.21, 0.21):                                                      # drops: a C opening backwards
        ctr = stem_end + Vector((0.07, y, -0.07))
        pts = [ctr + Vector((math.cos(a) * 0.07, 0, math.sin(a) * 0.07))
               for a in [math.radians(90 - 180 * k / 8) for k in range(9)]]
        pts = [Vector((stem_end.x, y, stem_end.z))] + pts + [pts[-1] + Vector((-0.06, 0, 0))]
        for p0, p1 in zip(pts, pts[1:]):
            tube(p0, p1, 0.011, verts=8)
    torus(0.10, 0.004, bb + Vector((0, -0.05, 0)), rot=(math.radians(90), 0, 0), major=48, minor=6)   # chainring
    cyl(0.09, 0.004, bb + Vector((0, -0.05, 0)), rot=(math.radians(90), 0, 0), verts=40, smooth=False)
    for s, ang in ((-1, 0.6), (1, 0.6 + math.pi)):
        tip = bb + Vector((math.cos(ang) * 0.17, s * 0.08, math.sin(ang) * 0.17))
        tube(bb + Vector((0, s * 0.07, 0)), tip, 0.009)                         # cranks
        box(0.09, 0.05, 0.015, tip + Vector((0, s * 0.03, 0)))                   # pedals
    return finish('road_bike')


def bike_stand():
    """rear-wheel display stand (two U hoops on a base) — bike sits on top of it"""
    for y in (-0.06, 0.06):
        torus(0.16, 0.012, (0, y, 0.16), rot=(math.radians(90), 0, 0), major=32, minor=6)
    box(0.40, 0.36, 0.02, (0, 0, 0.01), bevel=0.006)
    return finish('bike_stand')


def running_shoe(left=True):
    """low running shoe, toe at +X"""
    s = 1 if left else -1
    # sole: rocker-profiled slab from stacked slices
    for i in range(12):
        t = i / 11
        x = -0.14 + t * 0.28
        w = 0.085 + 0.02 * math.sin(t * math.pi) - (0.02 if t > 0.85 else 0)
        h = 0.035 - 0.012 * t
        rock = 0.012 * (abs(t - 0.45) ** 2) * 6
        box(0.028, w, h, (x, 0, h / 2 + rock), bevel=0.006)
    # upper: ellipsoid cut by the sole
    sphere(0.1, (0.0, 0, 0.055), scale=(1.35, 0.46, 0.55))
    sphere(0.05, (-0.1, 0, 0.09), scale=(0.9, 0.8, 1.0))       # heel collar
    for k in range(4):                                          # laces
        x = 0.02 + k * 0.025
        tube((x, -0.025, 0.105 - k * 0.006), (x + 0.004, 0.025, 0.105 - k * 0.006), 0.003, verts=6)
    ob = finish('shoe_L' if left else 'shoe_R')
    return ob


def racket():
    """tennis racket lying on its side face; head up (+Z) when rotated to lean"""
    head_c = Vector((0, 0, 0.52))
    torus(1.0, 0.012, head_c, rot=(math.radians(90), 0, 0), major=64, minor=8)
    ring = _parts[-1]
    ring.scale = (0.125, 0.16, 1)  # local axes: the torus lies in its local XY before the 90deg X rotation
    bpy.ops.object.select_all(action='DESELECT')
    ring.select_set(True)
    bpy.context.view_layer.objects.active = ring
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for i in range(-5, 6):                                     # mains
        x = i * 0.021
        hz = 0.16 * math.sqrt(max(0.0, 1 - (x / 0.125) ** 2)) - 0.012
        tube(head_c + Vector((x, 0, -hz)), head_c + Vector((x, 0, hz)), 0.0012, verts=4)
    for i in range(-6, 7):                                     # crosses
        z = i * 0.022
        hx = 0.125 * math.sqrt(max(0.0, 1 - (z / 0.16) ** 2)) - 0.012
        tube(head_c + Vector((-hx, 0, z)), head_c + Vector((hx, 0, z)), 0.0012, verts=4)
    throat = head_c + Vector((0, 0, -0.16))
    tube(throat + Vector((-0.05, 0, 0.02)), Vector((0, 0, 0.30)), 0.009)
    tube(throat + Vector((0.05, 0, 0.02)), Vector((0, 0, 0.30)), 0.009)
    cyl(0.016, 0.30, (0, 0, 0.15), verts=8, smooth=False)     # octagonal grip
    return finish('racket')


# ------------------------------------------------------------------ shelf dressing
def trophy(h=0.30):
    k = h / 0.30
    lathe([(0.0, 0.0), (0.06 * k, 0.0), (0.06 * k, 0.05 * k), (0.045 * k, 0.05 * k), (0.045 * k, 0.06 * k),
           (0.012 * k, 0.08 * k), (0.012 * k, 0.15 * k), (0.03 * k, 0.17 * k), (0.07 * k, 0.24 * k),
           (0.075 * k, 0.30 * k), (0.068 * k, 0.30 * k), (0.0, 0.2 * k)])
    for s in (-1, 1):
        torus(0.03 * k, 0.005 * k, (s * 0.08 * k, 0, 0.245 * k), rot=(math.radians(90), 0, 0), major=20, minor=6)
    return finish(f'trophy_{int(h * 100)}')


def medal():
    """ribbon V hanging from a hook point at the top (z = its height)"""
    cyl(0.035, 0.005, (0, 0, 0.035), rot=(math.radians(90), 0, 0), verts=32)
    box(0.02, 0.002, 0.16, (-0.025, 0, 0.14), rot=(0, math.radians(-10), 0))
    box(0.02, 0.002, 0.16, (0.025, 0, 0.14), rot=(0, math.radians(10), 0))
    return finish('medal')


def frame(w=0.24, h=0.32):
    """certificate frame, standing, face -Y, slightly reclined"""
    t = 0.018
    box(w, 0.015, t, (0, 0, h - t / 2))
    box(w, 0.015, t, (0, 0, t / 2))
    box(t, 0.015, h, (-w / 2 + t / 2, 0, h / 2))
    box(t, 0.015, h, (w / 2 - t / 2, 0, h / 2))
    box(w - 2 * t, 0.004, h - 2 * t, (0, 0.004, h / 2))       # certificate paper
    box(w * 0.55, 0.002, 0.012, (0, -0.0, h * 0.72))          # title line
    return finish('certificate')


def chess_king(h=0.34):
    """oversized decorative king: base, collar, bulb, crown, cross"""
    k = h / 0.34
    lathe([(0.0, 0.0), (0.075 * k, 0.0), (0.075 * k, 0.02 * k), (0.06 * k, 0.03 * k), (0.058 * k, 0.045 * k),
           (0.04 * k, 0.06 * k), (0.028 * k, 0.12 * k), (0.024 * k, 0.17 * k), (0.045 * k, 0.185 * k),
           (0.03 * k, 0.2 * k), (0.03 * k, 0.21 * k), (0.05 * k, 0.26 * k), (0.042 * k, 0.28 * k), (0.0, 0.285 * k)])
    box(0.014 * k, 0.014 * k, 0.06 * k, (0, 0, 0.31 * k))
    box(0.04 * k, 0.014 * k, 0.014 * k, (0, 0, 0.315 * k))
    return finish('chess_king')


def medal_big():
    """wide ribbon V + disc, hook at the top"""
    cyl(0.05, 0.006, (0, 0, 0.05), rot=(math.radians(90), 0, 0), verts=40)
    torus(0.05, 0.004, (0, -0.003, 0.05), rot=(math.radians(90), 0, 0), major=40, minor=6)
    # ribbon: a V — two strips from the hang points down to the disc
    box(0.035, 0.003, 0.24, (-0.035, 0, 0.2), rot=(0, math.radians(-12), 0))
    box(0.035, 0.003, 0.24, (0.035, 0, 0.2), rot=(0, math.radians(12), 0))
    return finish('medal')


def trainer(axle_h=0.34, R=0.34):
    """wheel-on indoor trainer at the rear axle (origin = axle x/y): A-frame legs both
    sides up to the axle clamps, roller under the tyre, resistance unit behind it."""
    for y in (-0.09, 0.09):
        tube((-0.28, y * 2.6, 0.02), (0, y, axle_h), 0.016)      # rear leg
        tube((0.26, y * 2.6, 0.02), (0, y, axle_h), 0.016)       # front leg
        box(0.08, 0.05, 0.03, (-0.28, y * 2.6, 0.015), bevel=0.008)  # feet
        box(0.08, 0.05, 0.03, (0.26, y * 2.6, 0.015), bevel=0.008)
        cyl(0.025, 0.04, (0, y, axle_h), rot=(math.radians(90), 0, 0))   # clamp
    tube((0.26, -0.234, 0.02), (0.26, 0.234, 0.02), 0.014)        # front cross bar
    cyl(0.028, 0.08, (-0.05, 0, 0.028), rot=(math.radians(90), 0, 0))   # roller under the tyre
    cyl(0.085, 0.07, (-0.19, 0, 0.1), rot=(math.radians(90), 0, 0), verts=32)  # resistance unit
    tube((-0.05, 0, 0.028), (-0.19, 0, 0.1), 0.012)
    return finish('trainer')


def riser_block():
    """front-wheel riser: a low block with a cradle"""
    box(0.36, 0.2, 0.035, (0, 0, 0.0175), bevel=0.01)
    box(0.24, 0.12, 0.018, (0, 0, 0.044), bevel=0.006)
    return finish('riser')


def racket_bag():
    """15-racket thermo bag, built from its FRONT PROFILE: the racket-head end (+X) is the
    tall one with a big round shoulder, the top then slopes down toward the handle end (-X),
    which is lower and flatter. The profile is extruded front-to-back, edges rounded; three
    zips follow the profile over the top and down both ends; flat grab handle on top,
    backpack straps on the back. Front = -Y."""
    L, D = 0.78, 0.33
    Hh, Hc = 0.37, 0.27               # height at the head end / at the handle end
    R = 0.15                          # head-end shoulder radius
    xh, xc = L / 2, -L / 2
    prof = [(xc, 0.0), (xh, 0.0), (xh, Hh - R)]
    for k in range(1, 12):            # big round shoulder at the head end
        a = (math.pi / 2) * k / 11
        prof.append((xh - R + math.cos(a) * R, Hh - R + math.sin(a) * R))
    for k in range(1, 10):            # top: gentle curve down to the handle end
        t = k / 9
        x = (xh - R) + (xc + 0.05 - (xh - R)) * t
        z = Hh + (Hc - Hh) * (t ** 1.4)
        prof.append((x, z))
    prof.append((xc, Hc - 0.05))
    me = bpy.data.meshes.new('bag')
    bm = bmesh.new()
    front = [bm.verts.new((x, -D / 2, z)) for x, z in prof]
    back = [bm.verts.new((x, D / 2, z)) for x, z in prof]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('bag_body', me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('b', 'BEVEL')
    m.width = 0.035
    m.segments = 5
    m.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier='b')
    for p in ob.data.polygons:
        p.use_smooth = True
    _add(ob)

    def zip_line(y):
        pts = [Vector((x, y, z)) for x, z in prof[2:]] + [Vector((xc, y, 0.04))]
        pts = [Vector((xh, y, 0.04))] + pts
        # push the line 5 mm out of the surface along the profile's outward direction
        out = []
        for p in pts:
            c_ = Vector((0, y, 0.12))
            d = Vector((p.x - c_.x, 0, p.z - c_.z)).normalized()
            out.append(p + d * 0.005)
        for p0, p1 in zip(out, out[1:]):
            tube(p0, p1, 0.006, verts=6)

    for y in (-0.09, 0.0, 0.09):
        zip_line(y)
    top_mid = (0.02, Hh + (Hc - Hh) * (0.45 ** 1.4) + 0.012)
    box(0.15, 0.035, 0.012, (top_mid[0], 0.0, top_mid[1] + 0.012), rot=(0, math.radians(7), 0), bevel=0.005)
    for x in (-0.2, 0.18):                                   # backpack straps, back face
        box(0.055, 0.014, 0.2, (x, D / 2 + 0.008, 0.16), bevel=0.005)
    return finish('racket_bag')


def certificate():
    """framed certificate on a back leg, reclined ~12deg, faces -Y. Thin frame, a bold
    title bar, deep text lines and a big rosette seal — relief deep enough that the
    normal-based chalk outline actually draws them at room scale."""
    w, h, t = 0.34, 0.25, 0.012
    for (sx, sz, x, z) in ((w, t, 0, h - t / 2), (w, t, 0, t / 2), (t, h, -w / 2 + t / 2, h / 2), (t, h, w / 2 - t / 2, h / 2)):
        box(sx, 0.022, sz, (x, 0, z))
    box(w - 2 * t, 0.01, h - 2 * t, (0, 0.006, h / 2))              # paper, recessed
    box(0.2, 0.012, 0.022, (0, -0.002, h * 0.78))                   # title bar
    for k, lw in enumerate((0.24, 0.24, 0.15)):                     # text lines: few and thick, to survive at room scale
        box(lw, 0.014, 0.012, (-(0.24 - lw) / 2 - 0.02, -0.002, h * 0.58 - k * 0.038))
    cyl(0.042, 0.018, (0.1, -0.004, h * 0.25), rot=(math.radians(90), 0, 0), verts=16, smooth=False)   # rosette
    for s in (-1, 1):
        box(0.014, 0.01, 0.06, (0.1 + s * 0.014, -0.004, h * 0.25 - 0.045), rot=(0, math.radians(s * 20), 0))
    box(0.08, 0.012, 0.004, (-0.09, -0.002, h * 0.22))              # signature line
    ob = finish('certificate')
    ob.rotation_euler = (math.radians(-12), 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    box(0.03, 0.12, 0.01, (0, 0.06, 0.005))                         # back leg foot
    _parts.insert(0, ob)
    return finish('certificate')


def books():
    """a readable shelf run at room scale: 7 upright books (bigger, few), two leaning,
    a lying stack of three, a bookend. Deep spine bands so the outline draws them."""
    import random
    rnd = random.Random(3)
    x = 0.0
    for i in range(7):
        th = rnd.uniform(0.04, 0.06)
        hh = rnd.choice((0.24, 0.26, 0.28, 0.3))
        d = 0.19
        box(th, d, hh, (x + th / 2, 0, hh / 2), bevel=0.003)
        for zb in (0.035, hh - 0.04):
            box(th * 0.96, 0.008, 0.012, (x + th / 2, -d / 2 - 0.003, zb))
        x += th + 0.003
    for k in range(2):
        th, hh = 0.05, 0.27
        b_ = box(th, 0.19, hh, (0, 0, 0), bevel=0.003)
        a = math.radians(-20 - k * 6)
        b_.rotation_euler = (0, a, 0)
        b_.location = (x + 0.03 + k * 0.055 + hh * math.sin(-a) / 2, 0, hh * math.cos(a) / 2 + th / 2 * math.sin(-a))
        bpy.ops.object.select_all(action='DESELECT')
        b_.select_set(True)
        bpy.context.view_layer.objects.active = b_
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    sx_ = x + 0.26
    zz = 0.0
    for k, (w_, d_, t_) in enumerate(((0.25, 0.19, 0.05), (0.23, 0.17, 0.04), (0.21, 0.16, 0.045))):
        box(w_, d_, t_, (sx_ + 0.12, 0, zz + t_ / 2), rot=(0, 0, math.radians(k * 7 - 5)), bevel=0.003)
        zz += t_
    box(0.014, 0.15, 0.18, (-0.012, 0, 0.09))
    return finish('books')


def chess_king(h=0.34):
    """oversized decorative king: base, collar, bulb, crown, cross"""
    k = h / 0.34
    lathe([(0.0, 0.0), (0.075 * k, 0.0), (0.075 * k, 0.02 * k), (0.06 * k, 0.03 * k), (0.058 * k, 0.045 * k),
           (0.04 * k, 0.06 * k), (0.028 * k, 0.12 * k), (0.024 * k, 0.17 * k), (0.045 * k, 0.185 * k),
           (0.03 * k, 0.2 * k), (0.03 * k, 0.21 * k), (0.05 * k, 0.26 * k), (0.042 * k, 0.28 * k), (0.0, 0.285 * k)])
    box(0.014 * k, 0.014 * k, 0.06 * k, (0, 0, 0.31 * k))
    box(0.04 * k, 0.014 * k, 0.014 * k, (0, 0, 0.315 * k))
    return finish('chess_king')


def medal_big():
    """wide ribbon V + disc, hook at the top"""
    cyl(0.05, 0.006, (0, 0, 0.05), rot=(math.radians(90), 0, 0), verts=40)
    torus(0.05, 0.004, (0, -0.003, 0.05), rot=(math.radians(90), 0, 0), major=40, minor=6)
    # ribbon: a V — two strips from the hang points down to the disc
    box(0.035, 0.003, 0.24, (-0.035, 0, 0.2), rot=(0, math.radians(-12), 0))
    box(0.035, 0.003, 0.24, (0.035, 0, 0.2), rot=(0, math.radians(12), 0))
    return finish('medal')


def trainer(axle_h=0.34, R=0.34):
    """wheel-on indoor trainer at the rear axle (origin = axle x/y): A-frame legs both
    sides up to the axle clamps, roller under the tyre, resistance unit behind it."""
    for y in (-0.09, 0.09):
        tube((-0.28, y * 2.6, 0.02), (0, y, axle_h), 0.016)      # rear leg
        tube((0.26, y * 2.6, 0.02), (0, y, axle_h), 0.016)       # front leg
        box(0.08, 0.05, 0.03, (-0.28, y * 2.6, 0.015), bevel=0.008)  # feet
        box(0.08, 0.05, 0.03, (0.26, y * 2.6, 0.015), bevel=0.008)
        cyl(0.025, 0.04, (0, y, axle_h), rot=(math.radians(90), 0, 0))   # clamp
    tube((0.26, -0.234, 0.02), (0.26, 0.234, 0.02), 0.014)        # front cross bar
    cyl(0.028, 0.08, (-0.05, 0, 0.028), rot=(math.radians(90), 0, 0))   # roller under the tyre
    cyl(0.085, 0.07, (-0.19, 0, 0.1), rot=(math.radians(90), 0, 0), verts=32)  # resistance unit
    tube((-0.05, 0, 0.028), (-0.19, 0, 0.1), 0.012)
    return finish('trainer')


def riser_block():
    """front-wheel riser: a low block with a cradle"""
    box(0.36, 0.2, 0.035, (0, 0, 0.0175), bevel=0.01)
    box(0.24, 0.12, 0.018, (0, 0, 0.044), bevel=0.006)
    return finish('riser')


def racket_bag():
    """15-racket thermo bag, built from its FRONT PROFILE: the racket-head end (+X) is the
    tall one with a big round shoulder, the top then slopes down toward the handle end (-X),
    which is lower and flatter. The profile is extruded front-to-back, edges rounded; three
    zips follow the profile over the top and down both ends; flat grab handle on top,
    backpack straps on the back. Front = -Y."""
    L, D = 0.78, 0.33
    Hh, Hc = 0.37, 0.27               # height at the head end / at the handle end
    R = 0.15                          # head-end shoulder radius
    xh, xc = L / 2, -L / 2
    prof = [(xc, 0.0), (xh, 0.0), (xh, Hh - R)]
    for k in range(1, 12):            # big round shoulder at the head end
        a = (math.pi / 2) * k / 11
        prof.append((xh - R + math.cos(a) * R, Hh - R + math.sin(a) * R))
    for k in range(1, 10):            # top: gentle curve down to the handle end
        t = k / 9
        x = (xh - R) + (xc + 0.05 - (xh - R)) * t
        z = Hh + (Hc - Hh) * (t ** 1.4)
        prof.append((x, z))
    prof.append((xc, Hc - 0.05))
    me = bpy.data.meshes.new('bag')
    bm = bmesh.new()
    front = [bm.verts.new((x, -D / 2, z)) for x, z in prof]
    back = [bm.verts.new((x, D / 2, z)) for x, z in prof]
    bm.faces.new(front[::-1])
    bm.faces.new(back)
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('bag_body', me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    m = ob.modifiers.new('b', 'BEVEL')
    m.width = 0.035
    m.segments = 5
    m.limit_method = 'ANGLE'
    bpy.ops.object.modifier_apply(modifier='b')
    for p in ob.data.polygons:
        p.use_smooth = True
    _add(ob)

    def zip_line(y):
        pts = [Vector((x, y, z)) for x, z in prof[2:]] + [Vector((xc, y, 0.04))]
        pts = [Vector((xh, y, 0.04))] + pts
        # push the line 5 mm out of the surface along the profile's outward direction
        out = []
        for p in pts:
            c_ = Vector((0, y, 0.12))
            d = Vector((p.x - c_.x, 0, p.z - c_.z)).normalized()
            out.append(p + d * 0.005)
        for p0, p1 in zip(out, out[1:]):
            tube(p0, p1, 0.006, verts=6)

    for y in (-0.09, 0.0, 0.09):
        zip_line(y)
    top_mid = (0.02, Hh + (Hc - Hh) * (0.45 ** 1.4) + 0.012)
    box(0.15, 0.035, 0.012, (top_mid[0], 0.0, top_mid[1] + 0.012), rot=(0, math.radians(7), 0), bevel=0.005)
    for x in (-0.2, 0.18):                                   # backpack straps, back face
        box(0.055, 0.014, 0.2, (x, D / 2 + 0.008, 0.16), bevel=0.005)
    return finish('racket_bag')


def certificate():
    """framed certificate on a back leg, reclined ~12deg, faces -Y. Thin frame, a bold
    title bar, deep text lines and a big rosette seal — relief deep enough that the
    normal-based chalk outline actually draws them at room scale."""
    w, h, t = 0.34, 0.25, 0.012
    for (sx, sz, x, z) in ((w, t, 0, h - t / 2), (w, t, 0, t / 2), (t, h, -w / 2 + t / 2, h / 2), (t, h, w / 2 - t / 2, h / 2)):
        box(sx, 0.022, sz, (x, 0, z))
    box(w - 2 * t, 0.01, h - 2 * t, (0, 0.006, h / 2))              # paper, recessed
    box(0.2, 0.012, 0.022, (0, -0.002, h * 0.78))                   # title bar
    for k, lw in enumerate((0.24, 0.24, 0.15)):                     # text lines: few and thick, to survive at room scale
        box(lw, 0.014, 0.012, (-(0.24 - lw) / 2 - 0.02, -0.002, h * 0.58 - k * 0.038))
    cyl(0.042, 0.018, (0.1, -0.004, h * 0.25), rot=(math.radians(90), 0, 0), verts=16, smooth=False)   # rosette
    for s in (-1, 1):
        box(0.014, 0.01, 0.06, (0.1 + s * 0.014, -0.004, h * 0.25 - 0.045), rot=(0, math.radians(s * 20), 0))
    box(0.08, 0.012, 0.004, (-0.09, -0.002, h * 0.22))              # signature line
    ob = finish('certificate')
    ob.rotation_euler = (math.radians(-12), 0, 0)
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    box(0.03, 0.12, 0.01, (0, 0.06, 0.005))                         # back leg foot
    _parts.insert(0, ob)
    return finish('certificate')


def books():
    """a real shelf run: varied heights/thicknesses with spine bands, two leaning,
    a lying stack, a bookend. Spines face -Y. Returns one object, left edge at x = 0 before centring."""
    import random
    rnd = random.Random(7)
    x = 0.0
    for i in range(11):
        th = rnd.uniform(0.022, 0.048)
        hh = rnd.uniform(0.2, 0.27)
        d = rnd.uniform(0.15, 0.19)
        box(th, d, hh, (x + th / 2, 0, hh / 2), bevel=0.002)
        for zb in (0.025, hh - 0.03):                               # spine bands
            box(th * 0.9, 0.004, 0.006, (x + th / 2, -d / 2 - 0.001, zb))
        x += th + 0.002
    for k in range(2):                                              # two leaning against the run
        th, hh = 0.032, 0.24
        b = box(th, 0.17, hh, (0, 0, 0), bevel=0.002)
        a = math.radians(-18 - k * 4)
        b.rotation_euler = (0, a, 0)
        b.location = (x + 0.02 + k * 0.035 + hh * math.sin(-a) / 2, 0, hh * math.cos(a) / 2 + th / 2 * math.sin(-a))
        bpy.ops.object.select_all(action='DESELECT')
        b.select_set(True)
        bpy.context.view_layer.objects.active = b
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
    sx = x + 0.2
    zz = 0.0
    for k, (w_, d_, t_) in enumerate(((0.23, 0.17, 0.04), (0.21, 0.15, 0.03), (0.19, 0.14, 0.035))):   # lying stack
        box(w_, d_, t_, (sx + 0.12 + k * 0.006, 0, zz + t_ / 2), rot=(0, 0, math.radians(k * 6 - 4)), bevel=0.002)
        zz += t_
    box(0.012, 0.13, 0.17, (-0.01, 0, 0.085))                       # bookend upright
    box(0.1, 0.13, 0.004, (0.04, 0, 0.002))                          # bookend foot (under the books)
    return finish('books')
