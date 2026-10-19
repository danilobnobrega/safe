// TEST route (/hero-nuvens-volume.html): /hero-hovers-giz.html (the giz sign on the cubes, the cookies)
// and, after "We do things for people", cumulus in 3D inside the cubes' scene, drawn like the cubes:
// the deck rises in front of them while the camera sinks into it, then the mist, all paper, the page
// (see CloudsAfter.ts)
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
  cloudsAfter: 'volume',
  signLab: true,
  signPlace: labPlace,
  noReveal: true,
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
void startHoverLab(CUBOS_SET, { hero, exact: true })
