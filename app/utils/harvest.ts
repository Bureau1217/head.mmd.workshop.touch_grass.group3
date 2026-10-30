// The harvest: the finished drawing (black ink + all color strokes) saved as a standalone SVG file.
import { SVG_NS } from './touch-grass'

// Turns the on-screen drawing into SVG file text, with every stroke fully drawn
export function serializeHarvest(drawing: SVGSVGElement): string {
  const clone = drawing.cloneNode(true)
  if (!(clone instanceof SVGSVGElement)) throw new Error('The drawing is not an <svg>')
  clone.setAttribute('xmlns', SVG_NS)
  for (const name of ['class', 'style', 'role']) clone.removeAttribute(name)
  // Vue's scoped-style markers (data-v-…) mean nothing outside the page
  for (const name of clone.getAttributeNames()) {
    if (name.startsWith('data-v-')) clone.removeAttribute(name)
  }
  // The strokes are animated in with dashes; a file should just show them whole
  for (const el of clone.querySelectorAll('[stroke-dasharray]')) {
    el.removeAttribute('stroke-dasharray')
    el.removeAttribute('stroke-dashoffset')
  }
  // Give the file a real size, so image viewers don't show it at 0 × 0 or full screen
  const viewBox = clone.viewBox.baseVal
  if (viewBox) {
    clone.setAttribute('width', String(viewBox.width))
    clone.setAttribute('height', String(viewBox.height))
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`
}

// Starts a file download without a server round trip
export function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Free the file from memory later; revoking right away can cancel the download in some browsers
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
