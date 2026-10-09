precision highp float;

// Semi-Lagrangian advection in TEXEL units (velocity is stored in sim texels, not
// uv) with a manual bilinear fetch — the reveal mask's formulation, NOT the one in
// fluid/advection.frag (that one is the letter roulette's uv-space sim; different
// units, different decay model, keep them apart).
// uDissipation is a per-60Hz-frame multiplier, already pow()'d for the real dt.

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uTexelSize;
uniform float uDt; // in 60Hz frames (1.0 at 60fps)
uniform float uDissipation;

varying vec2 vUv;

vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main() {
  vec2 coord = vUv - uDt * texture2D(uVelocity, vUv).xy * uTexelSize;
  gl_FragColor = uDissipation * bilerp(uSource, coord, uTexelSize);
}
