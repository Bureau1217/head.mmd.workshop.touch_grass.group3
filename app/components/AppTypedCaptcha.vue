<script setup lang="ts">
// Typing CAPTCHA: a warped title (after Tom Rogers' CAPTCHA typeface) and a hand-drawn answer box.
// Typing the words and pressing → (or Enter) emits `solved`. Used as the start screen, with the
// → button: that tap lets the browser ask for camera and motion.
// Without `withSubmit` it would solve as soon as the text matches.

const props = withDefaults(defineProps<{
  visible: boolean
  title: string // what the player has to type
  // Can only be solved once this is true (the start screen waits for the drawing to load)
  ready?: boolean
  // Shows a → button and only solves on submit
  withSubmit?: boolean
}>(), {
  ready: true,
  withSubmit: false,
})

const emit = defineEmits<{
  solved: []
  // First tap on the answer box. iPhones only show the motion prompt after a tap.
  firstTap: []
}>()

// One letter of the title, with its own random look and motion
interface Letter {
  index: number // position in the whole title, across words
  char: string
  italic: boolean
  // Random starting points (radians) for the slow waves, so letters don't move in sync
  bobPhase: number // up/down bob and vertical stretch
  tiltPhase: number // rotation
  stretchPhase: number // horizontal stretch and skew
  rotation: number // resting lean, degrees
  rise: number // resting offset from the line, em
  size: number // resting scale
}

const ITALIC_CHANCE = 0.45
// id of the SVG warp filter below; unique per instance, as there are two on the page
const FILTER_ID = `app-typed-captcha-warp-${useId()}`

const reduceMotion = ref(false)
const words = shallowRef<Letter[][]>([]) // the title split into words, then letters
const letterEls: HTMLElement[] = [] // the letter <span>s, by Letter.index
const noise = useTemplateRef<SVGFETurbulenceElement>('noise')
const form = useTemplateRef<HTMLFormElement>('form')
const input = useTemplateRef<HTMLInputElement>('input')
const answer = ref('')
// With the phone keyboard open, the screen shrinks to the part above it, so the words stay in view
const viewport = useVisualViewport()
const fitStyle = computed(() => viewport.height.value === null
  ? undefined
  : { top: `${viewport.top.value}px`, bottom: 'auto', height: `${viewport.height.value}px` })
const solved = ref(false) // the right answer was typed
const wrong = ref(false) // plays the shake animation
let rafId = 0

// ---------- Warping title ----------
// Each letter leans, swells and bobs on its own slow wave; the SVG turbulence under the
// whole line drifts too, so the text keeps warping like a CAPTCHA being re-rolled.

function randomPhase(): number {
  return Math.random() * Math.PI * 2
}

function buildLetters(): Letter[][] {
  let index = 0
  return props.title.split(/\s+/).map(word => [...word].map(char => ({
    index: index++,
    char,
    italic: Math.random() < ITALIC_CHANCE,
    bobPhase: randomPhase(),
    tiltPhase: randomPhase(),
    stretchPhase: randomPhase(),
    rotation: randomIn([-15, 15]),
    rise: randomIn([-0.125, 0.125]),
    size: randomIn([0.85, 1.2]),
  })))
}

function setLetterEl(el: unknown, index: number): void {
  if (el instanceof HTMLElement) letterEls[index] = el
}

// Sets every letter's transform for time `t` (seconds). Each part is a slow sine wave:
// sin(t * speed + phase) * amount. The speeds differ so the motion never visibly repeats.
function pose(t: number): void {
  for (const letter of words.value.flat()) {
    const el = letterEls[letter.index]
    if (!el) continue
    const baseline = Math.sin(letter.index * 0.7 + t * 0.9) * 0.12 // a wavy baseline travelling along the line
    const y = letter.rise + baseline + Math.sin(t * 1.3 + letter.bobPhase) * 0.05 // em
    const rotation = letter.rotation + Math.sin(t * 0.8 + letter.tiltPhase) * 9 // deg
    const scaleX = letter.size * (1 + Math.sin(t * 1.1 + letter.stretchPhase) * 0.12)
    const scaleY = letter.size * (1 + Math.sin(t * 0.7 + letter.bobPhase) * 0.1)
    const skew = Math.sin(t * 0.6 + letter.stretchPhase) * 10 // deg
    el.style.transform = `translateY(${y.toFixed(3)}em) rotate(${rotation.toFixed(1)}deg) skewX(${skew.toFixed(1)}deg) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`
  }
  // Drift the warp filter's noise too (horizontal and vertical frequency)
  const frequencyX = 0.006 + Math.sin(t * 0.37) * 0.002
  const frequencyY = 0.012 + Math.sin(t * 0.29 + 1) * 0.004
  noise.value?.setAttribute('baseFrequency', `${frequencyX.toFixed(4)} ${frequencyY.toFixed(4)}`)
}

