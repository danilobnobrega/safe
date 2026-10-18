// TEST route (/hero-hovers-pixels.html): only the progressive load, to find its pixels — the letters
// as /hero-hovers-giz.html draws them, a list on top to pick the pixels' look, the scans, the speed and
// the closing soft focus; "auto" reloads the letters on their own, over and over, no cursor needed
import { startHoverLab } from './HoverLab'
import { PROG, progressive } from './HoverLabGiz'

const LOOKS: [string, string, number][] = [
  ['mosaic', 'mosaico', 0],
  ['art', 'pixel art', 1],
  ['bit', '1-bit', 2],
  ['dither', 'dither', 3],
  ['halftone', 'retícula', 4],
  ['tiles', 'azulejos', 5],
  ['voxel', 'cubos de giz', 6],
  ['cubes', 'cubinhos soltos', 7],
]
const set = Object.fromEntries(LOOKS.map(([n, t, m]) => [n, () => progressive(n, t, m)]))
PROG.auto = true
const SCAN_SETS: [string, number[]][] = [
  ['grossos', [0.2, 0.1, 0.05]],
  ['médios', [0.1, 0.05, 0.026]],
  ['finos', [0.05, 0.026, 0.014]],
  ['1 passada', [0.06]],
  ['5 passadas', [0.16, 0.1, 0.06, 0.035, 0.02]],
]
const SPEEDS: [string, number][] = [
  ['rápido', 0.22],
  ['normal', 0.42],
  ['lento', 0.8],
]
const FOCUS: [string, number][] = [
  ['sem foco', 0],
  ['foco curto', 0.3],
  ['foco longo', 0.7],
]
void startHoverLab(set, {
  giz3d: true,
  picker: true,
  letras: 'off',
  always: () => PROG.auto,
  pickGroups: [['estilo', LOOKS.map(([n]) => n)]],
  extraButtons: [
    ['passadas', SCAN_SETS.map(([l, v]) => [l, () => PROG.scans === v, () => (PROG.scans = v)])],
    ['velocidade', SPEEDS.map(([l, v]) => [l, () => PROG.scanT === v, () => (PROG.scanT = v)])],
    ['final', FOCUS.map(([l, v]) => [l, () => PROG.focusT === v, () => (PROG.focusT = v)])],
    ['repetir', [['auto', () => PROG.auto, () => (PROG.auto = !PROG.auto)]]],
  ],
})
PROG.scans = SCAN_SETS[1][1]
