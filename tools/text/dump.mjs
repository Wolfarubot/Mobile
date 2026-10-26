// Writes every line of the Text editor's table (src/core/textRegistry.ts) to a JSON file, for publishing with the
// editor. Needs the dev server running: node tools/text/dump.mjs <out.json> [url]
import { writeFileSync } from 'node:fs';

// Playwright from the project, or the copy installed globally.
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));

const [out = 'texts.json', url = 'http://localhost:4190/'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => window.__texts && window.__texts.size > 0, null, { timeout: 30000 });
const entries = await page.evaluate(() => [...window.__texts.values()]);
await browser.close();
writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), entries }));
console.log(`${entries.length} lines → ${out}`);
