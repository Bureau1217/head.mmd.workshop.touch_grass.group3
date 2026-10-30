<script setup lang="ts">
// Captcha grid lines over the sky. The cells match the ones the sky fills in (app/lib/sky.ts).
defineProps<{ visible: boolean }>()

// Where the inner lines sit, as a percentage of the screen
const lines = Array.from({ length: CAPTCHA_GRID - 1 }, (_, i) => `${((i + 1) * 100) / CAPTCHA_GRID}%`)
</script>

<template>
  <div class="app-captcha-grid" :hidden="!visible" aria-hidden="true">
    <span
      v-for="at in lines"
      :key="`col-${at}`"
      class="app-captcha-grid__line app-captcha-grid__line--col"
      :style="{ left: at }"
    />
    <span
      v-for="at in lines"
      :key="`row-${at}`"
      class="app-captcha-grid__line app-captcha-grid__line--row"
      :style="{ top: at }"
    />
  </div>
</template>

<style lang="scss" scoped>
.app-captcha-grid {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.app-captcha-grid__line {
  position: absolute;
  background: var(--app-color-grid);
}

.app-captcha-grid__line--col {
  top: 0;
  bottom: 0;
  width: var(--app-grid-line);
  transform: translateX(-50%);
}

.app-captcha-grid__line--row {
  left: 0;
  right: 0;
  height: var(--app-grid-line);
  transform: translateY(-50%);
}
</style>
