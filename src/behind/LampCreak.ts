// TEST (?creak=h, or ?creak=<id> of a recording in /behind/sound/creak/bed): after the hover's knock
// the lamp keeps wobbling side to side, and every swing squeaks — its arm's springs stretching.
// The recording (a bed spring, CC0, Freesound) is cut into its single squeaks; one plays per swing,
// starting as the lamp turns back, as long and as loud as that swing is strong — so they die away with
// the wobble you see. Never the same squeak twice in a row, each a touch off in pitch.
const Q = new URLSearchParams(location.search)
// the site's lamp: H (a bed spring, CC0, Freesound 767354); ?creak=<id> tries another, ?creak=off mutes it
const ID = !Q.has('creak') || Q.get('creak') === 'h' ? '767354' : Q.get('creak')
const FULL = Number(Q.get('creakv') ?? 1.0) // rad/s of swing that gives a full squeak
const GATE = Number(Q.get('creakgate') ?? 0.06) // weaker swings than this don't squeak (stiction)
const PITCH = Number(Q.get('creakpitch') ?? 1.5) // the recording sped up: a smaller spring than a bed's — higher, shorter
const OMEGA = Math.sqrt(30) // the lamp's swivel spring (Spring(30, …) in lampReactor): rad/s
const HALF = Math.PI / OMEGA // s, one swing
// 'flow' (default): no cutting — the recording runs on, its squeaks back to back, and only the swing's
// speed opens it: loudest mid-swing, silent as the lamp turns back (a squeak IS the joint sliding:
// it sounds as long as it moves, as hard as it moves). 'cut': the earlier one-squeak-per-swing.
const MODE = Q.get('creakmode') ?? 'flow'
// TEST (&creaksync): flow as it is, plus — every time the lamp turns (or sets off), while it's
// momentarily still and the sound shut, the reel jumps to the start of one squeak long enough for the
// swing ahead: each swing then begins on a squeak's start, instead of wherever the reel happened to be
// (which could put the end of one squeak and the start of the next in the same swing: the double nhec)
const SYNC = Q.get('creaksync') !== '0'
// TEST (&creakstretch): measured — H's squeaks last ~0.42 s; sped up ×1.5 that's ~0.28 s, while one
// swing of the lamp takes 0.57 s: two squeaks per swing, the double nhec. Here each squeak is
// stretched in time (WSOLA: same pitch, longer) so that, at the chosen pitch, one squeak lasts one swing
const STRETCH = Q.get('creakstretch') !== '0'
// TEST (&creakeye): the sound follows what the eye sees — the shade's speed ON SCREEN (both joints
// together, as drawn), not the swivel's spring: silent below what reads as still, full at a brisk swing;
// with &creaksync, a "turn" is the shade reversing on screen
const EYE = Q.get('creakeye') !== '0'
const EYE_GATE = Number(Q.get('eyegate') ?? 0.04) // screen-heights/s: slower than this looks still
const EYE_FULL = Number(Q.get('eyefull') ?? 0.35) // screen-heights/s: a full squeak

export class LampCreak {
  private ctx?: AudioContext
  private buf?: AudioBuffer
  private squeaks: [number, number][] = [] // [start, end] s of each squeak in the recording
  private last = -1
  private prevV = 0
  private since = 1
  // the squeak sounding now — one at a time: a new one fades this out instead of piling on it
  private flow?: { src: AudioBufferSourceNode; g: GainNode }
  private reel?: AudioBuffer
  private reelSqueaks: [number, number][] = [] // (sync) each squeak's [start, length] in the reel, s
  private lastSeek = 0
  private eyePrev?: [number, number]
  private meter?: AnalyserNode // (creakdebug) what actually comes out
  private cur?: { src: AudioBufferSourceNode; g: GainNode; t0: number; end: number }

  constructor() {
    if (!ID || !/^\d+$/.test(ID)) return
    // audio can only start after a gesture: the first click/tap on the page
    const unlock = () => {
      window.removeEventListener('pointerdown', unlock)
      void this.load()
    }
    window.addEventListener('pointerdown', unlock)
  }

