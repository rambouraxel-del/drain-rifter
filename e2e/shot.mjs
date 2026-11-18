// Usage: node e2e/shot.mjs <url> <outPrefix> [teleportMeters...]
// Opens the game in a portrait phone viewport, starts a run (skips intro), takes screenshots
// and prints debug state + console errors. Invincible mode is enabled so long runs survive.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5173/';
const out = process.argv[3] || 'e2e/out/shot';
const teleports = process.argv.slice(4).map(Number);
fs.mkdirSync(path.dirname(out), { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}-menu.png` });
await page.evaluate(() => { const g = window.__game; g.invincible = true; g.startRun(false); });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}-play.png` });
console.log(JSON.stringify(await page.evaluate(() => window.__game.debugState())));
for (const t of teleports) {
  await page.evaluate((s) => window.__game.debugTeleport(s), t);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${out}-${t}.png` });
  console.log(t, JSON.stringify(await page.evaluate(() => window.__game.debugState())));
}
console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
await browser.close();
