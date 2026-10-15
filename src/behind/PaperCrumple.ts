// The sound of the sheet being crumpled in the hand — not a recording played
// back, but built crackle by crackle, live, from what the sheet is doing.
//
// Paper crumpling is a shower of tiny independent snaps (each one a crease giving way), so:
//   - hundreds of single snaps are cut, automatically, out of real recordings (CC0, Freesound);
//   - while the sheet is being crumpled they're fired at random moments, as many per second as it is
//     crumpling fast — drag fast, a dense crackle; slow, a few; stop, nothing;
//   - most snaps are small and a few big (as in the real thing), their loudness with the drag's speed;
//   - their timbre follows the sheet's state: a flat sheet gives broad, low snaps (a big sheet moving
//     air), a tight ball dry, high little ones — picked from the snaps by their measured brightness;
//   - the last squeeze into a ball is a short dense crunch;
//   - and when the hand stops, the paper keeps ticking a moment on its own — creases relaxing — as
//     much as it had just been worked.
// Panned a touch to where the sheet is on screen.
import { sfx } from './sfx'

const Q = new URLSearchParams(location.search)
// source pairs: [a big sheet (early), a small tight one (late)] — measured clean (no floor, no clipping)
const SETS: Record<string, string[]> = {
  a: ['619593', '619592'], // CRUMPLE, LARGE 1 / CRUMPLE, SMALL 1 (one studio session)
  b: ['390172', '369490'], // A4 Paper Scrunch / PaperCrumple_01
  c: ['457498', '502044'], // scrunchingpaper / Paper Crumple (long)
}
// the site's: b (Danilo's pick); ?crumple=a|c tries the others, ?crumple=off mutes it
const SET = SETS[Q.get('crumple') ?? 'b'] ?? null
const RATE_FULL = 1.6 // crumple per second that is a hard, fast squeeze
const SNAPS_FULL = 70 // snaps per second at that rate

type Snap = { buf: AudioBuffer; at: number; len: number; gain: number; bright: number }

export class PaperCrumple {
  private ctx?: AudioContext
  private out?: GainNode
  private pan?: StereoPannerNode
  private snaps: Snap[] = [] // sorted by brightness
  private next = 0 // when (ctx time) the next snap is due
  private work = 0 // how much it has just been worked (feeds the after-ticks)
  private quietFor = 0
  private recent: number[] = []

  constructor() {
    if (!SET) return
    // the context can be made (suspended) and the snaps cut before any gesture; it starts on the first
    const { ctx, out } = sfx()
    this.ctx = ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0.9
    this.pan = ctx.createStereoPanner()
    this.out.connect(this.pan).connect(out)
    void this.load(SET)
  }

