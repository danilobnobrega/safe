import { sfx } from '../behind/sfx'
import { cutSnaps, type Snap } from '../behind/PaperCrumple'
import { wsola } from '../behind/LampCreak'
import { PaperToss } from '../behind/PaperToss'
import type { CrumbKind } from './CrumbRain'

// The cookies and crackers (the site's: g, the pops — Danilo's pick; ?crumbhit=a..f to try the others,
// ?crumbhit=off mutes them), heard at
// every touch the physics makes — falling in, landing, knocking into each other, tumbling under the
// cursor. Each touch is a single short tick cut from real recordings (CC0, Freesound) of the thing
// itself, as hard as that touch really was (the two bodies' closing speed); dozens at once run
// together into a patter, as a heap of biscuits does. Two crumbs meeting tick higher and smaller than
// a crumb landing on the floor. Placed left/right where it happened.
//   cookies: "Touching cookies", a small object falling on a table, drumming on a cookie box
//   crackers: a cracker up close, goldfish crackers, single cereal grains landing
// The takes:
//   a  as above (kept: Danilo liked it)
//   b  "delicado": only the shortest, driest half of a's ticks, a touch higher — light and crisp
//   c  "encorpado": only the fuller knocks, lower and duller — thick, heavy biscuits
//   d  "na mesa": a, and under each landing on the floor a soft knock of wood, as onto a table
// and three with more personality — still one sound per touch, as hard as the touch:
//   e  "marimba": every touch plays a real marimba note (one sampled F#5, transposed) on a major
//      pentatonic — any notes of it sound right together, so a heap falling is a tune that can't go
//      wrong; the note follows WHERE it landed (left low .. right high, a keyboard lying on the floor),
//      cookies an octave under crackers
//   f  "voz do site": the printer's caricature voice (its noise clicks and a little buzzing chirp) in
//      tiny blips — the site speaking with one voice
//   g  "pops": a real mouth pop per touch, cookies lower, crackers higher, like a cartoon
const Q = new URLSearchParams(location.search)
const TAKE = ((t) => (t === 'on' ? 'a' : t))(Q.get('crumbhit') ?? 'g')
export const CRUMB_HITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].includes(TAKE)
const FILES: Record<CrumbKind, string[]> = { cookie: ['564907', '542343', '556975'], cracker: ['415640', '486379', '692102'] }
const MIN = 8 // closing speed of a touch too soft to hear (CrumbRain's LAND_MIN)
const FULL = 70 // above MIN: a full knock
const VOICES = 26 // most ticks sounding at once (a pile settling can make hundreds)
// (and d1..d3: the dentist's — the saliva ejector in mouthwash, softly and loud, and the air syringe)
const STRAWS: Record<string, string> = { s1: '544112', s2: '817040', s3: '529295', s4: '689640', s5: '392336', s6: '418858', d1: '707322', d2: '707321', d3: '707338' }
const SUCK = ((v) => (['a', 'a2', 'a3', 'ag', 'along', 'arev', 'a2long', 'a2tail', 'b', 'c', 'd', 'e', 'f', 'ar', ...Object.keys(STRAWS)].includes(v) ? v : ''))(Q.get('suck') ?? 'a2tail')
// (s1..s6: through a straw — the most intense steady stretch of a real straw recording, as long as the
// exodus, its loudness riding the crumbs' real pull, gone with the last one)
const STRAW = SUCK in STRAWS
// (ar: the paper ball's parked air hiss — PaperToss — riding the crumbs' real pull)
const SUCKS: Record<string, string | null> = { ...STRAWS, ar: null, a2long: '369776', a2tail: '369776', along: '369776', arev: '369776', a: '369776', a2: '369776', a3: '369776', ag: '369776', b: '817040', c: '140700', d: '741580', e: '855977', f: null }
// (a…: "Open Tube" is four short tube thumps, not one long suck: only its strongest one is used — a2 and
// a3 stretched to twice and three times as long at the same pitch, ag played slower: longer and deeper)
const ONE_THUMP = SUCK.startsWith('a')
// (TEST ?suckpops=off: the suction alone, no pop as each crumb goes out)
const NO_EXIT_POPS = (Q.get('suckpops') ?? 'off') === 'off'
const STRETCH = SUCK === 'a2' || SUCK === 'a2tail' ? 2 : SUCK === 'a3' ? 3 : 1
// (a2long: a2's thump stretched, same pitch, to the pile's real time to go — worked out from each
// crumb when the suction starts; a2tail: a2 exactly, then the tube's ring held until the last one is
// really out, and let die there)
// (along / arev: as long as the whole exodus — stretched on the start, to the pile's size; arev played
// backwards, so it swells as they go and lands its thump as the last one leaves)
const FIT = SUCK === 'along' || SUCK === 'arev'
const SUCK_RATE = SUCK === 'ag' ? 0.62 : 1.15
const POPS = ['573152', '573153', '691907', '792928', '259704', '323741', '323742', '323743'] // (g) mouth pops

