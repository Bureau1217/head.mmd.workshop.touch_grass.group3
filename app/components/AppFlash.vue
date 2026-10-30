<script setup lang="ts">
// Blinking green frame around the window when a step is finished.
// Changing `pulse` restarts the animation. `forever` keeps it blinking.

defineProps<{
  pulse: number // a new value re-creates the element (it is the :key), which restarts the animation
  on: boolean
  forever: boolean
}>()

// `end` fires after a single blink, so the parent can switch `on` off again

const emit = defineEmits<{
  end: []
}>()
</script>

<template>
  <div
    :key="pulse"
    class="app-flash"
    :class="{ 'app-flash--on': on, 'app-flash--forever': on && forever }"
    aria-hidden="true"
    @animationend="emit('end')"
  />
</template>

<style lang="scss" scoped>
.app-flash {
  position: fixed;
  inset: 0;
  z-index: var(--app-z-flash);
  pointer-events: none;
  // Solid green at the edges, fading out toward the middle
  box-shadow:
    inset 0 0 0 4px var(--app-color-leaf),
    inset 0 0 min(14vw, 90px) min(4vw, 26px) color-mix(in srgb, var(--app-color-leaf) 85%, transparent),
    inset 0 0 min(36vw, 240px) min(6vw, 40px) color-mix(in srgb, var(--app-color-leaf) 35%, transparent);
  opacity: 0;

  // One pulse: quick swell, slow settle
  &.app-flash--on {
    animation: app-flash-blink 1.3s 1 both;
  }

  &.app-flash--forever {
    animation: app-flash-blink 2.4s infinite both;
  }
}

@keyframes app-flash-blink {
  0% {
    opacity: 0;
    animation-timing-function: cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  16% {
    opacity: 1;
    animation-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
  }
  100% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  // Fade the frame in and out instead of flashing
  .app-flash.app-flash--on {
    animation: app-flash-glow 1.5s ease-in-out 1;
  }

  .app-flash.app-flash--forever {
    animation: app-flash-glow 2s ease-in-out infinite;
  }
}

@keyframes app-flash-glow {
  0%,
  100% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
}
</style>
