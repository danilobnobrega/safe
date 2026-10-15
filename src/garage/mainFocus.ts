import { Garage } from './Garage'
import { mountMenu } from '../ui/menu'

// TEST route (/garage-focus.html): scrolling closes in on the man at the desk instead of
// scrolling the room away
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas, { focusScroll: true, rolesCylinder: true }) // the roles on the drum (was /garage-roles-cylinder.html)
// the same toaster as the home: drawn, the slice under the cursor turning into real toast
mountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })
