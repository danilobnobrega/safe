import { sfx } from './sfx'

// The dive into the bin (the site's: cinema + sino together, Danilo's pick; ?dive=concha|cinema|sino|vento
// or several, comma-separated, to try; ?dive=off mutes it),
// after a score. Each tied to the dive itself — the camera's real speed, its nearness to the bin's
// mouth, the moment it crosses the rim (worked out from its path when the dive starts), and the fade
// to black, which every one of them goes down with:
//   concha  (?dive=on too) the seashell: a bin is a metal tube closed at the bottom, ringing at its own
//           notes (a quarter wave in its depth, c / 4h ≈ 268 Hz for 32 cm, and the odd ones over it); the
//           room's air through those resonances, more as the camera nears the mouth — and a real
//           swoosh slowed into a fall, riding the camera's speed;
//   cinema  a designed deep whoosh (CC0, Freesound "Deep Whoosh #5") placed so its peak lands the
//           instant the camera crosses the rim;
//   sino    the bin's own metal (its recording) played backwards, swelling up to the rim — sucked in —
//           and there, struck softly forwards, ringing down into the dark;
//   vento   a real wind tunnel (CC0, loop), opening and rising with the camera's speed, closing as it
//           brakes into black.
const Q = new URLSearchParams(location.search)
// (several at once, comma-separated: ?dive=cinema,sino)
const MODES = new Set((Q.get('dive') ?? 'cinema,sino').split(',').map((m) => (m === 'on' ? 'concha' : m)).filter((m) => ['concha', 'cinema', 'sino', 'vento'].includes(m)))
export const DIVE_ON = MODES.size > 0
const C = 343 // m/s, sound in air
const BASE = `${import.meta.env.BASE_URL}behind/sound/`

type Live = {
  out: GainNode
  shell?: GainNode
  dry?: GainNode
  peaks?: BiquadFilterNode[]
  fall?: GainNode
  wind?: { g: GainNode; lp: BiquadFilterNode }
}

export class DiveSound {
  private bufs: Record<string, AudioBuffer> = {}
  private noise?: AudioBuffer
  private live?: Live

