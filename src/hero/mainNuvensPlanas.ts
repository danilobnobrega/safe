// TEST route (/hero-nuvens-planas.html): /hero-hovers-giz.html (the giz sign on the cubes, the cookies)
// and, after "We do things for people", the clouds of white-desert.com drawn in graphite — three flat
// banks rising at their own speeds, the hero softening behind, the mist, all paper, the page (see
// CloudsAfter.ts)
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
  cloudsAfter: 'flat',
  signLab: true,
  signPlace: labPlace,
  noReveal: true,
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
void startHoverLab(CUBOS_SET, { hero, exact: true })
