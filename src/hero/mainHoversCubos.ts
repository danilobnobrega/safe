// TEST route (/hero-hovers-cubos.html): /hero-hovers-giz-grande.html inside the real hero — the cubes
// (and the scroll that turns them; no desk — after "We do things for people" the page scrolls on,
// as /hero-sem-mesa.html), the sign where the main page
// has it, the cookies; "We are" stays still, as in the lab. The lab's 3D chalk letters are "GENERIC."
// while the doors are shut; once they move, the hero's own sign takes over (see followHero)
import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { startHoverLab } from './HoverLab'
import { GIZ_SET } from './HoverLabGiz'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')
const base = import.meta.env.BASE_URL
const hero = new ShaderHero(canvas, {
  crumbScale: 2,
  crumbPush: true,
  sign: 'matte',
  wormTo: `${base}garage.html`,
  wormPrefetch: ['garage.glb', 'photos.jpg', 'drawing.png', 'noise.png', 'concrete.png'].map((f) => `${base}garage/${f}`),
  chalkEdge: true,
  drawn: true,
  scrollAfter: true, // no desk: after "We do things for people" the page scrolls on (as /hero-sem-mesa.html)
  signLab: true,
  weAreHigh: true, // still, at the main page's height
  noReveal: true, // the hovers instead of the liquid holes
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
void startHoverLab(GIZ_SET, { hero })
