import * as THREE from 'three'
import { Section, svgCursor, type Rect } from '../Vitrine'

/**
 * Nuée — a skincare house. The technique: raymarched metaballs (the liquid-chrome heroes): every pixel
 * marches a ray into a field of soft spheres that melt into one another (smooth union), lit like a
 * product shot — a pearly nude skin, a soft studio box reflected in it, a rim of light. The drops drift,
 * merge and part; the cursor holds one and the others are drawn to it. A didone italic, nude and
 * chrome, a translucent bubble for a cursor.
 */

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const FRAG = /* glsl */ `
  precision highp float;
  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uMouse; // -1..1, aspect-corrected x
  uniform float uMouseOn;
  uniform float uProg;
  varying vec2 vUv;
  float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
  vec3 ballAt(int i, float t) {
    float f = float(i);
    return vec3(sin(t * (0.31 + f * 0.07) + f * 1.7) * (0.9 + f * 0.12), cos(t * (0.27 + f * 0.05) + f * 2.3) * 0.55, sin(t * 0.2 + f) * 0.4);
  }
  float map(vec3 p) {
    float t = uTime;
    // the held drop: at the cursor when it's in, else in the middle
    vec3 m = vec3(uMouse * vec2(1.0, 1.0) * 1.15, 0.2);
    float d = length(p - mix(vec3(0.6, 0.0, 0.0), m, uMouseOn)) - 0.55;
    for (int i = 0; i < 5; i++) {
      vec3 c = ballAt(i, t);
      // drawn toward the held drop
      c = mix(c, m, uMouseOn * 0.18);
      float r = 0.32 + 0.12 * sin(float(i) * 3.1 + t * 0.4);
      d = smin(d, length(p - c) - r, 0.45);
    }
    return d;
  }
  vec3 nrm(vec3 p) {
    vec2 e = vec2(0.002, 0.0);
    return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
  }
  vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
  // the studio: a big soft box above-left, a strip on the right, a warm floor bounce
  vec3 env(vec3 r) {
    vec3 bg = mix(lin(vec3(0.84, 0.74, 0.68)), lin(vec3(0.97, 0.93, 0.9)), smoothstep(-0.4, 0.8, r.y));
    float box = smoothstep(0.75, 0.95, dot(r, normalize(vec3(-0.5, 0.8, 0.6))));
    float strip = smoothstep(0.035, 0.0, abs(r.x - 0.75)) * smoothstep(-0.2, 0.3, r.y) * step(0.0, r.z);
    return bg + vec3(1.6) * box + vec3(1.1) * strip;
  }
  void main() {
    vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * 2.0;
    vec3 ro = vec3(0.0, 0.0, 4.0);
    vec3 rd = normalize(vec3(uv * 0.62, -1.6));
    float t = 0.0;
    float hit = 0.0;
    for (int i = 0; i < 80; i++) {
      float d = map(ro + rd * t);
      if (d < 0.0015) { hit = 1.0; break; }
      t += d * 0.9;
      if (t > 8.0) break;
    }
    // the backdrop: a soft nude seamless, darker toward the floor
    vec3 col = mix(lin(vec3(0.88, 0.79, 0.73)), lin(vec3(0.95, 0.9, 0.86)), smoothstep(-1.2, 1.0, uv.y));
    col *= 1.0 - 0.18 * length(uv * vec2(0.6, 0.9));
    if (hit > 0.5) {
      vec3 p = ro + rd * t;
      vec3 n = nrm(p);
      vec3 rf = reflect(rd, n);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
      // a pearly skin: nude body, a satin sheen, the studio in its reflection, a cool-to-warm shift at the rim
      vec3 skin = lin(vec3(0.86, 0.68, 0.6));
      float dif = clamp(dot(n, normalize(vec3(-0.4, 0.7, 0.6))), 0.0, 1.0);
      vec3 base = skin * (0.35 + 0.75 * dif);
      vec3 refl = env(rf);
      vec3 pearl = mix(lin(vec3(1.0, 0.86, 0.84)), lin(vec3(0.82, 0.88, 1.0)), 0.5 + 0.5 * n.y);
      col = mix(base, refl * pearl, 0.25 + 0.6 * fres);
      // the soft shadow it would cast on the seamless isn't drawn: the backdrop stays clean
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`

export class Cosmetics extends Section {
  private scene = new THREE.Scene()
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private mat!: THREE.ShaderMaterial
  private mouse = new THREE.Vector2()

  async init(): Promise<void> {
    this.pin.style.cursor = svgCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="13" fill="rgba(255,240,234,.35)" stroke="#8a6a5c" stroke-width="1"/><circle cx="15" cy="15" r="3" fill="#fff" opacity=".9"/></svg>',
      20,
      20,
    )
    await document.fonts.load('italic 400 60px "Bodoni Moda"')
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uMouseOn: { value: 0 }, uProg: { value: 0 } },
      depthTest: false,
      depthWrite: false,
    })
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat))
    const ui = document.createElement('div')
    ui.innerHTML = `<div style="position:absolute;left:0;right:0;top:40px;text-align:center;font:italic 400 28px/1 'Bodoni Moda';letter-spacing:.04em;color:#4a3a33">Nuée</div>
      <div style="position:absolute;left:48px;top:46px;font:400 12px/1 'Bodoni Moda';letter-spacing:.3em;color:#6d574d">SÉRUM · CRÈME · HUILE</div>
      <div style="position:absolute;right:48px;top:46px;font:400 12px/1 'Bodoni Moda';letter-spacing:.3em;color:#6d574d">PANIER (0)</div>
      <div style="position:absolute;left:48px;bottom:60px;font:italic 400 clamp(44px,5.8vw,96px)/1 'Bodoni Moda';color:#3b2d27;letter-spacing:-.01em">Skin, but<br>more so.</div>
      <div style="position:absolute;right:48px;bottom:66px;max-width:260px;font:400 14px/1.7 'Bodoni Moda';color:#5c4840;text-align:right">Le Sérum Nº 1 — a single drop of ceramides and squalane, for skin that holds its light.</div>`
    ui.setAttribute('style', 'position:absolute;inset:0;pointer-events:none')
    this.pin.appendChild(ui)
  }

  frame(r: THREE.WebGLRenderer, dt: number, rect: Rect): void {
    const u = this.mat.uniforms
    u.uRes.value.set(rect.w, rect.h)
    u.uTime.value += dt
    u.uProg.value = this.progress
    if (this.pointer.inside) {
      const a = rect.w / rect.h
      // the cursor in the scene's units (the view spans about ±1.24 at the drops' depth)
      const tx = (this.pointer.x * 2 - 1) * a * 1.24 * 0.62 * 1.6
      const ty = (1 - this.pointer.y * 2) * 1.24 * 0.62 * 1.6
      this.mouse.x += (tx - this.mouse.x) * Math.min(1, dt * 5)
      this.mouse.y += (ty - this.mouse.y) * Math.min(1, dt * 5)
    }
    u.uMouse.value.copy(this.mouse)
    u.uMouseOn.value += ((this.pointer.inside ? 1 : 0) - u.uMouseOn.value) * Math.min(1, dt * 3)
    r.setClearColor(0xe9d9cf, 1)
    r.clear()
    r.render(this.scene, this.cam)
  }
}
