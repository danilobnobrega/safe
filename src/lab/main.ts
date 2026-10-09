import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { realMaterial, addFeltShells } from '../hero/ObjectLook'

/**
 * /lab.html — the tunnel objects' lab: one object big in the middle, lit exactly as in the tunnel
 * (ObjectLook), with every level of detail to pick from and what it costs, live:
 *   polygons   orig (as authored) / hi / mid / lo — files public/hero/lab/<id>_<level>.glb, made
 *              in Blender from the sources (scratchpad prep.py + levels.sh)
 *   textures   original / 2K / 1K / 512 — the files keep the original resolution; the lab scales
 *              them down here, so every choice is the real thing
 *   finish     full (the model's Physical extras: clearcoat, specular, IOR) / simple
 *   felt       the tennis ball's shells, on / off
 * "Usar no túnel" keeps the choice (localStorage 'genericLab'); /hero-tunnel-lab.html builds the
 * tunnel from those choices.
 */

export const LAB_KEY = 'genericLab'
const BASE = import.meta.env.BASE_URL
const LEVELS = ['orig', 'hi', 'mid', 'lo'] as const
type Level = (typeof LEVELS)[number]
const TEXRES = [0, 2048, 1024, 512] as const // 0 = the original
export type LabChoice = {
  level: Level
  tex: number
  finish: 'full' | 'simple'
  felt: boolean
  size?: number // x its real size, in the tunnel
  // the tennis ball's own controls
  fibre?: number // how much of the felt fibres' length is kept (0.05..1)
  tint?: string // a colour laid over the felt
  tintAmt?: number // how much of it (0..1)
  bright?: number // the ball's brightness (x)
  rough?: number // 0 glossy .. 1 matte
  env?: number // how much of the studio light it reflects
}

interface LabObject {
  id: string
  label: string
  levels: readonly Level[]
  file: (level: Level) => string
  node?: string // inside a multi-object file (the chess set)
  felt?: boolean
}
const CHESS = `${BASE}hero/tunnel/chess_set_4k/chess_set_4k.gltf`
export const LAB_OBJECTS: LabObject[] = [
  ...[
    ['tennis_ball_2', 'Bola de tênis'],
    ['racket_blade_team', 'Raquete Wilson Blade Team'],
    ['tt_racket_joola', 'Raquete Joola (tênis de mesa)'],
    ['shoe_pegasus', 'Tênis Nike Pegasus 36'],
    ['galaxy_watch', 'Galaxy Watch 7'],
    ['laptop', 'Notebook'],
  ].map(([id, label]) => ({ id, label, levels: LEVELS, file: (l: Level) => `${BASE}hero/lab/${id}_${l}.glb`, felt: false })),
  ...[
    ['piece_king_white', 'Rei (xadrez)'],
    ['piece_queen_black', 'Dama (xadrez)'],
    ['piece_knight_white_01', 'Cavalo (xadrez)'],
    ['piece_pawn_black_01', 'Peão (xadrez)'],
    ['piece_rook_white_01', 'Torre (xadrez)'],
    ['piece_bishop_black_01', 'Bispo (xadrez)'],
  ].map(([id, label]) => ({ id, label, levels: ['orig'] as const, file: () => CHESS, node: id })),
]
const TUNNEL_SLOTS = 36 // objects in the tunnel (72 slots, one in two filled — ShaderHero TUNNEL_OBJ_EVERY)
export const DEFAULT_CHOICE: LabChoice = { level: 'mid', tex: 1024, finish: 'simple', felt: false, size: 1, fibre: 0.5, tint: '#d8ff3a', tintAmt: 0, bright: 1, rough: 1, env: 1 }

export function loadChoices(): Record<string, LabChoice> {
  try {
    return JSON.parse(localStorage.getItem(LAB_KEY) || '{}') as Record<string, LabChoice>
  } catch {
    return {}
  }
}

// ---- textures, scaled down live --------------------------------------------------------------
const scaled = new Map<THREE.Texture, Map<number, THREE.Texture>>()
/** `tex` at `res` px on its long side (0 or more than it has = as it is) */
export function textureAt(tex: THREE.Texture, res: number): THREE.Texture {
  const img = tex.image as { width: number; height: number } | undefined
  if (!img || !res || Math.max(img.width, img.height) <= res) return tex
  let byRes = scaled.get(tex)
  if (!byRes) scaled.set(tex, (byRes = new Map()))
  const hit = byRes.get(res)
  if (hit) return hit
  const k = res / Math.max(img.width, img.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.width * k))
  c.height = Math.max(1, Math.round(img.height * k))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(tex.image as CanvasImageSource, 0, 0, c.width, c.height)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = tex.colorSpace
  t.flipY = tex.flipY
  t.wrapS = tex.wrapS
  t.wrapT = tex.wrapT
  t.channel = tex.channel
  t.anisotropy = 8
  byRes.set(res, t)
  return t
}
const MAP_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'specularIntensityMap', 'specularColorMap'] as const

