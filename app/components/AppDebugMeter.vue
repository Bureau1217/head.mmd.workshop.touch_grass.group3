<script setup lang="ts">
// ?debug panel: what the camera measures, plus live sliders for the sun step settings.
// Slider values are saved on this device; "reset" goes back to app/app.config.ts.
// "copy" gives the code to paste into app/app.config.ts.
import type { SunSettings } from '~/types/touch-grass'

defineProps<{
  readout: string
}>()

// One slider: which setting it changes and its range
interface Knob {
  key: keyof SunSettings
  label: string
  min: number
  max: number
  step: number
}

const STORAGE_KEY = 'touchgrass-sun-settings'
const KNOBS: Knob[] = [
  { key: 'fillSeconds', label: 'fill time (s)', min: 0.5, max: 15, step: 0.5 },
  { key: 'drainSeconds', label: 'drain time (s)', min: 1, max: 30, step: 1 },
  { key: 'paintSeconds', label: 'paint time (s)', min: 1, max: 15, step: 0.5 },
  { key: 'sensitivity', label: 'sensitivity', min: 0.25, max: 5, step: 0.05 },
  { key: 'whiteLevel', label: 'white level', min: 180, max: 255, step: 1 },
  { key: 'patchFrom', label: 'patch from', min: 0, max: 0.01, step: 0.0001 },
  { key: 'patchFull', label: 'patch full', min: 0.001, max: 0.05, step: 0.0005 },
  { key: 'contrastFrom', label: 'contrast from', min: 0, max: 0.8, step: 0.01 },
  { key: 'contrastFull', label: 'contrast full', min: 0.05, max: 1, step: 0.01 },
  { key: 'onAt', label: 'on at', min: 0.05, max: 0.9, step: 0.01 },
  { key: 'offAt', label: 'off at', min: 0, max: 0.8, step: 0.01 },
]

// The same object useCamera and AppTouchGrass read, so changing it here applies at once
const sun = useAppConfig().touchGrass.sun
const defaults: SunSettings = { ...sun } // the app.config.ts values, for "reset"
const code = ref('') // the "copy" output, shown under the buttons
// Number of decimals to show for a slider step, e.g. 0.01 → 2
function decimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step)))
}

function format(knob: Knob): string {
  return sun[knob.key].toFixed(decimals(knob.step))
}

function onInput(key: keyof SunSettings, event: Event): void {
  if (event.target instanceof HTMLInputElement) sun[key] = Number(event.target.value)
}

// Only keeps values that differ from app.config.ts, so later edits there aren't hidden by old slider values
function save(): void {
  try {
    const changed = KNOBS.some(knob => sun[knob.key] !== defaults[knob.key])
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(sun))
    else localStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // storage blocked: values just won't survive a reload
  }
}

function load(): void {
  let saved: unknown = null
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  }
  catch {
    return
  }
  if (typeof saved !== 'object' || saved === null) return
  for (const knob of KNOBS) {
    const value: unknown = Reflect.get(saved, knob.key)
    if (typeof value === 'number' && Number.isFinite(value)) sun[knob.key] = value
  }
}

function reset(): void {
  Object.assign(sun, defaults)
  try {
    localStorage.removeItem(STORAGE_KEY)
  }
  catch {
    // storage blocked
  }
}

async function copy(): Promise<void> {
  const lines = KNOBS.map(knob => `  ${knob.key}: ${format(knob)},`)
  code.value = `const sun: SunSettings = {\n${lines.join('\n')}\n}`
  try {
    await navigator.clipboard.writeText(code.value)
  }
  catch {
    // no clipboard (e.g. a phone on http://): the code is shown below to select by hand
  }
}

onMounted(load)
// Copying the object makes the watcher fire when any single setting changes
watch(() => ({ ...sun }), save)
</script>

<template>
  <div class="app-debug-meter">
    <div class="app-debug-meter__readout">
      {{ readout || 'camera off' }}
    </div>
    <details class="app-debug-meter__tuning" open>
      <summary>sun settings</summary>
      <label v-for="knob in KNOBS" :key="knob.key" class="app-debug-meter__row">
        <span class="app-debug-meter__label">{{ knob.label }}</span>
        <b class="app-debug-meter__value">{{ format(knob) }}</b>
        <input
          class="app-debug-meter__slider"
          type="range"
          :min="knob.min"
          :max="knob.max"
          :step="knob.step"
          :value="sun[knob.key]"
          @input="onInput(knob.key, $event)"
        >
      </label>
      <div class="app-debug-meter__actions">
        <button type="button" @click="copy">
          copy
        </button>
        <button type="button" @click="reset">
          reset
        </button>
      </div>
      <pre v-if="code" class="app-debug-meter__code">{{ code }}</pre>
    </details>
  </div>
</template>

<style lang="scss" scoped>
.app-debug-meter {
  position: fixed;
  top: var(--app-edge-top);
  left: var(--app-edge-left);
  z-index: var(--app-z-debug);
  width: min(340px, calc(100vw - 100px));
  max-height: calc(100vh - 140px);
  overflow: auto;
  padding: 4px 8px;
  font: 11px/1.3 var(--app-font-mono);
  color: var(--app-color-paper);
  background: rgb(0 0 0 / 75%);
  touch-action: pan-y;
}

.app-debug-meter__readout {
  margin-bottom: 4px;
}

.app-debug-meter__tuning summary {
  cursor: pointer;
}

.app-debug-meter__row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  column-gap: 6px;
  margin-top: 2px;
}

.app-debug-meter__slider {
  grid-column: 1 / -1;
  width: 100%;
  min-width: 0;
  margin: 0;
  touch-action: pan-x;
}

.app-debug-meter__value {
  text-align: right;
}

.app-debug-meter__actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.app-debug-meter__code {
  margin: 6px 0 0;
  white-space: pre;
  user-select: text;
  -webkit-user-select: text;
}
</style>
