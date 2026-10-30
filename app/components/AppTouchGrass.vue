<script setup lang="ts">
/* Touch Grass: the whole game. Mounted once from app.vue.
 *
 * Flow: intro (type the CAPTCHA) → sun → water → wind → done → final (type the closing CAPTCHA) → sun again.
 *   sun    Shine a light at the camera. The sky goes from night to white, then the drawing colors in.
 *   water  Show the camera something blue until the grid is fully blue. Then the plant grows in
 *          bouncy steps while it stays blue, and the blue drains back to white.
 *   wind   Gusts push the plant sideways; tilt the phone to keep it in the green zone of the bar.
 *   final  A closing CAPTCHA to type, with a → button. Sending it downloads the finished drawing
 *          as an SVG ("the harvest"). Browsers only allow a download straight after a tap or Enter,
 *          so this works everywhere, iPhones included.
 *
 * How it runs: one requestAnimationFrame loop (frame()) calls the update function of the current
 * step with the time since the last frame (dt, in seconds). The update functions change plain
 * variables and a few refs; the child components only display those refs.
 *
 * Testing helpers (add to the URL):
 *   ?phase=water|wind|final start at a later step (final: to test the harvest download)
 *   ?debug                  shows the camera readout and sun sliders; press N to finish the current step
 * Without a camera, hold a finger on the screen (or Space on a computer) instead of light/blue.
 */
import type { GustRequest, LightbarVariant, Phase, SkyStatus } from '~/types/touch-grass'

// ---------- Tuning ----------
// Sun step speed and light sensitivity live in app/app.config.ts (tune them live with ?debug).
// All times are in seconds.

// Steps that ?phase= can jump to, in order
const PHASE_ORDER: Phase[] = ['sun', 'water', 'wind', 'done', 'final']
const INTRO_TITLE = 'i am a good working human'
const FINAL_TITLE = 'i\'ll continue to be a hard working human'
const MAX_FRAME_SECONDS = 0.05 // cap on one frame's time step, so a stutter doesn't make things jump

// Sun
const SUN_TO_WATER_DELAY = 1.8 // from the finished drawing to the water step
const INPUT_SMOOTHING = 0.35 // smooths the camera reading, so flicker doesn't jerk the sun around

// Water
const WATER_FILL_SECONDS = 4 // of blue to finish growing
const WATER_DRAIN_SECONDS = 6 // without any blue to fall all the way back to empty
// Once the grid is fully blue: the plant grows step by step while it stays blue, then the blue drains to white
const GROW_STEP_SECONDS = 1.3 // between one growth step and the next
const GROW_SETTLE_SECONDS = 2 // after the last growth step, for the wobble to finish before the blue drains
const WATER_TO_WHITE_SECONDS = 1.4 // the blue draining back to white; then the wind step starts
const WATER_COVER = 1 // how much of the noise turns blue at the end of the water step (1 = the whole screen)
const GROWTH_SCALES = [1, 1.1, 1.2, 1.3] // plant size before the water, then after each of the 3 growth pulses

// Plant size spring: underdamped, so each growth step overshoots and rubberbands back
const SIZE_STIFFNESS = 22 // how hard the size pulls toward its target (lower = slower pulse)
const SIZE_DAMPING = 2.8 // how quickly the wobble dies down
const GROW_KICK = 1.1 // extra speed given to the size at each growth step (higher = stronger pulse)…
const GROW_KICK_LAST = 1.7 // …and at the last one, for a bigger finish

// Final: after the wind, the sun sky plays backwards (white to night, cell by cell), then the closing CAPTCHA
const NIGHTFALL_DELAY = 0.8 // from the end of the wind step to the start of the blend
const NIGHTFALL_SECONDS = 3.5 // the blend from white to night (like the sun step's fill time)

