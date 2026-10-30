// The stem and leaves (the "calyx") for a tomato model that has none, built from code.
// The leaves are laid onto the tomato's top, following its surface, so they fit any tomato shape.
// Also paints the tomato skin with a few shades of red, which an STL file can't carry.
//
// Everything here works in the model file's own coordinates, where +Z is the top of the tomato
// (CAD tools have Z up). Sizes are shares of the tomato's radius, so the file's units don't matter.
import * as THREE from 'three'

// ---------- Look ----------

const LEAF_COUNT = 6
const LEAF_LENGTH: [number, number] = [0.86, 1.02] // from the stem outward, share of the radius (random per leaf)
const LEAF_WIDTH = 0.11 // widest point, share of the radius
const LEAF_START = 0.05 // leaves start this far from the center (around the stem), share of the radius
const LEAF_CURL = 0.1 // how far each tip lifts off the skin, share of the radius
const LEAF_BEND = 0.35 // how much leaves curve sideways (radians at the tip, random either way)
const LEAF_FOLD = 0.35 // midrib raised above the edges, as a share of the leaf's width
const LEAF_GAP = 0.012 // leaves float this far over the skin so they never sink into it, share of the radius
const STEM_LENGTH = 0.24 // share of the radius
const STEM_RADIUS = 0.045 // share of the radius
const STEM_LEAN = 0.06 // the stem's tip leans sideways this much, share of the radius
const RANDOM_SEED = 7 // change for a different (but always the same) arrangement of leaves

// Colors as on screen (sRGB 0–1)
const LEAF_GREEN = new THREE.Color().setRGB(0.18, 0.4, 0.12, THREE.SRGBColorSpace)
const STEM_GREEN = new THREE.Color().setRGB(0.3, 0.45, 0.17, THREE.SRGBColorSpace)
// Tomato skin: deep red underneath, brighter orange-red toward the top, a hint of yellow-green
// around the stem (the "shoulders" of a ripe tomato)
const SKIN_DEEP = new THREE.Color().setRGB(0.62, 0.04, 0.02, THREE.SRGBColorSpace)
const SKIN_BRIGHT = new THREE.Color().setRGB(0.86, 0.16, 0.05, THREE.SRGBColorSpace)
const SKIN_SHOULDER = new THREE.Color().setRGB(0.8, 0.42, 0.08, THREE.SRGBColorSpace)
const SHOULDER_RADIUS = 0.35 // the yellow-green hint fades out by this share of the radius
const SHOULDER_STRENGTH = 0.35

// ---------- Measuring the tomato ----------

const PROFILE_BINS = 200

// The tomato's top surface, as a height for each distance from its center axis
interface TopProfile {
  centerX: number
  centerY: number
  bottom: number // lowest z
  top: number // highest z
  radius: number // widest distance from the axis
  heightAt: (distance: number) => number // highest z at this distance from the axis
}

function measure(geometry: THREE.BufferGeometry): TopProfile {
  geometry.computeBoundingBox()
  const box = geometry.boundingBox ?? new THREE.Box3()
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2
  const position = geometry.getAttribute('position')

  let radius = 0
  for (let i = 0; i < position.count; i++) {
    radius = Math.max(radius, Math.hypot(position.getX(i) - centerX, position.getY(i) - centerY))
  }
  const binSize = radius / (PROFILE_BINS - 1) || 1

  // Highest point in each ring around the axis
  const heights = new Float32Array(PROFILE_BINS).fill(-Infinity)
  for (let i = 0; i < position.count; i++) {
    const bin = Math.round(Math.hypot(position.getX(i) - centerX, position.getY(i) - centerY) / binSize)
    const z = position.getZ(i)
    if (z > (heights[bin] ?? Infinity)) heights[bin] = z
  }
  // Rings without any points borrow from their neighbour
  for (let i = 1; i < PROFILE_BINS; i++) {
    if (heights[i] === -Infinity) heights[i] = heights[i - 1] ?? box.max.z
  }
  for (let i = PROFILE_BINS - 2; i >= 0; i--) {
    if (heights[i] === -Infinity) heights[i] = heights[i + 1] ?? box.max.z
  }

  function heightAt(distance: number): number {
    const at = THREE.MathUtils.clamp(distance / binSize, 0, PROFILE_BINS - 1)
    const below = Math.floor(at)
    const above = Math.min(PROFILE_BINS - 1, below + 1)
    return THREE.MathUtils.lerp(heights[below] ?? box.max.z, heights[above] ?? box.max.z, at - below)
  }

  return { centerX, centerY, bottom: box.min.z, top: box.max.z, radius, heightAt }
}

// Small seeded random generator, so the leaves look the same on every visit
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

// ---------- Skin ----------

