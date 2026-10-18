// TEST (/hero-hovers-giz.html): the hovers that drew the letter themselves, redone for the 3D chalk
// letters (GizLetters.ts) — bézier (the glyph's real outline points, re-extruded as you pull),
// wireframe (the mesh the GPU really draws), progressive loading (rendered at a low resolution:
// pixels, then blur) and the font roulette (two glyphs on a reel, clipped to a window).
import * as THREE from 'three'
import { fontKey } from './GizLetters'
import { KEEP_B } from './HoverLabMore'
import { type Hover, type Letter, SET_A, FACES, INK, ORANGE, PAPER, S, bake, beginLetter, clamp, dist, g3, label, letters, m, pre, randomStyle, rnd, time, toLocal, toScreen, ctx } from './HoverLab'

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

// 3 · progressive loading: touch a letter and it reloads — a skeleton, then drawn at a few pixels
// and up, then blurred, then sharp
function progressive(): Hover {
  const p = new Float32Array(letters.length).fill(1)
  const cool = new Float32Array(letters.length)
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
        const t = p[i]
        if (t >= 1) continue
        if (t < 0.22) l.fx.hide = true
        else if (t < 0.55) l.fx.pixel = { block: Math.max(2, (0.16 - 0.12 * ((t - 0.22) / 0.33)) * S), smooth: false }
        else {
          const b = (1 - (t - 0.55) / 0.45) * 0.07 * S
          if (b > 1.2) l.fx.pixel = { block: b, smooth: true }
        }
      }
    },
    under() {
      // the skeleton, where the letter will be
      for (const l of letters) {
        if (p[l.i] >= 0.22) continue
        const sp = beginLetter(l)
        ctx.fillStyle = INK
        ctx.globalAlpha = 0.07
        ctx.beginPath()
        ctx.roundRect(0, -sp.asc, sp.adv, sp.asc + sp.desc, 8 / l.s)
        ctx.fill()
        const u = (time * 1.4) % 1
        const gr = ctx.createLinearGradient(-sp.adv + u * sp.adv * 3, 0, u * sp.adv * 3, 0)
        gr.addColorStop(0, 'rgba(255,255,255,0)')
        gr.addColorStop(0.5, 'rgba(255,255,255,.55)')
        gr.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.globalAlpha = 1
        ctx.fillStyle = gr
        ctx.fill()
        ctx.restore()
      }
    },
    over() {
      for (const l of letters) {
        const t = p[l.i]
        if (t >= 1) continue
        label(`${Math.round(t * 48)} / 48 kB`, l.center().x, l.hy + l.oy + 0.2 * S, INK, 0.55, 10)
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
