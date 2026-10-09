import bpy
bpy.ops.import_scene.gltf(filepath="C:/Users/GETÚLIO/generic/public/hero/tunnel/sf_running_shoe.glb")
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for l in m.node_tree.links:
        if l.from_node.type=='TEX_IMAGE': print('LINK', l.from_node.image.name, '->', l.to_node.type, l.to_socket.name)
