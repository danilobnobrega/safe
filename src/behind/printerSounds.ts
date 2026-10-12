// TEST (/printer-sounds.html): every printer sound side by side, each played over the print's real
// timing (the same wait + feed as the desk's printer), with a link to the desk using it
import { PrinterSound, SOUND_KINDS } from './PrinterSound'

const NAMES: Record<string, string> = {
  silly: 'kazoo + apito + sininho',
  chip: 'videogame 8-bit',
  modem: 'internet discada',
  cartoon: 'motorzinho de desenho + buzina',
  synth: 'o atual (sintetizado)',
  synth2: 'o atual, mais agudo e apressado',
  dotmatrix: 'matricial antiga',
  real: 'jato de tinta (gravação real)',
  real2: 'jato de tinta 2 (gravação real)',
  laser: 'laser (gravação real)',
}
const WAIT = 0.35 + 0.3 // PRINT_WAIT + PRINT_LAG
const FEED = 1.7

const root = document.getElementById('app')!
const player = new PrinterSound()
for (const [group, kinds] of Object.entries(SOUND_KINDS)) {
  const h = document.createElement('h2')
  h.textContent = group
  root.appendChild(h)
  for (const k of kinds) {
    const row = document.createElement('div')
    row.className = 'row'
    const b = document.createElement('button')
    b.textContent = '▶ ' + (NAMES[k] ?? k)
    b.onclick = () => {
      player.kind = k
      player.play(WAIT, FEED)
    }
    const a = document.createElement('a')
    a.href = `${import.meta.env.BASE_URL}hero-paper.html?sound=${k}`
    a.textContent = `na mesa: /hero-paper.html?sound=${k}`
    row.append(b, a)
    root.appendChild(row)
  }
}
