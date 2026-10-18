// TEST (/hero-hovers-giz.html): the hovers that drew the letter themselves, redone for the 3D chalk
// letters (GizLetters.ts) — bézier (the glyph's real outline points, re-extruded as you pull),
// wireframe (the mesh the GPU really draws), progressive loading (rendered at a low resolution:
// pixels, then blur) and the font roulette (two glyphs on a reel, clipped to a window).
import * as THREE from 'three'
import { PIX, fontKey } from './GizLetters'
import { KEEP_B } from './HoverLabMore'
import { type Hover, type Letter, SET_A, FACES, INK, ORANGE, PAPER, S, bake, clamp, dist, g3, label, letters, m, pre, randomStyle, rnd, toLocal, toScreen, ctx } from './HoverLab'

const near = (l: Letter, reach: number) => clamp(1 - dist(l.center()) / reach, 0, 1)
const keyOf = (l: Letter) => fontKey(l.style.f, l.style.w, l.style.it)

// 1 · bézier: the glyph's own outline — its anchors and control points, straight from the font. The
// cursor grabs a point and pulls; the letter is re-extruded from the moved outline every frame and,
// let go, wobbles back
type P = { x: number; y: number; dx: number; dy: number; vx: number; vy: number; tx: number; ty: number; anchor: boolean }
type Seg = { t: 'L' | 'Q' | 'C'; i: number[] }
type EP = { pts: P[]; segs: Seg[] }
function edit(path: THREE.Path): EP {
  const pts: P[] = []
  const segs: Seg[] = []
  const add = (v: THREE.Vector2, anchor: boolean) => {
    pts.push({ x: v.x, y: v.y, dx: 0, dy: 0, vx: 0, vy: 0, tx: 0, ty: 0, anchor })
    return pts.length - 1
  }
  let cur = -1
  for (const c of path.curves) {
    if (c instanceof THREE.LineCurve) {
      if (cur < 0) cur = add(c.v1, true)
      const e = add(c.v2, true)
      segs.push({ t: 'L', i: [cur, e] })
      cur = e
    } else if (c instanceof THREE.QuadraticBezierCurve) {
      if (cur < 0) cur = add(c.v0, true)
      const q = add(c.v1, false)
      const e = add(c.v2, true)
      segs.push({ t: 'Q', i: [cur, q, e] })
      cur = e
    } else if (c instanceof THREE.CubicBezierCurve) {
      if (cur < 0) cur = add(c.v0, true)
      const a = add(c.v1, false)
      const b = add(c.v2, false)
      const e = add(c.v3, true)
      segs.push({ t: 'C', i: [cur, a, b, e] })
      cur = e
    }
  }
  // closed: the last anchor is the first
  const L = pts.length - 1
  if (L > 0 && Math.hypot(pts[L].x - pts[0].x, pts[L].y - pts[0].y) < 1e-6) {
    pts.pop()
    for (const s of segs) s.i = s.i.map((i) => (i === L ? 0 : i))
  }
  return { pts, segs }
}
function trace(e: EP, path: THREE.Path): void {
  if (!e.segs.length) return
  const X = (i: number) => e.pts[i].x + e.pts[i].dx
  const Y = (i: number) => e.pts[i].y + e.pts[i].dy
  const i0 = e.segs[0].i[0]
  path.moveTo(X(i0), Y(i0))
  for (const { t, i } of e.segs) {
    if (t === 'L') path.lineTo(X(i[1]), Y(i[1]))
    else if (t === 'Q') path.quadraticCurveTo(X(i[1]), Y(i[1]), X(i[2]), Y(i[2]))
    else path.bezierCurveTo(X(i[1]), Y(i[1]), X(i[2]), Y(i[2]), X(i[3]), Y(i[3]))
  }
}
function bezier(): Hover {
  type St = { sig: string; shapes: { outer: EP; holes: EP[] }[]; ver: number }
  const st = new Map<Letter, St>()
  let grab: { l: Letter; path: EP; k: number } | null = null
  const get = (l: Letter): St | null => {
    if (!g3?.ready) return null
    const sig = `${keyOf(l)}|${l.text()}`
    let s = st.get(l)
    if (!s || s.sig !== sig) {
      s = { sig, shapes: g3.shapes(keyOf(l), l.text()).map((sh) => ({ outer: edit(sh), holes: sh.holes.map(edit) })), ver: 0 }
      st.set(l, s)
      if (grab?.l === l) grab = null
    }
    return s
  }
  const paths = (s: St) => s.shapes.flatMap((sh) => [sh.outer, ...sh.holes])
  return {
    name: 'bezier',
    title: 'bézier',
    exit() {
      st.clear()
      grab = null
    },
    update(dt) {
      for (const l of letters) {
        const s = get(l)
        if (!s) continue
        const px = l.px()
        const lc = toLocal(l, m.x, m.y)
        const ex = lc.x / px
        const ey = -lc.y / px
        for (const e of paths(s)) for (const p of e.pts) p.tx = p.ty = 0
        if (!grab && m.on) {
          let best = (0.12 * S) / l.s / px
          for (const e of paths(s))
            e.pts.forEach((p, k) => {
              const d = Math.hypot(p.x + p.dx - ex, p.y + p.dy - ey)
              if (d < best) {
                best = d
                grab = { l, path: e, k }
              }
            })
        }
        if (grab && grab.l === l) {
          const { path, k } = grab
          const p = path.pts[k]
          const ox = ex - p.x
          const oy = ey - p.y
          if (Math.hypot(ox, oy) > (0.5 * S) / l.s / px || !m.on) grab = null
          else
            for (let n = -4; n <= 4; n++) {
              const q = path.pts[(k + n + path.pts.length) % path.pts.length]
              const w = Math.max(0, 1 - Math.abs(n) / 5) ** 1.5
              q.tx = ox * w
              q.ty = oy * w
            }
        }
        let moving = false
        for (const e of paths(s))
          for (const p of e.pts) {
            p.vx += (380 * (p.tx - p.dx) - 7 * p.vx) * dt
            p.vy += (380 * (p.ty - p.dy) - 7 * p.vy) * dt
            p.dx += p.vx * dt
            p.dy += p.vy * dt
            if (Math.abs(p.dx) + Math.abs(p.dy) > 2e-4) moving = true
          }
        if (moving) {
          s.ver++
          const shapes = s.shapes
          l.fx.shape = {
            key: s.ver,
            build: () =>
              shapes.map((sh) => {
                const shape = new THREE.Shape()
                trace(sh.outer, shape)
                for (const h of sh.holes) {
                  const hole = new THREE.Path()
                  trace(h, hole)
                  shape.holes.push(hole)
                }
                return shape
              }),
          }
        }
      }
    },
    over() {
      for (const l of letters) {
        const a = near(l, 1.6 * S)
        const s = st.get(l)
        if (a < 0.01 || !s) continue
        const px = l.px()
        const at = (p: P) => toScreen(l, (p.x + p.dx) * px, -(p.y + p.dy) * px)
        for (const e of paths(s)) {
          const hot = grab && grab.l === l && grab.path === e ? grab.k : -1
          // handles: anchor -> control
          ctx.lineWidth = 1
          for (const { t, i } of e.segs) {
            const pairs = t === 'Q' ? [[i[0], i[1]], [i[1], i[2]]] : t === 'C' ? [[i[0], i[1]], [i[2], i[3]]] : []
            for (const [u, v] of pairs) {
              const A = at(e.pts[u])
              const B = at(e.pts[v])
              ctx.globalAlpha = 0.5 * a
              ctx.strokeStyle = u === hot || v === hot ? ORANGE : INK
              ctx.beginPath()
              ctx.moveTo(A.x, A.y)
              ctx.lineTo(B.x, B.y)
              ctx.stroke()
            }
          }
          e.pts.forEach((p, k) => {
            const q = at(p)
            const isHot = k === hot
            ctx.globalAlpha = (isHot ? 1 : 0.8) * a
            if (p.anchor) {
              ctx.fillStyle = isHot ? ORANGE : PAPER
              ctx.fillRect(q.x - 3, q.y - 3, 6, 6)
              ctx.strokeStyle = isHot ? ORANGE : INK
              ctx.strokeRect(q.x - 3, q.y - 3, 6, 6)
            } else {
              ctx.fillStyle = isHot ? ORANGE : INK
              ctx.beginPath()
              ctx.arc(q.x, q.y, 2.3, 0, Math.PI * 2)
              ctx.fill()
            }
          })
        }
        ctx.globalAlpha = 1
      }
    },
  }
}

