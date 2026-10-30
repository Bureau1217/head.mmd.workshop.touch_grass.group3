// The 3D tomato on the closing screen (three.js). AppTomato owns the canvas; this file does the 3D.
//
// Loads the model from `modelUrl`: an .stl (shape only, painted TOMATO_COLOR) or a .glb (with its
// own colors). If it can't be loaded, a placeholder cube is shown instead. Either way the harvest
// file is prepared here, before the player taps "harvest", because browsers only allow a download
// straight from the tap, with no waiting.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createCalyx } from './tomato-calyx'
import type { HarvestFile, TomatoApi } from '~/types/touch-grass'

const MODEL_SIZE = 2 // any model is scaled to fit a box this big (scene units), so its own size doesn't matter
const CAMERA_FOV_DEG = 35 // vertical
// How much room around the model, in model sizes: 1.8 = the model spans about 55% of the
// screen's narrower side. The camera moves back far enough to fit that, in portrait and landscape.
const FRAME_SIZE = MODEL_SIZE * 1.8
const MAX_PIXEL_RATIO = 2 // sharper than this costs a lot on phones for little gain
const TOMATO_COLOR = 0xDA0000 // --app-color-radish. Only the fallback cube uses it; STL tomatoes are painted in tomato-calyx.ts.
// Tomato skin: a matte layer under a thin glossy coat, like real tomato skin
const SKIN_ROUGHNESS = 0.55
const SKIN_GLOSS = 0.6 // strength of the glossy coat, 0–1
const SKIN_GLOSS_ROUGHNESS = 0.22 // lower = sharper reflections
// Lighting: reflections of a soft studio room, plus one light from the top right for shape
const ENVIRONMENT_STRENGTH = 0.8
const KEY_LIGHT_STRENGTH = 1.6
const EXPOSURE = 1.05
// How the STL is turned to face the player: its flat bottom (with the emboss) toward the screen.
// The file has the bottom facing -Z; the camera looks from +Z. Half a turn around X flips it over,
// which also keeps the QR code on the bottom the right way round (not mirrored, corners top-left).
// (radians, around x, y, z)
const STL_FACING: [number, number, number] = [Math.PI, 0, 0]
// Resting angle, so it isn't flat-on: tipped (x) and turned a little to the side (y), radians.
// About 20° and 15°. Tipped this way, the leaves on the far side peek over the top edge.
// The gyroscope turns it from here.
const RESTING_ANGLE: [number, number] = [0.35, 0.26]
const HARVEST_NAME = 'touch-grass-tomato' // + the file's extension

// `painted`: the geometry carries its own colors (vertex colors)
function skinMaterial(painted: boolean): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: painted ? 0xFFFFFF : TOMATO_COLOR,
    vertexColors: painted,
    roughness: SKIN_ROUGHNESS,
    clearcoat: SKIN_GLOSS,
    clearcoatRoughness: SKIN_GLOSS_ROUGHNESS,
  })
}

// The fallback: a red cube, if the model can't be loaded
function placeholder(): THREE.Object3D {
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), skinMaterial(false))
  cube.name = 'tomato'
  return cube
}

// The STL tomato, painted, with a stem and leaves added on top
function fromStl(file: ArrayBuffer): THREE.Object3D {
  const geometry = new STLLoader().parse(file)
  const calyx = createCalyx(geometry) // also paints the skin colors onto the geometry
  const mesh = new THREE.Mesh(geometry, skinMaterial(true))
  mesh.add(calyx) // same coordinates as the tomato, so it turns with it
  mesh.rotation.set(...STL_FACING)
  const group = new THREE.Group() // fit() scales and moves the group, the mesh keeps its rotation
  group.add(mesh)
  return group
}

// Turns a scene object into .glb file bytes
async function exportGlb(object: THREE.Object3D): Promise<ArrayBuffer> {
  const result: unknown = await new GLTFExporter().parseAsync(object, { binary: true })
  if (!(result instanceof ArrayBuffer)) throw new Error('The exporter did not return a .glb')
  return result
}

// The model and the file to download. A model file is downloaded as it is, so nothing is lost by
// re-exporting it; only the placeholder cube is exported (as .glb).
async function loadModel(url: string): Promise<{ model: THREE.Object3D, harvest: HarvestFile }> {
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`${url}: ${response.status}`)
    const data = await response.arrayBuffer()
    if (url.toLowerCase().endsWith('.stl')) {
      return { model: fromStl(data), harvest: { data, filename: `${HARVEST_NAME}.stl`, type: 'model/stl' } }
    }
    const resourcePath = url.slice(0, url.lastIndexOf('/') + 1) // for textures next to the file
    const gltf = await new GLTFLoader().parseAsync(data, resourcePath)
    return { model: gltf.scene, harvest: { data, filename: `${HARVEST_NAME}.glb`, type: 'model/gltf-binary' } }
  }
  catch (e) {
    // Missing or broken (the dev server may answer with its HTML page instead of a 404): use the cube
    console.warn('The tomato model didn\'t load, showing a cube instead.', e)
  }
  const model = placeholder()
  const data = await exportGlb(model)
  return { model, harvest: { data, filename: `${HARVEST_NAME}.glb`, type: 'model/gltf-binary' } }
}

// Scales the model to MODEL_SIZE and moves its center to the origin, so it turns around its middle
function fit(model: THREE.Object3D): void {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
  const largest = Math.max(size.x, size.y, size.z)
  if (largest > 0) model.scale.multiplyScalar(MODEL_SIZE / largest)
  const center = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())
  model.position.sub(center)
}

function disposeAll(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.dispose()
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach(material => material.dispose())
  })
}

export async function createTomato(canvas: HTMLCanvasElement, modelUrl: string): Promise<TomatoApi> {
  const { model, harvest } = await loadModel(modelUrl)
  fit(model)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO))
  renderer.toneMapping = THREE.ACESFilmicToneMapping // film-like highlights instead of flat white
  renderer.toneMappingExposure = EXPOSURE

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, 1, 0.1, 100)

  // A soft studio room for the skin to reflect, plus a key light from the top right
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, 0.04).texture
  room.dispose()
  pmrem.dispose()
  scene.environment = environment
  scene.environmentIntensity = ENVIRONMENT_STRENGTH
  const keyLight = new THREE.DirectionalLight(0xFFFFFF, KEY_LIGHT_STRENGTH)
  keyLight.position.set(3, 4, 5)
  scene.add(keyLight)

  // The gyroscope turns `pivot`; the model sits centered inside it. `stand` holds the resting angle.
  const pivot = new THREE.Group()
  pivot.add(model)
  const stand = new THREE.Group()
  stand.rotation.set(RESTING_ANGLE[0], RESTING_ANGLE[1], 0)
  stand.add(pivot)
  scene.add(stand)

  function render(): void {
    renderer.render(scene, camera)
  }

  function resize(): void {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (!width || !height) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    const halfFovTan = Math.tan((CAMERA_FOV_DEG * Math.PI) / 360)
    const fitHeight = FRAME_SIZE / (2 * halfFovTan)
    const fitWidth = FRAME_SIZE / (2 * halfFovTan * camera.aspect)
    camera.position.set(0, 0, Math.max(fitHeight, fitWidth))
    camera.updateProjectionMatrix()
    render()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()

  return {
    harvest,
    setRotation(x: number, y: number): void {
      pivot.rotation.set(x, y, 0)
      render()
    },
    destroy(): void {
      observer.disconnect()
      disposeAll(scene)
      environment.dispose()
      renderer.dispose()
    },
  }
}
