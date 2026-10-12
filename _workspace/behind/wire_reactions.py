p = 'C:/Users/GETÚLIO/generic/src/behind/PaperDesk.ts'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    assert a in s, a[:200]
    s = s.replace(a, b, 1)


def cut(start, end_marker):
    global s
    i = s.index(start)
    j = s.index(end_marker, i)
    s = s[:i] + s[j:]


rep("import { DRAWN_GLSL, type Drawn } from '../hero/Drawn'\n",
    "import { DRAWN_GLSL, type Drawn } from '../hero/Drawn'\nimport { Spring, flatten, deskReactor, pensReactor, binReactor, printerReactor, type Reactor } from './DeskReactions'\n")
cut("/** a thing on (or by) the desk that the cursor brushes", "interface Sheet {")
rep("  private bin?: THREE.Object3D\n  private wobblies: Wobbly[] = []\n",
    "  private reactors: Reactor[] = []\n  private binR?: ReturnType<typeof binReactor>\n  private lastReact = new Map<object, number>()\n"
    "  // the printer: click it and the next draft comes out (Danilo's idea, 2026-10-11)\n"
    "  private printer?: THREE.Group\n  private printerLight?: THREE.MeshBasicMaterial\n"
    "  private printing?: { s: Sheet; t: number }\n  private printerFwd = new THREE.Vector3()\n  private printerSlot = new THREE.Vector3()\n")
rep("""    const [desk, lamp, pens, crumple] = await Promise.all([
      glb('metal_office_desk'),
      glb('desk_lamp_arm_01'),
      glb('stationery_supplies'),""", """    const [deskSrc, pensSrc, printerSrc, crumple] = await Promise.all([
      glb('metal_office_desk'),
      glb('stationery_supplies'),
      loader.loadAsync(`${BASE}models/printer/printer.glb`).then((g) => g.scene),""")
a = s[s.index("    // the desk: its top centred on the origin, front edge toward the camera (+z)"):s.index("    const floor = new THREE.Mesh(")]
b = """    // the desk: its top centred on the origin, front edge toward the camera (+z). Every model is
    // flattened into its parts (each centred on itself) so each part can move on its own
    const desk = flatten(deskSrc)
    const box = new THREE.Box3().setFromObject(desk)
    const c = box.getCenter(new THREE.Vector3())
    desk.position.set(-c.x, -box.min.y, -c.z)
    desk.userData.restY = desk.position.y
    this.deskTop = box.max.y - box.min.y
    this.addChalk(desk)
    const pens = flatten(pensSrc)
    pens.position.set(0.12, this.deskTop, -0.34)
    pens.rotation.y = 0.25
    this.addChalk(pens)
    const bin = this.makeBin()
    this.addChalk(bin)
    const printer = this.buildPrinter(printerSrc)
    this.binR = binReactor(bin)
    this.reactors = [deskReactor(desk, (amt) => this.bumpDesk(amt)), pensReactor(pens), this.binR, printer]
"""
s = s.replace(a, b, 1)
rep("    // light for what's real: the studio for reflections, and the desk lamp's key\n",
    "    // light for what's real: the studio for reflections, and a desk lamp's key (the lamp itself off frame)\n")

i = s.index("  private addWobbly(root: THREE.Object3D, mass: number): void {")
j = s.index("  private addChalk(o: THREE.Object3D): void {")
METHODS = open('C:/Users/GETLIO~1/AppData/Local/Temp/claude/C--Users-GET-LIO/0b1da0e8-6678-4c4a-bb8d-a10f4bdd98cd/scratchpad/reactions_methods.ts', encoding='utf-8').read()
s = s[:i] + METHODS + s[j:]

rep("const PAPER_GLOW = 0.1",
    "const PRINTER_SCALE = 1.7 // the model is a small inkjet: at this size an A4 comes out landscape\n"
    "const PRINTER_AT = { x: 0.66, z: -0.2, yaw: -0.45 }\nconst PRINT_FEED = 2.2 // s to feed a sheet out\nconst PRINT_LAY = 0.8\nconst PAPER_GLOW = 0.1")
rep("    const s: Sheet = { mesh, crumple: 0, scored: false, restT: 0, thrown: false, missDealt: false }",
    "    mesh.userData.yaw = new Spring(90, 7)\n    mesh.userData.hop = new Spring(500, 16)\n"
    "    const s: Sheet = { mesh, crumple: 0, scored: false, restT: 0, thrown: false, missDealt: false }")
rep("""    if (this.state !== 'play') return
    const s = this.pick(e.clientX, e.clientY)
    if (!s) return""", """    if (this.state !== 'play') return
    const s = this.pick(e.clientX, e.clientY)
    if (!s) {
      // the printer: a new draft, if there's no sheet waiting already
      if (this.overPrinter(e.clientX, e.clientY) && !this.active && !this.printing) this.startPrint()
      return
    }""")
rep("""      this.misses++
      // the next draft slides onto the desk (if there isn't one already)
      if (!this.active) this.dealDraft()
    }""", """      this.misses++
      // (the next draft is the player's to print — the printer's light blinks for it)
    }""")
i = s.index("  private dealDraft(): void {")
j = s.index("  /** PLACEHOLDER copy", i)
s = s[:i] + s[j:]
rep("""          const w = this.wobblies.find((q) => q.root === this.bin)
          if (near && dv > 0.7 && w) this.shove(w, pv.clone().setY(0).normalize(), Math.min(dv / 3, 1.2))""",
    """          if (near && dv > 0.7) this.binR?.rock(pv.clone().setY(0).normalize(), Math.min(dv / 3, 1.2))""")
rep("        if (pv && this.bin) {", "        if (pv) {")
rep("    this.stepWobbles(dt)\n", "    this.stepPrint(dt)\n    this.stepSheetsAtRest()\n    this.stepReactions(dt)\n")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
