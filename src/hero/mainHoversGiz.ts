// TEST route (/hero-hovers-giz.html): the hover lab with the letters in the main hero's chalk ("giz")
// look all the time — 3D extruded glyphs (GizLetters.ts) following the 2D engine, every font as TTF;
// the hovers that drew the letter themselves are redone for 3D (HoverLabGiz.ts)
import { startHoverLab } from './HoverLab'
import { CUBOS_SET } from './HoverLabFun'

// the same hovers Danilo picked for /hero-hovers-cubos.html (2026-10-18)
void startHoverLab(CUBOS_SET, { giz3d: true })
