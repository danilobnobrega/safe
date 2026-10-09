ROOT = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    p = ROOT + p
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)


# the hidden layer: 1 = a picture (tPortrait), 2 = abstract — moving chalk contour lines
edit('src/hero/TunnelObjects.ts', [
    ("""            if (uPortraitOn > 0.5) {
              // the object is a window: on its paper, the hidden picture's ink instead of its own
              vec2 r = vec2(min(uViewAspect / uPortraitAspect, 1.0), min(uPortraitAspect / uViewAspect, 1.0));
              float ink = texture2D(tPortrait, suv * r + (1.0 - r) * 0.5).r;
              col = mix(drawnPaper(suv), D_INK, ink);
            }""", """            if (uPortraitOn > 1.5) {
              // abstract and alive: a chalk contour map of a slowly heaving terrain — isolines,
              // drawn with the line boil, hatched in the hollows. The object is a window onto it
              vec2 p = vec2(suv.x * uViewAspect, suv.y) * 3.2;
              float tt = uDTime * 0.07;
              float hgt = hFbm(p + vec2(tt, -tt * 0.6)) + 0.5 * hFbm(p * 1.9 - vec2(tt * 1.3, tt));
              float tick = floor(uDTime * 8.0);
              hgt += (dNoise(suv * uDRes * 0.02 + tick * 3.1) - 0.5) * 0.012; // the boil
              float lv = hgt * 11.0;
              float d = abs(fract(lv) - 0.5) / max(fwidth(lv), 1e-4);
              float line = 1.0 - smoothstep(0.6, 1.6, abs(d - 0.5 / max(fwidth(lv), 1e-4)));
              line = 1.0 - smoothstep(0.0, 1.3, (0.5 - abs(fract(lv) - 0.5)) / max(fwidth(lv), 1e-4));
              float hollow = smoothstep(0.62, 0.35, hgt);
              float ink = max(line * 0.95, step(drawnHatch(suv), hollow * 0.7) * 0.75);
              ink *= 0.6 + 0.4 * smoothstep(0.2, 0.6, dNoise(suv * uDRes * 0.8 + tick * 5.0));
              col = mix(drawnPaper(suv), D_INK, ink);
            } else if (uPortraitOn > 0.5) {
              // the object is a window: on its paper, the hidden picture's ink instead of its own
              vec2 r = vec2(min(uViewAspect / uPortraitAspect, 1.0), min(uPortraitAspect / uViewAspect, 1.0));
              float ink = texture2D(tPortrait, suv * r + (1.0 - r) * 0.5).r;
              col = mix(drawnPaper(suv), D_INK, ink);
            }"""),
    ("""          ${DRAWN_GLSL}
          void main() {
            vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            vec3 col = drawnColor(suv, vViewN);""", """          ${DRAWN_GLSL}
          float hNoise(vec2 x) {
            vec2 i = floor(x), f = fract(x);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float hFbm(vec2 x) {
            float s = 0.0, a = 0.55;
            for (int k = 0; k < 4; k++) { s += a * hNoise(x); x = x * 2.03 + 17.1; a *= 0.5; }
            return s;
          }
          void main() {
            vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            vec3 col = drawnColor(suv, vViewN);"""),
])

edit('src/hero/ShaderHero.ts', [
    ("tunnelRandom?: boolean; tunnelPortrait?: string; tunnelHoverColor?: boolean } = {}) {",
     "tunnelRandom?: boolean; tunnelPortrait?: string; tunnelHoverColor?: boolean; tunnelHidden?: 'abstract'; drawnScale?: number; drawnEvery?: number } = {}) {"),
    ("""    this.tunnelRandom = !!opts.tunnelRandom""", """    this.tunnelRandom = !!opts.tunnelRandom
    if (opts.tunnelHidden === 'abstract') PORTRAIT.uPortraitOn.value = 2
    // (/hero-tunnel-hidden.html: the drawn objects the size and number of the real tunnel's, all
    // there at once like it)
    this.drawnScale = opts.drawnScale ?? DRAWN_OBJ_SCALE
    this.drawnEvery = opts.drawnEvery ?? 1"""),
    ("""  private tunnelRandom = false
""", """  private tunnelRandom = false
  private drawnScale = 16
  private drawnEvery = 1
"""),
    ("""      this.galleryPhotos.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).visible = false
        const s0 = m.userData.s0 as THREE.Vector3""", """      this.galleryPhotos.forEach((m, i) => {
        ;(m.material as THREE.MeshBasicMaterial).visible = false
        if (i % this.drawnEvery) return
        const s0 = m.userData.s0 as THREE.Vector3"""),
    ("""        o.scale.setScalar(DRAWN_OBJ_SCALE)""", """        o.scale.setScalar(this.drawnScale)"""),
    ("""      const m = o.userData.slot as THREE.Mesh
      const op = (m.material as THREE.MeshBasicMaterial).opacity
      o.visible = op > 0.005""", """      const m = o.userData.slot as THREE.Mesh
      let op = (m.material as THREE.MeshBasicMaterial).opacity
      if (this.drawnEvery > 1) {
        // all there at once (as the real tunnel): the photos' one-by-one stagger undone
        const at = m.userData.revealAt as number
        const st = THREE.MathUtils.smoothstep(this.revealClock, at, at + 0.4)
        op = this.revealClock < 0 ? 0 : st > 0.001 ? Math.min(1, op / st) : this.inWormhole ? op : 1
      }
      o.visible = op > 0.005"""),
])

s = open(ROOT + 'src/hero/mainTunnelPortrait.ts', encoding='utf-8').read()
s = s.replace("// TEST route (/hero-tunnel-portrait.html):", "// TEST route (/hero-tunnel-hidden.html): the objects of /hero-tunnel-compare.html (Danilo's lab picks,\n// same size and number, all there at once) in chalk, anywhere on screen, each a window onto an\n// abstract moving chalk terrain hidden behind; the one under the cursor in its real colours.\n// /hero-tunnel-portrait.html:", 1)
a = "  tunnelRandom: true,\n  tunnelPortrait: new URLSearchParams(location.search).get('portrait') === '0' ? undefined : `${base}hero/tunnel/portrait_ink.png`,\n"
assert a in s
s = s.replace(a, "  tunnelRandom: new URLSearchParams(location.search).get('random') !== '0',\n  tunnelHidden: new URLSearchParams(location.search).get('hidden') === '0' ? undefined : 'abstract',\n  tunnelSet: 'final',\n  drawnScale: 19,\n  drawnEvery: 2,\n", 1)
open(ROOT + 'src/hero/mainTunnelHidden.ts', 'w', encoding='utf-8').write(s)
h = open(ROOT + 'hero-tunnel-portrait.html', encoding='utf-8').read().replace('mainTunnelPortrait.ts', 'mainTunnelHidden.ts').replace('tunnel portrait', 'tunnel hidden')
open(ROOT + 'hero-tunnel-hidden.html', 'w', encoding='utf-8').write(h)
v = open(ROOT + 'vite.config.ts', encoding='utf-8').read().replace("        heroTunnelPortrait: 'hero-tunnel-portrait.html',\n", "        heroTunnelPortrait: 'hero-tunnel-portrait.html',\n        heroTunnelHidden: 'hero-tunnel-hidden.html',\n", 1)
open(ROOT + 'vite.config.ts', 'w', encoding='utf-8').write(v)
print('ok')
