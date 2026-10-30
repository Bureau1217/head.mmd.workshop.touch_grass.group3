/// <reference types="@webgpu/types" />
// Noise skies: Figma's fractal noise (Rectangle 6) rendered once, then revealed by a threshold.
//
// How it works:
//   1. The noise is rendered once into a texture (one grey value per pixel). It only changes on resize.
//   2. Every frame, a small shader compares each pixel's noise value to a threshold:
//      above it → `to` color, below → `from` color, with a soft edge in between.
//   3. At progress 0 the threshold sits above the brightest noise, so everything is `from`.
//      As progress rises it sinks toward the darkest value, so `to`-colored spots appear at the
//      noise peaks and spread until they cover the screen.
// Sun step: night to white, all the way. Water step: white to blue spots, partway (`cover`).
//
// The screen is split into a CAPTCHA_GRID × CAPTCHA_GRID grid (matching AppCaptchaGrid). Each cell has
// its own threshold and fills on its own schedule: it starts and finishes at its own share of the
// overall progress, in a random order.

import type { SkyApi, SkyOptions } from '~/types/touch-grass'
import { CAPTCHA_GRID, DAY_RGB, NIGHT_RGB, clamp, ease, toUnitRgb } from '~/utils/touch-grass'
import { acquireDevice, renderFillToTexture } from './shader-fill'
import * as noise from './custom-effects/fractal-noise.js'

// Params exactly as set on Rectangle 6 in Figma
const NOISE_PARAMS = {
  layerScale: 55, layerFlow: 0, cycles: 1, layerGain: 15, layerBlend: 0,
  transform: { x: 50, y: 50, radius: 50, angle: 0 },
  sharpness: 0, tileSizeX: 0, turbulence: 0, tileSizeY: 0,
  layers: 5, noiseType: 1, saturation: 0, phase: 0,
}

const EDGE = 0.05 // softness of each spot's edge, in noise units
const NIGHT = toUnitRgb(NIGHT_RGB) // dark enough for the sky, light enough to see the black lines
const WHITE = toUnitRgb(DAY_RGB)
const RESIZE_DELAY_MS = 150 // wait for the resize to stop before re-rendering the noise
const RENDER_SCALE_MAX = 2 // pixel density cap: sharper than this isn't visible, and costs a lot
const GRID = CAPTCHA_GRID
const CELLS = GRID * GRID
const THRESHOLD_VECS = Math.ceil(CELLS / 4) // the cell thresholds, packed 4 per vec4f
const CELL_START_SPREAD = 0.45 // latest a cell can start, as a share of the overall progress
const CELL_MIN_LENGTH = 0.3 // shortest share of the overall progress a cell takes to fill

// Uniform buffer layout. Must match `struct U` in REVEAL_WGSL below (WGSL aligns vec4f to 16 bytes):
//   bytes  0–15  edge + 3 unused floats (padding)
//   bytes 16–31  colA (`from`, rgb + 1)
//   bytes 32–47  colB (`to`, rgb + 1)
//   bytes 48–…   thresholds, one float per cell, packed 4 per vec4f
const UNIFORM_HEADER_BYTES = 48
const UNIFORM_BYTES = UNIFORM_HEADER_BYTES + THRESHOLD_VECS * 16

// Vertex shader: one triangle big enough to cover the whole screen.
// Fragment shader: finds the pixel's grid cell, then colors it by comparing noise to that cell's threshold.
const REVEAL_WGSL = /* wgsl */ `
  struct U { edge: f32, _a: f32, _b: f32, _c: f32, colA: vec4f, colB: vec4f, thresholds: array<vec4f, ${THRESHOLD_VECS}> };
  @group(0) @binding(0) var noiseTex: texture_2d<f32>;
  @group(0) @binding(1) var<uniform> u: U;

  @vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
    var p = array<vec2f, 3>(vec2f(-1.0, -3.0), vec2f(3.0, 1.0), vec2f(-1.0, 1.0));
    return vec4f(p[i], 0.0, 1.0);
  }

  @fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    let size = vec2f(textureDimensions(noiseTex));
    let cell = min(vec2u(pos.xy * ${GRID}.0 / size), vec2u(${GRID - 1}u));
    let i = cell.y * ${GRID}u + cell.x;
    let threshold = u.thresholds[i / 4u][i % 4u];
    let n = textureLoad(noiseTex, vec2i(pos.xy), 0).r;
    let v = smoothstep(threshold, threshold + u.edge, n);
    return vec4f(mix(u.colA.rgb, u.colB.rgb, v), 1.0);
  }
`

// The noise texture stores 16-bit floats ("half floats"); JavaScript has no such type, so decode by hand
function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1
  const e = (h >> 10) & 0x1f
  const f = h & 0x3ff
  if (e === 0) return s * 2 ** -14 * (f / 1024)
  if (e === 31) return f ? Number.NaN : s * Infinity
  return s * 2 ** (e - 15) * (1 + f / 1024)
}

interface NoiseRange {
  min: number
  max: number
}

