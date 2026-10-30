import type { SunSettings } from '~/types/touch-grass'

// Sun step (captcha 1). Edit these and the dev server reloads them.
// To find good values, open the page with ?debug, move the sliders, then press "copy" and paste here.
const sun: SunSettings = {
  // Speed
  fillSeconds: 3.5,
  drainSeconds: 14,
  paintSeconds: 2.5,
  // Light detection: raise sensitivity / lower the "From" values to make light easier to detect
  sensitivity: 1,
  whiteLevel: 235,
  patchFrom: 0.0005,
  patchFull: 0.006,
  contrastFrom: 0.15,
  contrastFull: 0.4,
  onAt: 0.2,
  offAt: 0.1,
}

export default defineAppConfig({
  touchGrass: { sun },
})
