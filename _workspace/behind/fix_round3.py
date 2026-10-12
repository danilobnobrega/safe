R = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    s = open(R + p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a[:140])
        s = s.replace(a, b, 1)
    open(R + p, 'w', encoding='utf-8').write(s)


# the turn a push gives: torque about the vertical = r x F (its y), positive = counter-clockwise from
# above, which is a positive rotation about +y. (These had the sign flipped: things turned against
# the push, which read as random.)
TORQUE = 'Math.sign(r.z * dir.x - r.x * dir.z)'
edit('src/behind/DeskReactions.ts', [
    ("      const spin = Math.sign(r.x * dir.z - r.z * dir.x) || 1", f"      const spin = {TORQUE} || 1"),
    ("""      yaw.v += (Math.sign(r.x * dir.z - r.z * dir.x) || 1) * amt * 1.6
      nod.v += amt * 2.2 * (Math.random() < 0.5 ? 1 : -1)""",
     f"""      yaw.v += ({TORQUE} || 1) * amt * 1.6
      // the shade tips the way it was pushed: about its hinge (its local z), by how much the push
      // runs along its local x
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).setY(0)
      nod.v += -Math.sign(side.dot(dir) || 1) * amt * 2.2"""),
])
# printer hover: the motor wakes — the panel light flares, a short hum (a few tenths of a mm, the
# whole box, no bending)
s = open(R + 'src/behind/DeskReactions.ts', encoding='utf-8').read()
i = s.index("/** the printer: a rigid box on four feet")
j = s.index("/** the desk lamp:")
s = s[:i] + '''/** the printer: brushed, its motor wakes — the panel light flares and the box hums for a moment
 *  (a fraction of a millimetre, the whole box at once: nothing bends) */
export function printerReactor(printer: THREE.Group, light?: THREE.MeshBasicMaterial): Reactor {
  const restPos = printer.position.clone()
  let hum = 0 // s of humming left
  let flare = 0
  const base = new THREE.Color(0xff9a4d)
  const hot = new THREE.Color(0xffd2a8)
  return {
    hit: printer,
    react(_dir, amt) {
      hum = Math.max(hum, 0.35 + amt * 0.25)
      flare = 1
    },
    step(dt) {
      hum = Math.max(0, hum - dt)
      flare = Math.max(0, flare - dt * 2.5)
      const a = Math.min(1, hum / 0.2) * 0.0007
      const t = performance.now() / 1000
      printer.position.set(restPos.x + Math.sin(t * 173) * a, restPos.y + Math.abs(Math.sin(t * 241)) * a * 0.6, restPos.z + Math.sin(t * 197 + 1) * a)
      if (light) light.color.copy(base).lerp(hot, flare)
    },
  }
}

''' + s[j:]
s = s.replace(" *   printer  rocks on its feet, the way it was pushed, and settles (a rigid box: nothing bends)", " *   printer  its motor wakes: the panel light flares and the box hums for a moment")
open(R + 'src/behind/DeskReactions.ts', 'w', encoding='utf-8').write(s)

edit('src/behind/PaperDesk.ts', [
    # the printer reactor is back (the new hover), and it drives the light while humming
    ("    void printer // (its hover removed — Danilo didn't like it; a new one to be agreed)\n    this.reactors = [deskReactor(desk), pensReactor(pens), this.binR, lamp]",
     "    this.reactors = [deskReactor(desk), pensReactor(pens), this.binR, printer, lamp]"),
    ("    void lid\n    return printerReactor(pr)", "    void lid\n    return printerReactor(pr, this.printerLight)"),
    # sheet swish: torque from where the cursor crossed it
    ("""            const r = new THREE.Vector3().subVectors(this.ray.ray.origin, sheet.mesh.position)
            sw.v += (Math.sign(r.x * dir.z - r.z * dir.x) || 1) * amt * 0.9""",
     f"""            const r = this.ray.ray.closestPointToPoint(sheet.mesh.position, new THREE.Vector3()).sub(sheet.mesh.position)
            sw.v += ({TORQUE} || 1) * amt * 0.9"""),
    # faster print
    ("const PRINT_WAIT = 0.6 // s: the printer taking the sheet in\nconst PRINT_FEED = 2.6 // s to feed it out",
     "const PRINT_WAIT = 0.35 // s: the printer taking the sheet in\nconst PRINT_FEED = 1.7 // s to feed it out"),
])

