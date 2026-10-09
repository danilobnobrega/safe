import * as THREE from 'three'

/**
 * TEST (/hero-drawn.html): the hero drawn by the garage's hand, in the negative — graphite on the
 * hero's paper instead of chalk on the room's dark (the paper is the room's chalk colour).
 *
 *  - an outline pass: every drawable object writes where it faces (view normal) and how far it
 *    is (view depth) into rtNormal. The garage finds its outlines from normals alone; here the
 *    sign's front and the paper behind it face the same way, so the depth jump draws that edge
 *  - DRAWN_GLSL: what a drawn surface pastes in — paper fill (the paper's own tone and grain),
 *    graphite outline from rtNormal (a clean pass + a thinner one knocked sideways by noise, as
 *    the garage does), hatching where the surface turns from a fixed light, the hatch and the
 *    outline's wobble jumping 8 times a second (the room's line boil)
 */

export const DRAWN_LAYER = 5

// the garage's look, as numbers (src/garage/materials.ts) — in px, so a small canvas (the
// toaster) gets the same stroke as the page: the garage's 0.00065 / 48 / 0.0055 at 1440 px wide
const OUTLINE_PX = 0.94
const HATCH_PX = 30 // the hatch pattern's period
const SKETCH_PX = 8 // how far the second, thinner outline is knocked sideways
const SHADOW_OPACITY = 0.3
const PACE = 8

export const DRAWN_GLSL = /* glsl */ `
  uniform float uDOn;
  uniform sampler2D tNormalD;
  uniform sampler2D tDrawingD;
  uniform sampler2D tNoiseD;
  uniform float uDTime;
  uniform vec2 uDRes; // the frame in css px
  const vec3 D_PAPER = vec3(0.937, 0.930, 0.902);
  const vec3 D_INK = vec3(0.071); // the room's #121212
  float dHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  // the paper as paper.frag draws it: off-white, a faint radial falloff, grain
  vec3 drawnPaper(vec2 suv) {
    vec3 p = D_PAPER - (1.0 - smoothstep(1.2, 0.15, distance(suv, vec2(0.5)))) * 0.03;
    return p + (dHash(suv * uDRes * 0.5) - 0.5) * 0.028;
  }
  float dEdgeAt(vec2 uv, vec2 t) {
    vec4 tl = texture2D(tNormalD, uv + t * vec2(-1.0, 1.0));
    vec4 l  = texture2D(tNormalD, uv + t * vec2(-1.0, 0.0));
    vec4 bl = texture2D(tNormalD, uv + t * vec2(-1.0, -1.0));
    vec4 tt = texture2D(tNormalD, uv + t * vec2(0.0, 1.0));
    vec4 b  = texture2D(tNormalD, uv + t * vec2(0.0, -1.0));
    vec4 tr = texture2D(tNormalD, uv + t * vec2(1.0, 1.0));
    vec4 r  = texture2D(tNormalD, uv + t * vec2(1.0, 0.0));
    vec4 br = texture2D(tNormalD, uv + t * vec2(1.0, -1.0));
    vec4 c  = texture2D(tNormalD, uv);
    vec4 gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    vec4 gy = (bl + 2.0 * b + br) - (tl + 2.0 * tt + tr);
    float n = sqrt(dot(gx.rgb, gx.rgb) + dot(gy.rgb, gy.rgb));
    float z = length(vec2(gx.a, gy.a)) / max(c.a, 0.002); // depth jump, relative to the distance
    return max(smoothstep(0.35, 0.95, n), smoothstep(0.012, 0.05, z));
  }
  float drawnEdge(vec2 suv) {
    float tick = floor(uDTime * ${PACE.toFixed(1)});
    float noise = pow(texture2D(tNoiseD, suv * 5.0 + tick * 0.137).r, 1.5);
    vec2 px = 1.0 / uDRes;
    float e0 = dEdgeAt(suv, px * ${OUTLINE_PX.toFixed(2)});
    float e1 = dEdgeAt(suv + noise * px * ${SKETCH_PX.toFixed(1)}, px * ${(OUTLINE_PX * 0.33).toFixed(3)});
    return min(e0 + e1 * noise, 1.0);
  }
  // the hatch pattern, jumping to a new offset 4 times a second
  float drawnHatch(vec2 suv) {
    return texture2D(tDrawingD, suv * uDRes / ${HATCH_PX.toFixed(1)} + floor(uDTime * ${(PACE * 0.5).toFixed(1)}) * 1.33).r;
  }
  // how much graphite on a drawn surface: outline + hatching on the side away from the light
  float drawnInk(vec2 suv, vec3 viewN) {
    float shadow = max(dot(normalize(viewN), normalize(vec3(1.0, -1.0, 0.0))), 0.0);
    float hatch = step(drawnHatch(suv), shadow - 0.15);
    return min(drawnEdge(suv) + hatch * ${SHADOW_OPACITY}, 1.0);
  }
  vec3 drawnColor(vec2 suv, vec3 viewN) {
    return mix(drawnPaper(suv), D_INK, drawnInk(suv, viewN));
  }
  // a dark object (black plastic, a slot): drawn as dense hatching, \`tone\` 0..1 how dark
  float drawnTone(vec2 suv, float tone) {
    return step(drawnHatch(suv), tone * 0.85) * 0.85;
  }
  float dNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // a texture coordinate that boils with the lines: knocked about by up to ~1.5 px (\`uvPx\` =
  // fwidth(uv), one screen px in uv), a new knock 8 times a second — so marks read off a texture
  // tremble like every other stroke
  vec2 drawnBoil(vec2 uv, vec2 uvPx) {
    float tick = floor(uDTime * ${PACE.toFixed(1)});
    vec2 k = vec2(dNoise(uv * 60.0 + tick * 1.7), dNoise(uv * 60.0 + 9.3 + tick * 2.3)) - 0.5;
    return uv + k * 3.0 * uvPx;
  }
  // marks on a surface, from its photo texture: the dark spots (a cookie's chocolate chips, a
  // cracker's docking holes) as scribbles — a grainy rim and hatch strokes inside, never a flat
  // fill — or, with \`solid\`, as ink (a label that has to read). \`l\` is the texture's perceived
  // lightness there (read through drawnBoil), \`t\` the threshold under which it's a mark, \`w\`
  // fwidth(l) (from the caller: the door's raw GLSL1 shader can't take fwidth even unused)
  float drawnMarks(vec2 suv, float l, float t, float w, float solid) {
    w = max(w, 1e-4);
    float inside = 1.0 - smoothstep(t - w, t + w, l);
    float tooth = smoothstep(0.25, 0.6, dNoise(suv * uDRes * 0.8 + floor(uDTime * ${PACE.toFixed(1)}) * 5.0));
    float rim = (1.0 - smoothstep(0.0, w * 1.6, abs(l - t))) * tooth;
    float strokes = max(step(drawnHatch(suv * 1.7 + 0.37), 0.9), step(drawnHatch(suv.yx * 1.3 + 0.71), 0.55));
    return max(rim, inside * mix(strokes * 0.92, 0.92, solid));
  }
`

