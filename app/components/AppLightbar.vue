<script setup lang="ts">
// Progress bar at the bottom (Figma "1", 59:1253). Its background depends on the step:
//   sun    night → white
//   water  white → blue
//   wind   a compass: the center is straight ahead, the ends are behind the player. The marker is
//          where the crops are; the green is the "found" zone. A dark line grows from the center
//          while they are held there (`hold`).
// The marker shows `progress` (0 = left end, 1 = right end).
import type { LightbarVariant } from '~/types/touch-grass'

defineProps<{
  variant: LightbarVariant
  progress: number
  hold?: number // wind: how long the crops have been held in view, 0–1
}>()

// The found zone, as a share of the bar either side of the center
const safeZone = `${WIND_SAFE_ZONE * 100}%`
</script>

<template>
  <div
    class="app-lightbar"
    :class="`app-lightbar--${variant}`"
    :style="{
      '--app-lightbar-progress': progress.toFixed(4),
      '--app-lightbar-safe-zone': safeZone,
      '--app-lightbar-hold': (hold ?? 0).toFixed(4),
    }"
    aria-hidden="true"
  >
    <div v-if="variant === 'wind'" class="app-lightbar__hold" />
    <div class="app-lightbar__mark" />
  </div>
</template>

<style lang="scss" scoped>
// Bar: Figma 71:1434, marker: Figma 71:1457
.app-lightbar {
  --app-lightbar-height: 14px;
  --app-lightbar-inset: 11px; // the marker stops this far from each end
  --app-lightbar-mark-width: 4px;
  --app-lightbar-hold-height: 4px;
  --app-lightbar-safe-fade: 14%; // wind: how far the green fades out to white past the safe zone

  position: relative;
  width: 90vw;
  height: var(--app-lightbar-height);
  margin-bottom: 11px;
  background: linear-gradient(to right, var(--app-color-night), var(--app-color-paper));

  &.app-lightbar--water {
    background: linear-gradient(to right, var(--app-color-paper), var(--app-color-water));
  }

  // Solid green across the safe zone (50% ± --app-lightbar-safe-zone, from WIND_SAFE_ZONE),
  // fading to white toward the edges
  &.app-lightbar--wind {
    background: linear-gradient(
      to right,
      var(--app-color-paper) calc(50% - var(--app-lightbar-safe-zone) - var(--app-lightbar-safe-fade)),
      var(--app-color-leaf) calc(50% - var(--app-lightbar-safe-zone)),
      var(--app-color-leaf) calc(50% + var(--app-lightbar-safe-zone)),
      var(--app-color-paper) calc(50% + var(--app-lightbar-safe-zone) + var(--app-lightbar-safe-fade))
    );
  }
}

// Wind: grows out from the center across the green zone as the crops are held in view
.app-lightbar__hold {
  position: absolute;
  top: 50%;
  left: 50%;
  width: calc(2 * var(--app-lightbar-safe-zone) * var(--app-lightbar-hold));
  height: var(--app-lightbar-hold-height);
  background: var(--app-color-ink);
  transform: translate(-50%, -50%);
}

// Moves from the left inset (progress 0) to the right inset (progress 1)
.app-lightbar__mark {
  position: absolute;
  top: 50%;
  left: calc(
    var(--app-lightbar-inset)
    + var(--app-lightbar-progress, 0) * (100% - 2 * var(--app-lightbar-inset) - var(--app-lightbar-mark-width))
  );
  width: var(--app-lightbar-mark-width);
  height: 26px;
  background: var(--app-color-marker);
  transform: translateY(-50%);
}
</style>
