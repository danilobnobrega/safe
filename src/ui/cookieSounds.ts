// TEST (/cookie-sounds.html): choose the pile's sounds from real recordings (CC0 foley), one take at a
// time. Two sections — falling and hover — each listing every sound and each of its takes; a take
// plays alone (the last one is cut). Pick one sound for cookies and one for crackers in each
// section, then try them on the site (with ?crumbdebug, each crumb flashes the instant it sounds)
import { CrumbSound, FOLEY_GROUPS } from './CrumbSound'

const NAMES: Record<string, string> = {
  impactWood_light: 'madeira, leve',
  impactWood_medium: 'madeira, médio',
  impactGeneric_light: 'objeto duro, leve',
  impactPlate_light: 'prato/louça, leve',
  impactSoft_medium: 'objeto macio, médio',
  impactPlank_medium: 'tábua, médio',
  impactGlass_light: 'vidro, leve',
  footstep_snow: 'esmagado seco (neve)',
  footstep_grass: 'raspado (grama)',
  footstep_carpet: 'arrastado abafado (carpete)',
  toast: 'torrada crocante',
  crunchimpact: 'impacto crocante',
}
const pick: Record<string, string> = { cl: 'impactWood_medium', kl: 'impactWood_medium', ch: 'impactWood_light', kh: 'impactWood_light' }
const snd = new CrumbSound('foley')
const root = document.getElementById('app')!

const top = document.createElement('div')
top.className = 'top'
root.appendChild(top)
const refresh = () => {
  const q = `crumbsound=foley&cl=${pick.cl}&ch=${pick.ch}&kl=${pick.kl}&kh=${pick.kh}`
  top.innerHTML =
    `<div><b>caindo</b> — cookies: ${NAMES[pick.cl]} · crackers: ${NAMES[pick.kl]}</div>` +
    `<div><b>hover</b> — cookies: ${NAMES[pick.ch]} · crackers: ${NAMES[pick.kh]}</div>` +
    `<a href="${import.meta.env.BASE_URL}?${q}">▶ testar no site</a> &nbsp; ` +
    `<a href="${import.meta.env.BASE_URL}?${q}&crumbdebug">▶ testar com diagnóstico (o biscoito pisca quando soa)</a>`
  document.querySelectorAll<HTMLButtonElement>('button.choose').forEach((b) => b.classList.toggle('on', pick[b.dataset.slot!] === b.dataset.group))
}

for (const [as, title, slots] of [
  ['land', 'Caindo (biscoito batendo na mesa / em outro)', [['cl', 'usar nos cookies'], ['kl', 'usar nos crackers']]],
  ['hover', 'Hover (o cursor empurrando)', [['ch', 'usar nos cookies'], ['kh', 'usar nos crackers']]],
] as const) {
  const h = document.createElement('h2')
  h.textContent = title
  root.appendChild(h)
  for (const [group, files] of Object.entries(FOLEY_GROUPS)) {
    const row = document.createElement('div')
    row.className = 'row'
    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = NAMES[group] ?? group
    row.appendChild(name)
    const takes = document.createElement('div')
    takes.className = 'takes'
    files.forEach((f, i) => {
      const b = document.createElement('button')
      b.textContent = `▶ ${i + 1}`
      b.onclick = () => void snd.audition(f, as)
      takes.appendChild(b)
    })
    row.appendChild(takes)
    for (const [slot, label] of slots) {
      const c = document.createElement('button')
      c.className = 'choose'
      c.dataset.slot = slot
      c.dataset.group = group
      c.textContent = label
      c.onclick = () => {
        pick[slot] = group
        refresh()
      }
      row.appendChild(c)
    }
    root.appendChild(row)
  }
}
refresh()
