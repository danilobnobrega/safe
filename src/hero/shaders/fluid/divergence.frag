precision highp float;

// Divergence of the velocity field — the input to the pressure solve below, which
// finds the pressure that cancels it out so the flow stops piling up or draining
// (mass-conserving, "incompressible" fluid).

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

varying vec2 vUv;

void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).x;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).x;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).y;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).y;
  gl_FragColor = vec4(0.5 * ((R - L) + (T - B)), 0.0, 0.0, 1.0);
}
