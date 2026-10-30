<script setup lang="ts">
// Start screen: a CAPTCHA-style title (after Tom Rogers' CAPTCHA typeface) and a hand-drawn
// answer box. Typing the warped words emits `start`. The browser needs this tap before it can
// ask for camera and motion.

const props = defineProps<{
  visible: boolean
  // The game can only start once the drawing has loaded
  ready: boolean
}>()

const emit = defineEmits<{
  start: []
  // First tap on the answer box. iPhones only show the motion prompt after a tap.
  firstTap: []
}>()

interface Letter {
  index: number
  char: string
  italic: boolean
  // random phases for the slow waves
  a: number
  b: number
  c: number
  rot: number // resting lean, degrees
  rise: number // resting offset from the line, em
  size: number
}

const TITLE = 'i am a good working human'
const ITALIC_CHANCE = 0.45
const FILTER_ID = 'app-intro-captcha-warp'

const reduceMotion = ref(false)
const words = shallowRef<Letter[][]>([])
const letterEls: HTMLElement[] = []
const noise = useTemplateRef<SVGFETurbulenceElement>('noise')
const form = useTemplateRef<HTMLFormElement>('form')
const input = useTemplateRef<HTMLInputElement>('input')
const answer = ref('')
const started = ref(false)
const wrong = ref(false)
let rafId = 0

// ---------- Warping title ----------
// Each letter leans, swells and bobs on its own slow wave; the SVG turbulence under the
// whole line drifts too, so the text keeps warping like a CAPTCHA being re-rolled.

function buildLetters(): Letter[][] {
  let index = 0
  return TITLE.split(/\s+/).map(word => [...word].map(char => ({
    index: index++,
    char,
    italic: Math.random() < ITALIC_CHANCE,
    a: Math.random() * Math.PI * 2,
    b: Math.random() * Math.PI * 2,
    c: Math.random() * Math.PI * 2,
    rot: (Math.random() - 0.5) * 30,
    rise: (Math.random() - 0.5) * 0.25,
    size: 0.85 + Math.random() * 0.35,
  })))
}

function setLetterEl(el: unknown, index: number): void {
  if (el instanceof HTMLElement) letterEls[index] = el
}

