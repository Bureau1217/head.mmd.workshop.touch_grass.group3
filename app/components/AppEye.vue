<script setup lang="ts">
// Round camera preview, top right. Hands its <video> to the parent so useCamera can use it.

defineProps<{
  visible: boolean
  // Hides the preview (no camera, or a step that doesn't use it) while keeping the <video> alive
  noCam: boolean
}>()

const emit = defineEmits<{
  ready: [video: HTMLVideoElement]
}>()

const video = useTemplateRef<HTMLVideoElement>('video')

onMounted(() => {
  if (video.value) emit('ready', video.value)
})
</script>

<template>
  <div class="app-eye" :class="{ 'app-eye--no-cam': noCam }" :hidden="!visible">
    <video ref="video" class="app-eye__video" playsinline muted autoplay />
  </div>
</template>

<style lang="scss" scoped>
.app-eye {
  --app-eye-size: 52px;

  position: fixed;
  top: var(--app-edge-top);
  right: var(--app-edge-right);
  width: var(--app-eye-size);
  height: var(--app-eye-size);
  pointer-events: none;

  &.app-eye--no-cam {
    display: none;
  }
}

.app-eye__video {
  display: block;
  width: var(--app-eye-size);
  height: var(--app-eye-size);
  border-radius: 50%;
  object-fit: cover;
  background: var(--app-color-ink);
}
</style>
