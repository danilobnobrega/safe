// TEST (/hero-hovers-cubos-escolha.html): six new hovers for the 3D chalk letters, ideas to replace the
// less fun ones — dominoes, split-flap, slingshot, jelly, whirlwind, magnet. Each one is a toy the
// cursor plays with; the 3D turns and squashes go through Letter.fx (GizLetters.ts).
import { type Hover, type Letter, H, INK, S, W, clamp, ctx, dist, letters, m, randomStyle, rnd } from './HoverLab'
import { GIZ_SET } from './HoverLabGiz'
import { TILT } from '../ui/tilt'

const homeCenter = (l: Letter) => {
  const sp = l.sprite()
  return { x: l.hx + (sp.adv * l.s) / 2, y: l.hy - (sp.asc * l.s) / 2 }
}
/** a loose letter flying about the frame, bouncing off its edges, slowing down */
function fly(l: Letter, dt: number, drag: number): void {
  // (mobile) the phone's tilt pulls loose letters toward its low side
  l.vx += TILT.x * 1400 * dt
  l.vy += TILT.y * 1400 * dt
  const f = Math.exp(-dt * drag)
  l.vx *= f
  l.vy *= f
  l.ox += l.vx * dt
  l.oy += l.vy * dt
  const c = l.center()
  const r = 0.3 * S
  if (c.x < r) (l.ox += r - c.x), (l.vx = Math.abs(l.vx) * 0.8)
  if (c.x > W - r) (l.ox -= c.x - (W - r)), (l.vx = -Math.abs(l.vx) * 0.8)
  if (c.y < r) (l.oy += r - c.y), (l.vy = Math.abs(l.vy) * 0.8)
  if (c.y > H - r) (l.oy -= c.y - (H - r)), (l.vy = -Math.abs(l.vy) * 0.8)
}
/** an angle brought back to the nearest whole turn, then eased to rest there (a spin settling) */
const settle = (a: number, dt: number, rate = 6) => {
  const w = Math.round(a / (Math.PI * 2)) * Math.PI * 2
  return w + (a - w) * Math.exp(-dt * rate)
}

// 1 · dominoes: knock a letter and it topples forward, off its baseline, and takes the next one down
// with it — the chain runs the way the cursor was going; then they all get back up
function domino(): Hover {
  type St = { th: number; w: number; phase: 'up' | 'falling' | 'down' | 'rising'; wait: number }
  const st: St[] = letters.map(() => ({ th: 0, w: 0, phase: 'up', wait: 0 }))
  let dir = 1
  let downFor = 0
  const FLAT = 1.42
  return {
    name: 'domino',
    title: 'dominó',
    enter() {
      for (const s of st) Object.assign(s, { th: 0, w: 0, phase: 'up', wait: 0 })
    },
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        if (s.phase === 'up' && dist(l.center()) < 0.5 * S && m.speed > 150 && !st.some((x) => x.phase === 'rising')) {
          s.phase = 'falling'
          s.w = 1.6
          dir = m.vx >= 0 ? 1 : -1
        }
      }
      let anyFalling = false
      for (const l of letters) {
        const s = st[l.i]
        if (s.phase === 'falling') {
          anyFalling = true
          s.w += 28 * Math.sin(s.th) * dt + 1.2 * dt // an inverted pendulum: the further over, the faster
          s.th += s.w * dt
          if (s.th >= FLAT) {
            s.th = FLAT
            s.w = -s.w * 0.18 // a little bounce on landing
            s.phase = 'down'
          }
          // past a lean it hits the neighbour on the chain's side
          const n = st[l.i + dir]
          if (s.th > 0.42 && n && n.phase === 'up') {
            n.phase = 'falling'
            n.w = 1.4
          }
        } else if (s.phase === 'down') {
          s.w += -40 * (s.th - FLAT) * dt - 6 * s.w * dt
          s.th = Math.min(FLAT, s.th + s.w * dt)
        }
      }
      if (st.some((s) => s.phase === 'down') && !anyFalling) downFor += dt
      else downFor = 0
      if (downFor > 1.3) {
        // back up, from the end of the chain
        const order = letters.map((l) => l.i).filter((i) => st[i].phase === 'down')
        order.sort((a, b) => (dir > 0 ? b - a : a - b))
        order.forEach((i, k) => Object.assign(st[i], { phase: 'rising', wait: k * 0.07 }))
        downFor = 0
      }
      for (const l of letters) {
        const s = st[l.i]
        if (s.phase === 'rising') {
          s.wait -= dt
          if (s.wait <= 0) {
            s.w += (-80 * s.th - 9 * s.w) * dt
            s.th += s.w * dt
            if (Math.abs(s.th) < 0.002 && Math.abs(s.w) < 0.02) Object.assign(s, { th: 0, w: 0, phase: 'up' })
          }
        }
        if (s.th !== 0) l.fx.tilt = { x: s.th, y: 0, pivot: 'base' }
      }
    },
  }
}

