// TEST route (/hero-hovers-giz-grande.html): /hero-hovers-giz.html with one change — the sign at rest
// is the main hero's size
import { startHoverLab } from './HoverLab'
import { GIZ_SET } from './HoverLabGiz'

void startHoverLab(GIZ_SET, { giz3d: true, mainSize: true })
