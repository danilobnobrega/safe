import * as THREE from 'three'
import { Section, svgCursor, type Rect } from '../Vitrine'

/**
 * Kova — a digital bank. The technique: GPU particles morphing between forms (the point-cloud heroes
 * of fintech and agency sites): ~70k points that are a card, then a coin, then a chart going up, then
 * the globe — the scroll moves them from one to the next, each point leaving a little later than its
 * neighbour so the change flows; the cursor pushes them aside like a magnet. Near-black, one electric
 * blue, monospace type, a small square cursor.
 */

const N = 70000
const BLUE = new THREE.Color(0x3d7bff)

const VERT = /* glsl */ `
  attribute vec3 p1;
  attribute vec3 p2;
  attribute vec3 p3;
  attribute float aRand;
  uniform float uStage; // 0..3: which form, in between = the morph
  uniform float uTime;
  uniform vec3 uMouse; // in the object's space
  uniform float uMouseOn;
  uniform float uSize;
  varying float vGlow;
  float ease(float x) { return x * x * (3.0 - 2.0 * x); }
  void main() {
    // each point travels a little later than its neighbour: the morph flows across the form
    float s = clamp(uStage * 1.0, 0.0, 3.0);
    float k = floor(min(s, 2.999));
    float f = clamp((s - k) * 1.6 - aRand * 0.6, 0.0, 1.0);
    f = ease(f);
    vec3 a = k < 0.5 ? position : (k < 1.5 ? p1 : p2);
    vec3 b = k < 0.5 ? p1 : (k < 1.5 ? p2 : p3);
    vec3 pos = mix(a, b, f);
    // in flight they lift off the surface a little, in a curl
    float lift = sin(f * 3.14159);
    pos += normalize(pos + 1e-4) * lift * (0.35 + aRand * 0.4);
    pos.x += sin(uTime * 0.7 + aRand * 40.0) * 0.012;
    pos.y += cos(uTime * 0.9 + aRand * 31.0) * 0.012;
    // the magnet: pushed away from the cursor, stronger the closer
    vec3 d = pos - uMouse;
    float r = length(d.xy);
    float push = uMouseOn * smoothstep(1.4, 0.0, r);
    pos.xy += normalize(d.xy + 1e-4) * push * 0.9;
    pos.z += push * 0.6;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.6 + aRand * 0.8) * (1.0 + push * 1.5) / -mv.z;
    vGlow = 0.45 + 0.55 * fract(aRand * 7.31 + uTime * 0.05) + push;
  }`
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  varying float vGlow;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(c));
    gl_FragColor = vec4(uColor * vGlow, a * 0.85);
  }`

export class Bank extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
  private mat!: THREE.ShaderMaterial
  private pts!: THREE.Points
  private stage = 0
  private copy: HTMLElement[] = []
  private mouse = new THREE.Vector3()
  private ray = new THREE.Raycaster()

  init(): void {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect x="8" y="8" width="8" height="8" fill="#3d7bff"/><rect x="5.5" y="5.5" width="13" height="13" fill="none" stroke="#3d7bff" stroke-width="1"/></svg>',
      12,
      12,
      'crosshair',
    )
    let s = 9
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const card = new Float32Array(N * 3)
    const coin = new Float32Array(N * 3)
    const chart = new Float32Array(N * 3)
    const globe = new Float32Array(N * 3)
    const rand = new Float32Array(N)
    const W = 3.4
    const H = 2.14
    for (let i = 0; i < N; i++) {
      rand[i] = rnd()
      // the card: its outline, its face sparsely, the chip and the number dense
      let x = 0
      let y = 0
      const k = rnd()
      if (k < 0.32) {
        // the rounded outline
        const t = rnd() * 4
        const side = Math.floor(t)
        const u = t - side
        x = side % 2 === 0 ? (u - 0.5) * W : (side === 1 ? 0.5 : -0.5) * W
        y = side % 2 === 1 ? (u - 0.5) * H : (side === 0 ? 0.5 : -0.5) * H
      } else if (k < 0.6) {
        x = (rnd() - 0.5) * W
        y = (rnd() - 0.5) * H
      } else if (k < 0.75) {
        x = -1.2 + rnd() * 0.5
        y = 0.1 + rnd() * 0.4
      } else {
        // the number: four groups of four digits as little blocks
        const g = Math.floor(rnd() * 16)
        x = -1.3 + Math.floor(g / 4) * 0.68 + (g % 4) * 0.14 + rnd() * 0.08
        y = -0.4 + rnd() * 0.12
      }
      card.set([x, y, (rnd() - 0.5) * 0.04], i * 3)
      // the coin: a disc tilted toward us, with a thick rim and an embossed ring
      const a = rnd() * Math.PI * 2
      const kk = rnd()
      const rr = kk < 0.35 ? 1.5 : kk < 0.5 ? 1.15 + rnd() * 0.04 : Math.sqrt(rnd()) * 1.5
      const zc = kk < 0.35 ? (rnd() - 0.5) * 0.28 : 0.14 * (rnd() > 0.5 ? 1 : -1)
      const cx = Math.cos(a) * rr
      const cy = Math.sin(a) * rr
      // tilted 25° about x
      coin.set([cx, cy * 0.906 - zc * 0.423, cy * 0.423 + zc * 0.906], i * 3)
      // the chart: seven bars going up, a line over their tops
      const bars = [0.5, 0.7, 0.62, 1.0, 1.25, 1.18, 1.7]
      if (rnd() < 0.82) {
        const b = Math.floor(rnd() * bars.length)
        const bh = bars[b] * 1.4
        chart.set([-2.1 + b * 0.7 + (rnd() - 0.5) * 0.36, -1.2 + rnd() * bh, (rnd() - 0.5) * 0.36], i * 3)
      } else {
        const t = rnd() * (bars.length - 1)
        const b = Math.floor(t)
        const yy = -1.2 + (bars[b] + (bars[b + 1] - bars[b]) * (t - b)) * 1.4 + 0.25
        chart.set([-2.1 + t * 0.7, yy, 0], i * 3)
      }
      // the globe: points on a sphere, denser where there's "land" (a few noisy blobs)
      let gx = 0
      let gy = 0
      let gz = 0
      for (let tries = 0; tries < 6; tries++) {
        const u = rnd() * 2 - 1
        const th = rnd() * Math.PI * 2
        const q = Math.sqrt(1 - u * u)
        gx = q * Math.cos(th)
        gy = u
        gz = q * Math.sin(th)
        const land = Math.sin(gx * 4.1 + gy * 2.3) + Math.sin(gz * 3.7 - gy * 5.1) + Math.sin(gx * 2.2 + gz * 6.3)
        if (land > 0.4 || tries === 5 && rnd() < 0.3) break
      }
      globe.set([gx * 1.6, gy * 1.6, gz * 1.6], i * 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(card, 3))
    geo.setAttribute('p1', new THREE.BufferAttribute(coin, 3))
    geo.setAttribute('p2', new THREE.BufferAttribute(chart, 3))
    geo.setAttribute('p3', new THREE.BufferAttribute(globe, 3))
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uStage: { value: 0 }, uTime: { value: 0 }, uMouse: { value: new THREE.Vector3(99, 99, 0) }, uMouseOn: { value: 0 }, uSize: { value: 30 }, uColor: { value: BLUE } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.pts = new THREE.Points(geo, this.mat)
    this.scene.add(this.pts)
    this.cam.position.set(0, 0, 8)
    // the copy: one line per form, in and out with it
    const lines = [
      ['01 / card', 'Your money.<br>Without the bank.'],
      ['02 / save', 'Interest that<br>actually adds up.'],
      ['03 / invest', 'Watch it grow,<br>one tap at a time.'],
      ['04 / send', '140 countries.<br>Zero borders.'],
    ]
    const head = document.createElement('div')
    head.innerHTML = `<div style="position:absolute;left:48px;top:40px;font:600 15px/1 'JetBrains Mono';letter-spacing:.24em;color:#e9eefc">KOVA<span style="color:#3d7bff">_</span></div>
      <div style="position:absolute;right:48px;top:40px;font:400 13px/1 'JetBrains Mono';letter-spacing:.12em;color:#8a93ad">ACCOUNT · CARDS · INVEST · <span style="color:#e9eefc;border:1px solid #3d7bff;padding:8px 14px">OPEN ACCOUNT</span></div>`
    head.setAttribute('style', 'position:absolute;inset:0;pointer-events:none')
    this.pin.appendChild(head)
    for (const [tag, text] of lines) {
      const el = document.createElement('div')
      el.innerHTML = `<div style="font:400 12px/1 'JetBrains Mono';letter-spacing:.2em;color:#3d7bff;margin-bottom:18px">${tag}</div><div style="font:300 clamp(34px,4.4vw,68px)/1.05 'JetBrains Mono';letter-spacing:-.03em;color:#e9eefc">${text}</div>`
      el.setAttribute('style', 'position:absolute;left:48px;bottom:64px;opacity:0;pointer-events:none')
      this.pin.appendChild(el)
      this.copy.push(el)
    }
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    this.cam.aspect = rect.w / rect.h
    this.cam.updateProjectionMatrix()
    // the forms sit right of centre on wide screens, the copy on the left
    this.pts.position.x = rect.w > 900 ? 1.4 : 0
    // the scroll picks the form; eased so a flick doesn't snap it
    const target = this.progress * 3
    this.stage += (target - this.stage) * (1 - Math.exp(-dt * 3.5))
    const u = this.mat.uniforms
    u.uStage.value = this.stage
    u.uTime.value += dt
    u.uSize.value = 26 * r.getPixelRatio()
    this.pts.rotation.y = Math.sin(u.uTime.value * 0.25) * 0.35 + (this.stage > 2.5 ? u.uTime.value * 0.2 : 0)
    this.pts.rotation.x = Math.sin(u.uTime.value * 0.2) * 0.08
    // the cursor, into the object's space
    if (this.pointer.inside) {
      this.ray.setFromCamera(new THREE.Vector2(this.pointer.x * 2 - 1, 1 - this.pointer.y * 2), this.cam)
      const hit = new THREE.Vector3()
      if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) {
        this.pts.updateMatrixWorld()
        this.mouse.copy(this.pts.worldToLocal(hit))
      }
      u.uMouseOn.value += (1 - u.uMouseOn.value) * Math.min(1, dt * 6)
    } else u.uMouseOn.value *= Math.exp(-dt * 4)
    u.uMouse.value.copy(this.mouse)
    for (const [i, el] of this.copy.entries()) {
      const o = Math.max(0, 1 - Math.abs(this.stage - i) * 2.2)
      el.style.opacity = o.toFixed(3)
      el.style.transform = `translateY(${((1 - o) * 18).toFixed(1)}px)`
    }
    r.setClearColor(0x07090d, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}
