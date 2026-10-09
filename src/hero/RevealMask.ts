import * as THREE from 'three'
import fullscreenVert from './shaders/fullscreen.vert'
import splatFrag from './shaders/fluid/splat.frag'
import divergenceFrag from './shaders/fluid/divergence.frag'
import pressureFrag from './shaders/fluid/pressure.frag'
import gradientSubtractFrag from './shaders/fluid/gradientSubtract.frag'
import advectFrag from './shaders/reveal/advect.frag'

/** the video that shows through the holes. Missing file -> a test-pattern
 *  placeholder (see makePlaceholder), so the effect is testable before the reel exists. */
export const REVEAL_VIDEO_URL = `${import.meta.env.BASE_URL}video/reveal.mp4`

// Tuning lifted from noth.in's hero (their `fA` defaults). Velocity is in sim
// texels, dissipation is per 60Hz frame. curlStrength is 0 there, so the
// vorticity passes are dropped entirely rather than run for nothing.
const SIM_RES = 256
const DYE_RES = 512
const VELOCITY_DISSIPATION = 0.962
const DYE_DISSIPATION = 0.988
const DYE_DISSIPATION_FADED = 0.97 // what the dye decays at once the hero is scrolled away
const PRESSURE_ITERATIONS = 20
const SPLAT_RADIUS = 1.5e-4 // noth.in uses 6e-5; widened — Danilo found the trail thin
const SPLAT_FORCE = 5900

/** The GLSL both the door face and the letters paste in: the dye threshold that
 *  turns a soft fluid density into a hard-edged hole, plus a cover-fit sample of
 *  the video. `suv` is the fragment's 0..1 screen position. Edge band is 0.01 wide
 *  on purpose — that's what makes it read as a cut-out, not smoke. */
export const REVEAL_GLSL = /* glsl */ `
  uniform sampler2D uRevealDye;
  uniform sampler2D uRevealTex;
  uniform float uRevealAspect;
  uniform float uViewAspect;
  uniform sampler2D uRevealVel;
  uniform float uRevealTime;
  uniform float uRevealChalk;
  uniform float uRevealOrange;
  uniform vec2 uRevealPx; // 1 / the view's size in css px
  float revealMask(vec2 suv) {
    float raw = texture2D(uRevealDye, suv).r * 3.9;
    return clamp(smoothstep(0.5, 0.51, raw), 0.0, 1.0);
  }
  vec3 revealColor(vec2 suv) {
    vec2 r = vec2(min(uViewAspect / uRevealAspect, 1.0), min(uRevealAspect / uViewAspect, 1.0));
    vec2 uv = clamp(suv * r + (1.0 - r) * 0.5, 0.001, 0.999);
    return texture2D(uRevealTex, uv).rgb;
  }
  float rvHash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float rvNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(rvHash(i), rvHash(i + vec2(1.0, 0.0)), u.x), mix(rvHash(i + vec2(0.0, 1.0)), rvHash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float rvRaw(vec2 suv) { return texture2D(uRevealDye, suv).r * 3.9; }
  // the surface with its holes. Chalk (uRevealChalk): the same hole, but its edge drawn by the
  // garage's hand — a dry chalk stroke on the cut, short hatching just outside it as the cut's
  // shadow, both redrawn 8 times a second like the room's lines; light on a dark surface, dark
  // on a light one. Orange (uRevealOrange): the stroke is orange where the fluid is still moving
  // (where the cursor has just been) and cools to chalk as it settles
  vec3 revealApplyWith(vec3 base, vec3 inside, vec2 suv);
  vec3 revealApply(vec3 base, vec2 suv) { return revealApplyWith(base, revealColor(suv), suv); }
  // the same, with what shows through the hole given (/hero-drawn-hold: a drawn crumb's real colour)
  vec3 revealApplyWith(vec3 base, vec3 inside, vec2 suv) {
    if (uRevealChalk < 0.5) return mix(base, inside, revealMask(suv));
    float tick = floor(uRevealTime * 8.0);
    vec2 wob = (vec2(rvNoise(suv * 30.0 + tick * 1.7), rvNoise(suv * 30.0 + 11.0 + tick * 1.3)) - 0.5) * 2.5 * uRevealPx;
    vec2 s = suv + wob;
    float raw = rvRaw(s);
    vec3 col = mix(base, inside, clamp(smoothstep(0.5, 0.51, raw), 0.0, 1.0));
    // signed distance to the cut in px (+ inside the hole), from the dye's slope
    vec2 g = vec2(rvRaw(s + vec2(uRevealPx.x, 0.0)) - rvRaw(s - vec2(uRevealPx.x, 0.0)),
                  rvRaw(s + vec2(0.0, uRevealPx.y)) - rvRaw(s - vec2(0.0, uRevealPx.y))) * 0.5;
    float dpx = (raw - 0.5) / max(length(g), 1e-4);
    vec2 px = suv / uRevealPx;
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    vec3 ink = lum < 0.45 ? vec3(0.937, 0.933, 0.906) : vec3(0.085);
    float tooth = rvNoise(px * 0.85 + tick * 7.0); // the chalk skipping on the surface's tooth
    float stroke = (1.0 - smoothstep(0.9, 2.1, abs(dpx))) * smoothstep(0.2, 0.55, tooth);
    float outside = -dpx;
    float band = step(0.0, outside) * (1.0 - smoothstep(3.0, 15.0, outside));
    float h = abs(fract((px.x + px.y + tick * 1.3) / 5.0) - 0.5) * 5.0; // px to the nearest hatch line
    float hatch = (1.0 - smoothstep(0.45, 1.25, h)) * band * smoothstep(0.3, 0.7, rvNoise(px * 0.55 + tick * 3.0));
    if (uRevealOrange > 0.5) {
      float v = length(texture2D(uRevealVel, s).xy);
      ink = mix(ink, vec3(1.0, 0.604, 0.302), smoothstep(0.004, 0.06, v));
    }
    return mix(col, ink, max(stroke, hatch * 0.7));
  }
`

