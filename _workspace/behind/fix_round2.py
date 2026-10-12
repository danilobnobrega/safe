R = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    s = open(R + p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:160])
        s = s.replace(a, b, 1)
    open(R + p, 'w', encoding='utf-8').write(s)


# ---------------------------------------------------------------- DeskReactions
s = open(R + 'src/behind/DeskReactions.ts', encoding='utf-8').read()
# header
s = s.replace(""" *   desk     the drawers it's over slide out a little, one after the other, and back; the top
 *            jolts — everything lying on it hops (onBump)""", """ *   desk     the drawers it's over slide out, one after the other, and back""")
s = s.replace(""" *   printer  the lid pops up on its hinge and drops back, the body shivers""", """ *   printer  rocks on its feet, the way it was pushed, and settles (a rigid box: nothing bends)
 *   lamp     swings round on its base pivot and the shade nods on its hinge; its light goes with it""")
# desk: no top jolt, drawers further
i = s.index("/** desk: drawers slide out and back, the top jolts */")
j = s.index("/** pens, pencils, eraser, cup: each its own way */")
s = s[:i] + '''/** desk: the drawers slide out and back (the top stays put — Danilo) */
export function deskReactor(desk: THREE.Group): Reactor {
  const later = new Later()
  const parts = desk.children as THREE.Mesh[]
  const drawers = parts.filter((p) => /drawer|tray/.test(p.name)).map((m) => ({ m, s: new Spring(150, 8) }))
  return {
    hit: desk,
    react(_dir, amt, point) {
      // the drawers nearest the cursor, in order of distance: each one out, a beat apart
      const near = drawers
        .map((d) => ({ d, dist: d.m.getWorldPosition(_v).distanceTo(point) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3)
      near.forEach(({ d, dist }, i) => later.add(i * 0.08, () => (d.s.v += amt * (0.75 - Math.min(dist, 0.6) * 0.6) * (1 - i * 0.25))))
    },
    step(dt) {
      later.step(dt)
      const h = H(dt)
      for (const d of drawers) {
        d.s.step(h)
        const x = THREE.MathUtils.clamp(d.s.x, 0, 0.09) // a drawer only comes out, and only so far
        d.m.position.copy(d.m.userData.rest as THREE.Vector3).z += x
      }
    },
  }
}

''' + s[j:]
# cup: tip about its base, not its middle
s = s.replace("""        } else {
          it.m.quaternion.copy(_q.setFromEuler(new THREE.Euler(it.a.x, 0, it.b.x))).multiply(it.restQ)
        }""", """        } else {
          // tipped on its base's rim: turned about its bottom, the low side's edge staying on the desk
          _q.setFromEuler(new THREE.Euler(it.a.x, 0, it.b.x))
          it.m.quaternion.copy(_q).multiply(it.restQ)
          const base = rest.clone().setY(rest.y - it.halfH)
          it.m.position.copy(rest).sub(base).applyQuaternion(_q).add(base)
          it.m.position.y += Math.sin(Math.hypot(it.a.x, it.b.x)) * it.r
        }""")
s = s.replace("type P = { m: THREE.Mesh; kind: 'roll' | 'hop' | 'tip'; axis: THREE.Vector3; r: number; a: Spring; b: Spring; y: Spring; restQ: THREE.Quaternion }",
              "type P = { m: THREE.Mesh; kind: 'roll' | 'hop' | 'tip'; axis: THREE.Vector3; r: number; halfH: number; a: Spring; b: Spring; y: Spring; restQ: THREE.Quaternion }")
