import { sfx } from './sfx'

// The desk's drawers (the site's: a, Danilo's pick; ?drawer=b|c or pooled ?drawer=a,b to try,
// ?drawer=off mutes them): nudged out by the
// cursor and springing back shut. Real recordings of wooden drawers (CC0, Freesound), split
// automatically into what a drawer does:
//   - its SLIDE: the steady stretches (no knocks in them), laid end to end into a reel that runs while
//     a drawer moves — as loud and bright as it's moving fast, silent when it stops;
//   - its KNOCKS: the sharp hits, sorted by weight — the firm ones for it shutting against the desk
//     (as hard as it came home, each re-bounce again, softer), the light ones for it reaching the end
//     of its run.
// Placed left/right where the drawer is on screen.
const Q = new URLSearchParams(location.search)
const SETS: Record<string, string[]> = {
  a: ['756424'], // Wooden Drawer Open Close (studio)
  b: ['364106', '364105'], // Wooden_Drawer_open_close 1 and 2
  c: ['481886'], // R22-37 Wooden Drawer Slide and Close
}
// (several at once, comma-separated: ?drawer=a,b — their knocks and slides pooled)
const PICKED = (Q.get('drawer') ?? 'a').split(',').filter((k) => SETS[k])
const SET = PICKED.length ? PICKED.flatMap((k) => SETS[k]) : null
const V_FULL = 0.6 // m/s: a quick drawer
const OUT_MAX = 0.09 // m: how far a drawer comes out (deskReactor)

export type Knock = { buf: AudioBuffer; at: number; len: number; gain: number; weight: number }
type Voice = { src: AudioBufferSourceNode; g: GainNode; lp: BiquadFilterNode; pan: StereoPannerNode }

export class DrawerSound {
  private reel?: AudioBuffer
  private knocks: Knock[] = [] // sorted light .. firm
  private voices: Voice[] = []
  private was: number[] = []
  private wasV: number[] = []

