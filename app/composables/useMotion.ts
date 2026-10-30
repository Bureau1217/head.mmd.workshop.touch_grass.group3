// Player input that isn't the camera:
//   - heading for the wind step: which way the phone's back camera points, from the gyroscope
//   - beta / gamma for the tomato: how far the phone is tipped forward/back and left/right
//   - turn: arrow keys / finger position, which turn the view when there's no gyroscope (testing)
//   - touching: a finger on the screen, which stands in for light/water when there's no camera
//   - Space held: always counts as light/water, for testing on a computer
// Read `state` and `turn()` every frame; nothing here is reactive on purpose.

// Below this, the phone is lying too flat to tell which way it faces (0 = flat, 1 = upright)
const MIN_UPRIGHT = 0.35

const RAD = Math.PI / 180

// Direction the back of the phone points, in degrees clockwise around the room (0–360).
// The phone's back axis rotated by alpha/beta/gamma, then flattened onto the floor (W3C
// "compass heading" formula). It works however the phone is held, except lying flat.
// On iPhones alpha starts at an arbitrary angle, which is fine: only changes in heading are used.
function backHeading(alpha: number, beta: number, gamma: number): number | null {
  const cA = Math.cos(alpha * RAD)
  const sA = Math.sin(alpha * RAD)
  const cB = Math.cos(beta * RAD)
  const sB = Math.sin(beta * RAD)
  const cG = Math.cos(gamma * RAD)
  const sG = Math.sin(gamma * RAD)
  const east = -cA * sG - sA * sB * cG
  const north = -sA * sG + cA * sB * cG
  if (Math.hypot(east, north) < MIN_UPRIGHT) return null
  return (Math.atan2(east, north) / RAD + 360) % 360
}

export function useMotion() {
  const state = {
    heading: null as number | null, // degrees, from the gyroscope; null until the sensor reports one
    beta: null as number | null, // degrees, tipped forward/back (90 = upright); null until the sensor reports
    gamma: null as number | null, // degrees, tipped left/right (0 = level); null until the sensor reports
    keyTurn: 0, // -1 … 1, from the arrow keys
    pointerTurn: 0, // -1 … 1, where the finger/mouse is: left edge -1, right edge 1
    touching: false, // finger on the screen: stands in for light/water only when there's no camera
    spaceHeld: false, // Space key: always works, for testing on a computer
  }

  function onOrientation(e: DeviceOrientationEvent): void {
    if (e.alpha == null || e.beta == null || e.gamma == null) return
    state.beta = e.beta
    state.gamma = e.gamma
    const heading = backHeading(e.alpha, e.beta, e.gamma)
    if (heading !== null) state.heading = heading
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

  function pointerToTurn(e: PointerEvent): number {
    const halfWidth = innerWidth / 2
    return clamp((e.clientX - halfWidth) / halfWidth, -1, 1)
  }

  // Bind these two on the game area (pointerdown/pointermove). Release is caught on the window.
  function onPointerDown(e: PointerEvent): void {
    state.touching = true
    state.pointerTurn = pointerToTurn(e)
  }

  function onPointerMove(e: PointerEvent): void {
    if (state.touching) state.pointerTurn = pointerToTurn(e)
  }

  function onRelease(): void {
    state.touching = false
    state.pointerTurn = 0
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') state.keyTurn = -1
    if (e.key === 'ArrowRight') state.keyTurn = 1
    if (e.key === ' ') state.spaceHeld = true
  }

  function onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') state.keyTurn = 0
    if (e.key === ' ') state.spaceHeld = false
  }

  // Turning from keys and touch, -1 (turn left) … 1 (turn right). The gyroscope is read from state.heading.
  function turn(): number {
    return clamp(state.keyTurn + state.pointerTurn, -1, 1)
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

  return { state, start, turn, onPointerDown, onPointerMove }
}