s = s.replace("      r: Math.min(...[s.x, s.y, s.z]) / 2,\n", "      r: kind === 'tip' ? Math.max(s.x, s.z) / 2 : Math.min(...[s.x, s.y, s.z]) / 2,\n      halfH: s.y / 2,\n")
# printer: rigid rock
i = s.index("/** the printer: its lid pops up")
s = s[:i] + '''/** the printer: a rigid box on four feet — pushed, it rocks up on the far edge and drops back,
 *  and slides a few millimetres. Nothing on it bends */
export function printerReactor(printer: THREE.Group): Reactor {
  const tx = new Spring(420, 11) // tilt about x and z (radians)
  const tz = new Spring(420, 11)
  const sx = new Spring(260, 14) // slide (m)
  const sz = new Spring(260, 14)
  const restPos = printer.position.clone()
  const restQ = printer.quaternion.clone()
  const size = new THREE.Box3().setFromObject(printer).getSize(new THREE.Vector3())
  return {
    hit: printer,
    react(dir, amt) {
      tx.v += dir.z * amt * 1.1
      tz.v += -dir.x * amt * 1.1
      sx.v += dir.x * amt * 0.05
      sz.v += dir.z * amt * 0.05
    },
    step(dt) {
      const h = H(dt)
      for (const s of [tx, tz, sx, sz]) s.step(h)
      // only ever up on an edge (a box can't tip into the desk): the tilt is folded to its edge
      printer.quaternion.copy(_q.setFromEuler(new THREE.Euler(tx.x, 0, tz.x))).premultiply(new THREE.Quaternion()).multiply(restQ)
      printer.quaternion.copy(_q.setFromEuler(new THREE.Euler(tx.x, 0, tz.x))).multiply(restQ)
      printer.position.copy(restPos)
      printer.position.x += sx.x
      printer.position.z += sz.x
      printer.position.y += Math.abs(Math.sin(tx.x)) * size.z * 0.5 + Math.abs(Math.sin(tz.x)) * size.x * 0.5
    },
  }
}

/** the desk lamp: swings round on its base pivot (slow, heavy arms) and the shade nods on its hinge */
export function lampReactor(lamp: THREE.Object3D, swivel: THREE.Object3D, head: THREE.Object3D): Reactor & { swing: () => number } {
  const yaw = new Spring(30, 2.2)
  const nod = new Spring(110, 5)
  const swivelQ = swivel.quaternion.clone()
  const headQ = head.quaternion.clone()
  return {
    hit: lamp,
    swing: () => yaw.x,
    react(dir, amt, point) {
      const p = swivel.getWorldPosition(new THREE.Vector3())
      const r = _v.subVectors(point, p).setY(0)
      yaw.v += (Math.sign(r.x * dir.z - r.z * dir.x) || 1) * amt * 1.6
      nod.v += amt * 2.2 * (Math.random() < 0.5 ? 1 : -1)
    },
    step(dt) {
      const h = H(dt)
      yaw.step(h)
      nod.step(h)
      swivel.quaternion.copy(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw.x)).multiply(swivelQ)
      head.quaternion.copy(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), nod.x)).multiply(headQ)
    },
  }
}
'''
s = s.replace("      printer.quaternion.copy(_q.setFromEuler(new THREE.Euler(tx.x, 0, tz.x))).premultiply(new THREE.Quaternion()).multiply(restQ)\n", "")
open(R + 'src/behind/DeskReactions.ts', 'w', encoding='utf-8').write(s)

