// TEST route (/hero-hovers-giz-cubos.html): /hero-hovers-giz.html exactly — the sign's size and place,
// "We are", the paper, the strokes, the hovers, the fonts — standing on the hero's cubes, with the
// cookies, no test labels. The hero builds its own sign where the lab draws it (labPlace), so when the
// cubes turn it takes over from the same spot; after "We do things for people" the page scrolls on
import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { labPlace, startHoverLab } from './HoverLab'
import { CUBOS_SET } from './HoverLabFun'

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
  scrollAfter: true,
  signLab: true,
  signPlace: labPlace,
  noReveal: true,
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
void startHoverLab(CUBOS_SET, { hero, exact: true })
