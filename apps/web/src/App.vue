<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AppConfig, Entry, ResolvedReference, SessionInfo } from '@mdnook/shared'
import { isImage, parentPath } from '@mdnook/shared'
import { api } from './api'
import DirectoryNode from './components/DirectoryNode.vue'
import Icon from './components/Icon.vue'
import PreviewHost from './preview/PreviewHost.vue'
import type { OpenWithRequest } from './preview/types'

defineProps<{ username?: string | null; authMode?: SessionInfo['mode'] }>()
defineEmits<{ logout: [] }>()

const route = useRoute()
const router = useRouter()
const config = ref<AppConfig>({ name: 'mdnook', version: '0.0.3', rootName: '文档目录', rootId: '' })
const path = computed(() => typeof route.query.path === 'string' ? route.query.path : '')
const selectedFilePath = computed(() => ['/document', '/file'].includes(route.path) ? path.value : '')
const directory = computed(() => {
  try { return selectedFilePath.value ? parentPath(selectedFilePath.value) : path.value } catch { return '' }
})
const entries = ref<Entry[]>([])
const directoryLoading = ref(false)
const directoryError = ref('')
const filter = ref('')
const revision = ref(0)
const openWith = ref<OpenWithRequest>()
let openWithSequence = 0
const listWidth = ref(320)
const filterShortcut = /Mac/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
const dark = ref(false)
const filterInput = ref<HTMLInputElement>()
const directoryName = computed(() => directory.value.split('/').at(-1) || config.value.rootName)
const visibleEntries = computed(() => entries.value.filter(entry => entry.name.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())))
const markdownCount = computed(() => entries.value.filter(entry => entry.kind === 'markdown').length)
const breadcrumbs = computed(() => {
  const parts = directory.value.split('/').filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
})
let directoryAbort: AbortController | undefined

function selectDirectory(path: string) {
  void router.push({ path: '/browse', query: path ? { path } : {} })
}
function selectFile(entry: Entry) {
  if (entry.kind === 'directory') return selectDirectory(entry.path)
  void router.push({ path: '/file', query: { path: entry.path } })
}

function openFileWith(entry: Entry, event: MouseEvent | KeyboardEvent) {
  if (entry.kind === 'directory') return
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const pointer = event instanceof MouseEvent && (event.clientX !== 0 || event.clientY !== 0)
  openWith.value = { path: entry.path, sequence: ++openWithSequence, x: pointer ? event.clientX : rect.left + 24, y: pointer ? event.clientY : rect.bottom }
  selectFile(entry)
}

function fileKeyboard(entry: Entry, event: KeyboardEvent) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openFileWith(entry, event)
}
function openWithHandled(sequence: number) {
  if (openWith.value?.sequence === sequence) openWith.value = undefined
}

watch([directory, revision], async ([path]) => {
  directoryAbort?.abort()
  const controller = new AbortController()
  directoryAbort = controller
  directoryLoading.value = true
  directoryError.value = ''
  entries.value = []
  filter.value = ''
  try {
    const listing = await api.entries(path, controller.signal)
    if (controller.signal.aborted) return
    entries.value = listing.entries
    if (route.path === '/browse') {
      const readme = listing.entries.find(entry => entry.kind === 'markdown' && /^readme\.(md|markdown)$/i.test(entry.name))
      if (readme) void router.replace({ path: '/document', query: { path: readme.path } })
    }
  } catch (error) {
    if (!controller.signal.aborted) directoryError.value = (error as Error).message
  } finally { if (!controller.signal.aborted) directoryLoading.value = false }
}, { immediate: true })

function navigate(reference: ResolvedReference) {
  if (reference.kind === 'external') window.open(reference.href, '_blank', 'noopener,noreferrer')
  else if (reference.kind === 'directory') selectDirectory(reference.path)
  else void router.push({ path: '/file', query: { path: reference.path }, hash: reference.hash ? `#${reference.hash}` : '' })
}

