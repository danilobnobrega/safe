precision highp float;

// Injects a Gaussian-falloff splat of `uValue` into whatever field `uTarget` holds —
// used both for velocity (uValue.xy = a push direction) and for dye (uValue.rgb = a
// density/colour to add). Same shader, different target each call.

uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;

varying vec2 vUv;

void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspectRatio;
  float splat = exp(-dot(p, p) / uRadius);
  vec3 base = texture2D(uTarget, vUv).xyz;
  gl_FragColor = vec4(base + splat * uValue, 1.0);
}
