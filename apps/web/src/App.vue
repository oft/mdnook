<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AppConfig, DocumentData, Entry } from '@mdnook/shared'
import { assetUrl, parentPath } from '@mdnook/shared'
import { api } from './api'
import { renderMarkdown } from './markdown'
import DirectoryNode from './components/DirectoryNode.vue'
import Icon from './components/Icon.vue'

const route = useRoute()
const router = useRouter()
const config = ref<AppConfig>({ name: 'mdnook', version: '0.0.1', rootName: '文档目录' })
const path = computed(() => typeof route.query.path === 'string' ? route.query.path : '')
const documentPath = computed(() => route.path === '/document' ? path.value : '')
const directory = computed(() => {
  try { return documentPath.value ? parentPath(documentPath.value) : path.value } catch { return '' }
})
const entries = ref<Entry[]>([])
const document = ref<DocumentData | null>(null)
const directoryLoading = ref(false)
const documentLoading = ref(false)
const directoryError = ref('')
const documentError = ref('')
const notice = ref('')
const filter = ref('')
const revision = ref(0)
const listWidth = ref(320)
const narrowScreen = window.matchMedia('(max-width: 1080px)')
const showToc = ref(!narrowScreen.matches)
const filterShortcut = /Mac/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K'
const dark = ref(false)
const article = ref<HTMLElement>()
const filterInput = ref<HTMLInputElement>()
const preview = computed(() => document.value ? renderMarkdown(document.value.content, document.value.path) : { html: '', headings: [] })
const filename = computed(() => documentPath.value.split('/').at(-1) ?? '')
const directoryName = computed(() => directory.value.split('/').at(-1) || config.value.rootName)
const visibleEntries = computed(() => entries.value.filter(entry => entry.name.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase())))
const markdownCount = computed(() => entries.value.filter(entry => entry.kind === 'markdown').length)
const breadcrumbs = computed(() => {
  const parts = directory.value.split('/').filter(Boolean)
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }))
})
const wordCount = computed(() => document.value?.content.replace(/```[\s\S]*?```/g, '').replace(/\s/g, '').length ?? 0)
let directoryAbort: AbortController | undefined
let documentAbort: AbortController | undefined
let linkGeneration = 0