// 2 · wireframe: near the cursor the letter shows the triangles the GPU really draws it with (front,
// back and sides), the one under the cursor in orange
function wireframe(): Hover {
  const a = new Float32Array(letters.length)
  return {
    name: 'wireframe',
    title: 'wireframe',
    update() {
      for (const l of letters) {
        a[l.i] = near(l, 1.7 * S)
        if (a[l.i] > 0.01) l.fx.wire = a[l.i]
      }
    },
    over() {
      if (!g3) return
      for (const l of letters) {
        const k = a[l.i]
        if (k < 0.01) continue
        const tri = g3.triangleAt(l.i, m.x, m.y)
        if (tri) {
          ctx.globalAlpha = 0.55 * k
          ctx.fillStyle = ORANGE
          ctx.beginPath()
          tri.forEach((p, n) => (n ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
          ctx.closePath()
          ctx.fill()
          ctx.globalAlpha = 1
        }
        const c = g3.counts(l.i)
        const sp = l.sprite()
        label(`${c.tris} tris · ${c.verts} verts`, l.center().x, l.hy + l.oy - sp.asc * l.s - 16, INK, 0.6 * k, 10)
      }
    },
  }
}

// 3 · progressive loading: touch a letter and it loads again like a picture on a slow line — gone a
// beat, then scan after scan sweeping down it in big, plain pixels, each scan finer than the last; and
// only at the very end the blur, a short soft focus from the finest pixels to the sharp letter (the
// blur hides the last step, it doesn't stand in for the pixels)
/** how the progressive load goes (/hero-hovers-pixels.html changes it live) */
export const PROG = {
  scans: [0.1, 0.05, 0.026], // block size per scan, × the font size
  scanT: 0.42, // s a scan takes to sweep down the letter
  focusT: 0.3, // s of the closing soft focus (0: none)
  auto: false, // every letter loads again on its own, staggered, over and over
}
export function progressive(name = 'progressive', title = 'carregamento progressivo', mode?: number): Hover {
  const t = new Float32Array(letters.length).fill(-1)
  const cool = new Float32Array(letters.length)
  const WAIT = 0.14
  let SCANS = PROG.scans
  let SCAN_T = PROG.scanT
  let FOCUS_T = PROG.focusT
  let total = 0
  let clock = 0
  return {
    name,
    title,
    sticky: () => PROG.auto,
    enter() {
      if (mode !== undefined) PIX.mode = mode
    },
    exit() {
      t.fill(-1)
    },
    update(dt) {
      SCANS = PROG.scans
      SCAN_T = PROG.scanT
      FOCUS_T = PROG.focusT
      total = WAIT + SCANS.length * SCAN_T + FOCUS_T
      clock += dt
      for (const l of letters) {
        const i = l.i
        cool[i] -= dt
        if (t[i] < 0) {
          const autoGo = PROG.auto && (clock - i * 0.12) % (total + 1.4) < dt && clock - i * 0.12 > 0
          if (autoGo || (cool[i] <= 0 && dist(l.center()) < 0.6 * S)) t[i] = 0
          else continue
        }
        t[i] += dt
        if (t[i] >= total) {
          t[i] = -1
          cool[i] = 0.8
          continue
        }
        const k0 = t[i] - WAIT // a beat of nothing first: the request
        if (k0 < 0) {
          l.fx.hide = true
          continue
        }
        const px = l.px()
        const scanned = SCANS.length * SCAN_T
        if (k0 < scanned) {
          const k = Math.floor(k0 / SCAN_T)
          const f = (k0 - k * SCAN_T) / SCAN_T
          const sp = l.sprite()
          const top = l.hy + l.oy - sp.asc * l.s * 1.2
          const bot = l.hy + l.oy + sp.desc * l.s + 0.06 * S
          const e = f * f * (3 - 2 * f) // the sweep eases in and out
          if (PIX.mode >= 6) l.fx.voxel = { block: k === 0 ? -1 : SCANS[k - 1], fine: SCANS[k], split: top + (bot - top) * e, gap: PIX.mode === 7 ? 0.12 : 0 }
          else l.fx.pixel = { block: k === 0 ? -1 : SCANS[k - 1] * px, fine: SCANS[k] * px, split: top + (bot - top) * e, smooth: false }
        } else {
          // the soft focus: from about the finest pixels' size to sharp, easing out
          const u = (k0 - scanned) / FOCUS_T
          const b = SCANS[SCANS.length - 1] * px * 0.7 * (1 - u) ** 2
          if (b > 1.1) l.fx.pixel = { block: b, smooth: true }
        }
      }
    },
    over() {
      for (const l of letters) {
        const i = l.i
        if (t[i] < 0) continue
        const k0 = Math.max(0, t[i] - WAIT)
        const k = Math.min(SCANS.length, Math.floor(k0 / SCAN_T) + 1)
        const done = k0 >= SCANS.length * SCAN_T
        label(done ? 'decoding…' : `scan ${k}/${SCANS.length}`, l.center().x, l.hy + l.oy + 0.22 * S, INK, 0.55, 10)
      }
    },
  }
}

// 4 · font roulette: the letter you touch spins like a slot reel through the fonts, and stops on one
function roulette(): Hover {
  type Spin = { t: number; dur: number; reel: ReturnType<typeof randomStyle>[] }
  const spin = new Map<Letter, Spin>()
  const cool = new Float32Array(letters.length)
  const txt = (l: Letter, st: ReturnType<typeof randomStyle>) => (st.up || FACES[st.f].caps ? l.ch.toUpperCase() : l.ch.toLowerCase())
  const win = new Map<Letter, { a: { x: number; y: number }; b: { x: number; y: number }; c: { x: number; y: number }; d: { x: number; y: number } }>()
  return {
    name: 'roulette',
    title: 'roleta de fontes',
    exit() {
      spin.clear()
    },
    update(dt) {
      win.clear()
      for (const l of letters) {
        cool[l.i] -= dt
        const s = spin.get(l)
        if (!s) {
          if (cool[l.i] <= 0 && dist(l.center()) < 0.55 * S) {
            const n = 9 + Math.floor(rnd(0, 6))
            spin.set(l, { t: 0, dur: rnd(0.9, 1.4), reel: [{ ...l.style }, ...Array.from({ length: n }, () => ({ ...randomStyle(), sc: l.style.sc }))] })
          }
          continue
        }
        s.t += dt
        if (s.t >= s.dur) {
          l.restyle({ ...s.reel[s.reel.length - 1], sc: l.style.sc })
          spin.delete(l)
          cool[l.i] = 1
          continue
        }
        const sp = l.sprite()
        const u = 1 - (1 - s.t / s.dur) ** 3
        const pos = u * (s.reel.length - 1)
        const k = Math.floor(pos)
        const f = pos - k
        const cell = (sp.asc + sp.desc) * 1.35
        const items = []
        for (const [n, dy] of [[k, -f * cell], [k + 1, (1 - f) * cell]] as const) {
          if (n >= s.reel.length) continue
          const st = s.reel[n]
          const g = bake(txt(l, st), pre(st), FACES[st.f].fam, l.px(), st.col)
          items.push({ font: fontKey(st.f, st.w, st.it), text: txt(l, st), dx: (sp.adv - g.adv) / 2, dy })
        }
        const top = -sp.asc - 0.15 * cell
        const bot = top + cell * 1.05
        const a = toScreen(l, -0.15 * sp.adv, top)
        const b = toScreen(l, sp.adv * 1.15, top)
        const c = toScreen(l, -0.15 * sp.adv, bot)
        const d = toScreen(l, sp.adv * 1.15, bot)
        win.set(l, { a, b, c, d })
        l.fx.reel = { items, y0: Math.min(a.y, b.y), y1: Math.max(c.y, d.y) }
      }
    },
    over() {
      ctx.strokeStyle = INK
      ctx.globalAlpha = 0.4
      ctx.lineWidth = 1
      ctx.beginPath()
      for (const { a, b, c, d } of win.values()) {
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.moveTo(c.x, c.y)
        ctx.lineTo(d.x, d.y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    },
  }
}

export const GIZ_ONLY: Record<string, () => Hover> = { bezier, wireframe, progressive, roulette }

/** the giz route's hovers: the movement ones as they are + the four above */
const { gravity, string, breakpoint, flee, orbit, grid } = SET_A
const { pendulum, billiards, spacing } = KEEP_B
export const GIZ_SET: Record<string, () => Hover> = { string, breakpoint, flee, orbit, grid, ...GIZ_ONLY, pendulum, billiards, gravity, spacing }
