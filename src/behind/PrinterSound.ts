/**
 * (/hero-paper*) An inkjet printing, synthesised (Web Audio, no file): the pick-up — a roller's whirr
 * and a clack as it takes the sheet — then, line by line, the print head's carriage sweeping across
 * (a motor's buzz under a band of filtered noise, rising and falling with the sweep) with the paper
 * advancing a notch between passes (a short tick), and a last push as the page drops out.
 * `play(wait, feed)` matches the visual: `wait` s taking the sheet in, `feed` s feeding it out.
 */
/** recordings (public/behind), each with where its printing starts. Credits:
 *  inkjet.ogg — "Inkjet printer on and off", stephan, Wikimedia Commons, public domain
 *  druck.ogg  — "Druckergeräusche v2", Theresa Obermair (Kartoffel.3.7), Wikimedia Commons, CC BY-SA 4.0
 *  laser.ogg  — "Laser printer, 2015-01-23", Finn Årup Nielsen, Wikimedia Commons, CC BY-SA 3.0 */
export const RECORDINGS: Record<string, { file: string; from: number }> = {
  real: { file: 'inkjet.ogg', from: 19.55 },
  real2: { file: 'druck.ogg', from: 0.8 },
  laser: { file: 'laser.ogg', from: 8.8 },
}
/** every printer sound there is, by kind (/printer-sounds.html) */
export const SOUND_KINDS: Record<string, string[]> = {
  'muito ridículos': ['silly', 'chip', 'modem', 'cartoon'],
  'ridículos como o atual': ['synth', 'synth2', 'dotmatrix'],
  realistas: ['real', 'real2', 'laser'],
}

