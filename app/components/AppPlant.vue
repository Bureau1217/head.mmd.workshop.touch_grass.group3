<script setup lang="ts">
// The vegetables: veggie.svg (black ink) plus the Figma color strokes, which draw themselves
// in as `paintProgress` goes 0 → 1.
//
// The SVG is assembled at runtime from separate files in public/images/:
//   <svg>
//     <g> color strokes drawn under the ink </g>
//     <g> veggie.svg (the black ink drawing) </g>
//     <g> color strokes drawn over the ink </g>
//   </svg>
// Each stroke is "drawn" by animating its dash offset (a common SVG line-drawing trick).

const props = defineProps<{
  opacity: number
  transform: string // set by AppTouchGrass: wind drift, lean and growth
  paintProgress: number // 0 = no color, 1 = all strokes fully drawn
}>()

const emit = defineEmits<{
  // The drawing is built
  ready: [drawing: SVGSVGElement]
  error: [error: unknown]
}>()

interface Stroke {
  path: SVGPathElement
  length: number // total path length, for the dash trick
  start: number // share of paintProgress at which this stroke starts drawing
  window: number // share of paintProgress it takes to draw fully
}

const VEGGIE_URL = publicUrl('images/veggie.svg')
const VEGGIE_WIDTH = 1420.49 // veggie.svg's viewBox size; everything else is placed in these coordinates
const VEGGIE_HEIGHT = 1075.33
const VIEW_BOX = `0 0 ${VEGGIE_WIDTH} ${VEGGIE_HEIGHT}`
const STROKES_DIR = publicUrl('images/strokes/')
const strokeUrl = (id: string): string => `${STROKES_DIR}stroke-${id}.svg`

// Figma color strokes mapped into veggie.svg coordinates: [x, y, width, height].
// Measured from the "2" frame, where the Figma image is veggie.svg at 1:1, offset by (851, 55).
// The ids match the file names in public/images/strokes/.
const STROKE_BOX: Record<string, [number, number, number, number]> = {
  27: [79.82, 644.81, 784.07, 305.89], // carrot, orange
  28: [216.39, 339.96, 549.12, 543.72], // carrot, orange
  29: [783.09, 92.91, 505.81, 361], // carrot leaves
  30: [861.17, 712.52, 55.47, 37.55], // carrot leaves (dab)
  31: [902.59, 612.8, 476.66, 287.22], // carrot leaves
  32: [112.05, 188.54, 394.54, 493.7], // radish leaves, drawn above the ink
  33: [183.94, 331.22, 296.83, 398.37], // radish, red
  34: [414.9, 303.2, 156.06, 209.03], // radish, red
}
const UNDER_INK = ['33', '34', '29', '30', '31', '27', '28'] // stacking order, bottom to top, as in Figma
const OVER_INK = ['32']
const DRAW_ORDER = ['33', '34', '32', '28', '27', '29', '31', '30'] // the order strokes appear in
// Share of the total time between one stroke's start and the next. Every stroke gets the same
// long window, so they all draw slowly side by side within the same total time.
const STAGGER = 0.04

const drawing = useTemplateRef<SVGSVGElement>('drawing')
const strokes: Stroke[] = []

async function load(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: ${response.status}`)
  return response.text()
}

function parse(text: string): Element {
  return new DOMParser().parseFromString(text, 'image/svg+xml').documentElement
}

// Copies all children of `from` into `to` (as nodes of this page's document)
function appendChildrenOf(from: Element, to: Element): void {
  for (const node of [...from.childNodes]) to.appendChild(document.importNode(node, true))
}

// Wraps one stroke file in a nested <svg> placed at its box, so its own coordinates still work
function placeStroke(src: Element, [x, y, width, height]: [number, number, number, number]): SVGSVGElement {
  const box = document.createElementNS(SVG_NS, 'svg')
  box.setAttribute('x', String(x))
  box.setAttribute('y', String(y))
  box.setAttribute('width', String(width))
  box.setAttribute('height', String(height))
  box.setAttribute('viewBox', src.getAttribute('viewBox') ?? '')
  box.setAttribute('preserveAspectRatio', 'none')
  box.setAttribute('overflow', 'visible')
  box.setAttribute('fill', src.getAttribute('fill') || 'none') // the stroke files set fill="none" on their root
  appendChildrenOf(src, box)
  return box
}

async function buildDrawing(svg: SVGSVGElement): Promise<void> {
  const ids = [...UNDER_INK, ...OVER_INK]
  const [veggieText, ...strokeTexts] = await Promise.all([load(VEGGIE_URL), ...ids.map(id => load(strokeUrl(id)))])

  const under = document.createElementNS(SVG_NS, 'g')
  const ink = document.createElementNS(SVG_NS, 'g')
  const over = document.createElementNS(SVG_NS, 'g')

  appendChildrenOf(parse(veggieText ?? ''), ink)

  const pathById: Record<string, SVGPathElement> = {}
  strokeTexts.forEach((text, i) => {
    const id = ids[i]
    const boxRect = id ? STROKE_BOX[id] : undefined
    if (!id || !boxRect) return
    const box = placeStroke(parse(text), boxRect)
    const layer = OVER_INK.includes(id) ? over : under
    layer.appendChild(box)
    const path = box.querySelector('path')
    if (path) pathById[id] = path
  })

  svg.append(under, ink, over)

  // Hide every stroke: a dash as long as the path, pushed fully out of view by the offset.
  // paint() then pulls the offset back to reveal the line.
  const drawWindow = 1 - STAGGER * (DRAW_ORDER.length - 1)
  DRAW_ORDER.forEach((id, i) => {
    const path = pathById[id]
    if (!path) throw new Error(`Stroke ${id} has no path`)
    const length = path.getTotalLength()
    path.setAttribute('stroke-dasharray', `${length} ${length}`)
    path.setAttribute('stroke-dashoffset', String(length))
    strokes.push({ path, length, start: i * STAGGER, window: drawWindow })
  })
}

// Draw the colors as far as `p` (0–1) allows. Each stroke eases in and out on its own,
// like a pen starting and lifting.
function paint(p: number): void {
  for (const stroke of strokes) {
    const drawn = ease(clamp((p - stroke.start) / stroke.window, 0, 1))
    stroke.path.setAttribute('stroke-dashoffset', String(stroke.length * (1 - drawn)))
  }
}

watch(() => props.paintProgress, paint)

onMounted(async () => {
  if (!drawing.value) return
  try {
    await buildDrawing(drawing.value)
    paint(props.paintProgress)
    emit('ready', drawing.value)
  }
  catch (e) {
    emit('error', e)
  }
})
</script>

<template>
  <div
    class="app-plant"
    :style="{ opacity: opacity.toFixed(3), transform, '--app-plant-aspect': VEGGIE_WIDTH / VEGGIE_HEIGHT }"
  >
    <svg
      ref="drawing"
      class="app-plant__drawing"
      :viewBox="VIEW_BOX"
      role="img"
      aria-label="A radish and two carrots"
    />
  </div>
</template>

<style lang="scss" scoped>
.app-plant {
  // Base size before growing: as wide as fits in 76% of the width or 60% of the height.
  // --app-plant-aspect (width / height of veggie.svg) is set from the script.
  width: min(76vw, 60vh * var(--app-plant-aspect));
  aspect-ratio: var(--app-plant-aspect);
  will-change: transform;
  transform-origin: 50% 60%; // grow and lean from just below the middle, where the veggies sit
}

.app-plant__drawing {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}
</style>