/** the object built for a choice: the file's meshes, materials dressed as in the tunnel at the
 *  chosen texture size, the felt if asked — centred, in metres */
export function buildObject(gltf: GLTF, obj: LabObject, ch: LabChoice, env: THREE.Texture | null): THREE.Group {
  gltf.scene.updateMatrixWorld(true)
  const src = obj.node ? gltf.scene.getObjectByName(obj.node)! : gltf.scene
  const g = new THREE.Group()
  src.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((sm) => {
      const s = (sm as THREE.MeshStandardMaterial).clone()
      for (const k of MAP_KEYS) {
        const t = (s as unknown as Record<string, THREE.Texture | null>)[k]
        if (t) (s as unknown as Record<string, THREE.Texture | null>)[k] = textureAt(t, ch.tex)
      }
      return realMaterial(s, env, ch.finish === 'simple')
    })
    const mesh = new THREE.Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld), mats.length === 1 ? mats[0] : mats)
    g.add(mesh)
  })
  const c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3())
  for (const m of g.children) (m as THREE.Mesh).geometry.translate(-c.x, -c.y, -c.z)
  if (obj.id === 'tennis_ball_2') tuneBall(g, ch)
  if (obj.felt && ch.felt) {
    let core: THREE.Mesh | undefined
    for (const m of g.children as THREE.Mesh[]) if (!core || m.geometry.attributes.position.count > core.geometry.attributes.position.count) core = m
    if (core && obj.levels.length > 1 && ch.level !== 'orig') addFeltShells(core, env)
  }
  return g
}

/** the tennis ball, by hand: the felt fibres (the meshes on the 'initialShadingGroup' material —
 *  the core is 'standardSurface6SG') shortened toward the ball, a colour over the felt, brightness,
 *  matte/gloss, how much studio light it reflects */
function tuneBall(g: THREE.Group, ch: LabChoice): void {
  const meshes = g.children as THREE.Mesh[]
  const isFibre = (m: THREE.Mesh) => /initialShadingGroup/i.test(((Array.isArray(m.material) ? m.material[0] : m.material) as THREE.Material).name)
  const core = meshes.find((m) => !isFibre(m))
  const fibre = ch.fibre ?? 1
  if (core && fibre < 0.999) {
    const p = core.geometry.attributes.position
    let rc = 0
    for (let i = 0; i < p.count; i++) rc += Math.hypot(p.getX(i), p.getY(i), p.getZ(i))
    rc /= p.count
    const v = new THREE.Vector3()
    for (const m of meshes) {
      if (!isFibre(m)) continue
      const q = m.geometry.attributes.position
      for (let i = 0; i < q.count; i++) {
        v.fromBufferAttribute(q, i)
        const r = v.length()
        if (r > rc) v.multiplyScalar((rc + (r - rc) * fibre) / r)
        q.setXYZ(i, v.x, v.y, v.z)
      }
      q.needsUpdate = true
      m.geometry.computeBoundingSphere()
    }
  }
  const tint = new THREE.Color(ch.tint ?? '#ffffff')
  for (const m of meshes) {
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      mat.color.lerp(tint, ch.tintAmt ?? 0).multiplyScalar(ch.bright ?? 1)
      mat.roughness = ch.rough ?? mat.roughness
      if (ch.rough !== undefined) mat.roughnessMap = null
      mat.envMapIntensity = ch.env ?? mat.envMapIntensity
    }
  }
}

export function triangles(o: THREE.Object3D): number {
  let n = 0
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry
    n += (g.index ? g.index.count : g.attributes.position.count) / 3
  })
  return Math.round(n)
}

