import { sfx } from './sfx'
import type { PaperCrumple } from './PaperCrumple'

// A paper ball hitting things (on the site; ?hits=off mutes it). Every bounce
// the physics makes is heard, built the way it really sounds, in two layers:
//   - the PAPER: the ball crushed for an instant — a few of the same paper's snaps (the crumple's,
//     recording b) packed into a few ms, more and brighter the harder it hit (not in the bin);
//   - the SURFACE answering: a single hit cut from real recordings (CC0, Freesound) of the thing it
//     hit — the desk's wood, the floor, the printer's plastic, the bin's metal (its rim rings bright,
//     its wall from outside, muffled from inside). A paper ball is light: a soft touch is nearly all
//     paper; only a hard one wakes the surface — duller the softer it is (a lowpass that opens with
//     the force), louder with it.
// Placed left/right where it happened, quieter further away.
const Q = new URLSearchParams(location.search)
export const HITS_ON = Q.get('hits') !== 'off'

export type Surface = 'floor' | 'desk' | 'deskSide' | 'printer' | 'rim' | 'binOut' | 'binIn'

// each surface: its recordings, how loud it answers, how long its hit rings, and how bright it can get
const MATS: Record<Surface, { files: string[]; gain: number; ring: number; bright: number }> = {
  floor: { files: ['732813'], gain: 0.55, ring: 0.22, bright: 5000 },
  desk: { files: ['485238', '732813'], gain: 0.6, ring: 0.25, bright: 7000 },
  deskSide: { files: ['485238', '732813'], gain: 0.45, ring: 0.2, bright: 5000 },
  printer: { files: ['228609', '427390'], gain: 0.5, ring: 0.22, bright: 9000 },
  rim: { files: ['207499', '191489'], gain: 0.42, ring: 0.6, bright: 9000 },
  binOut: { files: ['794547', '669685', '207488'], gain: 0.6, ring: 0.7, bright: 6000 },
  binIn: { files: ['794547', '669685'], gain: 0.55, ring: 0.8, bright: 2600 },
}
const V_HARD = Number(Q.get('hitv') ?? 3.2) // m/s of change in the ball's speed: a hard hit

type Cut = { buf: AudioBuffer; at: number; len: number; gain: number }

export class BallHits {
  private cuts: Partial<Record<Surface, Cut[]>> = {}
  private last: Partial<Record<Surface, number>> = {}

  constructor(private paper: PaperCrumple) {
    if (!HITS_ON) return
    const { ctx } = sfx()
    const files = [...new Set(Object.values(MATS).flatMap((m) => m.files))]
    void Promise.all(files.map((id) => fetch(`${import.meta.env.BASE_URL}behind/sound/hit/${id}.mp3`).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).then((b) => [id, b] as const))).then((bufs) => {
      const by = new Map(bufs)
      for (const [s, m] of Object.entries(MATS) as [Surface, (typeof MATS)[Surface]][]) {
        this.cuts[s] = m.files.flatMap((id) => cutHits(by.get(id)!, m.ring))
      }
      if (Q.has('hitdebug')) console.log('[hits]', JSON.stringify(Object.fromEntries(Object.entries(this.cuts).map(([k, v]) => [k, v!.length]))))
    })
  }

  /** the ball hit `surface`: its speed changed by `dv` (m/s); `x` across the screen (-1..1), `dist` (m) from the camera */
  hit(surface: Surface, dv: number, x: number, dist: number): void {
    const { ctx, out } = sfx()
    const cuts = this.cuts[surface]
    if (!cuts?.length || ctx.state !== 'running') return
    const m = MATS[surface]
    const s = Math.min(1.3, dv / V_HARD)
    const near = 1 / (1 + Math.max(0, dist - 1.2) * 0.7)
    const t = ctx.currentTime + 0.004
    // the paper: crushed for an instant — not in the bin, where the ball scrapes down the walls in
    // a run of little touches that read as crumpling before the real hit (Danilo): there only the
    // metal answers
    if (surface !== 'rim' && surface !== 'binOut' && surface !== 'binIn') this.paper.impact(s * near, x)
    // the surface: a single hit of it, never the same one twice running
    let i = Math.floor(Math.random() * cuts.length)
    if (cuts.length > 1 && i === this.last[surface]) i = (i + 1) % cuts.length
    this.last[surface] = i
    const c = cuts[i]
    const src = ctx.createBufferSource()
    src.buffer = c.buf
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.08
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.Q.value = 0.6
    lp.frequency.value = 500 + (m.bright - 500) * Math.min(1, s * s)
    const g = ctx.createGain()
    // a light ball barely wakes the surface: it answers with the force, steeply
    const level = m.gain * c.gain * Math.pow(Math.min(1, s), 1.5) * near
    g.gain.setValueAtTime(level, t)
    g.gain.setValueAtTime(level, t + c.len * 0.6)
    g.gain.linearRampToValueAtTime(0, t + c.len)
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.max(-0.7, Math.min(0.7, x * 0.7))
    src.connect(lp).connect(g).connect(pan).connect(out)
    src.start(t, c.at, c.len + 0.02)
  }
}

/** the single hits in a recording: sharp onsets on a 2 ms envelope, each kept until it has rung down
 *  (or `ring` s), its level evened out against the recording's loudest */
function cutHits(b: AudioBuffer, ring: number): Cut[] {
  const sr = b.sampleRate
  const d = b.getChannelData(0)
  const win = Math.round(sr * 0.002)
  const env: number[] = []
  for (let i = 0; i + win <= d.length; i += win) {
    let e = 0
    for (let j = i; j < i + win; j++) e += d[j] * d[j]
    env.push(Math.sqrt(e / win))
  }
  const sorted = [...env].sort((p, q) => p - q)
  const floor = Math.max(1e-5, sorted[Math.floor(sorted.length * 0.2)])
  const top = sorted[sorted.length - 1]
  const out: Cut[] = []
  let i = 0
  while (i < env.length) {
    // (from the very first sample: a recording may open on its hit)
    const back = env.slice(Math.max(0, i - 4), i)
    const prev = back.length ? back.reduce((x, y) => x + y, 0) / back.length : floor
    if (env[i] > prev * 3 && env[i] > floor * 10 && env[i] > top * 0.08) {
      let pk = i
      for (let k = i; k < Math.min(env.length, i + 8); k++) if (env[k] > env[pk]) pk = k
      let end = pk
      while (end < env.length && (end - i) * 0.002 < ring && env[end] > env[pk] * 0.03) end++
      const a = Math.max(0, (i - 2) * win)
      out.push({ buf: b, at: a / sr, len: Math.max(0.04, (end - i + 2) * 0.002), gain: Math.min(6, (top * 0.6) / env[pk]) })
      i = end
    } else i++
  }
  return out
}