const NORMAL_VERT = /* glsl */ `
  varying vec3 vN;
  varying float vZ;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vZ = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`
const NORMAL_FRAG = /* glsl */ `
  varying vec3 vN;
  varying float vZ;
  void main() {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    gl_FragColor = vec4(n * 0.5 + 0.5, clamp(vZ / 50.0, 0.0, 1.0)); // depth: 0..50 view units
  }
`

export class Drawn {
  /** shared uniform objects — spread into every drawn material */
  readonly uniforms = {
    uDOn: { value: 1 },
    tNormalD: { value: null as THREE.Texture | null },
    tDrawingD: { value: null as THREE.Texture | null },
    tNoiseD: { value: null as THREE.Texture | null },
    uDTime: { value: 0 },
    uDRes: { value: new THREE.Vector2(1, 1) },
  }
  private rtNormal: THREE.WebGLRenderTarget
  private normalMat: THREE.ShaderMaterial
  private black = new THREE.Color(0, 0, 0)
  private _c = new THREE.Color()

  constructor(private renderer: THREE.WebGLRenderer, w: number, h: number, dpr: number) {
    const bw = Math.max(1, Math.round(w * dpr))
    const bh = Math.max(1, Math.round(h * dpr))
    // full float: at half precision the depth steps across a turned face and the outline catches them as speckle
    this.rtNormal = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.FloatType })
    this.uniforms.tNormalD.value = this.rtNormal.texture
    this.uniforms.uDRes.value.set(w, h)
    this.normalMat = new THREE.ShaderMaterial({ vertexShader: NORMAL_VERT, fragmentShader: NORMAL_FRAG, side: THREE.DoubleSide })
    const tl = new THREE.TextureLoader()
    const base = `${import.meta.env.BASE_URL}garage/`
    for (const [name, key] of [['drawing.png', 'tDrawingD'], ['noise.png', 'tNoiseD']] as const) {
      void tl.loadAsync(base + name).then((t) => {
        t.colorSpace = THREE.NoColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        t.minFilter = t.magFilter = THREE.NearestFilter
        t.generateMipmaps = false
        this.uniforms[key].value = t
      })
    }
  }

  resize(w: number, h: number, dpr: number): void {
    const bw = Math.max(1, Math.round(w * dpr))
    const bh = Math.max(1, Math.round(h * dpr))
    this.rtNormal.setSize(bw, bh)
    this.uniforms.uDRes.value.set(w, h)
  }

  step(dt: number): void {
    this.uniforms.uDTime.value += dt
  }

  /** the outline pass: `roots` (and everything under them) are the drawn objects */
  normalPass(scene: THREE.Scene, cam: THREE.Camera, roots: THREE.Object3D[]): void {
    for (const r of roots) r.traverse((o) => o.layers.enable(DRAWN_LAYER))
    const mask = cam.layers.mask
    const bg = scene.background
    const fog = scene.fog
    const over = scene.overrideMaterial
    const shadows = this.renderer.shadowMap.autoUpdate
    cam.layers.set(DRAWN_LAYER)
    scene.background = null
    scene.fog = null
    scene.overrideMaterial = this.normalMat
    this.renderer.shadowMap.autoUpdate = false
    this.renderer.getClearColor(this._c)
    const alpha = this.renderer.getClearAlpha()
    // nothing there = facing the camera, far away
    this.renderer.setClearColor(this.black.setRGB(0.5, 0.5, 1.0), 1)
    this.renderer.setRenderTarget(this.rtNormal)
    this.renderer.clear()
    this.renderer.render(scene, cam)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(this._c, alpha)
    this.renderer.shadowMap.autoUpdate = shadows
    scene.overrideMaterial = over
    scene.fog = fog
    scene.background = bg
    cam.layers.mask = mask
  }
}
