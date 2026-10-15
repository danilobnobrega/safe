import { sfx } from './sfx'

// PARKED (?toss=on): rejected as the toss sound ("doesn't sound like a throw"), kept because Danilo is
// considering it for another place. A paper ball in flight: the air it cuts. Turbulent air IS noise, so this is noise shaped live by
// the ball's own physics, every frame:
//   - loudness with its speed squared (drag goes with v²), nothing below a slow drift;
//   - brighter the faster it goes (a higher band of the noise);
//   - quieter the further it is from the camera, and placed left/right where it is on screen;
//   - and a lumpy crumpled ball tumbling cuts the air unevenly: the hiss pulses with its real spin
//     (a few lumps per turn), softly.
// One voice per ball in the air, gone once it has slowed to a stop.
const Q = new URLSearchParams(location.search)
export const TOSS_TEST = Q.get('toss') === 'on'
const ON = TOSS_TEST
const V_FULL = Number(Q.get('tossv') ?? 6) // m/s for the full hiss
const GAIN = Number(Q.get('tossgain') ?? 0.32)
const LUMPS = 3 // lumps per turn of the ball

type Voice = { src: AudioBufferSourceNode; bp: BiquadFilterNode; g: GainNode; pan: StereoPannerNode; phase: number; still: number }

export class PaperToss {
  private noise?: AudioBuffer
  private voices = new Map<object, Voice>()

  constructor() {
    if (!ON) return
    const { ctx } = sfx()
    // two seconds of noise, a touch pink (more body than white: air, not static)
    const n = ctx.sampleRate * 2
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
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25
    }
    this.noise = b
  }

  /**
   * each frame, for each ball in the air (`key` the ball): its speed (m/s), spin (rad/s), distance
   * from the camera (m) and place across the screen (-1..1); `flying` false once it has landed for good
   */
  update(key: object, dt: number, speed: number, spin: number, dist: number, x: number, flying: boolean): void {
    const { ctx, out } = sfx()
    if (!this.noise || ctx.state !== 'running') return
    let v = this.voices.get(key)
    if (!v) {
      if (!flying || speed < 1) return
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      src.loop = true
      src.loopStart = Math.random() * 1.5
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.Q.value = 0.7
      const g = ctx.createGain()
      g.gain.value = 0
      const pan = ctx.createStereoPanner()
      src.connect(bp).connect(g).connect(pan).connect(out)
      src.start(ctx.currentTime, Math.random() * 1.5)
      v = { src, bp, g, pan, phase: Math.random() * 6.28, still: 0 }
      this.voices.set(key, v)
    }
    const t = ctx.currentTime
    const s = Math.min(1.4, speed / V_FULL)
    v.phase += Math.abs(spin) * LUMPS * dt
    const flutter = 1 + 0.28 * Math.sin(v.phase) * Math.min(1, s * 1.5)
    const near = 1 / (1 + Math.max(0, dist - 1) * 0.9)
    const level = flying ? GAIN * s * s * near * flutter : 0
    v.g.gain.setTargetAtTime(level, t, 0.03)
    v.bp.frequency.setTargetAtTime(500 + 2600 * s, t, 0.05)
    v.pan.pan.setTargetAtTime(Math.max(-0.6, Math.min(0.6, x * 0.6)), t, 0.05)
    v.still = speed < 0.3 || !flying ? v.still + dt : 0
    if (v.still > 0.4) {
      v.src.stop(t + 0.1)
      this.voices.delete(key)
    }
  }
}
