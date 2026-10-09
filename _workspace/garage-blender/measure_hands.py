# run after studio.py's scene build: report where his hands are vs the keyboard, and render a
# close side + top view of the desk to judge the arms
import bpy, sys, os
from mathutils import Vector
emp = bpy.data.objects['employee']
kb = bpy.data.objects['keyboard']
def wb(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
kmin, kmax = wb(kb)
print('KEYBOARD', [round(v, 3) for v in kmin], [round(v, 3) for v in kmax])
# hands: the mesh's vertices nearest the keyboard side, at desk height band
pts = [emp.matrix_world @ v.co for v in emp.data.vertices]
band = [p for p in pts if 0.6 < p.z < 1.0]
kc = (kmin + kmax) / 2
near = sorted(band, key=lambda p: (p - kc).length)[:200]
c = sum(near, Vector()) / len(near)
print('HANDS centroid', [round(v, 3) for v in c], 'dist to kb centre', round((c - kc).length, 3))
far = max(band, key=lambda p: (p - Vector((emp.location.x, emp.location.y, p.z))).length)
print('FARTHEST reach', [round(v, 3) for v in far])
for side, sel in (('L', lambda p: p.x < kc.x), ('R', lambda p: p.x >= kc.x)):
    pass
hand = [p for p in pts if kmin.x - 0.06 < p.x < kmax.x + 0.06 and kmin.y - 0.06 < p.y < kmax.y + 0.06 and 0.6 < p.z < 0.95]
print('HANDPTS', len(hand), 'minz', round(min(p.z for p in hand), 3) if hand else '-', 'below_keytop', sum(1 for p in hand if p.z < 0.765))
import math
from mathutils import Euler
_R = Euler((0, 0, -kb.rotation_euler.z)).to_matrix()
loc = [(_R @ (p - kb.location)) for p in pts]
# keyboard-local: x along its width, y toward the monitor (+) / him (-), z above the desk top
hh = [q for q in loc if abs(q.x) < 0.3 and -0.25 < q.y < 0.25 and -0.02 < q.z < 0.08]
print('KBLOCAL n', len(hh))
for lab, f in (('beyond far edge (y>0.0625)', lambda q: q.y > 0.0625), ('off near edge (y<-0.0625)', lambda q: q.y < -0.0625)):
    s = [q for q in hh if f(q)]
    print('KB', lab, len(s), 'minz', round(min((q.z for q in s), default=9), 3), 'maxy', round(max((q.y for q in s), default=0), 3))
print('KB lowest over keys', round(min((q.z for q in hh if abs(q.y) <= 0.0625 and abs(q.x) <= 0.165), default=9), 3))
print('KB y-range of hand pts below 0.05', round(min((q.y for q in hh if q.z < 0.05), default=0), 3), round(max((q.y for q in hh if q.z < 0.05), default=0), 3))
low = [q for q in hh if q.z < 0.05]
print('KB x-range of hand pts below 0.05', round(min(q.x for q in low), 3), round(max(q.x for q in low), 3))
el = [(_R @ (p - kb.location)) for p in pts]
el = [q for q in el if 0.0 < q.z < 0.15 and q.y < -0.2]
print('ELBOWS x-range (z 0..0.15 above desk, near him)', round(min(q.x for q in el), 3) if el else '-', round(max(q.x for q in el), 3) if el else '-')
