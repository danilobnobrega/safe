import * as THREE from 'three'

/**
 * Variant-C opening for the garage page: the hero's post-tunnel black shape on PURE WHITE, and
 * the white then turning into the room.
 *
 * The shape: the camera falls from 140 toward the centre of a radius-180 background sphere with
 * its far plane at 200, so the back of the sphere starts out clipped — that clipped region is
 * the black polygon (the sphere's 32 segments) — and it closes by itself once the fall brings
 * the whole sphere inside the far plane (camera z <= 20, ~2.8 s into the hero's fall curve).
 * Here the sphere is plain white: no lines, no orange, no ball, no rings.
 *
 * The handoff: the white's "exposure" comes down over WHITE_TIME, starting a beat
 * before the shape is fully closed so there is no pause between the two; the page drives a
 * defocus-to-focus on its post chain off `focus` (sharp only once the shape is tiny) and the
 * room camera's last stretch of fall off
 * `settle` — eyes adjusting to the light, rather than a crossfade.
 */
const START_Z = 140
const END_Z = 3.2
const FALL_TIME = 5.5 // s — the hero's fall curve; only its first ~2.8 s are ever shown
const BG_R = 180
const FAR = 200 // with START_Z and BG_R this is what makes the closing black shape — keep together
const CLOSE_TIME = 2.77 // s: when START..END reaches FAR - BG_R = 20 (ease 0.877 -> p 0.503)
const WHITE_START = 2.35 // s: the white starts giving way just before the last of the shape goes
const WHITE_TIME = 2.2 // s: white -> room
const ZOOM_TIME = 3 // s: the page's entrance zoom-in, from the moment the shape is gone
// ?v=d: instead of closing, the tiny shape bursts open into the scene. Pulling the camera back
// out re-grows the same polygon; past START_Z + BG_R + ... the whole sphere is beyond the far
// plane and the window covers the screen
// Near its end the shape is the pyramid of faces around the one sphere vertex straight behind
// the camera, its size LINEAR in z - 20; on the hero's curve it runs z 22 -> 20 in ~0.1 s and
// is never seen tiny. So ?v=d uses its own curve, in log(z - 20) (≈ log of the shape's size, so
// an even rate reads as an even shrink): power3.out on that — it starts at 3x the average
// speed and loses speed all the way (never constant), coming to rest as a small, still
// visible speck; it stays there, stopped, for TINY_HOLD, and then bursts (never closes)
const BURST_AT_Z = 20.36 // the speck it bursts from, ~4% of the half-height
const BURST_TIME = 1.4 // s: START_Z -> BURST_AT_Z
const TINY_HOLD = 0.6 // s: stopped at its smallest before the burst
const BURST_DUR = 1.2 // s: tiny -> full screen, power3.out on the shape's (log) size
// The burst scales the speck itself up (frozen, in screen space) instead of pulling the camera
// back: re-growing it through the sphere turns it into a circle once it's big (the far plane
// cuts the sphere in a circle) and the screen's corners fill in last. The speck is a rhombus
// ~0.0395 x 0.079 of the half-height (half-width x half-height) — redrawn exactly as that for
// the burst — so covering a corner of an
// aspect-A screen takes a scale of A / 0.0395 + 1 / 0.079 (plus margin)
const SPECK_HW = 0.0395
const SPECK_HH = 0.079
// ?v=e: the same burst, but the speck rounds off into a circle as it grows (as the old camera
// pull-back did) — a true circle, grown until it reaches the screen's corners, so nothing stalls
const CIRCLE_R = 0.056 // circle radius at scale 1, in half-heights (~ the speck's size)
const CIRCLE_BY = 8 // scale by which it is fully round
const WHITE = new THREE.Color(0.97, 0.965, 0.95) // the hero's white void

export class CurtainIntro {
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private rt: THREE.WebGLRenderTarget
  private quadScene = new THREE.Scene()
  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quadMat: THREE.ShaderMaterial
  private frameTex: THREE.FramebufferTexture
  private hideCurtain = false
  private t = 0
  done = false
  /** 0 until the white starts clearing, 1 when the room is fully there */
  settle = 0
  /** the room's focus, 0 = defocused all over, 1 = sharp — sharp only once the shape is tiny */
  focus = 0
  /** the page's entrance zoom-in, 0 = zoomed out (the whole time the shape is up), 1 = at rest */
  zoom = 0
  /** camera z the page's zoom-in starts from (v=e: v=b's shallower 5.5) */
  get zoomFrom(): number {
    return this.burst === 'circle' ? 5.5 : 8
  }

  private burstAt = -1 // s, when the burst started

