import type { CameraReading, SunSettings } from '~/types/touch-grass'

// Reads the camera a few times per second and turns each picture into two numbers (0–1):
// how much light is pointed at the phone (sun step) and how much blue is in view (water step).
//
// ---------- How light is detected ----------
// A light source (phone torch, lamp, the sun) shows up on camera as a solid patch of blown-out
// pixels, white in all three channels, much brighter than the rest of the picture. So instead of
// the average brightness, three things are measured:
//   blob:     the largest connected patch of blown-out pixels, as a share of the picture.
//             Scattered glare makes many small patches, a light makes one big one.
//   contrast: how much brighter that patch is than the median pixel. A white sheet that fills
//             the picture has a big patch but no contrast. Auto-exposure darkening the picture
//             around a light only raises the contrast.
//   flood:    most of the picture blown out (bright sky, or a lamp right at the lens).
// The blob is measured against the room, so a window or lamp already in view doesn't count.
// The tunable values (white level, patch and contrast ranges, on/off) come from SunSettings:
// defaults in app/app.config.ts, live sliders with ?debug.

// The camera picture is shrunk to this size before measuring: plenty for finding a light, and fast
const SAMPLE_WIDTH = 128
const SAMPLE_HEIGHT = 96
const SAMPLE_INTERVAL_MS = 80 // about 12 measurements per second
const WARMUP_MS = 1500 // cameras send dark frames while starting and adjusting; don't take those as the room
const FLOOD_SHARE: [number, number] = [0.5, 0.8] // share of all pixels blown out: starts counting → counts fully
const ROOM_BLOB_MAX = 0.02 // a room baseline taken in a bright place can't make the step impossible
const ROOM_FOLLOW_DARKER_S = 1 // the room baseline follows a darker picture quickly…
const ROOM_FOLLOW_BRIGHTER_S = 20 // …and a brighter one slowly, so a light held up isn't taken as the room

// ---------- How blue is detected (water step) ----------
const BLUE_SHARE: [number, number] = [0.06, 0.26] // share of blue pixels: starts counting → counts fully
// A pixel counts as blue from dark navy through sky blue, cyan, teal and turquoise to violet.
// Purple, very pale blue, white, greys and greens don't count.
const BLUE_MIN = 60 // blue channel (0–255) at least this: drops black and very dark noise
const BLUE_OVER_RED = 1.3 // blue at least this many times red: drops purple, pink, pale blue and white
const BLUE_MINUS_RED = 40 // and at least this much above red: drops dark greyish noise
const BLUE_VS_GREEN = 0.9 // blue at least this share of green: lets cyan and turquoise in, keeps greens out

// Maps value from range[0] → 0 to range[1] → 1, clamped
function scale(value: number, range: [number, number]): number {
  if (range[1] <= range[0]) return value >= range[0] ? 1 : 0 // the ?debug sliders were crossed over
  return clamp((value - range[0]) / (range[1] - range[0]), 0, 1)
}

function isBlue(r: number, g: number, b: number): boolean {
  return b >= BLUE_MIN && b >= r * BLUE_OVER_RED && b - r >= BLUE_MINUS_RED && b >= g * BLUE_VS_GREEN
}

// Perceived brightness (0–255) of a color, Rec. 709 weights
function luma(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
}

