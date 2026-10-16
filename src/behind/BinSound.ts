import { sfx } from './sfx'
import { split, reelOf, type Knock } from './DrawerSound'

// The bin (the site's: e's knocks, no sound turning — Danilo's pick; ?binsound=a|b|c|d and
// ?binturn=oco|balde|rola to try others, ?binsound=off mutes it): a metal
// waste bin, brushed by the cursor (or hit by a ball). Heard as a metal can, as it moves:
//   - the BUMP: the cursor's push itself strikes the can — a hollow metal "toing", as hard as the push
//     (a sudden kick in how it's turning), left to ring out;
//   - TURNING: its metal bottom dragged round on the floor — a reel of the steady scrape (a garbage can
//     dragged on tile), as loud and bright as it's turning fast, silent when it stops;
//   - TIPPING: each time it rocks back through upright its base lands again — a lighter knock of the
//     same can, ringing, each one softer, until it's still.
// Knocks cut from real recordings (CC0, Freesound) and left to ring up to 1.2 s:
//   c  "cesto de escritório": WasteMetalBasket (three takes of an office metal waste basket)
//   d  "lata de lixo": Metal Trash Bin, trash can, garbage can hit, trashcan, a kicked bin
//   e  "lata ressonante": a metal trash can struck in a hall, a can hit, a metal flick-hit
// Placed left/right where the bin is on screen.
const Q = new URLSearchParams(location.search)
const SETS: Record<string, { scrape: string; knocks: string[]; ring: number }> = {
  a: { scrape: '104360', knocks: ['565966', '761717'], ring: 0.35 },
  b: { scrape: '565967', knocks: ['565966', '761717'], ring: 0.35 },
  c: { scrape: '473796', knocks: ['667720', '667721', '667722'], ring: 1.2 },
  d: { scrape: '473796', knocks: ['873900', '208769', '406492', '44871', '365371'], ring: 1.2 },
  e: { scrape: '473796', knocks: ['269621', '774234', '424424'], ring: 1.2 },
}
const SET = SETS[Q.get('binsound') ?? 'e'] ?? null
// (TEST) the turning's sound on its own: ?binturn=off (none), oco (a hollow metal bin scraping), balde
// (a small metal bucket pushed), rola (a can rolling over the floor: a rim's rumble)
const TURNS: Record<string, string | null> = { off: null, oco: '104360', balde: '565967', rola: '593129' }
const TURN = Q.get('binturn') ?? 'off'
const SCRAPE = TURN !== null && TURN in TURNS ? TURNS[TURN] : SET?.scrape ?? null
const YAW_FULL = 0.9 // rad/s: a quick turn (measured: a brisk pass of the cursor turns it ~0.9)
const TIP_FULL = 0.25 // rad/s: a hard rock back (measured: it tips ~1°, coming back at 0.1–0.25)
const BUMP_FULL = 1.0 // rad/s of sudden change in its turning: a firm push

export class BinSound {
  private reel?: AudioBuffer
  private knocks: Knock[] = [] // sorted light .. heavy
  private voice?: { g: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode }
  private was?: { tx: number; tz: number; yawV: number }
  private lastKnock = 0
  private lastBump = 0
  private lastKick = 0

