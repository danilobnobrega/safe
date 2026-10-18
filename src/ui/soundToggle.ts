// TEMPORARY (the elevator routes): a plain sound on/off button, bottom left. The site's sounds don't all
// go through one bus (the lamp and the printer keep their own audio contexts), so this one keeps hold of
// EVERY audio context the page makes, from before any is made (import it first): off suspends them all
// and holds them suspended (a context asked to resume on the next click stays quiet); on resumes them.
// The choice is remembered (per browser) across pages and visits. Sound starts on, as agreed.
const KEY = 'generic-sound'
let on = true
try {
  on = localStorage.getItem(KEY) !== 'off'
} catch {
  // (no storage: on)
}
const ctxs = new Set<AudioContext>()
const Native = window.AudioContext
const nativeResume = Native.prototype.resume

class Held extends Native {
  constructor(opts?: AudioContextOptions) {
    super(opts)
    ctxs.add(this)
    if (!on) void this.suspend()
  }
  override resume(): Promise<void> {
    return on ? nativeResume.call(this) : Promise.resolve()
  }
}
window.AudioContext = Held as unknown as typeof AudioContext
if (location.search.includes('sounddebug')) (window as unknown as { __sound: () => string[] }).__sound = () => [...ctxs].map((c) => c.state)

function set(v: boolean): void {
  on = v
  try {
    localStorage.setItem(KEY, v ? 'on' : 'off')
  } catch {
    // (not remembered)
  }
  for (const c of ctxs) void (v ? nativeResume.call(c) : c.suspend())
  label()
}

const btn = document.createElement('button')
btn.setAttribute('style', 'position:fixed;left:14px;bottom:14px;z-index:80;font:500 12px/1 "IBM Plex Mono",Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;padding:9px 12px;border:1px solid currentColor;background:rgba(239,238,231,.9);color:#121212;cursor:pointer')
const label = () => (btn.textContent = on ? 'sound: on' : 'sound: off')
label()
for (const ev of ['pointerdown', 'pointerup']) btn.addEventListener(ev, (e) => e.stopPropagation())
btn.addEventListener('click', (e) => {
  e.stopPropagation()
  set(!on)
})
const mount = () => document.body.appendChild(btn)
if (document.body) mount()
else window.addEventListener('DOMContentLoaded', mount, { once: true })

export {}
