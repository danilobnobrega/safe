import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

// TEST route (/hero-drawn-giz-rise.html): /hero-drawn-giz.html, but the slice under the cursor takes
// on its real colour through a region that grows ('rise', see Toaster.makeDrawn). /hero-drawn-giz.html: /hero-drawn.html with the crumbs always chalk (the cursor only
// pushes them, never shows their colour); the toaster's slices always drawn too.
// /hero-drawn.html: the hero drawn by the garage's hand — the holes' edges in chalk
// (as /hero-chalk.html), the sign, "We are" and the crumbs in graphite outline + hatching on the
// paper, the door cubes outlined (see Drawn.ts)
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
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true, drawnToasts: 'rise' })