interface DoubleFBO {
  read: THREE.WebGLRenderTarget
  write: THREE.WebGLRenderTarget
  swap(): void
}

/**
 * noth.in's hero mechanic: the cursor stirs a GPU fluid (Stable Fluids — splat,
 * advect, divergence, Jacobi pressure, gradient subtract) and the dye it leaves
 * behind is thresholded into holes in the hero surface, with a video underneath.
 *
 * Owns its sim + the reveal texture; exposes `uniforms`, a shared set of IUniform
 * objects the door and letter materials both reference, so one update per frame
 * reaches every surface that cuts holes.
 */
export class RevealMask {
  readonly uniforms: {
    uRevealDye: THREE.IUniform<THREE.Texture | null>
    uRevealTex: THREE.IUniform<THREE.Texture | null>
    uRevealAspect: THREE.IUniform<number>
    uViewAspect: THREE.IUniform<number>
    uRevealVel: THREE.IUniform<THREE.Texture | null>
    uRevealTime: THREE.IUniform<number>
    uRevealChalk: THREE.IUniform<number>
    uRevealOrange: THREE.IUniform<number>
    uRevealPx: THREE.IUniform<THREE.Vector2>
  }

  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh

  private velocity: DoubleFBO
  private dye: DoubleFBO
  private pressure: DoubleFBO
  private divergenceRT: THREE.WebGLRenderTarget
  private simTexel = new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES)
  private dyeTexel = new THREE.Vector2(1 / DYE_RES, 1 / DYE_RES)

  private splatMat: THREE.ShaderMaterial
  private advectMat: THREE.ShaderMaterial
  private divergenceMat: THREE.ShaderMaterial
  private pressureMat: THREE.ShaderMaterial
  private gradientMat: THREE.ShaderMaterial

  private prev = new THREE.Vector2(0.5, 0.5)
  private hasPrev = false
  private asleep = false
  private _clearColor = new THREE.Color()

  private video?: HTMLVideoElement
  private placeholder?: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; t: number }

  /** `withVideo` false: no video / placeholder — the owner hands in its own layer (setSource) */
  constructor(
    renderer: THREE.WebGLRenderer,
    quadGeometry: THREE.BufferGeometry,
    withVideo = true,
    private radius = SPLAT_RADIUS, // brush size of the cursor's splats
  ) {
    this.renderer = renderer

    const rt = (res: number) =>
      new THREE.WebGLRenderTarget(res, res, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      })
    const double = (res: number): DoubleFBO => ({
      read: rt(res),
      write: rt(res),
      swap() {
        const t = this.read
        this.read = this.write
        this.write = t
      },
    })
    this.velocity = double(SIM_RES)
    this.pressure = double(SIM_RES)
    this.dye = double(DYE_RES)
    this.divergenceRT = rt(SIM_RES)

    this.splatMat = this.makeMat(splatFrag, {
      uTarget: { value: null },
      uAspectRatio: { value: 1 },
      uPoint: { value: new THREE.Vector2() },
      uValue: { value: new THREE.Vector3() },
      uRadius: { value: radius },
    })
    this.advectMat = this.makeMat(advectFrag, {
      uVelocity: { value: null },
      uSource: { value: null },
      uTexelSize: { value: this.simTexel },
      uDt: { value: 1 },
      uDissipation: { value: VELOCITY_DISSIPATION },
    })
    this.divergenceMat = this.makeMat(divergenceFrag, { uVelocity: { value: null }, uTexelSize: { value: this.simTexel } })
    this.pressureMat = this.makeMat(pressureFrag, {
      uPressure: { value: null },
      uDivergence: { value: null },
      uTexelSize: { value: this.simTexel },
    })
    this.gradientMat = this.makeMat(gradientSubtractFrag, {
      uPressure: { value: null },
      uVelocity: { value: null },
      uTexelSize: { value: this.simTexel },
    })
    this.quad = new THREE.Mesh(quadGeometry, this.splatMat)
    this.scene.add(this.quad)

    this.uniforms = {
      uRevealDye: { value: this.dye.read.texture },
      uRevealTex: { value: null },
      uRevealAspect: { value: 16 / 9 },
      uViewAspect: { value: 1 },
      uRevealVel: { value: this.velocity.read.texture },
      uRevealTime: { value: 0 },
      uRevealChalk: { value: 0 },
      uRevealOrange: { value: 0 },
      uRevealPx: { value: new THREE.Vector2(1 / 1440, 1 / 810) },
    }
    if (withVideo) this.loadSource()
    this.clear()
  }

  /** show `tex` through the holes instead of the video (cover-fitted by `aspect`) */
  setSource(tex: THREE.Texture, aspect: number): void {
    this.uniforms.uRevealTex.value = tex
    this.uniforms.uRevealAspect.value = aspect
  }

  private makeMat(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({ vertexShader: fullscreenVert, fragmentShader, uniforms, depthTest: false, depthWrite: false })
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = mat
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
  }

  // ---- the layer underneath ----------------------------------------
  private loadSource(): void {
    const v = document.createElement('video')
    v.muted = v.defaultMuted = true
    v.loop = true
    v.playsInline = true
    v.setAttribute('playsinline', '')
    v.setAttribute('muted', '')
    v.preload = 'auto'
    v.crossOrigin = 'anonymous'
    v.addEventListener('error', () => this.usePlaceholder(), { once: true })
    v.addEventListener(
      'loadeddata',
      () => {
        const tex = new THREE.VideoTexture(v)
        // pass-through: the door/letter shaders write display-ready values with no
        // colour management, so the texture must not be sRGB-decoded on sampling
        tex.colorSpace = THREE.NoColorSpace
        tex.minFilter = tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        this.uniforms.uRevealTex.value = tex
        this.uniforms.uRevealAspect.value = v.videoWidth / v.videoHeight || 16 / 9
        this.video = v
        const play = () => void v.play().catch(() => {})
        play()
        window.addEventListener('pointerdown', play, { once: true })
      },
      { once: true }
    )
    v.src = REVEAL_VIDEO_URL
    this.usePlaceholder() // shown until (unless) the real video decodes
  }

  /** PLACEHOLDER until public/video/reveal.mp4 exists — a dark, colourless scene
   *  with a few soft lights drifting slowly, so the holes read as a window onto
   *  something (not as a glitch). Low-res on purpose: it's blurry by nature and
   *  redrawn every frame. */
  private usePlaceholder(): void {
    if (this.placeholder || this.video) return
    const canvas = document.createElement('canvas')
    canvas.width = 480
    canvas.height = 270
    const ctx = canvas.getContext('2d')!
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.NoColorSpace
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    this.placeholder = { canvas, ctx, tex, t: 0 }
    this.uniforms.uRevealTex.value = tex
    this.uniforms.uRevealAspect.value = 16 / 9
    this.drawPlaceholder()
  }

  private drawPlaceholder(): void {
    const p = this.placeholder!
    const { ctx, t } = p
    const W = 480
    const H = 270
    ctx.fillStyle = '#0d0d0d'
    ctx.fillRect(0, 0, W, H)
    // three soft grey lights on slow, out-of-phase Lissajous paths
    const lights = [
      { fx: 0.07, fy: 0.05, ph: 0.0, r: 0.55, v: 0.2 },
      { fx: 0.05, fy: 0.09, ph: 2.1, r: 0.4, v: 0.14 },
      { fx: 0.11, fy: 0.06, ph: 4.2, r: 0.3, v: 0.1 },
    ]
    for (const l of lights) {
      const x = W * (0.5 + 0.38 * Math.sin(t * l.fx * Math.PI * 2 + l.ph))
      const y = H * (0.5 + 0.36 * Math.cos(t * l.fy * Math.PI * 2 + l.ph * 1.3))
      const g = ctx.createRadialGradient(x, y, 0, x, y, W * l.r)
      g.addColorStop(0, `rgba(255,255,255,${l.v})`)
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
    }
    p.tex.needsUpdate = true
  }

  // ---- sim ---------------------------------------------------------
  clear(): void {
    const prevTarget = this.renderer.getRenderTarget()
    const c = this.renderer.getClearColor(new THREE.Color())
    const a = this.renderer.getClearAlpha()
    this.renderer.setClearColor(0x000000, 0)
    for (const t of [this.velocity.read, this.velocity.write, this.dye.read, this.dye.write, this.pressure.read, this.pressure.write, this.divergenceRT]) {
      this.renderer.setRenderTarget(t)
      this.renderer.clear()
    }
    this.renderer.setRenderTarget(prevTarget)
    this.renderer.setClearColor(c, a)
    this.uniforms.uRevealDye.value = this.dye.read.texture
  }

  /**
   * One frame. `pointer` is the raw 0..1 cursor (y up), `moved` whether it moved
   * since last frame, `fade` 0..1 how far the hero has been scrolled away — splats
   * weaken with (1-fade²) and the dye bleeds faster, like noth.in's scroll fade.
   * At fade >= 1 the sim clears once and sleeps.
   */
  step(dt: number, pointer: THREE.Vector2, moved: boolean, aspect: number, fade: number): void {
    this.uniforms.uViewAspect.value = aspect
    this.uniforms.uRevealTime.value += dt

    if (this.placeholder && !this.video) {
      this.placeholder.t += dt
      this.drawPlaceholder()
    }

    if (fade >= 1) {
      if (!this.asleep) {
        this.clear()
        this.asleep = true
      }
      this.hasPrev = false
      return
    }
    this.asleep = false

    const frames = Math.min(dt * 60, 3) // everything below was tuned per 60Hz frame
    const f2 = fade * fade
    const strength = 1 - f2

    if (!this.hasPrev) {
      this.prev.copy(pointer)
      this.hasPrev = true
    }
    const dx = pointer.x - this.prev.x
    const dy = pointer.y - this.prev.y
    if (moved && (dx !== 0 || dy !== 0) && strength > 0.001) {
      const u = this.splatMat.uniforms
      u.uAspectRatio.value = aspect
      u.uPoint.value.copy(pointer)
      u.uRadius.value = this.radius
      u.uTarget.value = this.velocity.read.texture
      u.uValue.value.set(dx * SPLAT_FORCE * strength, dy * SPLAT_FORCE * strength, 0)
      this.pass(this.splatMat, this.velocity.write)
      this.velocity.swap()
      u.uTarget.value = this.dye.read.texture
      u.uValue.value.set(strength, strength, strength)
      this.pass(this.splatMat, this.dye.write)
      this.dye.swap()
    }
    this.prev.copy(pointer)

    const a = this.advectMat.uniforms
    a.uDt.value = frames
    a.uVelocity.value = this.velocity.read.texture
    a.uSource.value = this.velocity.read.texture
    a.uTexelSize.value = this.simTexel
    a.uDissipation.value = Math.pow(VELOCITY_DISSIPATION, frames)
    this.pass(this.advectMat, this.velocity.write)
    this.velocity.swap()

    a.uVelocity.value = this.velocity.read.texture
    a.uSource.value = this.dye.read.texture
    a.uTexelSize.value = this.dyeTexel
    a.uDissipation.value = Math.pow(DYE_DISSIPATION + (DYE_DISSIPATION_FADED - DYE_DISSIPATION) * f2, frames)
    this.pass(this.advectMat, this.dye.write)
    this.dye.swap()

    this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.pass(this.divergenceMat, this.divergenceRT)

    // pressure restarts from zero every frame, then relaxes (Jacobi)
    this.renderer.getClearColor(this._clearColor)
    const clearAlpha = this.renderer.getClearAlpha()
    this.renderer.setRenderTarget(this.pressure.read)
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.clear()
    this.renderer.setClearColor(this._clearColor, clearAlpha)
    this.pressureMat.uniforms.uDivergence.value = this.divergenceRT.texture
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture
      this.pass(this.pressureMat, this.pressure.write)
      this.pressure.swap()
    }

    this.gradientMat.uniforms.uPressure.value = this.pressure.read.texture
    this.gradientMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.pass(this.gradientMat, this.velocity.write)
    this.velocity.swap()

    this.renderer.setRenderTarget(null)
    this.uniforms.uRevealDye.value = this.dye.read.texture
    this.uniforms.uRevealVel.value = this.velocity.read.texture
  }
}
