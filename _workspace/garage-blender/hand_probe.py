import bpy, sys, os
HERE = os.path.dirname(__file__); sys.path.insert(0, HERE)
from people_lib import build_person
import poses
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
rig, body = build_person('employee', gender=1.0, age=0.42, weight=0.55, muscle=0.5, height=0.55,
                         clothes=('male_casualsuit04', 'shoes02'), hair='short02')
poses.typing(rig)
bpy.context.view_layer.update()
for pb in rig.pose.bones:
    n = pb.name
    if n.endswith('.L') and any(k in n for k in ('wrist', 'finger', 'metacarpal', 'lowerarm', 'hand')):
        m = rig.matrix_world @ pb.matrix
        h = rig.matrix_world @ pb.head; t = rig.matrix_world @ pb.tail
        z = m.to_3x3().col[2].normalized(); x = m.to_3x3().col[0].normalized()
        print('BONE', n, 'par', pb.parent.name if pb.parent else '-', 'h', tuple(round(v,3) for v in h), 'dir', tuple(round(v,2) for v in (t-h).normalized()), 'x', tuple(round(v,2) for v in x), 'z', tuple(round(v,2) for v in z))
print('---- after')
