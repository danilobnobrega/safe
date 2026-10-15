import * as THREE from 'three'
import type { Quad } from './Cards'

/**
 * TEST (/garage-flex.html): card 1 leaves his monitor and flies out to fill the window as a sheet
 * of paper — after lusion.co's reel card (studied frame by frame). Drawn in WebGL on its own canvas
 * over the page, in true perspective: the sheet is a surface in 3D, not a flat quad, so when it bends
 * its edges become clean arcs and its corners stay square.
 *
 * Its pose is the rigid card (its four corners going from the monitor's glass to the window's), and
 * on top of that ONE smooth bend, driven by how fast it's travelling: on the move it leans its
 * leading corner (top right) towards you and the trailing side curls away; as it slows the bend
 * springs back through flat, a touch the other way, and settles. Shaded by its own curve.
 *
 *   ?flex=folha    the sheet as above
 *   ?flex=descola  first it peels off the glass from the leading corner, like a sticker, then flies
 *   ?flex=onda     a ripple runs through it as it flies, like paper in a draught
 *   ?flex=amassa   the picture on his monitor crumples into a ball of paper (the site's own
 *                  material: the sheet the visitor crumpled on the desk), which flies at you
 *                  tumbling and opens out, smoothing flat, into the page
 *   ?flex=dobra    it folds itself in three like a letter as it leaves the glass, flies closed
 *                  (its blank back to you), and unfolds into the page
 */
const Q = new URLSearchParams(location.search)
const MODE = Q.get('flex') ?? 'folha'
const CRUMPLE = MODE === 'amassa'
const NX = CRUMPLE ? 110 : MODE === 'dobra' ? 60 : 40
const NY = CRUMPLE ? 70 : MODE === 'dobra' ? 60 : 26
const PAPER = new THREE.Color('#efeee7')
const FOV = 30
const VREF = Number(Q.get('vref') ?? 2.2) // opening speed (per s) that gives the full bend
const BEND_HZ = Number(Q.get('bendhz') ?? 1.8) // how fast the bend follows (and springs back)
const BEND_ZETA = Number(Q.get('bendzeta') ?? 0.42) // under 1: through flat a touch the other way
const TILT = Number(Q.get('tilt') ?? 0.32) // the lean, as a share of the card's diagonal
const CURL = Number(Q.get('curl') ?? 0.55) // the trailing side's curl away, likewise

