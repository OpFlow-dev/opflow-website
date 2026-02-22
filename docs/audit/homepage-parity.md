# 主页格式一致性审计（https://wangyu.me/ vs http://127.0.0.1:58050/）

## 审计方式
- 使用 **Playwright** 在同一视口（`1440 x 1800`）截图与测量 DOM 几何信息。
- 使用 `scripts/visual-compare.mjs` 与 `pixelmatch` 做差异热区确认。
- 证据文件：
  - 指标：`docs/audit/homepage-parity-metrics.json`
  - 导航细项：`docs/audit/homepage-nav-decoration-metrics.json`
  - 截图：`docs/audit/screenshots/homepage-parity/`
  - 差异图：`docs/audit/screenshots/homepage-parity/diff-*.png`

---

## 必检项结果总览

| 检查项 | 参考站 (wangyu.me) | 本地站 (127.0.0.1:58050) | 结论 |
|---|---:|---:|---|
| 顶部灰区高度 | `201.30px` | `201.30px` | ✅ 一致 |
| 标题位置（`.site-name`） | `x=294, y=0` | `x=294, y=0` | ✅ 一致 |
| 副标题位置（`.site-slogan`） | `x=294, y=72` | `x=294, y=72` | ✅ 一致 |
| 导航文字与图标大小比例 | 图标/文字宽比 `0.9375` | 图标/文字宽比 `0.6429` | ❌ 不一致 |
| 首页激活下划线 | `box-shadow: none` | `inset 0 -2px 0 var(--accent)` | ❌ 不一致 |
| 首屏主图块位置（`article img`） | `top=381.69px` | `top=380.69px` | ⚠️ 轻微偏差（1px） |
| 主内容起始间距（header→main） | `100px` | `100px` | ✅ 一致 |

---

## 不一致项明细

### 1) 导航图标与文字比例不一致
- **现象**  
  首页导航中，图标相对文字显得偏窄，导致“图标+文字”组合与参考站视觉比例不一致。

- **证据（像素/截图位置）**  
  1. `docs/audit/homepage-nav-decoration-metrics.json`
     - 参考站图标框：`width=26.25, height=17.5`（含右侧内边距）
     - 本地站图标框：`width=18, height=18`
     - 图标/文字宽比：`0.9375 -> 0.6429`
  2. `docs/audit/screenshots/homepage-parity/diff-nav-clip.png`  
     差异主区域（换算到整页）约在 `x=274~724, y=160~200`。

- **根因**  
  本地样式在 `.header .nav-icon` 使用了固定尺寸 + 外边距方案，且 path 被额外缩放：
  - `width: 18px; height: 18px; margin-right: 8px;`
  - `.header .nav-icon path { transform: scale(1.12); }`

  参考站实际渲染为字体比例驱动（`font-size: 17.5px` + `padding-right: 8.75px`）。

- **建议修复（CSS 选择器与属性）**  
  在 `assets/style.css` 调整：
  ```css
  .header .nav-icon {
    width: 1em;
    height: 1em;
    font-size: 1.25rem;   /* 17.5px @ html 14px */
    padding-right: 0.5em;
    margin-right: 0;
  }

  .header .nav-icon path {
    transform: none;
  }
  ```

---

### 2) 首页激活态存在额外下划线（蓝线）
- **现象**  
  本地首页导航“首页”项底部存在明显蓝色内阴影线；参考站无该线（仅文字变色）。

- **证据（像素/截图位置）**  
  1. `docs/audit/homepage-nav-decoration-metrics.json`
     - 参考站：`.site-nav a.active -> box-shadow: none`
     - 本地站：`.site-nav a.active -> box-shadow: rgb(35, 55, 255) 0px -2px 0px 0px inset`
  2. `docs/audit/screenshots/homepage-parity/ref-header-clip.png` 与 `clone-header-clip.png`  
     在区域 `x=274~368, y=197~201`：
     - 参考站蓝色像素 `0/475`
     - 本地站蓝色像素 `188/475`

- **根因**  
  本地样式把激活态和 hover 态绑定了统一下划线：
  ```css
  .header a:hover,
  .header a.active {
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  ```

- **建议修复（CSS 选择器与属性）**  
  若目标是匹配参考站当前视觉，建议移除 active 的下划线：
  ```css
  .header a.active {
    box-shadow: none;
  }
  ```
  （如需保留 hover 效果，可仅在 `:hover` 保留阴影。）

---

### 3) 首屏主图块垂直位置轻微偏差（1px）
- **现象**  
  本地首屏主图 `top` 比参考站上移约 `1px`。

- **证据（像素/截图位置）**  
  - `docs/audit/homepage-parity-metrics.json`
    - 参考站：`hero.top = 381.69`
    - 本地站：`hero.top = 380.69`
  - 同时 `h1` 高度存在 `1px` 差：`38.39 -> 37.39`。

- **根因**  
  更接近字体排版的亚像素差异（行高/字形渲染）导致的流式布局传递，不是结构性间距错误。

- **建议修复（CSS 选择器与属性）**  
  如需“严格像素锁定”，可对标题行高做整数化约束，减少跨环境亚像素波动：
  ```css
  .typo h1 {
    line-height: 38px;
  }
  ```
  > 该项建议优先级低，通常可接受为渲染容差。

---

## 修复优先级清单（P0 / P1 / P2）

- **P0**：去除首页激活态额外下划线（`.header a.active { box-shadow: none; }`）
- **P1**：修正导航图标尺寸与间距模型（`.header .nav-icon` + `.header .nav-icon path`）
- **P2**：可选处理 1px 首屏主图垂直偏差（`.typo h1 { line-height: 38px; }`）

---

> 说明：本次仅做审计分析与证据输出，未修改 `assets/style.css` / `scripts/site-lib.mjs` / 页面 HTML。