export class PrinterSound {
  private ctx?: AudioContext
  private noise?: AudioBuffer

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      const n = this.ctx.sampleRate * 2
      this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate)
      const d = this.noise.getChannelData(0)
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  /** TEST (?sound=silly | real): the default is the synthesised one ('synth') */
  kind = new URLSearchParams(location.search).get('sound') ?? 'synth2' // (Danilo's pick to test, 2026-10-12)
  private recs = new Map<string, Promise<AudioBuffer>>()

  play(wait: number, feed: number): void {
    const k = this.kind
    if (k in RECORDINGS) return void this.playRec(k, wait, feed)
    if (k === 'silly') return this.playSilly(wait, feed)
    if (k === 'chip') return this.playChip(wait, feed)
    if (k === 'modem') return this.playModem(wait, feed)
    if (k === 'cartoon') return this.playCartoon(wait, feed)
    if (k === 'dotmatrix') return this.playDotMatrix(wait, feed)
    if (k === 'synth2') return this.playSynth(wait, feed, 1.6, 0.16)
    this.playSynth(wait, feed, 1, 0.24)
  }

  /** the main one; `pitch` scales its tones, `pass` s per printed line */
  private playSynth(wait: number, feed: number, pitch: number, pass: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.55
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    // pick-up: a roller's whirr, then a clack
    this.motor(out, t0, wait * 0.9, 140 * pitch, 0.18)
    this.click(out, t0 + wait * 0.85, 0.5, 900 * pitch)
    // the passes
    const passes = Math.max(4, Math.round(feed / pass))
    const each = feed / passes
    for (let i = 0; i < passes; i++) {
      const t = t0 + wait + i * each
      this.sweep(out, t, each * 0.72, i % 2 === 0)
      this.click(out, t + each * 0.8, 0.22, 1600) // the paper advancing a line
    }
    // the page out
    this.motor(out, t0 + wait + feed, 0.25, 160, 0.14)
    this.click(out, t0 + wait + feed + 0.22, 0.3, 700)
    setTimeout(() => out.disconnect(), (wait + feed + 1.5) * 1000)
  }

  /** a recording, its printing stretch cut to the visual's length, faded in and out */
  private async playRec(kind: string, wait: number, feed: number): Promise<void> {
    const ctx = this.ensure()
    const r = RECORDINGS[kind]
    if (!this.recs.has(kind)) {
      this.recs.set(kind, fetch(`${import.meta.env.BASE_URL}behind/${r.file}`).then((x) => x.arrayBuffer()).then((ab) => ctx.decodeAudioData(ab)))
    }
    const buf = await this.recs.get(kind)!
    const dur = wait + feed + 0.15
    const src = ctx.createBufferSource()
    src.buffer = buf
    const g = ctx.createGain()
    const t = ctx.currentTime + 0.01
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(1, t + 0.05)
    g.gain.setValueAtTime(1, t + dur - 0.15)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(g).connect(ctx.destination)
    src.start(t, r.from, dur)
  }

  /** (chip) an 8-bit game printing: square-wave arpeggios per line, a level-up jingle at the end */
  private playChip(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.22
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    const note = (t: number, hz: number, d: number, type: OscillatorType = 'square') => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = hz
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.5, t)
      g.gain.setValueAtTime(0, t + d)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + d + 0.01)
    }
    for (let i = 0; i < 6; i++) note(t0 + (i * wait) / 6, 110 * (1 + (i % 2)), wait / 7, 'triangle')
    const arp = [0, 4, 7, 12]
    const passes = Math.max(4, Math.round(feed / 0.18))
    for (let i = 0; i < passes; i++) {
      const t = t0 + wait + i * (feed / passes)
      for (let k = 0; k < 4; k++) note(t + k * 0.035, 330 * 2 ** ((arp[k] + (i % 5)) / 12), 0.03)
    }
    const te = t0 + wait + feed
    ;[523, 659, 784, 1047].forEach((hz, k) => note(te + k * 0.08, hz, k === 3 ? 0.3 : 0.07))
    setTimeout(() => out.disconnect(), (wait + feed + 1.5) * 1000)
  }

  /** (modem) a dial-up handshake doing the printing: dial tones, then the screech */
  private playModem(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.25
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    const tone = (t: number, a: number, b: number, d: number) => {
      for (const hz of [a, b]) {
        const o = ctx.createOscillator()
        o.frequency.value = hz
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.3, t)
        g.gain.setValueAtTime(0, t + d)
        o.connect(g).connect(out)
        o.start(t)
        o.stop(t + d + 0.01)
      }
    }
    tone(t0, 697, 1209, wait * 0.3)
    tone(t0 + wait * 0.35, 770, 1336, wait * 0.3)
    tone(t0 + wait * 0.7, 2100, 2100, wait * 0.3)
    const n = Math.max(6, Math.round(feed / 0.11))
    for (let i = 0; i < n; i++) {
      const t = t0 + wait + i * (feed / n)
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(900 + ((i * 397) % 1800), t)
      o.frequency.linearRampToValueAtTime(1300 + ((i * 211) % 1500), t + feed / n)
      const g = ctx.createGain()
      g.gain.value = 0.08
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + feed / n)
      if (i % 3 === 0) this.click(out, t, 0.5, 3000)
    }
    setTimeout(() => out.disconnect(), (wait + feed + 1) * 1000)
  }

  /** (cartoon) a tiny engine putt-putting the page out, then a clown-horn honk */
  private playCartoon(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.45
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    const putts = Math.round((wait + feed) / 0.09)
    for (let i = 0; i < putts; i++) {
      const t = t0 + i * 0.09
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(70 + (i % 3) * 6, t)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.35, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
      const lp = ctx.createBiquadFilter()
      lp.frequency.value = 500
      o.connect(lp).connect(g).connect(out)
      o.start(t)
      o.stop(t + 0.08)
    }
    const te = t0 + wait + feed
    for (const hz of [330, 415]) {
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(hz, te)
      o.frequency.linearRampToValueAtTime(hz * 0.92, te + 0.35)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.18, te)
      g.gain.linearRampToValueAtTime(0, te + 0.4)
      o.connect(g).connect(out)
      o.start(te)
      o.stop(te + 0.42)
    }
    setTimeout(() => out.disconnect(), (wait + feed + 1) * 1000)
  }

  /** (dotmatrix) an old dot-matrix: a hard, nasal screech per line, a ratchet between */
  private playDotMatrix(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.4
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    this.motor(out, t0, wait, 120, 0.2)
    const passes = Math.max(4, Math.round(feed / 0.2))
    for (let i = 0; i < passes; i++) {
      const t = t0 + wait + i * (feed / passes)
      const d = (feed / passes) * 0.8
      const o = ctx.createOscillator()
      o.type = 'square'
      o.frequency.setValueAtTime(i % 2 ? 1180 : 980, t)
      const am = ctx.createOscillator()
      am.frequency.value = 160
      const amg = ctx.createGain()
      amg.gain.value = 0.06
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.08, t)
      g.gain.setValueAtTime(0, t + d)
      am.connect(amg).connect(g.gain)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1500
      o.connect(bp).connect(g).connect(out)
      o.start(t)
      am.start(t)
      o.stop(t + d)
      am.stop(t + d)
      for (let k = 0; k < 3; k++) this.click(out, t + d + k * 0.015, 0.3, 1200)
    }
    setTimeout(() => out.disconnect(), (wait + feed + 1) * 1000)
  }

  /** (?sound=silly) even more ridiculous: a kazoo hums each printed line, a step higher every line,
   *  a slide whistle as the page comes out, and a little bell when it's done */
  private playSilly(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.5
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    // the pick-up: a cartoon "boing"
    {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(180, t0)
      o.frequency.exponentialRampToValueAtTime(520, t0 + wait * 0.5)
      o.frequency.exponentialRampToValueAtTime(240, t0 + wait)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03)
      g.gain.exponentialRampToValueAtTime(0.001, t0 + wait)
      o.connect(g).connect(out)
      o.start(t0)
      o.stop(t0 + wait + 0.05)
    }
    // the lines: a kazoo, up a scale
    const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16]
    const passes = Math.max(5, Math.round(feed / 0.2))
    const each = feed / passes
    for (let i = 0; i < passes; i++) {
      const t = t0 + wait + i * each
      const f = 220 * 2 ** (scale[i % scale.length] / 12)
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, t)
      const vib = ctx.createOscillator()
      vib.frequency.value = 11
      const vg = ctx.createGain()
      vg.gain.value = f * 0.03
      vib.connect(vg).connect(o.frequency)
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 1100
      bp.Q.value = 1.4
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.3, t + 0.02)
      g.gain.setValueAtTime(0.3, t + each * 0.7)
      g.gain.linearRampToValueAtTime(0, t + each * 0.85)
      o.connect(bp).connect(g).connect(out)
      o.start(t)
      vib.start(t)
      o.stop(t + each)
      vib.stop(t + each)
    }
    // out: a slide whistle down, then a bell
    const te = t0 + wait + feed
    {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(1400, te - 0.3)
      o.frequency.exponentialRampToValueAtTime(500, te + 0.15)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, te - 0.3)
      g.gain.exponentialRampToValueAtTime(0.25, te - 0.2)
      g.gain.exponentialRampToValueAtTime(0.001, te + 0.18)
      o.connect(g).connect(out)
      o.start(te - 0.3)
      o.stop(te + 0.2)
    }
    for (const [hz, v] of [[1760, 0.3], [2637, 0.12], [3520, 0.06]] as const) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz
      const g = ctx.createGain()
      g.gain.setValueAtTime(v, te + 0.2)
      g.gain.exponentialRampToValueAtTime(0.0005, te + 1.4)
      o.connect(g).connect(out)
      o.start(te + 0.2)
      o.stop(te + 1.45)
    }
    setTimeout(() => out.disconnect(), (wait + feed + 2) * 1000)
  }

  /** a roller / feed motor: a low, slightly wavering buzz */
  private motor(out: AudioNode, t: number, dur: number, hz: number, vol: number): void {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(hz * 0.85, t)
    o.frequency.linearRampToValueAtTime(hz, t + dur * 0.3)
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 700
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(vol, t + 0.04)
    g.gain.setValueAtTime(vol, t + dur - 0.05)
    g.gain.linearRampToValueAtTime(0, t + dur)
    o.connect(lp).connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** the print head crossing: band-passed noise whose pitch rides the carriage's speed, over a motor */
  private sweep(out: AudioNode, t: number, dur: number, ltr: boolean): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.Q.value = 3.5
    const f0 = ltr ? 1800 : 2300
    bp.frequency.setValueAtTime(f0, t)
    bp.frequency.linearRampToValueAtTime(f0 * 1.35, t + dur * 0.5)
    bp.frequency.linearRampToValueAtTime(f0, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.22, t + dur * 0.15)
    g.gain.setValueAtTime(0.22, t + dur * 0.8)
    g.gain.linearRampToValueAtTime(0, t + dur)
    src.connect(bp).connect(g).connect(out)
    src.start(t, Math.random())
    src.stop(t + dur + 0.02)
    this.motor(out, t, dur, ltr ? 220 : 235, 0.07)
  }

  /** a mechanical tick: a short, filtered noise burst */
  private click(out: AudioNode, t: number, vol: number, hz: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise!
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = hz
    bp.Q.value = 2
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
    src.connect(bp).connect(g).connect(out)
    src.start(t, Math.random())
    src.stop(t + 0.06)
  }
}
