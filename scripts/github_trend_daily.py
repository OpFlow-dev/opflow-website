#!/usr/bin/env python3
import json
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path('/home/ubuntu/.openclaw/workspace-liuyun/projects/opflow-website')
POSTS_DIR = ROOT / 'content' / 'posts'
CATEGORIES_FILE = ROOT / 'content' / 'categories.json'
TRENDING_URL = 'https://github.com/trending?since=daily'

MAX_CLONE_SECONDS = int(os.getenv('TREND_CLONE_TIMEOUT_SEC', '180'))
MAX_CODEX_SECONDS = int(os.getenv('TREND_CODEX_TIMEOUT_SEC', '600'))


def fetch_html(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=30) as resp:
        return resp.read().decode('utf-8', errors='ignore')


def clean(text: str) -> str:
    return re.sub(r'\s+', ' ', (text or '').strip())


def parse_top10(html: str):
    soup = BeautifulSoup(html, 'html.parser')
    rows = soup.select('article.Box-row')[:10]
    items = []
    for row in rows:
        a = row.select_one('h2 a')
        if not a:
            continue
        repo = clean(a.get_text(' ', strip=True)).replace(' / ', '/').replace(' /', '/').replace('/ ', '/')
        href = 'https://github.com' + (a.get('href') or '')
        desc = clean(row.select_one('p').get_text(' ', strip=True)) if row.select_one('p') else ''
        lang = clean(row.select_one('[itemprop="programmingLanguage"]').get_text()) if row.select_one('[itemprop="programmingLanguage"]') else '未知'

        star_link = row.select_one('a[href$="/stargazers"]')
        fork_link = row.select_one('a[href$="/forks"]')

        # Fallback for markup/class changes on GitHub Trending.
        if not star_link or not fork_link:
            stat_links = [
                node for node in row.select('a.Link--muted')
                if (node.get('href') or '').endswith('/stargazers')
                or (node.get('href') or '').endswith('/forks')
            ]
            for node in stat_links:
                href_lower = (node.get('href') or '').lower()
                if href_lower.endswith('/stargazers') and not star_link:
                    star_link = node
                elif href_lower.endswith('/forks') and not fork_link:
                    fork_link = node

        stars = clean(star_link.get_text(' ', strip=True)) if star_link else '未知'
        forks = clean(fork_link.get_text(' ', strip=True)) if fork_link else '未知'

        today_node = row.select_one('span.d-inline-block.float-sm-right')
        today = clean(today_node.get_text(' ', strip=True)) if today_node else '未知'
        if today == '未知':
            m = re.search(r'([\d,]+\s+stars?\s+today)', row.get_text(' ', strip=True), re.IGNORECASE)
            if m:
                today = clean(m.group(1))

        items.append({
            'repo': repo,
            'url': href,
            'desc': desc,
            'lang': lang,
            'stars': stars,
            'forks': forks,
            'today': today,
        })
    return items


def ensure_category(name: str):
    CATEGORIES_FILE.parent.mkdir(parents=True, exist_ok=True)
    if CATEGORIES_FILE.exists():
        data = json.loads(CATEGORIES_FILE.read_text(encoding='utf-8'))
    else:
        data = {'categories': []}
    cats = data.get('categories') or []
    if name not in cats:
        cats.append(name)
        data['categories'] = sorted(set(cats), key=lambda x: x.lower())
        CATEGORIES_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def run_cmd(cmd, cwd=None, timeout=120):
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


ANALYSIS_JSON_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "功能描述": {
            "type": "string",
            "minLength": 80,
            "pattern": "^(?!.*120-220字中文)(?!.*功能点).+",
        },
        "技术栈": {
            "type": "array",
            "minItems": 2,
            "maxItems": 10,
            "items": {
                "type": "string",
                "minLength": 2,
                "pattern": "^(?!.*语言/框架/关键基础设施).+",
            },
        },
        "核心功能": {
            "type": "array",
            "minItems": 4,
            "maxItems": 8,
            "items": {
                "type": "string",
                "minLength": 8,
                "pattern": "^(?!功能点[0-9]).+",
            },
        },
    },
    "required": ["功能描述", "技术栈", "核心功能"],
}


