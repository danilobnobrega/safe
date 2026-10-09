import * as THREE from 'three'

/**
 * Variant-B opening for the garage page: the stretch that follows the hero's chapter tunnel
 * (ShaderHero.buildApproach / stepApproach), minus its ball and rings. The camera falls from
 * 140 toward the centre of a radius-180 background sphere; with the camera's far plane at 200
 * the back of that sphere starts out clipped, so a black polygon (the sphere's 32 segments)
 * fills the view and closes by itself as the fall brings it inside the far plane — the white
 * void behind it gains thin undulating lines (blue turning orange) that then bleed out to dark,
 * and the room crossfades in underneath, so the fall runs straight into the scene.
 *
 * Rendered into its own target and laid over the finished frame with `alpha`; the page reads
 * `settle` (0 -> 1 across the crossfade) to keep the room camera moving through the handoff.
 */
const START_Z = 140
const END_Z = 3.2
const FALL_TIME = 5.5 // s (hero: APPROACH_TIME)
const BG_R = 180
const FAR = 200 // with START_Z and BG_R this is what makes the closing black shape — keep together
const HOLD = 0.2 // s on dark before the room comes in
const FADE = 1.4 // s crossfade into the room

export class ApproachIntro {
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private bgMat: THREE.ShaderMaterial
  private rt: THREE.WebGLRenderTarget
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quadMat: THREE.ShaderMaterial
  private t = 0
  done = false
  /** 0 until the crossfade starts, 1 when it ends */
  settle = 0

  constructor(private renderer: THREE.WebGLRenderer, size: { width: number; height: number; pixelRatio: number }) {
    this.camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, FAR)
    this.camera.position.set(0, 0, START_Z)
    this.rt = new THREE.WebGLRenderTarget(size.width * size.pixelRatio, size.height * size.pixelRatio)

    this.bgMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uProgress: { value: 0 }, uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uProgress;
        uniform float uTime;
        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 345.45));
          p += dot(p, p + 34.345);
          return fract(p.x * p.y);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
                     mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        void main() {
          // white void -> dark, only in the final stretch (ends at the room's #121212-ish)
          vec3 base = mix(vec3(0.97, 0.965, 0.95), vec3(0.07, 0.07, 0.07), smoothstep(0.72, 1.0, uProgress));
          // thin undulating bands, wiggling with noise — the "tube" feeling
          float band = vUv.y * 40.0;
          float wiggle = (vnoise(vec2(vUv.x * 6.0, uTime * 0.15)) - 0.5) * 2.0;
          float line = smoothstep(0.05, 0.0, abs(fract(band + wiggle * 0.6) - 0.5) - 0.46);
          // the hero keeps the orange to the end; here it bleeds out over the last stretch so
          // the fall lands on dark, the same dark as the room it hands off to
          float strength = smoothstep(0.05, 0.55, uProgress) * (1.0 - smoothstep(0.8, 1.0, uProgress));
          vec3 lineColor = mix(vec3(0.40, 0.60, 0.95), vec3(1.0, 0.55, 0.25), smoothstep(0.30, 0.9, uProgress));
          gl_FragColor = vec4(base + lineColor * line * strength * 0.8, 1.0);
        }`,
    })
    const bg = new THREE.Mesh(new THREE.SphereGeometry(BG_R, 32, 32), this.bgMat)
    bg.frustumCulled = false
    this.scene.add(bg)

    this.quadMat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { tDiffuse: { value: this.rt.texture }, uAlpha: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uAlpha; varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, uAlpha); }`,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat)
    quad.frustumCulled = false
    this.quadScene.add(quad)
  }

  resize(size: { width: number; height: number; pixelRatio: number }): void {
    this.camera.aspect = size.width / size.height
    this.camera.updateProjectionMatrix()
    this.rt.setSize(size.width * size.pixelRatio, size.height * size.pixelRatio)
  }

  update(dt: number): void {
    if (this.done) return
    this.t += dt
    const p = THREE.MathUtils.clamp(this.t / FALL_TIME, 0, 1)
    const ease = 1 - Math.pow(1 - p, 3) // falls fast, settles gently at the end
    this.camera.position.set(0, 0, THREE.MathUtils.lerp(START_Z, END_Z, ease))
    this.camera.lookAt(0, 0, 0)
    this.bgMat.uniforms.uProgress.value = p
    this.bgMat.uniforms.uTime.value += dt
    const f = THREE.MathUtils.clamp((this.t - FALL_TIME - HOLD) / FADE, 0, 1)
    this.settle = f * f * (3 - 2 * f)
    this.quadMat.uniforms.uAlpha.value = 1 - this.settle
    if (f >= 1) this.done = true
  }

  /** lay the approach over whatever is already on screen */
  render(): void {
    if (this.done) return
    // the clipped part of the sphere must read black, like in the hero
    const prevColor = this.renderer.getClearColor(new THREE.Color())
    const prevAlpha = this.renderer.getClearAlpha()
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setRenderTarget(this.rt)
    this.renderer.render(this.scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(prevColor, prevAlpha)
    const auto = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.render(this.quadScene, this.quadCam)
    this.renderer.autoClear = auto
  }
}
