"""MakeHuman (MPFB, CC0 output) people for the garage scene, built + posed headless.

build_person() -> one clothed, rigged human; pose with rot() (world-axis rotations at
each bone's head, parent-first); finalize() applies the armature + every modifier and
joins body/clothes/hair into a single static mesh ready for glTF export."""
import bpy, math, os
from mathutils import Matrix, Vector
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService

DATA = os.path.expandvars(r'%APPDATA%\Blender Foundation\Blender\4.5\extensions\.user\user_default\mpfb\data')


def asset(kind, name):
    d = os.path.join(DATA, kind, name)
    for f in os.listdir(d):
        if f.endswith('.mhclo'):
            return os.path.join(d, f)
    raise FileNotFoundError(d)


def build_person(tag, gender=1.0, age=0.5, weight=0.5, muscle=0.5, height=0.5, proportions=0.5,
                 clothes=('male_casualsuit02', 'shoes01'), hair='short02', eyebrows='eyebrow001', skin=None):
    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=gender, age=age, weight=weight, muscle=muscle, height=height, proportions=proportions)
    body = HumanService.create_human(scale=0.1, macro_detail_dict=macro)
    body.name = f'{tag}_body'
    if skin:
        HumanService.set_character_skin(os.path.join(DATA, 'skins', skin, f'{skin}.mhmat'), body)
    HumanService.add_builtin_rig(body, 'default')
    rig = body.parent
    rig.name = f'{tag}_rig'
    for c in clothes:
        HumanService.add_mhclo_asset(asset('clothes', c), body, asset_type='Clothes', subdiv_levels=0)
    if hair:
        HumanService.add_mhclo_asset(asset('hair', hair), body, asset_type='Hair', subdiv_levels=0)
    if eyebrows:
        HumanService.add_mhclo_asset(asset('eyebrows', eyebrows), body, asset_type='Eyebrows', subdiv_levels=0)
    return rig, body


def rot(rig, bone, axis, deg):
    """rotate a pose bone about a WORLD axis through its head (parent-first order)"""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    head_w = rig.matrix_world @ pb.head
    ax = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}[axis]
    R = Matrix.Translation(head_w) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-head_w)
    mw = rig.matrix_world @ pb.matrix
    pb.matrix = rig.matrix_world.inverted() @ (R @ mw)
    bpy.context.view_layer.update()


def aim(rig, bone, direction):
    """rotate a pose bone (about its head) so it points along a WORLD direction"""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    head_w = rig.matrix_world @ pb.head
    cur = (rig.matrix_world @ pb.tail) - head_w
    q = cur.normalized().rotation_difference(Vector(direction).normalized())
    R = Matrix.Translation(head_w) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head_w)
    pb.matrix = rig.matrix_world.inverted() @ (R @ (rig.matrix_world @ pb.matrix))
    bpy.context.view_layer.update()


def aim_chain(rig, bones, direction):
    for b in bones:
        aim(rig, b, direction)


def finalize(rig, tag):
    """bake pose + all modifiers into one mesh named `tag`, drop the rig"""
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    meshes = [o for o in rig.children_recursive if o.type == 'MESH']
    parts = []
    for o in meshes:
        ev = o.evaluated_get(deps)
        me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=False, depsgraph=deps)
        ob = bpy.data.objects.new(o.name + '_baked', me)
        ob.matrix_world = o.matrix_world.copy()
        bpy.context.scene.collection.objects.link(ob)
        parts.append(ob)
    for o in meshes + [rig]:
        bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    out = bpy.context.active_object
    out.name = tag
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return out


def render_preview(path, target=(0, 0, 0.9), dist=3.2, views=((0, -1), (1, 0)), res=(900, 900)):
    """workbench turntable-ish stills of the current scene for eyeballing"""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'SINGLE'
    sc.render.resolution_x, sc.render.resolution_y = res
    cam_data = bpy.data.cameras.new('prev_cam')
    cam = bpy.data.objects.new('prev_cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    t = Vector(target)
    for i, (x, y) in enumerate(views):
        cam.location = t + Vector((x, y, 0.15)).normalized() * dist
        d = t - cam.location
        cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path.replace('.png', f'_{i}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam, do_unlink=True)


def twist(rig, bone, deg):
    """roll a pose bone about its own (current, world) axis through its head"""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    head_w = rig.matrix_world @ pb.head
    ax = ((rig.matrix_world @ pb.tail) - head_w).normalized()
    R = Matrix.Translation(head_w) @ Matrix.Rotation(math.radians(deg), 4, ax) @ Matrix.Translation(-head_w)
    pb.matrix = rig.matrix_world.inverted() @ (R @ (rig.matrix_world @ pb.matrix))
    bpy.context.view_layer.update()
