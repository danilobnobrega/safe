// TEST (/hero-hovers-mobile.html): how the phone is tilted in the hand (the gyroscope's
// deviceorientation), as a direction on the screen: TILT.x > 0 = the right side is lower, TILT.y > 0
// = the bottom is lower, each -1..1 (about 30° from the way it's held). "The way it's held" follows
// slowly, so a phone held at any angle reads level after a few seconds; a quick tilt reads at once.
// iOS only lets a page read the sensor after it asks, from a tap: the first tap anywhere (the cookie
// banner, in practice) asks. Sensors need a secure page (https) — plain http over the LAN reads nothing.
//   ?tiltsim  (desktop) the keys I J K L tilt (up left down right)
export const TILT = { x: 0, y: 0, on: false }

let b0 = NaN
let g0 = NaN
let started = false
const clamp = (v: number) => Math.max(-1, Math.min(1, v))

function read(e: DeviceOrientationEvent): void {
  if (e.beta == null || e.gamma == null) return
  TILT.on = true
  if (Number.isNaN(b0)) {
    b0 = e.beta
    g0 = e.gamma
  }
  // the hold angle drifts after the phone slowly (a ~6 s lag)
  b0 += (e.beta - b0) * 0.004
  g0 += (e.gamma - g0) * 0.004
  const gx = (e.gamma - g0) / 30
  const gy = (e.beta - b0) / 30
  // the device's axes onto the screen's, however the screen is turned
  const a = ((screen.orientation?.angle ?? 0) * Math.PI) / 180
  TILT.x = clamp(gx * Math.cos(a) + gy * Math.sin(a))
  TILT.y = clamp(gy * Math.cos(a) - gx * Math.sin(a))
}

function listen(): void {
  if (started) return
  started = true
  addEventListener('deviceorientation', read)
}

/** start reading; on iOS the permission is asked on the first tap */
export function startTilt(): void {
  const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
  if (D?.requestPermission) {
    const ask = () => {
      D.requestPermission!()
        .then((r) => r === 'granted' && listen())
        .catch(() => undefined)
      removeEventListener('click', ask, true)
      removeEventListener('touchend', ask, true)
    }
    addEventListener('click', ask, true)
    addEventListener('touchend', ask, true)
  } else listen()
  if (location.search.includes('tiltsim')) {
    const k = new Set<string>()
    addEventListener('keydown', (e) => k.add(e.key))
    addEventListener('keyup', (e) => k.delete(e.key))
    const step = () => {
      const tx = (k.has('l') ? 1 : 0) - (k.has('j') ? 1 : 0)
      const ty = (k.has('k') ? 1 : 0) - (k.has('i') ? 1 : 0)
      TILT.x += (tx - TILT.x) * 0.1
      TILT.y += (ty - TILT.y) * 0.1
      TILT.on = true
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
}