  constructor() {
    if (!SET) return
    const { ctx } = sfx()
    void Promise.all(SET.map((id) => fetch(`${import.meta.env.BASE_URL}behind/sound/drawer/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)))).then((bufs) => {
      const slides: [AudioBuffer, number, number][] = []
      for (const b of bufs) {
        const { knocks, slides: s } = split(b)
        this.knocks.push(...knocks)
        slides.push(...s.map(([a, z]): [AudioBuffer, number, number] => [b, a, z]))
      }
      this.knocks.sort((p, q) => p.weight - q.weight)
      this.reel = reelOf(ctx, slides)
      if (Q.has('drawerdebug')) console.log('[drawer]', this.knocks.length, 'knocks,', this.reel?.duration.toFixed(2), 's of slide')
    })
  }

  /** each frame: every drawer's place (m out), and each one's place across the screen (-1..1) */
  update(dt: number, xs: number[], screenX: number[]): void {
    const { ctx, out } = sfx()
    if (!this.reel || ctx.state !== 'running' || dt <= 0) return
    const t = ctx.currentTime
    xs.forEach((x, i) => {
      if (!Number.isFinite(x)) return
      const prev = this.was[i] ?? x
      const v = (x - prev) / dt
      const pv = this.wasV[i] ?? 0
      this.was[i] = x
      this.wasV[i] = v
      // the slide: one running reel per drawer, opened by its speed
      let vo = this.voices[i]
      if (!vo) {
        const src = ctx.createBufferSource()
        src.buffer = this.reel!
        src.loop = true
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        const g = ctx.createGain()
        g.gain.value = 0
        const pan = ctx.createStereoPanner()
        src.connect(lp).connect(g).connect(pan).connect(out)
        src.start(t, Math.random() * this.reel!.duration)
        vo = this.voices[i] = { src, g, lp, pan }
      }
      const s = Math.min(1.2, Math.abs(v) / V_FULL)
      vo.g.gain.setTargetAtTime(0.75 * Math.pow(s, 1.3), t, 0.02)
      vo.lp.frequency.setTargetAtTime(700 + 6500 * Math.min(1, s), t, 0.04)
      const sx = Number.isFinite(screenX[i]) ? screenX[i] : 0
      vo.pan.pan.setTargetAtTime(Math.max(-0.7, Math.min(0.7, sx * 0.7)), t, 0.1)
      // shut: it was coming home and now sits in its slot
      if (x <= 1e-4 && prev > 1e-4 && pv < -0.02) this.knock(Math.min(1.2, -pv / V_FULL), true, sx)
      // the end of its run
      if (x >= OUT_MAX - 1e-4 && prev < OUT_MAX - 1e-4 && pv > 0.02) this.knock(Math.min(1, pv / V_FULL) * 0.5, false, sx)
    })
  }

  private knock(s: number, firm: boolean, x: number): void {
    const { ctx, out } = sfx()
    if (!this.knocks.length) return
    // firm (shutting): from the heavier half; light (end of run): the lighter half
    const half = Math.floor(this.knocks.length / 2)
    const pool = firm ? this.knocks.slice(half) : this.knocks.slice(0, Math.max(1, half))
    const k = pool[Math.floor(Math.random() * pool.length)]
    const t = ctx.currentTime + 0.003
    const src = ctx.createBufferSource()
    src.buffer = k.buf
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.06
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 600 + 9000 * Math.min(1, s * s)
    const g = ctx.createGain()
    const level = 0.9 * k.gain * Math.pow(Math.min(1, s), 1.2)
    g.gain.setValueAtTime(level, t)
    g.gain.setValueAtTime(level, t + k.len * 0.6)
    g.gain.linearRampToValueAtTime(0, t + k.len)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-0.7, Math.min(0.7, x * 0.7))
    src.connect(lp).connect(g).connect(pan).connect(out)
    src.start(t, k.at, k.len + 0.02)
  }
}

/** a recording split into its knocks (sharp onsets on a 2 ms envelope, kept until rung down, up to
 *  0.35 s, weighed by their peak) and its slides (steady stretches between them: loud enough, no
 *  sudden rise, at least 60 ms) */
export function split(b: AudioBuffer, ring = 0.35): { knocks: Knock[]; slides: [number, number][] } {
  const sr = b.sampleRate
  const d = b.getChannelData(0)
  const win = Math.round(sr * 0.002)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const sorted = [...env].sort((p, q) => p - q)
  const floor = Math.max(1e-5, sorted[Math.floor(sorted.length * 0.15)])
  const top = sorted[sorted.length - 1]
  const knocks: Knock[] = []
  const busy = new Uint8Array(env.length) // knocks and their ring
  let i = 4
  while (i < env.length) {
    const prev = (env[i - 1] + env[i - 2] + env[i - 3] + env[i - 4]) / 4
    if (env[i] > prev * 3.5 && env[i] > top * 0.12) {
      let pk = i
      for (let k = i; k < Math.min(env.length, i + 8); k++) if (env[k] > env[pk]) pk = k
      let end = pk
      while (end < env.length && (end - i) * 0.002 < ring && env[end] > env[pk] * 0.05) end++
      for (let k = Math.max(0, i - 5); k < Math.min(env.length, end + 10); k++) busy[k] = 1
      knocks.push({ buf: b, at: Math.max(0, (i - 2) * win) / sr, len: Math.max(0.05, (end - i + 2) * 0.002), gain: Math.min(5, (top * 0.6) / env[pk]), weight: env[pk] })
      i = end
    } else i++
  }
  // slides: 10 ms blocks, steady and well over the floor, away from the knocks
  const slides: [number, number][] = []
  let start = -1
  for (let k = 0; k + 5 <= env.length; k += 5) {
    const blk = env.slice(k, k + 5)
    const m = blk.reduce((x, y) => x + y, 0) / 5
    const ok = !busy.slice(k, k + 5).some(Boolean) && m > floor * 6 && m > top * 0.02 && Math.max(...blk) < m * 2.2
    if (ok && start < 0) start = k
    if (!ok && start >= 0) {
      if ((k - start) * 0.002 >= 0.06) slides.push([(start * win) / sr, (k * win) / sr])
      start = -1
    }
  }
  return { knocks, slides }
}

/** the slides laid end to end, each seam a 20 ms equal-power crossfade, evened out in level */
export function reelOf(ctx: AudioContext, slides: [AudioBuffer, number, number][]): AudioBuffer | undefined {
  if (!slides.length) return undefined
  const sr = slides[0][0].sampleRate
  const xf = Math.round(sr * 0.02)
  const parts = slides.map(([b, a, z]) => {
    const s = b.getChannelData(0).slice(Math.round(a * sr), Math.round(z * sr))
    let e = 0
    for (const v of s) e += v * v
    const rms = Math.sqrt(e / Math.max(1, s.length))
    return s.map((v) => (v / Math.max(1e-4, rms)) * 0.12)
  }).filter((p) => p.length > xf * 2)
  if (!parts.length) return undefined
  const len = parts.reduce((n, p) => n + p.length - xf, 0) + xf
  const out = ctx.createBuffer(1, len, sr)
  const dst = out.getChannelData(0)
  let o = 0
  for (const p of parts) {
    const n = p.length
    for (let i = 0; i < n; i++) {
      const fin = i < xf ? Math.sin((i / xf) * Math.PI * 0.5) : 1
      const fout = i > n - xf ? Math.sin(((n - i) / xf) * Math.PI * 0.5) : 1
      if (o + i < len) dst[o + i] += p[i] * fin * fout
    }
    o += n - xf
  }
  return out
}
