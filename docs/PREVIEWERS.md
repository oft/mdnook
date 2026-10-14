# 文件格式、能力与打开方式

`App.vue` 负责目录和路由，`PreviewHost.vue` 管理导航、取消与重试。文件根预览器读取一次 `FileInfo`，`FilePreview.vue` 识别类型并选择显示方式。类型识别与预览器使用独立的树，各模块只声明直接子级和模块入口，没有集中注册表。

## 格式继承与可组合能力

```text
文件
  ├─ 文本
  │    ├─ Markdown
  │    ├─ XML
  │    │    └─ SVG
  │    └─ JSON
  │         └─ JSON Schema
  └─ 图片
       └─ 位图
            ├─ PNG
            ├─ JPEG
            └─ GIF / WebP / AVIF / ICO / BMP
```

格式定义分散在 `apps/web/src/file-types/`：`file/node.ts` 只声明文本和图片入口；`text/node.ts` 声明 Markdown、XML、JSON 入口；`text/xml/node.ts` 声明 SVG；`text/json/node.ts` 声明 Schema；`image/node.ts` 声明位图，`image/bitmap.ts` 管理自己的具体格式。每个节点只有一个格式父级。

能力定义独立放在 `file-types/capabilities/`，不作为格式树的父节点：

| 格式 | 继承和新增的能力 | 常用打开方式 |
| --- | --- | --- |
| XML | 文本读取 | 源码 |
| SVG | 文本读取 + 图片显示 | 图片、源码 |
| PNG / JPEG | 图片显示 | 图片 |
| JSON | 文本读取 + JSON 解析 | JSON 树、源码 |
| JSON Schema | 文本读取 + JSON 解析 | Schema 概览、JSON 树、源码 |

SVG 沿 XML 继承文本能力，再组合图片能力；源码预览器只要求文本能力，无需枚举 SVG 等具体格式。SVG 声明能力默认顺序为 `image → text`，JSON 为 `json → text`。这里的顺序处理多个能力默认同时存在的情况，格式继承仍保持单父级。

协议与执行器分别是 `file-types/types.ts`、`file-types/tree.ts`。

| 字段 | 行为 |
| --- | --- |
| `id`、`label` | 稳定的类型标识与名称；沿当前分支形成继承链 |
| `matches(context)` | 父模块的轻量匹配规则，支持异步，同级按顺序命中第一个子类型 |
| `loadType()` | 匹配后才加载完整子类型定义，模块默认导出的 `id` 必须一致 |
| `prepare(context)` | 逐级处理内容，返回合并到 `data` 的补充结果 |
| `children` | 直接子级，也可通过异步函数生成 |
| `previewers` | 当前类型提供的兼容预览器轻量入口，不加载视图 |
| `defaultPreviewer` | 无用户配置时使用的内置默认预览器标识 |
| `capabilities` | 当前格式增加的能力；继承父级能力与其轻量预览器入口 |
| `preferredCapabilities` | 多个能力默认同时存在时的优先顺序；子格式可覆盖 |

类型上下文包含 `file`、`signal`、`data` 和 `readText()`。声明文本能力不会立即读取源文件：源码和 Markdown 预览器选中后才读取；JSON 为识别 Schema 子格式读取并解析一次，保留解析或读取错误，Schema 子级复用结果。XML / SVG 的格式识别无需解析 XML，SVG 图片只使用资源地址。`readText()` 缓存当前文件会话的请求和成功结果，失败后允许重试；源码读取失败不会阻止改用图片预览。将来 XML 解析器可以独立按需接入。

