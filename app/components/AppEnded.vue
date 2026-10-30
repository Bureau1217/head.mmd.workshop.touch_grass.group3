<script setup lang="ts">
// White end screen. When the harvest is waiting, the whole screen is an invisible download button.

const props = defineProps<{
  visible: boolean
  showCollect: boolean
}>()

const emit = defineEmits<{
  collect: []
}>()

const button = useTemplateRef<HTMLButtonElement>('button')

watch(() => props.showCollect, async (show) => {
  if (!show) return
  await nextTick()
  button.value?.focus()
})
</script>

<template>
  <section class="app-ended" :hidden="!visible">
    <button
      ref="button"
      type="button"
      class="app-ended__collect"
      aria-label="Download harvest"
      :hidden="!showCollect"
      @click="emit('collect')"
    />
  </section>
</template>

<style lang="scss" scoped>
.app-ended {
  position: fixed;
  inset: 0;
  background: var(--app-color-paper);
}

// Invisible full-screen tap target
.app-ended__collect {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: 4px solid var(--app-color-water);
    outline-offset: -8px;
  }
}
</style>
