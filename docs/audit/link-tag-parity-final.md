# Link & Tag Parity Final Audit（C）

- 仓库：`/home/ubuntu/.openclaw/workspace-liuyun/projects/opflow-website`
- 参考站：`https://wangyu.me`
- 审计范围：`/`、`/list/`、`/categories/`、`/tags/`、`/about/`、文章页 taxonomy 回链、tags/categories chip 样式
- 结果：**问题项 = 0**

## 1) 已执行对比与修复

### A. 页面链接结构（`/ /list/ /categories/ /tags/ /about/`）
对比本地页面与 `ref-html` 对应页面的导航链接后，统一为与参考站一致的绝对路径：

- `/`
- `/list/`
- `/categories/`
- `/tags/`
- `/about/`

**修复点（`scripts/site-lib.mjs`）**
- `renderHeader(...)` 的导航链接全部改为绝对路径（去除相对 `../` 形式）。
- 首页“查看全部”入口统一为 `/list`。
- `renderPostList(...)` 输出文章链接统一为 `/posts/<slug>/`。
- 新增 about 页构建输出（`/about/index.html` 由构建流程生成，导航/资源版本参数与其它页面一致）。

### B. 文章页到 categories/tags 回链
**修复点（`scripts/site-lib.mjs`）**
- 文章 metadata 区分类链接统一为：`/categories/#<anchor>`
- 文章 metadata 区标签链接统一为：`/tags/#<anchor>`
- taxonomy anchor 生成规则调整为保留大小写与常见符号（更贴近参考站锚点风格），同时去除非法字符。

校验结果：对全部已发布文章（149 篇）扫描，分类回链与标签回链均完整存在，无缺失。

### C. tags/categories chip 格式
对照参考站样式，以下关键项一致：

- 字号：`12px`
- 边框：`1px solid #ddd`
- 内边距：`2px 10px`
- 间距：`margin-right: 5px; margin-bottom: 5px`
- hover：`color: #fff; background-color: #000`
- 计数格式：`名称 (数字)`

本地 `assets/style.css` 与参考站对应规则一致，页面实际渲染格式一致。

## 2) 验证

执行：

```bash
npm run build:site && npm run qa
```

结果：

- `build-site: OK (149 posts)`
- `check-links: OK (155 HTML files scanned)`
- `check-top-btn: OK (155 pages include top button)`
- `check-metadata: OK (155 HTML files validated)`
- `post-alias-audit: OK (149 published markdown posts verified)`

## 3) 结论

本轮“链接结构与标签格式”审计项已全部闭环，**问题项 = 0**。

> 注：站点品牌文案（站名/slogan/版权名）属于内容差异，不属于本次 link/tag 审计问题项。