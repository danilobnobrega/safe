import * as THREE from 'three'

/** the mouse in -1..1 (y up), eased at two rates: the camera look and the hover beam */
export class EasedMouse {
  readonly target = new THREE.Vector2()
  readonly normalized = new THREE.Vector2() // camera look (0.05)
  readonly normalized1 = new THREE.Vector2() // hover beam (0.1)

  constructor() {
    // viewport coordinates (the room's hover only runs with the page at the top)
    document.addEventListener('mousemove', (e) => {
      this.target.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
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
