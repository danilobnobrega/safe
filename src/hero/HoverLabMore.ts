// TEST (/hero-hovers-2.html): the hover lab's second set — every idea from the lists that wasn't in
// the first one. Same engine (HoverLab.ts); the hover's name shows top right.
import { ShapeUtils, Vector2 } from 'three'
import { TILT } from '../ui/tilt'
import {
  type Hover,
  type Letter,
  type Sprite,
  BASE,
  DPR,
  FACES,
  H,
  INK,
  LOOK,
  ORANGE,
  PAPER,
  S,
  W,
  bake,
  beginLetter,
  clamp,
  ctx,
  dist,
  drawSprite,
  ease,
  hatchPattern,
  label,
  letters,
  m,
  pick,
  pre,
  randomStyle,
  rnd,
  time,
  toLocal,
} from './HoverLab'

// ---- iso-lines: marching squares with interpolated edges, linked into closed loops --------------
type Pt = { x: number; y: number }
/** closed loops where f crosses `level`, in grid units; f outside the grid counts as 0 */
function isoLoops(nx: number, ny: number, f: (i: number, j: number) => number, level: number): Pt[][] {
  const v = new Float32Array((nx + 2) * (ny + 2))
  const at = (i: number, j: number) => v[(j + 1) * (nx + 2) + (i + 1)]
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[(j + 1) * (nx + 2) + (i + 1)] = f(i, j)
  const pts = new Map<number, Pt>()
  const segs: [number, number][] = []
  const X = nx + 2
  // edge ids: horizontal (i,j)-(i+1,j) = 2*k, vertical (i,j)-(i,j+1) = 2*k+1, k = (j+1)*X + (i+1)
  const hEdge = (i: number, j: number) => {
    const id = 2 * ((j + 1) * X + (i + 1))
    if (!pts.has(id)) {
      const a = at(i, j)
      const b = at(i + 1, j)
      pts.set(id, { x: i + (level - a) / (b - a), y: j })
    }
    return id
  }
  const vEdge = (i: number, j: number) => {
    const id = 2 * ((j + 1) * X + (i + 1)) + 1
    if (!pts.has(id)) {
      const a = at(i, j)
      const b = at(i, j + 1)
      pts.set(id, { x: i, y: j + (level - a) / (b - a) })
    }
    return id
  }
  for (let j = -1; j < ny; j++)
    for (let i = -1; i < nx; i++) {
      const c = (at(i, j) > level ? 8 : 0) | (at(i + 1, j) > level ? 4 : 0) | (at(i + 1, j + 1) > level ? 2 : 0) | (at(i, j + 1) > level ? 1 : 0)
      if (c === 0 || c === 15) continue
      const T = () => hEdge(i, j)
      const B = () => hEdge(i, j + 1)
      const L = () => vEdge(i, j)
      const R = () => vEdge(i + 1, j)
      switch (c) {
        case 1: case 14: segs.push([L(), B()]); break
        case 2: case 13: segs.push([B(), R()]); break
        case 3: case 12: segs.push([L(), R()]); break
        case 4: case 11: segs.push([T(), R()]); break
        case 6: case 9: segs.push([T(), B()]); break
        case 7: case 8: segs.push([L(), T()]); break
        case 5: segs.push([L(), T()], [B(), R()]); break
        case 10: segs.push([T(), R()], [L(), B()]); break
      }
    }
  const by = new Map<number, number[]>()
  segs.forEach(([a, b], k) => {
    for (const e of [a, b]) {
      const l = by.get(e)
      if (l) l.push(k)
      else by.set(e, [k])
    }
  })
  const used = new Uint8Array(segs.length)
  const loops: Pt[][] = []
  for (let k0 = 0; k0 < segs.length; k0++) {
    if (used[k0]) continue
    used[k0] = 1
    const start = segs[k0][0]
    let cur = segs[k0][1]
    const loop = [pts.get(start)!]
    for (let guard = 0; cur !== start && guard < segs.length; guard++) {
      loop.push(pts.get(cur)!)
      const next = (by.get(cur) ?? []).find((k) => !used[k])
      if (next === undefined) break
      used[next] = 1
      cur = segs[next][0] === cur ? segs[next][1] : segs[next][0]
    }
    if (loop.length > 2) loops.push(loop)
  }
  return loops
}
/** Ramer–Douglas–Peucker on a closed loop */
function simplify(loop: Pt[], eps: number): Pt[] {
  const rdp = (a: number, b: number, out: Pt[]) => {
    let far = -1
    let fd = eps
    const A = loop[a]
    const B = loop[b % loop.length]
    const dx = B.x - A.x
    const dy = B.y - A.y
    const len = Math.hypot(dx, dy) || 1
    for (let k = a + 1; k < b; k++) {
      const P = loop[k]
      const d = Math.abs((P.x - A.x) * dy - (P.y - A.y) * dx) / len
      if (d > fd) {
        fd = d
        far = k
      }
    }
    if (far < 0) {
      out.push(A)
      return
    }
    rdp(a, far, out)
    rdp(far, b, out)
  }
  // split at the point farthest from the first, so both halves are open
  let half = 0
  let hd = -1
  for (let k = 1; k < loop.length; k++) {
    const d = Math.hypot(loop[k].x - loop[0].x, loop[k].y - loop[0].y)
    if (d > hd) {
      hd = d
      half = k
    }
  }
  const out: Pt[] = []
  rdp(0, half, out)
  rdp(half, loop.length, out)
  return out
}
const area = (p: Pt[]) => p.reduce((a, q, k) => a + q.x * p[(k + 1) % p.length].y - p[(k + 1) % p.length].x * q.y, 0) / 2
function inside(p: Pt, poly: Pt[]): boolean {
  let c = false
  for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
    const A = poly[a]
    const B = poly[b]
    if (A.y > p.y !== B.y > p.y && p.x < ((B.x - A.x) * (p.y - A.y)) / (B.y - A.y) + A.x) c = !c
  }
  return c
}

