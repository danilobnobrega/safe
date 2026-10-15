// TEST (/desk-sounds.html): every desk sound, each take on its own button; pick a take per sound,
// then hear them on the desk (the link carries the picks)
import { DeskSound, DESK_SOUNDS } from './DeskSound'
import { TOSSES } from './PaperThrow'

const snd = new DeskSound()
const root = document.getElementById('app')!
const top = document.createElement('div')
top.className = 'top'
root.appendChild(top)
const refresh = () => {
  const q = DESK_SOUNDS.map((s) => `ds_${s.ev}=${snd.take[s.ev]}`).join('&')
  void q
  top.innerHTML = `<div>synth2 = a voz da impressora · realista = o mais real possível · realista sarcástico = real, mas sério demais</div>`
  document.querySelectorAll<HTMLButtonElement>('button.pick').forEach((b) => b.classList.toggle('on', snd.take[b.dataset.ev!] === b.dataset.take))
}
for (const s of DESK_SOUNDS) {
  const row = document.createElement('div')
  row.className = 'row'
  const name = document.createElement('div')
  name.className = 'name'
  name.textContent = s.name
  row.appendChild(name)
  const btns = document.createElement('div')
  btns.className = 'takes'
  for (const [tk, kind] of s.takes) {
    if (s.arg) {
      for (const arg of s.arg) {
        const b = document.createElement('button')
        b.textContent = `▶ ${kind}: ${{ floor: 'no chão', desk: 'na mesa', printer: 'na impressora', rim: 'na borda do cesto' }[arg] ?? arg}`
        b.onclick = () => snd.play(s.ev, { take: tk, arg, amount: 0.8 })
        btns.appendChild(b)
      }
      const hp = document.createElement('button')
      hp.className = 'pick'
      hp.dataset.ev = s.ev
      hp.dataset.take = tk
      hp.textContent = `usar ${kind}`
      hp.onclick = () => {
        snd.take[s.ev] = tk
        refresh()
      }
      btns.appendChild(hp)
      continue
    }
    const b = document.createElement('button')
    b.textContent = `▶ ${tk.toUpperCase()} · ${kind}`
    b.onclick = () => snd.play(s.ev, { take: tk, amount: 0.8, rate: 1 })
    btns.appendChild(b)
    const p = document.createElement('button')
    p.className = 'pick'
    p.dataset.ev = s.ev
    p.dataset.take = tk
    p.textContent = `usar ${tk.toUpperCase()}`
    p.onclick = () => {
      snd.take[s.ev] = tk
      refresh()
    }
    btns.appendChild(p)
  }
  row.appendChild(btns)
  root.appendChild(row)
}
refresh()