function pose(t: number): void {
  for (const letter of words.value.flat()) {
    const el = letterEls[letter.index]
    if (!el) continue
    const i = letter.index
    const wave = Math.sin(i * 0.7 + t * 0.9) * 0.12 // the wavy baseline travels along the line
    const y = letter.rise + wave + Math.sin(t * 1.3 + letter.a) * 0.05
    const r = letter.rot + Math.sin(t * 0.8 + letter.b) * 9
    const sx = letter.size * (1 + Math.sin(t * 1.1 + letter.c) * 0.12)
    const sy = letter.size * (1 + Math.sin(t * 0.7 + letter.a) * 0.1)
    const k = Math.sin(t * 0.6 + letter.c) * 10
    el.style.transform = `translateY(${y.toFixed(3)}em) rotate(${r.toFixed(1)}deg) skewX(${k.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`
  }
  const fx = 0.006 + Math.sin(t * 0.37) * 0.002
  const fy = 0.012 + Math.sin(t * 0.29 + 1) * 0.004
  noise.value?.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`)
}

function tick(now: number): void {
  if (!props.visible) return // stop once the game starts
  pose(now / 1000)
  rafId = requestAnimationFrame(tick)
}

// ---------- Answer ----------
// Case, spaces and punctuation don't matter. It opens as soon as the text matches;
// pressing Enter/Go on a wrong answer shakes the box.

function simplify(text: string): string {
  return text.toLowerCase().replace(/[^a-z]+/g, ' ').trim()
}

function check(): boolean {
  if (started.value || !props.ready || simplify(answer.value) !== simplify(TITLE)) return false
  started.value = true
  input.value?.blur() // put the phone keyboard away
  emit('start')
  return true
}

async function onSubmit(): Promise<void> {
  if (check()) return
  wrong.value = false
  await nextTick()
  void form.value?.offsetWidth // restart the shake
  wrong.value = true
}

watch([answer, () => props.ready], check)

onMounted(async () => {
  reduceMotion.value = matchMedia('(prefers-reduced-motion: reduce)').matches
  words.value = buildLetters()
  await nextTick()
  pose(0)
  if (!reduceMotion.value) rafId = requestAnimationFrame(tick)
})

onBeforeUnmount(() => cancelAnimationFrame(rafId))
</script>

<template>
  <div class="app-intro" :hidden="!visible">
    <h1 class="app-intro__captcha" :aria-label="TITLE" :style="{ filter: `url(#${FILTER_ID})` }">
      <template v-if="words.length">
        <span
          v-for="(word, w) in words"
          :key="w"
          class="app-intro__word"
          aria-hidden="true"
        >
          <span
            v-for="letter in word"
            :key="letter.index"
            :ref="el => setLetterEl(el, letter.index)"
            class="app-intro__char"
            :class="{ 'app-intro__char--italic': letter.italic }"
          >{{ letter.char }}</span>
        </span>
      </template>
      <template v-else>
        {{ TITLE }}
      </template>
    </h1>

    <svg class="app-intro__defs" width="0" height="0" aria-hidden="true" focusable="false">
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
      class="app-intro__answer"
      :class="{ 'app-intro__answer--wrong': wrong }"
      autocomplete="off"
      @submit.prevent="onSubmit"
      @animationend="wrong = false"
    >
      <svg class="app-intro__sketch" viewBox="0 0 260 70" preserveAspectRatio="none" aria-hidden="true">
        <path class="app-intro__sketch-fill" d="M12 12 C60 4 140 9 240 5 C254 9 258 24 256 37 C255 53 250 64 231 63 C165 68 95 62 24 66 C8 62 3 49 5 35 C6 22 4 15 12 12 Z" />
        <path class="app-intro__sketch-line" d="M18 9 C70 3 150 8 238 4 C253 8 258 23 256 37 C255 54 249 64 230 64 C160 68 92 63 22 66 C7 62 3 49 5 34 C6 21 5 13 26 8" />
        <path class="app-intro__sketch-line app-intro__sketch-line--thin" d="M30 13 C95 9 172 12 243 12 C251 17 252 30 251 41 C249 54 241 59 222 59 C152 62 84 58 17 60 C11 54 10 43 11 31 C12 21 15 17 40 14" />
      </svg>
      <input
        ref="input"
        v-model="answer"
        class="app-intro__input"
        type="text"
        inputmode="text"
        autocomplete="off"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="go"
        aria-label="Type the words above"
        :disabled="started"
        @click.once="emit('firstTap')"
      >
    </form>
  </div>
</template>

<style lang="scss" scoped>
.app-intro {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 16px var(--app-gutter-safe) max(48px, calc(env(safe-area-inset-bottom) + 32px));
}

// CAPTCHA title: heavy serif, letters crowding into each other on a wavy line
.app-intro__captcha {
  margin: auto 0;
  max-width: 100%;
  font-family: var(--app-font-serif);
  font-weight: 400;
  font-size: clamp(48px, 15vw, 116px);
  line-height: 0.95;
  text-align: center;
  color: var(--app-color-cream);
}

.app-intro__word {
  display: inline-block;
  white-space: nowrap;
  margin: 0 0.12em;
}

.app-intro__char {
  display: inline-block;
  margin-left: -0.07em; // letters overlap, like the CAPTCHA typeface
  will-change: transform;

  &.app-intro__char--italic {
    font-style: italic;
  }
}

.app-intro__defs {
  position: absolute;
}

// The answer field lives inside the hand-drawn box
.app-intro__answer {
  --app-intro-tilt: -1.5deg;

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
  transform: rotate(var(--app-intro-tilt));
  transition: transform 120ms ease;

  // Wrong answer: a quick head-shake
  &.app-intro__answer--wrong {
    animation: app-intro-shake 420ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
  }
}

.app-intro__sketch {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.app-intro__sketch-fill {
  fill: var(--app-color-cream);
}

.app-intro__sketch-line {
  fill: none;
  stroke: var(--app-color-ink);
  stroke-width: 3.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;

  &.app-intro__sketch-line--thin {
    stroke-width: 2;
  }

  .app-intro__answer:focus-within & {
    stroke-width: 4.2;
  }

  .app-intro__answer:focus-within &.app-intro__sketch-line--thin {
    stroke-width: 2.6;
  }
}

.app-intro__input {
  position: relative;
  display: block;
  width: min(72vw, 340px);
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: max(16px, 1.25rem); // 16px+ stops iPhones zooming in on focus
  color: var(--app-color-ink);
  caret-color: var(--app-color-ink);
  text-align: center;
  outline: none;
  user-select: text;
  -webkit-user-select: text;

  &:disabled {
    opacity: 0.6;
  }
}

@keyframes app-intro-shake {
  0%,
  100% {
    transform: rotate(var(--app-intro-tilt)) translateX(0);
  }
  20% {
    transform: rotate(var(--app-intro-tilt)) translateX(-10px);
  }
  40% {
    transform: rotate(var(--app-intro-tilt)) translateX(9px);
  }
  60% {
    transform: rotate(var(--app-intro-tilt)) translateX(-6px);
  }
  80% {
    transform: rotate(var(--app-intro-tilt)) translateX(3px);
  }
}
</style>