// `settings` is read on every sample, so changes from the ?debug sliders apply at once.
// Usage: put a <video> in `video`, call start() after a tap, then sample(now) every frame.
export function useCamera(settings: SunSettings) {
  const video = shallowRef<HTMLVideoElement | null>(null)
  const running = ref(false) // false until the player allowed the camera (and after stop())
  const readout = ref('') // one-line summary shown in the ?debug panel
  // Latest measurement. A plain object, not reactive: it is read every frame, not shown on screen.
  const reading: CameraReading = { light: 0, blue: 0 }

  let stream: MediaStream | null = null
  let sampler: CanvasRenderingContext2D | null = null
  let roomBlob: number | null = null // the blob size the room has on its own, without the player's light
  let lightOn = false
  let startedAt = 0
  let lastSampleAt = 0

  // Per-pixel buffers, allocated once and reused every sample
  const pixelCount = SAMPLE_WIDTH * SAMPLE_HEIGHT
  const isWhite = new Uint8Array(pixelCount) // 1 if the pixel is blown out
  const visited = new Uint8Array(pixelCount) // flood fill bookkeeping
  const lumas = new Uint8Array(pixelCount) // brightness of each pixel
  const stack = new Int32Array(pixelCount) // flood fill work list
  const histogram = new Uint32Array(256) // how many pixels have each brightness, for the median

  // Small hidden canvas the video frame is drawn into, so its pixels can be read
  function samplerContext(): CanvasRenderingContext2D | null {
    if (!sampler) {
      const canvas = document.createElement('canvas')
      canvas.width = SAMPLE_WIDTH
      canvas.height = SAMPLE_HEIGHT
      sampler = canvas.getContext('2d', { willReadFrequently: true })
    }
    return sampler
  }

  // Asks for the back camera. Must be called from a tap, or browsers refuse.
  async function start(): Promise<void> {
    const el = video.value
    if (!el) return
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      })
      el.srcObject = stream
      await el.play()
      roomBlob = null // measure the room fresh
      lightOn = false
      startedAt = performance.now()
      running.value = true
    }
    catch {
      // Denied or no camera: the game falls back to touch input
      running.value = false
    }
  }

  function stop(): void {
    stream?.getTracks().forEach(track => track.stop())
    stream = null
    running.value = false
  }

  // Draws the current video frame and fills the per-pixel buffers.
  // Returns how many pixels are blown out and how many are blue.
  function readPixels(ctx: CanvasRenderingContext2D, el: HTMLVideoElement): { whiteCount: number, blueCount: number } {
    ctx.drawImage(el, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT)
    const pixels = ctx.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data // r, g, b, a, r, g, b, a, …
    const whiteLevel = settings.whiteLevel
    histogram.fill(0)
    let whiteCount = 0
    let blueCount = 0
    for (let p = 0; p < pixelCount; p++) {
      const r = pixels[p * 4] ?? 0
      const g = pixels[p * 4 + 1] ?? 0
      const b = pixels[p * 4 + 2] ?? 0
      const y = luma(r, g, b)
      lumas[p] = y
      histogram[y] = (histogram[y] ?? 0) + 1
      const white = r >= whiteLevel && g >= whiteLevel && b >= whiteLevel
      isWhite[p] = white ? 1 : 0
      if (white) whiteCount++
      if (isBlue(r, g, b)) blueCount++
    }
    return { whiteCount, blueCount }
  }

  // Largest patch of touching blown-out pixels (up/down/left/right neighbours):
  // its size in pixels and its average brightness (0–255). Uses a flood fill.
  function largestWhitePatch(): { size: number, luma: number } {
    visited.fill(0)
    let bestSize = 0
    let bestLuma = 0
    for (let seed = 0; seed < pixelCount; seed++) {
      if (!isWhite[seed] || visited[seed]) continue
      // Flood fill outward from this pixel
      let stackSize = 0
      let size = 0
      let lumaSum = 0
      stack[stackSize++] = seed
      visited[seed] = 1
      while (stackSize > 0) {
        const p = stack[--stackSize] ?? 0
        size++
        lumaSum += lumas[p] ?? 0
        const x = p % SAMPLE_WIDTH
        const neighbours = [
          x > 0 ? p - 1 : -1, // left (not across the picture's left edge)
          x < SAMPLE_WIDTH - 1 ? p + 1 : -1, // right (not across the right edge)
          p - SAMPLE_WIDTH, // above
          p + SAMPLE_WIDTH, // below
        ]
        for (const q of neighbours) {
          if (q < 0 || q >= pixelCount || !isWhite[q] || visited[q]) continue
          visited[q] = 1
          stack[stackSize++] = q
        }
      }
      if (size > bestSize) {
        bestSize = size
        bestLuma = lumaSum / size
      }
    }
    return { size: bestSize, luma: bestLuma }
  }

  // Brightness that half the pixels are below, read from the histogram
  function medianLuma(): number {
    let counted = 0
    for (let value = 0; value < 256; value++) {
      counted += histogram[value] ?? 0
      if (counted >= pixelCount / 2) return value
    }
    return 255
  }

  // Call every frame; it only measures every SAMPLE_INTERVAL_MS. Updates `reading` and `readout`.
  function sample(now: number): void {
    const el = video.value
    const hasFrame = el && el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    if (!running.value || !el || !hasFrame || now - lastSampleAt < SAMPLE_INTERVAL_MS) return
    const ctx = samplerContext()
    if (!ctx) return
    const dt = lastSampleAt ? (now - lastSampleAt) / 1000 : 0
    lastSampleAt = now

    const { whiteCount, blueCount } = readPixels(ctx, el)
    reading.blue = scale(blueCount / pixelCount, BLUE_SHARE)

    if (now - startedAt < WARMUP_MS) {
      reading.light = 0
      readout.value = 'measuring the room…'
      return
    }

    const patch = largestWhitePatch()
    const blob = patch.size / pixelCount
    const contrast = Math.max(0, patch.luma - medianLuma()) / 255
    const whiteShare = whiteCount / pixelCount

    // Room baseline: follows the picture, quickly down and slowly up, and holds still while a light is on
    if (roomBlob === null) {
      roomBlob = Math.min(blob, ROOM_BLOB_MAX)
    }
    else if (!lightOn) {
      const followSeconds = blob < roomBlob ? ROOM_FOLLOW_DARKER_S : ROOM_FOLLOW_BRIGHTER_S
      roomBlob = Math.min(ROOM_BLOB_MAX, approach(roomBlob, blob, followSeconds, dt))
    }

    // Score 0–1: a big, high-contrast patch on top of the room, or a picture flooded with white
    const patchGrowth = (blob - roomBlob) * settings.sensitivity
    const contrastScore = patch.size ? scale(contrast, [settings.contrastFrom, settings.contrastFull]) : 0
    const patchScore = scale(patchGrowth, [settings.patchFrom, settings.patchFull]) * contrastScore
    const floodScore = scale(whiteShare, FLOOD_SHARE)
    const score = Math.max(patchScore, floodScore)

    // Hysteresis: switches on at onAt, off only below offAt, so it doesn't flicker in between
    if (!lightOn && score >= settings.onAt) lightOn = true
    else if (lightOn && score < settings.offAt) lightOn = false
    reading.light = lightOn ? Math.max(score, settings.onAt) : 0

    const pct = (v: number): string => `${(v * 100).toFixed(2)}%`
    readout.value = [
      lightOn ? 'LIGHT ON' : 'light off',
      `score ${score.toFixed(2)} (on at ${settings.onAt.toFixed(2)})`,
      `patch ${pct(blob)} (room ${pct(roomBlob)})`,
      `contrast ${contrast.toFixed(2)}`,
      `white ${pct(whiteShare)}`,
    ].join(' · ')
  }

  onBeforeUnmount(stop)

  return { video, running, readout, reading, start, stop, sample }
}
