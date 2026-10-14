<script setup lang="ts">
import { computed } from 'vue'
import type { DocumentData } from '@mdnook/shared'
import type { PreviewComponentProps } from '../types'

const props = defineProps<PreviewComponentProps>()
const text = computed(() => props.context.data.text as DocumentData)
</script>

<template>
  <section class="source-preview" aria-label="源码预览">
    <pre tabindex="0"><code>{{ text.content }}</code></pre>
    <footer class="reader-footer"><span><i class="status-dot"></i>源码 · UTF-8</span><span>{{ text.content.length.toLocaleString() }} 字符</span></footer>
  </section>
</template>

<style scoped>
.source-preview { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
pre { flex: 1; overflow: auto; margin: 0; padding: 24px; background: var(--code); font: 12px/1.8 "Cascadia Code", Consolas, monospace; tab-size: 2; }
</style>