扩展名和 MIME 表示格式提示，MIME 本身由扩展名推断。当前 JSON Schema 识别约定是：JSON 已成功解析，根值为对象或布尔值，且文件名是 `schema.json` / `*.schema.json`，或根对象包含字符串 `$schema`。普通 JSON 不会仅因含 `properties` / `type` 被认作 Schema。`$schema` 的语义参见 [官方说明](https://json-schema.org/understanding-json-schema/reference/schema)。这是文档识别约定，不是 Schema 合法性验证。

没有子级匹配时停留在当前类型；未知文件停留在 `file`，使用下载兜底。类型模块只缓存定义，不缓存上一文件的处理结果。取消检查覆盖导入、处理和异步匹配；祖先循环及重复标识会显示错误，失败导入可以重试。

## 默认预览器配置

格式与预览器不是一一对应关系。JSON Schema 可以使用 Schema 概览、JSON 树和源码；Markdown 可以使用正文或源码；SVG 同时拥有图片和文本能力，预览器兼容性与格式的父级无关。

`PreviewerOffer` 继承预览器入口协议，可增加 `supports` 格式 ID 列表和 `requires` 能力 ID 列表。`supports` 任一项在继承链中即满足格式条件；`requires` 中的能力必须全部存在。两者同时声明时必须同时满足。入口由当前格式链及组合能力提供，只有兼容入口参与选择；未选择的预览器定义与视图不会加载。

配置结构：

```json
{
  "version": 2,
  "formatPreviewers": {
    "json": "json-tree",
    "json-schema": "schema"
  },
  "capabilityPreviewers": {
    "text": "source",
    "image": "image"
  },
  "filePreviewers": {
    "数据/示例.json": "source"
  }
}
```

`preview/selection.ts` 按顺序解析：

1. 当前手动选择。
2. 当前文件路径的专属配置。
3. 当前格式到根格式，最近的格式用户配置优先。
4. 按当前格式声明的能力顺序，选择能力用户配置。
5. 最近的格式内置默认、能力内置默认，最后下载兜底。

删除 Schema 的格式配置会继承 JSON 的用户配置；没有格式用户配置时再按能力顺序查找。SVG 同时配置图片和文本能力默认时优先图片；显式 XML / SVG 格式默认仍优先于能力默认。所有用户配置均未命中时，内置默认分别为 Markdown 正文、图片、源码、JSON 树、Schema 概览。未知或不兼容的预览器 ID 会显示提示并继续查找。

预览栏“打开方式”和文件列表右键 / Shift+F10 打开相同的菜单，列出兼容预览器并标记默认。选择只影响本次文件会话；“使用默认”恢复自动选择。可把当前视图设为此文件默认或当前具体格式默认，也可清除这两项关联。“默认设置”展开格式继承和能力配置，分别调整或清除。Esc 或点击外部关闭，键盘支持方向键和 Tab；右键请求消费后不会在返回文件时自动重开。

设置保存在浏览器 localStorage 的 `mdnook-preview-v2:<origin>:<rootId>` 中；`rootId` 由服务端根据真实根目录生成，不返回绝对路径。同名但不同位置的文档目录使用不同设置。不同浏览器或服务端口之间不共享设置。首次读取 v1 设置时，原来的 `text` / `image` 默认迁移为能力默认，具体格式默认和文件关联保留；成功保存 v2 后以 v2 为准，保留原 v1 数据。存储不可用时当前会话仍保留选择并显示提示。

## 预览器树

原有递归处理与组件协议保留，文件容器根据上述选择器进入对应预览器：

```text
文件预览器：元数据、识别、选择、标题、下载与设置
  ├─ Markdown 预览器：正文、标题目录、锚点
  ├─ 源码预览器：纯文本
  ├─ JSON 树预览器：嵌套结构
  ├─ Schema 概览预览器：属性与完整结构
  ├─ 图片预览器：显示方式、尺寸与加载状态
  │    ├─ SVG 预览器
  │    ├─ 位图预览器
  │    └─ fallback：不支持的图片
  └─ 不支持的文件：下载兜底
```

协议定义在 `preview/types.ts`，执行器是 `preview/tree.ts`，递归容器是 `PreviewNodeView.vue`。`PreviewerReference` 只保存 `id`、`label`、匹配规则和 `loadNode()`；完整 `PreviewerNode` 提供 `prepare`、`load`、`children`、`fallback`。节点定义和 Vue 组件分别按需加载并缓存。每级可以自行处理和展示，或把结果传给下一级，不限定层数。

预览上下文包含 `path`、当前 `hash`、`file`、取消 `signal` 和 `data`。类型树处理结果合并到 `data`，包括已读取的 `text`、解析后的 `json`、`fileTypes` 格式链、`capabilities` 能力 ID 与缓存的 `readText()`。锚点和父级显示参数保持响应式，不重复执行准备步骤。切换预览器保留当前文件的识别结果；刷新或重试创建新的会话并重新读取。

组件接收 `context`、`node`、`child`、`childIsFallback`。默认插槽可传递新的 `context` 与 `onReport`，通用事件是 `navigate({ from, href })`、`notice(message)`、`retry()` 和 `report({ type, data })`。图片父级通过 `data.image.fit` 控制显示，叶节点通过 `image-loaded` / `image-error` 报告加载状态。文件切换或组件卸载后，旧异步结果不会更新页面。

## 扩展一个类型

在所属父模块添加轻量入口，在新模块声明处理与兼容预览器，例如 JSON 的专用子格式：

```ts
// file-types/text/json/node.ts 的 children
{
  id: 'custom-json', label: '专用 JSON',
  matches: context => context.file.name.endsWith('.custom.json'),
  loadType: () => import('./custom'),
}
```

```ts
// file-types/text/json/custom.ts
export default {
  id: 'custom-json', label: '专用 JSON', defaultPreviewer: 'custom-json-view',
  prepare: async context => ({ custom: await transform(context.data.json) }),
  previewers: [{
    id: 'custom-json-view', label: '专用视图', supports: ['custom-json'],
    loadNode: () => import('../../../preview/custom-json/node'),
  }],
} satisfies FileTypeNode
```

具体规则应排在同级的通用规则之前。类型、预览器和解码器都可独立 `import()`。新扩展名如果需要服务端提供文本，还需加入 shared 的 `isText`；图片族加入 `isImage`，只有允许直接作为浏览器图片资源提供的格式才加入 `imageMimeTypes`。

## 当前预览边界

文本 API 限制有效 UTF-8、10 MiB 和已知文本扩展名；二进制、越界路径、根目录外链接、`.git` 和 `node_modules` 被拒绝。JSON 解析失败保留错误及源码选项。JSON 树每次展开最多渲染 100 项，可继续加载；单个长字符串截取前 1000 字符，完整内容可切换源码查看。

Schema 只提供属性概览和完整结构，不执行任何版本的 Schema 验证，不生成表单，不请求远程 `$ref` / `$schema`。源代码通过文本插值显示，不执行 HTML。SVG 通过 `<img>` 显示，源码不会注入页面，附件保留 sandbox 策略。图片实际解码能力取决于浏览器。

打开方式目前仅提供内置只读预览器，没有调用系统应用。新导航使用 `/file?path=…`，旧 `/document?path=…` 保持兼容。PDF、音视频与额外图片解码器尚未接入。
