import bpy, os
HERE=os.path.dirname(__file__)
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(HERE,'running_shoe','model.glb'))
for o in bpy.context.scene.objects:
    if o.type=='MESH': print('OBJ', o.name, len(o.data.polygons), [m.name for m in o.data.materials if m], [round(x,2) for x in o.dimensions])
for m in bpy.data.materials:
    if not m.use_nodes: continue
    b=m.node_tree.nodes.get('Principled BSDF')
    if b: print('MAT', m.name, 'rough', round(b.inputs['Roughness'].default_value,2), 'metal', round(b.inputs['Metallic'].default_value,2), 'linked', [i.name for i in b.inputs if i.is_linked])
