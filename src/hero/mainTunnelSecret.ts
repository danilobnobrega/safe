import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'

// TEST route (/hero-tunnel-secret.html): the objects of /hero-tunnel-compare.html in chalk, all
// there at once, anywhere on screen — and a few objects hidden still at fixed spots behind them:
// only where a passing object crosses one does it draw the hidden one's outline (the accident
// Danilo liked, now on purpose). No hover colour, no abstract terrain.
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
  tunnelSet: 'final',
  drawnScale: 19,
  drawnEvery: 2,
  secretObjects: [
    { name: 'piece_king_white', x: -0.62, y: 0.32, size: 0.34, rot: 0.4 },
    { name: 'galaxy_watch', x: 0.58, y: -0.28, size: 0.42, rot: 1.1 },
    { name: 'tt_racket_joola', x: 0.22, y: 0.5, size: 0.3, rot: -0.5 },
  ],
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