  private async load(): Promise<void> {
    const ctx = (this.ctx = new AudioContext())
    const raw = await fetch(`${import.meta.env.BASE_URL}behind/sound/creak/bed/${ID}.mp3`).then((r) => r.arrayBuffer())
    this.buf = await ctx.decodeAudioData(raw)
    this.squeaks = findSqueaks(this.buf)
    if (STRETCH && this.squeaks.length) {
      const mean = this.squeaks.reduce((n, [a, z]) => n + (z - a), 0) / this.squeaks.length
      const k = (HALF * PITCH) / mean
      this.buf = wsola(ctx, this.buf, k)
      this.squeaks = findSqueaks(this.buf)
      if (Q.has('creakdebug')) console.log('[creak] stretched ×' + k.toFixed(2))
    }
    if (MODE === 'flow') {
      const src = ctx.createBufferSource()
      src.buffer = this.reel = squeakReel(ctx, this.buf, this.squeaks, this.reelSqueaks)
      src.loop = true
      src.playbackRate.value = PITCH
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(g).connect(ctx.destination)
      src.start()
      this.flow = { src, g }
      if (Q.has('creakdebug')) {
        this.meter = ctx.createAnalyser()
        this.meter.fftSize = 512
        g.connect(this.meter)
      }
    }
    if (Q.has('creakdebug')) console.log('[creak] squeaks', this.squeaks.map(([a, z]) => `${a.toFixed(2)}–${z.toFixed(2)}`).join(' '))
  }

  /** each frame: the swivel's angle (rad) and angular velocity (rad/s) */
  update(dt: number, x: number, v: number, seen?: { x: number; y: number; length(): number }): void {
    if (MODE === 'flow') {
      if (!this.flow || !this.ctx) return
      const t = this.ctx.currentTime
      if (EYE && seen) {
        const s = Math.min(1, Math.max(0, (seen.length() - EYE_GATE) / (EYE_FULL - EYE_GATE)))
        // a turn: the shade reverses on screen (its velocity now points against the last frame's)
        if (SYNC) this.seekOnTurn(t, (this.eyePrev && seen.x * this.eyePrev[0] + seen.y * this.eyePrev[1] < 0 ? -1 : 1) * (this.prevV || 1))
        this.eyePrev = [seen.x, seen.y]
        this.flow.g.gain.setTargetAtTime(0.9 * Math.pow(s, 1.5), t, 0.015)
        this.flow.src.playbackRate.setTargetAtTime(PITCH * (0.97 + 0.06 * s), t, 0.05)
        return
      }
      const s = Math.min(1, Math.max(0, (Math.abs(v) - GATE) / FULL))
      if (SYNC) this.seekOnTurn(t, v)
      const open = s * s * (3 - 2 * s) // eased: it catches, then slides
      this.flow.g.gain.setTargetAtTime(0.9 * open, t, 0.02)
      // a hair higher when it's driven harder — barely, so it never warbles
      this.flow.src.playbackRate.setTargetAtTime(PITCH * (0.97 + 0.06 * s), t, 0.05)
      return
    }
    this.since += dt
    // a swing starts: the lamp turns back (velocity changes sign), it's knocked from rest, or a knock
    // jolts it mid-swing (a jump in velocity the spring alone can't make)
    const turned = Math.sign(v) !== Math.sign(this.prevV) && this.prevV !== 0
    const jolt = Math.abs(v - this.prevV) > 0.25 + 30 * Math.abs(x) * dt * 1.5
    this.prevV = v
    if (!(turned || jolt) || this.since < 0.2) return
    // the hover pushes it again every ~0.12 s while the cursor crosses it: that's still the same
    // swing, so the squeak already sounding carries on — a knock only starts one if it's nearly over
    if (jolt && !turned && this.cur && this.ctx && this.ctx.currentTime < this.cur.t0 + (this.cur.end - this.cur.t0) * 0.7) return
    // how hard this swing will be: its peak speed (from where it turns, or straight from a knock)
    const peak = jolt ? Math.abs(v) : Math.abs(x) * OMEGA
    if (Q.has('creakdebug')) console.log('[creak]', jolt ? 'knock' : 'swing', peak.toFixed(3))
    if (peak < GATE) return
    this.since = 0
    this.squeak(Math.min(1, (peak - GATE) / FULL))
  }

