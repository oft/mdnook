import MarkdownIt from 'markdown-it'
import GithubSlugger from 'github-slugger'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { assetUrl, parseReference } from '@mdnook/shared'

for (const [name, language] of Object.entries({ javascript, typescript, json, bash, python, css, xml, yaml })) hljs.registerLanguage(name, language)

export interface Heading { id: string; text: string; level: number }
export interface RenderedDocument { html: string; headings: Heading[] }

export function renderMarkdown(content: string, path: string): RenderedDocument {
  const headings: Heading[] = []
  const slugger = new GithubSlugger()
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    highlight: (code, language) => language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value : '',
  })
  md.core.ruler.push('mdnook', state => {
    for (let index = 0; index < state.tokens.length; index++) {
      const token = state.tokens[index]!
      if (token.type === 'heading_open') {
        const inline = state.tokens[index + 1]
        const text = inline?.children?.filter(t => ['text', 'code_inline', 'image'].includes(t.type)).map(t => t.content).join('') ?? inline?.content ?? ''
        const id = slugger.slug(text)
        token.attrSet('id', id)
        headings.push({ id, text, level: Number(token.tag.slice(1)) })
      }
      if (token.type !== 'inline' || !token.children) continue
      const first = token.children[0]
      if (state.tokens[index - 2]?.type === 'list_item_open' && first?.type === 'text') {
        const match = /^\[([ xX])\]\s+/.exec(first.content)
        if (match) {
          first.content = first.content.slice(match[0].length)
          const checkbox = new state.Token('html_inline', '', 0)
          checkbox.content = `<input class="task-checkbox" type="checkbox" disabled${match[1]?.toLowerCase() === 'x' ? ' checked' : ''}>`
          token.children.unshift(checkbox)
        }
      }
      for (const child of token.children) {
        if (child.type === 'link_open') {
          const href = String(child.attrGet('href') ?? '')
          try {
            const target = parseReference(path, href)
            if (target.kind === 'external') {
              child.attrSet('href', target.href)
              child.attrSet('target', '_blank')
              child.attrSet('rel', 'noopener noreferrer')
            } else {
              child.attrSet('data-md-href', href)
              child.attrSet('href', `/api/open?${new URLSearchParams({ from: path, href })}`)
            }
          } catch {
            child.attrSet('data-md-href', href)
            child.attrSet('href', '#')
          }
        }
        if (child.type === 'image') {
          try {
            const target = parseReference(path, String(child.attrGet('src') ?? ''))
            child.attrSet('src', target.kind === 'local' ? assetUrl(target.path) : /^https?:/i.test(target.href) ? target.href : '')
          } catch { child.attrSet('src', '') }
          child.attrSet('loading', 'lazy')
          child.attrSet('decoding', 'async')
        }
      }
    }
  })
  const html = DOMPurify.sanitize(md.render(content), { ADD_ATTR: ['target'], ALLOW_DATA_ATTR: true })
  return { html, headings }
}