// 2 · split-flap: touch a letter and it flips like an old departures board, through font after font,
// slowing down until it stops on one
function splitflap(): Hover {
  type St = { a: number; n: number; v: number; cool: number }
  const st: St[] = letters.map(() => ({ a: 0, n: 0, v: 0, cool: 0 }))
  return {
    name: 'splitflap',
    title: 'placa de aeroporto',
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        s.cool -= dt
        if (s.n === 0 && s.a === 0 && s.cool <= 0 && dist(l.center()) < 0.55 * S) {
          s.n = 6 + Math.floor(rnd(0, 6))
          s.v = 16
        }
        if (s.n === 0 && s.a === 0) continue
        s.a += s.v * dt
        if (s.n > 0 && s.a >= Math.PI / 2) {
          // edge-on: the next flap
          l.style = { ...randomStyle(), sc: l.style.sc }
          s.a = -Math.PI / 2
          s.n--
          s.v = Math.max(5, s.v * 0.86)
        } else if (s.n === 0 && s.a >= 0) {
          s.a = 0
          s.cool = 0.6
          l.pop = 0.5
        }
        if (s.a !== 0) l.fx.tilt = { x: s.a, y: 0, pivot: 'center' }
      }
    },
  }
}

// 3 · slingshot: grab a letter (press on it) and pull — a band stretches back to where it stood; let
// go and it's shot the other way, tumbling, bouncing off the edges of the screen, and comes home
function slingshot(): Hover {
  let held: Letter | null = null
  let grab = { x: 0, y: 0 }
  const fl = letters.map(() => ({ t: 0, rx: 0, ry: 0, wx: 0, wy: 0 }))
  return {
    name: 'slingshot',
    title: 'estilingue',
    sticky: () => !!held || letters.some((l) => l.free),
    exit() {
      held = null
      for (const l of letters) l.free = false
    },
    update(dt) {
      if (!held && m.down) {
        for (const l of letters) {
          const c = l.center()
          if (dist(c) < 0.5 * S && !l.free) {
            held = l
            grab = { x: c.x - m.x, y: c.y - m.y }
            l.free = true
            l.vx = l.vy = 0
            break
          }
        }
      }
      if (held) {
        const h = homeCenter(held)
        if (m.down) {
          // follows the cursor, the band pulling a little
          held.ox = m.x + grab.x - h.x
          held.oy = m.y + grab.y - h.y
        } else {
          // let go: shot back past home, harder the further it was pulled
          const f = fl[held.i]
          held.vx = -held.ox * 9
          held.vy = -held.oy * 9
          const sp = Math.hypot(held.vx, held.vy) / S
          f.t = 0
          f.wx = rnd(-1, 1) * sp * 2.2
          f.wy = rnd(-1, 1) * sp * 2.2
          held = null
        }
      }
      for (const l of letters) {
        const f = fl[l.i]
        if (l.free && l !== held) {
          f.t += dt
          fly(l, dt, 1.1)
          f.rx += f.wx * dt
          f.ry += f.wy * dt
          f.wx *= Math.exp(-dt * 1.2)
          f.wy *= Math.exp(-dt * 1.2)
          if (f.t > 2.4 || (f.t > 0.4 && Math.hypot(l.vx, l.vy) < 30)) l.free = false
        } else if (!l.free) {
          f.rx = settle(f.rx, dt)
          f.ry = settle(f.ry, dt)
        }
        if (f.rx || f.ry) l.fx.tilt = { x: f.rx, y: f.ry, pivot: 'center' }
      }
    },
    over() {
      if (!held) return
      // the band: from the two sides of where it stood to the letter
      const h = homeCenter(held)
      const c = held.center()
      const half = (held.sprite().adv * held.s) / 2
      ctx.strokeStyle = INK
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      ctx.moveTo(h.x - half, h.y)
      ctx.lineTo(c.x, c.y)
      ctx.lineTo(h.x + half, h.y)
      ctx.stroke()
      ctx.fillStyle = INK
      for (const x of [h.x - half, h.x + half]) {
        ctx.beginPath()
        ctx.arc(x, h.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    },
  }
}

// 4 · jelly: poke a letter and it wobbles like jelly on a plate — squashed the way it was poked,
// springing back and forth on its baseline
function jelly(): Hover {
  const st = letters.map(() => ({ a: 0, v: 0, phi: 0, cool: 0 }))
  return {
    name: 'jelly',
    title: 'gelatina',
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        s.cool -= dt
        if (s.cool <= 0 && dist(l.center()) < 0.5 * S && m.speed > 120) {
          s.phi = Math.atan2(m.vy, m.vx)
          s.v -= clamp(m.speed / 1400, 0.4, 2.2) * 2.4
          s.cool = 0.25
        }
        // a soft spring that keeps going: n steps so a slow frame can't blow it up
        const n = Math.ceil(dt * 240)
        const h = dt / n
        for (let k = 0; k < n; k++) {
          s.v += (-170 * s.a - 3.2 * s.v) * h
          s.a = clamp(s.a + s.v * h, -0.42, 0.6)
        }
        if (Math.abs(s.a) > 1e-4) l.fx.jelly = { phi: s.phi, sx: 1 + s.a, sy: 1 / (1 + s.a), sz: 1 + s.a * 0.35 }
      }
    },
  }
}

