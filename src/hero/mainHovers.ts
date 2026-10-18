// TEST route (/hero-hovers.html): the hover lab — the first set plus the ones kept from the second
// (bézier, wireframe, pendulum, billiards without the ball, progressive, spacing, roulette), minus
// the dropped (see DROPPED in HoverLabMore.ts), switching at random (see HoverLab.ts)
import { startHoverLab, SET_A } from './HoverLab'
import { ALIVE } from './HoverLabMore'

void startHoverLab(ALIVE(SET_A), { giz: true })
