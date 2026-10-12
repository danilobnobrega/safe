/**
 * (/hero-paper*) An inkjet printing, synthesised (Web Audio, no file): the pick-up — a roller's whirr
 * and a clack as it takes the sheet — then, line by line, the print head's carriage sweeping across
 * (a motor's buzz under a band of filtered noise, rising and falling with the sweep) with the paper
 * advancing a notch between passes (a short tick), and a last push as the page drops out.
 * `play(wait, feed)` matches the visual: `wait` s taking the sheet in, `feed` s feeding it out.
 */
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

  play(wait: number, feed: number): void {
    const ctx = this.ensure()
    const out = ctx.createGain()
    out.gain.value = 0.55
    out.connect(ctx.destination)
    const t0 = ctx.currentTime + 0.02
    // pick-up: a roller's whirr, then a clack
    this.motor(out, t0, wait * 0.9, 140, 0.18)
    this.click(out, t0 + wait * 0.85, 0.5, 900)
    // the passes
    const passes = Math.max(4, Math.round(feed / 0.24))
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
