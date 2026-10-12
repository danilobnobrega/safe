  /** the printer, in chalk: its back tray, output tray and body found by size and place; a light
   *  on its panel (one of its buttons) that blinks orange while a print is waiting */
  private buildPrinter(src: THREE.Object3D): Reactor {
    const pr = flatten(src)
    const vol = (m: THREE.Mesh) => {
      const s = m.geometry.boundingBox!.getSize(new THREE.Vector3())
      return s.x * s.y * s.z
    }
    const parts = [...(pr.children as THREE.Mesh[])].sort((a, b) => vol(b) - vol(a))
    const body = parts[0]
    const trays = parts.slice(1, 3).sort((a, b) => (a.userData.rest as THREE.Vector3).z - (b.userData.rest as THREE.Vector3).z)
    const [inTray, outTray] = trays // the back one feeds, the front one catches
    const button = parts[parts.length - 1]
    pr.scale.setScalar(PRINTER_SCALE)
    const bb = new THREE.Box3().setFromObject(pr)
    pr.position.set(PRINTER_AT.x, this.deskTop - bb.min.y, PRINTER_AT.z)
    pr.rotation.y = PRINTER_AT.yaw
    this.addChalk(pr)
    this.printerLight = new THREE.MeshBasicMaterial({ color: 0xff9a4d })
    button.material = this.printerLight
    // where a sheet comes out: the front tray's back edge, just above it (the printer faces +z)
    pr.updateMatrixWorld(true)
    const ob = outTray.geometry.boundingBox!.clone().translate(outTray.userData.rest as THREE.Vector3)
    this.printerSlot.set((ob.min.x + ob.max.x) / 2, ob.max.y + 0.004, ob.min.z)
    pr.localToWorld(this.printerSlot)
    this.printerFwd.set(0, 0, 1).applyQuaternion(pr.quaternion)
    this.printer = pr
    return printerReactor(pr, inTray, outTray, body)
  }

  /** a knock on the desk top: everything lying on it hops */
  private bumpDesk(amt: number): void {
    for (const r of this.reactors) r.bump?.(amt)
    for (const q of this.sheets) {
      if (q.body) {
        const t = q.body.translation()
        if (Math.abs(t.y - (this.deskTop + BALL_R)) < 0.02) q.body.applyImpulse({ x: 0, y: q.body.mass() * amt * 0.7, z: 0 }, true)
      } else if (q !== this.held) (q.mesh.userData.hop as Spring).v += amt * 0.18
    }
  }

  /** the sheets lying on the desk (not in the hand, not thrown, not printing): their hop and swish */
  private stepSheetsAtRest(): void {
    for (const q of this.sheets) {
      if (q.body || q === this.held || q === this.printing?.s || this.state === 'intro' || q.scored) continue
      if (q.mesh.userData.settle) continue
      q.mesh.position.y = this.deskTop + 0.0012 + q.crumple * BALL_R * 0.9 + Math.max(0, (q.mesh.userData.hop as Spring).x)
      q.mesh.rotation.y = this.sheetYaw + (q.mesh.userData.yaw as Spring).x
    }
  }

  /** the cursor brushing things — each answers its own way — and every spring settling back */
  private stepReactions(dt: number): void {
    const now = performance.now()
    const speed = this.ptrVel.length()
    if (this.state === 'play' && !this.held && speed > 40) {
      const amt = THREE.MathUtils.clamp(speed / 1300, 0.25, 1.4)
      // the cursor's way, laid on the floor (the camera's right and its flattened forward)
      const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize()
      const fwd = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize()
      const dir = right.multiplyScalar(this.ptrVel.x).addScaledVector(fwd, -this.ptrVel.y).normalize()
      const sheet = this.pick(this.pointer.x, this.pointer.y)
      if (sheet && sheet !== this.printing?.s) {
        if (now - (this.lastReact.get(sheet) ?? 0) > 120) {
          this.lastReact.set(sheet, now)
          if (sheet.body) {
            // a ball lying about: rolls off the cursor
            const m = sheet.body.mass()
            sheet.body.applyImpulse({ x: dir.x * m * amt * 0.9, y: m * 0.25, z: dir.z * m * amt * 0.9 }, true)
          } else {
            // the sheet on the desk: swished round a little, as a draught would
            const sw = sheet.mesh.userData.yaw as Spring
            const r = new THREE.Vector3().subVectors(this.ray.ray.origin, sheet.mesh.position)
            sw.v += (Math.sign(r.x * dir.z - r.z * dir.x) || 1) * amt * 0.9
          }
        }
      } else {
        this.ray.setFromCamera(this.toNdc(this.pointer.x, this.pointer.y), this.camera)
        const hits = this.ray.intersectObjects(this.reactors.map((r) => r.hit), true)
        if (hits.length) {
          const h = hits[0]
          const r = this.reactors.find((q) => {
            let o: THREE.Object3D | null = h.object
            while (o && o !== q.hit) o = o.parent
            return !!o
          })
          if (r && now - (this.lastReact.get(h.object) ?? 0) > 120) {
            this.lastReact.set(h.object, now)
            r.react(dir, amt, h.point, h.object)
          }
        }
      }
    }
    for (const r of this.reactors) r.step(dt)
    const h = Math.min(dt, 1 / 30)
    for (const q of this.sheets) {
      ;(q.mesh.userData.yaw as Spring).step(h)
      ;(q.mesh.userData.hop as Spring).step(h)
    }
    // the printer's light: blinks while it has something to give
    if (this.printerLight) {
      const waiting = this.state === 'play' && !this.active && !this.printing
      const on = !waiting || Math.sin(performance.now() / 160) > -0.2
      this.printerLight.color.set(on ? 0xff9a4d : 0x3a2a20)
    }
  }

  private overPrinter(x: number, y: number): boolean {
    if (!this.printer) return false
    this.ray.setFromCamera(this.toNdc(x, y), this.camera)
    return this.ray.intersectObject(this.printer, true).length > 0
  }

  /** the next draft, out of the printer: fed out of its slot, then laid on the desk */
  private startPrint(): void {
    this.draft++
    const s = this.addSheet(this.draftTexture(this.draft))
    const m = s.mesh.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = PAPER_GLOW
    m.color.setScalar(1)
    this.printing = { s, t: 0 }
    this.stepPrint(0)
  }

  private stepPrint(dt: number): void {
    const pr = this.printing
    if (!pr) return
    pr.t += dt
    const m = pr.s.mesh
    const feed = THREE.MathUtils.clamp(pr.t / PRINT_FEED, 0, 1)
    // fed out a line at a time: little steps, as a printer's rollers go
    const stepped = (Math.floor(feed * 14) + THREE.MathUtils.smoothstep((feed * 14) % 1, 0.6, 1)) / 14
    const out = new THREE.Vector3().copy(this.printerSlot).addScaledVector(this.printerFwd, (stepped - 0.5) * SHEET_H)
    if (pr.t <= PRINT_FEED) {
      m.position.copy(out)
      m.rotation.y = this.printer!.rotation.y
      return
    }
    // then picked up and laid where the sheets go
    const end = new THREE.Vector3().copy(this.printerSlot).addScaledVector(this.printerFwd, 0.5 * SHEET_H)
    const k = THREE.MathUtils.clamp((pr.t - PRINT_FEED - 0.25) / PRINT_LAY, 0, 1)
    const e = k * k * (3 - 2 * k)
    const to = new THREE.Vector3(this.sheetSpot.x, this.deskTop + 0.0012, this.sheetSpot.z)
    m.position.lerpVectors(end, to, e)
    m.position.y += Math.sin(e * Math.PI) * 0.06
    m.rotation.y = THREE.MathUtils.lerp(this.printer!.rotation.y, this.sheetYaw, e)
    if (k >= 1) {
      this.active = pr.s
      this.printing = undefined
    }
  }

