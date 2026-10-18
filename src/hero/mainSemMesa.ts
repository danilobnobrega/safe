// TEST route (/hero-sem-mesa.html): the home WITHOUT the desk — the scroll turns the cubes until they lock
// on "We do things for people", then the page scrolls on normally (placeholder sections below)
import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

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
  scrollAfter: true, // no desk: after "We do things for people" the page scrolls on
  // the letters' photos: the first set (wool, ice cream, foam, fur, foil balloon, cellophane — Danilo, 2026-10-16)
  letterSet: 'letters_v1',
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