  /** (creakdebug) the sound's level right now (RMS of the last ~10 ms) */
  level(): number {
    if (!this.meter) return 0
    const a = new Float32Array(this.meter.fftSize)
    this.meter.getFloatTimeDomainData(a)
    return Math.sqrt(a.reduce((n, x) => n + x * x, 0) / a.length)
  }

  /** (sync) at a turn — velocity changing sign, the sound shut — restart the reel on a squeak's start */
  private seekOnTurn(t: number, v: number): void {
    const turned = Math.sign(v) !== Math.sign(this.prevV)
    this.prevV = v
    if (!turned || t - this.lastSeek < 0.1 || !this.flow || !this.reel || !this.ctx || !this.reelSqueaks.length) return
    this.lastSeek = t
    const need = HALF * PITCH * 0.9 // s of reel one swing plays
    const long = this.reelSqueaks.map((_, i) => i).filter((i) => this.reelSqueaks[i][1] >= need && i !== this.last)
    const pool = long.length ? long : [this.reelSqueaks.reduce((m, q, i) => (q[1] > this.reelSqueaks[m][1] ? i : m), 0)]
    const i = pool[Math.floor(Math.random() * pool.length)]
    this.last = i
    const old = this.flow.src
    const src = this.ctx.createBufferSource()
    src.buffer = this.reel
    src.loop = true
    src.playbackRate.value = old.playbackRate.value
    // a 15 ms crossfade between the two, in case the sound isn't fully shut yet
    const fin = this.ctx.createGain()
    fin.gain.setValueAtTime(0, t)
    fin.gain.linearRampToValueAtTime(1, t + 0.015)
    src.connect(fin).connect(this.flow.g)
    src.start(t, this.reelSqueaks[i][0])
    const fout = this.ctx.createGain()
    old.disconnect()
    old.connect(fout).connect(this.flow.g)
    fout.gain.setValueAtTime(1, t)
    fout.gain.linearRampToValueAtTime(0, t + 0.015)
    old.stop(t + 0.02)
    this.flow.src = src
  }

  private squeak(s: number): void {
    const ctx = this.ctx
    if (!ctx || !this.buf || !this.squeaks.length) return
    let i = Math.floor(Math.random() * this.squeaks.length)
    if (this.squeaks.length > 1 && i === this.last) i = (i + 1) % this.squeaks.length
    this.last = i
    const [a, z] = this.squeaks[i]
    const rate = PITCH * (0.94 + 0.1 * s) * (1 + (Math.random() - 0.5) * 0.1)
    // a strong swing gets the whole squeak; a weak one only its start, never longer than the swing
    const dur = Math.min((z - a) / rate, HALF * (0.45 + 0.55 * s))
    const t = ctx.currentTime + 0.005
    if (this.cur && t < this.cur.end) {
      const { src, g } = this.cur
      g.gain.cancelScheduledValues(t)
      g.gain.setValueAtTime(g.gain.value, t)
      g.gain.linearRampToValueAtTime(0, t + 0.04)
      src.stop(t + 0.05)
    }
    const src = ctx.createBufferSource()
    src.buffer = this.buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    const vol = 0.15 + 0.85 * s * s
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.008)
    g.gain.setValueAtTime(vol, t + dur * 0.6)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(g).connect(ctx.destination)
    src.start(t, a, dur * rate + 0.01)
    this.cur = { src, g, t0: t, end: t + dur }
  }
}

/** the single squeaks in a recording: loud stretches (a 10 ms RMS envelope over 12% of its peak),
 *  joined across short gaps, kept between 60 ms and 1.2 s */
