import { Garage } from '../garage/Garage'
import { mountMenu } from '../ui/menu'
import { mountCursorPanel } from './panel'

// TEST route (/cursor-garage.html): the garage (as /garage.html, src/garage/mainFocus.ts) with the
// cursor test of /cursor.html
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
const base = import.meta.env.BASE_URL
new Garage(canvas, { focusScroll: true, rolesCylinder: true })
mountCursorPanel()
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true, hrefs: { home: `${base}cursor.html`, about: `${base}cursor-garage.html` } })