# the print, clean: the part of the sheet still inside the printer is cut away at the slot (a
# clipping plane), so it only ever shows coming out of it — never through the open front
edit('src/behind/PaperDesk.ts', [
    ("    this.printing = { s, t: 0 }\n    this.stepPrint(0)",
     """    this.renderer.localClippingEnabled = true
    const slotPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(this.printerFwd.clone().negate(), this.printerSlot.clone().addScaledVector(this.printerFwd, -0.002))
    m.clippingPlanes = [slotPlane.negate()]
    this.printing = { s, t: 0 }
    this.stepPrint(0)"""),
    ("""    if (k >= 1) {
      ;(m.userData.home as THREE.Vector3).copy(m.position)""", """    if (k >= 1) {
      ;(m.material as THREE.MeshStandardMaterial).clippingPlanes = null
      ;(m.userData.home as THREE.Vector3).copy(m.position)"""),
])

# only a bank shot goes in: an unseen lid over the bin stops every ball that hasn't touched anything
# since it left the hand — it bounces off the mouth as if off the rim. Once a ball has bounced off
# something (the floor, the desk, a wall of the bin), the lid isn't there for it.
edit('src/behind/PaperDesk.ts', [
    ("    fixed(RAPIER.ColliderDesc.cylinder(0.01, BIN.rBottom).setTranslation(BIN.x, 0.0, BIN.z))",
     """    fixed(RAPIER.ColliderDesc.cylinder(0.01, BIN.rBottom).setTranslation(BIN.x, 0.0, BIN.z))
    // the lid (group 2) — met only by balls still in their first flight (group 1)
    w.createCollider(
      RAPIER.ColliderDesc.cylinder(0.006, BIN.rTop + 0.01)
        .setTranslation(BIN.x, BIN.h + 0.004, BIN.z)
        .setRestitution(0.35)
        .setFriction(0.5)
        .setCollisionGroups(LID_GROUPS),
    )"""),
    ("const BALL_R = 0.033\n", "const BALL_R = 0.033\n// collision groups (membership << 16 | filter): the bin's unseen lid, a ball in its first flight, a\n// ball that has bounced off something\nconst LID_GROUPS = (0x0002 << 16) | 0x0001\nconst FLYING_GROUPS = (0x0001 << 16) | 0xffff\nconst BOUNCED_GROUPS = (0x0004 << 16) | 0xfffd\n"),
])
s = open(R + 'src/behind/PaperDesk.ts', encoding='utf-8').read()
old = "    this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3), body)\n    s.body = body"
assert old in s
s = s.replace(old, "    s.collider = this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3).setCollisionGroups(FLYING_GROUPS), body)\n    s.bounced = false\n    s.body = body", 1)
s = s.replace("interface Sheet {\n", "interface Sheet {\n  collider?: RAPIER.Collider\n  bounced?: boolean // has touched something since it left the hand (only then can it go in)\n", 1)
# detect the first bounce: a sudden change in velocity that isn't gravity
old2 = "        b.mesh.userData.pv = nv\n"
assert old2 in s
s = s.replace(old2, """        if (pv && !b.bounced && b.collider && pv.distanceTo(nv) > 0.35 && !(Math.abs(t.y - (BIN.h + 0.004)) < BALL_R + 0.02 && Math.hypot(t.x - BIN.x, t.z - BIN.z) < BIN.rTop + 0.01)) {
          // (a knock off the lid itself doesn't count: that's the miss)
          b.bounced = true
          b.collider.setCollisionGroups(BOUNCED_GROUPS)
        }
        b.mesh.userData.pv = nv
""", 1)
open(R + 'src/behind/PaperDesk.ts', 'w', encoding='utf-8').write(s)
print('ok')
