import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

// TEST route (/hero-drawn-hold.html): /hero-drawn.html, but the cursor's holes show the drawn
// crumbs' real colour (like they show the letters), and the cursor pushes the pile only while
// the button is held. /hero-drawn.html: the hero drawn by the garage's hand — the holes' edges in chalk
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
  crumbReveal: true,
  crumbPushHold: true,
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true })