// Wind. Distances are in screen widths, so it plays the same on any screen.
const WIND_HOLD_SECONDS = 10 // held steady in the safe zone during gusts to finish the step
const FIRST_GUST_DELAY = 1.2
const GUST_PAUSE: [number, number] = [1, 2.2] // random pause between gusts
const GUST_DURATION: [number, number] = [2, 3.4]
const GUST_STRENGTH: [number, number] = [0.75, 1.2]
const GUST_FORCE = 0.9 // how hard a gust pushes the plant
const TILT_FORCE = 1.3 // how hard tilting the phone pushes it back
const WIND_DRAG = 1.8 // slows the plant down, so it doesn't slide forever
const EDGE_BOUNCE = 0.3 // share of its speed the plant keeps when it hits a screen edge
// After the wind step the plant springs back to the center
const SETTLE_STIFFNESS = 6
const SETTLE_DAMPING = 3
// The plant leans in the direction it moves
const LEAN_DEG_PER_SPEED = 18 // degrees of lean per screen width per second of speed
const LEAN_MAX_DEG = 7

const WATER_SPOTS = toUnitRgb(WATER_RGB) // water sky spots: same blue as the bar
const WATER_SKY_BASE = toUnitRgb(DAY_RGB) // the water sky starts white, where the sun step ended

// ---------- Inputs ----------

const debug = ref(false)
const sunSettings = useAppConfig().touchGrass.sun
const camera = useCamera(sunSettings)
const { running: cameraRunning, readout: cameraReadout } = camera
const motion = useMotion()
const harvest = useHarvest()

// ---------- State shown on screen (refs, passed to child components) ----------

const phase = ref<Phase>('intro')
const drawingReady = ref(false) // AppPlant has loaded the drawing; the game can start
const introVisible = ref(true)
const sunSkyStatus = ref<SkyStatus>('pending')
const waterSkyStatus = ref<SkyStatus>('pending')
const daylight = ref(0) // 0 night → 1 day, eased. Drives the sun sky, the background and the drawing's opacity.
const paintProgress = ref(0) // how much of the color is drawn in, 0–1
const waterSkyProgress = ref(0) // how far the blue spots have spread, 0–1
// Where the bar's marker sits, 0 (left) – 1 (right). Sun and water: how far along the step is.
// Wind: where the plant is on screen (0.5 = center).
const barPosition = ref(0)
const plantTransform = ref('') // CSS transform for the plant: wind drift, lean and growth
const gustRequest = shallowRef<GustRequest | null>(null) // set to send a gust animation to AppWind
const flash = reactive({ pulse: 0, on: false }) // the green "step done" frame, see AppFlash

// The sun sky shows while it is loading too, so it can measure its size
// It shows again at the end, running backwards for the blend from white to night
const sunSkyVisible = computed(() => sunSkyStatus.value !== 'failed' && ['intro', 'sun', 'done', 'final'].includes(phase.value))
// The blue only shows during the water step; it has drained away by the time the wind starts
const waterSkyVisible = computed(() => waterSkyStatus.value === 'ready' && phase.value === 'water')
// True during the three steps: shows the captcha grid and the camera preview
const playing = computed(() => phase.value === 'sun' || phase.value === 'water' || phase.value === 'wind')
// The grid also stays during the blend to night, since that fills cell by cell too
const gridVisible = computed(() => playing.value || phase.value === 'done')
const barVariant = computed<LightbarVariant | null>(() => {
  const p = phase.value
  return p === 'sun' || p === 'water' || p === 'wind' ? p : null
})
// The camera preview hides when there's no camera, and in the wind step (which doesn't use it)
const cameraPreviewHidden = computed(() => !cameraRunning.value || phase.value === 'wind')

// ---------- State used each frame (plain variables, not shown directly) ----------

let reduceMotion = false
let themeMeta: HTMLMetaElement | null = null // <meta name="theme-color">, the phone's status bar color

// Progress of each step, 0–1. A step is finished when its progress reaches 1.
let sunProgress = 0
let waterProgress = 0
let windProgress = 0
let sunInput = 0 // smoothed light input, 0–1 (sunProgress moves at a speed set by this)
let phaseTimer = 0 // seconds since the current step was finished (for the pause before the next)
let stepDone = false // the current step is finished and has flashed

