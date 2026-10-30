<script setup lang="ts">
// Closing screen: a 3D tomato that turns with the phone, and a "harvest" button that downloads it.
// The 3D lives in app/lib/tomato.ts; AppTouchGrass works out the rotation from the gyroscope.
// Fades in and out with `visible`.
import type { TomatoApi } from '~/types/touch-grass'

const props = defineProps<{
  visible: boolean
  rotationX: number // radians, tips the tomato toward/away from the player
  rotationY: number // radians, spins it left/right
}>()

const emit = defineEmits<{
  // The download has started
  harvested: []
}>()

// The tomato model (.stl or .glb). If it can't be loaded, a cube stands in.
const MODEL_URL = publicUrl('Model/tomat_2.stl')

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const ready = ref(false)
let tomato: TomatoApi | null = null
let unmounted = false // set if the component goes away while the model is still loading

// Straight from the tap, so the browser allows the download (the file is already prepared)
function harvest(): void {
  if (!props.visible) return
  if (tomato) downloadFile(tomato.harvest.data, tomato.harvest.filename, tomato.harvest.type)
  emit('harvested')
}

watch(() => [props.rotationX, props.rotationY], () => tomato?.setRotation(props.rotationX, props.rotationY))

onMounted(async () => {
  if (!canvas.value) return
  try {
    // Loaded on demand, so three.js isn't in the first download
    const { createTomato } = await import('~/lib/tomato')
    const api = await createTomato(canvas.value, MODEL_URL)
    if (unmounted) {
      api.destroy()
      return
    }
    tomato = api
    tomato.setRotation(props.rotationX, props.rotationY)
    ready.value = true
  }
  catch (e) {
    // No WebGL: the button still works and takes the player back to the start
    console.warn('The 3D tomato couldn\'t be shown.', e)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  tomato?.destroy()
})
</script>

<template>
  <div class="app-tomato" :class="{ 'app-tomato--visible': visible }" :aria-hidden="!visible">
    <canvas ref="canvas" class="app-tomato__canvas" :class="{ 'app-tomato__canvas--ready': ready }" />
    <button
      type="button"
      class="app-tomato__harvest"
      :disabled="!visible"
      @click="harvest"
    >
      harvest
    </button>
  </div>
</template>

<style lang="scss" scoped>
.app-tomato {
  --app-tomato-fade: 700ms;

  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: var(--app-edge-top) var(--app-gutter-safe) max(48px, calc(env(safe-area-inset-bottom) + 32px));
  opacity: 0;
  visibility: hidden;
  pointer-events: none; // touches go through to the game area (turning without a gyroscope), except on the button
  // Fully hidden only after fading out
  transition: opacity var(--app-tomato-fade) ease, visibility 0s linear var(--app-tomato-fade);

  &.app-tomato--visible {
    opacity: 1;
    visibility: visible;
    transition: opacity var(--app-tomato-fade) ease;
  }
}

.app-tomato__canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  opacity: 0;
  transition: opacity var(--app-tomato-fade) ease;

  &.app-tomato__canvas--ready {
    opacity: 1;
  }
}

// Same hand-drawn feel as the CAPTCHA answer box: cream, ink outline, a slight tilt
.app-tomato__harvest {
  position: relative;
  margin: 0;
  padding: 14px 34px 15px;
  border: 3px solid var(--app-color-ink);
  border-radius: 18px 22px 16px 24px / 20px 16px 24px 18px;
  background: var(--app-color-cream);
  color: var(--app-color-ink);
  font-family: var(--app-font-hand);
  font-weight: 600;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  transform: rotate(-1.5deg);
  transition: transform 120ms ease;
  pointer-events: auto;

  &:active {
    transform: rotate(-1.5deg) scale(0.94);
  }

  &:focus-visible {
    outline: 3px solid var(--app-color-water);
    outline-offset: 3px;
  }
}
</style>
