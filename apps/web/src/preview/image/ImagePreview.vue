<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../../components/Icon.vue'
import type { ImageSize, PreviewComponentProps, PreviewContext, PreviewReport } from '../types'

const props = defineProps<PreviewComponentProps>()
const emit = defineEmits<{ retry: [] }>()
const unsupported = computed(() => props.childIsFallback)
const loading = ref(!unsupported.value)
const failed = ref(false)
const fit = ref(true)
const width = ref(0)
const height = ref(0)
const viewport = ref<HTMLElement>()
const childContext = computed<PreviewContext>(() => ({ ...props.context, data: { ...props.context.data, image: { fit: fit.value } } }))

function loaded(size: ImageSize) {
  if (props.context.signal.aborted) return
  width.value = size.width
  height.value = size.height
  loading.value = false
  failed.value = !width.value || !height.value
}

function imageFailed() {
  if (props.context.signal.aborted) return
  loading.value = false
  failed.value = true
}

function childReport(report: PreviewReport) {
  if (report.type === 'image-loaded' && typeof report.data?.width === 'number' && typeof report.data?.height === 'number') {
    loaded({ width: report.data.width, height: report.data.height })
  } else if (report.type === 'image-error' || report.type === 'preview-error') imageFailed()
}

function setFit(value: boolean) {
  fit.value = value
  viewport.value?.scrollTo({ top: 0, left: 0 })
}
</script>

<template>
  <section class="image-preview" aria-label="图片预览" :aria-busy="loading">
    <div class="image-toolbar" aria-label="图片显示方式">
      <button :class="{ selected: fit }" :aria-pressed="fit" :disabled="loading || failed || unsupported" @click="setFit(true)">适应窗口</button>
      <button :class="{ selected: !fit }" :aria-pressed="!fit" :disabled="loading || failed || unsupported" @click="setFit(false)">原始尺寸</button>
      <span class="image-format">{{ child?.label }}</span>
    </div>
    <slot v-if="unsupported" :context="childContext" :onReport="childReport" />
    <div v-else-if="failed" class="reader-empty" role="alert">
      <span class="empty-illustration"><Icon name="alert" :size="34" /></span>
      <h2>暂时无法预览图片</h2>
      <p>图片可能已被移动、没有读取权限，或浏览器不支持此图片格式。</p>
      <button class="primary-button" @click="emit('retry')">重试</button>
    </div>
    <div v-else ref="viewport" class="image-viewport" :class="{ original: !fit }" tabindex="0" aria-label="图片内容，可滚动查看">
      <div v-if="loading" class="image-loading" role="status"><span class="loading-spinner"></span><p>正在打开图片…</p></div>
      <div class="image-canvas" :class="{ pending: loading }">
        <slot :context="childContext" :onReport="childReport" />
      </div>
    </div>
    <footer class="reader-footer" role="status">
      <span><i class="status-dot"></i>{{ unsupported ? '此图片格式暂不支持' : failed ? '图片加载失败' : loading ? '正在加载图片' : '图片已加载' }}</span>
      <span v-if="!loading && !failed && !unsupported">{{ width }} × {{ height }} px <span class="footer-separator">·</span> {{ fit ? '适应窗口' : '原始尺寸' }}</span>
    </footer>
  </section>
</template>

<style scoped>
.image-preview { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }
.image-toolbar { display: flex; gap: 4px; padding: 10px 20px; border-bottom: 1px solid var(--border); }
.image-toolbar button { padding: 6px 10px; border-radius: 5px; font-size: 11px; color: var(--muted); }
.image-toolbar button:hover { background: var(--hover); }
.image-toolbar button.selected { background: var(--accent-soft); color: var(--accent); }
.image-format { margin-left: auto; align-self: center; font-size: 10px; color: var(--muted); }
.image-viewport { flex: 1; min-height: 0; min-width: 0; overflow: auto; position: relative; padding: 24px; background: var(--subtle); }
.image-canvas { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }
.image-canvas :deep(.preview-image) { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.image-canvas.pending :deep(.preview-image) { visibility: hidden; }
.original .image-canvas { width: max-content; height: max-content; min-width: 100%; min-height: 100%; }
.original :deep(.preview-image) { max-width: none; max-height: none; flex-shrink: 0; }
.image-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--muted); font-size: 12px; }
@media (max-width: 720px) {
  .image-toolbar { padding: 6px 12px; }
  .image-viewport { padding: 16px; }
}
</style>
