import * as THREE from 'three'

/**
 * The three scene materials of the chalk room:
 *  - normals: view-space normals into a render target (the edge detector's input)
 *  - lines:   Sobel on that target -> white outline, plus a hatch texture thresholded by a
 *             fixed "shadow" direction; both vertex-wobbled in steps (the line boil)
 *  - ground:  the blurred mirror render, tinted warm->orange across the screen, dirtied
 *             by concrete + noise, multiplied by the baked AO, faded out radially
 * Uniform objects are shared (spread from `globals`), so one write per frame reaches all.
 */

export const NORMAL_VERT = /* glsl */ `
  #include <garage_snoise>
  varying vec2 vUv;
  varying vec3 vNormal;
  uniform float DRAWING_LINE_DISTORTION_STRENGTH;
  uniform float DRAWING_SHAPE_DISTORTION_STRENGTH;
  uniform float DRAWING_WIGGLE_PACE;
  uniform float uTime;
  void main() {
    float noise = snoise(vec4(position * 15.0, round(uTime * DRAWING_WIGGLE_PACE)));
    vec3 transformed = position;
    transformed += noise * normal * DRAWING_SHAPE_DISTORTION_STRENGTH;
    #if IS_INSTANCED_MESH
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
    #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    #endif
    vNormal = normalMatrix * normal;
    vUv = uv;
  }
`

export const NORMAL_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
  }
`

export const LINES_VERT = /* glsl */ `
  #include <garage_snoise>
  varying vec2 vUv;
  varying vec2 vNDC;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;
  uniform float DRAWING_WIGGLE_PACE;
  uniform float DRAWING_SHAPE_DISTORTION_STRENGTH;
  uniform float DRAWING_LINE_DISTORTION_STRENGTH;
  uniform float uTime;
  void main() {
    vec3 transformed = position;
    transformed += snoise(vec4(position * 15.0, DRAWING_LINE_DISTORTION_STRENGTH + round(uTime * DRAWING_WIGGLE_PACE))) * normal * DRAWING_SHAPE_DISTORTION_STRENGTH;
    #if IS_INSTANCED_MESH
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
    vWorldPosition = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
    #else
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
    #endif
    vUv = uv;
    vNDC = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
    vNormal = normalMatrix * normal;
  }
