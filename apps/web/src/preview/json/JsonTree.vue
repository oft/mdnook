<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ value: unknown; name?: string; depth?: number }>(), { name: '', depth: 0 })
const open = ref(props.depth < 1)
const limit = ref(100)
const container = computed(() => props.value !== null && typeof props.value === 'object')
const array = computed(() => Array.isArray(props.value))
const keys = computed(() => container.value ? Object.keys(props.value as object) : [])
const entries = computed(() => open.value ? keys.value.slice(0, limit.value).map(key => ({ key, value: (props.value as Record<string, unknown>)[key] })) : [])
const literal = computed(() => {
  const value = JSON.stringify(props.value)
  return value && value.length > 1000 ? `${value.slice(0, 1000)}…` : value
})
</script>

<template>
  <div class="json-node">
    <div class="json-line">
      <button v-if="container" class="json-toggle" :aria-label="`${open ? '折叠' : '展开'} ${name || (depth ? '空键名' : '根节点')}`" :aria-expanded="open" @click="open = !open">{{ open ? '▾' : '▸' }}</button>
      <span v-else class="json-toggle"></span>
      <span v-if="depth || name" class="json-key">{{ name || '""' }}: </span>
      <span v-if="container" class="json-summary">{{ array ? 'Array' : 'Object' }} · {{ keys.length }} 项</span>
      <span v-else class="json-value" :class="{ string: typeof value === 'string' }">{{ literal }}</span>
    </div>
    <div v-if="container && open" class="json-children">
      <JsonTree v-for="entry in entries" :key="entry.key" :name="entry.key" :value="entry.value" :depth="depth + 1" />
      <button v-if="keys.length > limit" class="text-button json-more" @click="limit += 100">再显示 {{ Math.min(100, keys.length - limit) }} 项（剩余 {{ keys.length - limit }} 项）</button>
      <span v-if="!keys.length" class="json-summary">{{ array ? '[]' : '{}' }}</span>
    </div>
  </div>
</template>

<style scoped>
.json-node { font: 12px/1.9 "Cascadia Code", Consolas, monospace; min-width: 0; }
.json-line { display: flex; align-items: baseline; gap: 4px; padding: 2px 0; }
.json-toggle { flex-shrink: 0; width: 18px; padding: 0; color: var(--muted); }
.json-key { color: var(--accent); overflow-wrap: anywhere; }
.json-summary { color: var(--muted); white-space: nowrap; }
.json-value { overflow-wrap: anywhere; white-space: pre-wrap; }
.string { color: var(--accent); }
.json-children { margin-left: 18px; padding-left: 8px; border-left: 1px solid var(--border); }
.json-more { font: inherit; margin: 5px 0; }
</style>
