// /garage-classic.html — the garage as it was before the focus version won (2026-10-07)
import { Garage } from './Garage'
import { mountMenu } from '../ui/menu'

const canvas = document.querySelector<HTMLCanvasElement>('#garage')
if (!canvas) throw new Error('no #garage canvas')
new Garage(canvas)
mountMenu()
