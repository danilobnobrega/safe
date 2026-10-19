import * as THREE from 'three'
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { DRAWN_GLSL, type Drawn } from './Drawn'

/**
 * TEST (/hero-nuvens-planas.html, /hero-nuvens-volume.html): after "We do things for people", the way
 * white-desert.com leaves its hero — clouds rise over it at different speeds, the screen goes all
 * white, and the page below starts out of that white. Here the white is the paper (#efeee7, the
 * sections' own), and the clouds are drawn in the hero's graphite: outlined, hatched on the side
 * away from the light, every stroke boiling 8 times a second.
 *
 *  - 'flat' (CloudOverlay): banks of cumulus drawn on a 2D canvas over the hero, three of them
 *    rising at their own speeds (theirs: two PNG layers at -80% / -10% and a mist gradient); drawn
 *    as a cumulus is drawn by hand — the lumpy top outlined, a few lobes in front with only their
 *    top edge, hatching under the lobes; the hero behind softens as they come up, as their title does
 *  - 'volume' (CloudPuffs): cumulus in 3D inside the cubes' scene — each one a single smooth mass
 *    (metaballs), drawn by the same outline pass as the cubes; the deck rises in front of the cubes
 *    while the camera moves into it
 *
 * Both end in the mist: a paper gradient coming up from below until the screen is all paper — then
 * the page lets go and scrolls on, the sections already the same paper.
 */

const PAPER = '#efeee7'
const INK = '#121212'
const PACE = 8 // the boil: new strokes 8 times a second

/** a seeded random (the clouds keep their shape between visits) */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// a lobe: centre and radius in screen heights; y from the bank's top line, down
type Lobe = { x: number; y: number; r: number }
type Bank = { top: Lobe[]; front: Lobe[]; from: number; to: number; at: [number, number] }

/** the 2D layer over the hero: the flat clouds (if any) and the closing mist */
export class CloudOverlay {
  readonly canvas = document.createElement('canvas')
  private g = this.canvas.getContext('2d')!
  private hatch: CanvasPattern
  private grain: CanvasPattern
  private banks: Bank[] = []
  private time = 0
  private W = 0
  private H = 0
  private dpr = 1

  constructor(host: HTMLElement, top: number, private flat: boolean) {
    // inside the hero's stage (it scrolls away with it once the page lets go), over the visible frame
    this.canvas.setAttribute('style', `position:absolute;left:0;top:${top}px;width:100%;height:calc(100% - ${top}px);pointer-events:none;z-index:1`)
    host.appendChild(this.canvas)
    this.hatch = this.makeHatch()
    this.grain = this.makeGrain()
    // three banks, back to front: the back one smaller and slower, the front one big and fast.
    // [seed, lobe radius, how tall its heaps get, the scroll span (0..1) it rises over]
    const specs: [number, number, number, [number, number]][] = [
      [11, 0.085, 0.16, [0.0, 0.7]],
      [23, 0.12, 0.22, [0.1, 0.78]],
      [37, 0.17, 0.3, [0.22, 0.86]],
    ]
    const span = 1.35 * (16 / 9) // the width laid out, past both edges
    for (const [seed, R, tall, at] of specs) {
      const r = rng(seed)
      // heaps along the line: a smooth height profile from a few random bumps
      const bumps = Array.from({ length: 4 }, () => ({ x: -0.1 + r() * span, w: 0.25 + r() * 0.35, h: tall * (0.4 + r() * 0.6) }))
      const height = (x: number) => bumps.reduce((s, b) => s + b.h * Math.exp(-(((x - b.x) / b.w) ** 2)), 0)
      const top: Lobe[] = []
      for (let x = -0.12; x < span; ) {
        const rad = R * (0.75 + r() * 0.6)
        top.push({ x, y: -height(x) + rad * 0.15, r: rad })
        x += rad * (1.05 + r() * 0.35)
      }
      // a few smaller lobes in front, lower: only their top edge is drawn
      const front: Lobe[] = []
      const nf = Math.round(top.length * 0.45)
      for (let i = 0; i < nf; i++) {
        const x = -0.05 + r() * span
        const rad = R * (0.55 + r() * 0.45)
        // below the local top, never poking above it into the sky
        front.push({ x, y: -height(x) + R * (1.0 + r() * 0.9), r: rad })
      }
      front.sort((a, b) => a.y - b.y)
      const peak = Math.max(...top.map((l) => l.r - l.y))
      this.banks.push({ top, front, from: 1 + peak, to: -0.1 - peak * 0.15, at })
    }
  }

  private makeHatch(): CanvasPattern {
    const n = 18
    const c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d')!
    g.strokeStyle = INK
    g.globalAlpha = 0.24
    g.lineWidth = 1.1
    for (const o of [-n, 0, n]) {
      g.beginPath()
      g.moveTo(o, n)
      g.lineTo(o + n, 0)
      g.stroke()
    }
    return this.g.createPattern(c, 'repeat')!
  }
  private makeGrain(): CanvasPattern {
    const n = 256
    const c = document.createElement('canvas')
    c.width = c.height = n
    const g = c.getContext('2d')!
    const img = g.createImageData(n, n)
    for (let i = 0; i < n * n; i++) {
      const v = Math.random() * 255
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v
      img.data[i * 4 + 3] = 12
    }
    g.putImageData(img, 0, 0)
    return this.g.createPattern(c, 'repeat')!
  }