/** a sprite's glyph outlines, in its own space (baseline-left origin, px), cached */
type Shape = { loops: Pt[][]; outers: { outer: Pt[]; holes: Pt[][] }[] }
const shapes = new WeakMap<Sprite, Map<number, Shape>>()
function shapeOf(sp: Sprite, detail = 1): Shape {
  let per = shapes.get(sp)
  if (!per) shapes.set(sp, (per = new Map()))
  const hit = per.get(detail)
  if (hit) return hit
  const g = sp.cv.getContext('2d')!
  const img = g.getImageData(0, 0, sp.cv.width, sp.cv.height).data
  const step = Math.max(1, Math.round((sp.cv.height / 90) * (detail < 1 ? 1.4 : 1)))
  const nx = Math.ceil(sp.cv.width / step)
  const ny = Math.ceil(sp.cv.height / step)
  const raw = isoLoops(nx, ny, (i, j) => img[((j * step) * sp.cv.width + i * step) * 4 + 3] / 255, 0.5)
  const k = step / DPR
  const loops = raw
    .map((l) => simplify(l, 0.55 / detail).map((p) => ({ x: p.x * k - sp.ox, y: p.y * k - sp.oy })))
    .filter((l) => l.length > 2 && Math.abs(area(l)) > 4)
  // outers and their holes, by nesting depth
  const order = [...loops].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)))
  const outers: Shape['outers'] = []
  for (const l of order) {
    const holders = outers.filter((o) => inside(l[0], o.outer) && !o.holes.some((h) => inside(l[0], h)))
    const holder = holders[holders.length - 1]
    if (holder && !outers.some((o) => o.holes.some((h) => inside(l[0], h)))) holder.holes.push(l)
    else outers.push({ outer: l, holes: [] })
  }
  const s: Shape = { loops, outers }
  per.set(detail, s)
  return s
}
function pathOf(loops: Pt[][]): Path2D {
  const p = new Path2D()
  for (const l of loops) {
    l.forEach((q, k) => (k ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)))
    p.closePath()
  }
  return p
}
const hatchesCss = new Map<string, CanvasPattern>()
/** hatching for drawing in CSS px (the pattern itself is made at device px) */
function hatchCss(line = INK, bg: string | null = PAPER, alpha = 0.34): CanvasPattern {
  const k = `${line}|${bg}|${alpha}`
  let h = hatchesCss.get(k)
  if (!h) {
    h = hatchPattern(line, bg, alpha)
    h.setTransform(new DOMMatrix().scale(1 / DPR))
    hatchesCss.set(k, h)
  }
  return h
}
const near = (l: Letter, reach: number) => clamp(1 - dist(l.center()) / reach, 0, 1)
const sprite = (l: Letter) => l.sprite()