/** GPU memory of the textures in use: w x h x 4 bytes, + a third for the mipmaps */
export function textureBytes(o: THREE.Object3D): number {
  const seen = new Set<THREE.Texture>()
  o.traverse((c) => {
    const m = c as THREE.Mesh
    if (!m.isMesh) return
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      for (const k of MAP_KEYS) {
        const t = (mat as unknown as Record<string, THREE.Texture | null>)[k]
        if (t) seen.add(t)
      }
    }
  })
  let b = 0
  for (const t of seen) {
    const img = t.image as { width: number; height: number } | undefined
    if (img) b += img.width * img.height * 4 * 1.33
  }
  return b
}

// ---- the page --------------------------------------------------------------------------------
if (document.getElementById('lab')) void start()

async function start(): Promise<void> {
  const canvas = document.getElementById('lab') as HTMLCanvasElement
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0b0b0b)
  const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.01, 100)
  camera.position.set(0, 0.6, 5.2)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.autoRotate = true
  controls.autoRotateSpeed = 1.2
  controls.minDistance = 0.6
  controls.maxDistance = 14
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false)
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
  })

  const hdr = await new RGBELoader().loadAsync(`${BASE}hero/tunnel/studio_1k.hdr`)
  hdr.mapping = THREE.EquirectangularReflectionMapping
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromEquirectangular(hdr).texture
  pmrem.dispose()

  const draco = new DRACOLoader().setDecoderPath(`${BASE}draco/`)
  const loader = new GLTFLoader().setDRACOLoader(draco)
  const files = new Map<string, Promise<GLTF>>()
  const sizes = new Map<string, Promise<number>>()
  const load = (url: string) => {
    if (!files.has(url)) files.set(url, loader.loadAsync(url))
    return files.get(url)!
  }
  const fileSize = (url: string) => {
    if (!sizes.has(url)) sizes.set(url, fetch(url, { method: 'HEAD' }).then((r) => Number(r.headers.get('content-length') || 0)))
    return sizes.get(url)!
  }

  const ui = document.getElementById('ui')!
  const choices = loadChoices()
  let current = LAB_OBJECTS[0]
  let choice: LabChoice = { ...DEFAULT_CHOICE, ...choices[current.id] }
  let shown: THREE.Group | null = null
  let busy = 0
  let stats = { tris: 0, tex: 0, file: 0, real: 0 }

  const MB = (b: number) => `${(b / 1048576).toFixed(b < 10485760 ? 1 : 0)} MB`
  const K = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} mil` : `${n}`)

  async function show(): Promise<void> {
    const my = ++busy
    ui.dataset.loading = '1'
    const url = current.file(choice.level)
    const [gltf, file] = await Promise.all([load(url), fileSize(url)])
    if (my !== busy) return
    const g = buildObject(gltf, current, choice, env)
    const box = new THREE.Box3().setFromObject(g)
    const size = box.getSize(new THREE.Vector3())
    const real = Math.max(size.x, size.y, size.z)
    g.scale.setScalar(2.4 / real) // big in the middle, whatever its real size
    if (shown) scene.remove(shown)
    scene.add(g)
    shown = g
    stats = { tris: triangles(g), tex: textureBytes(g), file, real }
    delete ui.dataset.loading
    render()
  }

  // the whole tunnel as chosen so far: each kind fills its share of the 72 slots
  async function tunnelTotals(): Promise<{ tris: number; tex: number; kinds: number }> {
    let tris = 0
    let tex = 0
    const kinds = LAB_OBJECTS.length
    const copies = TUNNEL_SLOTS / kinds
    for (const o of LAB_OBJECTS) {
      const ch: LabChoice = { ...DEFAULT_CHOICE, ...choices[o.id] }
      if (o.id === current.id) {
        tris += stats.tris * copies
        tex += stats.tex
        continue
      }
      const lv = o.levels.includes(ch.level) ? ch.level : o.levels[0]
      const est = LEVEL_TRIS[o.id]?.[lv]
      if (est) tris += est * copies
      tex += (TEX_EST[o.id] ?? 0) * Math.min(1, ((ch.tex || 4096) / 4096) ** 2)
    }
    return { tris, tex, kinds }
  }

  const fpsEl = () => document.getElementById('fps')
  let frames = 0
  let t0 = performance.now()

  function light(v: number, g: number, y: number): string {
    return v < g ? 'ok' : v < y ? 'warn' : 'bad'
  }

  function render(): void {
    const ch = choice
    const btn = (group: string, val: string | number, label: string, on: boolean, disabled = false) =>
      `<button data-g="${group}" data-v="${val}" class="${on ? 'on' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>`
    void tunnelTotals().then((tt) => {
      const copies = TUNNEL_SLOTS / tt.kinds
      ui.innerHTML = `
        <h1>LAB · objetos do túnel</h1>
        <label>objeto</label>
        <select id="obj">${LAB_OBJECTS.map((o) => `<option value="${o.id}" ${o.id === current.id ? 'selected' : ''}>${o.label}${choices[o.id] ? ' ✓' : ''}</option>`).join('')}</select>
        <label>polígonos</label>
        <div class="row">${LEVELS.map((l) => btn('level', l, { orig: 'original', hi: 'alto', mid: 'médio', lo: 'baixo' }[l], ch.level === l, !current.levels.includes(l))).join('')}</div>
        <label>texturas</label>
        <div class="row">${TEXRES.map((r) => btn('tex', r, r ? `${r / 1024 >= 1 ? r / 1024 + 'K' : r}` : 'original', ch.tex === r)).join('')}</div>
        <label>acabamento</label>
        <div class="row">${btn('finish', 'full', 'completo', ch.finish === 'full')}${btn('finish', 'simple', 'simples', ch.finish === 'simple')}</div>
        <label>tamanho no túnel (× o real) <b>${(ch.size ?? 1).toFixed(2)}×</b></label>
        <input type="range" data-k="size" min="0.5" max="3" step="0.05" value="${ch.size ?? 1}">
        ${current.id === 'tennis_ball_2' ? `
          <h1 style="margin-top:16px">bola de tênis</h1>
          <label>comprimento dos fiapos <b>${Math.round((ch.fibre ?? 1) * 100)}%</b></label>
          <input type="range" data-k="fibre" min="0.05" max="1" step="0.05" value="${ch.fibre ?? 1}">
          <label>cor sobre o feltro</label>
          <input type="color" data-k="tint" value="${ch.tint ?? '#d8ff3a'}">
          <label>intensidade da cor <b>${Math.round((ch.tintAmt ?? 0) * 100)}%</b></label>
          <input type="range" data-k="tintAmt" min="0" max="1" step="0.05" value="${ch.tintAmt ?? 0}">
          <label>brilho geral <b>${(ch.bright ?? 1).toFixed(2)}×</b></label>
          <input type="range" data-k="bright" min="0.4" max="2" step="0.05" value="${ch.bright ?? 1}">
          <label>fosco ↔ brilhante <b>${Math.round((1 - (ch.rough ?? 1)) * 100)}% brilho</b></label>
          <input type="range" data-k="rough" min="0" max="1" step="0.05" value="${ch.rough ?? 1}" style="direction:rtl">
          <label>reflexo da luz de estúdio <b>${(ch.env ?? 1).toFixed(2)}×</b></label>
          <input type="range" data-k="env" min="0" max="2" step="0.05" value="${ch.env ?? 1}">
          <p style="opacity:.5;font-size:11px;margin:8px 0 0">densidade do pelo = "polígonos": original 100% · alto 50% · médio 25% · baixo 12% dos fiapos</p>
        ` : ''}
        ${current.felt ? `<label>feltro (camadas de pelo)</label><div class="row">${btn('felt', 1, 'ligado', ch.felt, ch.level === 'orig')}${btn('felt', 0, 'desligado', !ch.felt)}</div>` : ''}
        <div class="stats">
          <div><span>tamanho real</span><b>${(stats.real * 100).toFixed(1)} cm</b></div>
          <div><span>polígonos (1 cópia)</span><b>${K(stats.tris)}</b></div>
          <div><span>polígonos no túnel (~${copies} cópias)</span><b class="${light(stats.tris * copies, 150e3, 400e3)}">${K(stats.tris * copies)}</b></div>
          <div><span>memória de vídeo (texturas)</span><b class="${light(stats.tex, 48 * 1048576, 160 * 1048576)}">${MB(stats.tex)}</b></div>
          <div><span>arquivo deste nível (texturas originais)</span><b>${MB(stats.file)}</b></div>
          <div><span>fps desta página agora</span><b id="fps">…</b></div>
        </div>
        <div class="stats total">
          <div><span>túnel inteiro com as escolhas atuais</span></div>
          <div><span>polígonos por quadro</span><b class="${light(tt.tris, 450e3, 900e3)}">${K(Math.round(tt.tris))}</b></div>
          <div><span>memória de vídeo</span><b class="${light(tt.tex, 256 * 1048576, 600 * 1048576)}">${MB(tt.tex)}</b></div>
          <p>verde: deve rodar a 60 fps · amarelo: no limite · vermelho: vai travar (referência: placa integrada Intel desta máquina)</p>
        </div>
        <button id="use" class="use">${choices[current.id] ? 'atualizar no túnel' : 'usar no túnel'}</button>
        <a class="link" href="${BASE}hero-tunnel-lab.html" target="_blank">abrir o túnel com as escolhas ↗</a>
      `
      ;(document.getElementById('obj') as HTMLSelectElement).onchange = (e) => {
        current = LAB_OBJECTS.find((o) => o.id === (e.target as HTMLSelectElement).value)!
        choice = { ...DEFAULT_CHOICE, ...choices[current.id] }
        if (!current.levels.includes(choice.level)) choice.level = current.levels[0]
        void show()
      }
      ui.querySelectorAll<HTMLButtonElement>('button[data-g]').forEach((b) => {
        b.onclick = () => {
          const v = b.dataset.v!
          const g = b.dataset.g as keyof LabChoice
          if (g === 'tex') choice.tex = Number(v)
          else if (g === 'felt') choice.felt = v === '1'
          else if (g === 'level') choice.level = v as Level
          else choice.finish = v as LabChoice['finish']
          void show()
        }
      })
      ui.querySelectorAll<HTMLInputElement>('input[data-k]').forEach((inp) => {
        inp.onchange = () => {
          const k = inp.dataset.k as keyof LabChoice
          ;(choice as Record<string, unknown>)[k] = inp.type === 'color' ? inp.value : Number(inp.value)
          void show()
        }
      })
      document.getElementById('use')!.onclick = () => {
        choices[current.id] = { ...choice }
        localStorage.setItem(LAB_KEY, JSON.stringify(choices))
        render()
      }
    })
  }

  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
    frames++
    const now = performance.now()
    if (now - t0 > 500) {
      const el = fpsEl()
      if (el) el.textContent = `${Math.round((frames * 1000) / (now - t0))}`
      frames = 0
      t0 = now
    }
  })
  await show()
}