`

export const LINES_FRAG = /* glsl */ `
  float luma(vec3 rgb) {
    return dot(vec3(0.2126729, 0.7151522, 0.0721750), rgb);
  }
  float sobelEdge(sampler2D tex, vec2 uv, vec2 texel) {
    float tl = luma(texture2D(tex, uv + texel * vec2(-1.0, 1.0)).rgb);
    float l = luma(texture2D(tex, uv + texel * vec2(-1.0, 0.0)).rgb);
    float bl = luma(texture2D(tex, uv + texel * vec2(-1.0, -1.0)).rgb);
    float t = luma(texture2D(tex, uv + texel * vec2(0.0, 1.0)).rgb);
    float b = luma(texture2D(tex, uv + texel * vec2(0.0, -1.0)).rgb);
    float tr = luma(texture2D(tex, uv + texel * vec2(1.0, 1.0)).rgb);
    float r = luma(texture2D(tex, uv + texel * vec2(1.0, 0.0)).rgb);
    float br = luma(texture2D(tex, uv + texel * vec2(1.0, -1.0)).rgb);
    float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
    float gy = (bl + 2.0 * b + br) - (tl + 2.0 * t + tr);
    return sqrt(gx * gx + gy * gy);
  }

  varying vec2 vUv;
  varying vec2 vNDC;
  varying vec3 vNormal;
  varying vec3 vWorldPosition;

  uniform sampler2D tDrawing;
  uniform sampler2D tNoise;
  uniform sampler2D tNormal;

  uniform float DRAWING_TRANSPARENCY;
  uniform float uTime;
  uniform float DRAWING_WIGGLE_PACE;
  uniform float DRAWING_HEATMAP_VISIBILITY;
  uniform bool DRAWING_INVERTED;
  uniform bool DRAWING_VISIBLE;
  uniform vec3 DRAWING_BASE_COLOR_A;
  uniform vec3 DRAWING_BASE_COLOR_B;
  uniform float SHADOW_SIZE;
  uniform float SHADOW_OPACITY;
  uniform float OUTLINE_THICKNESS;
  uniform vec3 SHADOW_DIR;
  uniform vec2 SHADOW_LIGHT_NDC;
  uniform float SHADOW_FALLOFF;
  uniform float SCAN_ON;
  uniform float SCAN_Y;
  uniform vec3 SCAN_COLOR;
  uniform float REVEAL_ON;
  uniform float REVEAL_Y;
  uniform vec3 BEAM[12];
  uniform float BEAM_ON;
  uniform float BEAM_ASPECT;

  void main() {
    // shading from a fixed light direction, in VIEW space (so it turns with the camera)
    // (GENERIC: the direction is a uniform — (1, -1, 0) as the original unless a test hover
    // moves it — plus an optional falloff away from a light at SHADOW_LIGHT_NDC, 0 by default)
    float shadow = max(dot(vNormal, normalize(SHADOW_DIR)), 0.0);
    shadow += SHADOW_FALLOFF * smoothstep(0.1, 0.9, distance(vNDC * vec2(1.6, 1.0), SHADOW_LIGHT_NDC * vec2(1.6, 1.0)));

    float noise = texture2D(tNoise, vNDC * 5.0).r;
    noise = pow(noise, 1.5);

    // hatch pattern in screen space, jumping to a new offset DRAWING_WIGGLE_PACE/2 times a second
    vec2 uv = vNDC * SHADOW_SIZE + round(uTime * DRAWING_WIGGLE_PACE * 0.5) * 1.33;
    float drawingPattern = texture2D(tDrawing, uv).r;
    float shadowWithDrawing = step(drawingPattern, shadow - 0.15);

    // two Sobel passes: a clean one and a thinner one knocked sideways by noise
    float sobel0 = sobelEdge(tNormal, vNDC, vec2(OUTLINE_THICKNESS));
    float sobel1 = sobelEdge(tNormal, vNDC + noise * 0.0055, vec2(OUTLINE_THICKNESS * 0.33));
    float sobelFinal = min(sobel0 + sobel1 * noise, 1.0);
    sobelFinal = mix(sobelFinal, smoothstep(DRAWING_HEATMAP_VISIBILITY, 1.0, sobelFinal), min(DRAWING_HEATMAP_VISIBILITY * 20.0, 1.0));

    if (!DRAWING_VISIBLE) {
      sobelFinal = 0.0;
    }

    vec3 final = mix(DRAWING_BASE_COLOR_A, DRAWING_BASE_COLOR_B, min(sobelFinal + shadowWithDrawing * SHADOW_OPACITY, 1.0));
    if (DRAWING_INVERTED) {
      final = 1.0 - final;
    }
    // GENERIC test (?v=s&beam=1): the cursor as a scanner beam — strokes near its recent path
    // light up orange and fade as the trail ages (BEAM: ndc xy + strength)
    if (BEAM_ON > 0.0) {
      float g = 0.0;
      for (int i = 0; i < 12; i++) {
        vec2 dd = (vNDC - BEAM[i].xy) * vec2(BEAM_ASPECT, 1.0);
        g = max(g, BEAM[i].z * (1.0 - smoothstep(0.02, 0.11, length(dd))));
      }
      final = mix(final, SCAN_COLOR, g * min(sobelFinal + shadowWithDrawing * SHADOW_OPACITY, 1.0) * BEAM_ON);
    }
    // GENERIC test (?v=s): the entrance — the room exists only above a scan plane sweeping down
    // in world y; strokes just scanned are orange, whitening as the plane moves on
    if (REVEAL_ON > 0.0) {
      float d = vWorldPosition.y - REVEAL_Y;
      // below the plane the set doesn't exist yet (not even as a dark silhouette on the floor)
      if (REVEAL_ON > 0.5 && d < -0.004) discard;
      float lineR = exp(-d * d / 0.00006) + 0.35 * exp(-d * d / 0.002);
      float shown = smoothstep(-0.004, 0.004, d);
      float fresh = exp(-max(d, 0.0) / 0.35) * shown;
      final = mix(final, SCAN_COLOR, sobelFinal * 0.85 * fresh * REVEAL_ON);
      final = mix(final, DRAWING_BASE_COLOR_A, (1.0 - shown) * REVEAL_ON);
      final = mix(final, SCAN_COLOR, min(lineR, 1.0) * REVEAL_ON);
    }
    // GENERIC test (?h=scan): a clicked object gets its own copy of this material with SCAN_ON —
    // a bright line sweeping down it in world y, and its strokes lit once the line has passed
    if (SCAN_ON > 0.0) {
      float d = vWorldPosition.y - SCAN_Y;
      float line = exp(-d * d / 0.00006) + 0.35 * exp(-d * d / 0.002);
      float scanned = smoothstep(-0.005, 0.005, d);
      final = mix(final, SCAN_COLOR, min(line, 1.0) * SCAN_ON);
      final = mix(final, SCAN_COLOR, sobelFinal * scanned * 0.85 * SCAN_ON);
    }
    gl_FragColor = mix(vec4(final, 1.0), vec4(sobelFinal), DRAWING_TRANSPARENCY);
    if (!DRAWING_VISIBLE) {
      gl_FragColor.a = abs(vWorldPosition.y * 2.0);
    }
  }