// 5 · whirlwind: stir the cursor round in circles and a vortex winds up — the letters are lifted
// into it, spinning in 3D; stop stirring and it dies down and drops them home
function vortex(): Hover {
  let spin = 0 // signed: which way, how hard
  let cx = 0
  let cy = 0
  let pvx = 0
  let pvy = 0
  const o = letters.map(() => ({ phi: 0, r: 0, ry: 0, on: false }))
  return {
    name: 'vortex',
    title: 'redemoinho',
    enter() {
      spin = 0
      cx = m.x
      cy = m.y
      for (const x of o) x.on = false
    },
    update(dt) {
      // how fast the cursor's heading turns, while it's moving: circles wind the vortex up
      if (m.speed > 220 && Math.hypot(pvx, pvy) > 220) {
        const turn = Math.atan2(pvx * m.vy - pvy * m.vx, pvx * m.vx + pvy * m.vy)
        spin += turn * 0.5
      }
      pvx = m.vx
      pvy = m.vy
      spin = clamp(spin * Math.exp(-dt * 0.7), -14, 14)
      const k = 1 - Math.exp(-dt * 3)
      if (m.on) {
        cx += (m.x - cx) * k
        cy += (m.y - cy) * k
      }
      const w = clamp((Math.abs(spin) - 0.6) / 5, 0, 1)
      for (const l of letters) {
        const s = o[l.i]
        const h = homeCenter(l)
        if (!s.on) {
          s.phi = Math.atan2(h.y - cy, h.x - cx)
          s.r = clamp(Math.hypot(h.x - cx, h.y - cy), 0.35 * S, 1.6 * S)
          s.on = w > 0
        }
        if (w <= 0) {
          s.on = false
          s.ry = settle(s.ry, dt, 4)
        } else {
          s.phi += spin * dt * 0.55 * ((1.2 * S) / s.r)
          s.r += (0.75 * S + (l.i % 3) * 0.22 * S - s.r) * dt * 0.8
          s.ry += spin * dt * 1.4
        }
        const tx = cx + s.r * Math.cos(s.phi) - h.x
        const ty = cy + s.r * 0.6 * Math.sin(s.phi) - h.y
        l.tx = tx * w
        l.ty = ty * w
        l.k = 110
        l.c = 13
        if (s.ry) l.fx.tilt = { x: w * 0.5 * Math.sin(s.phi), y: s.ry, pivot: 'center' }
      }
    },
  }
}

