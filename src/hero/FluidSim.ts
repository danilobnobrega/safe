import * as THREE from 'three'
import fullscreenVert from './shaders/fullscreen.vert'
import splatFrag from './shaders/fluid/splat.frag'
import advectionFrag from './shaders/fluid/advection.frag'
import curlFrag from './shaders/fluid/curl.frag'
import vorticityFrag from './shaders/fluid/vorticity.frag'
import divergenceFrag from './shaders/fluid/divergence.frag'
import pressureFrag from './shaders/fluid/pressure.frag'
import gradientSubtractFrag from './shaders/fluid/gradientSubtract.frag'

interface DoubleFBO {
  read: THREE.WebGLRenderTarget
  write: THREE.WebGLRenderTarget
  swap(): void
}

/**
 * An original, from-scratch GPU fluid sim (Jos Stam's "Stable Fluids" method — the
 * same textbook technique behind most WebGL cursor-fluid effects, not lifted from
 * any one site's implementation). Two velocity + one dye field, both advected,
 * projected back to divergence-free each step, with vorticity confinement so the
 * trail keeps swirling instead of smoothing itself flat.
 *
 * Runs in the same aspect-corrected 0..1 screen UV space the rest of the hero's
 * cursor tracking already uses — splat() takes a point + push direction in that
 * space and everything downstream (advection, the letter shader's read of the
 * result) stays consistent with it.
 */
export class FluidSim {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh

  private velocity: DoubleFBO
  private dye: DoubleFBO
  private pressure: DoubleFBO
  private curlRT: THREE.WebGLRenderTarget
  private divergenceRT: THREE.WebGLRenderTarget

  private simTexelSize = new THREE.Vector2()
  private aspect = 1

  private splatMat: THREE.ShaderMaterial
  private advectionMat: THREE.ShaderMaterial
  private curlMat: THREE.ShaderMaterial
  private vorticityMat: THREE.ShaderMaterial
  private divergenceMat: THREE.ShaderMaterial
  private pressureMat: THREE.ShaderMaterial
  private gradientSubtractMat: THREE.ShaderMaterial

  private readonly simRes: number
  private readonly dyeRes: number
  private readonly pressureIterations: number
  private readonly curlStrength: number
  private readonly velocityDissipation: number
  private readonly dyeDissipation: number

  constructor(
    renderer: THREE.WebGLRenderer,
    quadGeometry: THREE.BufferGeometry,
    opts: {
      simRes?: number
      dyeRes?: number
      pressureIterations?: number
      curlStrength?: number
      velocityDissipation?: number
      dyeDissipation?: number
    } = {}
  ) {
    this.renderer = renderer
    this.simRes = opts.simRes ?? 128
    this.dyeRes = opts.dyeRes ?? 512
    this.pressureIterations = opts.pressureIterations ?? 24
    this.curlStrength = opts.curlStrength ?? 22
    this.velocityDissipation = opts.velocityDissipation ?? 0.6
    this.dyeDissipation = opts.dyeDissipation ?? 0.9

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    const makeDouble = (res: number): DoubleFBO => {
      let read = new THREE.WebGLRenderTarget(res, res, rtOpts)
      let write = new THREE.WebGLRenderTarget(res, res, rtOpts)
      return {
        get read() {
          return read
        },
        get write() {
          return write
        },
        swap() {
          const t = read
          read = write
          write = t
        },
      } as DoubleFBO
    }

    this.velocity = makeDouble(this.simRes)
    this.pressure = makeDouble(this.simRes)
    this.dye = makeDouble(this.dyeRes)
    this.curlRT = new THREE.WebGLRenderTarget(this.simRes, this.simRes, rtOpts)
    this.divergenceRT = new THREE.WebGLRenderTarget(this.simRes, this.simRes, rtOpts)
    this.simTexelSize.set(1 / this.simRes, 1 / this.simRes)

    this.splatMat = this.makeMat(splatFrag, {
      uTarget: { value: null },
      uAspectRatio: { value: 1 },
      uPoint: { value: new THREE.Vector2() },
      uValue: { value: new THREE.Vector3() },
      uRadius: { value: 0.02 },
    })
    this.advectionMat = this.makeMat(advectionFrag, {
      uVelocity: { value: null },
      uSource: { value: null },
      uDt: { value: 1 / 60 },
      uDissipation: { value: 0 },
    })
    this.curlMat = this.makeMat(curlFrag, { uVelocity: { value: null }, uTexelSize: { value: this.simTexelSize } })
    this.vorticityMat = this.makeMat(vorticityFrag, {
      uVelocity: { value: null },
      uCurl: { value: null },
      uTexelSize: { value: this.simTexelSize },
      uCurlStrength: { value: this.curlStrength },
      uDt: { value: 1 / 60 },
    })
    this.divergenceMat = this.makeMat(divergenceFrag, {
      uVelocity: { value: null },
      uTexelSize: { value: this.simTexelSize },
    })
    this.pressureMat = this.makeMat(pressureFrag, {
      uPressure: { value: null },
      uDivergence: { value: null },
      uTexelSize: { value: this.simTexelSize },
    })
    this.gradientSubtractMat = this.makeMat(gradientSubtractFrag, {
      uPressure: { value: null },
      uVelocity: { value: null },
      uTexelSize: { value: this.simTexelSize },
    })

    this.quad = new THREE.Mesh(quadGeometry, this.splatMat)
    this.scene.add(this.quad)
  }