  private size(): void {
    const r = this.canvas.getBoundingClientRect()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    if (r.width === this.W && r.height === this.H && dpr === this.dpr) return
    this.W = r.width
    this.H = r.height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(r.width * dpr))
    this.canvas.height = Math.max(1, Math.round(r.height * dpr))
  }

  /** `p`: 0 nothing (the cubes as they were), 1 all paper */
  render(dt: number, p: number): void {
    this.time += dt
    if (p <= 0) {
      if (this.canvas.style.visibility !== 'hidden') this.canvas.style.visibility = 'hidden'
      return
    }
    this.canvas.style.visibility = 'visible'
    this.size()
    const { g, W, H } = this
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.clearRect(0, 0, W, H)
    const tick = Math.floor(this.time * PACE)
    // the hatching jumps with the boil, as the hero's does
    this.hatch.setTransform(new DOMMatrix([1, 0, 0, 1, (tick % 2) * 5, (tick % 3) * 3]))
    if (this.flat) for (const [k, b] of this.banks.entries()) this.drawBank(b, p, tick, k)
    else {
      // (volume) in among the clouds the sky above whitens, as it does inside one: the far tops fade
      // into the paper before the mist comes up from below
      const s = smooth(0.35, 0.85, p)
      if (s > 0) {
        const grad = g.createLinearGradient(0, 0, 0, H * 0.75)
        grad.addColorStop(0, `rgba(239,238,231,${s})`)
        grad.addColorStop(1, 'rgba(239,238,231,0)')
        g.fillStyle = grad
        g.fillRect(0, 0, W, H * 0.75)
      }
    }
    // the mist: paper coming up from below, then the whole frame
    const m = smooth(0.62, 1, p)
    if (m > 0) {
      const edge = H * (1.1 - m * 1.6)
      const grad = g.createLinearGradient(0, edge, 0, edge + H * 0.55)
      grad.addColorStop(0, 'rgba(239,238,231,0)')
      grad.addColorStop(1, 'rgba(239,238,231,1)')
      g.fillStyle = grad
      g.fillRect(0, edge, W, H - edge + 2)
      if (m >= 1) {
        g.fillStyle = PAPER
        g.fillRect(0, 0, W, H)
      }
    }
  }

  private paper(path: Path2D): void {
    this.g.fillStyle = PAPER
    this.g.fill(path)
    this.g.fillStyle = this.grain
    this.g.fill(path)
  }

  /** hatching in the lower right of a lobe: the side away from the light */
  private shade(x: number, y: number, r: number, clip?: Path2D): void {
    const g = this.g
    const lobe = new Path2D()
    lobe.arc(x, y, r, 0, Math.PI * 2)
    // the crescent: inside the lobe, outside the same circle moved up-left
    const c = new Path2D()
    c.arc(x, y, r, 0, Math.PI * 2)
    c.arc(x - r * 0.26, y - r * 0.32, r, 0, Math.PI * 2)
    g.save()
    g.clip(lobe)
    if (clip) g.clip(clip)
    g.fillStyle = this.hatch
    g.fill(c, 'evenodd')
    g.restore()
  }

  private drawBank(b: Bank, p: number, tick: number, k: number): void {
    const { g, W, H } = this
    const u = smooth(b.at[0], b.at[1], p)
    if (u <= 0) return
    const topY = (b.from + (b.to - b.from) * u) * H
    if (topY > H * 1.5) return
    const jr = rng(tick * 97 + k * 13) // the boil: every centre knocked about a little, anew 8×/s
    const S = H
    const ox = (W - S * (16 / 9)) / 2
    const at = (l: Lobe) => ({ x: ox + l.x * S + (jr() - 0.5) * 1.4, y: topY + l.y * S + (jr() - 0.5) * 1.4, r: l.r * S })
    const tops = b.top.map(at)
    // the body: the lobes and everything under them
    const body = new Path2D()
    for (const l of tops) {
      body.moveTo(l.x + l.r, l.y)
      body.arc(l.x, l.y, l.r, 0, Math.PI * 2)
    }
    // under every lobe, down to the bottom (no gap between lobes of different heights)
    for (const l of tops) body.rect(l.x - l.r * 0.95, l.y, l.r * 1.9, H * 3)
    body.rect(-10, Math.max(...tops.map((l) => l.y)), W + 20, H * 3)
    // only the outer edge gets a line: every lobe's outline stroked, then the body painted over its
    // inside half — what's left is the silhouette (and a second, thinner line knocked sideways)
    g.lineJoin = 'round'
    const dx = (jr() - 0.5) * 7
    const dy = (jr() - 0.5) * 5
    g.strokeStyle = INK
    g.globalAlpha = 0.3
    g.lineWidth = 2
    g.save()
    g.translate(dx, dy)
    g.stroke(body)
    g.restore()
    g.globalAlpha = 0.9
    g.lineWidth = 3
    g.stroke(body)
    g.globalAlpha = 1
    this.paper(body)
    // shade under the top lobes
    for (const l of tops) this.shade(l.x, l.y, l.r)
    // the lobes in front: paper, shade, and only their top edge
    for (const f of b.front) {
      const l = at(f)
      if (l.y - l.r > H) continue
      const c = new Path2D()
      c.arc(l.x, l.y, l.r, 0, Math.PI * 2)
      // the crease above it: a little hatching just over its top, on what's behind
      const crease = new Path2D()
      crease.arc(l.x + l.r * 0.08, l.y - l.r * 0.06, l.r * 1.12, Math.PI * 1.08, Math.PI * 1.92)
      crease.arc(l.x, l.y, l.r, Math.PI * 1.92, Math.PI * 1.08, true)
      g.save()
      g.clip(body)
      g.fillStyle = this.hatch
      g.fill(crease)
      g.restore()
      this.paper(c)
      this.shade(l.x, l.y, l.r)
      const a0 = Math.PI * (1.02 + jr() * 0.1)
      const a1 = Math.PI * (1.88 + jr() * 0.1)
      g.beginPath()
      g.arc(l.x, l.y, l.r, a0, a1)
      g.strokeStyle = INK
      g.globalAlpha = 0.85
      g.lineWidth = 1.5
      g.stroke()
      g.globalAlpha = 1
    }
  }
}