// Gives every point of the tomato a color, so it isn't one flat red
function paintSkin(geometry: THREE.BufferGeometry, profile: TopProfile): void {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  const color = new THREE.Color()
  const height = profile.top - profile.bottom || 1
  for (let i = 0; i < position.count; i++) {
    const up = (position.getZ(i) - profile.bottom) / height // 0 at the bottom → 1 at the top
    const distance = Math.hypot(position.getX(i) - profile.centerX, position.getY(i) - profile.centerY)
    const nearStem = 1 - THREE.MathUtils.smoothstep(distance, 0, profile.radius * SHOULDER_RADIUS)
    color.lerpColors(SKIN_DEEP, SKIN_BRIGHT, up * up)
    color.lerp(SKIN_SHOULDER, nearStem * up * SHOULDER_STRENGTH)
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

// ---------- Leaves ----------

const LEAF_STEPS = 18 // along the leaf
const LEAF_ACROSS = 6 // across the leaf (even, so there's a midrib row)

// One pointed leaf, lying on the skin from the stem outward at `angle`, curling up at the tip
function leafGeometry(profile: TopProfile, angle: number, length: number, bend: number): THREE.BufferGeometry {
  const r = profile.radius
  const points: number[] = []
  for (let step = 0; step <= LEAF_STEPS; step++) {
    const t = step / LEAF_STEPS // 0 at the stem → 1 at the tip
    const distance = r * (LEAF_START + t * (length - LEAF_START))
    const width = r * LEAF_WIDTH * Math.sin(Math.PI * t ** 0.6) ** 0.8 // narrow at the stem, pointed tip
    const direction = angle + bend * t * t
    const alongX = Math.cos(direction)
    const alongY = Math.sin(direction)
    for (let across = 0; across <= LEAF_ACROSS; across++) {
      const u = (across / LEAF_ACROSS) * 2 - 1 // -1 edge → 0 midrib → 1 edge
      const x = profile.centerX + alongX * distance - alongY * u * width
      const y = profile.centerY + alongY * distance + alongX * u * width
      const onSkin = profile.heightAt(Math.hypot(x - profile.centerX, y - profile.centerY))
      const fold = (1 - u * u) * width * LEAF_FOLD
      const curl = r * LEAF_CURL * t ** 3
      points.push(x, y, onSkin + r * LEAF_GAP + fold + curl)
    }
  }
  const indices: number[] = []
  const row = LEAF_ACROSS + 1
  for (let step = 0; step < LEAF_STEPS; step++) {
    for (let across = 0; across < LEAF_ACROSS; across++) {
      const a = step * row + across
      const b = a + row
      indices.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// ---------- Stem ----------

function stem(profile: TopProfile, material: THREE.Material): THREE.Object3D {
  const r = profile.radius
  const base = new THREE.Vector3(profile.centerX, profile.centerY, profile.heightAt(0) - r * STEM_RADIUS)
  const tip = base.clone().add(new THREE.Vector3(r * STEM_LEAN, r * STEM_LEAN * 0.4, r * STEM_LENGTH))
  const middle = base.clone().lerp(tip, 0.5).add(new THREE.Vector3(r * STEM_LEAN * -0.3, 0, 0))
  const curve = new THREE.CatmullRomCurve3([base, middle, tip])
  const group = new THREE.Group()
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, r * STEM_RADIUS, 10, false), material))
  // Rounded cut end
  const end = new THREE.Mesh(new THREE.SphereGeometry(r * STEM_RADIUS, 12, 8), material)
  end.position.copy(tip)
  group.add(end)
  return group
}

// ---------- Putting it together ----------

// Paints the tomato skin (the geometry gets vertex colors) and returns the stem and leaves,
// to add next to the tomato mesh (same coordinates).
export function createCalyx(geometry: THREE.BufferGeometry): THREE.Group {
  const profile = measure(geometry)
  paintSkin(geometry, profile)

  const random = seededRandom(RANDOM_SEED)
  const leafMaterial = new THREE.MeshStandardMaterial({ color: LEAF_GREEN, roughness: 0.75, side: THREE.DoubleSide })
  const stemMaterial = new THREE.MeshStandardMaterial({ color: STEM_GREEN, roughness: 0.8 })

  const calyx = new THREE.Group()
  calyx.name = 'calyx'
  for (let i = 0; i < LEAF_COUNT; i++) {
    const angle = (i / LEAF_COUNT) * Math.PI * 2 + (random() - 0.5) * 0.4
    const length = THREE.MathUtils.lerp(LEAF_LENGTH[0], LEAF_LENGTH[1], random())
    const bend = (random() - 0.5) * 2 * LEAF_BEND
    calyx.add(new THREE.Mesh(leafGeometry(profile, angle, length, bend), leafMaterial))
  }
  calyx.add(stem(profile, stemMaterial))
  return calyx
}
