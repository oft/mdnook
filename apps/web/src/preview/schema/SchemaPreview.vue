<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ParsedJson } from '../../file-types/types'
import type { PreviewComponentProps } from '../types'
import JsonTree from '../json/JsonTree.vue'

const props = defineProps<PreviewComponentProps>()
const value = computed(() => (props.context.data.json as ParsedJson).value)
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
const schema = computed(() => record(value.value))
const title = computed(() => typeof schema.value.title === 'string' ? schema.value.title : 'JSON Schema')
const description = computed(() => typeof schema.value.description === 'string' ? schema.value.description : '')
const dialect = computed(() => typeof schema.value.$schema === 'string' ? schema.value.$schema : '未声明')
const id = computed(() => typeof schema.value.$id === 'string' ? schema.value.$id : '')
const required = computed(() => new Set(Array.isArray(schema.value.required) ? schema.value.required.filter(item => typeof item === 'string') : []))
const properties = computed(() => Object.entries(record(schema.value.properties)))
const limit = ref(100)
function summary(value: unknown): string {
  if (typeof value === 'boolean') return value ? '允许任意值' : '禁止此值'
  const node = record(value)
  if (typeof node.type === 'string') return node.type
  if (Array.isArray(node.type)) return node.type.filter(item => typeof item === 'string').join(' | ')
  if (typeof node.$ref === 'string') return node.$ref
  return '—'
}
function propertyDescription(value: unknown) {
  const description = record(value).description
  return typeof description === 'string' ? description : ''
}
</script>

<template>
  <section class="structured-preview" aria-label="JSON Schema 预览">
    <div class="structured-scroll" tabindex="0">
      <h2 class="schema-title">{{ title }}</h2>
      <p v-if="description" class="schema-description">{{ description }}</p>
      <dl class="schema-meta"><dt>版本声明</dt><dd>{{ dialect }}</dd><template v-if="id"><dt>标识</dt><dd>{{ id }}</dd></template><dt>根类型</dt><dd>{{ summary(value) }}</dd></dl>
      <template v-if="properties.length">
        <h3>属性</h3>
        <div class="schema-table-scroll"><table><thead><tr><th>名称</th><th>类型 / 引用</th><th>必填</th><th>说明</th></tr></thead><tbody><tr v-for="[name, property] in properties.slice(0, limit)" :key="name"><td>{{ name }}</td><td>{{ summary(property) }}</td><td>{{ required.has(name) ? '是' : '—' }}</td><td>{{ propertyDescription(property) }}</td></tr></tbody></table></div>
        <button v-if="properties.length > limit" class="text-button" @click="limit += 100">再显示 {{ Math.min(100, properties.length - limit) }} 个属性</button>
      </template>
      <h3>完整结构</h3>
      <JsonTree :value="value" />
    </div>
    <footer class="reader-footer"><span><i class="status-dot"></i>Schema 概览 · 只读</span></footer>
  </section>
</template>

<style src="../json/structured.css"></style>
<style scoped>
.schema-title { font-size: 22px; margin: 0 0 12px; overflow-wrap: anywhere; }
.schema-description { font-size: 12px; line-height: 1.8; color: var(--muted); white-space: pre-wrap; }
.schema-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 16px; font-size: 11px; margin: 20px 0; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
h3 { font-size: 13px; margin: 24px 0 12px; }
.schema-table-scroll { overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 11px; text-align: left; }
td, th { padding: 9px; border: 1px solid var(--border); overflow-wrap: anywhere; min-width: 65px; }
th { background: var(--subtle); font-weight: 600; }
</style>
