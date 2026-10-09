import * as THREE from 'three'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
import { raw } from './materials'

const QUAD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`

/**
 * Screen chain after the room render (same order as the original):
 *   hBlur   blur toward the edges (strength ~ distance-from-centre^4) + wide bloom mask -> alpha
 *   vBlur   the vertical half of both (+ the original's load-in circle wipe, parked open)
 *   pass0   radial RGB smear (+10% lift), bloom, the darkening under the scan HUD text,
 *           vignette to the background colour
 *   plane   chromatic aberration growing hard toward the corners (pow 8), barrel (0 at rest)
 *   FXAA    to the screen
 */
export class Post {
  readonly shared = {
    uTexel: { value: new THREE.Vector2() },
    uAspect: { value: 1 },
    BLUR_STRENGTH: { value: 25 },
    BLUR_SAMPLES: { value: 30 },
    BLUR_CENTER_POWER: { value: 4 },
    DISTORTION_STRENGTH: { value: 100 },
    DISTORTION_SAMPLES: { value: 10 },
    DISTORTION_OFFSET: { value: new THREE.Vector2(0, 0) },
    DISTORTION_RADIAL_STRENGTH: { value: 1 },
    BLOOM_SPREAD: { value: 100 },
    BLOOM_INTENSITY: { value: 0 },
    BLOOM_COLOR: { value: raw(0xf2f0ea) }, // GENERIC: neutral (the original's is warm yellow)
    BLOOM_POWER: { value: 1.3 },
    VIGNETTE_STRENGTH: { value: 0 },
    VIGNETTE_POWER: { value: 3 },
    VIGNETTE_COLOR: { value: raw(0x121212) },
    CHROMATIC_ABBERATION_STRENGTH: { value: 0 },
    CHROMATIC_ABBERATION_POWER: { value: 0 },
    BARREL_DISTORT_STRENGTH: { value: 0 },
    // NB not linear->sRGB converted in the original either (reads a touch darker than 245)
    PRELOADER_COLOR: { value: new THREE.Color('rgb(245, 245, 245)') },
  }

  readonly hBlur: THREE.ShaderMaterial
  readonly vBlur: THREE.ShaderMaterial
  readonly pass0: THREE.ShaderMaterial
  readonly plane: THREE.ShaderMaterial
  private fxaa: THREE.ShaderMaterial

  private rtH: THREE.WebGLRenderTarget
  private rtV: THREE.WebGLRenderTarget
  private rt0: THREE.WebGLRenderTarget
  private rtPlane: THREE.WebGLRenderTarget
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private scene = new THREE.Scene()
  private quad: THREE.Mesh

  constructor(private renderer: THREE.WebGLRenderer, size: { width: number; height: number; pixelRatio: number }, tex: { noise: THREE.Texture }) {
    const { width: w, height: h, pixelRatio: pr } = size
    this.shared.uTexel.value.set(w, h)
    this.shared.uAspect.value = w / h
    this.rtH = new THREE.WebGLRenderTarget(w * pr, h * pr)
    this.rtV = new THREE.WebGLRenderTarget(w * pr, h * pr)
    this.rt0 = new THREE.WebGLRenderTarget(w * pr, h * pr)
    this.rtPlane = new THREE.WebGLRenderTarget(w * pr, h * pr)

    this.hBlur = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        tSceneCurrent: { value: null },
        tSceneBloomCurrent: { value: null },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        #include <garage_gaussian>
        #include <garage_blurWithBloom>
        varying vec2 vUv;
        uniform sampler2D tSceneCurrent;
        uniform sampler2D tSceneBloomCurrent;
        uniform vec2 uTexel;
        uniform float BLUR_STRENGTH;
        uniform float BLUR_SAMPLES;
        uniform float BLUR_CENTER_POWER;
        uniform float BLOOM_SPREAD;
        void main() {
          float blurCenter = length(vUv * 2.0 - 1.0);
          blurCenter = pow(blurCenter, BLUR_CENTER_POWER);
          gl_FragColor = blurWithBloom(tSceneCurrent, tSceneBloomCurrent, true, vUv, uTexel, vec2(1.0, 0.0), BLUR_SAMPLES, blurCenter * BLUR_STRENGTH, BLOOM_SPREAD);
        }`,
    })

    this.vBlur = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, tDiffuse: { value: null }, uTransition: { value: 1 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        #include <garage_gaussian>
        #include <garage_blurWithBloom>
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform float uTransition;
        uniform vec2 uTexel;
        uniform vec3 PRELOADER_COLOR;
        uniform float uAspect;
        uniform float BLUR_STRENGTH;
        uniform float BLUR_SAMPLES;
        uniform float BLUR_CENTER_POWER;
        uniform float BLOOM_SPREAD;
        void main() {
          float blurCenter = length(vUv * 2.0 - 1.0);
          blurCenter = pow(blurCenter, BLUR_CENTER_POWER);
          vec2 uv1 = vec2((vUv.x * 2.0 - 1.0) * uAspect, vUv.y * 2.0 - 1.0);
          if (uAspect > 1.0) {
            uv1 = vec2(vUv.x * 2.0 - 1.0, (vUv.y * 2.0 - 1.0) / uAspect);
          }
          float dist = length(uv1);
          float transitionRemapped = uTransition * 1.25;
          float transition = smoothstep(transitionRemapped, transitionRemapped + uTransition * 10.0, dist);
          vec4 color = blurWithBloom(tDiffuse, tDiffuse, false, vUv, uTexel, vec2(0.0, 1.0), BLUR_SAMPLES, blurCenter * BLUR_STRENGTH, BLOOM_SPREAD);
          gl_FragColor = mix(color, vec4(PRELOADER_COLOR, 1.0), transition);
        }`,
    })

    this.pass0 = new THREE.ShaderMaterial({
      uniforms: {
        ...this.shared,
        tDiffuse: { value: null },
        tNoise: { value: tex.noise },
        // GENERIC (garage-focus): the annotations' chalk layer, laid in after the blur passes so
        // it stays sharp (it still gets the vignette, the fringe and FXAA)
        tAnnot: { value: null as THREE.Texture | null },
        uAnnot: { value: 0 },
        // GENERIC: darken + blur the scene under the scan readout (Scan) so its orange always reads
        uShade: { value: 0 },
        uShadeRect: { value: new THREE.Vector4(0, 0, 0, 0) }, // uv x0, y0, x1, y1
        uShade2: { value: 0 }, // ...and under the hover label (smaller, tighter falloff)
        uShadeRect2: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        #include <garage_distortion>
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        uniform sampler2D tNoise;
        uniform sampler2D tAnnot;
        uniform float uAnnot;
        uniform float uAspect;
        uniform vec2 uTexel;
        uniform float DISTORTION_SAMPLES;
        uniform float DISTORTION_STRENGTH;
        uniform float DISTORTION_RADIAL_STRENGTH;
        uniform vec2 DISTORTION_OFFSET;
        uniform float BLOOM_INTENSITY;
        uniform vec3 BLOOM_COLOR;
        uniform float BLOOM_POWER;
        uniform float VIGNETTE_STRENGTH;
        uniform float VIGNETTE_POWER;
        uniform vec3 VIGNETTE_COLOR;
        uniform float uShade;
        uniform vec4 uShadeRect;
        uniform float uShade2;
        uniform vec4 uShadeRect2;
        float shadeMask(vec4 r, float feather) {
          vec2 q = max(r.xy - vUv, vUv - r.zw);
          return 1.0 - smoothstep(0.0, feather, length(max(q * vec2(uAspect, 1.0), 0.0)));
        }
        void main() {
          float bloom = texture2D(tDiffuse, vUv).a; // bloom rides in alpha
          bloom = pow(bloom, BLOOM_POWER);

          vec2 p = vUv * 2.0 - 1.0;
          p.x *= uAspect;
          float dist = length(p);
          dist = pow(dist, 2.0);
          vec2 radialUv = vec2(atan(p.y, p.x) / 6.283185307 + 0.5, length(p));
          float radialNoise = texture2D(tNoise, vec2(radialUv.x, 0.0) * 0.5).r;
          radialNoise = round(radialNoise * 5.0) / 5.0;

          vec4 textureDiffuse = distortion(tDiffuse, vUv, uTexel, DISTORTION_SAMPLES, (DISTORTION_STRENGTH - radialNoise * DISTORTION_STRENGTH) * DISTORTION_RADIAL_STRENGTH * smoothstep(0.0, 0.2, dist), DISTORTION_OFFSET);

          vec3 final = textureDiffuse.rgb + bloom * BLOOM_INTENSITY * BLOOM_COLOR;
          final = clamp(final, 0.0, 1.0);
          if (uShade + uShade2 > 0.0) {
            float sh = max(uShade * shadeMask(uShadeRect, 0.09), uShade2 * shadeMask(uShadeRect2, 0.035));
            if (sh > 0.001) {
              vec3 b = vec3(0.0);
              for (int i = 0; i < 12; i++) {
                float a = float(i) * 0.5236;
                b += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * uTexel * 16.0).rgb;
              }
              final = mix(final, (b / 12.0) * 0.22, sh);
            }
          }

          if (uAnnot > 0.5) {
            vec4 an = texture2D(tAnnot, vUv);
            final = mix(final, an.rgb, an.a);
          }
          float vignette = pow(length(vUv * 2.0 - 1.0), VIGNETTE_POWER);
          vignette = min(vignette, 1.0);
          gl_FragColor = vec4(mix(final, VIGNETTE_COLOR, vignette * VIGNETTE_STRENGTH), 1.0);
        }`,
    })

    this.plane = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { ...this.shared, tDiffuse: { value: null }, uParallax: { value: 0 } },
      vertexShader: QUAD_VERT,
      fragmentShader: /* glsl */ `
        #include <garage_barrelDistort>
        varying vec2 vUv;
        uniform float uAspect;
        uniform sampler2D tDiffuse;
        uniform float CHROMATIC_ABBERATION_STRENGTH;
        uniform float CHROMATIC_ABBERATION_POWER;
        uniform float BARREL_DISTORT_STRENGTH;
        uniform float uParallax;
        void main() {
          vec2 uv = barrelDistort(vUv, BARREL_DISTORT_STRENGTH, uAspect);
          vec2 abberationStrength = (vec2(pow(length(uv * 2.0 - 1.0), CHROMATIC_ABBERATION_POWER))) * CHROMATIC_ABBERATION_STRENGTH * 0.001;
          float r = texture2D(tDiffuse, uv - abberationStrength).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv + abberationStrength).b;
          float alpha = smoothstep(-0.75 + uParallax * 1.25, 0.0 + uParallax * 1.25, uv.y);
          gl_FragColor = vec4(r, g, b, alpha);
        }`,
    })

    this.fxaa = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(FXAAShader.uniforms),
      vertexShader: FXAAShader.vertexShader,
      fragmentShader: FXAAShader.fragmentShader,
      transparent: true,
    })
    this.fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr))

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.hBlur)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  resize(size: { width: number; height: number; pixelRatio: number }): void {
    const { width: w, height: h, pixelRatio: pr } = size
    for (const rt of [this.rtH, this.rtV, this.rt0, this.rtPlane]) rt.setSize(w * pr, h * pr)
    this.shared.uTexel.value.set(w, h)
    this.shared.uAspect.value = w / h
    this.fxaa.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr))
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat
    this.renderer.setRenderTarget(target)
    this.renderer.render(this.scene, this.cam)
  }

  render(scene: THREE.Texture, bloom: THREE.Texture): void {
    this.hBlur.uniforms.tSceneCurrent.value = scene
    this.hBlur.uniforms.tSceneBloomCurrent.value = bloom
    this.pass(this.hBlur, this.rtH)
    this.vBlur.uniforms.tDiffuse.value = this.rtH.texture
    this.pass(this.vBlur, this.rtV)
    this.pass0.uniforms.tDiffuse.value = this.rtV.texture
    this.pass(this.pass0, this.rt0)
    this.plane.uniforms.tDiffuse.value = this.rt0.texture
    this.renderer.setClearColor(0x000000, 0)
    this.pass(this.plane, this.rtPlane)
    this.fxaa.uniforms.tDiffuse.value = this.rtPlane.texture
    this.pass(this.fxaa, null)
  }
}
