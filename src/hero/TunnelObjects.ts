import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import { DRAWN_GLSL } from './Drawn'
import { realMaterial, addFeltShells } from './ObjectLook'
import { LAB_OBJECTS, DEFAULT_CHOICE, loadChoices, buildObject } from '../lab/main'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * TEST (/hero-tunnel-drawn.html, /hero-tunnel-real.html): the photo tunnel's photos replaced by
 * Danilo's own things — tennis, table tennis, chess, running, the web. Real models only (nothing
 * built in code — tried, rejected as amateur), each at its REAL size: everything is in metres and
 * the whole lot is scaled by one factor, so a tennis ball is a tennis ball next to a keyboard.
 *
 * Sources (public/hero/tunnel/) — real models only, none of the garage's scripted props:
 *   chess_set, digital_wrist_watch   Poly Haven, CC0
 *   sf_*.glb                          Sketchfab, CC-BY (authors in CREDITS.txt — they must be
 *                                     credited on the site), prepared in Blender: real size,
 *                                     decimated, 1k textures, Draco
 *
 * Each object is drawn one of two ways:
 *   'drawn': the hero's graphite on paper (DRAWN_GLSL) — outline, hatching where it turns away
 *   'real':  the models' own PBR materials (colour, normal, roughness, metal maps), lit by a studio
 *            environment of their own (a real studio HDRI, set on each material — not the scene's,
 *            so nothing else changes); the scene fog sinks them into the dark like the photos
 * 'drawn' fades into the dark with distance in its own shader.
 */
export type TunnelLook = 'drawn' | 'real'

/** TEST (/hero-tunnel-portrait.html): a picture hidden behind the drawn tunnel — Danilo, in chalk —
 *  that the objects reveal as they pass (each object a window onto it). Screen-fixed, cover-fitted.
 *  `tPortrait` is an ink map (white = ink); uPortraitOn 0 keeps the objects as they are */
export const SRC_MAT = new WeakMap<THREE.BufferGeometry, THREE.MeshStandardMaterial>()
export const PORTRAIT = {
  tPortrait: { value: null as THREE.Texture | null },
  uPortraitOn: { value: 0 },
  uPortraitAspect: { value: 16 / 9 },
  uViewAspect: { value: 16 / 9 },
  // the abstract terrain's life: where it flows to (advanced faster with the scroll) and the
  // cursor's hill (screen uv, eased) with its strength
  uHFlow: { value: 0 },
  uHMouse: { value: new THREE.Vector2(0.5, 0.5) },
  uHMouseAmt: { value: 0 },
}

/** metres -> tunnel units (the photo ring has a 10-unit radius; photos were ~1.5-2 units) */
export const WORLD_SCALE = 19
const BALL_SIZE = 1.8 // x its real size

