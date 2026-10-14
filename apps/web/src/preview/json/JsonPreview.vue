<script setup lang="ts">
import { computed } from 'vue'
import type { ParsedJson } from '../../file-types/types'
import type { PreviewComponentProps } from '../types'
import JsonTree from './JsonTree.vue'

const props = defineProps<PreviewComponentProps>()
const json = computed(() => props.context.data.json as ParsedJson)
</script>

<template>
  <section class="structured-preview" aria-label="JSON 预览">
    <div v-if="json.error" class="reader-empty" role="alert"><h2>JSON 解析失败</h2><p>{{ json.error }}</p><p>可以通过“打开方式”选择“源码”查看原始内容。</p></div>
    <div v-else class="structured-scroll" tabindex="0"><JsonTree :value="json.value" /></div>
    <footer class="reader-footer"><span><i class="status-dot"></i>{{ json.error ? 'JSON 格式错误' : 'JSON 树 · 点击箭头展开' }}</span></footer>
  </section>
</template>

<style src="./structured.css"></style>