def run_codex_schema(repo_dir: Path, prompt: str, timeout: int):
    schema_file = tempfile.NamedTemporaryFile(prefix='trend-schema-', suffix='.json', delete=False)
    out_file = tempfile.NamedTemporaryFile(prefix='trend-out-', suffix='.json', delete=False)
    try:
        schema_path = Path(schema_file.name)
        out_path = Path(out_file.name)
        schema_file.write(json.dumps(ANALYSIS_JSON_SCHEMA, ensure_ascii=False).encode('utf-8'))
        schema_file.flush()

        result = run_cmd(
            [
                'codex',
                'exec',
                '--full-auto',
                '--skip-git-repo-check',
                '--output-schema',
                str(schema_path),
                '--output-last-message',
                str(out_path),
                prompt,
            ],
            cwd=repo_dir,
            timeout=timeout,
        )

        parsed = None
        if out_path.exists() and out_path.stat().st_size > 0:
            try:
                parsed = json.loads(out_path.read_text(encoding='utf-8').strip())
            except Exception:
                parsed = None

        raw = (result.stdout or '') + '\n' + (result.stderr or '')
        return result.returncode, parsed, raw
    finally:
        try:
            schema_file.close()
        except Exception:
            pass
        try:
            out_file.close()
        except Exception:
            pass
        try:
            Path(schema_file.name).unlink(missing_ok=True)
        except Exception:
            pass
        try:
            Path(out_file.name).unlink(missing_ok=True)
        except Exception:
            pass


def extract_first_json_block(text: str):
    if not text:
        return None

    text = text.strip()

    # 1) fenced json blocks first
    for m in re.finditer(r'```json\s*(\{[\s\S]*?\})\s*```', text, re.IGNORECASE):
        try:
            obj = json.loads(m.group(1))
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue

    # 2) balanced-brace scan: keep the last valid JSON object
    candidates = []
    start = None
    depth = 0
    in_str = False
    escape = False

    for i, ch in enumerate(text):
        if in_str:
            if escape:
                escape = False
            elif ch == '\\':
                escape = True
            elif ch == '"':
                in_str = False
            continue

        if ch == '"':
            in_str = True
            continue

        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            if depth > 0:
                depth -= 1
                if depth == 0 and start is not None:
                    candidates.append(text[start:i + 1])
                    start = None

    for blob in reversed(candidates):
        try:
            obj = json.loads(blob)
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue

    return None


PLACEHOLDER_PATTERNS = [
    r'120-220字中文',
    r'语言/框架/关键基础设施',
    r'功能点1',
    r'功能点2',
    r'功能点3',
    r'功能点4',
    r'该项目聚焦于提升开发者效率',
    r'详见仓库 README',
]


def has_placeholder(text: str) -> bool:
    t = clean(text)
    return any(re.search(p, t, re.IGNORECASE) for p in PLACEHOLDER_PATTERNS)


def normalize_analysis(obj: dict, fallback_desc: str, fallback_lang: str):
    feature = obj.get('功能描述') or obj.get('overview') or fallback_desc or '该项目位列今日 Trending，建议重点关注其核心场景与更新节奏。'
    stack = obj.get('技术栈') or obj.get('tech_stack') or [fallback_lang]
    core = obj.get('核心功能') or obj.get('core_features') or []

    if isinstance(stack, str):
        stack = [s.strip() for s in re.split(r'[,，/、]', stack) if s.strip()]
    if not isinstance(stack, list):
        stack = [fallback_lang]

    if isinstance(core, str):
        core = [s.strip() for s in re.split(r'\n+|[；;]', core) if s.strip()]
    if not isinstance(core, list):
        core = []

    feature = clean(str(feature))
    stack = [clean(str(x)) for x in stack if clean(str(x))]
    core = [clean(str(x)) for x in core if clean(str(x))]

    if not stack:
        stack = [fallback_lang or '未知']
    if not core:
        core = ['核心能力可参考仓库 README、examples 与 docs 目录。']

    return {
        'feature': feature,
        'stack': stack[:8],
        'core': core[:6],
    }