export class FlexCard {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 1, 100000)
  private geo: THREE.PlaneGeometry
  private mat: THREE.ShaderMaterial
  private tex: THREE.CanvasTexture
  private on = false
  private last = 0
  private prevOpen = 0
  private bend = 0 // the bend, signed (out: +, back home: -)
  private bendV = 0
  private still = 0 // s the sheet has been at rest
  private t = 0
  private ridge?: Float32Array // (amassa) the crumple: a fixed field of creases, per point
  private backdrop: THREE.Mesh // paper behind the sheet at the very end: a settling edge never shows the room
  /** true once the sheet has come to rest on its target */
  settled = false

  constructor(picture: HTMLCanvasElement) {
    const cnv = document.createElement('canvas')
    cnv.setAttribute('style', 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:6')
    document.body.appendChild(cnv)
    this.renderer = new THREE.WebGLRenderer({ canvas: cnv, alpha: true, antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 0)
    this.tex = new THREE.CanvasTexture(picture)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 8
    this.geo = new THREE.PlaneGeometry(1, 1, NX, NY)
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, uPaper: { value: PAPER }, uContrast: { value: CRUMPLE ? 1 : 0 } },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          vUv = uv;
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        uniform vec3 uPaper;
        uniform float uContrast;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vP;
        void main() {
          // its back is blank paper
          vec4 c = gl_FrontFacing ? texture2D(map, vUv) : vec4(uPaper, 1.0);
          vec3 n = normalize(vN);
          if (!gl_FrontFacing) n = -n;
          // paper under a soft light from above left, seen from the camera: flat on, its own colour;
          // turned away it darkens, turned to the light it catches a little sheen
          vec3 L = normalize(vec3(-0.35, 0.45, 1.0));
          float face = clamp(dot(n, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
          float lit = clamp(dot(n, L), 0.0, 1.0);
          float shade = mix(mix(0.72, 0.42, uContrast), 1.0, face) + mix(0.08, 0.35, uContrast) * (lit - 0.9) * (1.0 - face);
          vec3 h = normalize(L + normalize(-vP));
          float sheen = pow(clamp(dot(n, h), 0.0, 1.0), 40.0) * 0.12 * (1.0 - face * face);
          gl_FragColor = vec4(c.rgb * shade + sheen, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    const mesh = new THREE.Mesh(this.geo, this.mat)
    mesh.frustumCulled = false
    this.scene.add(mesh)
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: PAPER, transparent: true, opacity: 0, depthWrite: false }))
    this.backdrop.renderOrder = -1
    this.scene.add(this.backdrop)
    if (CRUMPLE) this.ridge = crumpleField(NX, NY)
    this.resize()
    window.addEventListener('resize', this.resize)
  }

  /** out (being drawn) */
  get active(): boolean {
    return this.on
  }

  private resize = (): void => {
    const W = innerWidth
    const H = innerHeight
    this.renderer.setSize(W, H, false)
    // the window, in px, is the plane z = 0, exactly filling the view (y up: px y is flipped)
    this.camera.aspect = W / H
    this.camera.position.set(W / 2, H / 2, H / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)))
    this.camera.lookAt(W / 2, H / 2, 0)
    this.camera.updateProjectionMatrix()
    // (the backdrop: far behind the sheet, scaled to still fill the view there)
    const k = (this.camera.position.z + 2000) / this.camera.position.z
    this.backdrop.scale.set(W * k * 1.05, H * k * 1.05, 1)
    this.backdrop.position.set(W / 2, H / 2, -2000)
  }

  /**
   * each frame: the card's corners (window px: TL, TR, BR, BL) and how far it has opened out
   * (0 on the glass … 1 full window) — or null when it isn't out
   */
  update(quad: Quad | null, open = 0): void {
    const now = performance.now() / 1000
    const dt = Math.min(1 / 20, this.last ? now - this.last : 1 / 60)
    this.last = now
    if (!quad) {
      if (this.on) {
        this.on = false
        this.renderer.clear()
      }
      this.settled = false
      return
    }
    if (!this.on) {
      this.tex.needsUpdate = true
      this.bend = this.bendV = 0
      this.prevOpen = open
      this.still = 0
      this.t = 0
    }
    this.on = true
    this.t += dt
    // the bend chases the travel's speed (signed: out or home), on a spring that overshoots a little
    const speed = (open - this.prevOpen) / Math.max(dt, 1e-3)
    this.prevOpen = open
    const want = THREE.MathUtils.clamp(speed / VREF, -1.2, 1.2)
    const w = 2 * Math.PI * BEND_HZ
    const steps = 4
    for (let i = 0; i < steps; i++) {
      const h = dt / steps
      this.bendV += (w * w * (want - this.bend) - 2 * BEND_ZETA * w * this.bendV) * h
      this.bend += this.bendV * h
    }
    this.still = Math.abs(this.bend) < 0.004 && Math.abs(this.bendV) < 0.02 && Math.abs(speed) < 0.01 ? this.still + dt : 0
    this.settled = this.still > 0.12

    const H = innerHeight
    const Hm = homography(quad)
    const diag = Math.hypot(quad[2][0] - quad[0][0], quad[2][1] - quad[0][1])
    const b = this.bend
    const a = Math.abs(b)
    // (descola) the peel: a fold line sweeps from the leading corner to the far one over the first
    // part of the way out, the part past it lifted off the glass towards you
    const peelFront = MODE === 'descola' ? 1 - THREE.MathUtils.smoothstep(open, 0, 0.38) : -1
    const peelK = MODE === 'descola' ? Math.sin(Math.PI * THREE.MathUtils.clamp(open / 0.6, 0, 1)) : 0
    const attr = this.geo.attributes.position as THREE.BufferAttribute
    const sm = THREE.MathUtils.smootherstep
    // (amassa) crumpled into a ball over the first part, flying as one, smoothed open over the last
    const crush = CRUMPLE ? sm(open, 0, 0.45) * (1 - sm(open, 0.62, 0.97)) : 0
    // (dobra) folded shut as it leaves, flying closed, unfolded at the end: the bottom flap first
    const foldTop = MODE === 'dobra' ? Math.PI * 0.97 * sm(open, 0.02, 0.3) * (1 - sm(open, 0.62, 0.95)) : 0
    const foldBot = MODE === 'dobra' ? Math.PI * 0.94 * sm(open, 0.0, 0.26) * (1 - sm(open, 0.55, 0.88)) : 0
    const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4
    const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4
    const qw = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1])
    const qh = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1])
    const R = Math.min(qw, qh) * 0.24 // the ball
    const spin = CRUMPLE ? Math.PI * 2.2 * sm(open, 0.2, 0.9) : 0
    const cs = Math.cos(spin)
    const sn = Math.sin(spin)
    const cs2 = Math.cos(spin * 0.6)
    const sn2 = Math.sin(spin * 0.6)
    const at = (u: number, v: number): [number, number] => {
      const wq = Hm[6] * u + Hm[7] * v + 1
      return [(Hm[0] * u + Hm[1] * v + Hm[2]) / wq, (Hm[3] * u + Hm[4] * v + Hm[5]) / wq]
    }
    for (let j = 0; j <= NY; j++) {
      for (let i = 0; i <= NX; i++) {
        const u = i / NX
        const v = j / NY
        let [x, y] = at(u, v)
        // where on the card, from the trailing corner (0, bottom left) to the leading one (1, top right)
        const L = (u + (1 - v)) / 2
        let z = diag * (TILT * b * (L - 0.5) - CURL * a * (1 - L) * (1 - L))
        if (MODE === 'onda') z += diag * 0.035 * a * Math.sin(2 * Math.PI * (L * 1.6 - this.t * 1.4)) * (0.4 + 0.6 * (1 - L))
        if (peelK > 0) z += diag * 0.22 * peelK * Math.pow(Math.max(0, L - peelFront), 2)
        const p = j * (NX + 1) + i
        if (this.ridge && (crush > 0 || open > 0.5)) {
          const n = this.ridge[p * 3]
          if (crush > 0) {
            // the sheet wrapped round a ball: its middle to the front, its edges round to the back,
            // pushed in and out along the creases
            const du = u - 0.5
            const dv = v - 0.5
            const r = Math.min(1, Math.hypot(du, dv) / 0.7071)
            const ang = Math.atan2(dv, du)
            const phi = r * Math.PI * 0.96
            const k = 1 + 0.6 * n
            const bx = Math.sin(phi) * Math.cos(ang) * k + 0.24 * this.ridge[p * 3 + 1]
            const by = Math.sin(phi) * Math.sin(ang) * k + 0.24 * this.ridge[p * 3 + 2]
            const bz = Math.cos(phi) * k
            // tumbling as it flies
            const rx = bx * cs + bz * sn
            const rz = -bx * sn + bz * cs
            const ry = by * cs2 - rz * sn2
            const rz2 = by * sn2 + rz * cs2
            x += (cx + rx * R - x) * crush
            y += (cy + ry * R - y) * crush
            z += (rz2 * R - z) * crush
          }
          // smoothed open, it still shows its folds a moment
          z += diag * 0.025 * n * (1 - crush) * (1 - sm(open, 0.8, 1)) * (open > 0.3 ? 1 : 0)
        }
        if (foldTop > 0 && v < 1 / 3) {
          // three panels: the top and bottom thirds swing over the middle on their creases
          const [kx, ky] = at(u, 1 / 3)
          const dy = y - ky
          y = ky + dy * Math.cos(foldTop) + z * Math.sin(foldTop)
          z = z * Math.cos(foldTop) - dy * Math.sin(foldTop) + 1.2 * Math.min(1, foldTop)
          x = kx + (x - kx)
        } else if (foldBot > 0 && v > 2 / 3) {
          const [kx, ky] = at(u, 2 / 3)
          const dy = y - ky
          y = ky + dy * Math.cos(foldBot) + z * Math.sin(foldBot)
          z = z * Math.cos(foldBot) + dy * Math.sin(foldBot) + 0.6 * Math.min(1, foldBot)
          x = kx + (x - kx)
        }
        attr.setXYZ(p, x, H - y, z)
      }
    }
    attr.needsUpdate = true
    this.geo.computeVertexNormals()
    ;(this.backdrop.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.smoothstep(open, 0.9, 1)
    this.renderer.render(this.scene, this.camera)
  }
}

