precision highp float;

// Subtracts the pressure gradient from velocity — the "projection" step that makes
// the field divergence-free again after the pressure solve above.

uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

varying vec2 vUv;

void main() {
  float L = texture2D(uPressure, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uPressure, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture2D(uPressure, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture2D(uPressure, vUv + vec2(0.0, uTexelSize.y)).x;
  vec2 vel = texture2D(uVelocity, vUv).xy;
  vel -= vec2(R - L, T - B) * 0.5;
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
