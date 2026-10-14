<script setup lang="ts">
import { computed } from 'vue'
import Icon from '../../components/Icon.vue'
import { requirePreviewFile } from '../types'
import type { PreviewComponentProps } from '../types'

const props = defineProps<PreviewComponentProps>()
const extension = computed(() => requirePreviewFile(props.context).extension.toUpperCase())
</script>

<template>
  <div class="reader-empty" role="status"><span class="empty-illustration"><Icon name="image" :size="34" /></span><h2>不支持此图片格式</h2><p>当前没有可用的 {{ extension }} 图片预览器。<br>可以使用右上角的下载按钮保存源文件。</p></div>
</template>
