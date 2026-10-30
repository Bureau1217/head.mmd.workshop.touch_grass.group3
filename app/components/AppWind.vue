<script setup lang="ts">
// Wind gusts: sends wind.svg across in stop-motion steps (like public/images/reference/Opera_senza_titolo.gif),
// mirrored when the gust comes from the left. Purely visual: the push on the plant is in AppTouchGrass.
// Each gust is several symbols, sent one after another. The symbols are <img> elements created
// from script and moved with the Web Animations API, then removed when they leave the screen.
import type { GustRequest } from '~/types/touch-grass'

const props = defineProps<{
  active: boolean
  // A new value sends one gust
  gust: GustRequest | null
}>()

const WIND_SRC = publicUrl('images/wind.svg')
const WIND_WIDTH = 703 // wind.svg's own size
const WIND_HEIGHT = 459
const WIND_FALLBACK_WIDTH: [number, number] = [0.36, 220] // share of screen width, max px. Same as the CSS below.
const FRAME_MS = 100 // one stop-motion step
// Per-step wobble copied from the GIF, repeating: vertical bob and tilt
const BOB = [0, 8, 8, 0, -13, 1] // px per BOB_REFERENCE_WIDTH px of symbol width
const BOB_REFERENCE_WIDTH = 126 // the symbol's width in the GIF
const TILT = [-3, 2, 0, -2, 4, -1] // degrees
const STEP_LENGTH = 0.42 // distance moved per step, in symbol widths (about the GIF's step size)
const SYMBOLS_PER_SECOND = 1 / 0.75 // how many symbols a gust sends per second it lasts
const SEND_SPREAD = 0.8 // symbols are sent during the first 80% of the gust
const SEND_JITTER_MS = 150 // random extra delay per symbol, so they don't feel mechanical
const LANE: [number, number] = [0.2, 0.65] // vertical band the symbols fly in, as a share of screen height

const root = useTemplateRef<HTMLDivElement>('root')
// Pending symbol timers, so they can be cancelled on unmount
const timers = new Set<ReturnType<typeof setTimeout>>()

// Schedules the symbols of one gust. `duration` is in seconds.
function showGust(direction: number, duration: number): void {
  const count = Math.max(2, Math.round(duration * SYMBOLS_PER_SECOND))
  const sendWindowMs = duration * 1000 * SEND_SPREAD
  for (let i = 0; i < count; i++) {
    const delay = (i * sendWindowMs) / count + Math.random() * SEND_JITTER_MS
    const timer = setTimeout(() => {
      timers.delete(timer)
      sendSymbol(direction)
    }, delay)
    timers.add(timer)
  }
}

// direction < 0: blows from the right toward the left (wind.svg as drawn, curls on the left).
// direction > 0: blows from the left, so the symbol is mirrored.
function sendSymbol(direction: number): void {
  if (!props.active || !root.value) return
  const img = new Image(WIND_WIDTH, WIND_HEIGHT)
  img.src = WIND_SRC
  img.alt = ''
  img.className = 'app-wind__gust'
  root.value.appendChild(img)

  const width = img.getBoundingClientRect().width || Math.min(innerWidth * WIND_FALLBACK_WIDTH[0], WIND_FALLBACK_WIDTH[1])
  const screenWidth = innerWidth
  const y = innerHeight * randomIn(LANE)
  const flip = direction > 0 ? -1 : 1 // mirror the symbol when blowing toward the right
  // Start just off one side, end just off the other
  const offRight = screenWidth + width * 0.1
  const offLeft = -width * 1.1
  const fromX = direction < 0 ? offRight : offLeft
  const toX = direction < 0 ? offLeft : offRight
  const steps = Math.max(8, Math.round(Math.abs(toX - fromX) / (width * STEP_LENGTH)))
  const wobbleStart = Math.floor(Math.random() * BOB.length) // so symbols don't wobble in sync

  // One keyframe per step; `steps(1, end)` makes each one jump instead of glide (stop-motion)
  const keyframes: Keyframe[] = []
  for (let step = 0; step <= steps; step++) {
    const wobble = (step + wobbleStart) % BOB.length
    const x = fromX + ((toX - fromX) * step) / steps
    const bob = ((BOB[wobble] ?? 0) * width) / BOB_REFERENCE_WIDTH
    const tilt = (TILT[wobble] ?? 0) * flip
    keyframes.push({
      transform: `translate(${x.toFixed(1)}px, ${(y + bob).toFixed(1)}px) rotate(${tilt}deg) scaleX(${flip})`,
      easing: 'steps(1, end)',
    })
  }
  const anim = img.animate(keyframes, { duration: steps * FRAME_MS, fill: 'forwards' })
  anim.onfinish = () => img.remove()
}

watch(() => props.gust, (gust) => {
  if (gust) showGust(gust.direction, gust.duration)
})

onMounted(() => {
  new Image().src = WIND_SRC // preload
})

onBeforeUnmount(() => {
  timers.forEach(timer => clearTimeout(timer))
  timers.clear()
})
</script>

<template>
  <div ref="root" class="app-wind" aria-hidden="true" />
</template>

<style lang="scss" scoped>
.app-wind {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

// The gust images are created from script, so they need :deep to get scoped styles
.app-wind :deep(.app-wind__gust) {
  position: absolute;
  left: 0;
  top: 0;
  width: min(36vw, 220px); // keep in sync with WIND_FALLBACK_WIDTH in the script
  height: auto;
  will-change: transform;
}
</style>
