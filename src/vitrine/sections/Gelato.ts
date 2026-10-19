import * as THREE from 'three'
import { RevealMask } from '../../hero/RevealMask'
import { Section, canvasTexture, svgCursor, type Rect } from '../Vitrine'

/**
 * Gelato — an ice-cream shop. The technique: the fluid reveal (noth.in, Lusion's trail): the cursor
 * stirs a fluid, and where its dye is thick the layer underneath shows. Here the page IS the gelato:
 * a creamy pistachio surface (ridged where the scoop dragged, lit, with bits in it); the cursor scoops
 * it off and strawberry shows under, the edge glossy like a lip of ice cream, the fluid's drift melting
 * it. The type stays put on top and only changes ink with the flavour under it. Rounded fat type,
 * pastel, flat UI over a rich surface.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
// the two gelato surfaces are still: drawn once into targets of their own (per size), not every frame
const BAKE = /* glsl */ `
  precision highp float;
  uniform float uAspect;
  uniform float uWhich; // 0 pistachio, 1 strawberry
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); } // the colours below are picked as sRGB
  // a scooped surface: broad soft lumps and a few long folds where the scoop dragged — gelato is
  // matte and dense, not glossy: the light is soft, the sheen faint
  float cream(vec2 p, float seed) {
    vec2 q = p + vec2(fbm(p * 0.8 + seed), fbm(p * 0.8 - seed)) * 0.7;
    float lumps = fbm(q * 1.4 + seed);
    float folds = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin(q.y * 4.2 + fbm(q * 1.6) * 3.0 + seed));
    return lumps * 0.85 + folds * 0.1;
  }
  vec3 shadeCream(vec2 p, float seed, vec3 base, vec3 deep) {
    float e = 0.006;
    float c = cream(p, seed);
    vec3 nrm = normalize(vec3(cream(p - vec2(e, 0.0), seed) - cream(p + vec2(e, 0.0), seed), cream(p - vec2(0.0, e), seed) - cream(p + vec2(0.0, e), seed), e * 3.2));
    vec3 L = normalize(vec3(-0.45, 0.6, 0.65));
    float dif = clamp(dot(nrm, L), 0.0, 1.0);
    float sheen = pow(clamp(dot(reflect(-L, nrm), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 8.0);
    vec3 col = mix(lin(deep), lin(base), smoothstep(0.3, 0.7, c));
    return col * (0.8 + 0.28 * dif) + sheen * 0.04;
  }
  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
    vec3 c = uWhich < 0.5
      ? shadeCream(p, 1.7, vec3(0.88, 0.92, 0.77), vec3(0.77, 0.84, 0.62))
      : shadeCream(p * 1.1 + 3.0, 4.2, vec3(0.98, 0.80, 0.83), vec3(0.92, 0.62, 0.69));
    gl_FragColor = vec4(c, 1.0);
  }`
