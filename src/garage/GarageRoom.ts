import * as THREE from 'three'
import { groundMaterial, linesMaterial, normalMaterial, raw, type Globals } from './materials'

/**
 * The room: one GLB drawn twice (normals pass -> chalk pass), a floor that shows a
 * blurred mirror render, two slowly counter-rotating rings of photos (the only thing
 * that blooms), and two faint photo bands on far cylinders. Built after the
 * steven.com /creator-media room, dark theme — values and order of passes match it.
 *
 * Per frame (renderPipeline):
 *   1 sceneNormal  -> rtNormal (full res)       tNormal for the Sobel
 *   2 sceneDefault with the mirror camera -> rtMirror (1/4) ; H + V blur -> 1/10
 *     (the mirror camera does NOT see layer 2 = the drawings; only photos reflect)
 *   3 sceneDefault -> rtDefault (full)
 *   4 everything not on layer 1 painted black -> rtBloom (1/4)
 */
export class GarageRoom {
  readonly sceneNormal = new THREE.Scene()
  readonly sceneDefault = new THREE.Scene()
  readonly rtDefault: THREE.WebGLRenderTarget
  readonly rtBloom: THREE.WebGLRenderTarget
  private rtNormal: THREE.WebGLRenderTarget
  private rtMirror: THREE.WebGLRenderTarget
  private rtHBlur: THREE.WebGLRenderTarget
  private rtVBlur: THREE.WebGLRenderTarget

