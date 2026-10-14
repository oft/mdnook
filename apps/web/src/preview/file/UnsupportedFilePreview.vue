<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { requirePreviewFile } from '../types'
import type { PreviewComponentProps } from '../types'

const props = defineProps<PreviewComponentProps>()
const file = computed(() => requirePreviewFile(props.context))
</script>

<template>
  <div class="unsupported-file-preview">
    <div class="reader-empty"><span class="empty-illustration"><Icon name="file" :size="34" /></span><h2>暂不支持预览此文件</h2><p>可以使用右上角的下载按钮保存源文件。</p></div>
    <footer class="reader-footer"><span><i class="status-dot"></i>{{ file.extension || '无扩展名' }}</span><span>{{ file.size.toLocaleString() }} 字节</span></footer>
  </div>
</template>

<style scoped>
.unsupported-file-preview { display: flex; flex: 1; flex-direction: column; min-height: 0; }
</style>