// Plant size (a spring toward sizeTarget)
let size = 1
let sizeSpeed = 0
let sizeTarget = 1
let growthStep = 0 // index into GROWTH_SCALES

// Plant position in the wind step, in px from the screen center (negative = left)
let plantX = 0
let plantSpeedX = 0 // px per second
let gust: { elapsed: number, duration: number, strength: number } | null = null
let nextGustIn = FIRST_GUST_DELAY // seconds until the next gust starts
let gustDirection = -1 // -1 blows toward the left, 1 toward the right
let gustCount = 0

let lastFrameAt = 0
let rafId = 0

// ---------- Flash ("step done" signal) ----------

// One green blink
function blink(): void {
  flash.pulse++ // a new value restarts the animation in AppFlash
  flash.on = true
}

function onFlashEnd(): void {
  flash.on = false
}

// Marks the current step as finished (once) and blinks
function completeStep(): void {
  if (stepDone) return
  stepDone = true
  blink()
}

// ---------- Moving between steps ----------

// Bar marker position for the wind step: left edge 0, center 0.5, right edge 1
function windBarPosition(): number {
  return 0.5 + plantX / innerWidth
}

function enter(next: Phase): void {
  phase.value = next
  phaseTimer = 0
  stepDone = false
  if (next === 'water') barPosition.value = waterProgress
  else if (next === 'wind') barPosition.value = windBarPosition()
  else barPosition.value = sunProgress
  if (next === 'wind' || next === 'done') camera.stop() // no more camera needed
  if (next === 'done') harvest.prepare() // ready before the final tap, so the download starts at once
}

// ?debug, N key: finishes the current step as if the player had done it
function finishPhase(): void {
  if (phase.value === 'sun') sunProgress = 1
  else if (phase.value === 'water') waterProgress = 1
  else if (phase.value === 'wind') windProgress = 1
}

// ?phase=…: marks the earlier steps as finished, then starts at `target`.
// An unknown value starts at the beginning.
function jumpTo(target: string): void {
  const targetIndex = PHASE_ORDER.findIndex(p => p === target)
  const isSkipped = (step: Phase): boolean => PHASE_ORDER.indexOf(step) < targetIndex

  if (isSkipped('sun')) {
    sunProgress = 1
    paintProgress.value = 1
    setDaylight(1)
  }
  if (isSkipped('water')) {
    waterProgress = 1
    growthStep = GROWTH_SCALES.length - 1
    size = sizeTarget = GROWTH_SCALES[growthStep] ?? 1
  }
  if (isSkipped('wind')) windProgress = 1
  if (isSkipped('done')) setDaylight(0) // the closing CAPTCHA is on night

  enter(PHASE_ORDER[targetIndex] ?? 'sun')
}

// How strongly the player is giving light (sun) or blue (water) right now, 0–1.
// The camera is the real input. Without one, a finger on the screen stands in.
// Space always counts fully, for testing on a computer.
function inputLevel(fromCamera: number): number {
  const { touching, spaceHeld } = motion.state
  if (spaceHeld) return 1
  if (cameraRunning.value) return fromCamera
  return touching ? 1 : 0
}

// ---------- Sun step ----------

// Sets how far night has turned into day: the background, the status bar and the sky follow
function setDaylight(progress: number): void {
  const eased = ease(progress)
  daylight.value = eased
  const color = toCssRgb(mixRgb(NIGHT_RGB, DAY_RGB, eased))
  document.documentElement.style.setProperty('--app-color-background', color)
  themeMeta?.setAttribute('content', color)
}

