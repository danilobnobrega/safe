import bpy, numpy as np, os
F="C:/Users/GETÚLIO/generic/public/hero/tunnel/sf_running_shoe.glb"
for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=F)
n=0
base=set()
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for nd in m.node_tree.nodes:
        if nd.type=='BSDF_PRINCIPLED' and nd.inputs['Base Color'].is_linked:
            src=nd.inputs['Base Color'].links[0].from_node
            if src.type=='TEX_IMAGE': base.add(src.image.name)
print('BASE', base)
for img in bpy.data.images:
    if img.size[0]==0 or img.name != 'Image_0': continue  # the base colour (it reaches the shader through a MIX node)
    px=np.array(img.pixels[:]).reshape(-1,4)
    r,g,b=px[:,0],px[:,1],px[:,2]
    blue=(b>r+0.12)&(b>g+0.06)
    if blue.sum()<500: continue
    # the lining's own tone: the median of the dark, unsaturated pixels
    dark=(px[:,:3].max(1)<0.35)&((px[:,:3].max(1)-px[:,:3].min(1))<0.06)
    tone=np.median(px[dark,:3],axis=0) if dark.sum()>100 else np.array([0.12,0.11,0.1])
    lum=(0.3*r+0.59*g+0.11*b)[blue]
    px[blue,:3]=tone*(0.6+0.8*lum[:,None]/max(lum.mean(),1e-3))
    img.pixels[:]=px.ravel(); img.update(); n+=1
    print('FIX', img.name, int(blue.sum()), 'px ->', [round(x,3) for x in tone])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=F, export_format='GLB', use_selection=True, export_image_format='JPEG', export_jpeg_quality=88, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
print('DONE', n)