// 1 · bézier: the letter shows its anchor points and handles; the cursor grabs a point and pulls,
// the outline stretches and, let go, wobbles back
function bezier(): Hover {
  type P = { x: number; y: number; dx: number; dy: number; vx: number; vy: number; tx: number; ty: number }
  const state = new Map<Letter, { sp: Sprite; loops: P[][] }>()
  let grab: { l: Letter; c: number; k: number } | null = null
  const get = (l: Letter) => {
    const sp = sprite(l)
    let st = state.get(l)
    if (!st || st.sp !== sp) {
      st = { sp, loops: shapeOf(sp, 0.55).loops.map((lp) => lp.map((q) => ({ x: q.x, y: q.y, dx: 0, dy: 0, vx: 0, vy: 0, tx: 0, ty: 0 }))) }
      state.set(l, st)
      if (grab?.l === l) grab = null
    }
    return st
  }
  return {
    name: 'bezier',
    title: 'bézier',
    exit() {
      state.clear()
      grab = null
    },
    update(dt) {
      for (const l of letters) {
        const st = get(l)
        const lc = toLocal(l, m.x, m.y)
        const reach = (0.12 * S) / l.s
        for (const lp of st.loops) for (const p of lp) p.tx = p.ty = 0
        if (!grab && m.on) {
          let best = reach
          st.loops.forEach((lp, c) =>
            lp.forEach((p, k) => {
              const d = Math.hypot(p.x + p.dx - lc.x, p.y + p.dy - lc.y)
              if (d < best) {
                best = d
                grab = { l, c, k }
              }
            }),
          )
        }
        if (grab && grab.l === l) {
          const lp = st.loops[grab.c]
          const p = lp[grab.k]
          const ox = lc.x - p.x
          const oy = lc.y - p.y
          if (Math.hypot(ox, oy) > (0.5 * S) / l.s || !m.on) grab = null
          else
            for (let n = -4; n <= 4; n++) {
              const q = lp[(grab.k + n + lp.length) % lp.length]
              const w = Math.max(0, 1 - Math.abs(n) / 5) ** 1.5
              q.tx = ox * w
              q.ty = oy * w
            }
        }
        for (const lp of st.loops)
          for (const p of lp) {
            p.vx += (380 * (p.tx - p.dx) - 7 * p.vx) * dt
            p.vy += (380 * (p.ty - p.dy) - 7 * p.vy) * dt
            p.dx += p.vx * dt
            p.dy += p.vy * dt
          }
      }
    },
    paint(l) {
      const st = get(l)
      const a = near(l, 1.6 * S)
      beginLetter(l, st.sp)
      // the outline through the points (Catmull-Rom as béziers)
      const path = new Path2D()
      const handles: [Pt, Pt, Pt, boolean][] = []
      st.loops.forEach((lp, c) => {
        const P = (k: number) => {
          const p = lp[(k + lp.length) % lp.length]
          return { x: p.x + p.dx, y: p.y + p.dy }
        }
        path.moveTo(P(0).x, P(0).y)
        for (let k = 0; k < lp.length; k++) {
          const p0 = P(k - 1)
          const p1 = P(k)
          const p2 = P(k + 1)
          const p3 = P(k + 2)
          const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
          const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
          path.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y)
          const h0 = { x: p1.x - (p2.x - p0.x) / 6, y: p1.y - (p2.y - p0.y) / 6 }
          handles.push([p1, h0, c1, !!grab && grab.l === l && grab.c === c && grab.k === k])
        }
        path.closePath()
      })
      const col = l.style.col
      if (col && LOOK === 'cheio') {
        ctx.fillStyle = col
        ctx.fill(path, 'evenodd')
        ctx.globalAlpha = 0.22
        ctx.fillStyle = hatchCss(INK, null)
        ctx.fill(path, 'evenodd')
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = col ? hatchCss(col, PAPER, 0.75) : hatchCss()
        ctx.fill(path, 'evenodd')
      }
      ctx.strokeStyle = col && LOOK === 'lapis' ? col : INK
      ctx.globalAlpha = 0.9
      ctx.lineWidth = 1.5 / l.s
      ctx.stroke(path)
      if (a > 0.01) {
        const u = 1 / l.s
        for (const [p, h0, h1, hot] of handles) {
          ctx.globalAlpha = (hot ? 1 : 0.55) * a
          ctx.strokeStyle = hot ? ORANGE : INK
          ctx.lineWidth = u
          ctx.beginPath()
          ctx.moveTo(h0.x, h0.y)
          ctx.lineTo(h1.x, h1.y)
          ctx.stroke()
          ctx.fillStyle = hot ? ORANGE : INK
          for (const h of [h0, h1]) {
            ctx.beginPath()
            ctx.arc(h.x, h.y, 2.2 * u, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = a
          ctx.fillStyle = hot ? ORANGE : PAPER
          ctx.fillRect(p.x - 3 * u, p.y - 3 * u, 6 * u, 6 * u)
          ctx.strokeStyle = hot ? ORANGE : INK
          ctx.strokeRect(p.x - 3 * u, p.y - 3 * u, 6 * u, 6 * u)
        }
      }
      ctx.restore()
      return true
    },
  }
}

// 2 · wireframe: near the cursor the letter shows the triangles a GPU would draw it with
function wireframe(): Hover {
  const tris = new WeakMap<Sprite, { pts: Pt[]; idx: number[][] }>()
  const mesh = (sp: Sprite) => {
    let t = tris.get(sp)
    if (t) return t
    const pts: Pt[] = []
    const idx: number[][] = []
    for (const o of shapeOf(sp, 0.7).outers) {
      const base = pts.length
      const outer = o.outer.map((p) => new Vector2(p.x, p.y))
      const holes = o.holes.map((h) => h.map((p) => new Vector2(p.x, p.y)))
      for (const f of ShapeUtils.triangulateShape(outer, holes)) idx.push(f.map((i) => i + base))
      for (const p of [o.outer, ...o.holes].flat()) pts.push(p)
    }
    t = { pts, idx }
    tris.set(sp, t)
    return t
  }
  const inTri = (p: Pt, a: Pt, b: Pt, c: Pt) => {
    const s = (u: Pt, v: Pt, w: Pt) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y)
    const d1 = s(p, a, b)
    const d2 = s(p, b, c)
    const d3 = s(p, c, a)
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
  }
  return {
    name: 'wireframe',
    title: 'wireframe',
    update() {},
    paint(l) {
      const a = near(l, 1.7 * S)
      if (a < 0.01) return false
      const sp = beginLetter(l)
      ctx.globalAlpha = 1 - 0.8 * a
      drawSprite(sp)
      const { pts, idx } = mesh(sp)
      const lc = toLocal(l, m.x, m.y, sp)
      ctx.lineWidth = 1 / l.s
      ctx.lineJoin = 'round'
      for (const [i, j, k] of idx) {
        const A = pts[i]
        const B = pts[j]
        const C = pts[k]
        ctx.beginPath()
        ctx.moveTo(A.x, A.y)
        ctx.lineTo(B.x, B.y)
        ctx.lineTo(C.x, C.y)
        ctx.closePath()
        if (inTri(lc, A, B, C)) {
          ctx.globalAlpha = 0.55 * a
          ctx.fillStyle = ORANGE
          ctx.fill()
        }
        ctx.globalAlpha = 0.7 * a
        ctx.strokeStyle = INK
        ctx.stroke()
      }
      ctx.fillStyle = INK
      ctx.globalAlpha = a
      for (const p of pts) ctx.fillRect(p.x - 1.5 / l.s, p.y - 1.5 / l.s, 3 / l.s, 3 / l.s)
      ctx.restore()
      label(`${idx.length} tris · ${pts.length} verts`, l.center().x, l.hy + l.oy - sp.asc * l.s - 14, INK, 0.6 * a, 10)
      return true
    },
  }
}

