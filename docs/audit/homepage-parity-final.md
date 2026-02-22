# 主页格式一致性审计最终报告（格式/布局）

对比目标：`https://wangyu.me/` vs `http://127.0.0.1:58050/`

审计范围：仅检查格式/布局一致性，忽略文案与主图内容差异。

审计方式：使用 Playwright 在两个视口进行对比：
- `1440 x 1600`
- `1200 x 1600`

证据文件：
- 指标：`docs/audit/homepage-parity-final-metrics.json`
- 截图与差异图：`docs/audit/screenshots/homepage-parity-final/`

---

## final 结论

**PASS**（无 P0/P1 问题，允许范围内仅剩 P2 级差异）

---

## 各检查项结果

### 1) 顶部灰区高度与留白
- 1440 视口：
  - header 高度：ref `201.296875` / clone `201.296875`（Δ `0`）
  - header 底到主内容间距：ref `100` / clone `100`（Δ `0`）
- 1200 视口：
  - header 高度：ref `201.296875` / clone `201.296875`（Δ `0`）
  - header 底到主内容间距：ref `100` / clone `100`（Δ `0`）

结论：**PASS**

### 2) 导航图标与文字的视觉比例
- 1440 视口：
  - 图标框：ref `26.25x17.5` / clone `26.25x17.5`
  - icon/text 宽比：ref `0.9375` / clone `0.9375`
- 1200 视口：
  - 图标框：ref `26.25x17.5` / clone `26.25x17.5`
  - icon/text 宽比：ref `0.9375` / clone `0.9375`

结论：**PASS**

### 3) 首页激活项下划线/分割线表现
- 两个视口下：`.site-nav a.active` 的 `box-shadow` 均为 `none`，无额外蓝色下划线。

结论：**PASS**

### 4) 回顶按钮边框与形态
- 两个视口下：
  - 按钮：`40x40`，`border-radius: 3px`，`border-width: 0px`，背景 `rgb(238, 238, 238)`
  - 图标：`21x21`
  - topbtn clip 像素差异：`0`

结论：**PASS**

---

## 仍存差异（若有）

- Header 区域仍有像素差异（1440 视口 mismatch ratio `0.006456`，1200 视口 `0.007747`），主要来自站点标题/副标题文案及字形抗锯齿差异；不属于本次“格式/布局”修复范围。
- `.site-nav a.active` 的 `border-bottom-color` 计算值仍有不同（ref `rgb(35, 55, 255)` vs clone `rgb(54, 69, 217)`），但 `border-bottom-width` 为 `0px` 且无可见线条，属于非可见差异（P2）。

---

## 改动文件

- `assets/style.css`
  - 激活态与 hover 态分离，移除 active 下划线
  - 导航 icon 调整为与参考站一致的尺寸/间距模型（含 `box-sizing: content-box`）
  - 回顶按钮图标尺寸调整为 `21x21`
- `docs/audit/homepage-parity-final-metrics.json`
- `docs/audit/screenshots/homepage-parity-final/*`
- `docs/audit/homepage-parity-final.md`

---

## 执行记录（按要求）

每次 CSS 修改后均执行：
- `npm run build:site`
- `npm run qa`

说明：`build:site` 正常；`qa` 在 `check:post-alias` 失败（大量既有文章链接/结构问题），与本次主页格式修复无直接关联。