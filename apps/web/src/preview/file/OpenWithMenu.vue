<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Icon from '../../components/Icon.vue'
import type { FileTypeNode, FileTypeResult } from '../../file-types/types'
import { compatiblePreviewers } from '../selection'
import type { PreviewSettings } from '../selection'

const props = defineProps<{ result: FileTypeResult; settings: PreviewSettings; current: string; automatic: string; source: string; anchor: { x: number; y: number } }>()
const emit = defineEmits<{ select: [id: string]; default: [field: 'formatPreviewers' | 'capabilityPreviewers' | 'filePreviewers', key: string, id: string]; close: [restoreFocus: boolean] }>()
const popup = ref<HTMLElement>()
const expanded = ref(false)
const position = ref({ left: '0px', top: '0px', visibility: 'hidden' as 'hidden' | 'visible' })
const options = computed(() => compatiblePreviewers(props.result.previewers, props.result.lineage, props.result.capabilities).filter(offer => !offer.fallback))
const format = computed(() => props.result.lineage.at(-1)!)
const file = computed(() => props.result.context.file)
const currentLabel = computed(() => props.result.previewers.find(offer => offer.id === props.current)?.label)
const automaticLabel = computed(() => props.result.previewers.find(offer => offer.id === props.automatic)?.label)

function formatOptions(type: FileTypeNode) {
  const lineage = props.result.lineage.slice(0, props.result.lineage.indexOf(type) + 1)
  const capabilities = lineage.flatMap(node => node.capabilities ?? [])
  return compatiblePreviewers(props.result.previewers, lineage, capabilities).filter(offer => !offer.fallback)
}
function change(field: 'formatPreviewers' | 'capabilityPreviewers', key: string, event: Event) {
  emit('default', field, key, (event.target as HTMLSelectElement).value)
}
function choose(id: string) { emit('select', id); emit('close', true) }
function place() {
  const rect = popup.value?.getBoundingClientRect()
  if (!rect) return
  position.value = {
    left: `${Math.max(8, Math.min(props.anchor.x, window.innerWidth - rect.width - 8))}px`,
    top: `${Math.max(8, Math.min(props.anchor.y, window.innerHeight - rect.height - 8))}px`, visibility: 'visible',
  }
}
async function toggleSettings() { expanded.value = !expanded.value; await nextTick(); place() }
function outside(event: PointerEvent) {
  const target = event.target as Element | null
  if (!popup.value?.contains(target) && !target?.closest('[data-open-with-trigger]')) emit('close', false)
}
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close', true); return }
  const focusable = Array.from(popup.value?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled)') ?? [])
  const index = focusable.indexOf(document.activeElement as HTMLElement)
  if (event.key === 'Tab' && focusable.length) {
    if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === focusable.length - 1)) {
      event.preventDefault(); focusable[event.shiftKey ? focusable.length - 1 : 0]?.focus()
    }
  }
  if (event.target instanceof HTMLSelectElement) return
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && focusable.length) {
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? focusable.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + focusable.length) % focusable.length
    focusable[next]?.focus()
  }
}
function resize() { place() }
watch(() => props.settings, async () => { await nextTick(); place() })
onMounted(async () => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', keyboard, true)
  window.addEventListener('resize', resize)
  await nextTick(); place(); popup.value?.querySelector('button')?.focus()
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', keyboard, true)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <Teleport to="body">
    <div ref="popup" class="open-with-menu" role="dialog" aria-label="打开方式" :style="position">
      <div class="menu-heading"><span>打开方式</span><button class="icon-button" aria-label="关闭打开方式" @click="emit('close', true)"><Icon name="close" :size="14" /></button></div>
      <p class="menu-file" :title="file.path">{{ file.name }}</p>
      <div class="viewer-options" aria-label="可用预览器">
        <button class="viewer-option" @click="choose('')"><Icon name="refresh" :size="15" /><span>使用默认 · {{ automaticLabel }}</span></button>
        <button v-for="offer in options" :key="offer.id" class="viewer-option" :aria-pressed="current === offer.id" @click="choose(offer.id)">
          <Icon :name="offer.icon ?? 'file'" :size="16" /><span>{{ offer.label }}</span><small v-if="automatic === offer.id">默认</small><Icon v-if="current === offer.id" name="check" :size="14" />
        </button>
        <p v-if="!options.length" class="menu-note">暂无可用预览器，可下载源文件。</p>
      </div>
      <div v-if="options.length" class="default-actions">
        <button @click="emit('default', 'filePreviewers', file.path, current)">设为此文件默认</button>
        <button v-if="format.id !== 'file'" @click="emit('default', 'formatPreviewers', format.id, current)">设为 {{ format.label }} 格式默认</button>
        <button v-if="settings.filePreviewers[file.path]" @click="emit('default', 'filePreviewers', file.path, '')">清除此文件默认</button>
        <button v-if="settings.formatPreviewers[format.id]" @click="emit('default', 'formatPreviewers', format.id, '')">清除 {{ format.label }} 格式默认</button>
      </div>
      <button v-if="options.length" class="settings-toggle" :aria-expanded="expanded" @click="toggleSettings"><Icon name="list" :size="15" /><span>默认设置</span><Icon name="chevron" :size="12" /></button>
      <div v-if="expanded" class="association-settings">
        <div class="settings-label">格式继承</div><p class="type-trail">{{ result.lineage.map(type => type.label).join(' → ') }}</p>
        <label v-for="type in result.lineage.filter(type => type.id !== 'file')" :key="type.id"><span>{{ type.label }}</span><select :aria-label="`${type.label}格式默认预览器`" :value="settings.formatPreviewers[type.id] ?? ''" @change="change('formatPreviewers', type.id, $event)"><option value="">继承默认</option><option v-for="offer in formatOptions(type)" :key="offer.id" :value="offer.id">{{ offer.label }}</option><option v-if="settings.formatPreviewers[type.id] && !formatOptions(type).some(offer => offer.id === settings.formatPreviewers[type.id])" :value="settings.formatPreviewers[type.id]">不可用 · {{ settings.formatPreviewers[type.id] }}</option></select></label>
        <div class="settings-label">文件能力 · 按以下顺序选择默认</div>
        <label v-for="capability in result.capabilities" :key="capability.id"><span>{{ capability.label }}</span><select :aria-label="`${capability.label}默认预览器`" :value="settings.capabilityPreviewers[capability.id] ?? ''" @change="change('capabilityPreviewers', capability.id, $event)"><option value="">内置默认</option><option v-for="offer in capability.previewers" :key="offer.id" :value="offer.id">{{ offer.label }}</option><option v-if="settings.capabilityPreviewers[capability.id] && !capability.previewers?.some(offer => offer.id === settings.capabilityPreviewers[capability.id])" :value="settings.capabilityPreviewers[capability.id]">不可用 · {{ settings.capabilityPreviewers[capability.id] }}</option></select></label>
        <p class="menu-note">文件默认优先，其次是最近的格式默认，再按能力顺序选择。设置保存在当前浏览器，按文档空间区分。</p>
      </div>
      <p class="menu-status">当前：{{ currentLabel }} · {{ source }}</p>
    </div>
  </Teleport>
</template>

<style scoped>
.open-with-menu { position: fixed; z-index: 100; width: 300px; max-width: calc(100vw - 16px); max-height: calc(100dvh - 16px); overflow-y: auto; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 12px 40px #0002; padding: 8px; font-size: 12px; }
.menu-heading { display: flex; align-items: center; justify-content: space-between; padding: 0 4px; font-weight: 600; }
.menu-file { margin: 0 4px 8px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.viewer-option, .default-actions button, .settings-toggle { width: 100%; border: 0; background: transparent; color: inherit; text-align: left; border-radius: 5px; padding: 8px; cursor: pointer; font: inherit; }
.viewer-option, .settings-toggle { display: flex; align-items: center; gap: 8px; }
.viewer-option span, .settings-toggle span { flex: 1; }
.viewer-option small { font-size: 10px; color: var(--muted); }
.viewer-option[aria-pressed=true], button:hover { background: var(--subtle); }
.default-actions, .settings-toggle { border-top: 1px solid var(--border); margin-top: 6px; padding-top: 6px; }
.association-settings { padding: 0 8px; }
.settings-label { color: var(--muted); font-size: 10px; margin-top: 12px; }
.type-trail { color: var(--accent); font-size: 11px; margin: 5px 0 8px; overflow-wrap: anywhere; }
.association-settings label { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 6px 0; }
.association-settings select { max-width: 145px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 4px; font: inherit; font-size: 11px; }
.menu-note, .menu-status { color: var(--muted); font-size: 10px; line-height: 1.6; margin: 8px 4px 2px; }
.menu-status { border-top: 1px solid var(--border); padding-top: 8px; }
</style>
