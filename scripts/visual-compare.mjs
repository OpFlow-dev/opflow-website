import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const REF_BASE = process.env.REF_BASE || 'https://wangyu.me';
const CLONE_BASE = process.env.CLONE_BASE || 'http://opflow.cc:58050';
const OUT_DIR = path.resolve('qa-screenshots/visual-compare');
const VIEWPORT = { width: 1440, height: 1600 };
const PAGES = ['/', '/list/', '/categories/', '/tags/', '/about/'];

const HEADER_CLIP = { x: 0, y: 0, width: 1440, height: 250 };
const TOP_BTN_CLIP = { x: 1160, y: 1280, width: 240, height: 240 };

function slug(pathname) {
  if (pathname === '/') return 'home';
  return pathname.replaceAll('/', '-').replace(/^-+|-+$/g, '') || 'page';
}

async function ensureOutDir() {
  await fs.mkdir(OUT_DIR, { recursive: true });
}

function cropPngFromFile(inputPath, clip) {
  const src = PNG.sync.read(fsSync.readFileSync(inputPath));
  const x = Math.max(0, Math.min(clip.x, src.width - 1));
  const y = Math.max(0, Math.min(clip.y, src.height - 1));
  const width = Math.max(1, Math.min(clip.width, src.width - x));
  const height = Math.max(1, Math.min(clip.height, src.height - y));
  const out = new PNG({ width, height });
  PNG.bitblt(src, out, x, y, width, height, 0, 0);
  return PNG.sync.write(out);
}

async function screenshotClip(page, url, clip, outFile) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: outFile, clip });
}

async function screenshotTopButtonClip(page, url, clip, outFile) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => window.scrollTo(0, 800));
  await page.waitForTimeout(600);
  await page.screenshot({ path: outFile, clip });
}

async function comparePng(refPath, clonePath, diffPath) {
  const [refBuf, cloneBuf] = await Promise.all([fs.readFile(refPath), fs.readFile(clonePath)]);
  const refPng = PNG.sync.read(refBuf);
  const clonePng = PNG.sync.read(cloneBuf);

  if (refPng.width !== clonePng.width || refPng.height !== clonePng.height) {
    throw new Error(`Image size mismatch: ${refPath} vs ${clonePath}`);
  }

  const diff = new PNG({ width: refPng.width, height: refPng.height });
  const mismatched = pixelmatch(refPng.data, clonePng.data, diff.data, refPng.width, refPng.height, {
    threshold: 0.1
  });
  await fs.writeFile(diffPath, PNG.sync.write(diff));
  return {
    mismatchedPixels: mismatched,
    totalPixels: refPng.width * refPng.height,
    mismatchRatio: mismatched / (refPng.width * refPng.height)
  };
}

async function run() {
  await ensureOutDir();
  const summary = {
    comparedAt: new Date().toISOString(),
    referenceBase: REF_BASE,
    cloneBase: CLONE_BASE,
    viewport: VIEWPORT,
    mode: 'playwright',
    warning: null,
    pages: []
  };

  let browser;
  let context;
  let refPage;
  let clonePage;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: VIEWPORT });
    refPage = await context.newPage();
    clonePage = await context.newPage();
  } catch (err) {
    summary.mode = 'fallback-local-screenshots';
    summary.warning = `Playwright launch failed: ${err.message.split('\n')[0]}`;
  }

  for (const pathname of PAGES) {
    const pageSlug = slug(pathname);
    const refHeaderPath = path.join(OUT_DIR, `ref-${pageSlug}-header.png`);
    const cloneHeaderPath = path.join(OUT_DIR, `clone-${pageSlug}-header.png`);
    const diffHeaderPath = path.join(OUT_DIR, `diff-${pageSlug}-header.png`);
    const refTopBtnPath = path.join(OUT_DIR, `ref-${pageSlug}-top-button.png`);
    const cloneTopBtnPath = path.join(OUT_DIR, `clone-${pageSlug}-top-button.png`);
    const diffTopBtnPath = path.join(OUT_DIR, `diff-${pageSlug}-top-button.png`);

    if (summary.mode === 'playwright') {
      await screenshotClip(refPage, `${REF_BASE}${pathname}`, HEADER_CLIP, refHeaderPath);
      await screenshotClip(clonePage, `${CLONE_BASE}${pathname}`, HEADER_CLIP, cloneHeaderPath);
      await screenshotTopButtonClip(refPage, `${REF_BASE}${pathname}`, TOP_BTN_CLIP, refTopBtnPath);
      await screenshotTopButtonClip(clonePage, `${CLONE_BASE}${pathname}`, TOP_BTN_CLIP, cloneTopBtnPath);
    } else {
      const refSource = path.resolve('qa-screenshots', `ref-${pageSlug}.png`);
      const cloneSource = path.resolve('qa-screenshots', `clone-${pageSlug}.png`);
      const [refHeader, cloneHeader, refTop, cloneTop] = [
        cropPngFromFile(refSource, HEADER_CLIP),
        cropPngFromFile(cloneSource, HEADER_CLIP),
        cropPngFromFile(refSource, TOP_BTN_CLIP),
        cropPngFromFile(cloneSource, TOP_BTN_CLIP)
      ];
      await Promise.all([
        fs.writeFile(refHeaderPath, refHeader),
        fs.writeFile(cloneHeaderPath, cloneHeader),
        fs.writeFile(refTopBtnPath, refTop),
        fs.writeFile(cloneTopBtnPath, cloneTop)
      ]);
    }

    const headerResult = await comparePng(refHeaderPath, cloneHeaderPath, diffHeaderPath);
    const topBtnResult = await comparePng(refTopBtnPath, cloneTopBtnPath, diffTopBtnPath);

    summary.pages.push({
      path: pathname,
      header: {
        clip: HEADER_CLIP,
        ...headerResult
      },
      topButton: {
        clip: TOP_BTN_CLIP,
        ...topBtnResult
      }
    });
  }

  if (clonePage) await clonePage.close();
  if (refPage) await refPage.close();
  if (context) await context.close();
  if (browser) await browser.close();
  if (summary.mode !== 'playwright') {
    summary.viewport = { width: 1400, height: 1400 };
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
