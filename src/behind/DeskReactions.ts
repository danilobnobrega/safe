import * as THREE from 'three'

/**
 * (/hero-paper*) How each thing in the desk scene answers the cursor, as oryzo.ai's hero does: no
 * click — just passing over it. Every object has its own reaction (Danilo: "todo objeto tem sua
 * reação"), each a few springs that kick and settle back:
 *
 *   desk     the drawers it's over slide out, one after the other, and back
 *   pens     each pen or pencil rolls on the desk about its own length; the eraser hops and turns;
 *            the cup tips — the one under the cursor most, its neighbours after it, less
 *   bin      spins round on its base, wobbling on its rim, and takes a while to settle (it's light)
 *   printer  its motor wakes: the panel light flares and the box hums for a moment
 *   lamp     swings round on its base pivot and the shade nods on its hinge; its light goes with it
 *
 * The sheet on the desk and the balls of paper react in PaperDesk itself (they're the game's).
 */

/** a damped spring on one number */
export class Spring {
  x = 0
  v = 0
  constructor(
    public k = 300,
    public c = 20,
  ) {}
  step(h: number): void {
    this.v += -this.k * this.x * h
    this.v *= Math.max(0, 1 - this.c * h)
    this.x += this.v * h
  }
}

export interface Reactor {
  /** what the cursor's ray is tested against */
  hit: THREE.Object3D
  /** the cursor passed over `part` at `point`, going `dir` (on the floor), `amt` ~0.2 .. 1.4 */
  react(dir: THREE.Vector3, amt: number, point: THREE.Vector3, part: THREE.Object3D): void
  /** the desk top jolted: things on it hop */
  bump?(amt: number): void
  step(dt: number): void
}

/** the scene as one group of meshes in its own space: each mesh's geometry baked to world, then
 *  re-centred on itself (so a part can turn about its own middle), named as in the file */
export function flatten(src: THREE.Object3D): THREE.Group {
  src.updateMatrixWorld(true)
  const g = new THREE.Group()
  src.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld)
    geo.computeBoundingBox()
    const centre = geo.boundingBox!.getCenter(new THREE.Vector3())
    geo.translate(-centre.x, -centre.y, -centre.z)
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
    const out = new THREE.Mesh(geo, m.material)
    out.name = m.name || m.parent?.name || ''
    out.position.copy(centre)
    out.userData.rest = centre.clone()
    g.add(out)
  })
  return g
}

/** a queue of delayed kicks, so a reaction can ripple from one part to the next */
class Later {
  private q: { t: number; fn: () => void }[] = []
  private now = 0
  add(delay: number, fn: () => void): void {
    this.q.push({ t: this.now + delay, fn })
  }
  step(dt: number): void {
    this.now += dt
    for (let i = this.q.length - 1; i >= 0; i--)
      if (this.q[i].t <= this.now) {
        const f = this.q[i].fn
        this.q.splice(i, 1)
        f()
      }
  }
}

const H = (dt: number) => Math.min(dt, 1 / 30)
const _q = new THREE.Quaternion()
const _v = new THREE.Vector3()

