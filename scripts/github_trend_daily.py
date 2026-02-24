#!/usr/bin/env python3
import json
import re
import subprocess
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

ROOT = Path('/home/ubuntu/.openclaw/workspace-liuyun/projects/opflow-website')
POSTS_DIR = ROOT / 'content' / 'posts'
CATEGORIES_FILE = ROOT / 'content' / 'categories.json'
TRENDING_URL = 'https://github.com/trending?since=daily'


def fetch_html(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urlopen(req, timeout=25) as resp:
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

        links = row.select('a.Link.Link--muted.d-inline-block.mr-3')
        stars = clean(links[0].get_text(' ', strip=True)) if len(links) > 0 else '未知'
        forks = clean(links[1].get_text(' ', strip=True)) if len(links) > 1 else '未知'
        today = clean(row.select_one('span.d-inline-block.float-sm-right').get_text(' ', strip=True)) if row.select_one('span.d-inline-block.float-sm-right') else '未知'

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


def render_markdown(date_str: str, items):
    slug = f'github-trend-{date_str}'
    title = f'GitHub Trend 每日 Top 10｜{date_str}'
    summary = f'整理 {date_str} GitHub Trending 日榜前 10 项目，便于快速了解当日热门方向。'

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
        '今天整理了 GitHub Trending（日榜）前 10 项目，便于快速浏览值得关注的仓库。',
        '',
        f'- 榜单来源：[{TRENDING_URL}]({TRENDING_URL})',
        f'- 统计时间（Asia/Shanghai）：{date_str} 08:00',
        '',
        '## Top 10 项目速览',
        '',
    ]

    for i, it in enumerate(items, 1):
        lines.extend([
            f'### {i}. [{it["repo"]}]({it["url"]})',
            '',
            f'- 语言：{it["lang"]}',
            f'- 总 Star：{it["stars"]}',
            f'- Fork：{it["forks"]}',
            f'- 今日新增：{it["today"]}',
            f'- 简介：{it["desc"] or "（暂无描述）"}',
            '',
        ])

    lines.extend([
        '## 观察',
        '',
        '1. AI Agent / Prompt / Workflow 相关仓库仍然是热度中心。',
        '2. 工程化工具（代码理解、工作流提效）增长明显。',
        '3. 建议重点关注前 3 名项目的更新节奏与 issue/PR 活跃度。',
        '',
        '---',
        '',
        '以上为自动化整理，后续会每天 8:00 更新。',
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
    slug, content = render_markdown(date_str, items)

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    post_file = POSTS_DIR / f'{slug}.md'
    post_file.write_text(content, encoding='utf-8')

    subprocess.run(['npm', 'run', 'build:site'], cwd=str(ROOT), check=True)

    print(json.dumps({'slug': slug, 'url': f'https://opflow.cc/posts/{slug}/'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