const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tType; // the type, white on clear
  uniform sampler2D tBitsA; // pistachio bits
  uniform sampler2D tBitsB; // strawberry seeds
  uniform sampler2D tCreamA; // the surfaces (BAKE), linear
  uniform sampler2D tCreamB;
  uniform sampler2D tDye;
  uniform vec2 uPx; // one css px in uv
  uniform float uTime;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  float dye(vec2 uv) { return texture2D(tDye, uv).r * 3.4 + (n(uv * 38.0 + uTime * 0.15) - 0.5) * 0.18; }
  void main() {
    float d = dye(vUv);
    float m = smoothstep(0.46, 0.54, d);
    vec2 g = vec2(dye(vUv + vec2(uPx.x * 2.0, 0.0)) - dye(vUv - vec2(uPx.x * 2.0, 0.0)), dye(vUv + vec2(0.0, uPx.y * 2.0)) - dye(vUv - vec2(0.0, uPx.y * 2.0)));
    vec3 pist = texture2D(tCreamA, vUv).rgb;
    vec3 frag = texture2D(tCreamB, vUv + g * 0.004).rgb;
    vec4 ba = texture2D(tBitsA, vUv);
    vec4 bb = texture2D(tBitsB, vUv + g * 0.004);
    pist = mix(pist, ba.rgb, ba.a);
    frag = mix(frag, bb.rgb, bb.a);
    vec3 col = mix(pist, frag, m);
    // the lip of the scooped edge: shaded on its far side, glossy on its near side
    float rim = 1.0 - smoothstep(0.0, 0.12, abs(d - 0.5));
    float light = clamp(dot(normalize(g + 1e-5), normalize(vec2(-0.6, 0.8))), -1.0, 1.0);
    col = mix(col, col * 0.84, rim * 0.55 * max(-light, 0.0));
    col += rim * max(light, 0.0) * 0.22;
    // the type on top: its ink the flavour's own
    vec4 t = texture2D(tType, vUv);
    vec3 ink = mix(lin(vec3(0.17, 0.33, 0.16)), lin(vec3(0.62, 0.13, 0.23)), m);
    col = mix(col, ink, t.a);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`

export class Gelato extends Section {
  private fluid!: RevealMask
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private mat!: THREE.ShaderMaterial
  private size = ''
  private auto = 0 // the scripted stroke before the visitor touches it
  private touched = false
  private ptr = new THREE.Vector2(0.5, 0.5)
  private last = new THREE.Vector2(-1, -1)

  async init(r: THREE.WebGLRenderer): Promise<void> {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="11" fill="#fff6f0" stroke="#9e2139" stroke-width="2.5"/><circle cx="16" cy="16" r="3" fill="#fff"/></svg>',
      20,
      20,
    )
    await Promise.all(['500', '600', '700'].map((w) => document.fonts.load(`${w} 40px Fredoka`)))
    const quad = new THREE.PlaneGeometry(2, 2)
    this.fluid = new RevealMask(r, quad, false, 9e-4)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tType: { value: null },
        tBitsA: { value: null },
        tBitsB: { value: null },
        tCreamA: { value: this.creamA.texture },
        tCreamB: { value: this.creamB.texture },
        tDye: { value: null },
        uPx: { value: new THREE.Vector2() },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    })
    this.bakeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: BAKE, uniforms: { uAspect: { value: 1 }, uWhich: { value: 0 } }, depthTest: false, depthWrite: false })
    this.quad = new THREE.Mesh(quad, this.mat)
    this.scene.add(this.quad)
  }
  private quad!: THREE.Mesh
  private bakeMat!: THREE.ShaderMaterial
  // (linear, half float: a byte target bands in the shadows of the folds)
  private creamA = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
  private creamB = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })

  /** the two surfaces, drawn once for this size */
  private bake(r: THREE.WebGLRenderer, W: number, H: number, aspect: number): void {
    this.quad.material = this.bakeMat
    this.bakeMat.uniforms.uAspect.value = aspect
    for (const [i, t] of [this.creamA, this.creamB].entries()) {
      t.setSize(W, H)
      this.bakeMat.uniforms.uWhich.value = i
      r.setRenderTarget(t)
      r.render(this.scene, this.cam)
    }
    r.setRenderTarget(null)
    this.quad.material = this.mat
  }

  /** the type (white on clear: the shader inks it) */
  private type(W: number, H: number): THREE.CanvasTexture {
    return canvasTexture(W, H, (g) => {
      const u = W / 1440
      g.fillStyle = '#fff'
      g.textBaseline = 'alphabetic'
      g.font = `700 ${30 * u}px Fredoka`
      g.textAlign = 'left'
      g.fillText('nonna gelato', 56 * u, 78 * u)
      g.font = `500 ${17 * u}px Fredoka`
      g.textAlign = 'right'
      g.fillText('flavours      visit      order', W - 56 * u, 74 * u)
      g.textAlign = 'center'
      let px = 300 * u
      g.font = `700 ${px}px Fredoka`
      px *= Math.min(1, (W * 0.86) / g.measureText('two scoops').width)
      g.font = `700 ${px}px Fredoka`
      g.fillText('two scoops', W / 2, H * 0.58)
      g.font = `500 ${24 * u}px Fredoka`
      g.fillText('pistacchio di bronte  ·  fragola di nemi', W / 2, H * 0.58 + 70 * u)
      g.font = `600 ${18 * u}px Fredoka`
      g.fillText('dig in', W / 2, H - 56 * u)
    })
  }
  /** bits in the gelato: pistachio crumbs, strawberry seeds */
  private bits(W: number, H: number, cols: string[], seed: number, seeds: boolean): THREE.CanvasTexture {
    return canvasTexture(W, H, (g) => {
      let s = seed
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
      const u = W / 1440
      for (let i = 0; i < (seeds ? 900 : 420); i++) {
        const x = rnd() * W
        const y = rnd() * H
        const r = (seeds ? 1.4 + rnd() * 1.6 : 2 + rnd() * 6) * u
        g.fillStyle = cols[Math.floor(rnd() * cols.length)]
        g.globalAlpha = seeds ? 0.75 : 0.85
        g.beginPath()
        if (seeds) g.ellipse(x, y, r, r * 1.6, rnd() * 3, 0, Math.PI * 2)
        else {
          // a crumb: an irregular little polygon
          const k = 5 + Math.floor(rnd() * 3)
          for (let j = 0; j < k; j++) {
            const a = (j / k) * Math.PI * 2
            const rr = r * (0.6 + rnd() * 0.6)
            g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
          }
        }
        g.fill()
      }
    })
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    const dpr = r.getPixelRatio()
    const W = Math.round(rect.w * dpr)
    const H = Math.round(rect.h * dpr)
    const key = `${W}x${H}`
    const u = this.mat.uniforms
    if (key !== this.size) {
      this.size = key
      for (const k of ['tType', 'tBitsA', 'tBitsB']) u[k].value?.dispose()
      u.tType.value = this.type(W, H)
      u.tBitsA.value = this.bits(W, H, ['#6f9a3e', '#8fb75a', '#4f7a2c', '#c9dba0'], 11, false)
      u.tBitsB.value = this.bits(W, H, ['#7a1424', '#5e0e1b', '#f3e2b0'], 23, true)
      this.bake(r, W, H, rect.w / rect.h)
    }
    const aspect = rect.w / rect.h
    // the cursor (y up), or — until the visitor moves over it — a slow scripted swirl that shows the trick
    if (this.pointer.inside) this.touched = true
    if (this.touched && this.pointer.inside) this.ptr.set(this.pointer.x, 1 - this.pointer.y)
    else if (!this.touched) {
      this.auto += dt
      const t = this.auto * 0.55
      this.ptr.set(0.5 + 0.3 * Math.sin(t * 1.3) * Math.cos(t * 0.4), 0.5 + 0.22 * Math.sin(t * 2.1))
    }
    const moved = this.ptr.distanceToSquared(this.last) > 1e-9
    this.last.copy(this.ptr)
    // the fluid's own passes draw to targets of their own; then back to the panel
    this.fluid.step(dt, this.ptr, moved, aspect, 0)
    r.setRenderTarget(null)
    u.tDye.value = this.fluid.uniforms.uRevealDye.value
    u.uPx.value.set(1 / rect.w, 1 / rect.h)
    u.uTime.value += dt
    r.setClearColor(0xffffff, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}