// Only animates while visible
function tick(now: number): void {
  if (!props.visible) return
  pose(now / 1000)
  rafId = requestAnimationFrame(tick)
}

function startWarp(): void {
  cancelAnimationFrame(rafId)
  if (props.visible && !reduceMotion.value) rafId = requestAnimationFrame(tick)
}

// ---------- Answer ----------
// Case, spaces and punctuation don't matter (so "ill" matches "i'll"). Without the button it
// solves as soon as the text matches; submitting a wrong answer shakes the box.

// "I'll be a GOOD, working-human!" → "ill be a good working human"
function simplify(text: string): string {
  return text.toLowerCase().replace(/['’]/g, '').replace(/[^a-z]+/g, ' ').trim()
}

// Emits `solved` (once) if the answer is right and `ready`
function check(): boolean {
  if (solved.value || !props.ready || simplify(answer.value) !== simplify(props.title)) return false
  solved.value = true
  input.value?.blur() // put the phone keyboard away
  emit('solved')
  return true
}

async function onSubmit(): Promise<void> {
  if (check()) return
  wrong.value = false
  await nextTick()
  void form.value?.offsetWidth // reading the size forces the browser to notice the class was removed, so the shake restarts
  wrong.value = true
}

// ---------- Following the cursor ----------
// One line that scrolls left and right with the cursor (holding the spacebar on a phone keyboard,
// arrow keys, dragging). Browsers only scroll once the cursor reaches the edge, and then jump.
// This keeps CARET_ROOM of the field's width free on the side the cursor is moving toward, so the
// line glides along with it.

const CARET_ROOM = 0.25
let measure: CanvasRenderingContext2D | null = null

// Width in px of the field's text up to the cursor
function caretX(el: HTMLInputElement): number {
  if (!measure) measure = document.createElement('canvas').getContext('2d')
  if (!measure) return 0
  measure.font = getComputedStyle(el).font
  return measure.measureText(el.value.slice(0, el.selectionEnd ?? el.value.length)).width
}

function followCaret(): void {
  const el = input.value
  if (!el || document.activeElement !== el) return
  const x = caretX(el)
  const width = el.clientWidth
  const room = width * CARET_ROOM
  let left = el.scrollLeft
  if (x - left > width - room) left = x - width + room
  else if (x - left < room) left = x - room
  el.scrollLeft = clamp(left, 0, Math.max(0, el.scrollWidth - width))
}

watch([answer, () => props.ready], () => {
  if (!props.withSubmit) check()
})
// Fresh each time it shows (it comes back after every harvest): empty field, new letters
watch(() => props.visible, async (visible) => {
  if (visible) {
    answer.value = ''
    solved.value = false
    wrong.value = false
    words.value = buildLetters()
    await nextTick()
  }
  startWarp()
})

onMounted(async () => {
  reduceMotion.value = prefersReducedMotion()
  words.value = buildLetters()
  await nextTick()
  pose(0)
  startWarp()
})

onMounted(() => document.addEventListener('selectionchange', followCaret))

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  document.removeEventListener('selectionchange', followCaret)
})
</script>

