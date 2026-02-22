# 文章页格式一致性终审（Final）

- 参考页：`https://wangyu.me/posts/ml/flash-decoding/`
- 本地页：`http://127.0.0.1:58050/posts/sample-post-001/`
- 结论：**PASS**
- must-fix：**0**

## 审计范围（必检）

1. 超链接样式与行为（普通/hover）
2. 分类与标签区展示样式
3. 代码块、引用块、列表、标题层级、段落间距

## 对齐结果

- ✅ **链接样式/hover**：
  - 本地保留与参考站一致的规则：`a { color: inherit; text-decoration: none; }`、`.typo a { border-bottom: 1px solid; }`、`a:hover { color: var(--active-color); }`
  - 示例正文已补充行内链接、列表链接，实际渲染场景可验证。
- ✅ **分类/标签信息区**：
  - 文章头部结构已对齐为 `h1.title + div.info`。
  - `.info` 内包含 `category/tags/创建时间`，并应用与参考一致的字号、间距、标签间距。
- ✅ **排版节奏**：
  - 代码块：`pre` 具备浅底+边框，`pre > code` 为 block。
  - 引用块：灰底、左边线、段落节奏与参考规则一致。
  - 列表与层级：`ul/ol`、`h2/h3` 节奏规则对齐，且样例补齐了 `h3 + ol + blockquote` 覆盖。
  - 标题节奏：补齐 `h1` 实线底边、`h2/h3` 点状底边（与参考样式结构一致）。

## 本轮改动文件

- `scripts/site-lib.mjs`
  - 文章模板改为 `h1.title + div.info`，去除文章页 `tag-list` chips，信息区改为分类/标签/创建时间结构。
- `assets/style.css`
  - 新增 `.typo > .title`、`.typo > .info`、`.info .tags a:not(:last-of-type)` 样式。
  - 调整标题层级节奏（`h1/h2/h3` 底边与 `h4~h6` 字重）。
  - `pre > code` 由 `inline-block` 改为 `block`。
- `content/posts/sample-post-001.md`
  - 补充正文行内链接、引用块、`h3`、有序列表，增强文章排版回归样本覆盖。
- `scripts/post-alias-audit.mjs`
  - QA 兼容 `h1` 带属性写法（如 `<h1 class="title">`）。
  - 列表页链接校验兼容相对路径与绝对路径两种输出形式。

## 验证

已执行：

```bash
npm run build:site && npm run qa
```

结果：全部通过（`check:links` / `check:top-btn` / `check:metadata` / `check:post-alias` 均 OK）。

## 剩余差异

- **无 must-fix 剩余项**（must-fix = 0）。
- 非本任务范围差异未计入（如站点其余页面业务内容差异）。
