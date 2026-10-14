<script setup lang="ts">
import NativeImage from './NativeImage.vue'
import type { PreviewComponentProps, PreviewReport } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ report: [report: PreviewReport] }>()
</script>

<template>
  <!-- Use an image resource so SVG scripts and foreign HTML cannot execute in the app. -->
  <NativeImage v-bind="props" class="svg-image" @report="emit('report', $event)" />
</template>
