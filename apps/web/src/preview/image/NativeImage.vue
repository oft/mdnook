<script setup lang="ts">
import { computed, ref } from 'vue'
import { requirePreviewFile } from '../types'
import type { PreviewComponentProps, PreviewReport, ImageSize } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ report: [report: PreviewReport] }>()
const size = ref<ImageSize>()
const file = computed(() => requirePreviewFile(props.context))
const fit = computed(() => (props.context.data.image as { fit?: boolean } | undefined)?.fit !== false)

function loaded(event: Event) {
  if (props.context.signal.aborted) return
  const image = event.currentTarget as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return failed()
  size.value = { width: image.naturalWidth, height: image.naturalHeight }
  emit('report', { type: 'image-loaded', data: { ...size.value } })
}
function failed() { if (!props.context.signal.aborted) emit('report', { type: 'image-error' }) }
</script>

<template>
  <img class="preview-image" :src="file.assetUrl" :alt="file.name" :style="!fit && size ? { width: `${size.width}px`, height: `${size.height}px` } : undefined" decoding="async" @load="loaded" @error="failed" />
</template>
