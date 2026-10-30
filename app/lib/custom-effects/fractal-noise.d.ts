// Types for fractal-noise.js, which is kept exactly as copied from Figma (plain JavaScript).
import type { ShaderFrame } from '../shader-fill'

export default function Effect(): void
export function setup(device: GPUDevice, frame: ShaderFrame): void
export function render(device: GPUDevice, frame: ShaderFrame): void
export const manifest: {
  name: string
  version: number
  isAnimated: boolean
  usesMouse: boolean
}