  private async load(ids: string[]): Promise<void> {
    const ctx = this.ctx!
    const bufs = await Promise.all(ids.map((id) => fetch(`${import.meta.env.BASE_URL}behind/sound/paper/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a))))
    for (const b of bufs) this.snaps.push(...cutSnaps(b))
    this.snaps.sort((p, q) => p.bright - q.bright)
    if (Q.has('crumpledebug')) console.log('[crumple]', this.snaps.length, 'snaps')
  }

  /**
   * each frame, for the sheet in the hand: how much it crumpled this frame (dc ≥ 0), the frame's dt,
   * how crumpled it is now (0 flat .. 1 a ball) and where it is across the screen (-1 .. 1)
   */
  update(dc: number, dt: number, c: number, x: number): void {
    const ctx = this.ctx
    if (!ctx || !this.snaps.length || ctx.state !== 'running' || dt <= 0) return
    const rate = Math.max(0, dc) / dt
    const drive = Math.min(1.3, rate / RATE_FULL)
    this.pan!.pan.setTargetAtTime(Math.max(-0.5, Math.min(0.5, x * 0.5)), ctx.currentTime, 0.1)
    // worked: builds while crumpling, fades after
    this.work = Math.min(1, this.work * Math.exp(-dt / 0.9) + drive * dt * 1.4)
    this.quietFor = drive > 0.02 ? 0 : this.quietFor + dt
    const now = ctx.currentTime
    const until = now + dt + 0.03 // schedule just ahead, sample-accurate
    // the snaps per second right now: the crumpling's own, or the creases relaxing after it
    const relax = this.quietFor > 0 ? this.work * 9 * Math.exp(-this.quietFor / 0.45) : 0
    const lambda = drive * SNAPS_FULL * (0.35 + 0.65 * c) + relax
    // this frame's stretch of time (from where the last one's ended): as many snaps in it as a
    // Poisson count at today's rate, each at its own random moment
    const from = Math.max(now, this.next)
    this.next = until
    const w = until - from
    if (w <= 0 || lambda < 0.3) return
    const loud = drive > 0.02 ? 0.35 + 0.65 * Math.sqrt(Math.min(1, drive)) : 0.25 * this.work
    const n = poisson(lambda * w)
    for (let k = 0; k < n; k++) this.fire(from + Math.random() * w, c, loud, false)
  }

  /** the hand turning back while crumpling: a crackle of its own, as big as the stroke it ended
   *  (size 0..1) and as sharp as the turn was quick (speed 0..1) */
  twist(size: number, speed: number, c: number): void {
    const ctx = this.ctx
    if (!ctx || !this.snaps.length || ctx.state !== 'running') return
    const t0 = ctx.currentTime + 0.005
    const n = 3 + Math.round(size * 6 + Math.random() * 2)
    const spread = 0.05 + 0.1 * (1 - speed) // a quick turn: tight; a slow one: drawn out
    const loud = 0.45 + 0.4 * size + 0.15 * speed
    for (let i = 0; i < n; i++) this.fire(t0 + Math.pow(Math.random(), 1.4) * spread, c, loud * (i === 0 ? 1 : 0.6 + 0.4 * Math.random()), i === 0)
    this.work = Math.min(1, this.work + 0.25 * size)
  }

  /** (the toss) the fingers letting go of the ball: a couple of small, dry ticks — the ball easing
   *  open a hair — as loud as the flick was hard (0..1) */
  release(hard: number): void {
    const ctx = this.ctx
    if (!ctx || !this.snaps.length || ctx.state !== 'running') return
    const t0 = ctx.currentTime + 0.004
    const n = 1 + Math.round(Math.random() + hard * 1.5)
    for (let i = 0; i < n; i++) this.fire(t0 + i * (0.018 + Math.random() * 0.03), 1, (0.22 + 0.3 * hard) * (i ? 0.6 : 1), i === 0)
  }

  /** the last squeeze into a ball: a short dense crunch */
  squeeze(): void {
    const ctx = this.ctx
    if (!ctx || !this.snaps.length || ctx.state !== 'running') return
    const t0 = ctx.currentTime + 0.01
    const n = 9 + Math.floor(Math.random() * 5)
    for (let i = 0; i < n; i++) this.fire(t0 + Math.pow(Math.random(), 1.6) * 0.16, 1, 0.75 + 0.25 * Math.random(), true)
    this.work = 1
  }

  private fire(t: number, c: number, loud: number, hard: boolean): void {
    const ctx = this.ctx!
    // brightness wanted: low and broad for a flat sheet, high and dry for a ball (a spread around it)
    const want = Math.min(1, Math.max(0, c * 0.85 + 0.08 + (Math.random() - 0.5) * 0.3))
    let i = Math.min(this.snaps.length - 1, Math.floor(want * this.snaps.length))
    for (let k = 0; k < 6 && this.recent.includes(i); k++) i = (i + 1 + Math.floor(Math.random() * 5)) % this.snaps.length
    this.recent.push(i)
    if (this.recent.length > 12) this.recent.shift()
    const s = this.snaps[i]
    // most snaps small, a few big
    const g = loud * s.gain * (hard ? 1 : 0.15 + 0.85 * Math.pow(Math.random(), 2.2))
    const src = ctx.createBufferSource()
    src.buffer = s.buf
    src.playbackRate.value = (1 + c * 0.06) * (1 + (Math.random() - 0.5) * 0.08)
    const env = ctx.createGain()
    const len = s.len / src.playbackRate.value
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(g, t + 0.002)
    env.gain.setValueAtTime(g, t + len * 0.55)
    env.gain.linearRampToValueAtTime(0, t + len)
    src.connect(env).connect(this.out!)
    src.start(t, s.at, s.len)
  }
}

/** the single snaps in a recording: onsets on a 2 ms envelope (a sharp rise well over the floor),
 *  each run until it has died to a fraction of its peak (25 .. 170 ms), its loudness evened out and
 *  its brightness measured (zero crossings per second) */
function cutSnaps(b: AudioBuffer): Snap[] {
  const sr = b.sampleRate
  const d = new Float32Array(b.length)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const x = b.getChannelData(c)
    for (let i = 0; i < d.length; i++) d[i] += x[i] / b.numberOfChannels
  }
  const win = Math.round(sr * 0.002)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const sorted = [...env].sort((p, q) => p - q)
  const floor = Math.max(1e-4, sorted[Math.floor(sorted.length * 0.2)])
  const top = sorted[Math.floor(sorted.length * 0.995)]
  const out: Snap[] = []
  let i = 6
  while (i < env.length) {
    let prev = 0
    for (let k = 1; k <= 5; k++) prev += env[i - k]
    prev /= 5
    if (env[i] > prev * 1.7 && env[i] > floor * 5 && env[i] > top * 0.02) {
      // its peak, then where it has died away
      let pk = i
      for (let k = i; k < Math.min(env.length, i + 10); k++) if (env[k] > env[pk]) pk = k
      let end = pk
      while (end < env.length && end - i < 85 && env[end] > env[pk] * 0.12) end++
      const a = Math.max(0, (i - 2) * win)
      const z = Math.min(d.length, end * win)
      const len = (z - a) / sr
      if (len >= 0.025) {
        let zc = 0
        for (let k = a + 1; k < z; k++) if (d[k] > 0 !== d[k - 1] > 0) zc++
        out.push({ buf: b, at: a / sr, len: Math.min(len, 0.17), gain: Math.min(4, (top * 0.5) / env[pk]), bright: zc / len })
      }
      i = pk + 6 // (the next may start while this one rings: crackles overlap)
    } else i++
  }
  // brightness as 0..1 within this recording's own range is no use across two: keep it absolute,
  // normalised later by the sort
  return out
}

/** a Poisson-distributed count with mean m (Knuth; m is small here) */
function poisson(m: number): number {
  const L = Math.exp(-m)
  let k = 0
  let p = Math.random()
  while (p > L) {
    k++
    p *= Math.random()
  }
  return k
}