// TEST: the lamp's rusty turn as real recordings (CC0 from OpenGameArt; valve = CC-BY 4.0, needs credit)
const CREAK: [string, string][] = [
  ['creaky_door_hinge.wav', 'dobradiça rangendo'],
  ['iron_door_0.ogg', 'porta de ferro'],
  ['metal_open_01.ogg', 'metal abrindo'],
  ['door_open_01.ogg', 'porta abrindo'],
  ['wood_squeak_01.ogg', 'rangido 1'],
  ['wood_squeak_02.ogg', 'rangido 2'],
  ['metal_spring_01.ogg', 'mola 1'],
  ['metal_spring_02.ogg', 'mola 2'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((i): [string, string] => [`qubodup-DoorOpen0${i}.ogg`, `porta ${i}`]),
  ['valve.mp3', 'válvula enferrujada (CC-BY)'],
]
const crow = document.createElement('div')
crow.className = 'row'
crow.innerHTML = `<div class="name">luminária: gravações reais</div>`
const cbtns = document.createElement('div')
cbtns.className = 'takes'
let playing: HTMLAudioElement | null = null
for (const [file, label] of CREAK) {
  const b = document.createElement('button')
  b.textContent = `▶ ${label}`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/creak/${file}`)
    void playing.play()
  }
  cbtns.appendChild(b)
}
crow.appendChild(cbtns)
root.appendChild(crow)

// TEST: more rusty squeaks — small mechanisms (hinges, clamps, chairs, taps, cranks), CC0 from Freesound
const FS: [string, string, number][] = [
  ['585325', "rusty_hinge assort.wav", 4.0],
  ['335752', "painful_squeek_rust.wav", 2.9],
  ['742600', "Squeaky metal screwed 01", 7.5],
  ['751078', "Squeaky Metals", 7.0],
  ['445021', "hideous squeak", 3.2],
  ['175410', "Moaning Chair.aif", 1.4],
  ['678400', "chair squeak.wav", 3.9],
  ['786898', "Long squeaking metal clamp", 7.8],
  ['786899', "Squeaking metal clamp", 11.0],
  ['588510', "metalDoorSqueak.wav", 1.6],
  ['554248', "Rotate Mirror 1.wav", 0.3],
  ['667395', "squeaky handle", 2.2],
  ['787410', "Squeaky Cupboard", 4.9],
  ['395041', "Turn crank_Squeak_Old_Metal_Machine_Loop.wav", 7.4],
  ['241602', "squeak speed up slow down.wav", 14.4],
  ['441096', "Squeak Rusty Metal Water Tap", 7.0],
  ['248021', "Rusty Creak.wav", 6.5],
  ['81268', "FX-rusty hinge-090720.wav", 8.8],
  ['446502', "13-Bisagra_Ox.wav", 2.3],
  ['109831', "TubeSqueak09_NTG3.wav", 0.7],
  ['137030', "Squeak_two.wav", 0.6],
  ['339184', "squeak_01.wav", 6.8],
  ['700706', "Metal Door Squeaking 9 (Medium)", 2.3],
  ['787709', "Squeaky Door Handle", 13.1],
  ['542124', "rusty things .mp3", 9.4],
]
const frow = document.createElement('div')
frow.className = 'row'
frow.innerHTML = `<div class="name">luminária: rangidos (Freesound CC0)</div>`
const fbtns = document.createElement('div')
fbtns.className = 'takes'
FS.forEach(([id, title, dur], n) => {
  const b = document.createElement('button')
  b.textContent = `▶ ${n + 1} · ${title} (${dur}s)`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/creak/fs/${id}.mp3`)
    void playing.play()
  }
  fbtns.appendChild(b)
})
frow.appendChild(fbtns)
root.appendChild(frow)

// TEST: raw material for a Pixar-style lamp — the springs of a real Anglepoise (Reid Andreae / sandyrb,
// Freesound, CC BY: needs credit) and a lamp-spring "boing" (cribbler, CC0)
const SPRINGS: [string, string][] = [
  ...[45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55].map((n, i): [string, string] => [`909${n}`, `mola Anglepoise ${i + 1}`]),
  ['376513', 'boing de mola de luminária'],
]
const srow = document.createElement('div')
srow.className = 'row'
srow.innerHTML = `<div class="name">luminária: molas de uma Anglepoise real (matéria-prima)</div>`
const sbtns = document.createElement('div')
sbtns.className = 'takes'
for (const [id, label] of SPRINGS) {
  const b = document.createElement('button')
  b.textContent = `▶ ${label}`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/creak/spring/${id}.mp3`)
    void playing.play()
  }
  sbtns.appendChild(b)
}
srow.appendChild(sbtns)
root.appendChild(srow)

// TEST: the lamp's wobble after the hover's hit — things that squeak as they swing back and forth
// (swings, bed springs, gates, a handle…), CC0 from Freesound
const SWING: [string, string, number][] = [
  ['278861', "Swing.WAV", 24.0],
  ['610413', "clean_swing_squeaking.wav", 21.6],
  ['593634', "Swing.wav", 12.5],
  ['387896', "sfx_swing_hojdacka.wav", 16.6],
  ['594145', "Swing Sound.wav", 24.3],
  ['320478', "swing squeak", 11.5],
  ['502529', "Squeaking - Plastic Solar Toy", 6.1],
  ['767354', "Official Bedspring Test O.O", 3.6],
  ['450623', "Squeaky Bed Action", 8.2],
  ['119796', "Squeaky Mattress.wav", 18.5],
  ['615963', "noisy door handle (nr) looped pspvw 1b.wav", 4.8],
  ['57641', "08 spring.wav", 0.8],
  ['84526', "0005_Crystal Lamp with Swing Front.wav", 3.4],
  ['593179', "Creaking and Swinging Gate.wav", 6.8],
]
const wrow = document.createElement('div')
wrow.className = 'row'
wrow.innerHTML = `<div class="name">luminária: nhec-nhec de coisa balançando</div>`
const wbtns = document.createElement('div')
wbtns.className = 'takes'
SWING.forEach(([id, title, dur], n) => {
  const b = document.createElement('button')
  b.textContent = `▶ ${String.fromCharCode(65 + n)} · ${title} (${dur}s)`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/creak/swing/${id}.mp3`)
    void playing.play()
  }
  wbtns.appendChild(b)
})
wrow.appendChild(wbtns)
root.appendChild(wrow)

