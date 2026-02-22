# 文章内部格式一致性审计（参考页 vs 现站页）

- 参考页：`https://wangyu.me/posts/ml/flash-decoding/`
- 现站页：`http://127.0.0.1:58050/posts/sample-post-001/`
- 审计方式：DOM 结构对比 + Playwright 计算样式采样 + 本地模板/CSS 溯源

---

## 结论概览

### 必须修复（must-fix）
1. 标题下元信息区结构与样式不一致（参考有 `.info`，现站用普通段落）
2. 标签区缺失（参考有“标签”及可点击标签，现站未渲染）
3. 文章内链接场景缺失（参考页有行内/段落链接，现站正文 0 链接）
4. 代码块视觉层级不一致（参考有浅底+边框，现站透明背景无边框）

### 可选优化（nice-to-have）
1. `:visited` 状态未显式定义（两边都无）
2. 样例文章层级覆盖不足（H3/有序列表/引用块回归样本不足）

### 已对齐（无需改动）
- 正文容器宽度与对齐：两边 `main` 在 1280 视口下均为 `900px` 宽、左右对齐一致。
- 正文字号与段落节奏基线：`p` 的 `font-size:14px / line-height:28px / margin-bottom:16.8px` 一致。

---

## Must-fix 1：标题下元信息区结构与样式不一致

- **现象**
  - 参考页：`h1.title + div.info`，信息行小字号、紧贴标题。
  - 现站：`h1 + p(发布时间｜分类)`，元信息被当作正文段落渲染。

- **证据**
  - 参考页 DOM：`<h1 class="title">...` + `<div class="info">...`（含分类/标签/创建时间）。
  - 现站 DOM：`posts/sample-post-001/index.html:34-36` 仅有 `<h1>` + `<p>发布时间...分类...</p>`。
  - 计算样式（1280 视口）：
    - 参考页 `h1` `margin-bottom: 0px`
    - 现站 `h1` `margin-bottom: 22px`

- **根因**
  - 构建模板 `scripts/site-lib.mjs:337-339` 固定输出 `h1 + p + p`，未输出 `.title/.info` 结构。

- **建议修复（selector + property）**
  - 结构：将文章头部改为 `h1.title + .info`。
  - 样式对齐参考页：
    - `.typo > h1.title { margin-bottom: 0; }`
    - `.typo > .info { font-size: 12px; color: var(--secondary-color); padding: 10px 0; margin-bottom: 20px; }`
    - `.typo > .info > span { display: inline-block; margin-right: 10px; margin-bottom: 5px; }`

---

## Must-fix 2：标签区缺失（metadata 中缺“标签”）

- **现象**
  - 参考页 metadata 含 `标签：<a ...>`。
  - 现站文章页 metadata 不展示标签。

- **证据**
  - 参考页首屏信息区存在 `.tags` 且可点击。
  - `content/posts/sample-post-001.md:6-8` 存在 tags（`frontend`、`security`）。
  - `posts/sample-post-001/index.html:35` 未输出任何 tags。

- **根因**
  - `scripts/site-lib.mjs:337-339` 渲染文章头时未消费 `post.tags` 字段。

- **建议修复（selector + property）**
  - 结构：在 `.info` 中新增 `.tags`，输出标签链接到 `/tags/#<tag>`。
  - 样式：
    - `.typo > .info .tags a:not(:last-of-type) { margin-right: 0.6em; }`
    - `.typo > .info .tags a { border-bottom: 1px solid currentColor; }`

---

## Must-fix 3：文章内链接场景缺失（行内/段落链接不可见）

- **现象**
  - 参考页文章内有 6 个链接（含 info 区 + 正文行内链接），hover 行为明确。
  - 现站目标文章正文 `a` 数量为 0，无法呈现/验证“行内与段落内链接”一致性。

- **证据**
  - 采样统计：参考页 `article.typo a = 6`；现站 `article.typo a = 0`。
  - 参考页行内链接 hover：`rgb(0,0,0) -> rgb(54,69,217)`，边线同步变色。
  - 本地临时注入链接测试时，现站 CSS 行为与参考一致（说明是“内容/结构缺失”而非纯 CSS 缺失）。

- **根因**
  - 当前样例正文内容无任何链接，且 metadata 分类未做成可点击链接。

- **建议修复（selector + property）**
  - 内容层面：样例文章至少补 1 个行内链接 + 1 个段落级链接用于回归。
  - 样式（保持/显式化）：
    - `.typo p a, .typo li a { color: inherit; border-bottom: 1px solid currentColor; text-decoration: none; }`
    - `.typo p a:hover, .typo li a:hover { color: var(--active-color); border-bottom-color: var(--active-color); }`

---

## Must-fix 4：代码块视觉层级不一致

- **现象**
  - 参考页代码块有浅灰背景和边框，视觉上与正文分层明显。
  - 现站代码块背景透明、无边框，块级层级较弱。

- **证据**
  - 参考页首个 `pre` 计算样式：`background-color: rgb(250,250,250)`，`border: 1px solid rgb(238,238,238)`。
  - 现站首个 `pre` 计算样式：`background-color: transparent`，`border: none`。
  - 现站 CSS `assets/style.css:477-483` 仅定义 `line-height/overflow/radius`，未定义背景与边框。

- **根因**
  - 参考页使用 `pre.astro-code`（含高亮产物与边框样式）；现站输出普通 `<pre><code>` 且缺少对应视觉样式。

- **建议修复（selector + property）**
  - `.typo pre { background-color: #fafafa; border: 1px solid #eee; padding: 0; }`
  - `.typo pre > code { padding: 1em; }`（与现有值保持一致）

---

## Nice-to-have 1：`:visited` 状态未显式定义

- **现象**
  - 两边都没有 `:visited` 规则，访问过链接与未访问链接几乎无差异。

- **证据**
  - CSS 检索结果：参考/现站均未命中 `:visited` 选择器。

- **根因**
  - 全局仅定义了 `a` 与 `a:hover`。

- **建议修复（selector + property）**
  - `.typo a:visited { color: #4f566b; border-bottom-color: #4f566b; }`

---

## Nice-to-have 2：样例文档层级覆盖不足（回归样本维度）

- **现象**
  - 参考页包含多级标题（H2/H3）与有序列表；现站目标样例仅有 H2 + 无序列表。
  - 引用块在两页当前样本中都未出现，无法做视觉一致性回归。

- **证据**
  - 结构计数：
    - 参考页：`h2=6, h3=4, ol=1`
    - 现站：`h2=1, h3=0, ol=0`

- **根因**
  - 样例文章内容覆盖面偏窄，回归信号不足。

- **建议修复（selector + property）**
  - 新增一篇“排版回归样例”覆盖 `h3/ol/blockquote/inline-link`。
  - 并以现有样式作为断言基线：
    - `.typo h3 { font-size: 18px; }`
    - `.typo ol { list-style: decimal; margin-left: 1.2em; }`
    - `.typo blockquote { border-left: 3px solid var(--border-color); background-color: var(--gray-background-color); }`
