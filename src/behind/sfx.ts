// The desk's sound: one audio context for all of it, made at once (suspended — a browser lets no page
// make a sound before the visitor's first click, tap or key) and started on that first gesture.
// Everything plays into `out`, through a gentle limiter, so no pile-up of sounds can ever clip.
let made: { ctx: AudioContext; out: GainNode } | null = null

export function sfx(): { ctx: AudioContext; out: GainNode } {
  if (made) return made
  const ctx = new AudioContext()
  const out = ctx.createGain()
  const lim = ctx.createDynamicsCompressor()
  lim.threshold.value = -10
  lim.knee.value = 6
  lim.ratio.value = 8
  lim.attack.value = 0.002
  lim.release.value = 0.08
  out.connect(lim).connect(ctx.destination)
  const go = () => void ctx.resume()
  for (const e of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(e, go, { once: true })
  made = { ctx, out }
  return made
}