  constructor() {
    if (!SET) return
    const { ctx } = sfx()
    const load = (id: string) => fetch(`${import.meta.env.BASE_URL}behind/sound/bin/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a))
    if (SCRAPE) void load(SCRAPE).then((b) => {
      const { slides } = split(b)
      // (a scrape is mostly "slide"; one full of little ticks — a can rolling — leaves too little
      // steady stretch: then the whole of its sounding part)
      const steady = slides.reduce((n, [a, z]) => n + z - a, 0)
      this.reel = reelOf(ctx, steady >= 1 ? slides.map(([a, z]): [AudioBuffer, number, number] => [b, a, z]) : [[b, ...sounding(b)]])
      if (Q.has('bindebug')) console.log('[bin] scrape reel', this.reel?.duration.toFixed(2), 's')
    })
    void Promise.all(SET.knocks.map(load)).then((bufs) => {
      for (const b of bufs) this.knocks.push(...split(b, SET.ring).knocks)
      this.knocks.sort((p, q) => p.weight - q.weight)
      if (Q.has('bindebug')) console.log('[bin]', this.knocks.length, 'knocks')
    })
  }

  /** each frame: the bin's turning speed (rad/s), its tip about two axes and their speeds, and where
   *  it is across the screen (-1..1) */
  update(dt: number, m: { yawV: number; tx: number; txV: number; tz: number; tzV: number }, x: number): void {
    const { ctx, out } = sfx()
    if (!SET || (SCRAPE && !this.reel) || ctx.state !== 'running' || dt <= 0) return
    const t = ctx.currentTime
    const sx = Number.isFinite(x) ? Math.max(-0.7, Math.min(0.7, x * 0.7)) : 0
    if (!this.voice && this.reel) {
      const src = ctx.createBufferSource()
      src.buffer = this.reel
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      const g = ctx.createGain()
      g.gain.value = 0
      const pan = ctx.createStereoPanner()
      src.connect(lp).connect(g).connect(pan).connect(out)
      src.start(t, Math.random() * this.reel.duration)
      this.voice = { g, lp, pan }
    }
    // turning: the scrape
    const s = Math.min(1.2, Math.abs(m.yawV) / YAW_FULL)
    if (this.voice) {
      this.voice.g.gain.setTargetAtTime(0.35 * Math.pow(s, 1.4), t, 0.03)
      this.voice.lp.frequency.setTargetAtTime(500 + 6000 * Math.min(1, s), t, 0.05)
      this.voice.pan.pan.setTargetAtTime(sx, t, 0.1)
    }
    const w = this.was
    this.was = { tx: m.tx, tz: m.tz, yawV: m.yawV }
    if (!w) return
    const now = performance.now()
    // the bump: its turning kicked all at once — the cursor (or a ball) struck it
    // (a cursor crossing it pushes again every ~0.12 s: still one bump — the rest only keep it turning.
    // Another strike only after a real pause, or from a clearly harder push)
    const kick = Math.abs(m.yawV - w.yawV)
    if (kick > 0.18 && (now - this.lastBump > 650 || kick > this.lastKick * 1.6)) {
      this.lastBump = now
      this.lastKick = kick
      this.lastKnock = now
      this.knock(Math.min(1.2, kick / BUMP_FULL), sx, true)
      return
    }
    // tipping: back through upright on either axis, coming back hard enough
    const crossX = Math.sign(m.tx) !== Math.sign(w.tx) && w.tx !== 0
    const crossZ = Math.sign(m.tz) !== Math.sign(w.tz) && w.tz !== 0
    const v = Math.max(crossX ? Math.abs(m.txV) : 0, crossZ ? Math.abs(m.tzV) : 0)
    if (v > 0.035 && now - this.lastKnock > 60) {
      this.lastKnock = now
      this.knock(Math.min(1.2, v / TIP_FULL) * 0.55, sx, false)
    }
  }

  private knock(s: number, pan: number, bump: boolean): void {
    const { ctx, out } = sfx()
    if (!this.knocks.length) return
    if (Q.has('bindebug')) console.log('[bin]', bump ? 'toing' : 'tlac', s.toFixed(2))
    // a bump: from the heavier half; the base landing: the lighter half
    const half = Math.floor(this.knocks.length / 2)
    const pool = bump ? this.knocks.slice(half) : this.knocks.slice(0, Math.max(1, half))
    const k = pool[Math.floor(Math.random() * pool.length)]
    const t = ctx.currentTime + 0.003
    const src = ctx.createBufferSource()
    src.buffer = k.buf
    src.playbackRate.value = 0.96 + 0.08 * Math.random()
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 900 + 9000 * Math.min(1, s * s)
    const g = ctx.createGain()
    const level = 0.34 * k.gain * Math.pow(Math.min(1, s), 1.2)
    // left to ring: held, then let die away over the last part of its own ring
    g.gain.setValueAtTime(level, t)
    g.gain.setValueAtTime(level, t + k.len * 0.7)
    g.gain.linearRampToValueAtTime(0, t + k.len)
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    src.connect(lp).connect(g).connect(p).connect(out)
    src.start(t, k.at, k.len + 0.02)
  }
}

/** where a recording actually sounds: from the first to the last 10 ms block well over its floor */
function sounding(b: AudioBuffer): [number, number] {
  const d = b.getChannelData(0)
  const win = Math.round(b.sampleRate * 0.01)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const floor = [...env].sort((p, q) => p - q)[Math.floor(env.length * 0.15)]
  const on = env.map((r) => r > floor * 4)
  const a = on.indexOf(true)
  const z = on.lastIndexOf(true)
  return a < 0 ? [0, b.duration] : [a * 0.01, (z + 1) * 0.01]
}
