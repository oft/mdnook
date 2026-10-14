<script setup lang="ts">
import NativeImage from './NativeImage.vue'
import type { PreviewComponentProps, PreviewReport } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ report: [report: PreviewReport] }>()
</script>

<template>
  <NativeImage v-bind="props" class="bitmap-image" @report="emit('report', $event)" />
</template>
