// The harvest: once the game is done, the finished drawing is downloaded as an SVG file.
// The file text is prepared early (when the game finishes), because the download itself often
// happens while the tab is being left, when there's little time to do work.

const HARVEST_FILENAME = 'touch-grass-harvest.svg'

export function useHarvest() {
  let drawing: SVGSVGElement | null = null
  let fileText: string | null = null

  // The on-screen drawing to save (from AppPlant's `ready` event)
  function setDrawing(svg: SVGSVGElement): void {
    drawing = svg
  }

  // Turns the drawing into file text now, so download() is instant later
  function prepare(): void {
    if (!drawing) return
    try {
      fileText = serializeHarvest(drawing)
    }
    catch (e) {
      console.error('Could not prepare the harvest file.', e)
    }
  }

  function download(): void {
    if (!fileText) prepare()
    if (fileText) downloadFile(fileText, HARVEST_FILENAME, 'image/svg+xml')
  }

  return { setDrawing, prepare, download }
}
