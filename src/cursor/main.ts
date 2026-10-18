import '../hero/hero.css'
import { ShaderHero } from '../hero/ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { mountMenu } from '../ui/menu'
import { mountCursorPanel } from './panel'

// TEST route (/cursor.html): the main hero (src/hero/main.ts, as of 2026-10-17) with the cursor
// owned by one module (src/ui/cursor.ts) and, on B, drawn (src/ui/DrawnCursor.ts). The bin lands on
// /cursor-garage.html instead of the garage, so the test runs end to end.
const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
if (!canvas) throw new Error('no #webgl canvas')
const base = import.meta.env.BASE_URL
mountCursorPanel()
const hero = new ShaderHero(canvas, {
  crumbScale: 2,
  revealLetters: true,
  weAreDodge: true,
  crumbPush: true,
  sign: 'matte',
  wormTo: `${base}cursor-garage.html`,
  wormPrefetch: ['garage.glb', 'photos.jpg', 'drawing.png', 'noise.png', 'concrete.png'].map((f) => `${base}garage/${f}`),
  chalkEdge: true,
  drawn: true,
  behind: 'paper',
  letterSet: 'letters_v1',
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true, hrefs: { home: `${base}cursor.html`, about: `${base}cursor-garage.html` } })