# ---------------------------------------------------------------- PaperDesk
edit('src/behind/PaperDesk.ts', [
    ("import { Spring, flatten, deskReactor, pensReactor, binReactor, printerReactor, type Reactor } from './DeskReactions'",
     "import { Spring, flatten, deskReactor, pensReactor, binReactor, printerReactor, lampReactor, type Reactor } from './DeskReactions'"),
    ("""    const [deskSrc, pensSrc, printerSrc, crumple] = await Promise.all([""",
     """    const [deskSrc, pensSrc, printerSrc, lampSrc, crumple] = await Promise.all(["""),
    ("""      loader.loadAsync(`${BASE}models/printer/printer.glb`).then((g) => g.scene),""",
     """      loader.loadAsync(`${BASE}models/printer/printer.glb`).then((g) => g.scene),
      // Poly Haven's desk_lamp_arm_01, posed lower in Blender (tools: scratchpad pose_lamp.py) and cut
      // into its three rigid parts: base (clamp), swivel (arms, springs) and head, each on its pivot
      loader.loadAsync(`${BASE}models/desk_lamp_arm_01/lamp_posed.glb`).then((g) => g.scene),"""),
    ("""    this.reactors = [deskReactor(desk, (amt) => this.bumpDesk(amt)), pensReactor(pens), this.binR, printer]""",
     """    const lamp = this.buildLamp(lampSrc)
    this.reactors = [deskReactor(desk), pensReactor(pens), this.binR, printer, lamp]"""),
    # key light from the lamp's head
    ("""    const key = new THREE.DirectionalLight(0xfff2e0, 3.4)
    key.position.set(-0.6, this.deskTop + 0.75, 0.1)
    key.target.position.set(0.2, this.deskTop, 0.15)
    this.scene.add(key, key.target)""", """    const key = new THREE.DirectionalLight(0xfff2e0, 3.4)
    this.scene.add(key, key.target)
    this.key = key
    this.aimLampLight()"""),
    ("  private printerSlot = new THREE.Vector3()\n", """  private printerSlot = new THREE.Vector3()
  private key?: THREE.DirectionalLight
  private lampHead?: THREE.Object3D
  private lampSwing?: () => number
"""),
    # remove bumpDesk
    ("""  /** a knock on the desk top: everything lying on it hops */
  private bumpDesk(amt: number): void {
    for (const r of this.reactors) r.bump?.(amt)
    for (const q of this.sheets) {
      if (q.body) {
        const t = q.body.translation()
        if (Math.abs(t.y - (this.deskTop + BALL_R)) < 0.02) q.body.applyImpulse({ x: 0, y: q.body.mass() * amt * 0.7, z: 0 }, true)
      } else if (q !== this.held) (q.mesh.userData.hop as Spring).v += amt * 0.18
    }
  }
""", """  /** the lamp, clamped to the desk's back edge, shade over the desk */
  private buildLamp(src: THREE.Object3D): Reactor {
    const base = src.getObjectByName('lamp_base')!
    const swivel = src.getObjectByName('lamp_swivel')!
    const head = src.getObjectByName('lamp_head')!
    const lamp = new THREE.Group()
    lamp.add(src)
    // the swivel's pivot (the base node's origin) onto the desk's back edge
    src.position.copy(base.position).negate()
    lamp.position.set(LAMP_AT.x, this.deskTop, LAMP_AT.z)
    lamp.rotation.y = LAMP_AT.yaw
    this.addChalk(lamp)
    this.lampHead = head
    const r = lampReactor(lamp, swivel, head)
    this.lampSwing = r.swing
    return r
  }

  /** the key light comes from the lamp's shade, and turns with it */
  private aimLampLight(): void {
    if (!this.key || !this.lampHead) return
    this.lampHead.updateWorldMatrix(true, false)
    const p = this.lampHead.getWorldPosition(new THREE.Vector3())
    this.key.position.copy(p)
    const toSheet = new THREE.Vector3(this.sheetSpot.x, this.deskTop, this.sheetSpot.z).sub(p).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.lampSwing?.() ?? 0)
    this.key.target.position.copy(p).add(toSheet)
  }
"""),
    ("    for (const r of this.reactors) r.step(dt)\n", "    for (const r of this.reactors) r.step(dt)\n    this.aimLampLight()\n"),
    ("const PRINTER_AT = { x: 0.1, z: -0.27, yaw: 0.12 }", "const PRINTER_AT = { x: 0.1, z: -0.27, yaw: 0.12 }\nconst LAMP_AT = { x: -0.5, z: -0.47, yaw: 1.85 } // clamped to the back edge, shade toward the sheet"),
    # sheet homes
    ("    mesh.userData.yaw = new Spring(90, 7)\n", "    mesh.userData.yaw = new Spring(90, 7)\n    // where it lies when nobody holds it (a printed one: on the printer's tray)\n    mesh.userData.home = new THREE.Vector3(this.sheetSpot.x, this.deskTop + 0.0012, this.sheetSpot.z)\n    mesh.userData.homeYaw = this.sheetYaw\n"),
    ("""        const target = this._v.set(this.sheetSpot.x, this.deskTop + 0.0012 + lift * 0.16, this.sheetSpot.z + lift * 0.12)""",
     """        const home = s.mesh.userData.home as THREE.Vector3
        const target = this._v.set(home.x, home.y + lift * 0.16, home.z + lift * 0.12)"""),
    ("""        const ty = this.deskTop + 0.0012 + q.crumple * BALL_R * 0.9
        q.mesh.position.lerp(this._v.set(this.sheetSpot.x, ty, this.sheetSpot.z), Math.min(1, dt * 6))""",
     """        const home = q.mesh.userData.home as THREE.Vector3
        const ty = home.y + q.crumple * BALL_R * 0.9
        q.mesh.position.lerp(this._v.set(home.x, ty, home.z), Math.min(1, dt * 6))"""),
    ("""      q.mesh.position.y = this.deskTop + 0.0012 + q.crumple * BALL_R * 0.9 + Math.max(0, (q.mesh.userData.hop as Spring).x)
      q.mesh.rotation.y = this.sheetYaw + (q.mesh.userData.yaw as Spring).x""",
     """      q.mesh.position.y = (q.mesh.userData.home as THREE.Vector3).y + q.crumple * BALL_R * 0.9 + Math.max(0, (q.mesh.userData.hop as Spring).x)
      q.mesh.rotation.y = (q.mesh.userData.homeYaw as number) + (q.mesh.userData.yaw as Spring).x"""),
    # render: drop the slide loop
    ("""    // a slid-in draft eases into place
    for (const s of this.sheets) {
      if (s.mesh.userData.slide === undefined) continue
      const z = THREE.MathUtils.lerp(s.mesh.position.z, this.sheetSpot.z, 0.08)
      s.mesh.position.z = z
      if (Math.abs(z - this.sheetSpot.z) < 0.0005) delete s.mesh.userData.slide
      const m = s.mesh.material as THREE.MeshStandardMaterial
      m.emissiveIntensity = PAPER_GLOW
      m.color.setScalar(1)
    }
""", ""),
])

