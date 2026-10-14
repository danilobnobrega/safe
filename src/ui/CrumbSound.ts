import type { CrumbKind } from './CrumbRain'

/**
 * TEST (?crumbsound=…, /cookie-sounds.html): the cookie / cracker pile, heard.
 *
 * Two different events, always of one family (Danilo: the fall and the hover must not sound the
 * same, but must belong together):
 *   land(kind, a)  a crumb hits the floor or another crumb (falling in, tumbling after a shove)
 *   push(kind, a)  the cursor shoves one (the hover)
 *   suck()         the scroll pulls the pile off the sides
 *
 * Every sound is modal synthesis — how hard, brittle things actually ring: a handful of inharmonic
 * partials, each decaying at its own rate, struck by a short noise transient, through a small room.
 * A cookie: thick and crumbly — low partials, heavily damped, a soft crumb-dust after. A cracker:
 * thin and dry — higher, brighter partials, a crisp crackle. Each hit is re-tuned a little, so no two
 * are the same. The families:
 *
 *   natural   (realistic) the crumb as it is — land: a short knock with weight under it and dust;
 *             push: lighter, a quick scoot on the surface, then a small tick as it tips over
 *   toon      (ridiculous, synth2's spirit) the same knocks, cartoonised: land drops in pitch
 *             ("bonk"), push rises ("bwip"), a hair of squeak
 *   glass     (ridiculous) as if the crumbs were made of glass/porcelain — clinks that ring on;
 *             push: a tiny rising chime
 */
export const CRUMB_SOUND_KINDS: Record<string, string[]> = {
  realistas: ['made', 'foley', 'natural'],
  'ridículos (no espírito do synth2)': ['toon', 'glass'],
}

interface Body {
  base: number // Hz of the lowest partial
  ratios: number[]
  decay: number // s, the lowest partial's
  bright: number // how much the higher partials ring (0..1)
  noiseHz: number // the transient's colour
  dust: number // the crumbly after-sound, 0..1
}
const COOKIE: Body = { base: 330, ratios: [1, 1.63, 2.42, 3.37, 4.6], decay: 0.055, bright: 0.45, noiseHz: 1800, dust: 0.7 }
const CRACKER: Body = { base: 820, ratios: [1, 1.52, 2.28, 3.05, 4.22, 5.6], decay: 0.04, bright: 0.85, noiseHz: 5200, dust: 1 }

