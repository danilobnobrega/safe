import bpy
for o in bpy.data.objects:
    extra=''
    if o.type=='MESH': extra=f"verts={len(o.data.vertices)} mods={[ (m.type,getattr(m,'levels',None)) for m in o.modifiers]} dims={tuple(round(x,2) for x in o.dimensions)}"
    print('OBJ',o.name,o.type,'parent=',o.parent.name if o.parent else None, 'asset' if o.asset_data else '', extra)
for c in bpy.data.collections: print('COL',c.name,[o.name for o in c.objects][:12])
for a in bpy.data.armatures: print('ARM',a.name,len(a.bones),[b.name for b in a.bones][:30])
