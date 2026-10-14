<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { ResolvedReference } from '@mdnook/shared'
import { api } from '../api'
import Icon from '../components/Icon.vue'
import filePreviewer from './file/node'
import PreviewNodeView from './PreviewNodeView.vue'
import type { OpenWithRequest, PreviewContext, PreviewReport, PreviewRequest } from './types'

const props = defineProps<{ path: string; hash: string; revision: number; version: string; scope: string; openWith?: OpenWithRequest }>()
const emit = defineEmits<{ navigate: [reference: ResolvedReference]; openWithHandled: [sequence: number] }>()
const notice = ref('')
const retryRevision = ref(0)
const selectionKey = computed(() => JSON.stringify([props.path, props.revision, retryRevision.value]))
const controller = shallowRef(new AbortController())
const context = computed<PreviewContext>(() => ({ path: props.path, hash: props.hash, file: null, signal: controller.value.signal, data: { previewScope: props.scope, openWith: props.openWith } }))
let linkGeneration = 0

watch(selectionKey, () => {
  controller.value.abort()
  controller.value = new AbortController()
  linkGeneration++
  notice.value = ''
})
watch(() => props.hash, () => { linkGeneration++; notice.value = '' })
function keyboard(event: KeyboardEvent) { if (event.key === 'Escape') notice.value = '' }
onMounted(() => window.addEventListener('keydown', keyboard))
onUnmounted(() => { controller.value.abort(); window.removeEventListener('keydown', keyboard) })

async function followReference(request: PreviewRequest) {
  const signal = controller.value.signal
  const generation = ++linkGeneration
  try {
    const reference = await api.resolve(request.from, request.href, signal)
    if (!signal.aborted && generation === linkGeneration) emit('navigate', reference)
  } catch (error) {
    if (!signal.aborted && generation === linkGeneration) notice.value = (error as Error).message
  }
}
function report(value: PreviewReport) {
  if (value.type === 'open-with-opened' && typeof value.data?.sequence === 'number') emit('openWithHandled', value.data.sequence)
}
</script>

<template>
  <section class="reader-pane" aria-label="文件预览">
    <div v-if="!path" class="reader-toolbar"><span class="document-tab"><Icon name="book" :size="15" /><span>文件预览</span></span></div>
    <div v-if="notice" class="notice" role="alert"><Icon name="alert" :size="16" /><span>{{ notice }}</span><button aria-label="关闭提示" @click="notice = ''"><Icon name="close" :size="14" /></button></div>
    <PreviewNodeView v-if="path" :key="selectionKey" :node="filePreviewer" :context="context" @navigate="followReference" @notice="notice = $event" @retry="retryRevision++" @report="report" />
    <div v-else class="reader-empty"><span class="empty-illustration"><Icon name="book" :size="36" /></span><span class="eyebrow">YOUR LOCAL READING NOOK</span><h2>下一篇好文档，<br>就在手边。</h2><p>在左侧文件列表中选择文件，<br>预览文档、图片、文本或 JSON。</p><span class="empty-tip"><Icon name="arrow" :size="15" />支持文档相对链接与本地图片</span></div>
    <footer v-if="!path" class="reader-footer"><span><i class="status-dot"></i>准备就绪</span><span>mdnook v{{ version }}</span></footer>
  </section>
</template>