  private bloomLayer = new THREE.Layers()
  private darkMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) })
  private stash = new Map<string, THREE.Material | THREE.Material[]>()

  private quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private hBlurScene = new THREE.Scene()
  private vBlurScene = new THREE.Scene()
  private hBlurMat: THREE.ShaderMaterial
  private vBlurMat: THREE.ShaderMaterial

  private groundMat?: THREE.ShaderMaterial
  private pictures: THREE.Group

  constructor(
    private renderer: THREE.WebGLRenderer,
    private globals: Globals,
    size: { width: number; height: number; pixelRatio: number },
    tex: { photos: THREE.Texture; concrete: THREE.Texture },
    private concrete = tex.concrete,
  ) {
    this.bloomLayer.set(1)
    const bg = raw(0x121212)
    this.sceneDefault.background = bg
    this.sceneDefault.fog = new THREE.Fog(bg, 3, 31)

    const { width: w, height: h, pixelRatio: pr } = size
    this.rtDefault = new THREE.WebGLRenderTarget(w * pr, h * pr)
    this.rtMirror = new THREE.WebGLRenderTarget(w * 0.25, h * 0.25)
    this.rtNormal = new THREE.WebGLRenderTarget(w * pr, h * pr)
    this.rtBloom = new THREE.WebGLRenderTarget(w * 0.25, h * 0.25)
    this.rtHBlur = new THREE.WebGLRenderTarget(w * 0.1, h * 0.1)
    this.rtVBlur = new THREE.WebGLRenderTarget(w * 0.1, h * 0.1)

    const blurMat = (dir: string) =>
      new THREE.ShaderMaterial({
        uniforms: { ...this.globals, tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(w, h) } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          #include <garage_gaussian>
          #include <garage_blur>
          varying vec2 vUv;
          uniform sampler2D tDiffuse;
          uniform vec2 uTexel;
          uniform float REFLECTION_BLUR_STRENGTH;
          uniform float REFLECTION_BLUR_SAMPLES;
          uniform float REFLECTION_GROUND_BLUR_STRETCH;
          void main() {
            gl_FragColor = blur(tDiffuse, vUv, uTexel, ${dir}, REFLECTION_BLUR_SAMPLES, REFLECTION_BLUR_STRENGTH);
          }`,
      })
    this.hBlurMat = blurMat('vec2(1.0, 0.0)')
    this.vBlurMat = blurMat('vec2(0.0, 1.0 + REFLECTION_GROUND_BLUR_STRETCH)')
    const quad = new THREE.PlaneGeometry(2, 2)
    this.hBlurScene.add(new THREE.Mesh(quad, this.hBlurMat))
    this.vBlurScene.add(new THREE.Mesh(quad, this.vBlurMat))

    this.pictures = this.makePictures(tex.photos)
    this.sceneDefault.add(this.pictures)
  }

  /**
   * Photos (9:16, atlas 4 x 6) standing in COLUMNS around the set: the same 2 x 9 angular
   * slots the original rings used, but the ring no longer turns — each column is a stack
   * of photos sliding vertically, neighbouring columns in opposite directions, looping.
   * They sink through the floor line (soft cut in the shader) and re-enter above the frame.
   * Every other ring is desaturated, as before. Only these bloom (layer 1).
   */
  private makePictures(photos: THREE.Texture): THREE.Group {
    const root = new THREE.Group()
    root.scale.set(1, 0.9, 1) // x/z in metres: the ellipse is built explicitly below
    const N = GarageRoom.COL_COUNT
    const AX = GarageRoom.RING_AX
    const AZ = GarageRoom.RING_AZ
    type Spec = { x: number; z: number; rotY: number; curl: number; dir: number }
    // an elliptical cylinder (sides AX, back AZ): columns spaced by EQUAL ARC LENGTH along it,
    // first one dead behind the set (-Z) so left and right mirror about the camera axis
    const front: Spec[] = GarageRoom.equalArcAngles(N, AX, AZ, Math.PI).map((t, i) => ({
      x: Math.sin(t) * AX,
      z: Math.cos(t) * AZ,
      // tangent to the cylinder: face along the INWARD normal of the ellipse at this point
      rotY: Math.atan2(-Math.sin(t) / AX, -Math.cos(t) / AZ),
      // follow the cylinder: its curvature at t, exaggerated, plus a base curl
      curl:
        ((AX * AZ) / Math.pow(AX * AX * Math.cos(t) ** 2 + AZ * AZ * Math.sin(t) ** 2, 1.5)) * GarageRoom.CURL_GAIN +
        GarageRoom.CURL_BASE,
      dir: i % 2 ? 1 : -1, // neighbours go opposite ways
    }))
    const sets: { specs: Spec[]; sat: number; dim: number; scale: number; idxOff: number; speed: number }[] = [
      { specs: front.filter((_, i) => i % 2 === 0), sat: 1, dim: 1, scale: 1.6, idxOff: 0, speed: 1 },
      { specs: front.filter((_, i) => i % 2 === 1), sat: 0.25, dim: 1, scale: 1.6, idxOff: 11, speed: 1 },
    ]
    {
      // one smaller, dimmer column in every gap between two front columns, on a circle further
      // out — placed on the CAMERA's line of sight through the gap's midpoint, so it reads
      // centred in the gap on screen, not just by angle
      const R = GarageRoom.BACK_R
      const cz = 3
      const back: Spec[] = front.map((A, i) => {
        const B = front[(i + 1) % N]
        const mx = (A.x + B.x) / 2
        const mz = (A.z + B.z) / 2
        const L = Math.hypot(mx, mz - cz)
        const ux = mx / L
        const uz = (mz - cz) / L
        const reach = -cz * uz + Math.sqrt(cz * cz * uz * uz - cz * cz + R * R)
        const x = ux * reach
        const z = cz + uz * reach
        return {
          x,
          z,
          rotY: Math.atan2(-x, -z),
          curl: (1 / R) * GarageRoom.CURL_GAIN + GarageRoom.CURL_BASE,
          dir: i % 2 ? -1 : 1,
        }
      })
      // half speed: parallax (further = slower), and it keeps a back column from reading as a
      // copy of whichever front neighbour happens to share its direction
      sets.push({ specs: back, sat: 0.5, dim: 0.45, scale: 1.0, idxOff: 5, speed: GarageRoom.BACK_SPEED })
    }

    const PER = GarageRoom.COL_PER
    for (const set of sets) {
      // subdivided so it can bend: a pliable sheet, not a rigid card
      const geo = new THREE.PlaneGeometry(1.305, 2.32, 24, 36)
      const count = set.specs.length * PER
      const idx = new Float32Array(count)
      const curl = new Float32Array(count)
      for (let i = 0; i < count; i++) {
        idx[i] = (i * 5 + set.idxOff) % 24
        curl[i] = set.specs[Math.floor(i / PER)].curl * set.scale // in the sheet's local units
      }
      geo.setAttribute('aIndex', new THREE.InstancedBufferAttribute(idx, 1))
      geo.setAttribute('aCurl', new THREE.InstancedBufferAttribute(curl, 1))
      const inst = new THREE.InstancedMesh(geo, this.photoMaterial(photos, set.sat, set.dim), count)
      inst.layers.enable(1)
      inst.frustumCulled = false
      set.specs.forEach((sp, c) => {
        this.columns.push({
          inst,
          first: c * PER,
          x: sp.x,
          z: sp.z,
          rotY: sp.rotY,
          scale: set.scale,
          dir: sp.dir,
          phase: Math.random() * GarageRoom.COL_SPAN,
          speed: set.speed,
        })
      })
      root.add(inst)
    }
    return root
  }

  private photoMaterial(photos: THREE.Texture, saturation: number, dim: number): THREE.ShaderMaterial {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        tDiffuse: { value: photos },
        uSaturation: { value: saturation },
        uDim: { value: dim },
        // GENERIC: the scanner entrance reveals the ring too
        REVEAL_ON: this.globals.REVEAL_ON,
        REVEAL_Y: this.globals.REVEAL_Y,
        SCAN_COLOR: this.globals.SCAN_COLOR,
        FOCUS_OUT: this.globals.FOCUS_OUT,
      },
      vertexShader: /* glsl */ `
        attribute float aIndex;
        attribute float aCurl;
        varying float vIndex;
        varying vec2 vUv;
        varying float vWorldY;
        varying vec3 vWorldPos;
        varying vec3 vN;
        void main() {
          vIndex = aIndex;
          vUv = uv;
          vec3 p = position;
          // cylinder bend along the width (toward the ring's centre = the sheet's +Z)
          p.z += 0.5 * aCurl * p.x * p.x;
          float dzdx = aCurl * p.x;
          vec3 nLocal = normalize(vec3(-dzdx, 0.0, 1.0));
          mat4 m = modelMatrix * instanceMatrix;
          vec4 world = m * vec4(p, 1.0);
          vWorldY = world.y;
          vWorldPos = world.xyz;
          vN = normalize(mat3(m) * nLocal);
          gl_Position = projectionMatrix * viewMatrix * world;
        }`,
      fragmentShader: /* glsl */ `
        vec3 saturateColor(vec3 color, float saturation) {
          const vec3 luminanceWeights = vec3(0.299, 0.587, 0.114);
          float gray = dot(color, luminanceWeights);
          return mix(vec3(gray), color, saturation);
        }
        #include <garage_getGridUv>
        varying vec2 vUv;
        varying float vIndex;
        varying float vWorldY;
        varying vec3 vWorldPos;
        varying vec3 vN;
        uniform sampler2D tDiffuse;
        uniform float uSaturation;
        uniform float uDim;
        uniform float REVEAL_ON;
        uniform float REVEAL_Y;
        uniform vec3 SCAN_COLOR;
        uniform float FOCUS_OUT;
        void main() {
          float a = 1.0;
          if (cameraPosition.y < 0.0) {
            // mirror pass (camera under the floor): nothing below the floor gets reflected
            if (vWorldY < 0.0) discard;
          } else {
            // the VISIBLE floor is the reference and it is OPAQUE out to where it stops being
            // visible (it is black and only shows through its reflections, gone by ~4.3-4.9 m):
            // a photo only shows once it has risen above the floor's far edge, gradually
            vec3 rd = vWorldPos - cameraPosition;
            if (rd.y < 0.0) {
              float sHit = -cameraPosition.y / rd.y;
              if (sHit < 1.0) {
                vec2 hit = cameraPosition.xz + rd.xz * sHit;
                a *= smoothstep(4.3, 4.9, length(hit));
              }
            }
            if (a <= 0.003) discard;
          }
          vec3 color = texture2D(tDiffuse, getGridUv(vUv, vec2(4.0, 6.0), vIndex)).rgb;
          color = saturateColor(color, uSaturation);
          // light the sheet so its curve and tilt read
          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 N = normalize(vN);
          float facing = abs(dot(N, V));
          float shade = mix(0.28, 1.06, pow(facing, 2.0));
          vec3 L = normalize(vec3(0.3, 0.8, 0.5));
          float sheen = pow(max(abs(dot(N, normalize(V + L))), 0.0), 36.0) * 0.14;
          vec3 outc = (color * shade + sheen) * uDim;
          if (REVEAL_ON > 0.0) {
            // scanner entrance: only what's above the sweeping plane exists; the plane itself
            // shows as a thin orange contour across the sheets
            float d = vWorldY - REVEAL_Y;
            float line = min(exp(-d * d / 0.004), 1.0); // wider than on the set: it's metres away
            a *= mix(1.0, smoothstep(-0.02, 0.02, d), REVEAL_ON);
            outc = mix(outc, SCAN_COLOR, line * REVEAL_ON);
            a = max(a, line * REVEAL_ON);
          }
          a *= 1.0 - FOCUS_OUT; // garage-focus: the photo ring empties out too
          gl_FragColor = vec4(outc, a);
        }`,
    })
    mat.dithering = true
    return mat
  }

  /** n parameters t on the ellipse (ax sin t, az cos t) whose consecutive points are the same
   *  arc length apart, starting at t0 */
  private static equalArcAngles(n: number, ax: number, az: number, t0: number): number[] {
    const STEPS = 4096
    const cum = [0]
    let px = ax * Math.sin(t0)
    let pz = az * Math.cos(t0)
    for (let k = 1; k <= STEPS; k++) {
      const t = t0 + (2 * Math.PI * k) / STEPS
      const x = ax * Math.sin(t)
      const z = az * Math.cos(t)
      cum.push(cum[k - 1] + Math.hypot(x - px, z - pz))
      px = x
      pz = z
    }
    const total = cum[STEPS]
    const out: number[] = []
    let k = 0
    for (let i = 0; i < n; i++) {
      const target = (total * i) / n
      while (cum[k + 1] < target) k++
      const f = (target - cum[k]) / (cum[k + 1] - cum[k] || 1)
      out.push(t0 + (2 * Math.PI * (k + f)) / STEPS)
    }
    return out
  }

  // column motion (root-local units; the root is scaled 0.9 in y)
  private static readonly RING_AX = 13 // ring semi-axis at the sides (m)
  private static readonly RING_AZ = 23 // ring semi-axis front/back (m) — the original's 0.7 / 1.25 proportions, further out
  private static readonly COL_COUNT = 18 // columns, equal arc length apart
  private static readonly BACK_R = 27 // circle of the in-between back columns (m)
  private static readonly BACK_SPEED = 0.5 // back columns move at this share of the front speed
  // pliable sheets: bend = ellipse curvature x CURL_GAIN + CURL_BASE (1/m), ripple amplitude (local units)
  private static readonly CURL_GAIN = 2.5
  private static readonly CURL_BASE = 0.1
  private static readonly COL_PER = 6 // photos per column: same ~5.2 spacing as before over the taller loop
  private static readonly COL_MIN = -8 // wrap range: well behind the visible floor on screen ...
  private static readonly COL_SPAN = 31 // ... to above the top of the frame even for the back columns (top ~20)
  private static readonly COL_SPEED = 0.35 // units / s
  private columns: {
    inst: THREE.InstancedMesh
    first: number
    x: number
    z: number
    rotY: number
    scale: number
    dir: number
    phase: number
    speed: number // multiplier on COL_SPEED
  }[] = []
  private dummy = new THREE.Object3D()

  private updateColumns(elapsed: number): void {
    const gap = GarageRoom.COL_SPAN / GarageRoom.COL_PER
    const touched = new Set<THREE.InstancedMesh>()
    for (const c of this.columns) {
      for (let j = 0; j < GarageRoom.COL_PER; j++) {
        const t = c.phase + j * gap + c.dir * GarageRoom.COL_SPEED * c.speed * elapsed
        const y = GarageRoom.COL_MIN + (((t % GarageRoom.COL_SPAN) + GarageRoom.COL_SPAN) % GarageRoom.COL_SPAN)
        const d = this.dummy
        d.position.set(c.x, y, c.z)
        d.scale.setScalar(c.scale)
        d.rotation.set(0, c.rotY, 0)
        d.updateMatrix()
        c.inst.setMatrixAt(c.first + j, d.matrix)
      }
      touched.add(c.inst)
    }
    touched.forEach((m) => (m.instanceMatrix.needsUpdate = true))
  }

  /** the set: every mesh goes in twice (normal pass + chalk pass); "ground" becomes the reflector */
  setModel(model: THREE.Object3D): void {
    const normalObject = model.clone(true)
    normalObject.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.name.includes('ground')) m.visible = false
      else m.material = normalMaterial(this.globals, (m as THREE.InstancedMesh).isInstancedMesh === true)
    })
    this.sceneNormal.add(normalObject)

    const defaultObject = model.clone(true)
    defaultObject.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      if (m.name.includes('ground')) {
        const ao = ((m.material as THREE.MeshStandardMaterial).map ?? null) as THREE.Texture | null
        if (ao) ao.colorSpace = THREE.NoColorSpace
        this.groundMat = groundMaterial(this.globals, this.concrete, ao)
        m.material = this.groundMat
      } else {
        m.layers.set(2)
        m.material = linesMaterial(this.globals, (m as THREE.InstancedMesh).isInstancedMesh === true)
      }
    })
    this.sceneDefault.add(defaultObject)
  }

  resize(size: { width: number; height: number; pixelRatio: number }): void {
    const { width: w, height: h, pixelRatio: pr } = size
    this.rtDefault.setSize(w * pr, h * pr)
    this.rtMirror.setSize(w * 0.25, h * 0.25)
    this.rtNormal.setSize(w * pr, h * pr)
    this.rtBloom.setSize(w * 0.25, h * 0.25)
    this.rtHBlur.setSize(w * 0.1, h * 0.1)
    this.rtVBlur.setSize(w * 0.1, h * 0.1)
    // NB: the reflector blur texel stays at the construction-time size, as in the original
  }

  renderPipeline(camera: THREE.Camera, cameraMirror: THREE.Camera): void {
    const r = this.renderer
    r.setRenderTarget(this.rtNormal)
    r.render(this.sceneNormal, camera)
    this.globals.tNormal.value = this.rtNormal.texture

    r.setRenderTarget(this.rtMirror)
    r.render(this.sceneDefault, cameraMirror)
    this.hBlurMat.uniforms.tDiffuse.value = this.rtMirror.texture
    r.setRenderTarget(this.rtHBlur)
    r.render(this.hBlurScene, this.quadCam)
    this.vBlurMat.uniforms.tDiffuse.value = this.rtHBlur.texture
    r.setRenderTarget(this.rtVBlur)
    r.render(this.vBlurScene, this.quadCam)
    if (this.groundMat) this.groundMat.uniforms.tDiffuse.value = this.rtVBlur.texture

    r.setRenderTarget(this.rtDefault)
    r.render(this.sceneDefault, camera)

    this.sceneDefault.traverse(this.darken)
    r.setRenderTarget(this.rtBloom)
    r.render(this.sceneDefault, camera)
    this.sceneDefault.traverse(this.restore)
  }

  private darken = (o: THREE.Object3D): void => {
    const m = o as THREE.Mesh
    if (m.isMesh && this.bloomLayer.test(m.layers) === false) {
      this.stash.set(m.uuid, m.material)
      m.material = this.darkMaterial
    }
  }

  private restore = (o: THREE.Object3D): void => {
    const m = o as THREE.Mesh
    const s = this.stash.get(m.uuid)
    if (s) {
      m.material = s
      this.stash.delete(m.uuid)
    }
  }

  /** columns and bands are driven by elapsed time only */
  update(elapsed: number): void {
    this.updateColumns(elapsed)
  }
}
