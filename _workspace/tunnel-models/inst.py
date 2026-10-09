ROOT = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    p = ROOT + p
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)


edit('src/hero/TunnelObjects.ts', [
    ("export const WORLD_SCALE = 7.5", "export const WORLD_SCALE = 9"),
    ("""  /** a fresh copy of the prototype called `name`""", """  /** prototype `i` as its parts — geometry, material, and where the part sits in the object —
   *  for drawing every copy of it at once (InstancedMesh) */
  parts(i: number): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] {
    const root = this.protos[i % this.protos.length]
    root.updateMatrixWorld(true)
    const inv = root.matrixWorld.clone().invert()
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    root.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) out.push({ geometry: m.geometry, material: mat, matrix: inv.clone().multiply(m.matrixWorld) })
    })
    return out
  }

  /** a fresh copy of the prototype called `name`"""),
])

edit('src/hero/ShaderHero.ts', [
    # build instanced copies in the real look
    ("""      this.galleryPhotos.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).visible = false
        const s0 = m.userData.s0 as THREE.Vector3""", """      if (objs.look === 'real') {
        this.buildTunnelInstances(objs)
        return
      }
      this.galleryPhotos.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).visible = false
        const s0 = m.userData.s0 as THREE.Vector3"""),
    ("""  private stepTunnelItems(dt: number): void {
    if (!this.tunnelItems.length) return""", """  private stepTunnelItems(dt: number): void {
    if (this.tunnelInst.length) return this.stepTunnelInstances(dt)
    if (!this.tunnelItems.length) return"""),
    ("""  /** TEST (/hero-tunnel-*): each slot's object follows""", """  /** the real look, built to run at frame rate: every copy of an object is drawn at once
   *  (one InstancedMesh per part of each object), opaque (no transparency sorting), shown and
   *  hidden by its size, sunk into the dark by the scene's fog — one-by-one meshes, each see-through
   *  for its fade, had halved the frame rate */
  private buildTunnelInstances(objs: TunnelObjects): void {
    const n = this.galleryPhotos.length
    const kinds = objs.count
    this.tunnelSpin = Array.from({ length: n }, (_, i) => {
      const r = (k: number) => ((i * k) % 1) - 0.5
      return {
        axis: new THREE.Vector3(r(0.618) * 1.6, 1, r(0.377) * 1.6).normalize(),
        speed: (i % 2 ? 1 : -1) * (0.9 + ((i * 0.618) % 1) * 0.8),
        a: (i * 2.399) % (Math.PI * 2),
      }
    })
    for (let k = 0; k < kinds; k++) {
      const slots: number[] = []
      for (let i = k; i < n; i += kinds) slots.push(i)
      for (const part of objs.parts(k)) {
        const mat = part.material as THREE.MeshStandardMaterial
        if (!mat.transparent) {
          mat.opacity = 1
          mat.depthWrite = true
        }
        mat.fog = true
        const mesh = new THREE.InstancedMesh(part.geometry, mat, slots.length)
        mesh.frustumCulled = false
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.gallery.add(mesh)
        this.tunnelInst.push({ mesh, part: part.matrix, slots })
      }
    }
    for (const m of this.galleryPhotos) (m.material as THREE.MeshBasicMaterial).visible = false
  }

  private stepTunnelInstances(dt: number): void {
    const pose = this.tunnelPose
    for (let i = 0; i < this.galleryPhotos.length; i++) {
      const sp = this.tunnelSpin[i]
      sp.a += dt * sp.speed
      const m = this.galleryPhotos[i]
      const op = (m.material as THREE.MeshBasicMaterial).opacity
      const e = op <= 0.002 ? 0 : 1 - (1 - op) ** 3 // grows in where the photo faded in
      this._tq.setFromAxisAngle(sp.axis, sp.a)
      this._ts.setScalar(Math.max(e, 1e-4) * WORLD_SCALE)
      pose[i].compose(m.position, this._tq, this._ts)
    }
    for (const inst of this.tunnelInst) {
      inst.slots.forEach((slot, j) => {
        inst.mesh.setMatrixAt(j, this._tm.multiplyMatrices(pose[slot], inst.part))
      })
      inst.mesh.instanceMatrix.needsUpdate = true
    }
  }

  /** TEST (/hero-tunnel-*): each slot's object follows"""),
    ("""  private tunnelFeatured = false
""", """  private tunnelFeatured = false
  private tunnelInst: { mesh: THREE.InstancedMesh; part: THREE.Matrix4; slots: number[] }[] = []
  private tunnelSpin: { axis: THREE.Vector3; speed: number; a: number }[] = []
  private tunnelPose = Array.from({ length: TUNNEL_PLANES }, () => new THREE.Matrix4())
  private _tq = new THREE.Quaternion()
  private _ts = new THREE.Vector3()
  private _tm = new THREE.Matrix4()
"""),
])
print('ok')
