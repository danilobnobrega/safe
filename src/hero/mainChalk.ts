import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

// TEST route (/hero-chalk.html): the hero as it is, but the reveal holes' edges drawn in the
// garage's chalk — a stroke on the cut + hatching outside it as its shadow. ?orange adds the
// garage's orange where the cursor has just been, cooling to chalk
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
  chalkOrange: new URLSearchParams(location.search).has('orange'),
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
// the toaster in chalk too: drawn slices at rest, the real one under the cursor (as /hero-drawn-grab)
mountMenu({ drawn: true, drawnToasts: 'hover' })
