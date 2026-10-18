import { configureCursor, cursorState, onCursorChange } from '../ui/cursor'

// TEST (/cursor.html, /cursor-garage.html): the readout of who is asking for which cursor, and the
// switch between the native cursor (A: the one owner only) and the drawn one (B: the owner + drawn).
// The choice carries from page to page (sessionStorage); C toggles it too.

const KEY = 'generic-cursor-test'

function readMode(): 'native' | 'drawn' {
  try {
    return sessionStorage.getItem(KEY) === 'drawn' ? 'drawn' : 'native'
  } catch {
    return 'native'
  }
}

function saveMode(m: 'native' | 'drawn'): void {
  try {
    sessionStorage.setItem(KEY, m)
  } catch {
    /* private window: the choice just doesn't carry */
  }
}

const CSS = `
.cur-panel { position: fixed; left: 16px; top: 16px; z-index: 60; width: 248px;
  background: #121212; color: #efede6; font: 400 11px/1.5 "IBM Plex Mono", ui-monospace, monospace;
  padding: 10px 12px; border: 1px solid #efede633; }
.cur-panel h6 { font: inherit; font-weight: 500; margin: 0 0 6px; letter-spacing: .04em; }
.cur-panel .modes { display: flex; gap: 6px; margin-bottom: 8px; }
.cur-panel button { font: inherit; background: transparent; color: #efede6; border: 1px solid #efede6;
  padding: 3px 7px; flex: 1; }
.cur-panel button.on { background: #efede6; color: #121212; }
.cur-panel ul { list-style: none; padding: 0; margin: 0; }
.cur-panel li { display: flex; justify-content: space-between; opacity: .5; }
.cur-panel li.win { opacity: 1; }
.cur-panel li.win::before { content: '> '; }
.cur-panel .none { opacity: .5; }
.cur-panel .hint { opacity: .5; margin-top: 8px; }
`

export function mountCursorPanel(): void {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)

  const el = document.createElement('div')
  el.className = 'cur-panel'
  el.innerHTML = `<h6>CURSOR — teste</h6>
    <div class="modes"><button data-m="native">A · nativo</button><button data-m="drawn">B · desenhado</button></div>
    <div>pedidos (prioridade):</div><ul></ul>
    <div class="hint">C alterna · menu > página · botões do DOM > tudo</div>`
  document.body.appendChild(el)
  const list = el.querySelector('ul')!
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')]

  let mode = readMode()
  const set = (m: 'native' | 'drawn') => {
    mode = m
    saveMode(m)
    configureCursor({ managed: true, drawn: m === 'drawn' })
    for (const b of buttons) b.classList.toggle('on', b.dataset.m === m)
  }
  for (const b of buttons) b.addEventListener('click', (e) => {
    e.stopPropagation() // the garage opens a card on any click
    set(b.dataset.m as 'native' | 'drawn')
  })
  window.addEventListener('keydown', (e) => {
    if (e.key === 'c' || e.key === 'C') set(mode === 'drawn' ? 'native' : 'drawn')
  })

  const render = () => {
    const s = cursorState()
    if (!s.owners.length) {
      list.innerHTML = '<li class="win none">ninguém — seta padrão</li>'
      return
    }
    list.innerHTML = s.owners
      .sort((a, b) => b[1].priority - a[1].priority)
      .map(([o, r]) => `<li class="${o === s.winner ? 'win' : ''}"><span>${o}</span><span>${r.value} (${r.priority})</span></li>`)
      .join('')
  }
  onCursorChange(render)
  set(mode)
  render()
}
