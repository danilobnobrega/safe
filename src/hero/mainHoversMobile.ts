// TEST route (/hero-hovers-mobile.html): /hero-hovers-cubos.html for the phone — the finger dragged
// over the sign is the cursor (a swipe elsewhere scrolls), the hovers switch on their own, the tilt of
// the phone shows the letters' depth and pulls them toward the low side, and turning the phone
// sideways drops them to the new floor (see MOBILE in HoverLab.ts, src/ui/tilt.ts).
// /hero-hovers-cubos.html: /hero-hovers-giz-grande.html inside the real hero — the cubes
// (and the scroll that turns them; no desk — after "We do things for people" the page scrolls on,
// as /hero-sem-mesa.html), the sign where the main page
// has it, the cookies; "We are" stays still, as in the lab. The lab's 3D chalk letters are "GENERIC."
// while the doors are shut; once they move, the hero's own sign takes over (see followHero)
import './hero.css'
import { ShaderHero } from './ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { g3, startHoverLab } from './HoverLab'
import { TILT } from '../ui/tilt'
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
  scrollAfter: true, // no desk: after "We do things for people" the page scrolls on (as /hero-sem-mesa.html)
  signLab: true,
  weAreHigh: true, // still, at the main page's height
  noReveal: true, // the hovers instead of the liquid holes
})
mountCookieBanner(hero.crumbs, () => hero.unlock())
// the hovers: grid, gravity and spacing swapped for split-flap, whirlwind and jelly (2026-10-18)
void startHoverLab(CUBOS_SET, { hero, mobile: true })
// the phone's tilt shows the depth: the sign (letters and "We are") turns a little in 3D toward the low
// side — the cubes stay put (moving the camera showed their edges)
const turn = { x: 0, y: 0 }
const spin = () => {
  if (g3) {
    turn.y += (TILT.x * 0.32 - turn.y) * 0.12
    turn.x += (TILT.y * 0.24 - turn.x) * 0.12
    g3.root.rotation.set(turn.x, turn.y, 0)
  }
  requestAnimationFrame(spin)
}
requestAnimationFrame(spin)
