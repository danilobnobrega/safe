import * as THREE from 'three'

/**
 * How the tunnel's real objects are dressed — shared by the tunnel (TunnelObjects) and the lab
 * (/lab.html), so what the lab shows is exactly what the tunnel draws.
 */

/** a model's own material, as authored, with the studio light on it.
 *  `simple`: as a plain Standard material — the Physical extras some models carry (clearcoat,
 *  specular, IOR) cost every pixel a second lighting pass; `false` keeps them */
export function realMaterial(src: THREE.MeshStandardMaterial, env: THREE.Texture | null, simple = true): THREE.Material {
  const glassSrc = (src as THREE.MeshPhysicalMaterial).transmission > 0
  const m =
    glassSrc || !simple
      ? src.clone()
      : new THREE.MeshStandardMaterial({
          name: src.name,
          color: src.color,
          map: src.map,
          normalMap: src.normalMap,
          normalScale: src.normalScale,
          roughness: src.roughness,
          roughnessMap: src.roughnessMap,
          metalness: src.metalness,
          metalnessMap: src.metalnessMap,
          aoMap: src.aoMap,
          emissive: src.emissive,
          emissiveMap: src.emissiveMap,
          emissiveIntensity: src.emissiveIntensity,
          alphaMap: src.alphaMap,
          transparent: src.transparent,
          opacity: src.opacity,
          alphaTest: src.alphaTest,
        })
  // glass as plain see-through, not transmission: any transmissive material makes three draw
  // the whole scene a second time every frame, to see through it (halved the frame rate)
  const phys = m as THREE.MeshPhysicalMaterial
  const glass = phys.transmission > 0
  if (glass) {
    phys.transmission = 0
    phys.transparent = true
    phys.opacity = Math.min(phys.opacity, 0.12)
    phys.depthWrite = false
  }
  m.envMap = env
  // a watch's cover glass: at some angles it mirrored the studio's big white softbox and the
  // whole face went white — it only catches a faint sheen now, so the screen's own colours show
  m.envMapIntensity = glass ? 0.12 : 1.0
  if (glass && 'specularIntensity' in phys) phys.specularIntensity = 0.2
  // a watch's display (the material named 'Screen…' that carries the watch-face picture): lit
  // from within, always on, whatever the light or the angle
  if (/^screen/i.test(src.name) && src.map) {
    const e = m as THREE.MeshStandardMaterial
    e.emissiveMap = src.map
    e.emissive.setRGB(1, 1, 1)
    e.emissiveIntensity = 1.1
    e.color.setRGB(0, 0, 0)
    e.envMapIntensity = 0.05
    // it sits a fraction of a millimetre from the dark panel behind it (and the glass): at some
    // angles the panel won the depth test and covered it in patches — always drawn in front
    e.polygonOffset = true
    e.polygonOffsetFactor = -4
    e.polygonOffsetUnits = -16
  }
  m.side = THREE.DoubleSide
  return m
}

let fibres: THREE.Texture | undefined
/** the felt's fibre ends, for the ball's shells: dense short random strokes, brighter = longer */
function fibreTexture(): THREE.Texture {
  if (fibres) return fibres
  const S = 1024
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x = c.getContext('2d')!
  x.fillStyle = '#000'
  x.fillRect(0, 0, S, S)
  x.lineCap = 'round'
  for (let i = 0; i < 26000; i++) {
    const v = Math.random()
    x.strokeStyle = `rgb(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0})`
    x.lineWidth = 0.8 + Math.random() * 1.2
    const px = Math.random() * S
    const py = Math.random() * S
    const a = Math.random() * Math.PI * 2
    const l = 2 + Math.random() * 5
    x.beginPath()
    x.moveTo(px, py)
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l)
    x.stroke()
  }
  fibres = new THREE.CanvasTexture(c)
  fibres.wrapS = fibres.wrapT = THREE.RepeatWrapping
  fibres.repeat.set(3, 3)
  fibres.colorSpace = THREE.NoColorSpace
  return fibres
}

/** the tennis ball's felt without its million modelled hairs: shells — copies of the ball a hair
 *  bigger each, see-through but for scattered fibre ends, thinning out toward the outside.
 *  Added next to `core`; returns the shells */
export function addFeltShells(core: THREE.Mesh, env: THREE.Texture | null, n = 9): THREE.Mesh[] {
  const base = core.material as THREE.MeshStandardMaterial
  const out: THREE.Mesh[] = []
  for (let k = 1; k <= n; k++) {
    const t = k / n
    const shell = new THREE.Mesh(
      core.geometry,
      new THREE.MeshStandardMaterial({
        map: base.map,
        color: new THREE.Color(1, 1, 1).lerp(new THREE.Color(1.15, 1.15, 1.05), t), // tips catch the light
        alphaMap: fibreTexture(),
        alphaTest: 0.25 + t * 0.6,
        roughness: 1,
        envMap: env,
        envMapIntensity: 0.9,
      }),
    )
    shell.position.copy(core.position)
    shell.quaternion.copy(core.quaternion)
    shell.scale.copy(core.scale).multiplyScalar(1 + t * 0.07)
    shell.userData.felt = true
    core.parent!.add(shell)
    out.push(shell)
  }
  return out
}
