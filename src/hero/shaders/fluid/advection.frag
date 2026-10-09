precision highp float;

// Semi-Lagrangian advection: trace this pixel backwards along the velocity field and
// sample the source there. Used both to self-advect velocity (uVelocity == uSource)
// and to carry the dye along with it (uSource = dye, uVelocity stays velocity).

uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;

varying vec2 vUv;

void main() {
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel;
  vec4 result = texture2D(uSource, coord);
  gl_FragColor = result / (1.0 + uDissipation * uDt);
}
