/**
 * (/hero-paper*, /desk-sounds.html) The desk's sounds, in the printer's voice (synth2): synthesised,
 * caricatured, a little too eager — shaped noise, buzzing motors, clicks, the odd tone. Every sound
 * is built the way the printer's was: the real event taken apart into its physical stages, each a
 * simple layer, timed to what happens on screen.
 *
 *   fold     the hero becoming a sheet as the camera pulls back
 *   crumple  the sheet scrunched by the drag (a grain of crackles; `rate` follows the drag)
 *   toss     the ball leaving the hand
 *   hit      the ball meeting something: 'floor' | 'desk' | 'printer' | 'rim' (the bin's metal edge)
 *   score    the ball dropping into the bin
 *   dive     the camera diving into the bin, toward the next page
 *   drawer   (hover) a drawer sliding out on its runners and back
 *   bin      (hover) the light metal bin turning and wobbling on its base
 *   lamp     (hover) the arm-lamp swinging on its springs
 *
 * Each has a few takes (`v`: 'a' | 'b' | 'c') to choose from on /desk-sounds.html.
 */
export type DeskEvent = 'fold' | 'crumple' | 'toss' | 'hit' | 'score' | 'dive' | 'drawer' | 'bin' | 'lamp'

/** every sound, its takes, and what each take is: 'synth2' (the printer's caricature), 'real'
 *  (as real as synthesis gets), 'sarcastic' (real, but played straight to the point of a joke) */
export const DESK_SOUNDS: { ev: DeskEvent; name: string; takes: [string, string][]; arg?: string[] }[] = [
  { ev: 'fold', name: 'hero virando folha (câmera recuando)', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'crumple', name: 'amassar a folha', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'toss', name: 'arremesso', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'hit', name: 'bola batendo', takes: [['a', 'synth2'], ['c', 'realista']], arg: ['floor', 'desk', 'printer', 'rim'] },
  { ev: 'score', name: 'acerto no cesto', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'synth2'], ['d', 'realista'], ['e', 'realista sarcástico']] },
  { ev: 'dive', name: 'mergulho no cesto', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'drawer', name: 'hover: gaveta', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'bin', name: 'hover: cesto', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico']] },
  { ev: 'lamp', name: 'hover: luminária', takes: [['a', 'synth2'], ['b', 'synth2'], ['c', 'realista'], ['d', 'realista sarcástico'], ['e', 'realista'], ['f', 'realista: giro + molas'], ['g', 'realista: só o giro'], ['h', 'enferrujado: um rangido longo'], ['i', 'enferrujado: vai e volta'], ['j', 'enferrujado: travando']] },
]

export class DeskSound {
  private ctx?: AudioContext
  private out?: GainNode
  private noise?: AudioBuffer
  /** which take each event uses on the site (the page sets them; ?ds_<event>=<take> too) */
  take: Record<string, string> = {}