const THREE_clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** recorded foley (public/hero/sound/foley, all CC0: Kenney "Impact Sounds"; OpenGameArt "Crunch sounds
 *  (burnt toast)" and "5 break, crunch impacts"). Each group is 4-5 takes of one sound */
export const FOLEY_GROUPS: Record<string, string[]> = {
  impactWood_light: [0, 1, 2, 3, 4].map((i) => `impactWood_light_00${i}.ogg`),
  impactWood_medium: [0, 1, 2, 3, 4].map((i) => `impactWood_medium_00${i}.ogg`),
  impactGeneric_light: [0, 1, 2, 3, 4].map((i) => `impactGeneric_light_00${i}.ogg`),
  impactPlate_light: [0, 1, 2, 3, 4].map((i) => `impactPlate_light_00${i}.ogg`),
  impactSoft_medium: [0, 1, 2, 3, 4].map((i) => `impactSoft_medium_00${i}.ogg`),
  impactPlank_medium: [0, 1, 2, 3, 4].map((i) => `impactPlank_medium_00${i}.ogg`),
  impactGlass_light: [0, 1, 2, 3, 4].map((i) => `impactGlass_light_00${i}.ogg`),
  footstep_snow: [0, 1, 2, 3, 4].map((i) => `footstep_snow_00${i}.ogg`),
  footstep_grass: [0, 1, 2, 3, 4].map((i) => `footstep_grass_00${i}.ogg`),
  footstep_carpet: [0, 1, 2, 3, 4].map((i) => `footstep_carpet_00${i}.ogg`),
  toast: [7, 8, 9, 10].map((i) => `toast_${i}.ogg`),
  crunchimpact: [1, 2, 3, 4, 5].map((i) => `crunchimpact_0${i}.flac`),
}
/** (?crumbsound=foley) which group plays what — from the URL (cl / ch / kl / kh), else these */
// (Danilo's picks, 2026-10-13: the two wood takes — the fall the medium one, the hover the light one;
// a cracker the same, played higher: thinner, drier)
const FOLEY_DEFAULT = { cl: 'impactWood_medium', ch: 'impactWood_light', kl: 'impactWood_medium', kh: 'impactWood_light' }
const CRACKER_PITCH = 1.28

export class CrumbSound {
  kind: string
  private ctx?: AudioContext
  private out?: GainNode
  private noise?: AudioBuffer
  private foley = new Map<string, Promise<AudioBuffer>>()
  private pick: Record<'cl' | 'ch' | 'kl' | 'kh', string> = (() => {
    const q = new URLSearchParams(location.search)
    return { cl: q.get('cl') ?? FOLEY_DEFAULT.cl, ch: q.get('ch') ?? FOLEY_DEFAULT.ch, kl: q.get('kl') ?? FOLEY_DEFAULT.kl, kh: q.get('kh') ?? FOLEY_DEFAULT.kh }
  })()
  /** (?crumbdebug) told the moment a sound fires, so the crumb can flash with it */
  onSound?: () => void

  setPick(slot: 'cl' | 'ch' | 'kl' | 'kh', group: string): void {
    this.pick[slot] = group
  }

  private take(group: string): Promise<AudioBuffer> {
    const files = FOLEY_GROUPS[group] ?? FOLEY_GROUPS.impactWood_light
    const f = files[Math.floor(Math.random() * files.length)]
    if (!this.foley.has(f)) this.foley.set(f, fetch(`${import.meta.env.BASE_URL}hero/sound/foley/${f}`).then((r) => r.arrayBuffer()).then((ab) => this.ensure().decodeAudioData(ab)))
    return this.foley.get(f)!
  }

  private solo?: AudioBufferSourceNode
  /** (/cookie-sounds.html) one take alone — the previous one cut — as a fall or as a hover plays it */
  async audition(file: string, as: 'land' | 'hover'): Promise<void> {
    const ctx = this.ensure()
    if (!this.foley.has(file)) this.foley.set(file, fetch(`${import.meta.env.BASE_URL}hero/sound/foley/${file}`).then((r) => r.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)))
    const buf = await this.foley.get(file)!
    try {
      this.solo?.stop()
    } catch {
      // (already over)
    }
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    const t = ctx.currentTime
    if (as === 'hover') {
      // a medium-speed swipe: as the site plays it
      src.playbackRate.value = 1.02
      g.gain.setValueAtTime(0.62, t)
      g.gain.setValueAtTime(0.62, t + 0.21)
      g.gain.linearRampToValueAtTime(0, t + 0.3)
    } else g.gain.value = 0.85
    src.connect(g).connect(this.out!)
    src.start(t)
    this.solo = src
  }

  /** every take decoded up front, so a hit plays the instant it happens */
  preloadFoley(): void {
    for (const g of new Set(Object.values(this.pick))) for (const f of FOLEY_GROUPS[g] ?? []) {
      if (!this.foley.has(f)) this.foley.set(f, fetch(`${import.meta.env.BASE_URL}hero/sound/foley/${f}`).then((r) => r.arrayBuffer()).then((ab) => this.ensure().decodeAudioData(ab)))
    }
  }

  /** one recorded take: its loudness, pitch (playback rate), place, and (hover) length set by the event */
  private async playTake(group: string, gain: number, rate: number, x: number, maxLen?: number): Promise<void> {
    const buf = await this.take(group)
    const ctx = this.ensure()
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    if (maxLen) {
      g.gain.setValueAtTime(gain, t + maxLen * 0.7)
      g.gain.linearRampToValueAtTime(0, t + maxLen)
    }
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.min(1, Math.max(-1, x * 0.8))
    src.connect(g).connect(pan).connect(this.out!)
    src.start(t)
    if (maxLen) src.stop(t + maxLen + 0.02)
  }

  constructor(kind = new URLSearchParams(location.search).get('crumbsound') ?? '') {
    this.kind = kind
  }

  get on(): boolean {
    return !!this.kind
  }

  /** the chain: a gentle compressor (a pile landing doesn't clip), a small room under it */
  private ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = (this.ctx = new AudioContext())
      const n = ctx.sampleRate
      this.noise = ctx.createBuffer(1, n, n)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.ratio.value = 4
      comp.attack.value = 0.002
      comp.release.value = 0.12
      comp.connect(ctx.destination)
      // the room: a short, dark impulse response (a desk in a room, not a hall)
      const len = Math.round(n * 0.35)
      const ir = ctx.createBuffer(2, len, n)
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c)
        for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < n * 0.004 ? 0 : 1)
      }
      const verb = ctx.createConvolver()
      verb.buffer = ir
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 3500
      const wet = ctx.createGain()
      wet.gain.value = 0.16
      this.out = ctx.createGain()
      this.out.gain.value = 0.9
      this.out.connect(comp)
      this.out.connect(verb).connect(lp).connect(wet).connect(comp)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** a real touch, the moment the physics reports it (already thinned to the frame's hardest few) */
  land(kind: CrumbKind, amount: number, x = 0): void {
    const a = Math.min(1, amount)
    if (!this.on) return
    this.onSound?.()
    if (this.kind === 'made') {
      const ctx = this.ensure()
      const pan = ctx.createStereoPanner()
      pan.pan.value = THREE_clamp(x * 0.8, -1, 1)
      pan.connect(this.out!)
      this.madeLand(kind, a, pan, ctx.currentTime + 0.002)
      return
    }
    if (this.kind === 'foley') {
      // a soft touch is quiet and a touch higher (a small crumb-contact), a hard one full
      void this.playTake(kind === 'cracker' ? this.pick.kl : this.pick.cl, 0.15 + a * 0.85, (0.94 + Math.random() * 0.12) * (1.08 - a * 0.12) * (kind === 'cracker' ? CRACKER_PITCH : 1), x)
      return
    }
    const ctx = this.ensure()
    const t = ctx.currentTime + 0.002
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.min(1, Math.max(-1, x * 0.8))
    pan.connect(this.out!)
    const b = kind === 'cracker' ? CRACKER : COOKIE
    const tune = 0.92 + Math.random() * 0.16
    if (this.kind === 'glass') return this.ring(t, b.base * 2.6 * tune, b.ratios, 0.9, 0.15 + a * 0.5, 0.9, pan)
    const glide = this.kind === 'toon' ? -0.35 : 0
    // the knock
    this.modal(t, b, tune * (0.95 + a * 0.1), a, 1, glide, pan)
    // its weight on the surface: a low, short body thump (more for a cookie, more the harder)
    this.thump(t, kind === 'cracker' ? 140 : 95, a * (kind === 'cracker' ? 0.35 : 0.6), pan)
    // and the dust: fine crumb-crackle just after
    if (this.kind !== 'toon') this.dust(t + 0.01, b, a * b.dust, kind === 'cracker' ? 0.09 : 0.07, pan)
  }

  /** the hover, shaped by the hand (Danilo: not one fixed sound — it follows the movement):
   *   `speed`  0..1 how fast the cursor came: a slow nudge is a long, soft, low drag that barely
   *            knocks; a fast swipe a short, bright flick with a hard knock and crumbs flying
   *   `dirY`   -1..1 the cursor's vertical way: flicked upward, the knock lifts in pitch; downward
   *            it sinks (a crumb pressed into the pile)
   *   `x`      -1..1 where on screen: the sound sits there, left to right
   *   `crowd`  how many crumbs this same swipe caught: a sweep through the pile layers a scatter of
   *            small knocks, not one more drag per crumb
   */
  push(kind: CrumbKind, amount: number, m: { speed?: number; dirY?: number; x?: number; crowd?: number } = {}): void {
    const a = Math.min(1, amount)
    if (!this.on || a < 0.05) return
    const speed = THREE_clamp(m.speed ?? a, 0, 1)
    this.onSound?.()
    if (this.kind === 'made') {
      const ctx = this.ensure()
      const pan = ctx.createStereoPanner()
      pan.pan.value = THREE_clamp((m.x ?? 0) * 0.8, -1, 1)
      pan.connect(this.out!)
      this.madePush(kind, a, speed, pan, ctx.currentTime + 0.002)
      return
    }
    if (this.kind === 'foley') {
      // the hand shapes the take: slow — quieter, lower, drawn out; fast — louder, higher, cut short
      const group = kind === 'cracker' ? this.pick.kh : this.pick.ch
      void this.playTake(group, 0.25 + speed * 0.75, (0.82 + speed * 0.4 + (m.dirY ?? 0) * 0.08) * (kind === 'cracker' ? CRACKER_PITCH : 1), m.x ?? 0, 0.45 - speed * 0.3)
      return
    }
    const ctx = this.ensure()
    const t = ctx.currentTime + 0.004
    const b = kind === 'cracker' ? CRACKER : COOKIE
    const tune = (0.95 + Math.random() * 0.1) * (1 + (m.dirY ?? 0) * 0.12)
    const pan = ctx.createStereoPanner()
    pan.pan.value = THREE_clamp((m.x ?? 0) * 0.8, -1, 1)
    pan.connect(this.out!)
    const crowd = Math.min(5, m.crowd ?? 1)
    if (this.kind === 'glass') {
      // a chime that runs up with a fast swipe, a single soft note on a nudge
      const notes = 1 + Math.round(speed * 3)
      for (let k = 0; k < notes; k++) this.ring(t + k * (0.07 - speed * 0.03), b.base * (3.2 + k * 0.6) * tune, [1, 2.01, 3.03], 0.25 + (1 - speed) * 0.3, 0.12 + speed * 0.2, 0.5, pan)
    } else {
      // the drag: slow -> long, low, slow-grained; fast -> short, bright, fine-grained
      const dur = 0.24 - speed * 0.19
      this.scoot(t, b, 0.25 + speed * 0.6, dur, pan, 30 + speed * 110, 0.7 + speed * 0.7)
      // the knock as it tips: barely there on a nudge, hard on a swipe — lifted or sunk by the way
      const glide = this.kind === 'toon' ? 0.25 + speed * 0.6 * Math.sign(m.dirY ?? 1) : 0
      this.modal(t + dur * 0.6, b, tune * (1.1 + speed * 0.15), 0.15 + speed * 0.7, 0.3 + speed * 0.5, glide, pan)
      if (speed > 0.55) this.dust(t + dur * 0.6 + 0.01, b, speed * b.dust, 0.06, pan)
      if (this.kind === 'toon') this.squeak(t + 0.01, b.base * (1.8 + speed), 0.05 + (1 - speed) * 0.1, pan)
    }
    // the rest of the swipe's catch: small, quick knocks, spread a little
    for (let k = 1; k < crowd; k++) {
      const tk = t + 0.03 + k * (0.05 - speed * 0.025) + Math.random() * 0.02
      this.modal(tk, k % 2 ? CRACKER : b, (0.95 + Math.random() * 0.15) * 1.2, 0.2 + speed * 0.3, 0.35, 0, pan)
    }
  }

  suck(): void {
    if (!this.on) return
    const ctx = this.ensure()
    const t = ctx.currentTime + 0.01
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.4
    bp.frequency.setValueAtTime(300, t)
    bp.frequency.exponentialRampToValueAtTime(this.kind === 'toon' ? 4000 : 2200, t + 0.5)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.45, t + 0.18)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
    src.connect(bp).connect(g).connect(this.out!)
    src.start(t, Math.random() * 0.3)
    src.stop(t + 0.65)
    // the pile itself, rattling away: a scatter of soft knocks
    for (let i = 0; i < 9; i++) {
      const ti = t + 0.05 + i * 0.035 + Math.random() * 0.02
      this.modal(ti, i % 2 ? CRACKER : COOKIE, 0.9 + Math.random() * 0.2, 0.15 * (1 - i / 9), 0.6, 0)
    }
  }


  // ---- 'made': built the way the printer's was — the real thing taken apart into its physical stages,
  // each stage a simple layer of shaped noise, timed to the event. A biscuit doesn't ring (it's
  // porous and crumbly): there are no tones in it, only the contact's click and the body's dull thud
  //   land:  click (the first instant of contact) + thud (the body taking the hit) + for a cracker,
  //          two or three tiny dry snaps (its brittle edges)
  //   push:  a light tick (the cursor's touch) + a short scuff (it skids off the surface)

  /** a noise burst through a band: the building block of every stage */
  private burst(t: number, hz: number, q: number, gain: number, attack: number, decay: number, dest: AudioNode): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = hz
    bp.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    src.connect(bp).connect(g).connect(dest)
    src.start(t, Math.random() * 0.9)
    src.stop(t + attack + decay + 0.01)
  }

  private madeLand(kind: CrumbKind, a: number, dest: AudioNode, t: number): void {
    const cracker = kind === 'cracker'
    const j = 0.9 + Math.random() * 0.2
    const g = 0.12 + a * 0.5
    // click: the very first instant of contact
    this.burst(t, (cracker ? 4200 : 2600) * j, 1.2, g * 0.55, 0.0008, 0.006, dest)
    // thud: the body taking the hit — low, dull, short; a cookie heavier and lower than a cracker
    this.burst(t + 0.001, (cracker ? 900 : 420) * j, 1.1, g, 0.002, cracker ? 0.03 : 0.045, dest)
    // a cracker's brittle edges: a couple of tiny dry snaps right after
    if (cracker) for (let k = 0; k < 2 + Math.round(a * 2); k++) this.burst(t + 0.006 + Math.random() * 0.03, 5200 * (0.8 + Math.random() * 0.5), 3, g * 0.3, 0.0005, 0.004, dest)
  }

  private madePush(kind: CrumbKind, a: number, speed: number, dest: AudioNode, t: number): void {
    const cracker = kind === 'cracker'
    const j = 0.92 + Math.random() * 0.16
    const g = 0.1 + a * 0.4
    // tick: the cursor's touch on its edge
    this.burst(t, (cracker ? 3800 : 2400) * j, 1.5, g * 0.6, 0.0008, 0.005, dest)
    // scuff: it skids off — longer and softer when slow, short and bright when fast
    const dur = 0.07 - speed * 0.04
    this.burst(t + 0.003, (cracker ? 2200 : 1300) * (0.85 + speed * 0.4) * j, 0.9, g * 0.45, dur * 0.35, dur, dest)
  }

  // ---- the voices -----------------------------------------------------------------------------

  /** a struck brittle body: inharmonic damped partials + the strike's noise transient */
  private modal(t: number, b: Body, tune: number, a: number, level: number, glide: number, dest?: AudioNode): void {
    const ctx = this.ctx!
    const gain = 0.32 * level * (0.25 + a * 0.75)
    b.ratios.forEach((r, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      const f = b.base * tune * r * (1 + (Math.random() - 0.5) * 0.02)
      o.frequency.setValueAtTime(f, t)
      if (glide) o.frequency.exponentialRampToValueAtTime(f * (1 + glide), t + 0.09)
      const g = ctx.createGain()
      const amp = gain * Math.pow(b.bright, i) / (1 + i * 0.3)
      const dec = b.decay / (1 + i * 0.45)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(amp, t + 0.0015)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec * 4)
      o.connect(g).connect(dest ?? this.out!)
      o.start(t)
      o.stop(t + dec * 4 + 0.02)
    })
    // the strike
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = b.noiseHz * tune
    bp.Q.value = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain * 1.4, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012)
    src.connect(bp).connect(g).connect(dest ?? this.out!)
    src.start(t, Math.random() * 0.9)
    src.stop(t + 0.015)
  }

  /** the weight landing: a low sine thump with a fast pitch drop */
  private thump(t: number, hz: number, a: number, dest?: AudioNode): void {
    if (a < 0.03) return
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(hz * 1.8, t)
    o.frequency.exponentialRampToValueAtTime(hz, t + 0.025)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.3 * a, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    o.connect(g).connect(dest ?? this.out!)
    o.start(t)
    o.stop(t + 0.08)
  }

  /** crumb dust: a few tiny crackles scattering just after the knock */
  private dust(t: number, b: Body, a: number, span: number, dest?: AudioNode): void {
    if (a < 0.05) return
    const ctx = this.ctx!
    const n = 3 + Math.round(a * 5)
    for (let i = 0; i < n; i++) {
      const ti = t + Math.random() * span
      const src = ctx.createBufferSource()
      src.buffer = this.noise!
      const hp = ctx.createBiquadFilter()
      hp.type = 'bandpass'
      hp.frequency.value = b.noiseHz * (1.2 + Math.random() * 1.2)
      hp.Q.value = 3
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.06 * a * (1 - (ti - t) / span), ti)
      g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.006)
      src.connect(hp).connect(g).connect(dest ?? this.out!)
      src.start(ti, Math.random() * 0.9)
      src.stop(ti + 0.008)
    }
  }

  /** shoved along a surface: grainy friction noise, swelling and fading */
  private scoot(t: number, b: Body, a: number, dur: number, dest?: AudioNode, grainHz = 55 + Math.random() * 30, hzMul = 1): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 1.6
    bp.frequency.setValueAtTime(b.noiseHz * 0.5 * hzMul, t)
    bp.frequency.linearRampToValueAtTime(b.noiseHz * 0.8 * hzMul, t + dur)
    // the grain: the friction stutters
    const grain = ctx.createGain()
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = grainHz
    const lg = ctx.createGain()
    lg.gain.value = 0.5
    lfo.connect(lg).connect(grain.gain)
    grain.gain.value = 0.5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16 * a, t + dur * 0.35)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp).connect(grain).connect(g).connect(dest ?? this.out!)
    src.start(t, Math.random() * 0.8)
    lfo.start(t)
    src.stop(t + dur + 0.01)
    lfo.stop(t + dur + 0.01)
  }

  /** a ringing clink (porcelain/glass): long, nearly harmonic partials */
  private ring(t: number, hz: number, ratios: number[], decay: number, a: number, bright: number, dest?: AudioNode): void {
    const ctx = this.ctx!
    ratios.forEach((r, i) => {
      const o = ctx.createOscillator()
      o.frequency.value = hz * r * (1 + (Math.random() - 0.5) * 0.004)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime((0.14 * a * Math.pow(bright, i)) / (1 + i * 0.5), t + 0.002)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay / (1 + i * 0.6))
      o.connect(g).connect(dest ?? this.out!)
      o.start(t)
      o.stop(t + decay + 0.05)
    })
  }

  /** a short rubbery squeak (toon only) */
  private squeak(t: number, hz: number, dur: number, dest?: AudioNode): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(hz, t)
    o.frequency.exponentialRampToValueAtTime(hz * 1.7, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.3)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(dest ?? this.out!)
    o.start(t)
    o.stop(t + dur + 0.01)
  }
}
