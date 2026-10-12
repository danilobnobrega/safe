p = 'C:/Users/GETÚLIO/generic/src/behind/PaperDesk.ts'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert a in s, a[:150]
    s = s.replace(a, b, 1)


# the toss exactly as Danilo first played it (the "v1" physics, 2026-10-11): direction from the
# flick, distance from the bin's own distance scaled only gently by speed, a strong pull near the bin,
# and a lob chosen to clear the desk. Seen from up here the bin's mouth and the floor behind it are
# the same spot on screen: aimed straight at it, the ball comes down a little beyond — on the floor.
# Only a bank shot (up, diagonal, left) goes in. (The invisible lid and the progressive help are gone.)
rep("""const AIM_SPEED_POW = 0.55 // how much the flick's speed matters (Danilo: hard, but not hard enough to give up)
// no help at first — the toss is honest physics, the desk's corner and the floor in play (Danilo
// found the bank shot the way in, and liked it). Then, miss after miss, an unseen pull toward the
// bin grows, so whoever keeps at it gets there: [misses, radius m, share pulled in]
const AIM_ANGLE = 50
const AIM_HELP: [number, number, number][] = [[0, 0, 0], [3, 0.12, 0.35], [5, 0.22, 0.55], [8, 0.32, 0.75]]
""", """const AIM_SPEED_POW = 0.3
const AIM_ASSIST = { r: 0.4, k: 0.85 } // within r metres of the bin a landing is drawn k of the way in
""")
rep("      const dist = binDist * THREE.MathUtils.clamp((speed / AIM_SPEED) ** AIM_SPEED_POW, 0.35, 2.2)",
    "      const dist = binDist * THREE.MathUtils.clamp((speed / AIM_SPEED) ** AIM_SPEED_POW, 0.6, 1.6)")
rep("""    const [, helpR, helpK] = AIM_HELP.filter(([n]) => this.misses >= n).pop()!
    if (off < helpR) {
      const k = helpK * (1 - off / helpR)""", """    if (off < AIM_ASSIST.r) {
      const k = AIM_ASSIST.k * (1 - off / AIM_ASSIST.r)""")
i = s.index("    // one lob, the same every time (a hand's natural toss)")
j = s.index("  // ---- the frame ----")
s = s[:i] + """    const dir = flat.clone().normalize()
    let fallback: THREE.Vector3 | null = null
    for (const deg of [48, 54, 60, 66, 72, 78]) {
      const th = THREE.MathUtils.degToRad(deg)
      const den = 2 * Math.cos(th) ** 2 * (d * Math.tan(th) - dy)
      if (den <= 0) continue
      const sp = Math.sqrt((9.81 * d * d) / den)
      const v = new THREE.Vector3(dir.x * sp * Math.cos(th), sp * Math.sin(th), dir.z * sp * Math.cos(th))
      fallback ??= v
      // it has to clear the desk on the way (the bin stands just off its corner)
      if (this.clearsDesk(p, v)) {
        out.copy(v)
        return
      }
    }
    if (fallback) out.copy(fallback)
  }

  /** whether a ball thrown from `p` at `v` stays above the desk top while it's over it */
  private clearsDesk(p: THREE.Vector3, v: THREE.Vector3): boolean {
    const top = this.deskTop + BALL_R + 0.025
    for (let t = 0.02; t < 1.6; t += 0.02) {
      const x = p.x + v.x * t
      const z = p.z + v.z * t
      const y = p.y + v.y * t - 4.905 * t * t
      if (y < 0) return true
      if (Math.abs(x) < 1.0 + BALL_R && Math.abs(z) < 0.475 + BALL_R && y < top && v.y - 9.81 * t < 0) return false
    }
    return true
  }

""" + s[j:]
# the lid out
rep("""    // the lid (group 2) — met only by balls still in their first flight (group 1)
    w.createCollider(
      RAPIER.ColliderDesc.cylinder(0.006, BIN.rTop + 0.01)
        .setTranslation(BIN.x, BIN.h + 0.004, BIN.z)
        .setRestitution(0.35)
        .setFriction(0.5)
        .setCollisionGroups(LID_GROUPS),
    )
""", "")
rep("""        if (pv && !b.bounced && b.collider && pv.distanceTo(nv) > 0.35 && !(Math.abs(t.y - (BIN.h + 0.004)) < BALL_R + 0.02 && Math.hypot(t.x - BIN.x, t.z - BIN.z) < BIN.rTop + 0.01)) {
          // (a knock off the lid itself doesn't count: that's the miss)
          b.bounced = true
          b.collider.setCollisionGroups(BOUNCED_GROUPS)
        }
""", "")
rep("// collision groups (membership << 16 | filter): the bin's unseen lid, a ball in its first flight, a\n// ball that has bounced off something\nconst LID_GROUPS = (0x0002 << 16) | 0x0001\nconst FLYING_GROUPS = (0x0001 << 16) | 0xffff\nconst BOUNCED_GROUPS = (0x0004 << 16) | 0xfffd\n", "")
rep("    s.collider = this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3).setCollisionGroups(FLYING_GROUPS), body)\n    s.bounced = false\n",
    "    this.world!.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setDensity(30).setFriction(0.9).setRestitution(0.3), body)\n")
rep("  collider?: RAPIER.Collider\n  bounced?: boolean // has touched something since it left the hand (only then can it go in)\n", "")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
