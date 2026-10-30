/// <reference types="@webgpu/types" />
// Port of the parts of Figma's shader runtime (webgpu.ts, useShaderRuntime.ts) this page
// needs: one shared WebGPU device, and running a Figma fill shader's setup()/render() into a
// texture so later passes can use it.

// The frame object a Figma shader receives (CustomEffectState in the Figma runtime)
export interface ShaderFrame {
  gpu: { device: GPUDevice, context: GPUCanvasContext | null, format: GPUTextureFormat }
  input: GPUTexture
  output: GPUTexture | null
  time: number
  deltaTime: number
  frame: number
  mousePosition: { x: number, y: number, down: boolean }
  renderScale: number
  params: Record<string, unknown>
  state: Record<string, unknown>
}

// A Figma fill shader module: setup() builds its GPU pipeline, render() draws into frame.output
export interface FillShader {
  setup: (device: GPUDevice, frame: ShaderFrame) => void
  render: (device: GPUDevice, frame: ShaderFrame) => void
  params: Record<string, unknown>
}

let devicePromise: Promise<GPUDevice> | null = null

// One shared device for the page, as in webgpu.ts
export function acquireDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    devicePromise = (async () => {
      const gpu = navigator.gpu
      if (!gpu) throw new Error('WebGPU unsupported.')
      const adapter = await gpu.requestAdapter()
      if (!adapter) throw new Error('Failed to get WebGPU adapter.')
      return adapter.requestDevice()
    })()
    devicePromise.catch(() => {
      devicePromise = null
    })
  }
  return devicePromise
}

// Renders a static Figma fill shader once into a new texture and returns it.
// The caller owns the texture and must destroy() it when done.
export function renderFillToTexture(
  device: GPUDevice,
  shader: FillShader,
  width: number,
  height: number,
  format: GPUTextureFormat,
): GPUTexture {
  const texture = device.createTexture({
    size: [width, height, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  })
  // Figma shaders expect an input texture (the layer underneath). A fill has none, so pass an empty one.
  const input = device.createTexture({
    size: [width, height, 1],
    format,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  })
  const state: Record<string, unknown> = {} // the shader keeps its pipeline here between setup() and render()
  // A still frame: time, mouse and frame count are all zero
  const frame = (output: GPUTexture | null): ShaderFrame => ({
    gpu: { device, context: null, format },
    input,
    output,
    time: 0,
    deltaTime: 0,
    frame: 0,
    mousePosition: { x: 0, y: 0, down: false },
    renderScale: window.devicePixelRatio || 1,
    params: shader.params,
    state,
  })
  shader.setup(device, frame(null))
  shader.render(device, frame(texture))
  input.destroy()
  return texture
}