export class CrumbHits {
  private snaps: Partial<Record<CrumbKind, Snap[]>> = {}
  private sounding = 0

  constructor() {
    if (!CRUMB_HITS && !SUCK) return
    const { ctx } = sfx()
    for (const kind of Object.keys(FILES) as CrumbKind[]) {
      void Promise.all(FILES[kind].map((id) => fetch(`${import.meta.env.BASE_URL}hero/sound/crumb/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)))).then((bufs) => {
        let all = bufs.flatMap((b) => cutSnaps(b)).filter((s) => s.len <= 0.12)
        // (b: only the short ticks; c: only the fuller knocks)
        all.sort((p, q) => p.len - q.len)
        if (TAKE === 'b') all = all.slice(0, Math.ceil(all.length * 0.5))
        if (TAKE === 'c') all = all.slice(Math.floor(all.length * 0.45))
        all.sort((p, q) => p.len - q.len) // short (a tick) .. longer (a knock)
        this.snaps[kind] = all
        if (Q.has('crumbdebug')) console.log('[crumbs]', kind, all.length, 'ticks')
      })
    }
    if (TAKE === 'e') {
      void fetch(`${import.meta.env.BASE_URL}hero/sound/crumb/373586.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => {
          // (a quiet recording: evened out to a full note, and started where it actually sounds)
          this.note = b
          const d = b.getChannelData(0)
          let pk = 0
          let at = -1
          for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]))
          for (let i = 0; i < d.length && at < 0; i++) if (Math.abs(d[i]) > pk * 0.1) at = i
          this.noteGain = 0.7 / Math.max(1e-4, pk)
          this.noteAt = Math.max(0, at / b.sampleRate - 0.002)
        })
    }
    if (SUCK) {
      const id = SUCKS[SUCK]
      if (id) {
        void fetch(`${import.meta.env.BASE_URL}hero/sound/suck/${id}.mp3`)
          .then((r) => r.arrayBuffer())
          .then((a) => ctx.decodeAudioData(a))
          .then((b) => {
            const one = ONE_THUMP ? loudestEvent(ctx, b) : b
            this.suckOne = one
            this.suckBuf = STRETCH > 1 ? wsola(ctx, one, STRETCH) : one
            const d = this.suckBuf.getChannelData(0)
            let pk = 0
            for (let k = 1; k < d.length; k++) if (Math.abs(d[k]) > Math.abs(d[pk])) pk = k
            this.suckPeak = pk / this.suckBuf.sampleRate
          })
      }
    }
    if (TAKE === 'g' || SUCK) {
      void Promise.all(POPS.map((id) => fetch(`${import.meta.env.BASE_URL}hero/sound/crumb/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)))).then((bufs) => {
        this.pops = bufs.map((b) => ({ buf: b, ...soundingOf(b) }))
      })
    }
    if (TAKE === 'f') {
      const n = ctx.sampleRate
      const b = ctx.createBuffer(1, n, n)
      const d = b.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      this.noise = b
    }
    if (TAKE === 'd') {
      // (d) the table under them: soft wood hits (the desk's own floor/wood recording)
      void fetch(`${import.meta.env.BASE_URL}behind/sound/hit/732813.mp3`)
        .then((r) => r.arrayBuffer())
        .then((a) => ctx.decodeAudioData(a))
        .then((b) => (this.wood = cutSnaps(b)))
    }
  }
  private wood: Snap[] = []
  private note?: AudioBuffer // (e) the marimba
  private noteGain = 1
  private noteAt = 0
  private pops: { buf: AudioBuffer; at: number; len: number }[] = [] // (g)
  private noise?: AudioBuffer // (f)

  get on(): boolean {
    return CRUMB_HITS
  }

  /**
   * a touch: `speed` the closing speed, `x` across the screen (-1..1), `pair` true if two crumbs met
   * (else one hit the floor or a wall); `mix` ≤ 1 when many sound in the same frame
   */
  hit(kind: CrumbKind, speed: number, x: number, pair: boolean, mix = 1): void {
    const { ctx, out } = sfx()
    if (ctx.state !== 'running' || this.sounding >= VOICES) return
    const s = Math.min(1.2, (speed - MIN) / FULL)
    if (s <= 0) return
    if (TAKE === 'e' || TAKE === 'f' || TAKE === 'g') return this.character(kind, s, x, pair, mix)
    const pool = this.snaps[kind]
    if (!pool?.length) return
    // a soft touch: one of the short ticks; a hard one: from the whole range, up to the fuller knocks
    const reach = 0.35 + 0.65 * Math.min(1, s)
    const k = pool[Math.floor(Math.random() * pool.length * reach)]
    const t = ctx.currentTime + 0.002 + Math.random() * 0.006
    const src = ctx.createBufferSource()
    src.buffer = k.buf
    const low = TAKE === 'c' ? 0.84 : TAKE === 'b' ? 1.08 : 1
    src.playbackRate.value = low * (pair ? 1.12 : 1) * (1 + (Math.random() - 0.5) * 0.12)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = (TAKE === 'c' ? 900 : 1800) + (TAKE === 'c' ? 5000 : 12000) * Math.min(1, s)
    const g = ctx.createGain()
    const level = 0.5 * k.gain * Math.pow(Math.min(1, s), 1.4) * mix * (pair ? 0.75 : 1)
    const len = k.len / src.playbackRate.value
    g.gain.setValueAtTime(level, t)
    g.gain.setValueAtTime(level, t + len * 0.6)
    g.gain.linearRampToValueAtTime(0, t + len)
    const p = ctx.createStereoPanner()
    p.pan.value = Number.isFinite(x) ? Math.max(-0.8, Math.min(0.8, x * 0.8)) : 0
    src.connect(lp).connect(g).connect(p).connect(out)
    src.start(t, k.at, k.len + 0.01)
    this.sounding++
    if (Q.has('crumbdebug')) {
      const w = window as unknown as { __crumbTicks?: number[] }
      ;(w.__crumbTicks ??= []).push(performance.now())
    }
    src.onended = () => this.sounding--
    // (d) landing on the table: the wood under it, softly
    if (TAKE === 'd' && !pair && this.wood.length && s > 0.15) {
      const w = this.wood[Math.floor(Math.random() * this.wood.length)]
      const ws = ctx.createBufferSource()
      ws.buffer = w.buf
      ws.playbackRate.value = 1.25 + Math.random() * 0.2 // a small thing on it: a higher, lighter knock
      const wl = ctx.createBiquadFilter()
      wl.type = 'lowpass'
      wl.frequency.value = 2500 + 3000 * Math.min(1, s)
      const wg = ctx.createGain()
      const wv = 0.22 * w.gain * Math.pow(Math.min(1, s), 1.6) * mix
      const wlen = Math.min(0.15, w.len) / ws.playbackRate.value
      wg.gain.setValueAtTime(wv, t)
      wg.gain.linearRampToValueAtTime(0, t + wlen)
      ws.connect(wl).connect(wg).connect(p)
      ws.start(t, w.at, wlen * ws.playbackRate.value + 0.01)
    }
  }


  // ---- the suction (the site's: a2tail, no exit pops — Danilo's pick; ?suck=… and ?suckpops=on to
  // try the others, ?suck=off mutes it) — the pile pulled off the sides as the scroll starts
  //   a "tubo" (air into an open tube), b "canudo" (a straw at the bottom of an empty cup), c "tubo de
  //   papel" (air sucked through a paper packaging tube), d "slurp pop", e "sucção com pop" (a suction
  //   swelling to a pop), f only the pops. All CC0, Freesound. The suck's own peak is placed where most
  //   of the pile is going (0.35 s in — measured: 22 crumbs leave between 0.12 and 0.84 s) and it dies
  //   with the last one out; and every crumb crossing the edge pops, each a step higher than the last.
  private suckBuf?: AudioBuffer
  private suckPeak = 0
  private suckOne?: AudioBuffer
  private strawGain = 1
  private suckLive?: { g: GainNode; src?: AudioBufferSourceNode }
  private outs = 0

  /** the suction begins, on a pile of `count` crumbs */
  suckStart(count = 22, exodus = 0): void {
    const { ctx, out } = sfx()
    this.outs = 0
    if (ctx.state !== 'running' || !this.suckBuf) return
    if ((SUCK === 'a2long' || SUCK === 'a2tail') && this.suckOne) {
      const t = ctx.currentTime + 0.005
      const g = ctx.createGain()
      g.gain.value = 0.7
      g.connect(out)
      if (SUCK === 'a2long') {
        const len = Math.max(0.26, exodus || 0.45 + 0.016 * count)
        const src = ctx.createBufferSource()
        src.buffer = wsola(ctx, this.suckOne, len / this.suckOne.duration)
        src.connect(g)
        src.start(t)
        this.suckLive = { g, src }
        return
      }
      // a2tail: the thump as it is, and from halfway through it its ring held in a seamless loop
      const one = this.suckBuf
      const src = ctx.createBufferSource()
      src.buffer = one
      src.connect(g)
      src.start(t)
      const from = one.duration * 0.45
      const ring = level(seamless(ctx, one, from, one.duration * 0.45)) // (its decay evened out: a held ring, not a pulse)
      const hold = ctx.createBufferSource()
      hold.buffer = ring
      hold.loop = true
      const hg = ctx.createGain()
      hg.gain.setValueAtTime(0, t + from)
      hg.gain.linearRampToValueAtTime(1, t + from + 0.03)
      hold.connect(hg).connect(g)
      hold.start(t + from)
      this.suckLive = { g, src: hold }
      return
    }
    if (STRAW) {
      // not a guess at how long they'll take: its steadiest stretch looped, seamlessly, until the
      // last one is really out (suckEnd)
      const { at, gain } = busiest(this.suckBuf, 0.6)
      const loop = seamless(ctx, this.suckBuf, at, 0.6)
      const t = ctx.currentTime + 0.005
      const src = ctx.createBufferSource()
      src.buffer = loop
      src.loop = true
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.25 * gain, t + 0.04)
      src.connect(g).connect(out)
      src.start(t)
      this.suckLive = { g, src }
      this.strawGain = gain
      void count
      return
    }
    if (FIT && this.suckOne) {
      // as long as they take to go (measured: 22 crumbs, the last out ~0.8 s after the scroll)
      const len = 0.45 + 0.016 * count
      let b = wsola(ctx, this.suckOne, len / this.suckOne.duration)
      if (SUCK === 'arev') b = backwards(ctx, b)
      const t = ctx.currentTime + 0.005
      const src = ctx.createBufferSource()
      src.buffer = b
      const g = ctx.createGain()
      g.gain.value = 0.75
      src.connect(g).connect(out)
      src.start(t)
      this.suckLive = { g }
      return
    }
    const t = ctx.currentTime + 0.005
    const rate = SUCK_RATE
    const src = ctx.createBufferSource()
    src.buffer = this.suckBuf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = 0.7
    src.connect(g).connect(out)
    // its peak 0.35 s from now: start that far into it — or, a short one, start it a little later
    const peakIn = this.suckPeak / rate
    src.start(t + Math.max(0, 0.35 - peakIn), Math.max(0, this.suckPeak - 0.35 * rate))
    this.suckLive = { g }
  }

  private air = SUCK === 'ar' ? new PaperToss(true) : null
  private airKey = {}

  /** (ar) each frame of the suction: the crumbs' mean speed being pulled (world units/s) and which
   *  way the pull leans on screen (-1..1); `on` false once the last is out */
  suckAir(dt: number, speed: number, lean: number, on: boolean): void {
    // (straw) its loudness rides the pull: a soft draw as they start to move, full as they fly out
    if (STRAW && this.suckLive && on) {
      const { ctx } = sfx()
      this.suckLive.g.gain.setTargetAtTime(this.strawGain * (0.25 + 0.75 * Math.min(1, speed / 40)), ctx.currentTime, 0.04)
    }
    // (the hiss is tuned in m/s for a flying ball: ~12 units/s here reads as a brisk 1 m/s there)
    this.air?.update(this.airKey, dt, Math.min(70, speed) / 12, 9, 1, lean, on) // (a lone crumb's flick won't spike it)
    if (Q.has('crumbdebug') && this.air) console.log('[crumbs] pull', speed.toFixed(1))
    // (the last one out: let the hiss die and its voice go — the suction stops calling here)
    if (!on && this.air) for (let k = 1; k <= 12; k++) window.setTimeout(() => this.air?.update(this.airKey, 0.05, 0, 0, 1, lean, false), k * 50)
  }

  /** a crumb has been pulled out over the edge, on side `side` (-1 left, 1 right) */
  suckOut(side: number): void {
    const { ctx, out } = sfx()
    if (ctx.state !== 'running' || !this.pops.length || NO_EXIT_POPS) return
    const n = this.outs++
    const pop = this.pops[n % this.pops.length]
    const t = ctx.currentTime + 0.003
    const src = ctx.createBufferSource()
    src.buffer = pop.buf
    // a step up for each one out (0.75 of a semitone, up to an octave and a bit)
    src.playbackRate.value = 0.95 * Math.pow(2, Math.min(15, n * 0.75) / 12)
    const g = ctx.createGain()
    g.gain.value = 0.42
    const pan = ctx.createStereoPanner()
    pan.pan.value = side < 0 ? -0.85 : 0.85
    src.connect(g).connect(pan).connect(out)
    src.start(t, pop.at, pop.len + 0.01)
  }

  /** the last crumb is out */
  suckEnd(): void {
    const { ctx } = sfx()
    if (Q.has('crumbdebug')) console.log('[crumbs] suction sound ends')
    if (!this.suckLive) return
    // (arev ends on its own thump: never cut it short)
    if (SUCK === 'arev') {
      this.suckLive = undefined
      return
    }
    const t = ctx.currentTime
    this.suckLive.g.gain.cancelScheduledValues(t)
    this.suckLive.g.gain.setTargetAtTime(0, t, 0.05)
    this.suckLive.src?.stop(t + 0.4)
    this.suckLive = undefined
  }

  /** (e, f, g) the takes with personality: one sound per touch, as hard as the touch */
  private character(kind: CrumbKind, s: number, x: number, pair: boolean, mix: number): void {
    const { ctx, out } = sfx()
    const t = ctx.currentTime + 0.002 + Math.random() * 0.005
    const v = Math.pow(Math.min(1, s), 1.3) * mix * (pair ? 0.7 : 1)
    const p = ctx.createStereoPanner()
    const px = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0
    p.pan.value = px * 0.8
    p.connect(out)
    let end = t + 0.1
    if (TAKE === 'e' && this.note) {
      // the keyboard on the floor: two octaves of F# major pentatonic across the screen
      const steps = [0, 2, 4, 7, 9]
      const k = Math.max(0, Math.min(9, Math.round(((px + 1) / 2) * 9 + (Math.random() - 0.5) * 1.2)))
      const semis = steps[k % 5] + 12 * Math.floor(k / 5) - 12 + (kind === 'cookie' ? -12 : 0) + (pair ? 12 : 0)
      const src = ctx.createBufferSource()
      src.buffer = this.note
      src.playbackRate.value = Math.pow(2, semis / 12)
      const g = ctx.createGain()
      const len = Math.min(0.9, this.note.duration / src.playbackRate.value)
      g.gain.setValueAtTime(0.5 * this.noteGain * v, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + len)
      src.connect(g).connect(p)
      src.start(t, this.noteAt, len * src.playbackRate.value)
      end = t + len
    }
    if (TAKE === 'g' && this.pops.length) {
      const pop = this.pops[Math.floor(Math.random() * this.pops.length)]
      const src = ctx.createBufferSource()
      src.buffer = pop.buf
      src.playbackRate.value = (kind === 'cookie' ? 0.88 : 1.18) * (pair ? 1.15 : 1) * (1 + (Math.random() - 0.5) * 0.14)
      const g = ctx.createGain()
      g.gain.value = 0.55 * v
      src.connect(g).connect(p)
      src.start(t, pop.at, pop.len + 0.01)
      end = t + pop.len / src.playbackRate.value
    }
    if (TAKE === 'f' && this.noise) {
      // the printer's voice, tiny: a click of filtered noise and a buzzing chirp falling under it
      const hz = (kind === 'cookie' ? 900 : 1600) * (pair ? 1.25 : 1) * (1 + (Math.random() - 0.5) * 0.2)
      const n = ctx.createBufferSource()
      n.buffer = this.noise
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = hz
      bp.Q.value = 2
      const ng = ctx.createGain()
      ng.gain.setValueAtTime(0.9 * v, t)
      ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
      n.connect(bp).connect(ng).connect(p)
      n.start(t, Math.random() * 0.8)
      n.stop(t + 0.06)
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(hz * 0.3, t)
      o.frequency.exponentialRampToValueAtTime(hz * 0.18, t + 0.05)
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1400
      const og = ctx.createGain()
      og.gain.setValueAtTime(0.18 * v, t)
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.055)
      o.connect(lp).connect(og).connect(p)
      o.start(t)
      o.stop(t + 0.06)
      end = t + 0.06
    }
    this.sounding++
    window.setTimeout(() => this.sounding--, Math.max(20, (end - ctx.currentTime) * 1000))
    if (Q.has('crumbdebug')) {
      const w = window as unknown as { __crumbTicks?: number[] }
      ;(w.__crumbTicks ??= []).push(performance.now())
    }
  }
}

/** where a short recording actually sounds (from the first to the last 2 ms block over a tenth of its peak) */
function soundingOf(b: AudioBuffer): { at: number; len: number } {
  const d = b.getChannelData(0)
  const win = Math.round(b.sampleRate * 0.002)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const peak = Math.max(...env)
  const a = env.findIndex((r) => r > peak * 0.1)
  let z = env.length - 1
  while (z > a && env[z] < peak * 0.05) z--
  return { at: Math.max(0, (a - 1) * 0.002), len: Math.max(0.03, (z - a + 3) * 0.002) }
}

/** a recording's single loudest event, on its own: around its peak, from where it rises out of the
 *  quiet to where it has died back into it (50 ms padding of fade) */
function loudestEvent(ctx: AudioContext, b: AudioBuffer): AudioBuffer {
  const d = b.getChannelData(0)
  const win = Math.round(b.sampleRate * 0.005)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  let pk = 0
  for (let i = 0; i < env.length; i++) if (env[i] > env[pk]) pk = i
  let a = pk
  while (a > 0 && env[a] > env[pk] * 0.02) a--
  let z = pk
  while (z < env.length - 1 && env[z] > env[pk] * 0.02) z++
  const from = Math.max(0, a * win - win * 4)
  const to = Math.min(d.length, z * win + win * 6)
  const out = ctx.createBuffer(b.numberOfChannels, to - from, b.sampleRate)
  const fade = win * 4
  for (let c = 0; c < b.numberOfChannels; c++) {
    const src = b.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0; i < to - from; i++) dst[i] = src[from + i] * Math.min(1, i / fade, (to - from - 1 - i) / fade)
  }
  return out
}

/** a buffer, backwards */
function backwards(ctx: AudioContext, b: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const s = b.getChannelData(c)
    const d = out.getChannelData(c)
    for (let i = 0; i < b.length; i++) d[i] = s[b.length - 1 - i]
  }
  return out
}

/** where in a recording its most intense steady stretch of `len` s is (10 ms blocks, the window with the
 *  most energy and the fewest dropouts), and the gain that brings that stretch to a full level */
function busiest(b: AudioBuffer, len: number): { at: number; gain: number } {
  const d = b.getChannelData(0)
  const win = Math.round(b.sampleRate * 0.01)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const n = Math.max(1, Math.min(env.length, Math.round(len / 0.01)))
  let best = 0
  let bestScore = -1
  for (let i = 0; i + n <= env.length; i += 2) {
    const w = env.slice(i, i + n)
    const mean = w.reduce((x, y) => x + y, 0) / n
    const lowest = [...w].sort((p, q) => p - q)[Math.floor(n * 0.15)]
    const score = mean * (0.4 + 0.6 * Math.min(1, lowest / Math.max(1e-6, mean)))
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  const mean = env.slice(best, best + n).reduce((x, y) => x + y, 0) / n
  return { at: best * 0.01, gain: Math.min(12, 0.18 / Math.max(1e-5, mean)) }
}

/** `len` s of a recording from `at`, made to loop without a seam: its last 80 ms crossfaded (equal
 *  power) into its first */
function seamless(ctx: AudioContext, b: AudioBuffer, at: number, len: number): AudioBuffer {
  const sr = b.sampleRate
  const a = Math.round(at * sr)
  const n = Math.min(Math.round(len * sr), b.length - a)
  const xf = Math.min(Math.round(0.08 * sr), Math.floor(n / 3))
  const out = ctx.createBuffer(b.numberOfChannels, n - xf, sr)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const s = b.getChannelData(c)
    const d = out.getChannelData(c)
    for (let i = 0; i < n - xf; i++) d[i] = s[a + i]
    // the head blended with the tail that follows the loop's end
    for (let i = 0; i < xf; i++) {
      const k = i / xf
      d[i] = s[a + i] * Math.sin(k * Math.PI * 0.5) + s[a + n - xf + i] * Math.cos(k * Math.PI * 0.5)
    }
  }
  return out
}

/** a buffer with its loudness evened out over 20 ms blocks (smoothly), to its own mean */
function level(b: AudioBuffer): AudioBuffer {
  const sr = b.sampleRate
  const win = Math.round(sr * 0.02)
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c)
    const env: number[] = []
    for (let i = 0; i < d.length; i += win) {
      let e = 0
      const n = Math.min(win, d.length - i)
      for (let j = i; j < i + n; j++) e += d[j] * d[j]
      env.push(Math.sqrt(e / Math.max(1, n)) + 1e-6)
    }
    const mean = env.reduce((x, y) => x + y, 0) / env.length
    for (let i = 0; i < d.length; i++) {
      const f = i / win - 0.5
      const k = Math.max(0, Math.min(env.length - 1, Math.floor(f)))
      const k2 = Math.min(env.length - 1, k + 1)
      const u = Math.max(0, Math.min(1, f - k))
      d[i] *= mean / (env[k] * (1 - u) + env[k2] * u)
    }
  }
  return b
}