`

export const GROUND_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec4 vNDC;
  void main() {
    vUv = uv;
    vNDC = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = vNDC;
  }
`

export const GROUND_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  varying vec4 vNDC;

  uniform sampler2D tDiffuse;
  uniform sampler2D tConcrete;
  uniform sampler2D tNoise;
  uniform sampler2D tAoMap;

  uniform vec3 REFLECTION_COLOR_A;
  uniform vec3 REFLECTION_COLOR_B;
  uniform vec3 REFLECTION_GROUND_BASE_COLOR;
  uniform float REFLECTION_COLOR_POWER;
  uniform float REFLECTION_INTENSITY;
  uniform float REFLECTION_GROUND_DETAIL;
  uniform float REVEAL_ON;
  uniform float REVEAL_Y;

  void main() {
    vec2 ndc = (vNDC.xy / vNDC.w) * 0.5 + 0.5;
    ndc.y = 1.0 - ndc.y;

    // world -> 0..1 over an 11 x 11 m patch centred on the set
    vec2 worldUV = (vWorldPosition.xz + 5.5) / 11.0;

    float noise = texture2D(tNoise, worldUV * 2.0).r;
    float concrete = texture2D(tConcrete, worldUV * 5.0).r;
    float shadow = min(length(worldUV * 2.0 - 1.0) * 4.0, 1.0);

    vec3 base = REFLECTION_GROUND_BASE_COLOR;
    base *= shadow;

    vec3 groundColor = pow(mix(REFLECTION_COLOR_A, REFLECTION_COLOR_B, smoothstep(0.45, 0.66, ndc.x)), vec3(REFLECTION_COLOR_POWER));
    groundColor = mix(groundColor, vec3(0.75), smoothstep(0.5, 0.66, length(ndc.x * 2.0 - 1.0)));

    float aoMapTexture = texture2D(tAoMap, vUv).r;

    vec3 reflection = texture2D(tDiffuse, ndc).rgb;
    reflection.rgb *= groundColor * REFLECTION_INTENSITY * (1.0 - concrete * REFLECTION_GROUND_DETAIL) * noise;
    reflection.rgb *= aoMapTexture;
    // GENERIC test (?v=s): the floor doesn't exist before the scan plane comes down to it — not
    // even as its dark patch: until then the page is one flat background colour
    float floorIn = mix(1.0, smoothstep(2.4, 0.0, REVEAL_Y), REVEAL_ON);

    gl_FragColor = vec4(base + reflection, smoothstep(1.0, 0.0, length(worldUV * 2.0 - 1.0)) * floorIn);
  }
