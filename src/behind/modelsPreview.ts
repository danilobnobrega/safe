// DEV (/behind-models.html): the downloaded desk-scene models side by side, real-lit, with their
// sizes logged — to pick the desk and the bin
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'

const ids = ['metal_office_desk', 'WoodenTable_02', 'wicker_basket_01', 'wicker_basket_02', 'desk_lamp_arm_01', 'stationery_supplies', 'office_notepads']
const canvas = document.getElementById('c') as HTMLCanvasElement
const r = new THREE.WebGLRenderer({ canvas, antialias: true })
r.setSize(innerWidth, innerHeight)
const scene = new THREE.Scene()
scene.background = new THREE.Color(0xdddddd)
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100)
const env = await new RGBELoader().loadAsync('/hero/tunnel/studio_1k.hdr')
env.mapping = THREE.EquirectangularReflectionMapping
scene.environment = env
const loader = new GLTFLoader()
let x = 0
const sizes: string[] = []
for (const id of ids) {
  const g = (await loader.loadAsync(`/behind/models/${id}/${id}.gltf`)).scene
  const box = new THREE.Box3().setFromObject(g)
  const s = box.getSize(new THREE.Vector3())
  sizes.push(`${id}: ${s.x.toFixed(2)} x ${s.y.toFixed(2)} x ${s.z.toFixed(2)} m`)
  g.position.set(x - box.min.x, -box.min.y, -box.getCenter(new THREE.Vector3()).z)
  x += s.x + 0.3
  scene.add(g)
}
console.log('[models]', sizes.join(' | '))
cam.position.set(x / 2, 1.6, x * 0.9)
cam.lookAt(x / 2, 0.5, 0)
r.render(scene, cam)
