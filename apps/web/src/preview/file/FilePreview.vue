<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { DocumentData } from '@mdnook/shared'
import Icon from '../../components/Icon.vue'
import { api } from '../../api'
import fileType from '../../file-types/file/node'
import { identifyFileType } from '../../file-types/tree'
import { textResource } from '../../file-types/resources'
import type { FileTypeResult } from '../../file-types/types'
import PreviewNodeView from '../PreviewNodeView.vue'
import { emptyPreviewSettings, parsePreviewSettings, resolvePreviewer } from '../selection'
import type { PreviewSettings } from '../selection'
import OpenWithMenu from './OpenWithMenu.vue'
import { requirePreviewFile } from '../types'
import type { OpenWithRequest, PreviewComponentProps, PreviewContext, PreviewReport, PreviewRequest } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ navigate: [request: PreviewRequest]; notice: [message: string]; retry: []; report: [report: PreviewReport] }>()
const file = computed(() => requirePreviewFile(props.context))
const recognized = shallowRef<FileTypeResult | null>(null)
const settings = shallowRef(emptyPreviewSettings())
const manual = ref('')
const menuAnchor = ref<{ x: number; y: number }>()
const menuButton = ref<HTMLButtonElement>()
const loading = ref(true)
const error = ref('')
const readText = shallowRef<() => Promise<DocumentData>>()
const storageKey = computed(() => props.context.data.previewScope ? `mdnook-preview-v2:${location.origin}:${props.context.data.previewScope}` : '')
const selection = computed(() => recognized.value ? resolvePreviewer(recognized.value, settings.value, manual.value) : null)
const automatic = computed(() => recognized.value ? resolvePreviewer(recognized.value, settings.value) : null)
const lineage = computed(() => recognized.value?.lineage ?? [])
const viewerContext = computed<PreviewContext>(() => ({
  ...props.context,
  data: { ...props.context.data, ...recognized.value?.context.data, fileTypes: lineage.value.map(type => type.id), capabilities: recognized.value?.capabilities.map(capability => capability.id), readText: readText.value },
}))
let generation = 0
onUnmounted(() => { generation++ })

watch(storageKey, key => {
  manual.value = ''
  try {
    const current = key ? localStorage.getItem(key) : null
    const legacy = key && current === null ? localStorage.getItem(key.replace('mdnook-preview-v2:', 'mdnook-preview-v1:')) : null
    settings.value = parsePreviewSettings(current ?? legacy)
    if (key && legacy !== null) {
      try { localStorage.setItem(key, JSON.stringify(settings.value)) }
      catch { emit('notice', '原有默认设置已在本次浏览生效，浏览器未能保存迁移后的设置。') }
    }
  }
  catch { settings.value = emptyPreviewSettings() }
}, { immediate: true })

watch([() => props.context.file, () => props.context.signal], async () => {
  const current = ++generation
  const signal = props.context.signal
  const currentFile = file.value
  const reader = textResource(() => api.text(currentFile.path, signal), signal)
  readText.value = reader
  recognized.value = null
  manual.value = ''
  loading.value = true
  error.value = ''
  try {
    const result = await identifyFileType(fileType, { file: currentFile, signal, data: {}, readText: reader })
    if (!signal.aborted && current === generation) recognized.value = result
  } catch (failure) {
    if (!signal.aborted && current === generation) error.value = failure instanceof Error ? failure.message : '文件类型识别失败，请重试'
  } finally { if (!signal.aborted && current === generation) loading.value = false }
}, { immediate: true })

function setDefault(field: Exclude<keyof PreviewSettings, 'version'>, key: string, id: string) {
  const map = Object.fromEntries(Object.entries(settings.value[field]).filter(([name]) => name !== key))
  if (id) Object.defineProperty(map, key, { value: id, enumerable: true, configurable: true, writable: true })
  settings.value = { ...settings.value, [field]: map }
  manual.value = ''
  try {
    if (!storageKey.value) throw new Error('文档空间配置尚未加载')
    localStorage.setItem(storageKey.value, JSON.stringify(settings.value))
  } catch { emit('notice', '默认预览器已在本次浏览生效，浏览器未能保存设置。') }
}

function toggleMenu() {
  if (menuAnchor.value) { menuAnchor.value = undefined; return }
  const rect = menuButton.value?.getBoundingClientRect()
  if (rect) menuAnchor.value = { x: rect.right - 300, y: rect.bottom + 6 }
}
async function closeMenu(restoreFocus: boolean) {
  menuAnchor.value = undefined
  if (restoreFocus) { await nextTick(); menuButton.value?.focus() }
}
let handledRequest: number | undefined
watch([() => props.context.data.openWith, recognized], ([value, result]) => {
  const request = value as OpenWithRequest | undefined
  if (result && request?.path === file.value.path && request.sequence !== handledRequest) {
    handledRequest = request.sequence
    menuAnchor.value = { x: request.x, y: request.y }
    emit('report', { type: 'open-with-opened', data: { sequence: request.sequence } })
  }
}, { immediate: true })
</script>

<template>
  <div class="file-preview">
    <div class="reader-toolbar">
      <span class="document-tab"><Icon :name="selection?.offer.icon ?? 'file'" :size="15" /><span :title="file.name">{{ file.name }}</span><span class="read-only-label">只读</span></span>
      <div class="reader-actions">
        <button ref="menuButton" class="open-with-button" data-open-with-trigger aria-haspopup="dialog" :aria-expanded="!!menuAnchor" :disabled="!recognized" @click="toggleMenu"><Icon name="list" :size="15" /><span>打开方式</span></button>
        <a class="icon-button" :href="file.downloadUrl" title="下载源文件" :aria-label="selection?.offer.downloadLabel ?? '下载源文件'"><Icon name="download" :size="16" /></a>
      </div>
    </div>
    <OpenWithMenu v-if="menuAnchor && recognized && selection && automatic" :result="recognized" :settings="settings" :current="selection.offer.id" :automatic="automatic.offer.id" :source="selection.source" :anchor="menuAnchor" @select="manual = $event" @default="setDefault" @close="closeMenu" />
    <div v-if="selection?.ignored.length" class="preview-config-notice" role="status">{{ selection.ignored.join('；') }}，已使用兼容的预览器。</div>
    <div v-if="loading" class="reader-empty" role="status"><span class="loading-spinner"></span><p>正在识别文件类型…</p></div>
    <div v-else-if="error" class="reader-empty" role="alert"><h2>无法预览此文件</h2><p>{{ error }}</p><button class="primary-button" @click="emit('retry')">重试</button></div>
    <PreviewNodeView v-else-if="selection" :key="selection.offer.id" :node="selection.offer" :context="viewerContext" :ancestors="[node]" @navigate="emit('navigate', $event)" @notice="emit('notice', $event)" @retry="emit('retry')" />
  </div>
</template>

<style scoped>
.file-preview { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; }
.reader-actions { align-items: center; flex-shrink: 0; }
.open-with-button { display: flex; align-items: center; gap: 5px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 5px 7px; font: inherit; font-size: 11px; cursor: pointer; }
.open-with-button:hover, .open-with-button[aria-expanded=true] { background: var(--subtle); }
.open-with-button:disabled { opacity: .5; cursor: default; }
.preview-config-notice { padding: 8px 20px; font-size: 11px; color: var(--muted); background: var(--subtle); }
@media (max-width: 760px) { .reader-toolbar { padding: 0 10px; gap: 6px; } .read-only-label { display: none; } }
</style>
