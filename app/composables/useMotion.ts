// Player input that isn't the camera:
//   - tilt for the wind step: the gyroscope on phones, or touch position / arrow keys for testing
//   - touching: a finger on the screen, which stands in for light/water when there's no camera
//   - Space held: always counts as light/water, for testing on a computer
// Read `state` and `tilt()` every frame; nothing here is reactive on purpose.

const TILT_RANGE_DEG = 25 // leaning the phone this far counts as full tilt

export function useMotion() {
  const state = {
    sensorTilt: 0, // -1 … 1, from the gyroscope
    keyTilt: 0, // -1 … 1, from the arrow keys
    pointerTilt: 0, // -1 … 1, where the finger/mouse is: left edge -1, right edge 1
    touching: false, // finger on the screen: stands in for light/water only when there's no camera
    spaceHeld: false, // Space key: always works, for testing on a computer
  }

  // How the screen is rotated (0, 90, 180, 270 / -90)
  function screenAngle(): number {
    if (screen.orientation) return screen.orientation.angle
    const legacy: unknown = Reflect.get(window, 'orientation') // older iPhones
    return typeof legacy === 'number' ? legacy : 0
  }

  // The gyroscope reports angles relative to the phone held upright. Pick the angle that means
  // "leaning left/right" for how the screen is currently rotated.
  function onOrientation(e: DeviceOrientationEvent): void {
    if (e.gamma == null) return
    const angle = screenAngle()
    let lean: number
    if (angle === 90) lean = e.beta ?? 0
    else if (angle === -90 || angle === 270) lean = -(e.beta ?? 0)
    else if (angle === 180) lean = -e.gamma
    else lean = e.gamma
    state.sensorTilt = clamp(lean / TILT_RANGE_DEG, -1, 1)
  }

  // Starts listening to the gyroscope. iPhones ask for permission, and only right after a tap.
  async function start(): Promise<void> {
    if (typeof DeviceOrientationEvent === 'undefined') return
    const requestPermission: unknown = Reflect.get(DeviceOrientationEvent, 'requestPermission')
    if (typeof requestPermission === 'function') {
      try {
        await requestPermission.call(DeviceOrientationEvent)
      }
      catch {
        // denied: falls back to touch and keys
      }
    }
    window.addEventListener('deviceorientation', onOrientation)
  }

  function pointerToTilt(e: PointerEvent): number {
    const halfWidth = innerWidth / 2
    return clamp((e.clientX - halfWidth) / halfWidth, -1, 1)
  }

  // Bind these two on the game area (pointerdown/pointermove). Release is caught on the window.
  function onPointerDown(e: PointerEvent): void {
    state.touching = true
    state.pointerTilt = pointerToTilt(e)
  }

  function onPointerMove(e: PointerEvent): void {
    if (state.touching) state.pointerTilt = pointerToTilt(e)
  }

  function onRelease(): void {
    state.touching = false
    state.pointerTilt = 0
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') state.keyTilt = -1
    if (e.key === 'ArrowRight') state.keyTilt = 1
    if (e.key === ' ') state.spaceHeld = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') state.keyTilt = 0
    if (e.key === ' ') state.spaceHeld = false
  }

  // Combined tilt from all inputs, -1 (left) … 1 (right)
  function tilt(): number {
    return clamp(state.sensorTilt + state.keyTilt + state.pointerTilt, -1, 1)
  }

  onMounted(() => {
    window.addEventListener('pointerup', onRelease)
    window.addEventListener('pointercancel', onRelease)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerup', onRelease)
    window.removeEventListener('pointercancel', onRelease)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('deviceorientation', onOrientation)
  })

  return { state, start, tilt, onPointerDown, onPointerMove }
}