// 6 · magnet: the letters stick to the cursor like fridge magnets, piling up on each other; shake it
// hard and they all come off, scattered, then slide home
function magnet(): Hover {
  const stuck: Letter[] = []
  const off = new Map<Letter, { x: number; y: number; r: number }>()
  const loose = letters.map(() => ({ t: 0, cool: 0 }))
  return {
    name: 'magnet',
    title: 'ímã',
    sticky: () => stuck.length > 0 || letters.some((l) => l.free),
    exit() {
      stuck.length = 0
      for (const l of letters) l.free = false
    },
    update(dt) {
      // a hard shake: everything comes off
      if (stuck.length && m.speed > 1800) {
        for (const l of stuck) {
          l.free = true
          l.vx = m.vx * 0.55 + rnd(-500, 500)
          l.vy = m.vy * 0.55 + rnd(-500, 500)
          loose[l.i] = { t: 0, cool: 1.4 }
        }
        stuck.length = 0
      }
      for (const l of letters) {
        const z = loose[l.i]
        z.cool -= dt
        if (l.free) {
          z.t += dt
          fly(l, dt, 2.2)
          if (z.t > 1.1) l.free = false
          continue
        }
        if (!stuck.includes(l) && z.cool <= 0 && dist(l.center()) < 0.45 * S) {
          stuck.push(l)
          off.set(l, { x: rnd(-0.28, 0.28) * S, y: rnd(-0.22, 0.22) * S, r: rnd(-0.45, 0.45) })
        }
      }
      stuck.forEach((l, k) => {
        const f = off.get(l)!
        const h = homeCenter(l)
        l.tx = m.x + f.x - h.x
        l.ty = m.y + f.y - h.y
        l.rotT = f.r
        l.k = 320
        l.c = 24
        l.fx.dz = 0.02 * (k + 1) // the last one on top
      })
    },
  }
}

// 7 · pogo: touch a letter and it crouches, jumps, flips once in the air and lands with a squash
function pogo(): Hover {
  type St = { phase: 'idle' | 'crouch' | 'air' | 'land'; t: number; vy: number; cool: number }
  const st: St[] = letters.map(() => ({ phase: 'idle', t: 0, vy: 0, cool: 0 }))
  const G = () => 7.5 * S
  return {
    name: 'pogo',
    title: 'pula-pula',
    exit() {
      for (const l of letters) l.kin = false
    },
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        s.cool -= dt
        if (s.phase === 'idle') {
          if (s.cool <= 0 && dist(l.center()) < 0.5 * S) Object.assign(s, { phase: 'crouch', t: 0 })
          else continue
        }
        l.kin = true
        l.ox += (0 - l.ox) * Math.min(1, dt * 10)
        s.t += dt
        if (s.phase === 'crouch') {
          const k = Math.min(1, s.t / 0.11)
          l.fx.jelly = { phi: Math.PI / 2, sx: 1 - 0.35 * k, sy: 1 + 0.2 * k, sz: 1 }
          if (k >= 1) Object.assign(s, { phase: 'air', t: 0, vy: -rnd(2.6, 3.4) * S })
        } else if (s.phase === 'air') {
          s.vy += G() * dt
          l.oy += s.vy * dt
          const T = (2 * 3.0 * S) / G() // about the time up and down
          l.fx.tilt = { x: Math.min(1, s.t / T) * Math.PI * 2, y: 0, pivot: 'center' }
          l.fx.jelly = { phi: Math.PI / 2, sx: 1 + 0.12 * Math.min(1, Math.abs(s.vy) / (3 * S)), sy: 1, sz: 1 }
          if (l.oy >= 0 && s.vy > 0) {
            l.oy = 0
            Object.assign(s, { phase: 'land', t: 0 })
          }
        } else {
          const k = Math.sin(Math.min(1, s.t / 0.22) * Math.PI)
          l.fx.jelly = { phi: Math.PI / 2, sx: 1 - 0.3 * k, sy: 1 + 0.18 * k, sz: 1 }
          if (s.t >= 0.22) {
            Object.assign(s, { phase: 'idle', cool: 0.35 })
            l.kin = false
            l.vx = l.vy = 0
          }
        }
      }
    },
  }
}

