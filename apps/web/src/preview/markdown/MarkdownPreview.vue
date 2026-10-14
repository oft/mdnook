<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { DocumentData } from '@mdnook/shared'
import { api } from '../../api'
import { renderMarkdown } from '../../markdown'
import Icon from '../../components/Icon.vue'
import type { PreviewComponentProps, PreviewRequest } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ navigate: [request: PreviewRequest]; notice: [message: string]; retry: [] }>()
const document = ref<DocumentData | null>(null)
const loading = ref(true)
const error = ref('')
const article = ref<HTMLElement>()
const narrowScreen = window.matchMedia('(max-width: 1080px)')
const showToc = ref(!narrowScreen.matches)
const preview = computed(() => document.value ? renderMarkdown(document.value.content, document.value.path) : { html: '', headings: [] })
const wordCount = computed(() => document.value?.content.replace(/```[\s\S]*?```/g, '').replace(/\s/g, '').length ?? 0)

function scrollToAnchor() {
  if (!props.context.hash || !article.value) return
  let id = props.context.hash.slice(1)
  try { id = decodeURIComponent(id) } catch { /* Use literal hash when malformed. */ }
  const element = article.value.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)
  if (element) element.scrollIntoView({ block: 'start', behavior: 'instant' })
  else if (document.value) emit('notice', `文档中没有找到标题：${id}`)
}
watch(() => props.context.hash, async () => { await nextTick(); if (!props.context.signal.aborted) scrollToAnchor() })

function followLink(event: MouseEvent) {
  const target = (event.target as Element).closest<HTMLAnchorElement>('a[data-md-href]')
  if (!target || !document.value || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  emit('navigate', { from: props.context.path, href: target.dataset.mdHref ?? '' })
}
function goAnchor(id: string) {
  const hash = `#${encodeURIComponent(id)}`
  if (props.context.hash === hash || props.context.hash === `#${id}`) scrollToAnchor()
  emit('navigate', { from: props.context.path, href: hash })
}
function formatDate(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(new Date(value)) }
function screenChanged() { showToc.value = !narrowScreen.matches }

onMounted(async () => {
  narrowScreen.addEventListener('change', screenChanged)
  const signal = props.context.signal
  try {
    const result = props.context.data.text as DocumentData | undefined ?? await api.document(props.context.path, signal)
    if (signal.aborted) return
    document.value = result
    loading.value = false
    await nextTick()
    if (!signal.aborted) scrollToAnchor()
  } catch (failure) {
    if (!signal.aborted) error.value = (failure as Error).message
  } finally { if (!signal.aborted) loading.value = false }
})
onUnmounted(() => narrowScreen.removeEventListener('change', screenChanged))
</script>

<template>
  <section class="markdown-preview" aria-label="Markdown 预览" :aria-busy="loading">
    <div class="markdown-toolbar"><button class="icon-button" :class="{ toggled: showToc }" aria-label="切换文档目录" title="文档目录" @click="showToc = !showToc"><Icon name="list" :size="17" /></button></div>
    <div v-if="loading" class="reader-empty"><span class="loading-spinner"></span><p>正在打开文档…</p></div>
    <div v-else-if="error" class="reader-empty"><span class="empty-illustration"><Icon name="alert" :size="34" /></span><h2>暂时无法打开</h2><p>{{ error }}</p><button class="primary-button" @click="emit('retry')">重试</button></div>
    <div v-else-if="document" class="reader-body">
      <article ref="article" class="article-scroll" @click="followLink"><div class="document-meta"><span class="document-category"><Icon name="file" :size="13" />MARKDOWN</span><span><Icon name="clock" :size="13" />约 {{ Math.max(1, Math.ceil(wordCount / 400)) }} 分钟阅读</span></div><div class="markdown-body" v-html="preview.html"></div><div class="document-end"><span></span><Icon name="book" :size="17" /><span></span></div></article>
      <aside v-if="showToc && preview.headings.length" class="toc" aria-label="文档标题目录"><div class="toc-heading">本页内容</div><a v-for="heading in preview.headings" :key="heading.id" :href="`#${encodeURIComponent(heading.id)}`" :style="{ paddingLeft: `${Math.max(0, heading.level - 1) * 10}px` }" @click.prevent="goAnchor(heading.id)">{{ heading.text }}</a></aside>
    </div>
    <footer class="reader-footer"><span><i class="status-dot"></i>{{ error ? '文档加载失败' : document ? '文档已加载' : '正在加载文档' }}</span><span v-if="document">{{ wordCount.toLocaleString() }} 字符 <span class="footer-separator">·</span> {{ formatDate(document.modifiedAt) }} 更新</span></footer>
  </section>
</template>

<style scoped>
.markdown-preview { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; position: relative; }
.markdown-toolbar { display: flex; justify-content: flex-end; padding: 4px 20px; border-bottom: 1px solid var(--border); }
@media (max-width: 1080px) { .toc { top: 39px; } }
</style>
