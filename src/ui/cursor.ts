import { DrawnCursor, type CursorTheme } from './DrawnCursor'

/**
 * The one owner of the cursor. Every part of a page that wants a cursor asks for it here, under its
 * own name and a priority (the menu over the page, the DOM's buttons over both); the highest live
 * request wins, and the result is written once, when it changes.
 *
 * Off by default: until `configureCursor({ managed: true })` a request is written straight where
 * that part used to write it (the toaster on <html>, the rest on <body>), every call, as before —
 * the pages that don't opt in behave exactly as they did. TEST (/cursor.html, /cursor-garage.html).
 */

type Request = { value: string; priority: number }

const requests = new Map<string, Request>()
let managed = false
let drawn: DrawnCursor | null = null
let shown = ''
let pageTheme: CursorTheme = 'paper'
let onChange: (() => void) | null = null

const CLICKABLE = 'a[href],button,select,label,input,[role=button],[data-cursor=pointer]'
// B: the drawn cursor is set on <html> (DrawnCursor); everything under it takes that one
const DRAWN_CSS = 'html.cursor-drawn * { cursor: inherit !important; }'

export const PRIORITY = { page: 1, menu: 2, dom: 3 } as const

export function setCursor(owner: string, value: string, priority: number = PRIORITY.page): void {
  if (!managed) {
    ;(owner === 'toaster' ? document.documentElement : document.body).style.cursor = value
    return
  }
  const had = requests.get(owner)
  if (!value) {
    if (!had) return
    requests.delete(owner)
  } else {
    if (had && had.value === value && had.priority === priority) return
    requests.set(owner, { value, priority })
  }
  apply()
}

/** the ground the page's canvas draws on — the drawn cursor inverts on the dark */
export function setCursorTheme(theme: CursorTheme): void {
  pageTheme = theme
  drawn?.setPageTheme(theme)
}

export function configureCursor(opts: { managed?: boolean; drawn?: boolean }): void {
  if (opts.managed !== undefined && opts.managed !== managed) {
    managed = opts.managed
    if (managed) {
      // whatever the parts wrote the old way is cleared: from here only apply() writes
      document.body.style.cursor = ''
      document.documentElement.style.cursor = ''
      window.addEventListener('pointerover', onDomOver)
    } else window.removeEventListener('pointerover', onDomOver)
  }
  if (opts.drawn !== undefined) {
    if (opts.drawn && !drawn) {
      const style = document.createElement('style')
      style.id = 'cursor-drawn-css'
      style.textContent = DRAWN_CSS
      document.head.appendChild(style)
      drawn = new DrawnCursor(pageTheme)
    }
    document.documentElement.classList.toggle('cursor-drawn', opts.drawn)
    drawn?.setEnabled(opts.drawn)
  }
  apply(true)
}

/** the current requests and which one wins (for the test page's readout) */
export function cursorState(): { owners: [string, Request][]; winner: string | null; drawn: boolean } {
  const owners = [...requests.entries()]
  return { owners, winner: winnerOwner(), drawn: !!drawn?.enabled }
}

export function onCursorChange(fn: () => void): void {
  onChange = fn
}

function winnerOwner(): string | null {
  let best: string | null = null
  let bp = -Infinity
  for (const [owner, r] of requests) {
    if (r.priority > bp) {
      bp = r.priority
      best = owner
    }
  }
  return best
}

function apply(force = false): void {
  const w = winnerOwner()
  const value = w ? requests.get(w)!.value : ''
  if (value !== shown || force) {
    shown = value
    // A: the system's own shape; B: the drawn one owns <html>'s cursor
    if (drawn?.enabled) drawn.setShape(value)
    else document.documentElement.style.cursor = value
  }
  onChange?.()
}

// the DOM's own clickables (the cookie bar's buttons, links): native CSS already shows them a hand,
// but under B everything inherits <html>'s drawn cursor — so they ask for it like any other part
function onDomOver(e: PointerEvent): void {
  const el = e.target instanceof Element ? e.target : null
  setCursor('dom', el?.closest(CLICKABLE) ? 'pointer' : '', PRIORITY.dom)
}