function updateSun(dt: number): void {
  sunInput = approach(sunInput, inputLevel(camera.reading.light), INPUT_SMOOTHING, dt)
  // Light pushes the sun up; without light it slowly sinks back to night, even mid-coloring.
  const rise = sunInput / sunSettings.fillSeconds
  const sink = (1 - sunInput) / sunSettings.drainSeconds
  sunProgress = clamp(sunProgress + (rise - sink) * dt, 0, 1)

  // The coloring only moves while the sky is fully white, and pauses when it isn't.
  if (sunProgress >= 1) paintProgress.value = Math.min(1, paintProgress.value + dt / sunSettings.paintSeconds)

  setDaylight(sunProgress)
  barPosition.value = sunProgress
  if (paintProgress.value >= 1) {
    completeStep()
    phaseTimer += dt
    if (phaseTimer > SUN_TO_WATER_DELAY) enter('water')
  }
}

// ---------- Water step ----------

function updateWater(dt: number): void {
  // Filling: blue fills the bar and the grid; with no blue at all it slowly drains back.
  if (!stepDone) {
    const level = inputLevel(camera.reading.blue)
    const change = level > 0 ? level / WATER_FILL_SECONDS : -1 / WATER_DRAIN_SECONDS
    waterProgress = clamp(waterProgress + change * dt, 0, 1)
    waterSkyProgress.value = ease(waterProgress)
    barPosition.value = waterProgress
    if (waterProgress >= 1) completeStep() // the grid is fully blue
    return
  }

  // Done: the plant grows step by step while the grid stays blue,
  // then the blue drains back to white and the wind step starts.
  phaseTimer += dt
  const lastStep = GROWTH_SCALES.length - 1
  growTo(Math.min(lastStep, 1 + Math.floor(phaseTimer / GROW_STEP_SECONDS)))
  const growthEnd = (lastStep - 1) * GROW_STEP_SECONDS + GROW_SETTLE_SECONDS
  const drain = clamp((phaseTimer - growthEnd) / WATER_TO_WHITE_SECONDS, 0, 1)
  waterSkyProgress.value = 1 - ease(drain)
  if (drain >= 1) enter('wind')
}

// Grows the plant to a GROWTH_SCALES step, with a bounce (the last step bounces the most)
function growTo(step: number): void {
  if (step <= growthStep) return
  growthStep = step
  sizeTarget = GROWTH_SCALES[step] ?? sizeTarget
  sizeSpeed += step === GROWTH_SCALES.length - 1 ? GROW_KICK_LAST : GROW_KICK
}

// Moves the plant size toward sizeTarget with a springy wobble
function updateSize(dt: number): void {
  if (reduceMotion) {
    size = sizeTarget
    return
  }
  const springForce = -SIZE_STIFFNESS * (size - sizeTarget) - SIZE_DAMPING * sizeSpeed
  sizeSpeed += springForce * dt
  size += sizeSpeed * dt
}

// ---------- Wind step ----------

function startGust(): void {
  // The first gust always comes from the right (as in the wireframe), then it's random
  const isFirst = gustCount === 0
  gustDirection = isFirst || Math.random() < 0.5 ? -1 : 1
  gustCount++
  gust = { elapsed: 0, duration: randomIn(GUST_DURATION), strength: randomIn(GUST_STRENGTH) }
  gustRequest.value = { id: gustCount, direction: gustDirection, duration: gust.duration }
}

// Push from the current gust: rises and falls like a sine wave over its duration. 0 between gusts.
function gustPush(dt: number): number {
  if (!gust) {
    nextGustIn -= dt
    if (nextGustIn <= 0 && windProgress < 1) startGust()
    return 0
  }
  gust.elapsed += dt
  const push = Math.sin(Math.PI * Math.min(1, gust.elapsed / gust.duration)) * gust.strength * gustDirection
  if (gust.elapsed >= gust.duration) {
    gust = null
    nextGustIn = randomIn(GUST_PAUSE)
  }
  return push
}

