// Usage: node e2e/out/autoplay.mjs <url> [seconds=180]
import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5185/';
const secs = Number(process.argv[3] || 180);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/GPU stall|GL Driver/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1500);
const wire = (intro) => page.evaluate(async (intro) => {
  const m = await import('/src/core/Autopilot.ts');
  const g = window.__game;
  g.applySettings({ ...g.settings, quality: 'low' });
  g.autopilotDrive = m.createAutopilot(); g.autopilot = true;
  g.startRun(intro);
}, intro);
await wire(true);
const t0 = Date.now(); let lastShot = 0, lastDeath = null;
const rows = [], deaths = [];
while ((Date.now() - t0) / 1000 < secs) {
  await page.waitForTimeout(5000);
  const el = Math.round((Date.now() - t0) / 1000);
  const st = await page.evaluate(() => window.__game && window.__game.debugState());
  if (!st) { errors.push('page reload (HMR?) at ' + el); await page.waitForTimeout(2000); continue; }
  if (st.state === 'menu') { errors.push('back in menu (reload) at ' + el + ', rewiring'); await wire(false); continue; }
  rows.push({ t: el, state: st.state, s: Math.round(st.s), speed: +st.speed.toFixed(1), biome: st.biome, geo: st.geometries, tex: st.textures, calls: st.drawCalls, fps: +st.fps.toFixed(1) });
  if (el - lastShot >= 30) { lastShot = el; await page.screenshot({ path: `e2e/out/auto-${el}.png` }); }
  if (st.state === 'gameover') {
    await page.screenshot({ path: `e2e/out/auto-death-${deaths.length}.png` });
    deaths.push({ t: el, s: Math.round(st.s), biome: st.biome, why: st.lastDeath });
    await page.evaluate(() => { window.__game.autopilot = true; window.__game.startRun(false); });
  }
}
console.table(rows);
console.log('DEATHS', JSON.stringify(deaths));
console.log('ERRORS:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
await browser.close();