// 8 · coin: flick a letter sideways and it spins about its upright like a coin on a table, slowing
// down, rattling on its edge, until it falls still
function coin(): Hover {
  const st = letters.map(() => ({ a: 0, w: 0, w0: 1, ph: 0 }))
  return {
    name: 'coin',
    title: 'moeda',
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        if (dist(l.center()) < 0.5 * S && Math.abs(m.vx) > 250 && Math.abs(s.w) < 2) {
          s.w = clamp(m.vx / S, -14, 14) * 2.2
          s.w0 = Math.abs(s.w)
        }
        if (Math.abs(s.w) > 0.6) {
          s.w *= Math.exp(-dt * 0.55)
          s.a += s.w * dt
          s.ph += dt * (8 + 26 * (1 - Math.abs(s.w) / s.w0)) // the rattle quickens as it slows
          const r = (1 - Math.abs(s.w) / s.w0) * 0.35
          l.fx.tilt = { x: r * Math.sin(s.ph), y: s.a, pivot: 'base' }
        } else {
          s.w = 0
          const w = Math.round(s.a / (Math.PI * 2)) * Math.PI * 2
          s.a = w + (s.a - w) * Math.exp(-dt * 5)
          if (Math.abs(s.a - w) < 1e-3) s.a = w
          if (s.a !== w) l.fx.tilt = { x: 0, y: s.a, pivot: 'base' }
        }
      }
    },
  }
}

// 9 · snake: touch the word and it follows the cursor head first, letter after letter, like the old
// phone game; keep the cursor still a moment and it crawls back into place
function snake(): Hover {
  const trail: { x: number; y: number }[] = []
  let on = false
  let still = 0
  const at = (d: number) => {
    // the point d px back along the trail from the head
    for (let k = trail.length - 1; k > 0; k--) {
      const a = trail[k]
      const b = trail[k - 1]
      const seg = Math.hypot(a.x - b.x, a.y - b.y)
      if (d <= seg) {
        const t = d / (seg || 1)
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(a.y - b.y, a.x - b.x) }
      }
      d -= seg
    }
    const p = trail[0] ?? { x: m.x, y: m.y }
    return { x: p.x, y: p.y, ang: 0 }
  }
  return {
    name: 'snake',
    title: 'cobrinha',
    sticky: () => on,
    enter() {
      on = false
      trail.length = 0
    },
    update(dt) {
      if (!on && letters.some((l) => dist(l.center()) < 0.45 * S) && m.speed > 80) {
        on = true
        still = 0
        trail.length = 0
        // the trail starts as the word itself, so nothing jumps
        for (let i = letters.length - 1; i >= 0; i--) trail.push(homeCenter(letters[i]))
        trail.push({ x: m.x, y: m.y })
      }
      if (!on) return
      const last = trail[trail.length - 1]
      if (Math.hypot(m.x - last.x, m.y - last.y) > 4) trail.push({ x: m.x, y: m.y })
      if (trail.length > 600) trail.splice(0, trail.length - 600)
      still = m.speed < 40 ? still + dt : 0
      if (still > 1.4 || !m.on) {
        on = false
        return
      }
      let d = 0.35 * S
      for (const l of letters) {
        const half = (l.sprite().adv * l.s) / 2
        d += half
        const p = at(d)
        const h = homeCenter(l)
        l.tx = p.x - h.x
        l.ty = p.y - h.y
        let a = p.ang
        if (a > Math.PI / 2) a -= Math.PI
        if (a < -Math.PI / 2) a += Math.PI
        l.rotT = a
        l.k = 260
        l.c = 26
        d += half + 0.04 * S
      }
    },
  }
}

