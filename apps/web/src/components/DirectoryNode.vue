<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Entry } from '@mdnook/shared'
import { api } from '../api'
import Icon from './Icon.vue'

const props = withDefaults(defineProps<{ path: string; name: string; current: string; revision: number; depth?: number }>(), { depth: 0 })
const emit = defineEmits<{ select: [path: string] }>()
const expanded = ref(props.depth === 0)
const children = ref<Entry[] | null>(null)
const loading = ref(false)
const error = ref('')
const ancestor = computed(() => !props.path || props.current === props.path || props.current.startsWith(`${props.path}/`))
let generation = 0

async function load() {
  const request = ++generation
  loading.value = true
  error.value = ''
  try {
    const listing = await api.entries(props.path)
    if (request === generation) children.value = listing.entries.filter(entry => entry.kind === 'directory')
  } catch (failure) {
    if (request === generation) error.value = (failure as Error).message
  } finally { if (request === generation) loading.value = false }
}

function toggle() {
  expanded.value = !expanded.value
  if (expanded.value && children.value === null) void load()
}

watch(() => props.current, () => {
  if (ancestor.value) {
    expanded.value = true
    if (children.value === null) void load()
  }
}, { immediate: true })
watch(() => props.revision, () => { children.value = null; if (expanded.value) void load() })
</script>

<template>
  <li class="tree-node">
    <div class="tree-row" :class="{ selected: current === path }" :style="{ paddingLeft: `${12 + depth * 17}px` }">
      <button class="tree-toggle" :class="{ expanded }" :aria-label="`${expanded ? '收起' : '展开'} ${name}`" :aria-expanded="expanded" @click="toggle"><Icon name="chevron" :size="12" /></button>
      <button class="tree-label" :title="name" :aria-current="current === path ? 'location' : undefined" @click="emit('select', path)">
        <Icon :name="expanded ? 'folderOpen' : 'folder'" :size="17" /><span>{{ name }}</span>
      </button>
    </div>
    <ul v-if="expanded" class="tree-children">
      <li v-if="loading && !children" class="tree-note" :style="{ paddingLeft: `${42 + depth * 17}px` }">加载中…</li>
      <li v-else-if="error" class="tree-note"><button @click="load" :title="error">读取失败，点击重试</button></li>
      <DirectoryNode v-for="child in children" :key="child.path" :path="child.path" :name="child.name" :current="current" :revision="revision" :depth="depth + 1" @select="emit('select', $event)" />
    </ul>
  </li>
</template>
