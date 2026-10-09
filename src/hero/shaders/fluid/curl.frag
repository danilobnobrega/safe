precision highp float;

// Scalar curl (vorticity) of the velocity field — feeds vorticity.frag, which pushes
// fluid harder along spinning eddies so the trail keeps swirling instead of smoothing
// itself out.

uniform sampler2D uVelocity;
uniform vec2 uTexelSize;

varying vec2 vUv;

void main() {
  float L = texture2D(uVelocity, vUv - vec2(uTexelSize.x, 0.0)).y;
  float R = texture2D(uVelocity, vUv + vec2(uTexelSize.x, 0.0)).y;
  float B = texture2D(uVelocity, vUv - vec2(0.0, uTexelSize.y)).x;
  float T = texture2D(uVelocity, vUv + vec2(0.0, uTexelSize.y)).x;
  gl_FragColor = vec4(0.5 * ((R - L) - (T - B)), 0.0, 0.0, 1.0);
}