<template>
  <div
    class="app-typed-captcha"
    :class="{ 'app-typed-captcha--keyboard': viewport.keyboardOpen.value }"
    :style="fitStyle"
    :hidden="!visible"
  >
    <h1 class="app-typed-captcha__captcha" :aria-label="title" :style="{ filter: `url(#${FILTER_ID})` }">
      <template v-if="words.length">
        <span
          v-for="(word, w) in words"
          :key="w"
          class="app-typed-captcha__word"
          aria-hidden="true"
        >
          <span
            v-for="letter in word"
            :key="letter.index"
            :ref="el => setLetterEl(el, letter.index)"
            class="app-typed-captcha__char"
            :class="{ 'app-typed-captcha__char--italic': letter.italic }"
          >{{ letter.char }}</span>
        </span>
      </template>
      <template v-else>
        {{ title }}
      </template>
    </h1>

    <!-- Warp filter for the title: turbulence noise pushes the pixels around (a "displacement map") -->
    <svg class="app-typed-captcha__defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter :id="FILTER_ID" x="-15%" y="-30%" width="130%" height="160%">
        <feTurbulence
          ref="noise"
          type="fractalNoise"
          baseFrequency="0.006 0.012"
          numOctaves="1"
          seed="7"
          result="noise"
        />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="26" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>

    <!-- Hand-drawn box: a wobbly fill plus two loose marker passes -->
    <form
      ref="form"
      class="app-typed-captcha__answer"
      :class="{ 'app-typed-captcha__answer--wrong': wrong, 'app-typed-captcha__answer--with-submit': withSubmit }"
      autocomplete="off"
      @submit.prevent="onSubmit"
      @animationend="wrong = false"
    >
      <svg class="app-typed-captcha__sketch" viewBox="0 0 260 70" preserveAspectRatio="none" aria-hidden="true">
        <path class="app-typed-captcha__sketch-fill" d="M12 12 C60 4 140 9 240 5 C254 9 258 24 256 37 C255 53 250 64 231 63 C165 68 95 62 24 66 C8 62 3 49 5 35 C6 22 4 15 12 12 Z" />
        <path class="app-typed-captcha__sketch-line" d="M18 9 C70 3 150 8 238 4 C253 8 258 23 256 37 C255 54 249 64 230 64 C160 68 92 63 22 66 C7 62 3 49 5 34 C6 21 5 13 26 8" />
        <path class="app-typed-captcha__sketch-line app-typed-captcha__sketch-line--thin" d="M30 13 C95 9 172 12 243 12 C251 17 252 30 251 41 C249 54 241 59 222 59 C152 62 84 58 17 60 C11 54 10 43 11 31 C12 21 15 17 40 14" />
      </svg>
      <span class="app-typed-captcha__field">
        <input
          ref="input"
          v-model="answer"
          class="app-typed-captcha__input"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          aria-label="Type the words above"
          :disabled="solved"
          @click.once="emit('firstTap')"
          @input="followCaret"
        >
        <!-- Shows the box takes typing: a blinking cursor, until the real one appears on focus -->
        <span v-if="!answer" class="app-typed-captcha__hint" aria-hidden="true">
          <span class="app-typed-captcha__caret" />
        </span>
      </span>
      <button
        v-if="withSubmit"
        type="submit"
        class="app-typed-captcha__submit"
        aria-label="Send"
        :disabled="solved"
      >
        →
      </button>
    </form>
  </div>
</template>

<style lang="scss" scoped>
.app-typed-captcha {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 16px var(--app-gutter-safe) max(48px, calc(env(safe-area-inset-bottom) + 32px));
  container-type: size; // lets the title size itself to the height left

  // Keyboard open: the box sits just above it
  &.app-typed-captcha--keyboard {
    padding-bottom: 16px;
  }
}

// CAPTCHA title: heavy serif, letters crowding into each other on a wavy line
.app-typed-captcha__captcha {
  margin: auto 0;
  max-width: 100%;
  font-family: var(--app-font-serif);
  font-weight: 400;
  font-size: clamp(32px, min(15vw, 12cqh), 116px); // shrinks when the keyboard leaves little height
  line-height: 0.95;
  text-align: center;
  color: var(--app-color-cream);
}

.app-typed-captcha__word {
  display: inline-block;
  white-space: nowrap;
  margin: 0 0.12em;
}