/** desk: the drawers slide out and back (the top stays put — Danilo) */
export function deskReactor(desk: THREE.Group): Reactor {
  const later = new Later()
  const parts = desk.children as THREE.Mesh[]
  const drawers = parts.filter((p) => /drawer|tray/.test(p.name)).map((m) => ({ m, s: new Spring(150, 8) }))
  return {
    hit: desk,
    react(_dir, amt, _point, part) {
      // only the drawer under the cursor (each thing answers on its own — Danilo)
      const d = drawers.find((q) => q.m === part)
      if (d) d.s.v += amt * 0.6
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

/** pens, pencils, eraser, cup: each its own way */
export function pensReactor(pens: THREE.Group): Reactor {
  const later = new Later()
  type P = { m: THREE.Mesh; kind: 'roll' | 'hop' | 'tip'; axis: THREE.Vector3; r: number; halfH: number; a: Spring; b: Spring; y: Spring; restQ: THREE.Quaternion }
  const items: P[] = (pens.children as THREE.Mesh[]).map((m) => {
    const s = m.geometry.boundingBox!.getSize(new THREE.Vector3())
    const long = s.x >= s.y && s.x >= s.z ? new THREE.Vector3(1, 0, 0) : s.z >= s.y ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    const kind = /cup/.test(m.name) ? 'tip' : /eraser/.test(m.name) ? 'hop' : 'roll'
    return {
      m,
      kind,
      axis: long,
      r: kind === 'tip' ? Math.max(s.x, s.z) / 2 : Math.min(...[s.x, s.y, s.z]) / 2,
      halfH: s.y / 2,
      a: new Spring(kind === 'roll' ? 70 : 240, kind === 'roll' ? 6 : 12), // a roll: slow, rocks back
      b: new Spring(260, 12),
      y: new Spring(500, 16),
      restQ: m.quaternion.clone(),
    }
  })
  const up = new THREE.Vector3(0, 1, 0)
  return {
    hit: pens,
    react(dirW, amt, point, part) {
      const dir = dirW.clone().applyQuaternion(pens.quaternion.clone().invert()) // (the parts' own space)
      const hitItem = items.find((i) => i.m === part)
      const local = pens.worldToLocal(point.clone())
      for (const it of items) {
        const d = it.m.position.distanceTo(local)
        // only the one under the cursor: no ripple to its neighbours
        if (it !== hitItem) continue
        const k = 1
        void d
        later.add(0, () => {
          // which way the push turns it: across its length, the way the cursor went
          const side = Math.sign(_v.crossVectors(it.axis, up).dot(dir) || 1)
          if (it.kind === 'roll') it.a.v += side * amt * 9 * k
          else if (it.kind === 'hop') {
            it.y.v += amt * 0.35 * k
            it.a.v += (Math.random() - 0.5) * amt * 14 * k
          } else {
            it.a.v += dir.z * amt * 3 * k
            it.b.v += -dir.x * amt * 3 * k
          }
        })
      }
    },
    bump(amt) {
      items.forEach((it, i) => later.add(0.02 + i * 0.012, () => (it.y.v += amt * (0.12 + Math.random() * 0.12))))
    },
    step(dt) {
      later.step(dt)
      const h = H(dt)
      for (const it of items) {
        it.a.step(h)
        it.b.step(h)
        it.y.step(h)
        const rest = it.m.userData.rest as THREE.Vector3
        it.m.position.copy(rest)
        it.m.position.y += Math.max(0, it.y.x)
        if (it.kind === 'roll') {
          // rolling: turned about its length, and carried sideways by the arc it rolled
          it.m.quaternion.copy(_q.setFromAxisAngle(it.axis, it.a.x)).multiply(it.restQ)
          it.m.position.addScaledVector(_v.crossVectors(it.axis, up).normalize(), -it.a.x * it.r)
        } else if (it.kind === 'hop') {
          it.m.quaternion.copy(_q.setFromAxisAngle(up, it.a.x)).multiply(it.restQ)
        } else {
          // tipped on its base's rim: turned about its bottom, the low side's edge staying on the desk
          _q.setFromEuler(new THREE.Euler(it.a.x, 0, it.b.x))
          it.m.quaternion.copy(_q).multiply(it.restQ)
          const base = rest.clone().setY(rest.y - it.halfH)
          it.m.position.copy(rest).sub(base).applyQuaternion(_q).add(base)
          it.m.position.y += Math.sin(Math.hypot(it.a.x, it.b.x)) * it.r
        }
      }
    },
  }
}

/** the bin: spins on its base, wobbles on its rim — a light metal bin, slow to settle */
export function binReactor(bin: THREE.Object3D): Reactor & { rock(dir: THREE.Vector3, amt: number): void } {
  const yaw = new Spring(18, 1.6)
  const tx = new Spring(220, 9)
  const tz = new Spring(220, 9)
  const restQ = bin.quaternion.clone()
  const rock = (dir: THREE.Vector3, amt: number) => {
    tx.v += dir.z * amt * 2.2
    tz.v += -dir.x * amt * 2.2
  }
  return {
    hit: bin,
    rock,
    react(dir, amt, point) {
      // brushed on one side, it turns: which way depends on the side and the direction
      const r = _v.subVectors(point, bin.position).setY(0)
      const spin = Math.sign(r.z * dir.x - r.x * dir.z) || 1
      yaw.v += spin * amt * 2.4
      rock(dir, amt * 0.5)
    },
    step(dt) {
      const h = H(dt)
      yaw.step(h)
      tx.step(h)
      tz.step(h)
      bin.quaternion.copy(_q.setFromEuler(new THREE.Euler(tx.x, yaw.x, tz.x))).multiply(restQ)
    },
  }
}

/** the printer: brushed, its motor wakes — the panel light flares and the box hums for a moment
 *  (a fraction of a millimetre, the whole box at once: nothing bends) */
export function printerReactor(printer: THREE.Group, light?: THREE.MeshBasicMaterial): Reactor {
  const restPos = printer.position.clone()
  let hum = 0 // s of humming left
  let flare = 0
  const base = new THREE.Color(0xff9a4d)
  const hot = new THREE.Color(0xffd2a8)
  return {
    hit: printer,
    react(_dir, amt) {
      hum = Math.max(hum, 0.35 + amt * 0.25)
      flare = 1
    },
    step(dt) {
      hum = Math.max(0, hum - dt)
      flare = Math.max(0, flare - dt * 2.5)
      const a = Math.min(1, hum / 0.2) * 0.0007
      const t = performance.now() / 1000
      printer.position.set(restPos.x + Math.sin(t * 173) * a, restPos.y + Math.abs(Math.sin(t * 241)) * a * 0.6, restPos.z + Math.sin(t * 197 + 1) * a)
      if (light) light.color.copy(base).lerp(hot, flare)
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
      yaw.v += (Math.sign(r.z * dir.x - r.x * dir.z) || 1) * amt * 1.6
      // the shade tips the way it was pushed: about its hinge (its local z), by how much the push
      // runs along its local x
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).setY(0)
      nod.v += -Math.sign(side.dot(dir) || 1) * amt * 2.2
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

/** TEST (?props=mix): an alarm clock — brushed, it rings: a hard, fast rattle that walks it about
 *  on the desk for a moment */
export function clockReactor(clock: THREE.Object3D): Reactor {
  const restPos = clock.position.clone()
  const restQ = clock.quaternion.clone()
  let ring = 0
  return {
    hit: clock,
    react(_dir, amt) {
      ring = Math.max(ring, 0.5 + amt * 0.5)
    },
    step(dt) {
      ring = Math.max(0, ring - dt)
      const a = Math.min(1, ring / 0.25)
      const t = performance.now() / 1000
      clock.position.set(restPos.x + Math.sin(t * 90) * 0.002 * a, restPos.y + Math.abs(Math.sin(t * 70)) * 0.003 * a, restPos.z + Math.sin(t * 83 + 2) * 0.002 * a)
      clock.quaternion.copy(_q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(t * 60) * 0.06 * a)).multiply(restQ)
    },
  }
}

/** TEST (?props=mix): a stack of books — the one under the cursor slides out of the stack the way
 *  it was pushed, and back */
export function booksReactor(books: THREE.Group): Reactor {
  const items = (books.children as THREE.Mesh[]).map((m) => ({ m, x: new Spring(120, 9), z: new Spring(120, 9) }))
  return {
    hit: books,
    react(dirW, amt, _point, part) {
      const it = items.find((i) => i.m === part)
      if (!it) return
      const dir = dirW.clone().applyQuaternion(books.quaternion.clone().invert())
      it.x.v += dir.x * amt * 0.5
      it.z.v += dir.z * amt * 0.5
    },
    step(dt) {
      const h = H(dt)
      for (const it of items) {
        it.x.step(h)
        it.z.step(h)
        it.m.position.copy(it.m.userData.rest as THREE.Vector3)
        it.m.position.x += THREE.MathUtils.clamp(it.x.x, -0.06, 0.06)
        it.m.position.z += THREE.MathUtils.clamp(it.z.x, -0.06, 0.06)
      }
    },
  }
}

/** TEST (?props=mix): a potted succulent — tips on the pot's rim the way it was pushed, and rocks
 *  back to stand */
export function plantReactor(plant: THREE.Object3D, radius: number): Reactor {
  const tx = new Spring(260, 7)
  const tz = new Spring(260, 7)
  const restPos = plant.position.clone()
  const restQ = plant.quaternion.clone()
  return {
    hit: plant,
    react(dir, amt) {
      tx.v += dir.z * amt * 1.6
      tz.v += -dir.x * amt * 1.6
    },
    step(dt) {
      const h = H(dt)
      tx.step(h)
      tz.step(h)
      plant.quaternion.copy(_q.setFromEuler(new THREE.Euler(tx.x, 0, tz.x))).multiply(restQ)
      plant.position.copy(restPos)
      plant.position.y += Math.sin(Math.hypot(tx.x, tz.x)) * radius
    },
  }
}
