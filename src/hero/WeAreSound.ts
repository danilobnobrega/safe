import { sfx } from '../behind/sfx'
import { cutSnaps, type Snap } from '../behind/PaperCrumple'

// TEST (?wesound=pop|papel|giz — not on the site until Danilo picks): "We are", its letters dodging the
// cursor. Each letter is heard as it moves, on its own spring:
//   - when it LEAPS away (the peak of its jump), a sound as strong as the leap;
//   - when it comes HOME after the cursor has gone, the same, softer and a hair lower;
//   - and each letter has its own note, rising W .. e left to right (a major pentatonic), so running
//     the cursor along "We are" plays a little phrase.
// Families, all real recordings (CC0, Freesound):
//   pop    the cookies' mouth pops, tuned per letter
//   papel  index cards flipped, a paper flip — a card cut-out of a letter
//   giz    chalk tapping on a blackboard, chalk on a table — the site's own chalk
const Q = new URLSearchParams(location.search)
const FAMILY = ((f) => (['pop', 'papel', 'giz'].includes(f) ? f : ''))(Q.get('wesound') ?? '')
const FILES: Record<string, { dir: string; ids: string[]; cut: boolean }> = {
  pop: { dir: 'crumb', ids: ['573152', '573153', '691907', '792928', '259704', '323741', '323742', '323743'], cut: false },
  papel: { dir: 'we', ids: ['339000', '615337'], cut: true },
  giz: { dir: 'we', ids: ['498130', '210294'], cut: true },
}
const STEPS = [0, 2, 4, 7, 9] // the letters' notes (semitones)
const LEAP_MIN = 380 // px/s: a peak slower than this is the spring wobbling as the cursor passes, not a leap
const LEAP_FULL = 1500 // px/s: a full leap (measured: a point-blank pass peaks well over 1000)

type Track = { prev: number; rising: boolean; last: number }

export class WeAreSound {
  private snaps: Snap[] = []
  private tracks: Track[] = []

  constructor() {
    if (!FAMILY) return
    const { ctx } = sfx()
    const f = FILES[FAMILY]
    void Promise.all(f.ids.map((id) => fetch(`${import.meta.env.BASE_URL}hero/sound/${f.dir}/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)))).then((bufs) => {
      this.snaps = f.cut ? bufs.flatMap((b) => cutSnaps(b)).filter((s) => s.len <= 0.25) : bufs.map((b) => ({ buf: b, at: leadIn(b), len: Math.min(0.4, b.duration - leadIn(b)), gain: 1, bright: 0 }))
      // every sound brought to the same real loudness (its own peak to 0.9): the paper and chalk
      // recordings are quiet at source — evened against themselves only, they stayed faint
      for (const k of this.snaps) {
        const d = k.buf.getChannelData(0)
        const a = Math.floor(k.at * k.buf.sampleRate)
        const z = Math.min(d.length, a + Math.floor(k.len * k.buf.sampleRate))
        let pk = 0
        for (let i = a; i < z; i++) pk = Math.max(pk, Math.abs(d[i]))
        k.gain = Math.min(40, 0.9 / Math.max(1e-4, pk))
      }
      if (Q.has('wedebug')) console.log('[we]', FAMILY, this.snaps.length, 'sounds')
    })
  }

  /** each frame: every letter's velocity and offset from home (px, screen y down), and its place
   *  across the screen (-1..1) */
  update(letters: { vel: { x: number; y: number }; off: { x: number; y: number } }[], xs: number[]): void {
    if (!FAMILY || !this.snaps.length) return
    const now = performance.now()
    letters.forEach((L, i) => {
      const tr = (this.tracks[i] ??= { prev: 0, rising: false, last: 0 })
      const speed = Math.hypot(L.vel.x, L.vel.y)
      if (speed > tr.prev) tr.rising = true
      else if (tr.rising && tr.prev > LEAP_MIN) {
        // the top of a leap: away from home, or back to it
        tr.rising = false
        if (now - tr.last > 220) {
          tr.last = now
          const away = L.vel.x * L.off.x + L.vel.y * L.off.y > 0 || Math.hypot(L.off.x, L.off.y) < 4
          this.play(i, Math.min(1.2, tr.prev / LEAP_FULL), away, xs[i] ?? 0)
        }
      } else if (speed < tr.prev) tr.rising = false
      tr.prev = speed
    })
  }

  private play(i: number, s: number, away: boolean, x: number): void {
    const { ctx, out } = sfx()
    if (Q.has('wedebug')) console.log('[we] letter', i, away ? 'leaps' : 'home', s.toFixed(2))
    if (ctx.state !== 'running') return
    const k = this.snaps[Math.floor(Math.random() * this.snaps.length)]
    const t = ctx.currentTime + 0.003
    const src = ctx.createBufferSource()
    src.buffer = k.buf
    const note = STEPS[i % STEPS.length] + 12 * Math.floor(i / STEPS.length)
    src.playbackRate.value = Math.pow(2, note / 12) * (away ? 1 : 0.94) * (1 + (Math.random() - 0.5) * 0.02)
    const g = ctx.createGain()
    const level = 0.45 * k.gain * Math.pow(Math.min(1, s), 1.1) * (away ? 1 : 0.45)
    const len = k.len / src.playbackRate.value
    g.gain.setValueAtTime(level, t)
    g.gain.setValueAtTime(level, t + len * 0.6)
    g.gain.linearRampToValueAtTime(0, t + len)
    const p = ctx.createStereoPanner()
    p.pan.value = Number.isFinite(x) ? Math.max(-0.8, Math.min(0.8, x * 0.8)) : 0
    src.connect(g).connect(p).connect(out)
    src.start(t, k.at, k.len + 0.01)
  }
}

/** where a short recording's sound starts (the first sample over a tenth of its peak, less 2 ms) */
function leadIn(b: AudioBuffer): number {
  const d = b.getChannelData(0)
  let pk = 0
  for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]))
  let i = 0
  while (i < d.length && Math.abs(d[i]) < pk * 0.1) i++
  return Math.max(0, i / b.sampleRate - 0.002)
}