// 10 · burst: click and the word blows apart from where you clicked, the letters tumbling in 3D,
// then it pulls itself back together
function burst(): Hover {
  let seen = -1
  let t = -1
  const sp = letters.map(() => ({ rx: 0, ry: 0, wx: 0, wy: 0 }))
  return {
    name: 'burst',
    title: 'explosão',
    sticky: () => t >= 0,
    exit() {
      for (const l of letters) l.free = false
      t = -1
    },
    update(dt) {
      if (seen < 0) seen = m.clicks
      if (m.clicks !== seen && t < 0) {
        t = 0
        for (const l of letters) {
          const c = l.center()
          const dx = c.x - m.x
          const dy = c.y - m.y
          const d = Math.hypot(dx, dy) || 1
          const f = (4.2 * S * S) / (d + 0.8 * S)
          l.free = true
          l.vx = (dx / d) * f * 2.4 + rnd(-200, 200)
          l.vy = (dy / d) * f * 2.4 - rnd(100, 500)
          sp[l.i].wx = rnd(-14, 14)
          sp[l.i].wy = rnd(-14, 14)
        }
      }
      seen = m.clicks
      if (t >= 0) {
        t += dt
        if (t > 0.9) for (const l of letters) l.free = false
        if (t > 2.4) t = -1
      }
      for (const l of letters) {
        const s = sp[l.i]
        if (l.free) {
          fly(l, dt, 2.4)
          s.rx += s.wx * dt
          s.ry += s.wy * dt
        } else {
          s.rx = settle(s.rx, dt, 5)
          s.ry = settle(s.ry, dt, 5)
        }
        if (s.rx || s.ry) l.fx.tilt = { x: s.rx, y: s.ry, pivot: 'center' }
      }
    },
  }
}

// 11 · yo-yo: touch a letter and it drops on a string, spinning as the string unwinds, and climbs
// back up into its place
function yoyo(): Hover {
  const st = letters.map(() => ({ t: -1, cool: 0, D: 0 }))
  const T = 1.25
  return {
    name: 'yoyo',
    title: 'ioiô',
    exit() {
      for (const l of letters) l.kin = false
    },
    update(dt) {
      for (const l of letters) {
        const s = st[l.i]
        s.cool -= dt
        if (s.t < 0) {
          if (s.cool <= 0 && dist(l.center()) < 0.5 * S) {
            s.t = 0
            s.D = rnd(0.75, 1.05) * S
          } else continue
        }
        s.t += dt
        l.kin = true
        l.ox += (0 - l.ox) * Math.min(1, dt * 10)
        const u = Math.min(1, s.t / T)
        // falls fast, sleeps a beat at the bottom, climbs back
        const y = u < 0.42 ? (u / 0.42) ** 2 : u < 0.55 ? 1 : 1 - ((u - 0.55) / 0.45) ** 0.8
        l.oy = s.D * y
        const wound = s.D * (u < 0.55 ? y : 2 - y) // string run off, then back on
        l.fx.tilt = { x: wound / (0.25 * S) + (u >= 0.42 && u < 0.55 ? (u - 0.42) * 60 : 0), y: 0, pivot: 'center' }
        if (u >= 1) {
          s.t = -1
          s.cool = 0.4
          l.kin = false
          l.oy = 0
          l.vx = l.vy = 0
        }
      }
    },
    over() {
      ctx.strokeStyle = INK
      ctx.lineWidth = 1.2
      ctx.globalAlpha = 0.8
      for (const l of letters) {
        if (st[l.i].t < 0) continue
        const h = homeCenter(l)
        const c = l.center()
        ctx.beginPath()
        ctx.moveTo(h.x, h.y - (l.sprite().asc * l.s) / 2)
        ctx.lineTo(c.x, c.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    },
  }
}

export const FUN_SET: Record<string, () => Hover> = { domino, splitflap, slingshot, jelly, vortex, magnet, pogo, coin, snake, burst, yoyo }

/** /hero-hovers-cubos.html's hovers (2026-10-18): grid, gravity and spacing out; split-flap, whirlwind
 *  and jelly in — then the pendulum out; snake, coin and pogo in — then the string out */
const { breakpoint, flee, orbit, bezier, wireframe, progressive, roulette, billiards } = GIZ_SET
export const CUBOS_SET: Record<string, () => Hover> = { breakpoint, flee, orbit, bezier, wireframe, progressive, roulette, billiards, splitflap, vortex, jelly, snake, coin, pogo }
/** the ideas still on the bench */
export const BENCH = ['domino', 'slingshot', 'magnet', 'burst', 'yoyo']