/** the projective map of the unit square (u right, v down) onto the quad TL, TR, BR, BL */
function homography(q: Quad): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  let g = 0
  let h = 0
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = x1 - x2
    const dx2 = x3 - x2
    const dy1 = y1 - y2
    const dy2 = y3 - y2
    const den = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - dx2 * sy) / den
    h = (dx1 * sy - sx * dy1) / den
  }
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h]
}

/** (amassa) a crumpled sheet's creases: per point, how far it's pushed in/out (ridged noise of a few
 *  octaves: sharp folds, not bumps) and a little sideways */
function crumpleField(nx: number, ny: number): Float32Array {
  const out = new Float32Array((nx + 1) * (ny + 1) * 3)
  const hash = (x: number, y: number, s: number) => {
    const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return h - Math.floor(h)
  }
  const noise = (x: number, y: number, s: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const sx = xf * xf * (3 - 2 * xf)
    const sy = yf * yf * (3 - 2 * yf)
    const a = hash(xi, yi, s)
    const b = hash(xi + 1, yi, s)
    const c = hash(xi, yi + 1, s)
    const d = hash(xi + 1, yi + 1, s)
    return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1
  }
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const u = i / nx
      const v = j / ny
      let r = 0
      let amp = 0.6
      let f = 4.5
      for (let o = 0; o < 5; o++) {
        r += amp * (0.5 - Math.abs(noise(u * f, v * f, o)))
        amp *= 0.55
        f *= 2.1
      }
      const p = (j * (nx + 1) + i) * 3
      out[p] = r
      out[p + 1] = noise(u * 5, v * 5, 9)
      out[p + 2] = noise(u * 5, v * 5, 13)
    }
  }
  return out
}