const BASE = `${import.meta.env.BASE_URL}hero/`
/** file -> the node groups taken from it (each group is one object in the tunnel) */
const WHOLE = [['*']] // the whole file is one object
const SF_SETS = {
  current: ['tennis_ball', 'tennis_racket', 'tt_racket_joola', 'chess_clock', 'running_shoe', 'trophies', 'stopwatch', 'keyboard', 'laptop'],
  // (/hero-tunnel-compare.html) Danilo's picks: another ball, a Wilson Blade Team, a Galaxy Watch for the Poly Haven one
  // (keyboard, stopwatch, trophies and the chess clock dropped: Danilo found them ridiculous / ugly)
  // Danilo's picks so far: the Pegasus for the shoe, the Galaxy Watch (strap bent a little in Blender)
  // (/hero-tunnel-compare.html) every model at the most texture resolution it came with (4K for the
  // ball and both rackets, 2K the Pegasus, 1K the watch and the laptop — there is no bigger)
  compare: ['tennis_ball_2_4k', 'racket_blade_team_4k', 'tt_racket_joola_4k', 'shoe_pegasus_4k', 'laptop_4k', 'galaxy_watch'],
  // Danilo's picks from /lab.html (2026-10-09), exported at exactly that level and texture size:
  // ball orig/512, Wilson orig/512, Joola orig/2K, Pegasus hi/2K, watch hi/512, laptop orig/512
  // (the ball: felt patches at 25 %, fibres at 35 % of their length — longer ones blurred and flickered)
  final: ['final_tennis_ball_2_short', 'final_racket_blade_team', 'final_tt_racket_joola', 'final_shoe_pegasus', 'final_galaxy_watch', 'final_laptop'],
  // the same with a lighter felted ball (every felt patch decimated, 512 texture): 50 / 25 / 12 %
  finalF50: ['final_tennis_ball_2_f50', 'final_racket_blade_team', 'final_tt_racket_joola', 'final_shoe_pegasus', 'final_galaxy_watch', 'final_laptop'],
  finalF25: ['final_tennis_ball_2_f25', 'final_racket_blade_team', 'final_tt_racket_joola', 'final_shoe_pegasus', 'final_galaxy_watch', 'final_laptop'],
  finalF12: ['final_tennis_ball_2_f12', 'final_racket_blade_team', 'final_tt_racket_joola', 'final_shoe_pegasus', 'final_galaxy_watch', 'final_laptop'],
  // (/hero-tunnel-real.html) the same at 1K, to compare
  compare1k: ['tennis_ball_2', 'racket_blade_team', 'tt_racket_joola', 'shoe_pegasus', 'laptop', 'galaxy_watch'],
  // the same, with one of Danilo's black shoes for the scanned one
  shoeWarrior: ['tennis_ball_2', 'racket_blade_team', 'tt_racket_joola', 'shoe_warrior', 'laptop', 'galaxy_watch'],
  shoeBalance: ['tennis_ball_2', 'racket_blade_team', 'tt_racket_joola', 'shoe_balance', 'laptop', 'galaxy_watch'],
  // a Nike Pegasus 36 for the shoe, a Garmin Vivoactive 5 for the watch
  pegasusGarmin: ['tennis_ball_2', 'racket_blade_team', 'tt_racket_joola', 'shoe_pegasus', 'laptop', 'garmin_watch'],
}
export type TunnelSet = keyof typeof SF_SETS | 'lab'
const sources = (set: TunnelSet): { url: string; objects: string[][] }[] => set === 'lab' ? [] : [
  ...SF_SETS[set].map((n) => ({ url: n.startsWith('final_') ? `tunnel/${n}.glb` : `tunnel/sf_${n}.glb`, objects: WHOLE })),
  {
    url: set === 'compare' ? 'tunnel/chess_set_4k/chess_set_4k.gltf' : 'tunnel/chess_set/chess_set_1k.gltf',
    objects: [['piece_king_white'], ['piece_queen_black'], ['piece_knight_white_01'], ['piece_pawn_black_01'], ['piece_rook_white_01'], ['piece_bishop_black_01']],
  },
  ...(set === 'current'
    ? [{ url: 'tunnel/digital_wrist_watch/digital_wrist_watch_1k.gltf', objects: [['digital_wrist_watch', 'digital_wrist_watch_clasp', 'digital_wrist_watch_strap_a', 'digital_wrist_watch_strap_b']] }]
    : []),
]

const VERT = /* glsl */ `
  varying vec3 vViewN;
  varying vec4 vClip;
  varying vec2 vUv;
  varying float vDepth;
  void main() {
    vUv = uv;
    vViewN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vDepth = -mv.z;
    vClip = projectionMatrix * mv;
    gl_Position = vClip;
  }
`

export class TunnelObjects {
  /** prototypes, each centred, in metres */
  private protos: THREE.Object3D[] = []
  private ready: Promise<void>
  /** shared: the fog range the photos used (set each frame) */
  readonly fog = { value: new THREE.Vector2(20, 78) }

  private env?: THREE.Texture

  private SOURCES: { url: string; objects: string[][] }[]
  private set: TunnelSet

  constructor(readonly look: TunnelLook, private drawnU: Record<string, THREE.IUniform>, private renderer: THREE.WebGLRenderer, set: TunnelSet = 'current') {
    this.SOURCES = sources(set)
    this.set = set
    this.ready = this.load()
  }

  whenReady(): Promise<void> {
    return this.ready
  }

  get count(): number {
    return this.protos.length
  }

