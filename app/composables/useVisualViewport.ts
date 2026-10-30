// The part of the page actually visible on screen. When a phone keyboard opens, it covers the
// bottom of the page and the browser may scroll; the visual viewport is what's left above it.
// `height` stays null where the browser can't tell (then just fill the screen as usual).

const KEYBOARD_SHARE = 0.8 // visible height below this share of the window = keyboard is open

export function useVisualViewport() {
  const height = ref<number | null>(null) // px
  const top = ref(0) // px from the top of the window
  const keyboardOpen = ref(false)
  // Tallest visible height at the current width (= no keyboard); starts over when the phone turns
  let fullHeight = 0
  let lastWidth = 0

  function update(): void {
    const viewport = window.visualViewport
    if (!viewport) return
    if (Math.abs(viewport.width - lastWidth) > 1) fullHeight = 0
    lastWidth = viewport.width
    fullHeight = Math.max(fullHeight, viewport.height)
    height.value = viewport.height
    top.value = viewport.offsetTop
    keyboardOpen.value = viewport.height < fullHeight * KEYBOARD_SHARE
  }

  onMounted(() => {
    update()
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)
  })

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
  })

  return { height, top, keyboardOpen }
}