function selectDirectory(path: string) {
  notice.value = ''
  void router.push({ path: '/browse', query: path ? { path } : {} })
}
function selectFile(entry: Entry) {
  notice.value = ''
  if (entry.kind === 'directory') return selectDirectory(entry.path)
  if (entry.kind === 'markdown') void router.push({ path: '/document', query: { path: entry.path } })
  else window.open(assetUrl(entry.path), '_blank', 'noopener,noreferrer')
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

watch([documentPath, revision], async ([path]) => {
  documentAbort?.abort()
  const controller = new AbortController()
  documentAbort = controller
  document.value = null
  documentError.value = ''
  documentLoading.value = !!path
  if (!path) return
  try {
    const result = await api.document(path, controller.signal)
    if (controller.signal.aborted) return
    document.value = result
    await nextTick()
    if (route.hash) scrollToAnchor()
    else article.value?.scrollTo({ top: 0 })
  } catch (error) {
    if (!controller.signal.aborted) documentError.value = (error as Error).message
  } finally { if (!controller.signal.aborted) documentLoading.value = false }
}, { immediate: true })

function scrollToAnchor() {
  if (!route.hash || !article.value) return
  let id = route.hash.slice(1)
  try { id = decodeURIComponent(id) } catch { /* Use literal hash when malformed. */ }
  const element = article.value.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
  if (element) element.scrollIntoView({ block: 'start', behavior: 'instant' })
  else if (document.value) notice.value = `文档中没有找到标题：${id}`
}
watch(() => route.hash, async () => { await nextTick(); scrollToAnchor() })
watch(() => route.fullPath, () => { linkGeneration++; notice.value = '' })

function goAnchor(id: string) {
  void router.push({ path: route.path, query: route.query, hash: `#${id}` }).then(scrollToAnchor)
}

async function followLink(event: MouseEvent) {
  const target = (event.target as Element).closest<HTMLAnchorElement>('a[data-md-href]')
  if (!target || !document.value) return
  // Keep modified-click navigation for Markdown URLs usable in a new tab.
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const from = document.value.path
  const generation = ++linkGeneration
  try {
    const reference = await api.resolve(from, target.dataset.mdHref ?? '')
    if (generation !== linkGeneration) return
    if (reference.kind === 'external') window.open(reference.href, '_blank', 'noopener,noreferrer')
    else if (reference.kind === 'directory') selectDirectory(reference.path)
    else if (reference.kind === 'asset') window.location.assign(assetUrl(reference.path))
    else {
      await router.push({ path: '/document', query: { path: reference.path }, hash: reference.hash ? `#${reference.hash}` : '' })
      if (reference.path === from) scrollToAnchor()
    }
  } catch (error) { if (generation === linkGeneration) notice.value = (error as Error).message }
}

function refresh() { notice.value = ''; revision.value++ }
function formatSize(size: number) { return size < 1024 ? `${size} B` : size < 1024 ** 2 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 ** 2).toFixed(1)} MB` }
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)) }
function iconName(entry: Entry) { return entry.kind === 'directory' ? 'folder' : /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(entry.name) ? 'image' : 'file' }

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
  if (event.key === 'Escape') { notice.value = ''; filter.value = ''; filterInput.value?.blur() }
}
function screenChanged() { showToc.value = !narrowScreen.matches }
watch(dark, value => {
  window.document.documentElement.classList.toggle('dark', value)
  try { localStorage.setItem('mdnook-theme', value ? 'dark' : 'light') } catch { /* Storage may be unavailable. */ }
})
onMounted(async () => {
  window.addEventListener('keydown', keyboard)
  narrowScreen.addEventListener('change', screenChanged)
  try { dark.value = localStorage.getItem('mdnook-theme') === 'dark' } catch { /* Use light theme. */ }
  try { config.value = await api.config() } catch (error) { notice.value = (error as Error).message }
})
onUnmounted(() => {
  directoryAbort?.abort(); documentAbort?.abort(); stopResize?.()
  window.removeEventListener('keydown', keyboard)
  narrowScreen.removeEventListener('change', screenChanged)
})
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <a class="brand" href="/browse" @click.prevent="selectDirectory('')"><span class="brand-mark"><Icon name="book" :size="22" /></span><span>mdnook<span class="brand-dot">.</span></span></a>
      <span class="header-divider"></span><span class="header-caption">给文档一个安静的角落</span>
      <div class="header-actions"><span class="local-badge"><i></i>本地阅读</span><button class="icon-button" :aria-label="dark ? '切换浅色主题' : '切换深色主题'" :title="dark ? '浅色主题' : '深色主题'" @click="dark = !dark"><Icon :name="dark ? 'sun' : 'moon'" /></button></div>
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
          <button class="icon-button refresh-button" aria-label="刷新目录与文档" title="刷新" @click="refresh"><Icon name="refresh" :size="16" :class="{ spinning: directoryLoading }" /></button>
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
              <button v-for="entry in visibleEntries" :key="entry.path" class="file-row" :class="{ active: entry.path === documentPath, 'is-folder': entry.kind === 'directory' }" :aria-pressed="entry.path === documentPath" :title="`${entry.name}${entry.kind === 'directory' ? '' : ' · ' + formatSize(entry.size)}`" @click="selectFile(entry)">
                <span class="file-icon" :class="entry.kind"><Icon :name="iconName(entry)" :size="19" /></span><span class="file-name">{{ entry.name }}<small>{{ entry.kind === 'directory' ? '文件夹' : entry.kind === 'markdown' ? 'Markdown · ' + formatSize(entry.size) : formatSize(entry.size) }}</small></span><time :datetime="entry.modifiedAt">{{ formatDate(entry.modifiedAt) }}</time>
              </button>
            </div>
            <div class="file-pane-footer"><Icon name="file" :size="13" /><span>{{ markdownCount }} 篇文档</span><span class="footer-separator">·</span><span>{{ entries.length }} 个项目</span></div>
          </section>

          <div class="pane-resizer" role="separator" aria-label="调整文件列表宽度" aria-orientation="vertical" :aria-valuenow="listWidth" :aria-valuemin="230" :aria-valuemax="480" tabindex="0" @pointerdown="startResize" @keydown="resizeByKeyboard"></div>

          <section class="reader-pane" aria-label="文档预览">
            <div class="reader-toolbar"><span class="document-tab"><Icon :name="documentPath ? 'file' : 'book'" :size="15" /><span :title="filename">{{ filename || '文档预览' }}</span><span v-if="documentPath" class="read-only-label">只读</span></span><div class="reader-actions"><a v-if="documentPath" class="icon-button" :href="assetUrl(documentPath)" title="下载源文件" aria-label="下载 Markdown 源文件"><Icon name="download" :size="16" /></a><button class="icon-button" :class="{ toggled: showToc }" aria-label="切换文档目录" title="文档目录" @click="showToc = !showToc"><Icon name="list" :size="17" /></button></div></div>
            <div v-if="notice" class="notice" role="alert"><Icon name="alert" :size="16" /><span>{{ notice }}</span><button aria-label="关闭提示" @click="notice = ''"><Icon name="close" :size="14" /></button></div>
            <div v-if="documentLoading" class="reader-empty"><span class="loading-spinner"></span><p>正在打开文档…</p></div>
            <div v-else-if="documentError" class="reader-empty"><span class="empty-illustration"><Icon name="alert" :size="34" /></span><h2>暂时无法打开</h2><p>{{ documentError }}</p><button class="primary-button" @click="refresh">重试</button></div>
            <div v-else-if="!document" class="reader-empty"><span class="empty-illustration"><Icon name="book" :size="36" /></span><span class="eyebrow">YOUR LOCAL READING NOOK</span><h2>下一篇好文档，<br>就在手边。</h2><p>在左侧文件列表中选择 Markdown 文件，<br>开始浏览你的文档空间。</p><span class="empty-tip"><Icon name="arrow" :size="15" />支持文档相对链接与本地图片</span></div>
            <div v-else class="reader-body">
              <article ref="article" class="article-scroll" @click="followLink"><div class="document-meta"><span class="document-category"><Icon name="file" :size="13" />MARKDOWN</span><span><Icon name="clock" :size="13" />约 {{ Math.max(1, Math.ceil(wordCount / 400)) }} 分钟阅读</span></div><div class="markdown-body" v-html="preview.html"></div><div class="document-end"><span></span><Icon name="book" :size="17" /><span></span></div></article>
              <aside v-if="showToc && preview.headings.length" class="toc" aria-label="文档标题目录"><div class="toc-heading">本页内容</div><a v-for="heading in preview.headings" :key="heading.id" :href="`#${encodeURIComponent(heading.id)}`" :style="{ paddingLeft: `${Math.max(0, heading.level - 1) * 10}px` }" @click.prevent="goAnchor(heading.id)">{{ heading.text }}</a></aside>
            </div>
            <footer class="reader-footer"><span><i class="status-dot"></i>{{ document ? '文档已加载' : '准备就绪' }}</span><span v-if="document">{{ wordCount.toLocaleString() }} 字符 <span class="footer-separator">·</span> {{ formatDate(document.modifiedAt) }} 更新</span><span v-else>mdnook v{{ config.version }}</span></footer>
          </section>
        </div>
      </main>
    </div>
  </div>
</template>
