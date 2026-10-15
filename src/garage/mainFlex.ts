import { Garage } from './Garage'
import { mountMenu } from '../ui/menu'

// TEST route (/garage-flex.html): the garage as /garage.html, but card 1 opens out of his monitor as
// a flexible sheet (WebGL) — leading corner first, edges bowing, a little past and settling — after
// lusion.co's reel card
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas, { focusScroll: true, flexCard: true })
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
