import { sfx } from './sfx'

// The toss's swoosh (the site's: 585257 "swoosh-1", Danilo's pick; ?toss=<id> tries the others,
// ?toss=off mutes it). A real recording
// (CC0, Freesound) of something light cutting the air, played the way THIS throw went:
//   - it starts the instant the ball leaves the hand (the recording's lead-in silence is measured
//     and skipped, so the swoosh's attack lands on the release);
//   - a harder flick: louder, a touch higher and quicker; a soft one: quiet, lower, drawn out;
//   - it travels across the stereo field from where the ball left the hand towards where it's
//     heading on screen, and dulls a little as it flies away from you.
export const TOSSES: [string, string][] = [
  ['719637', 'bambu rápido 2'],
  ['850167', 'bambu 4'],
  ['850164', 'bambu 1'],
  ['719636', 'bambu rápido 1'],
  ['352719', 'vareta no ar'],
  ['485279', 'vareta de madeira'],
  ['855844', 'bambu longo'],
  ['393814', 'swish curto'],
  ['709599', 'throw woosh'],
  ['394873', 'throw 1'],
  ['704258', 'pasta de papel'],
  ['585257', 'swoosh 1'],
  ['334197', 'papel no cesto'],
  ['346373', 'arremesso / chicote'],
  ['422513', 'cajado (forte)'],
  ['507466', 'swoosh limpo'],
]
const Q = new URLSearchParams(location.search)
const PICK = Q.get('toss') ?? '585257'
const ID = TOSSES.some(([id]) => id === PICK) ? PICK : null
const V_REF = Number(Q.get('tossv') ?? 4.5) // m/s of a firm throw

export class PaperThrow {
  private buf?: AudioBuffer
  private lead = 0 // s of near-silence before the swoosh's attack

  constructor() {
    if (!ID) return
    const { ctx } = sfx()
    void fetch(`${import.meta.env.BASE_URL}behind/sound/toss/${ID}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((a) => ctx.decodeAudioData(a))
      .then((b) => {
        this.buf = b
        this.lead = leadIn(b)
      })
  }

  get on(): boolean {
    return !!ID
  }

  /** the ball has left the hand at `speed` (m/s), from screen x `x0` heading to `x1` (-1..1) */
  play(speed: number, x0: number, x1: number): void {
    const { ctx, out } = sfx()
    if (!this.buf || ctx.state !== 'running') return
    const s = Math.max(0.15, Math.min(1.4, speed / V_REF))
    const t = ctx.currentTime + 0.003
    const src = ctx.createBufferSource()
    src.buffer = this.buf
    const rate = (0.86 + 0.26 * s) * (1 + (Math.random() - 0.5) * 0.05)
    src.playbackRate.value = rate
    const len = (this.buf.duration - this.lead) / rate
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.5
    // flying off: a little duller as it goes
    lp.frequency.setValueAtTime(16000, t)
    lp.frequency.exponentialRampToValueAtTime(4000 + 6000 * s, t + len)
    const g = ctx.createGain()
    g.gain.value = 0.85 * Math.pow(s, 1.2)
    const pan = ctx.createStereoPanner()
    const c = (v: number) => Math.max(-0.7, Math.min(0.7, v * 0.7))
    pan.pan.setValueAtTime(c(x0), t)
    pan.pan.linearRampToValueAtTime(c(x1), t + len * 0.8)
    src.connect(lp).connect(g).connect(pan).connect(out)
    src.start(t, this.lead)
  }
}

/** where the recording's sound actually starts: the first 2 ms stretch at a tenth of its peak, less
 *  a few ms so the attack itself is kept */
function leadIn(b: AudioBuffer): number {
  const d = b.getChannelData(0)
  const win = Math.round(b.sampleRate * 0.002)
  let peak = 0
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    const r = Math.sqrt(e / win)
    env.push(r)
    if (r > peak) peak = r
  }
  const k = env.findIndex((r) => r > peak * 0.1)
  return Math.max(0, (k - 2) * 0.002)
}
