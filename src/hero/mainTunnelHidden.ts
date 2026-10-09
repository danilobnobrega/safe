import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

// TEST route (/hero-tunnel-hidden.html): the objects of /hero-tunnel-compare.html (Danilo's lab picks,
// same size and number, all there at once) in chalk, anywhere on screen, each a window onto an
// abstract moving chalk terrain hidden behind; the one under the cursor in its real colours.
// (?hidden=0 drops the terrain, ?hover=0 the colour, ?random=0 puts them back on the ring)
// /hero-tunnel-drawn.html: the hero (/) with the photo tunnel's photos replaced by
// Danilo's things, drawn in graphite (see TunnelObjects.ts).
// the hero, drawn by the garage's hand (won 2026-10-07; the test was /hero-drawn-giz-real.html, the
// one before is /hero-classic.html): the sign, "We are" and the crumbs in graphite outline +
// hatching on the paper (see Drawn.ts), the door cubes outlined; the cursor's holes show the
// wordmark in other bodies, edged in chalk; the cursor pushes the crumbs (they stay chalk); the
// toaster drawn, its slices drawn too, the one under the cursor turning into real toast. The fall
// through the wormhole lands on the garage page (its files warmed while the fall plays)
const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')
const base = import.meta.env.BASE_URL
const hero = new ShaderHero(canvas, {
  crumbScale: 2,
  revealLetters: true,
  weAreDodge: true,
  crumbPush: true,
  sign: 'matte',
  wormTo: `${base}garage.html`,
  wormPrefetch: ['garage.glb', 'photos.jpg', 'drawing.png', 'noise.png', 'concrete.png'].map((f) => `${base}garage/${f}`),
  chalkEdge: true,
  drawn: true,
  tunnelObjects: 'drawn',
  tunnelRandom: new URLSearchParams(location.search).get('random') !== '0',
  tunnelHidden: new URLSearchParams(location.search).get('hidden') === '0' ? undefined : 'abstract',
  tunnelSet: 'final',
  drawnScale: 19,
  drawnEvery: 2,
  tunnelHoverColor: new URLSearchParams(location.search).get('hover') !== '0',
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