  constructor(
    private renderer: THREE.WebGLRenderer,
    size: { width: number; height: number; pixelRatio: number },
    private burst: false | 'rhombus' | 'circle' = false,
  ) {
    this.camera = new THREE.PerspectiveCamera(50, size.width / size.height, 0.1, FAR)
    this.camera.position.set(0, 0, START_Z)
    this.rt = new THREE.WebGLRenderTarget(size.width * size.pixelRatio, size.height * size.pixelRatio)

    const bg = new THREE.Mesh(
      new THREE.SphereGeometry(BG_R, 32, 32),
      new THREE.MeshBasicMaterial({ color: WHITE.clone().convertLinearToSRGB(), side: THREE.BackSide, depthWrite: false }),
    )
    bg.frustumCulled = false
    this.scene.add(bg)

    // the finished room frame, copied back off the screen each frame so the white can be
    // developed out of it (exposure), not just faded over it
    this.frameTex = new THREE.FramebufferTexture(size.width * size.pixelRatio, size.height * size.pixelRatio)
    this.quadMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { tCurtain: { value: this.rt.texture }, tFrame: { value: this.frameTex }, uExposure: { value: 0 }, uHoleAlpha: { value: 1 }, uHoleScale: { value: 1 }, uAspect: { value: size.width / size.height }, uRound: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tCurtain; uniform sampler2D tFrame; uniform float uExposure; uniform float uHoleAlpha; uniform float uHoleScale; uniform float uAspect; uniform float uRound; varying vec2 vUv;
        void main() {
          // uExposure 0: everything blown out to the hero's white; 1: the room as it is. A gamma
          // lift keeps the room's structure readable all the way (no flat grey mid-fade): its
          // lines and photos are there from the first moment and the darks settle in last
          vec3 room = texture2D(tFrame, vUv).rgb;
          vec3 white = vec3(${WHITE.r.toFixed(3)}, ${WHITE.g.toFixed(3)}, ${WHITE.b.toFixed(3)});
          vec3 c = pow(max(room, vec3(1e-4)), vec3(uExposure)) * mix(white, vec3(1.0), uExposure);
          // the closing black shape (clipped back of the sphere) on top — a window onto the room
          // whose black thins out as it closes (the room's focus is driven by the page)
          float hole = 1.0 - clamp(texture2D(tCurtain, vUv).r / white.r, 0.0, 1.0);
          if (uHoleScale > 1.0) {
            // burst: the speck redrawn as an exact rhombus of the same size, scaled up — an
            // upscaled texture would show its pixels as a staircase along the edge
            vec2 p = (vUv - 0.5) * 2.0 * vec2(uAspect, 1.0);
            float d = abs(p.x) / (${SPECK_HW} * uHoleScale) + abs(p.y) / (${SPECK_HH} * uHoleScale);
            // (v=e: rounding off into a circle as it grows)
            float dc = length(p) / (${CIRCLE_R} * uHoleScale);
            d = mix(d, dc, clamp((uHoleScale - 1.0) / (${CIRCLE_BY}.0 - 1.0), 0.0, 1.0) * uRound);
            float aa = max(fwidth(d), 1e-4);
            hole = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
          }
          gl_FragColor = vec4(mix(c, room * (1.0 - uHoleAlpha), hole), 1.0);
        }`,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat)
    quad.frustumCulled = false
    this.quadScene.add(quad)
  }

  resize(size: { width: number; height: number; pixelRatio: number }): void {
    this.camera.aspect = size.width / size.height
    this.quadMat.uniforms.uAspect.value = this.camera.aspect
    this.camera.updateProjectionMatrix()
    this.rt.setSize(size.width * size.pixelRatio, size.height * size.pixelRatio)
    this.frameTex.dispose()
    this.frameTex = new THREE.FramebufferTexture(size.width * size.pixelRatio, size.height * size.pixelRatio)
    this.quadMat.uniforms.tFrame.value = this.frameTex
  }

  update(dt: number): void {
    if (this.done) return
    this.t += dt
    if (this.burst) return this.updateBurst()
    if (this.t <= CLOSE_TIME + 0.05) {
      const p = THREE.MathUtils.clamp(this.t / FALL_TIME, 0, 1)
      const ease = 1 - Math.pow(1 - p, 3) // the hero's fall
      this.camera.position.set(0, 0, THREE.MathUtils.lerp(START_Z, END_Z, ease))
      this.camera.lookAt(0, 0, 0)
    }
    // inside the shape: the black thins out as it closes, and the room behind it comes into
    // focus only at the very end, when the shape is already tiny and about to go
    const k = this.t / CLOSE_TIME
    // slow build: barely there for most of the fall, fully clear only as the shape goes
    this.quadMat.uniforms.uHoleAlpha.value = 1 - Math.pow(THREE.MathUtils.clamp(k, 0, 1), 3)
    this.focus = Math.pow(THREE.MathUtils.smoothstep(k, 0.7, 1.0), 2)
    // the page's zoom-in: the page holds zoomed out (and still) behind the shape, and only
    // starts pushing in once the shape has gone — the page's own entrance (3 s power3.out)
    const z = THREE.MathUtils.clamp((this.t - CLOSE_TIME) / ZOOM_TIME, 0, 1)
    this.zoom = 1 - Math.pow(1 - z, 3)
    // white -> room: slow at first (the eye still dazzled), then easing out as it settles
    const w = THREE.MathUtils.clamp((this.t - WHITE_START) / WHITE_TIME, 0, 1)
    this.settle = w < 0.5 ? 4 * w * w * w : 1 - Math.pow(-2 * w + 2, 3) / 2 // cubic in-out
    // the gamma lift darkens fastest at its low end — squaring it spreads the change evenly
    this.quadMat.uniforms.uExposure.value = Math.pow(w, 2)
    this.hideCurtain = this.t > CLOSE_TIME + 0.05 // shape gone: stop rendering the sphere
    if (w >= 1 && z >= 1) this.done = true
  }

  /** ?v=d: fall until the shape is tiny, then it bursts open into the scene; zoom-in after */
  private updateBurst(): void {
    if (this.burstAt < 0) {
      const u = Math.min(this.t / BURST_TIME, 1)
      const w0 = Math.log(START_Z - 20)
      const w1 = Math.log(BURST_AT_Z - 20)
      this.camera.position.set(0, 0, 20 + Math.exp(THREE.MathUtils.lerp(w0, w1, 1 - Math.pow(1 - u, 3))))
      if (this.t >= BURST_TIME + TINY_HOLD) this.burstAt = this.t // after the pause: burst
    }
    if (this.burstAt >= 0) {
      const b = (this.t - this.burstAt) / BURST_DUR
      const e = b >= 1 ? 1 : 1 - Math.pow(1 - b, 3) // power3.out: a burst, but one you can follow
      const round = this.burst === 'circle'
      this.quadMat.uniforms.uRound.value = round ? 1 : 0
      const maxScale = round
        ? (Math.hypot(this.camera.aspect, 1) / CIRCLE_R) * 1.15
        : (this.camera.aspect / SPECK_HW + 1 / SPECK_HH) * 1.3
      this.quadMat.uniforms.uHoleScale.value = Math.exp(Math.log(maxScale) * e)
      this.camera.position.set(0, 0, BURST_AT_Z) // frozen: the speck is what grows
    }
    this.camera.lookAt(0, 0, 0)
    // same build as v=c, but it lands (fully clear, sharp) at the burst
    const k = this.burstAt < 0 ? this.t / BURST_TIME : 1
    this.quadMat.uniforms.uHoleAlpha.value = 1 - Math.pow(THREE.MathUtils.clamp(k, 0, 1), 3)
    this.focus = Math.pow(THREE.MathUtils.smoothstep(k, 0.7, 1.0), 2)
    // the white just gets blown away by the burst — no exposure development
    this.quadMat.uniforms.uExposure.value = 0
    // zoom-in once the burst has filled the screen
    // (v=e: v=b's shorter zoom instead — 5.5 -> 3 in 1.4 s, smoothstep; see zoomFrom)
    const zoomTime = this.burst === 'circle' ? 1.4 : ZOOM_TIME
    const z = this.burstAt < 0 ? 0 : THREE.MathUtils.clamp((this.t - this.burstAt - BURST_DUR) / zoomTime, 0, 1)
    this.zoom = this.burst === 'circle' ? z * z * (3 - 2 * z) : 1 - Math.pow(1 - z, 3)
    this.settle = this.zoom
    if (z >= 1) this.done = true
  }

  /** lay the white-with-a-closing-hole over the finished frame */
  render(): void {
    if (this.done) return
    if (!this.hideCurtain) {
      const prevColor = this.renderer.getClearColor(new THREE.Color())
      const prevAlpha = this.renderer.getClearAlpha()
      this.renderer.setClearColor(0x000000, 1) // the clipped part of the sphere: black, as in the hero
      this.renderer.setRenderTarget(this.rt)
      this.renderer.render(this.scene, this.camera)
      this.renderer.setRenderTarget(null)
      this.renderer.setClearColor(prevColor, prevAlpha)
    }
    this.renderer.copyFramebufferToTexture(this.frameTex)
    const auto = this.renderer.autoClear
    this.renderer.autoClear = false
    this.renderer.render(this.quadScene, this.quadCam)
    this.renderer.autoClear = auto
  }
}
