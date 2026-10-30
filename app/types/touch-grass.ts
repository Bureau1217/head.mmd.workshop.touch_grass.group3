// Shared types for the Touch Grass game.

// Game steps, in order:
//   intro  the CAPTCHA start screen (type the warped words)
//   sun    shine a light at the camera until the sky turns white and the drawing colors in
//   water  show the camera something blue until the plant has grown
//   wind   tilt the phone to keep the plant in the middle while gusts push it
//   done   the three steps are finished; the screen blends from white back to night
//   final  the closing CAPTCHA (type the words, press →); solving it downloads the drawing
//          ("the harvest") and starts over at sun
export type Phase = 'intro' | 'sun' | 'water' | 'wind' | 'done' | 'final'

// The steps that show the progress bar at the bottom
export type LightbarVariant = 'sun' | 'water' | 'wind'

// A color as [red, green, blue], each 0–255, as used in CSS
export type Rgb255 = [number, number, number]

// A color as [red, green, blue], each 0–1, as used by WebGPU shaders
export type RgbUnit = [number, number, number]

// What the camera currently sees, each 0–1
export interface CameraReading {
  // How strongly a light source (torch, lamp, sun) is pointed at the camera
  light: number
  // How much of the picture is blue
  blue: number
}

export interface SkyOptions {
  // Color before the reveal (progress 0)
  from?: RgbUnit
  // Color the spots reveal (progress 1)
  to?: RgbUnit
  // Moves through the noise loop (0–100) for a different pattern
  phase?: number
  // How far progress 1 reveals, as a share of the noise range (1 = everything turns `to`)
  cover?: number
}

// What createSky() (app/lib/sky.ts) hands back to AppSky
export interface SkyApi {
  setProgress: (progress: number) => void
  destroy: () => void
}

// Asks AppWind to send one gust of wind symbols across the screen
export interface GustRequest {
  // Changes for every gust, so the watcher in AppWind fires even if direction and duration repeat
  id: number
  // -1 blows from the right, 1 from the left
  direction: number
  // seconds
  duration: number
}

// Loading state of a WebGPU sky. "failed" means no WebGPU: the page falls back to a plain color fade.
export type SkyStatus = 'pending' | 'ready' | 'failed'

// Sun step (captcha 1) settings. Defaults live in app/app.config.ts; try values live with ?debug.
export interface SunSettings {
  // Speed
  fillSeconds: number // seconds of full light to bring the sun up
  drainSeconds: number // seconds of no light to fall all the way back to night
  paintSeconds: number // seconds for the colors to draw in, once the background is white
  // Light detection (see the explanation at the top of app/composables/useCamera.ts)
  sensitivity: number // multiplies how much a light patch is worth. 2 = twice as easy
  whiteLevel: number // 0–255: a pixel is "blown out" when red, green and blue are all at least this
  patchFrom: number // share of the picture (0–1) a light patch must cover to start counting
  patchFull: number // share of the picture at which it counts fully
  contrastFrom: number // 0–1: how much brighter than the rest of the picture the patch must be to start counting
  contrastFull: number // 0–1: contrast at which it counts fully
  onAt: number // 0–1: score at which light switches on
  offAt: number // 0–1: score below which it switches off again
}