// 3 · recursion: inside the letter, "GENERIC." again — and inside each of those letters, again
function recursion(): Hover {
  const REF = 200
  const WORD = [...'GENERIC.']
  const ref = (ch: string) => bake(ch, '700', 'Tinos', REF)
  const grow = new Float32Array(letters.length)
  /** box w×h (centred on 0,0) filled with rows of "GENERIC." drifting sideways; each letter big
   *  enough holds its own rows, and so on */
  const fill = (w: number, h: number, depth: number) => {
    const sps = WORD.map(ref)
    const total = sps.reduce((a, s) => a + s.adv, 0)
    const k = (w * 2.2) / total
    const capH = sps[0].asc * k
    const rowH = capH * 1.3
    const ww = total * k
    const rows = Math.ceil(h / rowH) + 1
    for (let r = 0; r < rows; r++) {
      const y = -h / 2 + r * rowH + capH * 1.05
      const drift = ((time * 0.12 * ww * (r % 2 ? 1 : -1)) % ww + ww) % ww
      for (let x0 = -w / 2 - ww + drift; x0 < w / 2; x0 += ww) {
        let x = x0
        for (const sp of sps) {
          const aw = sp.adv * k
          if (x + aw > -w / 2 && x < w / 2) {
            ctx.save()
            ctx.translate(x, y)
            ctx.scale(k, k)
            drawSprite(sp)
            if (depth > 0 && aw > 12) {
              ctx.clip(pathOf(shapeOf(sp).loops), 'evenodd')
              ctx.fillStyle = PAPER
              ctx.fillRect(-sp.ox, -sp.oy, sp.w, sp.h)
              ctx.translate(sp.adv / 2, -sp.asc / 2)
              ctx.scale(1 / k, 1 / k)
              fill(aw, capH, depth - 1)
            }
            ctx.restore()
          }
          x += aw
        }
      }
    }
  }
  return {
    name: 'recursion',
    title: 'recursão',
    update(dt) {
      for (const l of letters) grow[l.i] += ((dist(l.center()) < 0.7 * S ? 1 : 0) - grow[l.i]) * ease(dt, 5)
    },
    paint(l) {
      const g = grow[l.i]
      if (g < 0.01) return false
      const sp = beginLetter(l)
      drawSprite(sp)
      const sh = shapeOf(sp)
      ctx.clip(pathOf(sh.loops), 'evenodd')
      ctx.fillStyle = PAPER
      ctx.globalAlpha = g
      ctx.fillRect(-sp.ox, -sp.oy, sp.w, sp.h)
      ctx.translate(sp.adv / 2, -sp.asc / 2)
      ctx.scale(g, g)
      fill(sp.adv * 1.1, (sp.asc + sp.desc) * 1.1, 2)
      ctx.restore()
      // the outline again, on top
      const sp2 = beginLetter(l)
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.85
      ctx.lineWidth = 1.5 / l.s
      ctx.stroke(pathOf(shapeOf(sp2).loops))
      ctx.restore()
      return true
    },
  }
}

