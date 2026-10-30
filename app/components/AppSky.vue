<script setup lang="ts">
// Full-screen noise sky (WebGPU). Reveals `to`-colored spots over `from` as `progress` goes 0 → 1.
// The drawing itself happens in app/lib/sky.ts; this component only owns the canvas and its lifetime.
import type { RgbUnit, SkyApi } from '~/types/touch-grass'

// from, to, noisePhase and cover are read once at mount; only `progress` is live
const props = defineProps<{
  visible: boolean
  progress: number
  from?: RgbUnit
  to?: RgbUnit
  noisePhase?: number // picks a different noise pattern (0–100)
  cover?: number // how much of the screen progress 1 covers (1 = all)
}>()

const emit = defineEmits<{
  ready: []
  // No WebGPU on this device: the parent shows a plain color fade instead
  unavailable: []
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
let sky: SkyApi | null = null
let unmounted = false // set if the component goes away while the sky is still loading

onMounted(async () => {
  if (!canvas.value) return
  try {
    // Loaded on demand, so the WebGPU code isn't in the first download
    const { createSky } = await import('~/lib/sky')
    const api = await createSky(canvas.value, {
      from: props.from,
      to: props.to,
      phase: props.noisePhase,
      cover: props.cover,
    })
    if (unmounted) {
      api.destroy()
      return
    }
    sky = api
    sky.setProgress(props.progress)
    emit('ready')
  }
  catch (e) {
    console.warn('WebGPU isn\'t available here, so the sky fades evenly instead of in noise.', e)
    emit('unavailable')
  }
})

watch(() => props.progress, progress => sky?.setProgress(progress))

onBeforeUnmount(() => {
  unmounted = true
  sky?.destroy()
})
</script>

<template>
  <div class="app-sky" :hidden="!visible">
    <canvas ref="canvas" class="app-sky__canvas" />
  </div>
</template>

<style lang="scss" scoped>
.app-sky {
  position: fixed;
  inset: 0;
  isolation: isolate;
  pointer-events: none;
}

.app-sky__canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