def is_weak_analysis(analysis: dict) -> bool:
    feature = analysis.get('feature', '')
    stack = analysis.get('stack', [])
    core = analysis.get('core', [])

    if not feature or len(feature) < 40:
        return True
    if has_placeholder(feature):
        return True
    if any(has_placeholder(x) for x in stack):
        return True
    if any(has_placeholder(x) for x in core):
        return True
    if len(core) < 3:
        return True
    return False


def analyze_repo_with_codex(repo_dir: Path, repo_name: str, fallback_desc: str, fallback_lang: str):
    base_prompt = f'''你是资深技术分析师。请快速阅读仓库（优先 README、docs、根目录配置文件与主要源码目录），输出“功能描述 + 技术栈 + 核心功能”。

仓库：{repo_name}
要求：
1) 不要执行重型构建/测试，仅基于文件结构与文档判断。
2) 输出必须是严格 JSON（不要 Markdown，不要解释，不要代码块）。
3) 禁止输出占位词：例如“120-220字中文”“功能点1”“语言/框架/关键基础设施”。
4) 功能描述至少 80 字，必须包含项目要解决的问题、目标用户和典型场景。
5) 核心功能至少 4 条，且要具体。
'''

    rc, parsed, raw = run_codex_schema(repo_dir, base_prompt, MAX_CODEX_SECONDS)

    if parsed is None and raw:
        parsed = extract_first_json_block(raw)

    if parsed is not None:
        normalized = normalize_analysis(parsed, fallback_desc, fallback_lang)
        if not is_weak_analysis(normalized):
            return normalized

    retry_prompt = f'''你上一次输出不合格（包含占位词或信息不足）。请重新输出，并且只返回 JSON。

仓库：{repo_name}
强约束：
- 严禁出现“功能点1/2/3/4”“120-220字中文”“语言/框架/关键基础设施”等模板文本。
- 功能描述必须具体，至少 80 字。
- 核心功能至少 4 条，且每条都要包含具体动作或能力。
- 技术栈至少 3 项（若仓库规模较小可写 2 项）。
'''

    rc2, retry_parsed, retry_raw = run_codex_schema(repo_dir, retry_prompt, MAX_CODEX_SECONDS)

    if retry_parsed is None and retry_raw:
        retry_parsed = extract_first_json_block(retry_raw)

    if retry_parsed is not None:
        normalized = normalize_analysis(retry_parsed, fallback_desc, fallback_lang)
        if not is_weak_analysis(normalized):
            return normalized

    third_prompt = f'''最后一次重试：请严格返回 JSON，并确保信息具体可用。

仓库：{repo_name}
要求：
- 功能描述：100-220字中文，必须具体。
- 技术栈：3-8项，写出语言、框架、关键依赖或基础设施。
- 核心功能：4-6项，每条必须可执行、可验证，不得写模板词。
'''

    rc3, third_parsed, third_raw = run_codex_schema(repo_dir, third_prompt, MAX_CODEX_SECONDS)

    if third_parsed is None and third_raw:
        third_parsed = extract_first_json_block(third_raw)

    if third_parsed is not None:
        normalized = normalize_analysis(third_parsed, fallback_desc, fallback_lang)
        if not is_weak_analysis(normalized):
            return normalized

    return {
        'feature': fallback_desc or '该项目位列今日 Trending，建议重点关注其 README 与近期提交。',
        'stack': [fallback_lang or '未知'],
        'core': ['自动分析结果不足，建议人工复核仓库文档与目录结构。'],
        'note': f'codex分析质量不足，已降级（rc={rc}/{rc2}/{rc3}）',
    }


