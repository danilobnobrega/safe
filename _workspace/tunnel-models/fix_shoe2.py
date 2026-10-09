import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
F="C:/Users/GETÚLIO/generic/public/hero/tunnel/sf_running_shoe.glb"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=F)
ob=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
me=ob.data
bm=bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
tree=BVHTree.FromBMesh(bm)
# a face is inside the shoe when, looking out along its normal, it sees the shoe again close by in
# most directions around that normal (the cavity) — the scanned bag and the lining
# where is up: the shoe's thinnest horizontal... use world z, report extents to be sure
xs=[v.co for v in bm.verts]
print('EXT', [round(max(p[i] for p in xs)-min(p[i] for p in xs),3) for i in range(3)])
UP=Vector((0,0,1))
H=[Vector((1,0,0)),Vector((-1,0,0)),Vector((0,1,0)),Vector((0,-1,0)),Vector((0.7,0.7,0)),Vector((-0.7,0.7,0)),Vector((0.7,-0.7,0)),Vector((-0.7,-0.7,0))]
inside=[]
for f in bm.faces:
    c=f.calc_center_median()+f.normal*0.002
    walls=sum(1 for d in H if tree.ray_cast(c,d,0.2)[0] is not None)
    if walls>=8 and tree.ray_cast(c,UP,0.5)[0] is None: inside.append(f.index)
print('INSIDE', len(inside), 'of', len(bm.faces))
mat=bpy.data.materials.new('lining'); mat.use_nodes=True
b=mat.node_tree.nodes['Principled BSDF']; b.inputs['Base Color'].default_value=(0.035,0.032,0.03,1); b.inputs['Roughness'].default_value=0.95
me.materials.append(mat); idx=len(me.materials)-1
for i in inside: me.polygons[i].material_index=idx
bm.free()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=F, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('DONE')