# the print: fed out smoothly, and it stays on the tray (picked up from there)
s = open(R + 'src/behind/PaperDesk.ts', encoding='utf-8').read()
i = s.index("  private stepPrint(dt: number): void {")
j = s.index("  private addChalk(o: THREE.Object3D): void {")
s = s[:i] + '''  private stepPrint(dt: number): void {
    const pr = this.printing
    if (!pr) return
    pr.t += dt
    const m = pr.s.mesh
    // a printer's feed: a short wait while it pulls the sheet in, then out at an even pace, its
    // rollers giving it a faint tremble — and it stays on the output tray, taken from there
    const k = THREE.MathUtils.clamp((pr.t - PRINT_WAIT) / PRINT_FEED, 0, 1)
    const fed = k * k * (3 - 2 * k) * 0.15 + k * 0.85
    const tremble = k > 0 && k < 1 ? Math.sin(pr.t * 90) * 0.0004 : 0
    const yaw = this.printerYaw()
    const mid = this.flatCentre.clone().setY(0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
    m.position.copy(this.printerSlot).addScaledVector(this.printerFwd, (fed - 0.5) * SHEET_H + tremble).sub(mid)
    m.rotation.y = yaw
    if (k >= 1) {
      ;(m.userData.home as THREE.Vector3).copy(m.position)
      m.userData.homeYaw = yaw
      this.active = pr.s
      this.printing = undefined
    }
  }

''' + s[j:]
s = s.replace("const PRINT_FEED = 2.2 // s to feed a sheet out\nconst PRINT_LAY = 0.8\n", "const PRINT_WAIT = 0.6 // s: the printer taking the sheet in\nconst PRINT_FEED = 2.6 // s to feed it out\n")
s = s.replace("    return printerReactor(pr, lid)", "    void lid\n    return printerReactor(pr)")
open(R + 'src/behind/PaperDesk.ts', 'w', encoding='utf-8').write(s)
print('ok')