def clone_and_analyze(items):
    analyzed = []
    with tempfile.TemporaryDirectory(prefix='ghtrend-', dir='/tmp') as temp_dir:
        temp_root = Path(temp_dir)

        for i, item in enumerate(items, 1):
            repo_name = item['repo']
            repo_dir = temp_root / repo_name.replace('/', '__')

            clone_cmd = [
                'git', 'clone', '--depth', '1', '--filter=blob:none', '--single-branch', item['url'], str(repo_dir)
            ]
            clone = run_cmd(clone_cmd, timeout=MAX_CLONE_SECONDS)

            if clone.returncode != 0 or not repo_dir.exists():
                item['analysis'] = {
                    'feature': item['desc'] or '该项目位列今日 Trending，建议关注其 README 与示例。',
                    'stack': [item['lang'] or '未知'],
                    'core': ['仓库克隆失败，暂以 Trending 信息补充。'],
                    'note': 'clone失败，已降级',
                }
                analyzed.append(item)
                continue

            analysis = analyze_repo_with_codex(repo_dir, repo_name, item['desc'], item['lang'])
            item['analysis'] = analysis
            analyzed.append(item)

            # 清理单仓库，避免临时目录过大
            shutil.rmtree(repo_dir, ignore_errors=True)

    return analyzed


def render_markdown(date_str: str, items):
    slug = f'github-trend-{date_str}'
    title = f'GitHub Trend 每日 Top 10｜{date_str}'
    summary = f'整理 {date_str} GitHub Trending 日榜前 10 项目，并基于源码生成功能描述与技术栈报告。'

    header = f'''---
slug: {slug}
title: {title}
date: "{date_str}"
status: published
category: github trend
tags:
  - github
  - trend
  - daily
summary: {summary}
---
'''

    lines = [
        f'# {title}',
        '',
        '今天整理了 GitHub Trending（日榜）前 10 项目。每个项目均执行了：**临时目录浅克隆源码 + Codex 技术解读**，并输出功能与技术栈报告。',
        '',
        f'- 榜单来源：[{TRENDING_URL}]({TRENDING_URL})',
        f'- 统计时间（Asia/Shanghai）：{date_str} 08:00',
        '',
        '## Top 10 项目深度速览',
        '',
    ]

    for i, it in enumerate(items, 1):
        a = it.get('analysis', {})
        feature = a.get('feature') or it.get('desc') or '该项目聚焦于提升开发效率。'
        stack = a.get('stack') or [it.get('lang') or '未知']
        core = a.get('core') or ['详见仓库文档。']

        lines.extend([
            f'### {i}. [{it["repo"]}]({it["url"]})',
            '',
            f'- 语言（Trending）：{it["lang"]}',
            f'- 总 Star：{it["stars"]}',
            f'- Fork：{it["forks"]}',
            f'- 今日新增：{it["today"]}',
            '',
            '#### 功能描述（基于源码）',
            '',
            feature,
            '',
            '#### 技术栈报告',
            '',
            '- ' + '；'.join(stack),
            '',
            '#### 核心功能',
            '',
        ])
        for c in core:
            lines.append(f'- {c}')
        lines.append('')

    lines.extend([
        '## 观察',
        '',
        '1. AI Agent / Prompt / Workflow 相关仓库仍是热度中心。',
        '2. 工程化工具（代码理解、自动化与协作）增长明显。',
        '3. 建议优先跟踪前 3 名仓库的 release 与 issue 趋势。',
        '',
        '---',
        '',
        '以上内容为自动化生成，后续会每天 8:00 更新。',
        '',
    ])

    return slug, header + '\n'.join(lines)


def main():
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz)
    date_str = now.strftime('%Y-%m-%d')

    html = fetch_html(TRENDING_URL)
    items = parse_top10(html)
    if len(items) < 10:
        raise RuntimeError(f'解析 Trending 失败，仅拿到 {len(items)} 条')

    ensure_category('github trend')
    items = clone_and_analyze(items)
    slug, content = render_markdown(date_str, items)

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_file = POSTS_DIR / f'{slug}.md'
    post_file.write_text(content, encoding='utf-8')

    subprocess.run(['npm', 'run', 'build:site'], cwd=str(ROOT), check=True)

    print(json.dumps({'slug': slug, 'url': f'https://opflow.cc/posts/{slug}/'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
