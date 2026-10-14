<script setup lang="ts">
import { computed, onUnmounted, shallowRef, watch } from 'vue'
import type { Component } from 'vue'
import { enterPreviewNode, preparedContext } from './tree'
import type { PreviewContext, PreviewerBranch, PreviewerNode, PreviewPreparation, PreviewReport, PreviewRequest, PreviewSelection, PreviewSlotBinding } from './types'

const props = defineProps<{ node: PreviewerBranch; context: PreviewContext; ancestors?: readonly PreviewerBranch[] }>()
const emit = defineEmits<{ navigate: [request: PreviewRequest]; notice: [message: string]; retry: []; report: [report: PreviewReport] }>()
const preparation = shallowRef<PreviewPreparation>({})
const currentContext = computed(() => preparedContext(props.context, preparation.value))
const component = shallowRef<Component | null>(null)
const resolvedNode = shallowRef<PreviewerNode | null>(null)
const child = shallowRef<PreviewSelection | null>(null)
const loading = shallowRef(true)
const error = shallowRef('')
const descendants = computed(() => {
  const ancestors = [...props.ancestors ?? [], props.node]
  if (resolvedNode.value && resolvedNode.value !== props.node) ancestors.push(resolvedNode.value)
  return ancestors
})
let generation = 0
let disposed = false
onUnmounted(() => { disposed = true; generation++ })

// Hash and parent UI data stay reactive without repeating metadata reads or preparation.
watch([() => props.node, () => props.context.signal, () => props.context.path, () => props.context.file], async () => {
  const current = ++generation
  const signal = props.context.signal
  loading.value = true
  error.value = ''
  preparation.value = {}
  component.value = null
  resolvedNode.value = null
  child.value = null
  try {
    const result = await enterPreviewNode(props.node, props.context, props.ancestors)
    if (signal.aborted || current !== generation) return
    preparation.value = result.preparation
    resolvedNode.value = result.node
    child.value = result.child
    component.value = result.component
  } catch (failure) {
    if (signal.aborted || current !== generation) return
    error.value = failure instanceof Error ? failure.message : '预览失败，请重试'
    emit('report', { type: 'preview-error', data: { message: error.value } })
  } finally {
    if (!signal.aborted && current === generation) loading.value = false
  }
}, { immediate: true })

function report(value: PreviewReport, handler?: PreviewSlotBinding['onReport']) {
  if (disposed || props.context.signal.aborted) return
  handler?.(value)
  emit('report', value)
}
</script>

<template>
  <div v-if="loading" class="reader-empty" role="status"><span class="loading-spinner"></span><p>正在加载{{ node.label }}预览…</p></div>
  <div v-else-if="error" class="reader-empty" role="alert"><h2>无法预览此文件</h2><p>{{ error }}</p><button class="primary-button" @click="emit('retry')">重试</button></div>
  <component v-else-if="component && resolvedNode" :is="component" :context="currentContext" :node="resolvedNode" :child="child?.node ?? null" :child-is-fallback="child?.fallback ?? false" @navigate="emit('navigate', $event)" @notice="emit('notice', $event)" @retry="emit('retry')" @report="report($event)">
    <template #default="slot: PreviewSlotBinding">
      <PreviewNodeView v-if="child" :node="child.node" :context="slot.context ?? currentContext" :ancestors="descendants" @navigate="emit('navigate', $event)" @notice="emit('notice', $event)" @retry="emit('retry')" @report="report($event, slot.onReport)" />
    </template>
  </component>
  <PreviewNodeView v-else-if="child" :node="child.node" :context="currentContext" :ancestors="descendants" @navigate="emit('navigate', $event)" @notice="emit('notice', $event)" @retry="emit('retry')" @report="report($event)" />
  <div v-else class="reader-empty"><h2>暂不支持预览此文件</h2><p>可以下载源文件。</p></div>
</template>