function refresh() { revision.value++ }
function formatSize(size: number) { return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB` }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)) }
function iconName(entry: Entry) { return entry.kind === 'directory' ? 'folder' : isImage(entry.path) ? 'image' : 'file' }

let stopResize: (() => void) | undefined
function startResize(event: PointerEvent) {
  stopResize?.()
  const startX = event.clientX
  const initial = listWidth.value
  documentSelection(false)
  const move = (event: PointerEvent) => { listWidth.value = Math.max(230, Math.min(480, initial + event.clientX - startX)) }
  const stop = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', stop)
    documentSelection(true)
    stopResize = undefined
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, { once: true })
  stopResize = stop
}
function documentSelection(enabled: boolean) { window.document.body.style.userSelect = enabled ? '' : 'none' }
function resizeByKeyboard(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    listWidth.value = Math.max(230, Math.min(480, listWidth.value + (event.key === 'ArrowLeft' ? -20 : 20)))
  }
}
function keyboard(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'k') { event.preventDefault(); filterInput.value?.focus() }
  if (event.key === 'Escape') { filter.value = ''; filterInput.value?.blur() }
}
watch(dark, value => {
  window.document.documentElement.classList.toggle('dark', value)
  try { localStorage.setItem('mdnook-theme', value ? 'dark' : 'light') } catch { /* Storage may be unavailable. */ }
})
onMounted(async () => {
  window.addEventListener('keydown', keyboard)
  try { dark.value = localStorage.getItem('mdnook-theme') === 'dark' } catch { /* Use light theme. */ }
  try { config.value = await api.config() } catch (error) { directoryError.value = (error as Error).message }
})
onUnmounted(() => {
  directoryAbort?.abort(); stopResize?.()
  window.removeEventListener('keydown', keyboard)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="/browse" @click.prevent="selectDirectory('')"><span class="brand-mark"><Icon name="book" :size="22" /></span><span>mdnook<span class="brand-dot">.</span></span></a>
      <span class="header-divider"></span><span class="header-caption">给文档一个安静的角落</span>
      <div class="header-actions"><span class="local-badge" :title="authMode === 'disabled' ? '启动时显式关闭了账号认证' : username ?? '回环地址免登录'"><i></i>{{ authMode === 'disabled' ? '免认证模式' : username ? '系统登录' : '本地阅读' }}</span><button v-if="username" class="text-button" @click="$emit('logout')">退出登录</button><button class="icon-button" :aria-label="dark ? '切换浅色主题' : '切换深色主题'" :title="dark ? '浅色主题' : '深色主题'" @click="dark = !dark"><Icon :name="dark ? 'sun' : 'moon'" /></button></div>
    </header>

    <div class="workspace">
      <aside class="sidebar" aria-label="目录树">
        <div class="sidebar-heading"><span>文档空间</span><span class="small-label">LOCAL</span></div>
        <button class="space-card" @click="selectDirectory('')"><span class="space-icon"><Icon name="folderOpen" :size="20" /></span><span><strong>{{ config.rootName }}</strong><small>从这里开始阅读</small></span><Icon name="chevron" :size="14" /></button>
        <div class="tree-section-label">目录 <span>按需加载</span></div>
        <nav class="tree-scroll"><ul class="directory-tree"><DirectoryNode path="" :name="config.rootName" :current="directory" :revision="revision" @select="selectDirectory" /></ul></nav>
        <div class="sidebar-footer"><Icon name="book" :size="17" /><span>文件留在本机<br><small>只读浏览 · 无需上传</small></span></div>
      </aside>

      <main class="main-workspace">
        <div class="navigation-bar">
          <div class="navigation-actions"><button class="icon-button" aria-label="后退" title="后退" @click="router.back()"><Icon name="back" :size="17" /></button><button class="icon-button" aria-label="前进" title="前进" @click="router.forward()"><Icon name="forward" :size="17" /></button><button class="icon-button" aria-label="上级目录" title="上级目录" :disabled="!directory" @click="selectDirectory(parentPath(directory))"><Icon name="up" :size="17" /></button></div>
          <nav class="breadcrumbs" aria-label="当前位置"><button @click="selectDirectory('')"><Icon name="home" :size="15" /><span>{{ config.rootName }}</span></button><template v-for="crumb in breadcrumbs" :key="crumb.path"><Icon name="chevron" :size="12" /><button @click="selectDirectory(crumb.path)">{{ crumb.name }}</button></template></nav>
          <button class="icon-button refresh-button" aria-label="刷新目录与预览" title="刷新" @click="refresh"><Icon name="refresh" :size="16" :class="{ spinning: directoryLoading }" /></button>
        </div>

        <div class="content-panes" :style="{ '--list-width': `${listWidth}px` }">
          <section class="file-pane" aria-label="当前目录文件列表">
            <div class="pane-heading"><div><span class="eyebrow">当前目录</span><h1 :title="directoryName">{{ directoryName }}</h1></div><span class="count-pill">{{ entries.length }}</span></div>
            <label class="filter-box"><Icon name="search" :size="16" /><input ref="filterInput" v-model="filter" placeholder="筛选文件…" aria-label="筛选当前目录文件" /><kbd v-if="!filter">{{ filterShortcut }}</kbd><button v-else class="clear-filter" aria-label="清除筛选" @click="filter = ''"><Icon name="close" :size="13" /></button></label>
            <div class="list-heading"><span>名称</span><span>修改时间</span></div>
            <div class="file-list" :aria-busy="directoryLoading">
              <div v-if="directoryLoading" class="list-message">正在读取目录…</div>
              <div v-else-if="directoryError" class="list-message error-message"><Icon name="alert" /><p>{{ directoryError }}</p><button class="text-button" @click="refresh">重新读取</button></div>
              <div v-else-if="!visibleEntries.length" class="list-message"><Icon name="folder" :size="28" /><p>{{ filter ? '没有匹配的文件' : '这个目录还没有文件' }}</p></div>
              <button v-for="entry in visibleEntries" :key="entry.path" class="file-row" :class="{ active: entry.path === selectedFilePath, 'is-folder': entry.kind === 'directory' }" :aria-pressed="entry.path === selectedFilePath" :title="`${entry.name}${entry.kind === 'directory' ? '' : ' · ' + formatSize(entry.size)}`" @click="selectFile(entry)" @contextmenu="openFileWith(entry, $event)" @keydown="fileKeyboard(entry, $event)">
                <span class="file-icon" :class="entry.kind"><Icon :name="iconName(entry)" :size="19" /></span><span class="file-name">{{ entry.name }}<small>{{ entry.kind === 'directory' ? '文件夹' : entry.kind === 'markdown' ? 'Markdown · ' + formatSize(entry.size) : formatSize(entry.size) }}</small></span><time :datetime="entry.modifiedAt">{{ formatDate(entry.modifiedAt) }}</time>
              </button>
            </div>
            <div class="file-pane-footer"><Icon name="file" :size="13" /><span>{{ markdownCount }} 篇文档</span><span class="footer-separator">·</span><span>{{ entries.length }} 个项目</span></div>
          </section>

          <div class="pane-resizer" role="separator" aria-label="调整文件列表宽度" aria-orientation="vertical" :aria-valuenow="listWidth" :aria-valuemin="230" :aria-valuemax="480" tabindex="0" @pointerdown="startResize" @keydown="resizeByKeyboard"></div>

          <PreviewHost :path="selectedFilePath" :hash="route.hash" :revision="revision" :version="config.version" :scope="config.rootId" :open-with="openWith" @navigate="navigate" @open-with-handled="openWithHandled" />
        </div>
      </main>
    </div>
  </div>
</template>