const PUFF_VERT = /* glsl */ `
  varying vec3 vViewN;
  varying vec4 vClip;
  void main() {
    vViewN = normalize(normalMatrix * normal);
    vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vClip;
  }`
const PUFF_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vViewN;
  varying vec4 vClip;
  ${DRAWN_GLSL}
  void main() {
    vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
    gl_FragColor = vec4(drawnColor(suv, normalize(vViewN)), 1.0);
  }`

/** one cumulus as a single smooth mass: metaballs heaped up, broad at the base, a tower or two */
function cumulus(seed: number): THREE.BufferGeometry {
  const r = rng(seed)
  const res = 64
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 200000)
  mc.isolation = 80
  mc.reset()
  const n = 11 + Math.floor(r() * 6)
  const strength = 1.2 / ((Math.sqrt(n) - 1) / 4 + 1)
  for (let i = 0; i < n; i++) {
    // a wide base row, smaller heaps on top toward the middle
    const row = i < n * 0.55 ? 0 : 1
    const x = 0.5 + (r() - 0.5) * (row ? 0.34 : 0.6)
    const y = 0.42 + row * (0.1 + r() * 0.12) + (r() - 0.5) * 0.05
    const z = 0.5 + (r() - 0.5) * (row ? 0.22 : 0.32)
    mc.addBall(x, y, z, strength * (0.7 + r() * 0.6), 12)
  }
  mc.update()
  const count = mc.count
  const pos = (mc.geometry.getAttribute('position').array as Float32Array).slice(0, count * 3)
  const raw = new THREE.BufferGeometry()
  raw.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  // (the marching cubes' triangles come apart, each with its own corners: welded, and the normals
  // averaged across them — otherwise the outline pass catches every facet near the silhouette)
  const geo = mergeVertices(raw, 1e-4)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  mc.geometry.dispose()
  return geo
}

/** cumulus in the cubes' scene, drawn like everything else there */
export class CloudPuffs {
  readonly root = new THREE.Group()
  private mat: THREE.ShaderMaterial

  constructor(drawn: Drawn) {
    this.mat = new THREE.ShaderMaterial({ uniforms: { ...drawn.uniforms }, vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG })
    this.root.visible = false
    // built a moment after the page is up, one shape per idle slot: never in the way of the first frames
    const shapes: THREE.BufferGeometry[] = []
    const seeds = [3, 8, 14]
    const next = () => {
      shapes.push(cumulus(seeds[shapes.length]))
      if (shapes.length < seeds.length) setTimeout(next, 60)
      else this.build(shapes)
    }
    setTimeout(next, 1200)
  }

  private build(shapes: THREE.BufferGeometry[]): void {
    const r = rng(7)
    // a deck between the camera and the cubes (z from about -1 back to -9), across the frame and past
    // it; nearer clouds bigger. Nothing nearer than z -1: the camera ends at z 1
    for (let i = 0; i < 22; i++) {
      const z = -1 - r() * 8
      const m = new THREE.Mesh(shapes[i % shapes.length], this.mat)
      const s = 2.2 + r() * 1.6 + (z > -4 ? 1.2 : 0)
      m.scale.set(s * (1.1 + r() * 0.5), s, s)
      m.rotation.y = r() * Math.PI * 2
      m.position.set((r() - 0.5) * (8 + -z * 1.4), -r() * 0.6, z)
      this.root.add(m)
    }
  }

  /** `p` 0..1: the deck comes up from below the frame (the camera, moved by the caller, goes in) */
  step(p: number): void {
    this.root.visible = p > 0
    const u = smooth(0, 0.8, p)
    this.root.position.y = -7 + u * 6.4
  }
}
