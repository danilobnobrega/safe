import { Garage } from './Garage'
import { mountMenu } from '../ui/menu'

// TEST route (/garage-roles-cylinder.html): /garage-roles-column.html taken further — the column of
// roles is printed round a drum lying on its side that the scroll turns: each role comes nearest the
// camera as it crosses his head's height and curls away above and below — still behind him
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas, { focusScroll: true, rolesCylinder: true })
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