  constructor(private binDepth: number) {
    if (!DIVE_ON) return
    const { ctx } = sfx()
    const want: Record<string, string> = { concha: 'toss/585257', cinema: 'dive/558827', sino: 'hit/794547', vento: 'dive/560554' }
    for (const m of MODES) {
      void fetch(`${BASE}${want[m]}.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => (this.bufs[m] = b))
    }
    if (MODES.has('concha')) {
      // a few seconds of soft pink noise: the room's air
      const n = ctx.sampleRate * 3
      const b = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = b.getChannelData(0)
      let b0 = 0
      let b1 = 0
      let b2 = 0
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1
        b0 = 0.99765 * b0 + w * 0.099046
        b1 = 0.963 * b1 + w * 0.2965164
        b2 = 0.57 * b2 + w * 1.0526913
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2
      }
      this.noise = b
    }
  }

  /** the dive begins: `len` s long, the camera crossing the rim at `rim` s */
  start(len: number, rim: number): void {
    const { ctx, out } = sfx()
    if (!DIVE_ON || ctx.state !== 'running') return
    const t = ctx.currentTime + 0.01
    const master = ctx.createGain()
    master.connect(out)
    const live: Live = { out: master }
    if (MODES.has('concha') && this.noise) {
      const buf = this.bufs.concha
      const air = ctx.createBufferSource()
      air.buffer = this.noise
      air.loop = true
      live.dry = ctx.createGain()
      live.dry.gain.value = 0.05
      live.shell = ctx.createGain()
      live.shell.gain.value = 0
      const f0 = C / (4 * this.binDepth)
      live.peaks = [1, 3, 5, 7].map((h, i) => {
        const f = ctx.createBiquadFilter()
        f.type = 'bandpass'
        f.frequency.value = f0 * h
        f.Q.value = 6
        const g = ctx.createGain()
        g.gain.value = [1, 0.6, 0.35, 0.2][i]
        air.connect(f).connect(g).connect(live.shell!)
        return f
      })
      air.connect(live.dry).connect(master)
      live.shell.connect(master)
      air.start(t)
      air.stop(t + len + 0.6)
      live.fall = ctx.createGain()
      live.fall.gain.value = 0
      live.fall.connect(master)
      if (buf) {
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = Math.max(0.25, buf.duration / (len * 0.75))
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(9000, t)
        lp.frequency.exponentialRampToValueAtTime(900, t + len)
        src.connect(lp).connect(live.fall)
        src.start(t + 0.02)
      }
    }
    if (MODES.has('cinema') && this.bufs.cinema) {
      const buf = this.bufs.cinema
      // its peak (measured: 0.8 s in) on the rim
      const peakAt = 0.8
      const src = ctx.createBufferSource()
      src.buffer = buf
      const g = ctx.createGain()
      g.gain.value = 0.9
      src.connect(g).connect(master)
      const off = peakAt - rim
      src.start(t + Math.max(0, -off), Math.max(0, off))
    }
    if (MODES.has('sino') && this.bufs.sino) {
      const buf = this.bufs.sino
      // the bin's ring: its loudest stretch, reversed to swell into the rim, then struck forwards there
      const ring = loudest(buf, 1.4)
      const rev = reversed(ctx, buf, ring.at, ring.len)
      const back = ctx.createBufferSource()
      back.buffer = rev
      const bg = ctx.createGain()
      bg.gain.value = 0.55
      const blp = ctx.createBiquadFilter()
      blp.type = 'lowpass'
      blp.frequency.value = 3500
      back.connect(blp).connect(bg).connect(master)
      const startAt = t + rim - ring.len
      back.start(Math.max(t, startAt), Math.max(0, t - startAt))
      const hit = ctx.createBufferSource()
      hit.buffer = buf
      hit.playbackRate.value = 0.82 // a deeper, softer strike: it's the inside of the thing
      const hlp = ctx.createBiquadFilter()
      hlp.type = 'lowpass'
      hlp.frequency.value = 2200
      const hg = ctx.createGain()
      hg.gain.value = 0.7
      hit.connect(hlp).connect(hg).connect(master)
      hit.start(t + rim, ring.at, ring.len * 1.6)
    }
    if (MODES.has('vento') && this.bufs.vento) {
      const buf = this.bufs.vento
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 400
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(lp).connect(g).connect(master)
      src.start(t, Math.random() * 6)
      src.stop(t + len + 0.8)
      live.wind = { g, lp }
    }
    this.live = live
  }

  /**
   * each frame of the dive: the camera's speed (m/s), its distance to the bin's mouth (m), and how far
   * into black the picture is (0..1)
   */
  update(speed: number, toMouth: number, black: number): void {
    const n = this.live
    if (!n) return
    const { ctx } = sfx()
    const t = ctx.currentTime
    const live = 1 - black
    const sp = Math.min(1, speed / 1.2)
    // everything goes down with the picture (the master); the live ones also ride their own gains
    n.out.gain.setTargetAtTime(Math.max(0, live), t, 0.04)
    if (n.shell && n.dry && n.peaks && n.fall) {
      const near = Math.max(0, Math.min(1, 1 - (toMouth - 0.05) / 0.6)) // 0 far .. 1 at the rim
      n.shell.gain.setTargetAtTime(0.9 * near * near * live, t, 0.05)
      n.dry.gain.setTargetAtTime(0.05 * (1 - near) * live, t, 0.05)
      for (const f of n.peaks) f.Q.setTargetAtTime(6 + 18 * near, t, 0.1) // the hollow sharpens going in
      n.fall.gain.setTargetAtTime(sp * 0.9 * live, t, 0.03)
    }
    if (n.wind) {
      n.wind.g.gain.setTargetAtTime(0.75 * sp * live, t, 0.06)
      n.wind.lp.frequency.setTargetAtTime(300 + 5200 * sp * live, t, 0.08)
    }
    if (black >= 1) {
      n.out.gain.setTargetAtTime(0, t, 0.05)
      this.live = undefined
    }
  }
}

/** a recording's loudest stretch: where its peak is (less a hair) and `len` s on */
function loudest(b: AudioBuffer, len: number): { at: number; len: number } {
  const d = b.getChannelData(0)
  let pk = 0
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > Math.abs(d[pk])) pk = i
  const at = Math.max(0, pk / b.sampleRate - 0.005)
  return { at, len: Math.min(len, b.duration - at) }
}

/** a stretch of a recording, backwards */
function reversed(ctx: AudioContext, b: AudioBuffer, at: number, len: number): AudioBuffer {
  const a = Math.floor(at * b.sampleRate)
  const n = Math.floor(len * b.sampleRate)
  const out = ctx.createBuffer(b.numberOfChannels, n, b.sampleRate)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const s = b.getChannelData(c)
    const d = out.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] = s[a + n - 1 - i] ?? 0
  }
  return out
}