  /** prototype `i` as its parts — geometry, material, and where the part sits in the object —
   *  for drawing every copy of it at once (InstancedMesh) */
  parts(i: number): { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] {
    const root = this.protos[i % this.protos.length]
    root.updateMatrixWorld(true)
    const inv = root.matrixWorld.clone().invert()
    const out: { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4 }[] = []
    root.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) out.push({ geometry: m.geometry, material: mat, matrix: inv.clone().multiply(m.matrixWorld) })
    })
    return out
  }

  /** a fresh copy of the prototype called `name` (a Sketchfab file's name, or a node's), or null */
  makeNamed(name: string): THREE.Object3D | null {
    const i = this.protos.findIndex((p) => p.userData.name === name)
    return i < 0 ? null : this.make(i)
  }

  /** a fresh copy of prototype `i`, in this tunnel's look */
  make(i: number): THREE.Object3D {
    const o = this.protos[i % this.protos.length].clone(true)
    o.traverse((c) => {
      const m = c as THREE.Mesh
      if (!m.isMesh) return
      m.frustumCulled = false
      // its own material: each copy fades on its own (a shared one would fade every copy at once)
      if (this.look === 'real') m.material = (m.material as THREE.Material).clone()
    })
    return o
  }

  private async load(): Promise<void> {
    // everything is fetched at once, from the page's first moment — the studio light and every
    // model in parallel (the models used to wait for the light: ~7 s lost)
    const hdrP = this.look === 'real' ? new RGBELoader().loadAsync(`${BASE}tunnel/studio_1k.hdr`) : null
    const draco = new DRACOLoader().setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    const loader = new GLTFLoader().setDRACOLoader(draco)
    const labFiles = new Map<string, Promise<GLTF>>()
    if (this.set === 'lab') {
      const choices = loadChoices()
      for (const obj of LAB_OBJECTS) {
        const ch = { ...DEFAULT_CHOICE, ...choices[obj.id] }
        const url = obj.file(obj.levels.includes(ch.level) ? ch.level : obj.levels[0])
        if (!labFiles.has(url)) labFiles.set(url, loader.loadAsync(url))
      }
    }
    const filesP = Promise.all(
      this.SOURCES.map((s) =>
        loader.loadAsync(BASE + s.url).then((g) => (console.info('[tunnel] loaded', s.url, Math.round(performance.now()), 'ms'), g)).catch((e) => {
          console.warn('[tunnel] load failed', s.url, e)
          return null
        }),
      ),
    )
    if (hdrP) {
      // a real photo studio's light (Poly Haven 'cyclorama_hard_light', CC0): one hard key and
      // dark surroundings — it's the contrast between them that gives the objects their volume
      const hdr = await hdrP
      hdr.mapping = THREE.EquirectangularReflectionMapping
      const pmrem = new THREE.PMREMGenerator(this.renderer)
      this.env = pmrem.fromEquirectangular(hdr).texture
      pmrem.dispose()
      hdr.dispose()
    }
    // (/hero-tunnel-lab.html) each object as chosen in /lab.html: its level, texture size, finish, felt
    if (this.set === 'lab') {
      const choices = loadChoices()
      for (const obj of LAB_OBJECTS) {
        const ch = { ...DEFAULT_CHOICE, ...choices[obj.id] }
        if (!obj.levels.includes(ch.level)) ch.level = obj.levels[0]
        const g = buildObject(await labFiles.get(obj.file(ch.level))!, obj, ch, this.env ?? null)
        g.userData.name = obj.id
        g.scale.multiplyScalar(ch.size ?? 1) // the lab's "size in the tunnel"
        this.protos.push(g)
      }
    }
    const files = await filesP
    files.forEach((gltf, k) => {
      if (!gltf) return
      gltf.scene.updateMatrixWorld(true)
      for (const names of this.SOURCES[k].objects) {
        const g = new THREE.Group()
        for (const name of names) {
          const node = name === '*' ? gltf.scene : gltf.scene.getObjectByName(name)
          if (!node) continue
          node.traverse((c) => {
            const m = c as THREE.Mesh
            if (!m.isMesh) return
            const mesh = new THREE.Mesh(m.geometry.clone().applyMatrix4(m.matrixWorld), this.material(m.material as THREE.MeshStandardMaterial))
            SRC_MAT.set(mesh.geometry, m.material as THREE.MeshStandardMaterial) // (the drawn tunnel's hover shows it in its real colours; keyed by geometry, which copies share)
            g.add(mesh)
          })
        }
        if (!g.children.length) continue
        const o = this.centre(g)
        // the ball alone is shown bigger than life: at real size its felt is a pixel thin and
        // flickers as it turns
        if (/tennis_ball/.test(this.SOURCES[k].url)) o.scale.multiplyScalar(BALL_SIZE)
        o.userData.name = names[0] === '*' ? this.SOURCES[k].url.replace(/^.*\/(sf_|final_)?|\.glb$/g, '') : names[0]
        this.protos.push(o)
      }
    })
    // the scanned shoe: its glossy specular made the dark inside read as a plastic bag — matte it,
    // like worn mesh and suede
    this.protos.find((o) => o.userData.name === 'running_shoe')?.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.MeshPhysicalMaterial | undefined
      if (!m) return
      m.roughness = 1
      m.roughnessMap = null
      if ('specularIntensity' in m) m.specularIntensity = 0.1
      m.envMapIntensity = 0.7
      m.needsUpdate = true
    })
    // the tennis ball's felt: its fibres (over a million modelled hairs in the source) can't be
    // drawn sixty times a frame — they're shells instead: copies of the ball a hair bigger each,
    // see-through but for scattered fibre ends, thinning out toward the outside
    for (const proto of this.protos) {
      if (this.set === 'lab' || !String(proto.userData.name).startsWith('tennis_ball')) continue // (lab: buildObject did it)
      let core: THREE.Mesh | undefined
      proto.traverse((c) => {
        if ((c as THREE.Mesh).isMesh && !core) core = c as THREE.Mesh
      })
      if (!core) continue
      addFeltShells(core, this.env ?? null)
    }
    // (debug: ?only=<name> fills the tunnel with that one object, to check it from every angle)
    const only = new URLSearchParams(location.search).get('only')
    if (only) this.protos = this.protos.filter((o) => o.userData.name === only)
    // shuffle so the kinds mix down the tunnel
    let seed = 0x51ed
    for (let i = this.protos.length - 1; i > 0; i--) {
      seed = (seed * 1664525 + 1013904223) >>> 0
      const j = seed % (i + 1)
      ;[this.protos[i], this.protos[j]] = [this.protos[j], this.protos[i]]
    }
  }

  /** centre on its bounding box, keeping its real size. A flat thing (a keyboard, a board, a
   *  laptop) is marked so it can be shown from above — side on, it's a line */
  private centre(g: THREE.Object3D): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(g)
    const c = box.getCenter(new THREE.Vector3())
    const s = box.getSize(new THREE.Vector3())
    g.position.sub(c)
    const wrap = new THREE.Group()
    wrap.add(g)
    wrap.userData.flat = s.y < 0.45 * Math.max(s.x, s.z)
    return wrap
  }

  private material(src: THREE.MeshStandardMaterial): THREE.Material {
    if (this.look === 'drawn') {
      return new THREE.ShaderMaterial({
        uniforms: { ...this.drawnU, uFog: this.fog, ...PORTRAIT },
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform vec2 uFog;
          uniform sampler2D tPortrait;
          uniform float uPortraitOn;
          uniform float uPortraitAspect;
          uniform float uViewAspect;
          uniform float uHFlow;
          uniform vec2 uHMouse;
          uniform float uHMouseAmt;
          varying vec3 vViewN;
          varying vec4 vClip;
          varying vec2 vUv;
          varying float vDepth;
          ${DRAWN_GLSL}
          float hNoise(vec2 x) {
            vec2 i = floor(x), f = fract(x);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float hFbm(vec2 x) {
            float s = 0.0, a = 0.55;
            for (int k = 0; k < 4; k++) { s += a * hNoise(x); x = x * 2.03 + 17.1; a *= 0.5; }
            return s;
          }
          void main() {
            vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            vec3 col = drawnColor(suv, vViewN);
            if (uPortraitOn > 1.5) {
              // abstract and alive: a chalk contour map of a slowly heaving terrain — isolines,
              // drawn with the line boil, hatched in the hollows. The object is a window onto it
              vec2 p = vec2(suv.x * uViewAspect, suv.y) * 3.2;
              float tt = uHFlow;
              // the terrain heaves on its own, and its features drift through it
              vec2 warp = vec2(hFbm(p * 0.7 + vec2(tt * 0.5, 0.0)), hFbm(p * 0.7 + vec2(0.0, tt * 0.5) + 9.0)) - 0.5;
              float hgt = hFbm(p + warp * 1.4 + vec2(tt, -tt * 0.6)) + 0.5 * hFbm(p * 1.9 - vec2(tt * 1.3, tt));
              // the cursor raises a hill: the contours ring round it and follow it
              vec2 dm = vec2((suv.x - uHMouse.x) * uViewAspect, suv.y - uHMouse.y);
              hgt += uHMouseAmt * 0.55 * exp(-dot(dm, dm) / 0.028);
              float tick = floor(uDTime * 8.0);
              hgt += (dNoise(suv * uDRes * 0.02 + tick * 3.1) - 0.5) * 0.012; // the boil
              float lv = hgt * 11.0;
              // a contour wherever the height crosses a level: ~1.3 px wide whatever the slope
              float line = 1.0 - smoothstep(0.0, 1.3, (0.5 - abs(fract(lv) - 0.5)) / max(fwidth(lv), 1e-4));
              float hollow = smoothstep(0.62, 0.35, hgt);
              float ink = max(line * 0.95, step(drawnHatch(suv), hollow * 0.7) * 0.75);
              ink *= 0.6 + 0.4 * smoothstep(0.2, 0.6, dNoise(suv * uDRes * 0.8 + tick * 5.0));
              col = mix(drawnPaper(suv), D_INK, ink);
            } else if (uPortraitOn > 0.5) {
              // the object is a window: on its paper, the hidden picture's ink instead of its own
              vec2 r = vec2(min(uViewAspect / uPortraitAspect, 1.0), min(uPortraitAspect / uViewAspect, 1.0));
              float ink = texture2D(tPortrait, suv * r + (1.0 - r) * 0.5).r;
              col = mix(drawnPaper(suv), D_INK, ink);
            }
            col *= 1.0 - smoothstep(uFog.x, uFog.y, vDepth);
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.DoubleSide,
      })
    }
    return realMaterial(src, this.env ?? null)
  }
}

