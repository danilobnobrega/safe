import * as THREE from 'three'

/** eased pointer, in NDC (-1..1, y up), damped like the original (lambda per 100x-seconds) */
export class EasedMouse {
  readonly target = new THREE.Vector2()
  readonly normalized = new THREE.Vector2() // camera look (0.05)
  readonly normalized1 = new THREE.Vector2() // cursor line (0.1)

  constructor() {
    document.addEventListener('mousemove', (e) => {
      this.target.set((e.clientX / window.innerWidth) * 2 - 1, -(e.pageY / window.innerHeight) * 2 + 1)
    })
    document.addEventListener('touchmove', (e) => {
      const t = e.touches[0]
      if (t) this.target.set((t.clientX / window.innerWidth) * 2 - 1, -(t.clientY / window.innerHeight) * 2 + 1)
    })
  }

  update(delta: number): void {
    const d = THREE.MathUtils.damp
    this.normalized.set(d(this.normalized.x, this.target.x, 0.05, delta), d(this.normalized.y, this.target.y, 0.05, delta))
    this.normalized1.set(d(this.normalized1.x, this.target.x, 0.1, delta), d(this.normalized1.y, this.target.y, 0.1, delta))
  }
}

interface TrailPoint {
  position: THREE.Vector3
  time: number
  widthScale: number
}

/**
 * The hover: the cursor draws a short white ribbon (0.15 s of history) on a huge invisible
 * cylinder around the set, seen through the room camera, into its own target. The screen
 * pass then cuts it with a pencil-scribble texture and jitters it every 250 ms, so it reads
 * as a chalk mark that keeps getting re-drawn.
 */
export class CursorLine {
  readonly renderTarget: THREE.WebGLRenderTarget
  private scene = new THREE.Scene()
  private raycaster = new THREE.Raycaster()
  private raycasterMesh: THREE.Mesh
  private trail: TrailPoint[] = []
  private trailLife = 0.15
  private trailWidth = 0.2
  private maxPoints = 200
  private mesh: THREE.Mesh
  private tangent = new THREE.Vector3()
  private viewDir = new THREE.Vector3()
  private normal = new THREE.Vector3()

  constructor(private renderer: THREE.WebGLRenderer, size: { width: number; height: number; pixelRatio: number }) {
    this.renderTarget = new THREE.WebGLRenderTarget(size.width * size.pixelRatio, size.height * size.pixelRatio)
    this.raycasterMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(50, 50, 10, 8, 1, false),
      new THREE.MeshBasicMaterial({ wireframe: true, side: THREE.BackSide }),
    )
    this.raycasterMesh.visible = false
    this.scene.add(this.raycasterMesh)

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.maxPoints * 2 * 3), 3))
    const index: number[] = []
    for (let J = 0; J < this.maxPoints - 1; J++) {
      const G = J * 2
      index.push(G, G + 1, G + 2, G + 2, G + 1, G + 3)
    }
    geo.setIndex(index)
    geo.setDrawRange(0, 0)
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uColor: { value: new THREE.Color(0xffffff).convertLinearToSRGB() } },
        vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }',
      }),
    )
    this.mesh.frustumCulled = false
    this.scene.add(this.mesh)
  }

  resize(size: { width: number; height: number; pixelRatio: number }): void {
    this.renderTarget.setSize(size.width * size.pixelRatio, size.height * size.pixelRatio)
  }

  update(mouse: THREE.Vector2, camera: THREE.Camera, elapsed: number): void {
    // the invisible cylinder is never added to the render; raycast needs its world matrix
    this.raycasterMesh.updateMatrixWorld()
    this.raycaster.setFromCamera(mouse, camera)
    const hit = this.raycaster.intersectObject(this.raycasterMesh)
    if (hit.length > 0) this.trail.push({ position: hit[0].point.clone(), time: elapsed, widthScale: 0.5 + Math.random() })
    this.trail = this.trail.filter((p) => elapsed - p.time < this.trailLife)
    if (this.trail.length > this.maxPoints) this.trail = this.trail.slice(this.trail.length - this.maxPoints)
    this.updateGeometry(camera)
  }

  private updateGeometry(camera: THREE.Camera): void {
    const g = this.mesh.geometry
    if (this.trail.length < 2) {
      g.setDrawRange(0, 0)
      return
    }
    const arr = (g.attributes.position as THREE.BufferAttribute).array as Float32Array
    const cam = camera.position
    for (let J = 0; J < this.trail.length; J++) {
      const P = this.trail[J]
      const I = P.position
      const half = (this.trailWidth * (P.widthScale || 1)) / 2
      if (J < this.trail.length - 1) this.tangent.subVectors(this.trail[J + 1].position, I)
      else if (J > 0) this.tangent.subVectors(I, this.trail[J - 1].position)
      else this.tangent.set(0, 1, 0)
      this.viewDir.subVectors(cam, I)
      this.normal.crossVectors(this.tangent, this.viewDir).normalize().multiplyScalar(half)
      const Z = J * 6
      arr[Z] = I.x - this.normal.x
      arr[Z + 1] = I.y - this.normal.y
      arr[Z + 2] = I.z - this.normal.z
      arr[Z + 3] = I.x + this.normal.x
      arr[Z + 4] = I.y + this.normal.y
      arr[Z + 5] = I.z + this.normal.z
    }
    g.attributes.position.needsUpdate = true
    g.setDrawRange(0, (this.trail.length - 1) * 6)
  }

  render(camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.renderTarget)
    this.renderer.render(this.scene, camera)
  }
}
