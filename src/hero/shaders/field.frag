precision highp float;

uniform sampler2D uPrev;
uniform vec2 uPointer;      // 0..1, texture space
uniform vec2 uPrevPointer;
uniform float uAspect;
uniform float uDown;
uniform float uActive;      // 0 when pointer has never moved / left the window

varying vec2 vUv;

// distance from point p to segment a-b
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = vUv;

  // decay + gentle upward drift, like heat rising off the strokes (coverage only —
  // direction/speed decay a bit faster, see below, so they stay "fresh")
  vec4 prevS = texture2D(uPrev, uv);
  vec4 driftS = texture2D(uPrev, uv + vec2(0.0, 0.0018));
  vec4 p4 = mix(prevS, driftS, 0.28) * 0.955;
  float cov = p4.r;
  vec2 dir = p4.gb * 0.92;   // decays a touch faster than coverage
  float spd = p4.a * 0.85;   // speed fades fastest of all — it's an instant, not a memory

  // paint along the cursor's travel this frame
  vec2 p = vec2(uv.x * uAspect, uv.y);
  vec2 a = vec2(uPrevPointer.x * uAspect, uPrevPointer.y);
  vec2 b = vec2(uPointer.x * uAspect, uPointer.y);
  float d = segDist(p, a, b);
  float brush = smoothstep(0.13, 0.0, d) * (0.55 + uDown * 0.45) * uActive;

  cov = max(cov, brush);

  // this frame's travel direction/speed, in the same aspect-corrected space as the
  // brush above — written into the pixels the brush touches, decayed everywhere else
  vec2 delta = vec2((uPointer.x - uPrevPointer.x) * uAspect, uPointer.y - uPrevPointer.y);
  float moveLen = length(delta);
  vec2 newDir = moveLen > 1e-5 ? delta / moveLen : vec2(0.0);
  dir = mix(dir, newDir, brush);
  spd = max(spd, moveLen * uActive * 60.0);

  gl_FragColor = vec4(clamp(cov, 0.0, 1.0), dir.x, dir.y, spd);
}