  private makeMat(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
    })
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget): void {
    this.quad.material = mat
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.camera)
  }

  setAspect(aspect: number): void {
    this.aspect = aspect
  }

  /** Push velocity + dye into the sim at `point` (0..1 uv), `dir`/`speed` from the
   *  cursor's own delta this frame. Called once per frame while the cursor is
   *  actively over the sign. */
  splat(point: THREE.Vector2, dir: THREE.Vector2, speed: number): void {
    if (speed < 1e-4) return
    const force = Math.min(speed * 12, 8)

    this.splatMat.uniforms.uAspectRatio.value = this.aspect
    this.splatMat.uniforms.uPoint.value.copy(point)
    this.splatMat.uniforms.uRadius.value = 0.02

    this.splatMat.uniforms.uTarget.value = this.velocity.read.texture
    this.splatMat.uniforms.uValue.value.set(dir.x * force, dir.y * force, 0)
    this.pass(this.splatMat, this.velocity.write)
    this.velocity.swap()

    this.splatMat.uniforms.uTarget.value = this.dye.read.texture
    this.splatMat.uniforms.uValue.value.set(1, 1, 1)
    this.splatMat.uniforms.uRadius.value = 0.015
    this.pass(this.splatMat, this.dye.write)
    this.dye.swap()
  }

  step(dt: number): void {
    const clampedDt = Math.min(dt, 1 / 30)

    this.curlMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.pass(this.curlMat, this.curlRT)

    this.vorticityMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.vorticityMat.uniforms.uCurl.value = this.curlRT.texture
    this.vorticityMat.uniforms.uDt.value = clampedDt
    this.pass(this.vorticityMat, this.velocity.write)
    this.velocity.swap()

    this.divergenceMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.pass(this.divergenceMat, this.divergenceRT)

    // clear pressure toward zero each frame (a cheap stand-in for a dedicated clear
    // pass) then relax it toward the real solution over N Jacobi iterations
    this.pressureMat.uniforms.uDivergence.value = this.divergenceRT.texture
    for (let i = 0; i < this.pressureIterations; i++) {
      this.pressureMat.uniforms.uPressure.value = this.pressure.read.texture
      this.pass(this.pressureMat, this.pressure.write)
      this.pressure.swap()
    }

    this.gradientSubtractMat.uniforms.uPressure.value = this.pressure.read.texture
    this.gradientSubtractMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.pass(this.gradientSubtractMat, this.velocity.write)
    this.velocity.swap()

    this.advectionMat.uniforms.uDt.value = clampedDt
    this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.advectionMat.uniforms.uSource.value = this.velocity.read.texture
    this.advectionMat.uniforms.uDissipation.value = this.velocityDissipation
    this.pass(this.advectionMat, this.velocity.write)
    this.velocity.swap()

    this.advectionMat.uniforms.uVelocity.value = this.velocity.read.texture
    this.advectionMat.uniforms.uSource.value = this.dye.read.texture
    this.advectionMat.uniforms.uDissipation.value = this.dyeDissipation
    this.pass(this.advectionMat, this.dye.write)
    this.dye.swap()

    this.renderer.setRenderTarget(null)
  }

  get dyeTexture(): THREE.Texture {
    return this.dye.read.texture
  }

  get velocityTexture(): THREE.Texture {
    return this.velocity.read.texture
  }

  /** zero every buffer — call once up front so the first frames don't show whatever
   *  garbage the freshly-allocated render targets started with. */
  clear(): void {
    const prev = this.renderer.getClearColor(new THREE.Color()).getHex()
    const prevAlpha = this.renderer.getClearAlpha()
    this.renderer.setClearColor(0x000000, 1)
    for (const rt of [
      this.velocity.read,
      this.velocity.write,
      this.dye.read,
      this.dye.write,
      this.pressure.read,
      this.pressure.write,
      this.curlRT,
      this.divergenceRT,
    ]) {
      this.renderer.setRenderTarget(rt)
      this.renderer.clear()
    }
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(prev, prevAlpha)
  }

  dispose(): void {
    for (const fbo of [this.velocity, this.dye, this.pressure]) {
      fbo.read.dispose()
      fbo.write.dispose()
    }
    this.curlRT.dispose()
    this.divergenceRT.dispose()
    for (const mat of [
      this.splatMat,
      this.advectionMat,
      this.curlMat,
      this.vorticityMat,
      this.divergenceMat,
      this.pressureMat,
      this.gradientSubtractMat,
    ]) {
      mat.dispose()
    }
  }
}