function updateWind(dt: number): void {
  const screenWidth = innerWidth
  const push = gustPush(dt)

  // Gusts push the plant, tilting pushes back, drag slows it down
  const force = (push * GUST_FORCE + motion.tilt() * TILT_FORCE) * screenWidth - WIND_DRAG * plantSpeedX
  plantSpeedX += force * dt
  plantX += plantSpeedX * dt

  // Bounce softly off the screen edges
  const edge = screenWidth / 2
  if (Math.abs(plantX) > edge) {
    plantX = Math.sign(plantX) * edge
    plantSpeedX *= -EDGE_BOUNCE
  }
  barPosition.value = windBarPosition()

  // Progress only counts while a gust is blowing and the plant stays in the safe zone
  const inSafeZone = Math.abs(plantX) < screenWidth * WIND_SAFE_ZONE
  if (gust && inSafeZone) windProgress = Math.min(1, windProgress + dt / WIND_HOLD_SECONDS)
  // Finish once the last gust has blown out
  if (windProgress >= 1 && !gust) {
    completeStep()
    enter('done')
  }
}

// After the wind: night falls (the sun step backwards; the drawing fades with the light), then the closing CAPTCHA
function updateNightfall(dt: number): void {
  settle(dt)
  phaseTimer += dt
  const blend = clamp((phaseTimer - NIGHTFALL_DELAY) / NIGHTFALL_SECONDS, 0, 1)
  setDaylight(1 - blend)
  if (blend >= 1) enter('final')
}

// After the wind: the plant springs back to the center
function settle(dt: number): void {
  plantSpeedX += (-SETTLE_STIFFNESS * plantX - SETTLE_DAMPING * plantSpeedX) * dt
  plantX += plantSpeedX * dt
}

// Writes the plant's position, lean and size into its CSS transform
function renderPlant(): void {
  const lean = reduceMotion ? 0 : clamp((plantSpeedX / innerWidth) * LEAN_DEG_PER_SPEED, -LEAN_MAX_DEG, LEAN_MAX_DEG)
  plantTransform.value = `translateX(${plantX.toFixed(1)}px) rotate(${lean.toFixed(2)}deg) scale(${size.toFixed(4)})`
}

// ---------- Frame loop ----------

function frame(now: number): void {
  const dt = Math.min(MAX_FRAME_SECONDS, (now - (lastFrameAt || now)) / 1000)
  lastFrameAt = now
  camera.sample(now)
  if (phase.value === 'sun') updateSun(dt)
  else if (phase.value === 'water') updateWater(dt)
  else if (phase.value === 'wind') updateWind(dt)
  else if (phase.value === 'done') updateNightfall(dt)
  updateSize(dt)
  renderPlant()
  rafId = requestAnimationFrame(frame)
}

// ---------- Final CAPTCHA: harvest download ----------

// The closing CAPTCHA was sent. This runs straight from the tap/Enter, so the browser allows the
// download. Then the game starts over at the sun step.
function onFinalSolved(): void {
  harvest.download()
  blink()
  restart()
}

// Back to the start of the sun step, as if the intro had just been solved
function restart(): void {
  sunProgress = 0
  waterProgress = 0
  windProgress = 0
  sunInput = 0
  paintProgress.value = 0
  waterSkyProgress.value = 0
  setDaylight(0)
  growthStep = 0
  size = sizeTarget = GROWTH_SCALES[0] ?? 1
  sizeSpeed = 0
  plantX = 0
  plantSpeedX = 0
  gust = null
  nextGustIn = FIRST_GUST_DELAY
  gustCount = 0
  void camera.start() // the camera was turned off for the wind step; permission is already given
  enter('sun')
}

function onVisibilityChange(): void {
  if (!document.hidden) lastFrameAt = 0 // don't count the time away as one huge frame
}

// ---------- Start ----------

// The player solved the CAPTCHA. That tap lets the browser ask for camera and motion access.
async function start(): Promise<void> {
  await Promise.all([motion.start(), camera.start()])
  introVisible.value = false
  const jump = urlParam('phase')
  if (jump) jumpTo(jump)
  else enter('sun')
}

function onDrawingReady(drawing: SVGSVGElement): void {
  harvest.setDrawing(drawing)
  drawingReady.value = true
  rafId = requestAnimationFrame(frame)
}

