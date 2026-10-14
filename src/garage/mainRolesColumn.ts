import { Garage } from './Garage'
import { mountMenu } from '../ui/menu'

// TEST route (/garage-roles-column.html): the roles scroll up as one centred, evenly spaced column
// (no arrows), passing behind him — to compare with /garage.html (one at a time, arrow, fade).
//: the garage as /garage.html, but the roles (CEO, CTO… all
// him) aren't written out one at a time with an arrow and a fade: they're a column of text the scroll
// carries up the screen like an ordinary page — passing behind him
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas, { focusScroll: true, rolesColumn: true })
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
