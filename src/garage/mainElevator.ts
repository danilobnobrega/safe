// TEST route (/garage-elevator.html): the garage with the menu as an elevator (src/ui/Elevator.ts)
import '../ui/soundToggle' // (first: it has to see every audio context made)
import { Garage } from './Garage'
import { mountElevator } from '../ui/Elevator'

// TEST route (/garage-focus.html): scrolling closes in on the man at the desk instead of
// scrolling the room away
const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas, { focusScroll: true, rolesCylinder: true }) // the roles on the drum (was /garage-roles-cylinder.html)
// the same toaster as the home: drawn, the slice under the cursor turning into real toast
mountElevator('1')
