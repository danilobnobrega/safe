// TEST route (/vitrine.html): the home rethought (2026-10-19) — the giz hero (/hero-hovers-giz.html, on
// its cubes, with the cookies), and after "We do things for people" the page scrolls into section after
// section, each one as if lifted from a different award-winning site (see Vitrine.ts)
import '../hero/hero.css'
import { ShaderHero } from '../hero/ShaderHero'
import { mountCookieBanner } from '../ui/cookieBanner'
import { labPlace, startHoverLab } from '../hero/HoverLab'
import { CUBOS_SET } from '../hero/HoverLabFun'
import { Vitrine } from './Vitrine'
import { Gelato } from './sections/Gelato'
import { Casa } from './sections/Casa'
import { Toys } from './sections/Toys'
import { Bank } from './sections/Bank'
import { Festival } from './sections/Festival'
import { Cosmetics } from './sections/Cosmetics'
import { Jewel } from './sections/Jewel'

const Q = new URLSearchParams(location.search)
// (testing) ?direto: no hero, straight into the sections; ?sec=<id>: jump to that one
if (Q.has('direto') || Q.has('sec')) {
  document.getElementById('stage')!.remove()
  document.getElementById('hovers')!.remove()
  document.getElementById('after')!.style.marginTop = '0'
  for (const el of [document.documentElement, document.body]) {
    el.style.height = 'auto'
    el.style.overflow = 'visible'
  }
  const id = Q.get('sec')
  if (id) requestAnimationFrame(() => document.getElementById(`s-${id}`)?.scrollIntoView())
} else startHero()

function startHero(): void {
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
}

const sec = (id: string) => document.getElementById(id)!
new Vitrine([new Gelato(sec('s-gelato')), new Casa(sec('s-casa')), new Toys(sec('s-toys')), new Bank(sec('s-bank')), new Festival(sec('s-festival')), new Cosmetics(sec('s-cosmetics')), new Jewel(sec('s-jewel'))])
