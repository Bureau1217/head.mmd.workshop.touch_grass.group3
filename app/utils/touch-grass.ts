// Small helpers and constants shared across the game.
// Everything exported from app/utils/ is auto-imported by Nuxt in components and composables.
import type { Rgb255, RgbUnit } from '~/types/touch-grass'

// ---------- Shared constants ----------

// Captcha grid: cells per side. Used by the grid lines (AppCaptchaGrid) and the sky fill (lib/sky.ts).
export const CAPTCHA_GRID = 3

// Wind step: how far the plant may drift from the center (as a share of the screen width) and still
// count as "steady". AppLightbar paints this zone green on the bar.
export const WIND_SAFE_ZONE = 0.08

// Colors also used from script (the sky shaders, the page background fade).
// Keep these equal to the CSS variables named in the comments (app/assets/_a-params.scss).
export const NIGHT_RGB: Rgb255 = [0x13, 0x13, 0x13] // --app-color-night (#131313)
export const DAY_RGB: Rgb255 = [0xFF, 0xFF, 0xFF] // --app-color-paper (#FFFFFF)
export const WATER_RGB: Rgb255 = [0x08, 0x18, 0xFF] // --app-color-water (#0818FF)

// Namespace needed to create SVG elements from script
export const SVG_NS = 'http://www.w3.org/2000/svg'

// ---------- Math ----------

// Smoothstep: eases in and out between 0 and 1
export function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

// Random number between range[0] and range[1]
export function randomIn(range: [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

// Moves `current` toward `target` smoothly, independent of frame rate.
// `seconds` is roughly how long it takes to get two thirds of the way there.
export function approach(current: number, target: number, seconds: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / seconds))
}

// ---------- Colors ----------

// Blends from color a (t = 0) to color b (t = 1)
export function mixRgb(a: Rgb255, b: Rgb255, t: number): Rgb255 {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

export function toCssRgb(color: Rgb255): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`
}

// 0–255 color to the 0–1 color the WebGPU shaders use
export function toUnitRgb(color: Rgb255): RgbUnit {
  return [color[0] / 255, color[1] / 255, color[2] / 255]
}

// ---------- Browser ----------

// True when the player asked their system for less animation
export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

// Reads a query parameter from the page URL, e.g. ?phase=water
export function urlParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name)
}

export function hasUrlParam(name: string): boolean {
  return new URLSearchParams(location.search).has(name)
}