// rough totals for the objects not on screen, from the generated files (levels.sh); filled from
// the files' own sizes when the page loads one — these are the starting estimates
const LEVEL_TRIS: Record<string, Partial<Record<Level, number>>> = {
  // (the ball's lower levels keep its felt: each felt patch decimated to 50 / 25 / 12 %)
  tennis_ball_2: { orig: 1_277_630, hi: 643_935, mid: 326_971, lo: 162_191 },
  racket_blade_team: { orig: 14_664, hi: 6_999, mid: 3_000, lo: 1_200 },
  tt_racket_joola: { orig: 1_150, hi: 1_126, mid: 700, lo: 610 },
  shoe_pegasus: { orig: 71_085, hi: 29_999, mid: 11_999, lo: 5_000 },
  galaxy_watch: { orig: 33_587, hi: 13_999, mid: 5_999, lo: 2_495 },
  laptop: { orig: 77_065, hi: 17_997, mid: 7_997, lo: 3_469 },
  piece_king_white: { orig: 4_172 },
  piece_queen_black: { orig: 2_940 },
  piece_knight_white_01: { orig: 2_662 },
  piece_pawn_black_01: { orig: 1_640 },
  piece_rook_white_01: { orig: 2_976 },
  piece_bishop_black_01: { orig: 2_924 },
}
// GPU memory of each object's textures at their original size, bytes (estimate)
const TEX_EST: Record<string, number> = {
  tennis_ball_2: 4096 * 4096 * 4 * 1.33,
  racket_blade_team: (4096 * 4096 * 2 + 2048 * 2048) * 4 * 1.33,
  tt_racket_joola: 4096 * 4096 * 2 * 4 * 1.33,
  shoe_pegasus: 2048 * 2048 * 3 * 4 * 1.33,
  galaxy_watch: (1024 * 512 * 2 + 512 * 512) * 4 * 1.33,
  laptop: 1024 * 1024 * 2 * 4 * 1.33,
  piece_king_white: (4096 * 4096 * 3 * 4 * 1.33) / 6,
  piece_queen_black: (4096 * 4096 * 3 * 4 * 1.33) / 6,
  piece_knight_white_01: (4096 * 4096 * 3 * 4 * 1.33) / 6,
  piece_pawn_black_01: (4096 * 4096 * 3 * 4 * 1.33) / 6,
  piece_rook_white_01: (4096 * 4096 * 3 * 4 * 1.33) / 6,
  piece_bishop_black_01: (4096 * 4096 * 3 * 4 * 1.33) / 6,
}
