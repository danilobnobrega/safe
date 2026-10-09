import * as THREE from 'three'

/**
 * GLSL helpers for the garage room, registered as ShaderChunks so the materials can
 * `#include <name>` them. Same maths as the steven.com room pipeline this page is
 * modelled on (see GarageRoom.ts header) — kept verbatim in behaviour, because the
 * look depends on the exact quirks (e.g. distortion() averaging samples+1 taps over
 * `samples`, which brightens the frame ~10%).
 */
const CHUNKS: Record<string, string> = {
  // Simplex 4D noise — Ian McEwan, Stefan Gustavson (https://github.com/stegu/webgl-noise), MIT
  snoise: /* glsl */ `
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    float permute(float x){return floor(mod(((x*34.0)+1.0)*x, 289.0));}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    float taylorInvSqrt(float r){return 1.79284291400159 - 0.85373472095314 * r;}
    vec4 grad4(float j, vec4 ip){
      const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
      vec4 p,s;
      p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
      p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
      s = vec4(lessThan(p, vec4(0.0)));
      p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;
      return p;
    }
    float snoise(vec4 v){
      const vec2 C = vec2(0.138196601125010504, 0.309016994374947451);
      vec4 i  = floor(v + dot(v, C.yyyy) );
      vec4 x0 = v -   i + dot(i, C.xxxx);
      vec4 i0;
      vec3 isX = step( x0.yzw, x0.xxx );
      vec3 isYZ = step( x0.zww, x0.yyz );
      i0.x = isX.x + isX.y + isX.z;
      i0.yzw = 1.0 - isX;
      i0.y += isYZ.x + isYZ.y;
      i0.zw += 1.0 - isYZ.xy;
      i0.z += isYZ.z;
      i0.w += 1.0 - isYZ.z;
      vec4 i3 = clamp( i0, 0.0, 1.0 );
      vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
      vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );
      vec4 x1 = x0 - i1 + 1.0 * C.xxxx;
      vec4 x2 = x0 - i2 + 2.0 * C.xxxx;
      vec4 x3 = x0 - i3 + 3.0 * C.xxxx;
      vec4 x4 = x0 - 1.0 + 4.0 * C.xxxx;
      i = mod(i, 289.0);
      float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
      vec4 j1 = permute( permute( permute( permute (
                i.w + vec4(i1.w, i2.w, i3.w, 1.0 ))
              + i.z + vec4(i1.z, i2.z, i3.z, 1.0 ))
              + i.y + vec4(i1.y, i2.y, i3.y, 1.0 ))
              + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));
      vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;
      vec4 p0 = grad4(j0,   ip);
      vec4 p1 = grad4(j1.x, ip);
      vec4 p2 = grad4(j1.y, ip);
      vec4 p3 = grad4(j1.z, ip);
      vec4 p4 = grad4(j1.w, ip);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      p4 *= taylorInvSqrt(dot(p4,p4));
      vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
      vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
      m0 = m0 * m0;
      m1 = m1 * m1;
      return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 )))
                  + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;
    }
  `,
  gaussian: /* glsl */ `
    float gaussian(float x, float sigma) {
      return exp(-(x * x) / (2.0 * sigma * sigma));
    }
  `,
  // separable gaussian; `samples` ~ kernel diameter, strength in CSS px (texel = viewport size)
  blur: /* glsl */ `
    vec4 blur(sampler2D image, vec2 uv, vec2 texel, vec2 direction, float samples, float strength) {
      vec4 color = vec4(0.0);
      float total = 0.0;
      float sigma = samples * 0.25;
      for (float i = -samples * 0.5; i <= samples * 0.5; i++) {
        float weight = gaussian(i, sigma);
        vec2 offset = direction * (i / samples) * strength / texel;
        color += texture2D(image, uv + offset) * weight;
        total += weight;
      }
      return color / total;
    }
  `,
  // blurs the frame and, in the same loop, a (wider) bloom mask carried to alpha
  blurWithBloom: /* glsl */ `
    vec4 blurWithBloom(sampler2D diffuseTexture, sampler2D bloomTexture, bool isBloomTexture, vec2 uv, vec2 texel, vec2 direction, float samples, float diffuseStrength, float bloomStrength) {
      vec3 color = vec3(0.0);
      float bloom = 0.0;
      float total = 0.0;
      float sigma = samples * 0.25;
      for (float i = -samples * 0.5; i <= samples * 0.5; i++) {
        float weight = gaussian(i, sigma);
        vec2 diffuseOffset = direction * (i / samples) * diffuseStrength / texel;
        vec2 bloomOffset = direction * (i / samples) * bloomStrength / texel;
        color += texture2D(diffuseTexture, uv + diffuseOffset).rgb * weight;
        if (isBloomTexture) {
          bloom += texture2D(bloomTexture, uv + bloomOffset).r * weight;
        } else {
          bloom += texture2D(bloomTexture, uv + bloomOffset).a * weight;
        }
        total += weight;
      }
      return vec4(color / total, bloom / total);
    }
  `,
  // radial RGB smear; NB sums samples+1 taps / samples (intentional: +10% brightness)
  distortion: /* glsl */ `
    vec4 distortion(sampler2D image, vec2 uv, vec2 texel, float samples, float strength, vec2 offset) {
      vec4 color = vec4(0.0);
      float aspect = texel.x / texel.y;
      vec2 uvN = uv * 2.0 - 1.0;
      uvN.x *= aspect;
      uvN += offset;
      for (float i = 0.0; i <= samples; i++) {
        float r = texture2D(image, uv - uvN * (i / samples) * 1.0 * strength).r;
        float g = texture2D(image, uv - uvN * (i / samples) * 2.0 * strength).g;
        float b = texture2D(image, uv - uvN * (i / samples) * 3.0 * strength).b;
        color += vec4(r, g, b, 1.0);
      }
      return color / samples;
    }
  `,
  barrelDistort: /* glsl */ `
    vec2 barrelDistort(vec2 uv, float strength, float aspect) {
      vec2 centeredUV = uv * 2.0 - 1.0;
      if (aspect > 1.0) {
        centeredUV.y /= aspect;
      } else {
        centeredUV.x *= aspect;
      }
      float r = length(centeredUV);
      vec2 distorted = centeredUV * (1.0 + strength * pow(r, 2.0));
      if (aspect > 1.0) {
        distorted.y *= aspect;
      } else {
        distorted.x /= aspect;
      }
      return (distorted + 1.0) * 0.5;
    }
  `,
  getGridUv: /* glsl */ `
    vec2 getGridUv(vec2 uv, vec2 gridSize, float index) {
      float safeIndex = index + 0.5;
      float col = floor(mod(safeIndex, gridSize.x));
      float row = floor(safeIndex / gridSize.x);
      vec2 cell = 1.0 / gridSize;
      row = gridSize.y - 1.0 - row;
      return uv * cell + vec2(col, row) * cell;
    }
  `,
}

let registered = false
export function registerChunks(): void {
  if (registered) return
  registered = true
  const target = THREE.ShaderChunk as unknown as Record<string, string>
  for (const [k, v] of Object.entries(CHUNKS)) target[`garage_${k}`] = v
}