`

/** raw colour: hex taken as display value, no management (what the shaders expect) */
export const raw = (hex: number | string): THREE.Color => new THREE.Color(hex as THREE.ColorRepresentation).convertLinearToSRGB()

export function makeGlobals(tex: { drawing: THREE.Texture; noise: THREE.Texture }) {
  return {
    tNormal: { value: null as THREE.Texture | null },
    tDrawing: { value: tex.drawing },
    tNoise: { value: tex.noise },
    DRAWING_HEATMAP_VISIBILITY: { value: 0.39 },
    DRAWING_TRANSPARENCY: { value: 0 },
    DRAWING_SHAPE_DISTORTION_STRENGTH: { value: 0.01 },
    DRAWING_LINE_DISTORTION_STRENGTH: { value: 0.07 },
    DRAWING_WIGGLE_PACE: { value: 8 },
    DRAWING_INVERTED: { value: false },
    DRAWING_BASE_COLOR_A: { value: raw(0x121212) },
    DRAWING_BASE_COLOR_B: { value: raw(0xffffff) },
    DRAWING_VISIBLE: { value: true },
    uTime: { value: 0 },
    SHADOW_SIZE: { value: 30 },
    SHADOW_OPACITY: { value: 0.21 },
    OUTLINE_THICKNESS: { value: 0.00065 },
    SHADOW_DIR: { value: new THREE.Vector3(1, -1, 0) }, // GENERIC: movable (test hover ?h=light)
    SHADOW_LIGHT_NDC: { value: new THREE.Vector2(0.5, 0.5) },
    SHADOW_FALLOFF: { value: 0 },
    SCAN_ON: { value: 0 }, // GENERIC: per-object scan (test hover ?h=scan)
    SCAN_Y: { value: 0 },
    SCAN_COLOR: { value: new THREE.Color(1, 0.6, 0.3) },
    REVEAL_ON: { value: 0 }, // GENERIC: scanner entrance (?v=s)
    REVEAL_Y: { value: 0 },
    BEAM: { value: Array.from({ length: 12 }, () => new THREE.Vector3(-9, -9, 0)) }, // (?beam=1)
    BEAM_ON: { value: 0 },
    BEAM_ASPECT: { value: 1 },
    REFLECTION_BLUR_STRENGTH: { value: 56 },
    REFLECTION_BLUR_SAMPLES: { value: 13 },
    REFLECTION_COLOR_A: { value: raw(0xffe6da) },
    REFLECTION_COLOR_B: { value: raw(0xfebb57) },
    REFLECTION_COLOR_POWER: { value: 1 },
    REFLECTION_GROUND_BASE_COLOR: { value: raw(0x000000) },
    REFLECTION_GROUND_BLUR_STRETCH: { value: 2 },
    REFLECTION_GROUND_DETAIL: { value: 0.5 },
    REFLECTION_INTENSITY: { value: 7 },
  }
}
export type Globals = ReturnType<typeof makeGlobals>

export function normalMaterial(globals: Globals, instanced = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: NORMAL_VERT,
    fragmentShader: NORMAL_FRAG,
    uniforms: { ...globals },
    defines: { IS_INSTANCED_MESH: instanced ? 1 : 0 },
  })
}

export function linesMaterial(globals: Globals, instanced = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: LINES_VERT,
    fragmentShader: LINES_FRAG,
    uniforms: { ...globals },
    defines: { IS_INSTANCED_MESH: instanced ? 1 : 0 },
  })
}

export function groundMaterial(globals: Globals, concrete: THREE.Texture, ao: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    vertexShader: GROUND_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: {
      ...globals,
      tDiffuse: { value: null },
      tConcrete: { value: concrete },
      tAoMap: { value: ao },
    },
  })
}