// TEST: the H family — bed springs squeaking (CC0, Freesound); each can be tried on the lamp itself
const BED: [string, string, number][] = [
  ['767354', "H · Official Bedspring Test O.O", 3.6],
  ['767546', "Spring oscillation with deep rumble", 6.4],
  ['390515', "bedsprings#own#2.wav", 19.5],
  ['161977', "Metal_Bed_Spring_Neumann_RSM191_GadiRaz.wav", 32.7],
  ['383753', "Jumping On a Bed", 7.4],
  ['450623', "Squeaky Bed Action", 8.2],
  ['645480', "clickbed2", 5.4],
  ['551014', "sound of a cot bed , Russian \"raskladushka\" with springs", 18.4],
  ['408568', "4.Springs.wav", 5.3],
  ['655947', "Bed Creaking FX.wav", 4.0],
  ['344700', "Bed_spring_bounce.wav", 23.8],
  ['832247', "DormBed03", 4.6],
  ['344347', "Squeaking Bed", 13.2],
  ['240121', "bed-squeak.wav", 11.8],
  ['808471', "Bedcreak sounds", 9.8],
  ['443796', "25. cama rechinando Bed creaking.wav", 2.2],
  ['864276', "Squeaky Spring", 0.6],
  ['807912', "Metal spring screech", 22.2],
  ['534362', "Spring_metal_grind_squeak.mp3", 36.3],
  ['364801', "Kadri_metal_edited_version.flac", 2.5],
  ['154356', "Bed Squeak.wav", 32.1],
]
const brow = document.createElement('div')
brow.className = 'row'
brow.innerHTML = `<div class="name">luminária: molas de cama (estilo H) · ▶ ouve a gravação · "na mesa" abre a luminária com ela</div>`
const bbtns = document.createElement('div')
bbtns.className = 'takes'
BED.forEach(([id, title, dur], n) => {
  const b = document.createElement('button')
  b.textContent = `▶ ${n + 1} · ${title} (${dur}s)`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/creak/bed/${id}.mp3`)
    void playing.play()
  }
  bbtns.appendChild(b)
  const a = document.createElement('a')
  a.className = 'pick'
  a.href = `/?creak=${id}`
  a.target = '_blank'
  a.textContent = `${n + 1} na mesa`
  bbtns.appendChild(a)
})
brow.appendChild(bbtns)
root.appendChild(brow)

// TEST: the toss — light things cutting the air (CC0, Freesound); "na mesa" throws with it on the desk
const trow = document.createElement('div')
trow.className = 'row'
trow.innerHTML = `<div class="name">arremesso: swoosh · ▶ ouve a gravação · "na mesa" arremessa com ela</div>`
const tbtns = document.createElement('div')
tbtns.className = 'takes'
TOSSES.forEach(([id, label], n) => {
  const b = document.createElement('button')
  b.textContent = `▶ ${n + 1} · ${label}`
  b.onclick = () => {
    playing?.pause()
    playing = new Audio(`/behind/sound/toss/${id}.mp3`)
    void playing.play()
  }
  tbtns.appendChild(b)
  const a = document.createElement('a')
  a.className = 'pick'
  a.href = `/?toss=${id}`
  a.target = '_blank'
  a.textContent = `${n + 1} na mesa`
  tbtns.appendChild(a)
})
trow.appendChild(tbtns)
root.appendChild(trow)