  constructor() {
    const q = new URLSearchParams(location.search)
    for (const s of DESK_SOUNDS) this.take[s.ev] = q.get(`ds_${s.ev}`) ?? 'a'
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }))
      const n = ctx.sampleRate * 2
      this.noise = ctx.createBuffer(1, n, ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -16
      comp.ratio.value = 3
      comp.connect(ctx.destination)
      this.out = ctx.createGain()
      this.out.gain.value = 0.6
      this.out.connect(comp)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  play(ev: DeskEvent, opts: { take?: string; arg?: string; amount?: number; rate?: number; x?: number } = {}): void {
    const ctx = this.ensure()
    const t = ctx.currentTime + 0.005
    const v = opts.take ?? this.take[ev] ?? 'a'
    const a = Math.min(1, Math.max(0, opts.amount ?? 0.8))
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.min(1, Math.max(-1, (opts.x ?? 0) * 0.8))
    pan.connect(this.out!)
    const o = pan
    switch (ev) {
      case 'fold':
        return v === 'd' ? this.foldD(t, o) : v === 'c' ? this.foldC(t, o) : v === 'b' ? this.foldB(t, o) : this.foldA(t, o)
      case 'crumple':
        return v === 'c' || v === 'd' ? this.crumpleReal(t, o, v === 'd', opts.rate ?? 1, 1.2) : this.crumple(t, o, v, opts.rate ?? 1, 1.2)
      case 'toss':
        return v === 'd' ? this.tossD(t, o) : v === 'c' ? this.tossC(t, o, a) : v === 'b' ? this.tossB(t, o, a) : this.tossA(t, o, a)
      case 'hit':
        return v === 'c' ? this.hitReal(t, o, opts.arg ?? 'floor', a) : this.hit(t, o, opts.arg ?? 'floor', a)
      case 'score':
        return v === 'e' ? this.scoreE(t, o) : v === 'd' ? this.scoreD(t, o) : this.score(t, o, v)
      case 'dive':
        return v === 'd' ? this.diveD(t, o) : v === 'c' ? this.diveC(t, o) : v === 'b' ? this.diveB(t, o) : this.diveA(t, o)
      case 'drawer':
        return v === 'd' ? this.drawerD(t, o) : v === 'c' ? this.drawerC(t, o, a) : this.drawer(t, o, v, a)
      case 'bin':
        return v === 'd' ? this.binD(t, o) : v === 'c' ? this.binC(t, o, a) : this.binWobble(t, o, v, a)
      case 'lamp':
        return v === 'h' || v === 'i' || v === 'j' ? this.lampRusty(t, o, a, v) : v === 'f' || v === 'g' ? this.lampTurn(t, o, a, v === 'f') : v === 'e' ? this.lampE(t, o, a) : v === 'd' ? this.lampD(t, o) : v === 'c' ? this.lampC(t, o, a) : this.lamp(t, o, v, a)
    }
  }

  // ---- building blocks (the printer's) -------------------------------------------------------

  private noiseBand(t: number, dur: number, hz0: number, hz1: number, q: number, gain: number, out: AudioNode, attack = 0.02): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = q
    bp.frequency.setValueAtTime(hz0, t)
    bp.frequency.exponentialRampToValueAtTime(Math.max(20, hz1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(attack, dur * 0.5))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(g).connect(out)
    src.start(t, Math.random())
    src.stop(t + dur + 0.02)
  }

  private click(t: number, hz: number, gain: number, out: AudioNode, len = 0.04): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = hz
    bp.Q.value = 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.connect(bp).connect(g).connect(out)
    src.start(t, Math.random())
    src.stop(t + len + 0.01)
  }

  private motor(t: number, dur: number, hz0: number, hz1: number, gain: number, out: AudioNode, type: OscillatorType = 'sawtooth', lp = 900): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(hz0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, hz1), t + dur)
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lp
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.3))
    g.gain.setValueAtTime(gain, t + dur * 0.75)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(f).connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  private tone(t: number, hz: number, dur: number, gain: number, out: AudioNode, type: OscillatorType = 'sine', glide = 1): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(hz, t)
    if (glide !== 1) o.frequency.exponentialRampToValueAtTime(hz * glide, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  // ---- the events --------------------------------------------------------------------------------

  /** (a) a paper rush rising with the pull-back, a soft flap as it lands as a sheet */
  private foldA(t: number, o: AudioNode): void {
    this.noiseBand(t, 1.6, 600, 3200, 1.2, 0.18, o, 0.6)
    this.motor(t, 1.8, 220 * 1.6, 90 * 1.6, 0.05, o)
    this.noiseBand(t + 1.55, 0.18, 900, 500, 1.5, 0.28, o, 0.01)
    this.click(t + 1.6, 1500, 0.3, o, 0.05)
  }

  /** (b) a cartoon "zoom out": a falling slide whistle, then the flap */
  private foldB(t: number, o: AudioNode): void {
    this.tone(t, 1600, 1.4, 0.12, o, 'sine', 0.35)
    this.noiseBand(t, 1.4, 2400, 800, 1.4, 0.08, o, 0.3)
    this.noiseBand(t + 1.4, 0.16, 900, 500, 1.5, 0.26, o, 0.01)
  }

  /** crumpling: a grain of tiny crackles, denser with a faster drag (`rate` ~0..2) over `dur` s */
  private crumple(t: number, o: AudioNode, v: string, rate: number, dur: number): void {
    const n = Math.round((v === 'b' ? 30 : 45) * dur * Math.max(0.2, rate))
    for (let i = 0; i < n; i++) {
      const ti = t + Math.random() * dur
      if (v === 'b') this.tone(ti, 900 + Math.random() * 1800, 0.03, 0.05, o, 'square', 0.6) // a bleepy crinkle
      else this.click(ti, 2500 + Math.random() * 4000, 0.06 + Math.random() * 0.12, o, 0.012 + Math.random() * 0.02)
    }
    this.noiseBand(t, dur, 1800, 2600, 0.8, 0.05, o, 0.1) // the paper's hush under it
  }

  /** (a) a quick whoosh, rising */
  private tossA(t: number, o: AudioNode, a: number): void {
    this.noiseBand(t, 0.28, 700, 2600, 1.3, 0.15 + a * 0.25, o, 0.08)
  }

  /** (b) the whoosh with a cartoon "fwip" */
  private tossB(t: number, o: AudioNode, a: number): void {
    this.noiseBand(t, 0.25, 900, 3000, 1.3, 0.12 + a * 0.2, o, 0.07)
    this.tone(t + 0.02, 500, 0.16, 0.12, o, 'triangle', 2.6)
  }

  /** the paper ball meeting a surface: a soft papery thud; the bin's rim rings a little tin "tink" */
  private hit(t: number, o: AudioNode, what: string, a: number): void {
    const g = 0.08 + a * 0.35
    if (what === 'rim') {
      this.tone(t, 1900, 0.35, g * 0.6, o, 'sine', 0.98)
      this.tone(t, 2950, 0.2, g * 0.3, o, 'sine')
      this.click(t, 3500, g * 0.5, o, 0.02)
      return
    }
    const hz = what === 'printer' ? 1300 : what === 'desk' ? 750 : 420
    this.noiseBand(t, what === 'floor' ? 0.12 : 0.08, hz * 1.6, hz, 1.2, g, o, 0.003)
    this.click(t, hz * 3, g * 0.4, o, 0.015)
    if (what === 'printer') this.tone(t, 620, 0.06, g * 0.25, o, 'square', 0.8) // plastic "tok"
  }

  /** into the bin: (a) a papery clunk on the bottom and a tin rattle; (b) + a cash-register "ding";
   *  (c) + a tiny three-note fanfare */
  private score(t: number, o: AudioNode, v: string): void {
    this.noiseBand(t, 0.14, 500, 260, 1.2, 0.4, o, 0.003)
    for (let k = 0; k < 4; k++) this.tone(t + 0.03 + k * 0.05, 1500 + k * 120, 0.12, 0.08 / (k + 1), o, 'sine')
    if (v === 'b') {
      this.tone(t + 0.22, 2093, 0.9, 0.18, o, 'sine')
      this.tone(t + 0.22, 4186, 0.5, 0.06, o, 'sine')
    }
    if (v === 'c') [523, 659, 1047].forEach((hz, k) => this.tone(t + 0.25 + k * 0.11, hz, k === 2 ? 0.45 : 0.12, 0.14, o, 'square'))
  }

  /** (a) a falling whoosh into the dark, muffled at the bottom; (b) a cartoon drop: a slide down and a "bonk" */
  private diveA(t: number, o: AudioNode): void {
    this.noiseBand(t, 1.5, 2600, 300, 1.1, 0.2, o, 0.3)
    this.motor(t, 1.5, 300, 60, 0.07, o, 'sawtooth', 500)
  }
  private diveB(t: number, o: AudioNode): void {
    this.tone(t, 1400, 1.2, 0.13, o, 'sine', 0.15)
    this.noiseBand(t + 1.15, 0.2, 400, 150, 1.2, 0.35, o, 0.004)
  }

  /** a drawer on its runners: (a) a metal slide out and a soft knock back; (b) shorter, with a ball-bearing purr */
  private drawer(t: number, o: AudioNode, v: string, a: number): void {
    const g = 0.06 + a * 0.12
    if (v === 'b') {
      this.motor(t, 0.18, 180, 240, g * 0.6, o, 'square', 1200)
      this.noiseBand(t, 0.18, 1800, 2400, 2, g, o, 0.03)
    } else this.noiseBand(t, 0.22, 1100, 1700, 1.6, g, o, 0.04)
    this.click(t + 0.32, 900, g * 1.2, o, 0.03)
  }


  // ---- 'realista': as real as synthesis gets — no tones where the real thing has none, the
  // grain of real friction (irregular, clustered), small rooms; 'realista sarcástico': the same
  // realism, played straight but far too seriously (a movie-trailer hit for a sheet of paper)

  /** a soft room under a sound: a short noise tail (a desk in a room, not a hall) */
  private room(t: number, dur: number, gain: number, out: AudioNode): void {
    this.noiseBand(t, dur, 900, 500, 0.6, gain, out, 0.01)
  }

  /** (c) a sheet of paper lifted and settling: a breathy rustle, then a dry slap of paper on a desk */
  private foldC(t: number, o: AudioNode): void {
    for (let k = 0; k < 7; k++) this.noiseBand(t + k * 0.18 + Math.random() * 0.06, 0.16, 2600 + Math.random() * 1500, 1800, 0.7, 0.05, o, 0.05)
    this.noiseBand(t + 1.45, 0.07, 1400, 700, 0.9, 0.3, o, 0.002)
    this.click(t + 1.45, 3000, 0.12, o, 0.015)
  }

  /** (d) the same, as a trailer: a deep riser and a cinematic BRAAM as the sheet lands */
  private foldD(t: number, o: AudioNode): void {
    this.noiseBand(t, 1.4, 200, 2400, 0.9, 0.14, o, 1.2)
    this.motor(t, 1.4, 55, 110, 0.12, o, 'sawtooth', 400)
    this.motor(t + 1.42, 1.6, 55, 48, 0.32, o, 'sawtooth', 700)
    this.motor(t + 1.42, 1.6, 82.5, 72, 0.18, o, 'sawtooth', 900)
    this.noiseBand(t + 1.42, 0.5, 300, 90, 0.8, 0.3, o, 0.005)
  }

  /** crumpling, real: crackles come in clusters (a fold giving way sets off its neighbours), over a
   *  low rustle; (sarcastic) the same as an ASMR close-up — slow, huge, every crack savoured */
  private crumpleReal(t: number, o: AudioNode, asmr: boolean, rate: number, dur: number): void {
    const clusters = Math.round((asmr ? 6 : 14) * dur * Math.max(0.3, rate))
    for (let i = 0; i < clusters; i++) {
      const tc = t + Math.random() * dur
      const n = 2 + Math.floor(Math.random() * (asmr ? 3 : 6))
      for (let k = 0; k < n; k++) {
        const tk = tc + k * (asmr ? 0.03 : 0.008) * (0.5 + Math.random())
        this.click(tk, (asmr ? 1500 : 2200) + Math.random() * 4500, (asmr ? 0.32 : 0.12) * (0.4 + Math.random() * 0.6), o, asmr ? 0.05 : 0.01 + Math.random() * 0.015)
      }
    }
    this.noiseBand(t, dur, 1200, 1700, 0.5, asmr ? 0.1 : 0.04, o, 0.15)
    if (asmr) this.room(t + 0.1, dur, 0.04, o)
  }

  /** (c) a light thing thrown: a short, airy swish, lower than you'd think */
  private tossC(t: number, o: AudioNode, a: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(500, t)
    lp.frequency.exponentialRampToValueAtTime(1600, t + 0.12)
    lp.frequency.exponentialRampToValueAtTime(600, t + 0.3)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.1 + a * 0.15, t + 0.1)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32)
    src.connect(lp).connect(g).connect(o)
    src.start(t, Math.random())
    src.stop(t + 0.34)
  }

  /** (d) slow motion: the swish pitched down to a long, heavy, sports-replay "whooooom" */
  private tossD(t: number, o: AudioNode): void {
    this.noiseBand(t, 1.3, 180, 520, 0.9, 0.22, o, 0.5)
    this.motor(t, 1.3, 70, 48, 0.08, o, 'sine', 300)
  }

  /** a crumpled paper ball meeting a surface, real: a dull papery pat, a crinkle of its folds after;
   *  on the bin's thin metal rim, a short dead tick (no ring: it's a light ball) */
  private hitReal(t: number, o: AudioNode, what: string, a: number): void {
    const g = 0.06 + a * 0.3
    if (what === 'rim') {
      this.click(t, 2600, g * 0.8, o, 0.02)
      this.tone(t, 1150, 0.12, g * 0.12, o, 'sine')
      return
    }
    const hz = what === 'printer' ? 1000 : what === 'desk' ? 600 : 330
    this.noiseBand(t, 0.05, hz * 1.5, hz, 0.9, g, o, 0.002)
    for (let k = 0; k < 3; k++) this.click(t + 0.01 + Math.random() * 0.04, 3000 + Math.random() * 3000, g * 0.2, o, 0.008)
  }

  /** (d) into a metal office bin, real: the ball's soft thump on the bottom, the bin's low hollow
   *  answer, a settle of paper */
  private scoreD(t: number, o: AudioNode): void {
    this.noiseBand(t, 0.07, 500, 280, 1, 0.35, o, 0.002)
    this.tone(t, 180, 0.4, 0.12, o, 'sine')
    this.tone(t, 283, 0.3, 0.06, o, 'sine')
    for (let k = 0; k < 4; k++) this.click(t + 0.05 + k * 0.03, 3500 + Math.random() * 2000, 0.05, o, 0.01)
  }

  /** (e) the same — then a stadium crowd roaring for it */
  private scoreE(t: number, o: AudioNode): void {
    this.scoreD(t, o)
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 900
    bp.Q.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5
    const lg = ctx.createGain()
    lg.gain.value = 0.05
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t + 0.2)
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.7)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6)
    lfo.connect(lg).connect(g.gain)
    src.connect(bp).connect(g).connect(o)
    src.start(t + 0.2, Math.random())
    lfo.start(t + 0.2)
    src.stop(t + 2.7)
    lfo.stop(t + 2.7)
    for (let k = 0; k < 10; k++) this.tone(t + 0.4 + Math.random() * 1.2, 1800 + Math.random() * 900, 0.18, 0.025, o, 'sine', 1.15) // whistles
  }

  /** (c) falling into the dark, real: a rush of air rising, everything else gone muffled */
  private diveC(t: number, o: AudioNode): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(300, t)
    lp.frequency.exponentialRampToValueAtTime(1800, t + 1.2)
    lp.frequency.exponentialRampToValueAtTime(200, t + 1.6)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.3, t + 1.1)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.65)
    src.connect(lp).connect(g).connect(o)
    src.start(t, Math.random())
    src.stop(t + 1.7)
  }

  /** (d) the same, but someone's in the lift with you: the rush, then a polite elevator "ding" */
  private diveD(t: number, o: AudioNode): void {
    this.diveC(t, o)
    this.tone(t + 1.5, 1318, 0.9, 0.12, o, 'sine')
    this.tone(t + 1.5, 2636, 0.5, 0.03, o, 'sine')
  }

  /** (c) a metal drawer, real: the rumble of its runners (irregular, it rolls on little bearings),
   *  a click as it stops */
  private drawerC(t: number, o: AudioNode, a: number): void {
    const g = 0.05 + a * 0.12
    for (let k = 0; k < 14; k++) this.click(t + k * 0.016 + Math.random() * 0.006, 700 + Math.random() * 500, g * 0.6, o, 0.012)
    this.noiseBand(t, 0.24, 500, 700, 1, g * 0.5, o, 0.03)
    this.click(t + 0.25, 1800, g, o, 0.02)
    this.room(t + 0.26, 0.12, g * 0.25, o)
  }

  /** (d) the drawer as a haunted house door: a long, slow, groaning creak */
  private drawerD(t: number, o: AudioNode): void {
    const ctx = this.ctx!
    const s = ctx.createOscillator()
    s.type = 'sawtooth'
    s.frequency.setValueAtTime(140, t)
    s.frequency.linearRampToValueAtTime(260, t + 0.6)
    s.frequency.linearRampToValueAtTime(180, t + 1.2)
    const am = ctx.createOscillator()
    am.frequency.value = 23
    const ag = ctx.createGain()
    ag.gain.value = 0.06
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 1100
    bp.Q.value = 3
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.15)
    g.gain.setValueAtTime(0.08, t + 1)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25)
    am.connect(ag).connect(g.gain)
    s.connect(bp).connect(g).connect(o)
    s.start(t)
    am.start(t)
    s.stop(t + 1.3)
    am.stop(t + 1.3)
  }

  /** (c) a light metal bin nudged, real: its base scuffing the floor, a low hollow drum of its side */
  private binC(t: number, o: AudioNode, a: number): void {
    const g = 0.05 + a * 0.12
    this.noiseBand(t, 0.14, 700, 500, 1.2, g, o, 0.01)
    this.tone(t, 165, 0.35, g * 0.8, o, 'sine', 0.97)
    this.tone(t, 410, 0.2, g * 0.25, o, 'sine')
  }

  /** (d) the bin nudged — answered by a great temple gong */
  private binD(t: number, o: AudioNode): void {
    for (const [hz, gain, dur] of [[96, 0.22, 3.5], [143, 0.12, 3], [231, 0.08, 2.4], [352, 0.05, 1.8], [517, 0.03, 1.2]] as const) {
      this.tone(t, hz, dur, gain, o, 'sine', 0.985)
    }
    this.noiseBand(t, 0.08, 400, 200, 1, 0.2, o, 0.002)
  }

  /** (c) an arm-lamp, real: the springs' coils stretching (a dry metallic zing), its joint's short
   *  friction squeak, a little tick as it settles */
  private lampC(t: number, o: AudioNode, a: number): void {
    const g = 0.04 + a * 0.08
    // the spring's coil: a bright inharmonic ring, damped fast
    for (const [r, k] of [[1, 1], [2.76, 0.5], [5.4, 0.25]] as const) this.tone(t, 820 * r, 0.25, g * k, o, 'sine', 0.99)
    this.noiseBand(t, 0.12, 4500, 3800, 3, g * 0.6, o, 0.004)
    // the joint: a short, tight friction squeak
    this.motor(t + 0.05, 0.12, 900, 1050, g * 0.35, o, 'sawtooth', 3000)
    this.click(t + 0.32, 2400, g * 0.5, o, 0.012)
  }

  /** (d) the lamp moved an inch — and its joint creaks like a ship's mast in a storm */
  private lampD(t: number, o: AudioNode): void {
    for (let k = 0; k < 3; k++) this.motor(t + k * 0.38, 0.42, 380 - k * 40, 520 - k * 50, 0.05, o, 'sawtooth', 1500)
    this.tone(t + 1.1, 90, 0.6, 0.06, o, 'sine')
  }

  /** (f / g) an arm-lamp turned on its base, modelled from what actually sounds:
   *   - the swivel: metal sliding on metal is stick-slip — the joint catches and lets go a hundred-
   *     odd times a second, irregularly; each release a tiny impulse, ringing the lamp's metal (a few
   *     narrow resonances). Its rate follows the turn: speeding up, then slowing as it stops
   *   - (f) the arm's tension springs, set swaying: a spring rings as a train of falling "chirps"
   *     (the dispersion that makes spring reverbs sound the way they do), quiet, dying away
   *   - a last soft tick as it comes to rest */
  private lampTurn(t: number, o: AudioNode, a: number, springs: boolean): void {
    const ctx = this.ctx!
    const g = 0.05 + a * 0.1
    const dur = 0.42
    // the metal it rings: narrow resonances, through which every stick-slip release is heard
    const metal = ctx.createGain()
    metal.gain.value = 1
    const bus = ctx.createGain()
    bus.gain.value = g * 2.2
    for (const [hz, q, k] of [[1150, 28, 1], [2470, 36, 0.6], [3920, 40, 0.35], [610, 18, 0.5]] as const) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = hz * (0.97 + Math.random() * 0.06)
      bp.Q.value = q
      const kk = ctx.createGain()
      kk.gain.value = k
      metal.connect(bp).connect(kk).connect(bus)
    }
    bus.connect(o)
    // the releases: impulses at an uneven stick-slip rate, swelling with the turn and dying as it stops
    let tt = t
    while (tt < t + dur) {
      const p = (tt - t) / dur
      const speed = Math.sin(Math.PI * Math.min(1, p * 1.1)) // up, then down
      const rate = 60 + speed * 140
      const imp = ctx.createBufferSource()
      imp.buffer = this.noise!
      const ig = ctx.createGain()
      ig.gain.setValueAtTime(0.35 * (0.3 + speed * 0.7) * (0.6 + Math.random() * 0.8), tt)
      ig.gain.exponentialRampToValueAtTime(0.0001, tt + 0.0015)
      imp.connect(ig).connect(metal)
      imp.start(tt, Math.random())
      imp.stop(tt + 0.002)
      tt += (1 / rate) * (0.6 + Math.random() * 0.8)
    }
    // under it, the dry grind of the base's bearing
    this.noiseBand(t, dur, 300, 260, 1.1, g * 0.35, o, 0.06)
    if (springs) {
      // the springs set swaying: falling chirps, each a little later and softer
      for (let k = 0; k < 7; k++) {
        const tk = t + 0.06 + k * 0.034
        this.tone(tk, 3600, 0.045, g * 0.45 * Math.pow(0.7, k), o, 'sine', 0.12)
      }
      this.tone(t + 0.06, 220, 0.5, g * 0.15, o, 'triangle', 0.98) // the coil's own low hum
    }
    this.click(t + dur + 0.02, 1700, g * 0.6, o, 0.012)
  }

  /** (h / i / j) rusty: the joint dry and corroded, so it doesn't slide — it squeals. A rusty pivot
   *  sticks and slips at a near-steady rate, so the stick-slip becomes a PITCH (the squeak), rough and
   *  wavering: a buzzy pulse train whose rate wanders with the pressure and the turn, its harmonics
   *  pushed up by the metal's resonances, chopped where the rust grabs harder, over a grit of noise.
   *    h  one long turn: "eeeeEEEEeek", rising as it speeds, falling as it stops
   *    i  pushed and swinging back: two creaks, the second lower and shorter
   *    j  catching: the squeak stutters — grabs, lets go, grabs — then gives */
  private lampRusty(t: number, o: AudioNode, a: number, v: string): void {
    const g = 0.05 + a * 0.08
    if (v === 'i') {
      this.squeal(t, 0.45, 620, 980, 760, g, o, 0.15)
      this.squeal(t + 0.55, 0.3, 700, 560, 480, g * 0.7, o, 0.2)
    } else if (v === 'j') {
      for (let k = 0; k < 5; k++) this.squeal(t + k * 0.11 + Math.random() * 0.02, 0.07 + Math.random() * 0.04, 520 + k * 60, 640 + k * 70, 580 + k * 60, g * (0.6 + Math.random() * 0.4), o, 0.35)
      this.squeal(t + 0.6, 0.35, 800, 1050, 700, g, o, 0.12)
    } else this.squeal(t, 0.7, 520, 1150, 640, g, o, 0.15)
  }

  /** one rusty squeal: pitch from `f0` up to `f1` mid-way and down to `f2`, chopped by the rust's
   *  grab (`chop` 0..1 how much), with its grit */
  private squeal(t: number, dur: number, f0: number, f1: number, f2: number, g: number, o: AudioNode, chop: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.linearRampToValueAtTime(f1, t + dur * 0.55)
    osc.frequency.linearRampToValueAtTime(f2, t + dur)
    // the pitch wavers: slow noise on the frequency (pressure, the rust's unevenness)
    const wob = ctx.createBufferSource()
    wob.buffer = this.noise!
    const wl = ctx.createBiquadFilter()
    wl.type = 'lowpass'
    wl.frequency.value = 30
    const wg = ctx.createGain()
    wg.gain.value = f1 * 0.35
    wob.connect(wl).connect(wg).connect(osc.frequency)
    // the metal's resonances push some harmonics up: the squeak's nasal edge
    const mix = ctx.createGain()
    mix.gain.value = 1
    for (const [hz, q, k] of [[1800, 6, 1], [3100, 8, 0.7], [4700, 10, 0.4]] as const) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = hz
      bp.Q.value = q
      const kk = ctx.createGain()
      kk.gain.value = k
      osc.connect(bp).connect(kk).connect(mix)
    }
    // the rust grabbing: an irregular chop on the level
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(g, t + Math.min(0.04, dur * 0.2))
    let tt = t + 0.04
    while (tt < t + dur - 0.03) {
      if (Math.random() < chop) {
        env.gain.setValueAtTime(g * 0.15, tt)
        env.gain.setValueAtTime(g * (0.7 + Math.random() * 0.3), tt + 0.012 + Math.random() * 0.015)
      }
      tt += 0.03 + Math.random() * 0.04
    }
    env.gain.setValueAtTime(g * 0.8, t + dur - 0.03)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    mix.connect(env).connect(o)
    osc.start(t)
    wob.start(t, Math.random())
    osc.stop(t + dur + 0.02)
    wob.stop(t + dur + 0.02)
    // the grit: rough noise riding along
    this.noiseBand(t, dur, 2600, 2200, 1.4, g * 0.35, o, 0.03)
  }

  /** (e) real, another take: the coil spring as a long metallic "dooiing", with a light rattle */
  private lampE(t: number, o: AudioNode, a: number): void {
    const g = 0.04 + a * 0.08
    const ctx = this.ctx!
    const s = ctx.createOscillator()
    s.frequency.setValueAtTime(380, t)
    s.frequency.exponentialRampToValueAtTime(300, t + 0.6)
    const vib = ctx.createOscillator()
    vib.frequency.value = 11
    const vg = ctx.createGain()
    vg.gain.setValueAtTime(30, t)
    vg.gain.exponentialRampToValueAtTime(1, t + 0.6)
    vib.connect(vg).connect(s.frequency)
    const e = ctx.createGain()
    e.gain.setValueAtTime(g, t)
    e.gain.exponentialRampToValueAtTime(0.0001, t + 0.65)
    s.connect(e).connect(o)
    s.start(t)
    vib.start(t)
    s.stop(t + 0.67)
    vib.stop(t + 0.67)
    for (let k = 0; k < 5; k++) this.click(t + 0.03 + k * 0.05, 3000 + Math.random() * 1500, g * 0.3, o, 0.008)
  }

  /** the light metal bin turning: (a) a tinny wobble ringing round; (b) a cartoon "wob-wob-wob" */
  private binWobble(t: number, o: AudioNode, v: string, a: number): void {
    const g = 0.05 + a * 0.1
    if (v === 'b') {
      for (let k = 0; k < 3; k++) this.tone(t + k * 0.12, 260 - k * 25, 0.11, g, o, 'triangle', 0.85)
      return
    }
    const ctx = this.ctx!
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 9
    const lg = ctx.createGain()
    lg.gain.value = g * 0.5
    const amp = ctx.createGain()
    amp.gain.value = g * 0.5
    lfo.connect(lg).connect(amp.gain)
    for (const hz of [1240, 1870]) {
      const s = ctx.createOscillator()
      s.frequency.value = hz
      const e = ctx.createGain()
      e.gain.setValueAtTime(1, t)
      e.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
      s.connect(e).connect(amp)
      s.start(t)
      s.stop(t + 0.72)
    }
    amp.connect(o)
    lfo.start(t)
    lfo.stop(t + 0.72)
    this.noiseBand(t, 0.08, 600, 400, 1.2, g * 0.8, o, 0.004) // its base scraping the floor
  }

  /** the arm-lamp: (a) its springs "boing" and the joint creaks; (b) just a long squeaky creak */
  private lamp(t: number, o: AudioNode, v: string, a: number): void {
    const g = 0.05 + a * 0.1
    if (v === 'a') {
      const ctx = this.ctx!
      const s = ctx.createOscillator()
      s.type = 'triangle'
      s.frequency.value = 180
      const vib = ctx.createOscillator()
      vib.frequency.value = 14
      const vg = ctx.createGain()
      vg.gain.setValueAtTime(70, t)
      vg.gain.exponentialRampToValueAtTime(1, t + 0.5)
      vib.connect(vg).connect(s.frequency)
      const e = ctx.createGain()
      e.gain.setValueAtTime(g, t)
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      s.connect(e).connect(o)
      s.start(t)
      vib.start(t)
      s.stop(t + 0.52)
      vib.stop(t + 0.52)
    }
    this.motor(t + (v === 'a' ? 0.05 : 0), v === 'a' ? 0.25 : 0.5, 700, 1100, g * 0.5, o, 'sawtooth', 2600)
  }
}