// Lowest and highest noise value in each grid cell, so progress 0 leaves a cell fully `from`
// and 1 makes it fully `to`
// and 1 makes it fully `to`. Copies the texture back from the GPU to read it.
async function noiseRanges(device: GPUDevice, texture: GPUTexture): Promise<NoiseRange[]> {
  const { width, height } = texture
  // rgba16float = 8 bytes per pixel; WebGPU requires each copied row to be a multiple of 256 bytes
  const bytesPerRow = Math.ceil((width * 8) / 256) * 256
  const buffer = device.createBuffer({ size: bytesPerRow * height, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ })
  const enc = device.createCommandEncoder()
  enc.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, [width, height, 1])
  device.queue.submit([enc.finish()])
  await buffer.mapAsync(GPUMapMode.READ)
  const data = new Uint16Array(buffer.getMappedRange())
  const stride = bytesPerRow / 2 // row length in 16-bit values
  const ranges: NoiseRange[] = Array.from({ length: CELLS }, () => ({ min: Infinity, max: -Infinity }))
  // Every second pixel in each direction is enough to find the range, and 4× faster
  for (let y = 0; y < height; y += 2) {
    const row = Math.min(GRID - 1, Math.floor((y * GRID) / height))
    for (let x = 0; x < width; x += 2) {
      const range = ranges[row * GRID + Math.min(GRID - 1, Math.floor((x * GRID) / width))]
      if (!range) continue
      const v = halfToFloat(data[y * stride + x * 4] ?? 0) // red channel; the noise is grey
      if (v < range.min) range.min = v
      if (v > range.max) range.max = v
    }
  }
  buffer.unmap()
  buffer.destroy()
  return ranges.map(r => (Number.isFinite(r.min) ? r : { min: 0, max: 1 }))
}

interface CellSchedule {
  start: number
  end: number
}

// When each cell fills, as shares of the overall progress (0–1). Random, then stretched so the first
// cell starts at 0 and the last ends at 1.
function cellSchedules(): CellSchedule[] {
  const raw = Array.from({ length: CELLS }, () => {
    const start = Math.random() * CELL_START_SPREAD
    const end = start + CELL_MIN_LENGTH + Math.random() * (1 - start - CELL_MIN_LENGTH)
    return { start, end }
  })
  const first = Math.min(...raw.map(c => c.start))
  const last = Math.max(...raw.map(c => c.end))
  return raw.map(c => ({ start: (c.start - first) / (last - first), end: (c.end - first) / (last - first) }))
}

// Sets up a sky on `canvas`. Throws if WebGPU isn't available (AppSky catches that and falls back).
export async function createSky(
  canvas: HTMLCanvasElement,
  { from = NIGHT, to = WHITE, phase = 0, cover = 1 }: SkyOptions = {},
): Promise<SkyApi> {
  const params = { ...NOISE_PARAMS, phase }
  const device = await acquireDevice()
  const maybeContext = canvas.getContext('webgpu')
  if (!maybeContext) throw new Error('Failed to get WebGPU context.')
  const context: GPUCanvasContext = maybeContext
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'opaque' })

  const module = device.createShaderModule({ code: REVEAL_WGSL })
  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  const uniforms = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

  let texture: GPUTexture | null = null
  let bindGroup: GPUBindGroup | null = null
  let ranges: NoiseRange[] = []
  let progress = 0
  const schedules = cellSchedules()

  // (Re)renders the noise at the canvas's current size. Runs at start and after each resize.
  async function build(): Promise<void> {
    const scale = Math.min(window.devicePixelRatio || 1, RENDER_SCALE_MAX)
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.round(rect.width * scale))
    canvas.height = Math.max(1, Math.round(rect.height * scale))
    const next = renderFillToTexture(
      device,
      { setup: noise.setup, render: noise.render, params },
      canvas.width, canvas.height, 'rgba16float',
    )
    ranges = await noiseRanges(device, next)
    texture?.destroy()
    texture = next
    bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: { buffer: uniforms } },
      ],
    })
    draw()
  }

  // Redraws the sky for the current progress. Cheap: only the thresholds change.
  function draw(): void {
    if (!bindGroup) return
    // Per cell: at 0 the threshold sits just above the cell's brightest point (all `from`);
    // at cover 1 and cell progress 1 it sits a full edge below its darkest point (all `to`).
    const thresholds = new Array<number>(THRESHOLD_VECS * 4).fill(0)
    schedules.forEach(({ start, end }, i) => {
      const range = ranges[i] ?? { min: 0, max: 1 }
      const cellProgress = ease(clamp((progress - start) / (end - start), 0, 1))
      thresholds[i] = range.max + (range.min - EDGE - range.max) * cover * cellProgress
    })
    // Same order as the layout described at UNIFORM_HEADER_BYTES
    device.queue.writeBuffer(uniforms, 0, new Float32Array([EDGE, 0, 0, 0, ...from, 1, ...to, 1, ...thresholds]))
    const enc = device.createCommandEncoder()
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: from[0], g: from[1], b: from[2], a: 1 },
        storeOp: 'store',
      }],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindGroup)
    pass.draw(3)
    pass.end()
    device.queue.submit([enc.finish()])
  }

  await build()

  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      build().catch((e: unknown) => console.warn('Sky resize failed', e))
    }, RESIZE_DELAY_MS)
  })
  observer.observe(canvas)

  return {
    setProgress(p: number) {
      if (p === progress) return
      progress = p
      draw()
    },
    destroy() {
      observer.disconnect()
      clearTimeout(resizeTimer)
      texture?.destroy()
      uniforms.destroy()
    },
  }
}