export function findSqueaks(b: AudioBuffer): [number, number][] {
  const d = b.getChannelData(0)
  const sr = b.sampleRate
  const win = Math.round(sr * 0.01)
  const rms: number[] = []
  for (let i = 0; i < d.length; i += win) {
    let e = 0
    for (let j = i; j < Math.min(d.length, i + win); j++) e += d[j] * d[j]
    rms.push(Math.sqrt(e / win))
  }
  const sorted = [...rms].sort((p, q) => p - q)
  const peak = sorted[Math.floor(sorted.length * 0.995)]
  const floor = sorted[Math.floor(sorted.length * 0.2)]
  const th = floor + (peak - floor) * 0.12
  const out: [number, number][] = []
  let start = -1
  let gap = 0
  rms.forEach((r, i) => {
    if (r > th) {
      if (start < 0) start = i
      gap = 0
    } else if (start >= 0 && ++gap > 6) {
      out.push([start, i - gap + 1])
      start = -1
      gap = 0
    }
  })
  if (start >= 0) out.push([start, rms.length])
  return out
    .map(([s, e]): [number, number] => [Math.max(0, s - 2) * 0.01, Math.min(rms.length, e + 3) * 0.01])
    .filter(([s, e]) => e - s >= 0.06)
    .map(([s, e]): [number, number] => [s, Math.min(e, s + 1.2)])
}

/** (flow) the recording's squeaks laid end to end, gaps dropped, each seam a 25 ms crossfade so the
 *  reel runs without a click or a hole */
function squeakReel(ctx: AudioContext, b: AudioBuffer, squeaks: [number, number][], at: [number, number][] = []): AudioBuffer {
  const sr = b.sampleRate
  const xf = Math.round(sr * 0.025)
  const segs = squeaks.map(([a, z]): [number, number] => [Math.round(a * sr), Math.min(b.length, Math.round(z * sr))]).filter(([a, z]) => z - a > xf * 2)
  if (!segs.length) return b
  const len = segs.reduce((n, [a, z]) => n + (z - a) - xf, 0) + xf
  const out = ctx.createBuffer(b.numberOfChannels, len, sr)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c)
    const dst = out.getChannelData(c)
    let o = 0
    for (const [a, z] of segs) {
      const n = z - a
      for (let i = 0; i < n; i++) {
        // equal-power ramps in and out, overlapping the neighbour's
        const fin = i < xf ? Math.sin((i / xf) * Math.PI * 0.5) : 1
        const fout = i > n - xf ? Math.sin(((n - i) / xf) * Math.PI * 0.5) : 1
        if (o + i < len) dst[o + i] += src[a + i] * fin * fout
      }
      if (c === 0) at.push([o / sr, n / sr])
      o += n - xf
    }
  }
  return out
}

/** (stretch) WSOLA time-stretch: the sound made k times longer at the same pitch — overlapping
 *  Hann-windowed frames, each taken from where it best continues the last (cross-correlation over a
 *  small search window), so the squeak's waveform runs on without phasing */
export function wsola(ctx: AudioContext, b: AudioBuffer, k: number): AudioBuffer {
  const sr = b.sampleRate
  const N = 1024
  const Hs = N / 2 // output hop
  const Ha = Hs / k // input hop
  const D = 256 // search ± samples
  const x0 = b.getChannelData(0)
  const outLen = Math.floor(b.length * k)
  const out = ctx.createBuffer(b.numberOfChannels, outLen, sr)
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N))
  const frames: number[] = [] // where each output frame was read from
  let prev = 0
  for (let f = 0; f * Hs + N < outLen; f++) {
    const nominal = Math.round(f * Ha)
    let best = nominal
    if (f > 0) {
      // what would naturally follow the previous frame
      const nat = prev + Hs
      let bestC = -Infinity
      for (let d = -D; d <= D; d += 2) {
        const p = nominal + d
        if (p < 0 || p + N >= b.length || nat + N >= b.length) continue
        let c = 0
        for (let i = 0; i < N; i += 4) c += x0[p + i] * x0[nat + i]
        if (c > bestC) {
          bestC = c
          best = p
        }
      }
    }
    best = Math.max(0, Math.min(b.length - N - 1, best))
    frames.push(best)
    prev = best
  }
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c)
    const dst = out.getChannelData(c)
    frames.forEach((from, f) => {
      const o = f * Hs
      for (let i = 0; i < N; i++) dst[o + i] += src[from + i] * win[i]
    })
  }
  return out
}
