ROOT = 'C:/Users/GETÚLIO/generic/'


def edit(p, pairs):
    p = ROOT + p
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert a in s, (p, a)
        s = s.replace(a, b, 1)
    open(p, 'w', encoding='utf-8').write(s)


edit('src/hero/ShaderHero.ts', [
    # --- door cubes: normals into the raw shader
    ("""        attribute float aFaceKind; // 0 = GENERIC front, 1 = tagline outer, 2 = other""",
     """        attribute float aFaceKind; // 0 = GENERIC front, 1 = tagline outer, 2 = other
        attribute vec3 normal;
        uniform mat3 normalMatrix;
        varying vec3 vViewN;"""),
    ("""          vKind = aFaceKind;""",
     """          vKind = aFaceKind;
          vViewN = normalize(normalMatrix * normal);"""),
    ("""        ${DRAWN_GLSL}
        void main() {
          vec3 tex = texture2D(map, vUv).rgb;
          // drawn (TEST): the cubes' edges in graphite
          if (uDOn > 0.5) tex = mix(tex, D_INK, drawnEdge((vClip.xy / vClip.w) * 0.5 + 0.5));""",
     """        ${DRAWN_GLSL}
        varying vec3 vViewN;
        void main() {
          vec3 tex = texture2D(map, vUv).rgb;
          if (uDOn > 0.5) {
            // drawn: the cubes are paper, outlined, hatched where they turn from the light — and
            // their fall into shadow (the same light play as below) is hatching, not black
            vec2 dsuv = (vClip.xy / vClip.w) * 0.5 + 0.5;
            float shade = vKind < 0.5 ? uPhase : vKind < 1.5 ? 1.0 - uPhaseB : uPhase * 0.76;
            float ink = max(drawnInk(dsuv, vViewN), drawnTone(dsuv, shade));
            vec3 col = mix(drawnPaper(dsuv), D_INK, ink);
            if (vKind < 0.5) {
              vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
              if (uRestOn > 0.5) suv = (vRestClip.xy / vRestClip.w) * 0.5 + 0.5;
              col = revealApply(col, suv);
            }
            gl_FragColor = vec4(col, 1.0);
            return;
          }"""),
    # --- letters: in shadow by hatching when drawn
    ("""          col *= mix(1.0, 0.05, uPhase); // darken into shadow""",
     """          if (uDOn > 0.5) col = mix(col, D_INK, drawnTone(suv, uPhase)); // drawn: shadow as hatching
          else col *= mix(1.0, 0.05, uPhase); // darken into shadow"""),
    # --- tagline: drawn letters, revealed by the same gate
    ("""    tagL.material = this.tagMatL // self-contained, same key/gate as the face, darker albedo""",
     """    tagL.material = this.drawn ? this.drawnTagMat : this.tagMatL // self-contained, same key/gate as the face, darker albedo"""),
    ("""    tagR.material = this.tagMatR
""",
     """    tagR.material = this.drawn ? this.drawnTagMat : this.tagMatR
"""),
    ("""    this.tagMatL.uniforms.uReveal.value = bright
    this.tagMatR.uniforms.uReveal.value = bright""",
     """    this.tagMatL.uniforms.uReveal.value = bright
    this.tagMatR.uniforms.uReveal.value = bright
    this.drawnTagShade.value = 1 - bright"""),
    ("""  private drawnCrumbs = false
""",
     """  private drawnCrumbs = false
  /** drawn: "We do things / for people." as drawn letters, sunk in hatching until their face turns
   *  into the light (the same gate as the plain ones' reveal) */
  private drawnTagShade = { value: 1 }
  private _drawnTagMat?: THREE.ShaderMaterial
  private get drawnTagMat(): THREE.ShaderMaterial {
    this._drawnTagMat ??= new THREE.ShaderMaterial({
      uniforms: { ...this.drawnU, uShade: this.drawnTagShade },
      vertexShader: `
        varying vec3 vViewN;
        varying vec4 vClip;
        void main() {
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform float uShade;
        varying vec3 vViewN;
        varying vec4 vClip;
        ${DRAWN_GLSL}
        void main() {
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          float ink = max(drawnInk(suv, vViewN), drawnTone(suv, uShade));
          gl_FragColor = vec4(mix(drawnPaper(suv), D_INK, ink), 1.0);
        }`,
    })
    return this._drawnTagMat
  }
"""),
])

# --- the garage's toaster = the home's
s = open(ROOT + 'src/garage/mainFocus.ts', encoding='utf-8').read()
assert 'mountMenu()' in s
s = s.replace('mountMenu()', "// the same toaster as the home: drawn, the slice under the cursor turning into real toast\nmountMenu({ drawn: true, drawnToasts: 'hover', realisticToast: true })", 1)
open(ROOT + 'src/garage/mainFocus.ts', 'w', encoding='utf-8').write(s)
print('done')