function onDrawingError(error: unknown): void {
  introVisible.value = false
  console.error('The drawing didn\'t load.', error)
}

function onSunSkyReady(): void {
  sunSkyStatus.value = 'ready'
  if (phase.value === 'intro' || phase.value === 'sun') setDaylight(sunProgress)
}

// ?debug: N finishes the current step
function onDebugKey(e: KeyboardEvent): void {
  if (e.key === 'n' || e.key === 'N') finishPhase()
}

onMounted(() => {
  debug.value = hasUrlParam('debug')
  reduceMotion = prefersReducedMotion()
  themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (debug.value) window.addEventListener('keydown', onDebugKey)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('keydown', onDebugKey)
  document.documentElement.style.removeProperty('--app-color-background')
})
</script>

<template>
  <!-- Layers, back to front: skies, grid, plant + wind, bar, camera preview, start and closing CAPTCHAs, flash, debug -->
  <div class="app-touch-grass">
    <!-- Sun step sky: Figma frame "1_1" fractal noise fill (Rectangle 6), revealed from night:
         bright spots appear at the noise peaks and spread as the sun comes in.
         If WebGPU is missing, the page background fades from night to white instead (setDaylight). -->
    <AppSky
      :visible="sunSkyVisible"
      :progress="daylight"
      @ready="onSunSkyReady"
      @unavailable="sunSkyStatus = 'failed'"
    />

    <!-- Water step sky: blue spots spreading out of the same noise (different pattern) on white -->
    <AppSky
      :visible="waterSkyVisible"
      :progress="waterSkyProgress"
      :from="WATER_SKY_BASE"
      :to="WATER_SPOTS"
      :noise-phase="50"
      :cover="WATER_COVER"
      @ready="waterSkyStatus = 'ready'"
      @unavailable="waterSkyStatus = 'failed'"
    />

    <!-- Captcha grid (all three steps); the sun and water skies fill in cell by cell underneath it -->
    <AppCaptchaGrid :visible="gridVisible" />

    <!-- Game area. Touch here stands in for the camera (no camera) and for tilt (wind step). -->
    <main
      class="app-touch-grass__stage"
      @pointerdown="motion.onPointerDown"
      @pointermove="motion.onPointerMove"
    >
      <AppWind :active="phase === 'wind'" :gust="gustRequest" />
      <AppPlant
        :opacity="daylight"
        :transform="plantTransform"
        :paint-progress="paintProgress"
        @ready="onDrawingReady"
        @error="onDrawingError"
      />
    </main>

    <footer class="app-touch-grass__hud">
      <AppLightbar v-if="barVariant" :variant="barVariant" :progress="barPosition" />
    </footer>

    <!-- Camera preview; hands its <video> to useCamera -->
    <AppEye
      :visible="playing"
      :no-cam="cameraPreviewHidden"
      @ready="video => camera.video.value = video"
    />

    <!-- Start screen: type the words and press → to begin -->
    <AppTypedCaptcha
      :visible="introVisible"
      :title="INTRO_TITLE"
      :ready="drawingReady"
      with-submit
      @solved="start"
      @first-tap="motion.start"
    />

    <!-- Closing screen, on night: type the words and press → to download the harvest -->
    <AppTypedCaptcha
      :visible="phase === 'final'"
      :title="FINAL_TITLE"
      with-submit
      @solved="onFinalSolved"
    />

    <AppFlash :pulse="flash.pulse" :on="flash.on" :forever="false" @end="onFlashEnd" />

    <AppDebugMeter v-if="debug" :readout="cameraReadout" />
  </div>
</template>

<style lang="scss" scoped>
// Full-screen layer that centers the plant
.app-touch-grass__stage {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}

// Bottom strip holding the progress bar, clear of the phone's home bar
.app-touch-grass__hud {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px var(--app-gutter-safe) max(20px, env(safe-area-inset-bottom));
  pointer-events: none;
}
</style>
