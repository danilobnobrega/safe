// /hero-classic.html — the hero as it was before the chalk version won (2026-10-07)
import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')

// the hero: the reveal holes show the wordmark in other bodies, "We are" dodges the cursor, the
// cursor knocks the cookie pile around, matte sign — and the fall through the wormhole lands on
// the garage page (its files warmed while the fall plays)
const base = import.meta.env.BASE_URL
const hero = new ShaderHero(canvas, {
  crumbScale: 2,
  revealLetters: true,
  weAreDodge: true,
  crumbPush: true,
  sign: 'matte',
  wormTo: `${base}garage.html`,
  wormPrefetch: ['garage.glb', 'photos.jpg', 'drawing.png', 'noise.png', 'concrete.png'].map((f) => `${base}garage/${f}`),
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu()
