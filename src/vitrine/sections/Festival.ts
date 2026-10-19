import * as THREE from 'three'
import { Section, canvasTexture, svgCursor, type Rect } from '../Vitrine'

/**
 * Soundwave — a music festival. The technique: kinetic WebGL type (the rubber-type, RGB-split marquees
 * of so many festival and agency sites): four bands of huge condensed type run sideways, each its own
 * speed; the scroll's speed throws them faster and bends them into a wave, the colour channels pulling
 * apart with it; the cursor grabs the letters near it and stretches them toward itself. Acid green on
 * black, a condensed grotesque, a cursor that is a stretched bar.
 */

const ACID = '#c8ff1a'

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uKick; // the scroll's speed, eased
  uniform vec2 uMouse; // in the band's own units
  uniform float uMouseOn;
  uniform float uDir;
  varying vec2 vUv;
  varying float vBend;
  void main() {
    vec3 p = position;
    // the wave the scroll's speed sends through it
    float w = sin(p.x * 0.55 + uTime * 3.0 * uDir) * uKick * 0.5;
    p.y += w;
    // the cursor's pull: the type near it stretches toward it
    vec2 d = uMouse - p.xy;
    float k = uMouseOn * exp(-dot(d, d) * 0.35);
    p.xy += d * k * 0.45;
    p.z += k * 1.2;
    vBend = w + k;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tType;
  uniform float uOffset; // the marquee, in uv
  uniform float uSplit;
  varying vec2 vUv;
  varying float vBend;
  void main() {
    // (no fract: the texture repeats by itself — a fract here makes a seam where the mip jumps)
    vec2 uv = vec2(vUv.x + uOffset, vUv.y);
    float s = (uSplit + abs(vBend) * 0.02);
    float r = texture2D(tType, uv + vec2(s, 0.0)).a;
    float g = texture2D(tType, uv).a;
    float b = texture2D(tType, uv - vec2(s, 0.0)).a;
    // acid where all three meet; the channels that slip show as their own colours
    vec3 acid = vec3(0.784, 1.0, 0.102);
    vec3 col = acid * g + vec3(1.0, 0.1, 0.45) * max(r - g, 0.0) + vec3(0.1, 0.5, 1.0) * max(b - g, 0.0);
    float a = max(max(r, g), b);
    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }`

type Band = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; speed: number; off: number }

export class Festival extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  private bands: Band[] = []
  private kick = 0
  private lastP = 0
  private ray = new THREE.Raycaster()

  async init(): Promise<void> {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="20"><rect x="2" y="7" width="44" height="6" fill="#c8ff1a"/><rect x="21" y="2" width="6" height="16" fill="#c8ff1a"/></svg>',
      24,
      10,
      'crosshair',
    )
    await Promise.all(['800 60px "Big Shoulders Display"', '900 60px "Big Shoulders Display"'].map((f) => document.fonts.load(f)))
    this.cam.position.set(0, 0, 14)
    const rows: [string, number, number][] = [
      // [text, height in world units, speed (uv/s, sign = direction)]
      ['SOUNDWAVE + SOUNDWAVE + ', 3.6, 0.03],
      ['3 DAYS / 4 STAGES / 70 ACTS / ', 1.5, -0.05],
      ['JUL 17—19 · LISBON · RIVERSIDE · ', 1.5, 0.045],
      ['TICKETS ON SALE NOW → TICKETS ON SALE NOW → ', 1.1, -0.06],
    ]
    let y = 3.8
    for (const [i, [text, h, speed]] of rows.entries()) {
      // the band's type: one canvas, tiled sideways (the marquee runs over its uv)
      const fontPx = 220
      const meas = document.createElement('canvas').getContext('2d')!
      meas.font = `${i === 0 ? 900 : 800} ${fontPx}px "Big Shoulders Display"`
      const tw = Math.ceil(meas.measureText(text).width)
      const tex = canvasTexture(tw, Math.round(fontPx * 1.05), (g, _W, H) => {
        g.font = `${i === 0 ? 900 : 800} ${fontPx}px "Big Shoulders Display"`
        g.fillStyle = '#fff'
        g.textBaseline = 'middle'
        g.fillText(text, 0, H * 0.54)
      })
      tex.wrapS = THREE.RepeatWrapping
      tex.colorSpace = THREE.NoColorSpace
      const aspect = tw / (fontPx * 1.05)
      const w = 40 // wider than any screen: it's tiled
      const mat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: { tType: { value: tex }, uOffset: { value: 0 }, uSplit: { value: 0 }, uTime: { value: 0 }, uKick: { value: 0 }, uMouse: { value: new THREE.Vector2(99, 99) }, uMouseOn: { value: 0 }, uDir: { value: i % 2 ? -1 : 1 } },
      })
      const geo = new THREE.PlaneGeometry(w, h, 200, 12)
      // the type repeats along the band at its own aspect
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute
      for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) * w) / (h * aspect))
      const mesh = new THREE.Mesh(geo, mat)
      y -= h / 2
      mesh.position.y = y
      y -= h / 2 + 0.25
      this.scene.add(mesh)
      this.bands.push({ mesh, mat, speed, off: 0 })
    }
    const ui = document.createElement('div')
    ui.innerHTML = `<div style="position:absolute;left:40px;top:32px;font:900 22px/1 'Big Shoulders Display';letter-spacing:.06em;color:${ACID}">SNDWV—26</div>
      <div style="position:absolute;right:40px;top:30px;display:flex;gap:26px;font:800 18px/1 'Big Shoulders Display';letter-spacing:.08em;color:#fff"><span>LINE-UP</span><span>STAGES</span><span>INFO</span><span style="background:${ACID};color:#000;padding:6px 12px;margin-top:-6px">TICKETS</span></div>
      <div style="position:absolute;left:40px;bottom:30px;font:800 15px/1.3 'Big Shoulders Display';letter-spacing:.1em;color:#777">SCROLL FAST. GRAB THE TYPE.</div>`
    ui.setAttribute('style', 'position:absolute;inset:0;pointer-events:none')
    this.pin.appendChild(ui)
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    this.cam.aspect = rect.w / rect.h
    this.cam.updateProjectionMatrix()
    // the scroll's speed (in progress per second), eased into a kick that decays
    const v = (this.progress - this.lastP) / dt
    this.lastP = this.progress
    this.kick += (Math.min(1.6, Math.abs(v) * 2.4) - this.kick) * (1 - Math.exp(-dt * (Math.abs(v) > 0.01 ? 10 : 2.5)))
    // the cursor in the bands' plane
    let mx = 99
    let my = 99
    if (this.pointer.inside) {
      this.ray.setFromCamera(new THREE.Vector2(this.pointer.x * 2 - 1, 1 - this.pointer.y * 2), this.cam)
      const hit = new THREE.Vector3()
      if (this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) {
        mx = hit.x
        my = hit.y
      }
    }
    for (const b of this.bands) {
      b.off += (b.speed * (1 + this.kick * 6)) * dt
      const u = b.mat.uniforms
      u.uOffset.value = b.off
      u.uTime.value += dt
      u.uKick.value = this.kick
      u.uSplit.value = 0.0015 + this.kick * 0.012
      u.uMouse.value.set(mx, my - b.mesh.position.y)
      u.uMouseOn.value += ((this.pointer.inside ? 1 : 0) - u.uMouseOn.value) * Math.min(1, dt * 8)
    }
    r.setClearColor(0x050505, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}