.app-typed-captcha__char {
  display: inline-block;
  margin-left: -0.07em; // letters overlap, like the CAPTCHA typeface
  will-change: transform;

  &.app-typed-captcha__char--italic {
    font-style: italic;
  }
}

.app-typed-captcha__defs {
  position: absolute;
}

// The answer field lives inside the hand-drawn box
.app-typed-captcha__answer {
  --app-typed-captcha-tilt: -1.5deg;

  position: relative;
  margin: 0;
  padding: 14px 26px 15px;
  font-family: var(--app-font-hand);
  font-weight: 600;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--app-color-ink);
  cursor: text;
  touch-action: manipulation;
  transform: rotate(var(--app-typed-captcha-tilt));
  transition: transform 120ms ease;

  // Wrong answer: a quick head-shake
  &.app-typed-captcha__answer--wrong {
    animation: app-typed-captcha-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
}

.app-typed-captcha__sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.app-typed-captcha__sketch-fill {
  fill: var(--app-color-cream);
}

.app-typed-captcha__sketch-line {
  fill: none;
  stroke: var(--app-color-ink);
  stroke-width: 3.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;

  &.app-typed-captcha__sketch-line--thin {
    stroke-width: 2;
  }

  .app-typed-captcha__answer:focus-within & {
    stroke-width: 4.2;
  }

  .app-typed-captcha__answer:focus-within &.app-typed-captcha__sketch-line--thin {
    stroke-width: 2.6;
  }
}

// Holds the field and the hint laid over it
.app-typed-captcha__field {
  position: relative;
  display: block;
  width: min(72vw, 340px);

  .app-typed-captcha__answer--with-submit & {
    width: min(58vw, 290px);
  }
}

// Empty-box hint: a blinking cursor where the typed text will start
.app-typed-captcha__hint {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  font-size: max(16px, 1.25rem); // same size as the field
  white-space: nowrap;
  pointer-events: none; // taps go through to the field
}

.app-typed-captcha__caret {
  flex: none;
  width: 2px;
  height: 1.1em;
  border-radius: 1px;
  background: var(--app-color-ink);
  animation: app-typed-captcha-blink 1s steps(1) infinite;

  // Once focused, the browser shows its own cursor here
  .app-typed-captcha__answer:focus-within & {
    visibility: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
}

.app-typed-captcha__input {
  position: relative;
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: max(16px, 1.25rem); // 16px+ stops iPhones zooming in on focus
  color: var(--app-color-ink);
  caret-color: var(--app-color-ink);
  text-align: left; // centered text in a field that scrolls makes the line jump around under the cursor
  outline: none;
  user-select: text;
  -webkit-user-select: text;

  &:disabled {
    opacity: 0.6;
  }

  .app-typed-captcha__answer--with-submit & {
    width: min(58vw, 290px);
  }
}

// → send button, inside the box to the right of the field
.app-typed-captcha__answer--with-submit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 14px;
}

.app-typed-captcha__submit {
  --app-typed-captcha-submit-size: 38px;

  position: relative;
  flex: none;
  width: var(--app-typed-captcha-submit-size);
  height: var(--app-typed-captcha-submit-size);
  margin: 0;
  padding: 0 0 3px; // the arrow sits a bit low in the font
  border: 0;
  border-radius: 50%;
  background: var(--app-color-ink);
  color: var(--app-color-cream);
  font: inherit;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  transition: transform 120ms ease;

  &:active {
    transform: scale(0.92);
  }

  &:focus-visible {
    outline: 3px solid var(--app-color-water);
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

@keyframes app-typed-captcha-blink {
  50% {
    opacity: 0;
  }
}

@keyframes app-typed-captcha-shake {
  0%,
  100% {
    transform: rotate(var(--app-typed-captcha-tilt)) translateX(0);
  }
  20% {
    transform: rotate(var(--app-typed-captcha-tilt)) translateX(-10px);
  }
  40% {
    transform: rotate(var(--app-typed-captcha-tilt)) translateX(9px);
  }
  60% {
    transform: rotate(var(--app-typed-captcha-tilt)) translateX(-6px);
  }
  80% {
    transform: rotate(var(--app-typed-captcha-tilt)) translateX(3px);
  }
}
</style>