// 4 · pendulum: every letter hangs from a nail; brush one and it swings
function pendulum(): Hover {
  const th = new Float32Array(letters.length)
  const om = new Float32Array(letters.length)
  let show = 0
  const geo = (l: Letter) => {
    const sp = sprite(l)
    const hcx = l.hx + (sp.adv * l.s) / 2
    const hcy = l.hy - (sp.asc * l.s) / 2
    const half = (sp.asc * l.s) / 2
    const nail = { x: hcx, y: hcy - half - 0.42 * S }
    return { hcx, hcy, half, nail, L: hcy - nail.y }
  }
  return {
    name: 'pendulum',
    title: 'pêndulo',
    enter() {
      th.fill(0)
      om.fill(0)
      show = 0
      for (const l of letters) l.kin = true
    },
    exit() {
      for (const l of letters) {
        l.kin = false
        l.vx = l.vy = l.rv = 0
      }
    },
    update(dt) {
      show += (1 - show) * ease(dt, 6)
      for (const l of letters) {
        const { hcx, hcy, nail, L } = geo(l)
        const i = l.i
        const c = l.center()
        if (dist(c) < 0.5 * S && Math.abs(m.vx) > 40) {
          const rel = clamp(m.vx, -700, 700) - om[i] * L * Math.cos(th[i])
          om[i] += (rel / L) * Math.min(1, dt * 4)
        }
        om[i] += (-(2600 / L) * Math.sin(th[i]) - 0.55 * om[i]) * dt
        th[i] = clamp(th[i] + om[i] * dt, -1.1, 1.1)
        // ease in from wherever the last hover left it
        const k = show
        l.ox += (nail.x + L * Math.sin(th[i]) - hcx - l.ox) * k
        l.oy += (nail.y + L * Math.cos(th[i]) - hcy - l.oy) * k
        l.rot += (-th[i] - l.rot) * k
      }
    },
    under() {
      for (const l of letters) {
        const { half, nail } = geo(l)
        const c = l.center()
        const top = { x: c.x - Math.sin(-l.rot) * half, y: c.y - Math.cos(l.rot) * half }
        ctx.globalAlpha = 0.65 * show
        ctx.strokeStyle = INK
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(nail.x, nail.y)
        ctx.lineTo(top.x, top.y)
        ctx.stroke()
        ctx.globalAlpha = show
        ctx.fillStyle = INK
        ctx.beginPath()
        ctx.arc(nail.x, nail.y, 3.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    },
  }
}

// 5 · billiards: the cursor is the cue ball; the letters are balls too, and knock each other on
function billiards(ball = true): Hover {
  const RB = () => 0.2 * S
  const rad = (l: Letter) => {
    const sp = sprite(l)
    return 0.42 * Math.max(sp.adv, sp.asc) * l.s
  }
  return {
    name: 'billiards',
    title: 'bilhar',
    exit() {
      for (const l of letters) {
        if (!l.free) continue
        l.free = false
        l.rot = Math.atan2(Math.sin(l.rot), Math.cos(l.rot))
        l.vx = l.vy = l.rv = 0
      }
    },
    update(dt) {
      const rb = RB()
      for (const l of letters) {
        const c = l.center()
        const r = rad(l)
        const d = dist(c)
        if (m.on && d < r + rb) {
          const nx = (c.x - m.x) / (d || 1)
          const ny = (c.y - m.y) / (d || 1)
          if (!l.free) {
            l.free = true
            l.vx = l.vy = 0
          }
          l.ox += nx * (r + rb - d)
          l.oy += ny * (r + rb - d)
          const rel = (l.vx - m.vx) * nx + (l.vy - m.vy) * ny
          if (rel < 0) {
            l.vx -= 1.9 * rel * nx
            l.vy -= 1.9 * rel * ny
          }
        }
      }
      // ball on ball
      for (const a of letters)
        for (const b of letters) {
          if (b.i <= a.i || (!a.free && !b.free)) continue
          const ca = a.center()
          const cb = b.center()
          const ra = rad(a)
          const rbb = rad(b)
          const dx = cb.x - ca.x
          const dy = cb.y - ca.y
          const d = Math.hypot(dx, dy) || 1
          if (d >= ra + rbb) continue
          for (const l of [a, b])
            if (!l.free) {
              l.free = true
              l.vx = l.vy = 0
            }
          const nx = dx / d
          const ny = dy / d
          const o = (ra + rbb - d) / 2
          a.ox -= nx * o
          a.oy -= ny * o
          b.ox += nx * o
          b.oy += ny * o
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
          if (rel < 0) {
            const j = -0.95 * rel
            a.vx -= j * nx
            a.vy -= j * ny
            b.vx += j * nx
            b.vy += j * ny
          }
        }
      for (const l of letters) {
        if (!l.free) continue
        l.vx += TILT.x * 1400 * dt // (mobile) the low side pulls
        l.vy += TILT.y * 1400 * dt
        const f = Math.exp(-dt * 1.1)
        l.vx *= f
        l.vy *= f
        l.ox += l.vx * dt
        l.oy += l.vy * dt
        const r = rad(l)
        l.rot += (Math.hypot(l.vx, l.vy) / r) * dt * Math.sign(l.vx || 1) * 0.6
        const c = l.center()
        if (c.x - r < 0) (l.ox += r - c.x), (l.vx = Math.abs(l.vx) * 0.8)
        if (c.x + r > W) (l.ox -= c.x + r - W), (l.vx = -Math.abs(l.vx) * 0.8)
        if (c.y - r < 0) (l.oy += r - c.y), (l.vy = Math.abs(l.vy) * 0.8)
        if (c.y + r > H) (l.oy -= c.y + r - H), (l.vy = -Math.abs(l.vy) * 0.8)
      }
    },
    over() {
      if (!m.on || !ball) return
      ctx.fillStyle = PAPER
      ctx.beginPath()
      ctx.arc(m.x, m.y, RB(), 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = hatchCss()
      ctx.globalAlpha = 0.5
      ctx.fill()
      ctx.globalAlpha = 0.9
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.globalAlpha = 1
    },
  }
}

// 6 · progressive loading: touch a letter and it reloads — skeleton, pixels, blur, sharp
function progressive(): Hover {
  const p = new Float32Array(letters.length).fill(1)
  const cool = new Float32Array(letters.length)
  const tiny = document.createElement('canvas')
  const tg = tiny.getContext('2d')!
  return {
    name: 'progressive',
    title: 'carregamento progressivo',
    exit() {
      p.fill(1)
    },
    update(dt) {
      for (const l of letters) {
        const i = l.i
        cool[i] -= dt
        if (p[i] < 1) {
          p[i] = Math.min(1, p[i] + dt / 1.5)
          if (p[i] >= 1) {
            l.pop = 0.6
            cool[i] = 1
          }
        } else if (cool[i] <= 0 && dist(l.center()) < 0.6 * S) p[i] = 0
      }
    },
    paint(l) {
      const t = p[l.i]
      if (t >= 1) return false
      const sp = beginLetter(l)
      const x = -sp.ox
      const y = -sp.oy
      if (t < 0.22) {
        // skeleton with a shimmer passing
        const bx = 0
        const by = -sp.asc
        const bw = sp.adv
        const bh = sp.asc + sp.desc
        ctx.fillStyle = INK
        ctx.globalAlpha = 0.07
        ctx.beginPath()
        ctx.roundRect(bx, by, bw, bh, 8 / l.s)
        ctx.fill()
        const u = (time * 1.4) % 1
        const gr = ctx.createLinearGradient(bx - bw + u * bw * 3, 0, bx + u * bw * 3, 0)
        gr.addColorStop(0, 'rgba(255,255,255,0)')
        gr.addColorStop(0.5, 'rgba(255,255,255,.55)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = gr
        ctx.fill()
      } else if (t < 0.55) {
        const q = (t - 0.22) / 0.33
        const block = Math.max(2, (0.16 - 0.12 * q) * S)
        tiny.width = Math.max(1, Math.round(sp.w / block))
        tiny.height = Math.max(1, Math.round(sp.h / block))
        tg.clearRect(0, 0, tiny.width, tiny.height)
        tg.drawImage(sp.cv, 0, 0, tiny.width, tiny.height)
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(tiny, x, y, sp.w, sp.h)
        ctx.imageSmoothingEnabled = true
      } else {
        const q = (t - 0.55) / 0.45
        ctx.filter = `blur(${(1 - q) * 0.05 * S * l.s}px)`
        drawSprite(sp)
        ctx.filter = 'none'
      }
      ctx.restore()
      const kb = 48
      label(`${Math.round(t * kb)} / ${kb} kB`, l.center().x, l.hy + l.oy + 0.2 * S, INK, 0.55, 10)
      return true
    },
  }
}

// 7 · magnifier: the letters near the cursor swell, the word makes room (the old dock)
function magnify(): Hover {
  return {
    name: 'magnify',
    title: 'lupa',
    update() {
      for (const l of letters) {
        const sp = sprite(l)
        const cx = l.hx + (sp.adv * l.s) / 2
        const v = clamp(1 - Math.abs(m.y - (BASE - 0.35 * S)) / (1.6 * S), 0, 1)
        l.modeS = 1 + 0.6 * v * Math.exp(-(((cx - m.x) / (0.9 * S)) ** 2))
      }
    },
  }
}

// 8 · spacing: the word opens up where the cursor is
function spacing(): Hover {
  return {
    name: 'spacing',
    title: 'espaçamento',
    update() {},
    gap(i) {
      if (i === 0) return 0
      const l = letters[i]
      const v = clamp(1 - Math.abs(m.y - (BASE - 0.35 * S)) / (1.6 * S), 0, 1)
      return 0.6 * S * v * Math.exp(-(((l.hx - l.g / 2 - m.x) / (0.8 * S)) ** 2))
    },
  }
}

// 9 · weight: the closer the cursor, the heavier the letter
function weight(): Hover {
  const v = new Float32Array(letters.length)
  return {
    name: 'weight',
    title: 'peso',
    exit() {
      for (const l of letters) l.fat = 0
    },
    update(dt) {
      for (const l of letters) {
        const c = l.center()
        const t = clamp(1 - Math.hypot((c.x - m.x) / 1.4, c.y - m.y) / (1.0 * S), 0, 1)
        v[l.i] += (t - v[l.i]) * ease(dt, 8)
        l.fat = Math.round(v[l.i] * 8)
      }
    },
  }
}

// 10 · case: the cursor flips capitals to small letters and back
function caseFlip(): Hover {
  const away = new Float32Array(letters.length)
  return {
    name: 'case',
    title: 'caixa',
    exit() {
      for (const l of letters) l.flip = false
    },
    update(dt) {
      for (const l of letters) {
        if (dist(l.center()) < 0.55 * S) {
          if (!l.flip) l.pop = 0.8
          l.flip = true
          away[l.i] = 0.9
        } else if (l.flip) {
          away[l.i] -= dt
          if (away[l.i] <= 0) {
            l.flip = false
            l.pop = 0.8
          }
        }
      }
    },
  }
}

// 11 · font roulette: the letter you touch spins like a slot reel through the fonts, and stops on one
function roulette(): Hover {
  type Spin = { t: number; dur: number; reel: ReturnType<typeof randomStyle>[] }
  const spin = new Map<Letter, Spin>()
  const cool = new Float32Array(letters.length)
  const txt = (l: Letter, st: ReturnType<typeof randomStyle>) => {
    const up = st.up || FACES[st.f].caps
    return up !== l.flip ? l.ch.toUpperCase() : l.ch.toLowerCase()
  }
  const spr = (l: Letter, st: ReturnType<typeof randomStyle>) => bake(txt(l, st), pre(st), FACES[st.f].fam, Math.max(8, Math.round(S * l.style.sc)), st.col)
  return {
    name: 'roulette',
    title: 'roleta de fontes',
    exit() {
      spin.clear()
    },
    update(dt) {
      for (const l of letters) {
        cool[l.i] -= dt
        const s = spin.get(l)
        if (s) {
          s.t += dt
          if (s.t >= s.dur) {
            const last = s.reel[s.reel.length - 1]
            l.restyle({ ...last, sc: l.style.sc })
            spin.delete(l)
            cool[l.i] = 1
          }
        } else if (cool[l.i] <= 0 && dist(l.center()) < 0.55 * S) {
          const n = 9 + Math.floor(rnd(0, 6))
          spin.set(l, { t: 0, dur: rnd(0.9, 1.4), reel: [{ ...l.style }, ...Array.from({ length: n }, () => ({ ...randomStyle(), sc: l.style.sc }))] })
        }
      }
    },
    paint(l) {
      const s = spin.get(l)
      if (!s) return false
      const sp = sprite(l)
      const u = 1 - (1 - s.t / s.dur) ** 3
      const pos = u * (s.reel.length - 1)
      const k = Math.floor(pos)
      const f = pos - k
      const cell = (sp.asc + sp.desc) * 1.35
      beginLetter(l, sp)
      ctx.beginPath()
      ctx.rect(-0.15 * sp.adv, -sp.asc - 0.15 * cell, sp.adv * 1.3, cell * 1.05)
      ctx.save()
      ctx.clip()
      for (const [n, dy] of [[k, -f * cell], [k + 1, (1 - f) * cell]] as const) {
        if (n >= s.reel.length) continue
        const g = spr(l, s.reel[n])
        ctx.save()
        ctx.translate((sp.adv - g.adv) / 2, dy)
        drawSprite(g)
        ctx.restore()
      }
      ctx.restore()
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1 / l.s
      ctx.beginPath()
      for (const y of [-sp.asc - 0.15 * cell, -sp.asc - 0.15 * cell + cell * 1.05]) {
        ctx.moveTo(-0.15 * sp.adv, y)
        ctx.lineTo(sp.adv * 1.15, y)
      }
      ctx.stroke()
      ctx.restore()
      return true
    },
  }
}

// 12 · scanner: the garage's orange beam rides the cursor and reads every glyph it crosses
function scanner(): Hover {
  let bx = -1e4
  const seen = new Set<number>()
  const tinted = new WeakMap<Sprite, HTMLCanvasElement>()
  const tint = (sp: Sprite) => {
    let c = tinted.get(sp)
    if (c) return c
    c = document.createElement('canvas')
    c.width = sp.cv.width
    c.height = sp.cv.height
    const g = c.getContext('2d')!
    g.drawImage(sp.cv, 0, 0)
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = ORANGE
    g.globalAlpha = 0.8
    g.fillRect(0, 0, c.width, c.height)
    tinted.set(sp, c)
    return c
  }
  const BW = () => 0.07 * S
  let reading = -1
  return {
    name: 'scanner',
    title: 'scanner',
    enter() {
      bx = m.x
      seen.clear()
    },
    update(dt) {
      if (m.on) bx += (m.x - bx) * ease(dt, 14)
      reading = -1
      for (const l of letters) {
        const sp = sprite(l)
        if (bx > l.hx + l.ox && bx < l.hx + l.ox + sp.adv * l.s) {
          reading = l.i
          seen.add(l.i)
        }
      }
    },
    paint(l) {
      const sp = beginLetter(l)
      drawSprite(sp)
      ctx.restore()
      ctx.save()
      ctx.beginPath()
      ctx.rect(bx - BW(), 0, BW() * 2, H)
      ctx.clip()
      beginLetter(l, sp)
      ctx.drawImage(tint(sp), -sp.ox, -sp.oy, sp.w, sp.h)
      ctx.restore()
      ctx.restore()
      return true
    },
    under() {
      const g = ctx.createLinearGradient(bx - BW() * 4, 0, bx + BW() * 4, 0)
      g.addColorStop(0, 'rgba(255,154,77,0)')
      g.addColorStop(0.5, 'rgba(255,154,77,.22)')
      g.addColorStop(1, 'rgba(255,154,77,0)')
      ctx.fillStyle = g
      ctx.fillRect(bx - BW() * 4, 0, BW() * 8, H)
    },
    over() {
      ctx.fillStyle = ORANGE
      ctx.fillRect(bx - 0.75, 0, 1.5, H)
      const y = BASE + 0.32 * S
      if (reading >= 0) {
        const l = letters[reading]
        const t = l.text()
        const hex = t.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')
        label(`U+${hex}  ${t}  ·  ${FACES[l.style.f].fam} ${l.style.w}  ·  ${l.px()}px`, bx + 12, y, ORANGE, 1, 11, bx > W - 260 ? 'right' : 'left')
      }
      label(seen.size >= letters.length ? 'scan complete · 8/8 glyphs' : `scanning… ${seen.size}/${letters.length} glyphs`, bx + 12, y + 18, INK, 0.55, 11, bx > W - 260 ? 'right' : 'left')
    },
  }
}

// 13 · liquid hole: the hero's hover, in 2D — a liquid blob trails the cursor and, through it, the
// word in other bodies (the letters' photos, swapping on their own beat)
const PHOTOS = 6
const GLYPHS = ['G', 'E', 'N', 'E2', 'R', 'I', 'C', 'dot']
type Meta = Record<string, { g: string; x: number; y: number; w: number; h: number }[] | { x0: number; x1: number; y0: number; y1: number }>
let photos: HTMLImageElement[][] | null = null
let meta: Meta | null = null
let photoLoad: Promise<void> | null = null
function loadPhotos(): void {
  if (photoLoad) return
  const base = `${import.meta.env.BASE_URL}hero/letters_v1/`
  const img = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = src
    })
  photoLoad = (async () => {
    meta = (await (await fetch(base + 'meta.json')).json()) as Meta
    photos = await Promise.all(Array.from({ length: PHOTOS }, (_, p) => Promise.all(GLYPHS.map((g) => img(`${base}p${p}_${g}.webp`)))))
  })().catch(() => undefined)
}
function liquid(): Hover {
  loadPhotos()
  type Drop = { x: number; y: number; life: number; r: number }
  const drops: Drop[] = []
  const pickP = letters.map((_, i) => i % PHOTOS)
  const timers = letters.map((_, i) => ((i + 1) / letters.length) * 0.45)
  let blob: Path2D | null = null
  const CELL = 7
  return {
    name: 'liquid',
    title: 'buraco líquido',
    enter() {
      drops.length = 0
    },
    update(dt) {
      if (m.on) {
        const last = drops[drops.length - 1]
        if (!last || Math.hypot(last.x - m.x, last.y - m.y) > 6) drops.push({ x: m.x, y: m.y, life: 1, r: 0.17 * S + Math.min(0.08 * S, m.speed * 0.02) })
        else last.life = 1
      }
      for (const d of drops) d.life -= dt / 0.9
      while (drops.length && drops[0].life <= 0) drops.shift()
      if (drops.length > 60) drops.splice(0, drops.length - 60)
      for (let i = 0; i < letters.length; i++) {
        timers[i] -= dt
        if (timers[i] > 0) continue
        timers[i] += 0.45
        const avoid = [pickP[i], pickP[i - 1], pickP[i + 1]]
        const ok = Array.from({ length: PHOTOS }, (_, p) => p).filter((p) => !avoid.includes(p))
        pickP[i] = pick(ok)
      }
      // the blob: metaballs on a coarse grid around the drops, traced into a smooth outline
      blob = null
      if (!drops.length) return
      let x0 = Infinity
      let y0 = Infinity
      let x1 = -Infinity
      let y1 = -Infinity
      for (const d of drops) {
        const r = d.r * 2
        x0 = Math.min(x0, d.x - r)
        y0 = Math.min(y0, d.y - r)
        x1 = Math.max(x1, d.x + r)
        y1 = Math.max(y1, d.y + r)
      }
      const nx = Math.ceil((x1 - x0) / CELL) + 1
      const ny = Math.ceil((y1 - y0) / CELL) + 1
      const loops = isoLoops(nx, ny, (i, j) => {
        const x = x0 + i * CELL
        const y = y0 + j * CELL
        let f = 0
        for (const d of drops) {
          const r = d.r * Math.sqrt(Math.max(0, d.life))
          f += (r * r) / ((x - d.x) ** 2 + (y - d.y) ** 2 + 1)
        }
        return f
      }, 1)
      blob = pathOf(loops.map((l) => l.map((p) => ({ x: x0 + p.x * CELL, y: y0 + p.y * CELL }))))
    },
    over() {
      if (!blob) return
      ctx.save()
      ctx.clip(blob, 'evenodd')
      ctx.fillStyle = '#fdfdfc'
      ctx.fillRect(0, 0, W, H)
      if (photos && meta) {
        for (const l of letters) {
          const p = pickP[l.i]
          const word = meta[`p${p}_word`] as { x0: number; x1: number; y0: number; y1: number }
          const g = (meta[`p${p}`] as { x: number; y: number; w: number; h: number }[])[l.i]
          const capH = 0.66 * S
          const k = (capH * 1.12) / (word.y1 - word.y0)
          const sp = l.ink()
          const cx = l.hx + (sp.adv * l.s) / 2
          const mid = BASE - capH / 2
          ctx.drawImage(photos[p][l.i], cx - (g.w * k) / 2, mid + (g.y - (word.y0 + word.y1) / 2) * k, g.w * k, g.h * k)
        }
      }
      ctx.restore()
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.85
      ctx.stroke(blob)
      ctx.globalAlpha = 1
    },
  }
}

export const SET_B: Record<string, () => Hover> = { bezier, wireframe, recursion, pendulum, billiards: () => billiards(), progressive, magnify, spacing, weight, case: caseFlip, roulette, scanner, liquid }
/** the ones Danilo kept from the second set (2026-10-17): billiards without the drawn ball */
export const KEEP_B: Record<string, () => Hover> = { bezier, wireframe, pendulum, billiards: () => billiards(false), progressive, spacing, roulette }
/** out (2026-10-17): charcode, weight, case, fout; then the ones the cursor barely moves (wave, kerning,
 *  zindex) or doesn't move at all (easings, float) */
export const DROPPED = ['inspect', 'charcode', 'weight', 'case', 'fout', 'wave', 'kerning', 'zindex', 'easings', 'float']
/** every hover still alive: the first set + the kept ones, minus the dropped */
export const ALIVE = (setA: Record<string, () => Hover>): Record<string, () => Hover> =>
  Object.fromEntries(Object.entries({ ...setA, ...KEEP_B }).filter(([n]) => !DROPPED.includes(n)))
