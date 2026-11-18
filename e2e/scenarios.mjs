#!/usr/bin/env node
// Browser regression scenarios for Drain Rifter.
// Usage: node e2e/scenarios.mjs [baseUrl=http://localhost:5173/] [ids e.g. 1,3,5]
// Start the dev server first: npx vite --port 5189
// Screenshots: e2e/out/scn-*.png. Exit code 0 when every check passes.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out');
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'http://localhost:5173/';
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',').map((s) => s.trim())) : null;
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
const SETTINGS_KEY = 'drainrifter.settings.v1';
const BEST_KEY = 'drainrifter.best.v1';
const PHONE = { width: 390, height: 844 };

const results = [];
const errs = [];
let current = null; // last opened page, for error screenshots

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (scn, name, ok, detail = '') => results.push({ scn, name, ok: !!ok, detail: String(detail) });
const norm = (s) => String(s).replace(/[\s  ]/g, '');
const fmt = (n) => String(Math.floor(Math.max(0, n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const state = (page) => page.evaluate(() => window.__game.state);
const dbg = (page) => page.evaluate(() => window.__game.debugState());
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `scn-${name}.png`) });
const phone = (vp = PHONE) => ({ ...devices['Pixel 5'], viewport: vp, deviceScaleFactor: 1 });

async function waitState(page, st, timeout = 15000) {
  await page.waitForFunction((x) => window.__game && window.__game.state === x, st, { timeout, polling: 100 });
}
async function waitMenu(page) {
  await waitState(page, 'menu', 20000);
  await page.locator('#scr-menu.on').waitFor({ timeout: 10000 });
  await sleep(500);
}
/** Click Jouer for real, then skip the intro with the real Passer button if it shows, until 'playing'. */
async function startRunReal(page) {
  await page.locator('#scr-menu button[data-a="play"]').click();
  const deadline = Date.now() + 25000;
  let sawIntro = false;
  while (Date.now() < deadline) {
    const st = await state(page);
    if (st === 'playing') break;
    if (st === 'intro') {
      sawIntro = true;
      const skip = page.locator('#ui .cine.on button[data-a="skip"]');
      if (await skip.isVisible().catch(() => false)) await skip.click({ timeout: 2000 }).catch(() => {});
    }
    await sleep(100);
  }
  await waitState(page, 'playing', 3000);
  return { sawIntro };
}
/** Real CDP touch drag on the game canvas (horizontal only). */
async function touchDrag(cdp, x0, y0, dx, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 }] });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** Buttons that are on an active screen must lie inside the viewport; also reports horizontal overflow. */
function layoutCheck(page) {
  return page.evaluate(() => {
    const vw = innerWidth, vh = innerHeight;
    const active = (b) => {
      const scr = b.closest('.scr'), hud = b.closest('.hud'), cine = b.closest('.cine');
      if (scr) return scr.classList.contains('on');
      if (hud) return hud.classList.contains('on');
      if (cine) return cine.classList.contains('on');
      return false;
    };
    const btns = [...document.querySelectorAll('#ui button')].filter((b) => active(b) && getComputedStyle(b).visibility !== 'hidden' && b.getBoundingClientRect().width > 0);
    const offenders = [];
    for (const b of btns) {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) {
        const label = (b.textContent || '').trim() || b.dataset.a || b.dataset.q || b.className;
        offenders.push(`${label} @${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return { scrollW: document.documentElement.scrollWidth, innerW: vw, buttons: btns.length, offenders, state: window.__game.state, menuOn: document.querySelector('#scr-menu').classList.contains('on'), hudOn: document.querySelector('#ui .hud').classList.contains('on') };
  });
}

function track(page, label) {
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/GL Driver/i.test(m.text())) return;
    if (/favicon/i.test(m.location()?.url || '')) return;
    errs.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errs.push(`[${label}] pageerror: ${e.message}`));
}
async function openPage(browser, label, opts) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  track(page, label);
  current = page;
  return { ctx, page, cdp: null };
}

async function scenario(id, title, fn) {
  if (ONLY && !ONLY.has(id)) return;
  const t0 = Date.now();
  console.log(`\n== Scenario ${id}: ${title}`);
  // The dev server hot-reloads the page whenever a src file changes (other agents edit src live),
  // which destroys the page mid-scenario. Such an attempt is discarded and re-run once.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const mark = results.length;
    try {
      await fn();
      break;
    } catch (e) {
      results.length = mark;
      const msg = String(e.message).split('\n')[0];
      if (attempt === 1 && /Execution context was destroyed|navigation|Target closed/i.test(msg)) {
        console.log(`   attempt 1 lost its page to a reload (${msg}); retrying`);
        continue;
      }
      check(id, 'scenario ran to completion', false, msg);
      if (current) await shot(current, `${id}-error`).catch(() => {});
      break;
    }
  }
  console.log(`   done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

const browser = await chromium.launch(LAUNCH);
const contexts = [];
const track_ = (c) => { contexts.push(c.ctx); return c; };
let runCtx = null;       // scenario 3 keeps its context alive for scenario 4
let firstDistance = null; // distance of the run that ends in scenario 3

/* ---------------- 1. Load ---------------- */
await scenario('1', 'Load', async () => {
  const s = track_(await openPage(browser, 's1', phone()));
  const { page } = s;
  const start = errs.length;
  await page.goto(BASE, { waitUntil: 'load' });
  await waitMenu(page);
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#game canvas');
    return !!c && c.width > 0 && c.height > 0;
  });
  check('1', 'WebGL canvas present and sized', canvas);
  check('1', 'menu screen visible', await page.locator('#scr-menu.on').isVisible());
  check('1', 'Jouer button visible', await page.locator('#scr-menu button[data-a="play"]').isVisible());
  const settingsTxt = (await page.locator('#scr-menu button[data-a="settings-menu"]').textContent()) || '';
  check('1', 'Paramètres button visible', settingsTxt.includes('Paramètres'), settingsTxt);
  const best = (await page.locator('#scr-menu .best').textContent()) || '';
  check('1', 'best score shown in menu', /Meilleur score/.test(best) && /\d/.test(best), best.trim());
  check('1', 'no page or console errors on load', errs.length === start, errs.slice(start).join(' | '));
  await shot(page, '01-menu');
  await s.ctx.close();
});

/* ---------------- 2. Settings ---------------- */
await scenario('2', 'Settings: change, persist across reload, FPS pill in HUD', async () => {
  const s = track_(await openPage(browser, 's2', phone()));
  const { page } = s;
  await page.goto(BASE, { waitUntil: 'load' });
  await waitMenu(page);
  await page.locator('#scr-menu button[data-a="settings-menu"]').click();
  await page.locator('#scr-settings.on').waitFor();
  await sleep(400);
  await shot(page, '02-settings-default');

  // Music volume: real keyboard steps on the focused range input (fires real input events).
  const music = page.locator('#sl-music');
  await music.press('Home');
  for (let i = 0; i < 40; i++) await music.press('ArrowRight');
  check('2', 'music slider label reads 40 %', (await page.locator('#v-music').textContent()) === '40 %', await page.locator('#v-music').textContent());
  // Sensitivity: 100 -> 120 (step 5)
  const sens = page.locator('#sl-sens');
  for (let i = 0; i < 4; i++) await sens.press('ArrowRight');
  const sensTxt = (await page.locator('#v-sens').textContent()) || '';
  check('2', 'sensitivity label reads 1,2×', sensTxt.includes('1,2'), sensTxt);
  // Quality: Bas
  await page.locator('#scr-settings .seg button[data-q="low"]').click();
  check('2', 'quality segment "Bas" selected', await page.locator('#scr-settings .seg button[data-q="low"]').evaluate((b) => b.classList.contains('sel')));
  // FPS switch on
  await page.locator('#scr-settings button[data-a="fps"]').click();
  check('2', 'FPS switch on', (await page.locator('#scr-settings .sw').getAttribute('aria-checked')) === 'true');
  await shot(page, '02-settings-changed');

  const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), SETTINGS_KEY);
  let st = await stored();
  check('2', 'settings written to localStorage', st && st.musicVolume === 0.4 && st.sensitivity === 1.2 && st.quality === 'low' && st.showFps === true, JSON.stringify(st));

  await page.locator('#scr-settings button[data-a="back"]').click();
  check('2', 'Retour returns to menu', await page.locator('#scr-menu.on').isVisible());

  await page.reload({ waitUntil: 'load' });
  await waitMenu(page);
  st = await stored();
  check('2', 'settings still in localStorage after reload', st && st.musicVolume === 0.4 && st.sensitivity === 1.2 && st.quality === 'low' && st.showFps === true, JSON.stringify(st));
  await page.locator('#scr-menu button[data-a="settings-menu"]').click();
  await page.locator('#scr-settings.on').waitFor();
  await sleep(400);
  check('2', 'reopened settings show persisted music 40', (await page.locator('#sl-music').inputValue()) === '40');
  check('2', 'reopened settings show persisted sensitivity 120', (await page.locator('#sl-sens').inputValue()) === '120');
  check('2', 'reopened settings show persisted quality Bas', await page.locator('#scr-settings .seg button[data-q="low"]').evaluate((b) => b.classList.contains('sel')));
  check('2', 'reopened settings show FPS switch on', (await page.locator('#scr-settings .sw').getAttribute('aria-checked')) === 'true');
  await page.locator('#scr-settings button[data-a="back"]').click();

  await startRunReal(page);
  await sleep(1500);
  const fps = page.locator('#ui .pill.fps');
  check('2', 'FPS pill visible during play', await fps.isVisible());
  const fpsTxt = (await fps.textContent()) || '';
  check('2', 'FPS pill shows a number', /^\d+ FPS$/.test(fpsTxt.trim()), fpsTxt);
  await shot(page, '02-play-fps');
  await s.ctx.close();
});

/* ---------------- 3. Full run ---------------- */
await scenario('3', 'Full run: intro, touch steering, natural crash, game over, restart, pause, menu', async () => {
  const s = track_(await openPage(browser, 's3', phone()));
  runCtx = s;
  const { page } = s;
  const start = errs.length;
  s.cdp = await s.ctx.newCDPSession(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await waitMenu(page);
  const { sawIntro } = await startRunReal(page);
  check('3', 'Jouer enters intro state first', sawIntro);
  check('3', 'playing state reached (intro skipped)', (await state(page)) === 'playing');
  await sleep(800);
  check('3', 'HUD on and pause button visible', (await page.locator('#ui .hud.on').count()) === 1 && (await page.locator('#ui .pause-btn').isVisible()));
  await shot(page, '03-hud');

  // Touch steering through real CDP touch events.
  const vp = page.viewportSize();
  const cx = vp.width / 2, cy = vp.height * 0.6;
  const u0 = (await dbg(page)).u;
  await touchDrag(s.cdp, cx - 60, cy, 150);
  await sleep(900);
  const u1 = (await dbg(page)).u;
  check('3', 'touch drag right moves u right', u1 - u0 > 0.3, `u ${u0.toFixed(2)} -> ${u1.toFixed(2)}`);
  await touchDrag(s.cdp, cx + 55, cy, -200);
  await sleep(900);
  const u2 = (await dbg(page)).u;
  check('3', 'touch drag left moves u left', u2 - u1 < -0.3, `u ${u1.toFixed(2)} -> ${u2.toFixed(2)}`);

  // Let it crash on its own (no invincible flag, no input).
  const tc = Date.now();
  let crashed = true;
  try { await page.waitForFunction(() => window.__game.state === 'gameover', null, { timeout: 240000, polling: 200 }); } catch { crashed = false; }
  check('3', 'run ends in gameover on its own', crashed, `after ${((Date.now() - tc) / 1000).toFixed(0)} s`);
  if (!crashed) throw new Error('no natural crash within 240 s');
  const d = (await dbg(page)).s;
  firstDistance = d;
  await sleep(1800);
  await page.locator('#scr-over.on').waitFor();
  check('3', 'game over: distance counter ends at floor(distance)', norm(await page.locator('#scr-over .num').textContent()) === String(Math.floor(d)), `${(await page.locator('#scr-over .num').textContent())} vs ${d.toFixed(1)}`);
  const best1 = Number(await page.evaluate((k) => localStorage.getItem(k), BEST_KEY));
  check('3', 'game over: record shows best score', norm(await page.locator('#scr-over .o-best').textContent()) === norm(`${fmt(best1)} m`), await page.locator('#scr-over .o-best').textContent());
  check('3', 'game over: first run is a record (badge shown)', await page.locator('#scr-over .badge').isVisible());
  check('3', 'game over: biome name shown', ((await page.locator('#scr-over .o-biome').textContent()) || '').trim().length > 0);
  check('3', 'game over: stored best equals floor(distance)', best1 === Math.floor(d), `best=${best1} d=${d.toFixed(2)}`);
  await shot(page, '03-gameover');

  // Rejouer (real click)
  await page.locator('#scr-over button[data-a="again"]').click();
  await waitState(page, 'playing', 8000);
  const sRestart = (await dbg(page)).s;
  check('3', 'Rejouer restarts run with s near 0', sRestart < 20, `s=${sRestart.toFixed(2)}`);

  // Pause / resume / menu
  await page.locator('#ui .pause-btn').click();
  await waitState(page, 'paused', 3000);
  check('3', 'pause shows pause screen', await page.locator('#scr-pause.on').isVisible());
  const p0 = (await dbg(page)).s;
  await sleep(2000);
  const p1 = (await dbg(page)).s;
  check('3', 'paused: s does not advance', p0 === p1, `${p0.toFixed(3)} -> ${p1.toFixed(3)}`);
  await page.locator('#scr-pause button[data-a="resume"]').click();
  await waitState(page, 'playing', 3000);
  await sleep(1000);
  const r1 = (await dbg(page)).s;
  check('3', 'resume: s advances again', r1 > p1, `${p1.toFixed(2)} -> ${r1.toFixed(2)}`);
  await page.locator('#ui .pause-btn').click();
  await waitState(page, 'paused', 3000);
  await page.locator('#scr-pause button[data-a="menu"]').click();
  await waitState(page, 'menu', 5000);
  await page.locator('#scr-menu.on').waitFor();
  check('3', 'pause -> Menu returns to menu', await page.locator('#scr-menu.on').isVisible());
  check('3', 'no page or console errors in run', errs.length === start, errs.slice(start).join(' | '));
  await shot(page, '03-menu-after-run');
});

/* ---------------- 4. Record persistence ---------------- */
await scenario('4', 'Record: best equals max distance and persists after reload', async () => {
  if (!runCtx || firstDistance === null) throw new Error('scenario 3 did not complete');
  const { page } = runCtx;
  const best1 = Number(await page.evaluate((k) => localStorage.getItem(k), BEST_KEY));
  check('4', 'best after run 1 = floor(run 1 distance)', best1 === Math.floor(firstDistance), `${best1} vs ${Math.floor(firstDistance)}`);
  // Second run from the menu; the record must become the max of the two runs.
  await startRunReal(page);
  const tc = Date.now();
  let crashed = true;
  try { await page.waitForFunction(() => window.__game.state === 'gameover', null, { timeout: 240000, polling: 200 }); } catch { crashed = false; }
  check('4', 'second run ends in gameover', crashed, `after ${((Date.now() - tc) / 1000).toFixed(0)} s`);
  if (!crashed) throw new Error('second run did not crash');
  const d2 = (await dbg(page)).s;
  await sleep(1800);
  const expected = Math.max(best1, Math.floor(d2));
  const best2 = Number(await page.evaluate((k) => localStorage.getItem(k), BEST_KEY));
  check('4', 'best = max(run1, run2) after run 2', best2 === expected, `best=${best2} run1=${Math.floor(firstDistance)} run2=${d2.toFixed(1)}`);
  check('4', 'badge matches whether run 2 beat the record', (await page.locator('#scr-over .badge').isVisible()) === (Math.floor(d2) > best1), `run2=${Math.floor(d2)} prev=${best1}`);
  await shot(page, '04-gameover-run2');
  await page.locator('#scr-over button[data-a="menu"]').click();
  await page.locator('#scr-menu.on').waitFor();
  await sleep(400);
  await page.reload({ waitUntil: 'load' });
  await waitMenu(page);
  const menuBest = norm(await page.locator('#scr-menu .best b').textContent());
  check('4', 'menu best after reload equals stored best', menuBest === norm(`${fmt(best2)} m`), `${menuBest} vs ${fmt(best2)} m`);
  await shot(page, '04-menu-after-reload');
  await runCtx.ctx.close();
  runCtx = null;
});

/* ---------------- 5. Keyboard, desktop ---------------- */
await scenario('5', 'Keyboard steering and Escape pause (1280x720 desktop)', async () => {
  const s = track_(await openPage(browser, 's5', { viewport: { width: 1280, height: 720 }, hasTouch: false, isMobile: false }));
  const { page } = s;
  const start = errs.length;
  await page.goto(BASE, { waitUntil: 'load' });
  await waitMenu(page);
  await startRunReal(page);
  // Invincible only so an obstacle hit cannot end the keyboard checks early; steering is unaffected.
  await page.evaluate(() => { window.__game.invincible = true; });
  await sleep(700);
  const u0 = (await dbg(page)).u;
  await page.keyboard.down('ArrowLeft');
  await sleep(700);
  await page.keyboard.up('ArrowLeft');
  await sleep(700);
  const u1 = (await dbg(page)).u;
  check('5', 'ArrowLeft moves u left', u1 < u0 - 0.3, `u ${u0.toFixed(2)} -> ${u1.toFixed(2)}`);
  await page.keyboard.down('ArrowRight');
  await sleep(900);
  await page.keyboard.up('ArrowRight');
  await sleep(700);
  const u2 = (await dbg(page)).u;
  check('5', 'ArrowRight moves u right', u2 > u1 + 0.3, `u ${u1.toFixed(2)} -> ${u2.toFixed(2)}`);
  await page.keyboard.down('KeyA');
  await sleep(500);
  await page.keyboard.up('KeyA');
  await sleep(700);
  const u3 = (await dbg(page)).u;
  check('5', 'KeyA moves u left', u3 < u2 - 0.2, `u ${u2.toFixed(2)} -> ${u3.toFixed(2)}`);
  await page.keyboard.press('Escape');
  await waitState(page, 'paused', 3000);
  check('5', 'Escape pauses', await page.locator('#scr-pause.on').isVisible());
  const p0 = (await dbg(page)).s;
  await sleep(1200);
  const p1 = (await dbg(page)).s;
  check('5', 'paused via Escape: s frozen', p0 === p1, `${p0.toFixed(3)} -> ${p1.toFixed(3)}`);
  await shot(page, '05-escape-pause');
  await page.keyboard.press('Escape');
  await waitState(page, 'playing', 3000);
  check('5', 'Escape again resumes', (await state(page)) === 'playing');
  check('5', 'no page or console errors in keyboard run', errs.length === start, errs.slice(start).join(' | '));
  await s.ctx.close();
});

/* ---------------- 6. Resolutions ---------------- */
const VIEWPORTS = [
  { name: '360x640', w: 360, h: 640 },
  { name: '390x844', w: 390, h: 844 },
  { name: '430x932', w: 430, h: 932 },
  { name: '768x1024-tablet', w: 768, h: 1024 },
  { name: '1280x720-landscape', w: 1280, h: 720 },
];
await scenario('6', 'Resolutions: menu, HUD, settings, game over; overflow and button bounds', async () => {
  for (const v of VIEWPORTS) {
    const phoneLike = v.w < 500;
    const s = track_(await openPage(browser, `s6-${v.name}`, { viewport: { width: v.w, height: v.h }, hasTouch: v.w <= 1024, isMobile: phoneLike }));
    const { page } = s;
    const label = (x) => `${v.name} ${x}`;
    const start = errs.length;
    await page.goto(BASE, { waitUntil: 'load' });
    await waitMenu(page);
    let L = await layoutCheck(page);
    check('6', label('menu: no horizontal overflow'), L.scrollW <= L.innerW, `scrollWidth ${L.scrollW} vs innerWidth ${L.innerW}`);
    check('6', label('menu: buttons inside viewport'), L.buttons > 0 && L.offenders.length === 0, `${L.buttons} button(s) ${L.offenders.join('; ')}`);
    await shot(page, `06-${v.name}-menu`);

    await page.locator('#scr-menu button[data-a="settings-menu"]').click();
    await page.locator('#scr-settings.on').waitFor();
    await sleep(500);
    L = await layoutCheck(page);
    check('6', label('settings: no horizontal overflow'), L.scrollW <= L.innerW, `scrollWidth ${L.scrollW} vs innerWidth ${L.innerW}`);
    check('6', label('settings: buttons inside viewport'), L.buttons > 0 && L.offenders.length === 0, `${L.buttons} button(s) ${L.offenders.join('; ')}`);
    await shot(page, `06-${v.name}-settings`);
    await page.locator('#scr-settings button[data-a="back"]').click();
    await page.locator('#scr-menu.on').waitFor();

    await startRunReal(page);
    await sleep(1500);
    L = await layoutCheck(page);
    check('6', label('HUD active (playing, HUD on, menu off)'), L.state === 'playing' && L.hudOn && !L.menuOn, `state=${L.state} hud=${L.hudOn} menu=${L.menuOn}`);
    check('6', label('HUD: no horizontal overflow'), L.scrollW <= L.innerW, `scrollWidth ${L.scrollW} vs innerWidth ${L.innerW}`);
    check('6', label('HUD: pause button inside viewport'), L.buttons > 0 && L.offenders.length === 0, `${L.buttons} button(s) ${L.offenders.join('; ')}`);
    await shot(page, `06-${v.name}-hud`);

    // Force a death via the game's own die() path to reach the game-over screen quickly.
    await page.evaluate(() => window.__game.die());
    await waitState(page, 'gameover', 15000);
    await sleep(1800);
    L = await layoutCheck(page);
    check('6', label('game over: no horizontal overflow'), L.scrollW <= L.innerW, `scrollWidth ${L.scrollW} vs innerWidth ${L.innerW}`);
    check('6', label('game over: buttons inside viewport'), L.buttons > 0 && L.offenders.length === 0, `${L.buttons} button(s) ${L.offenders.join('; ')}`);
    await shot(page, `06-${v.name}-over`);
    check('6', label('no page or console errors'), errs.length === start, errs.slice(start).join(' | '));
    await s.ctx.close();
  }
});

/* ---------------- 7. Long session ---------------- */
await scenario('7', 'Long session: 90 s real time, then teleports to 20 km', async () => {
  const s = track_(await openPage(browser, 's7', phone()));
  const { page } = s;
  const start = errs.length;
  await page.goto(BASE, { waitUntil: 'load' });
  await waitMenu(page);
  await startRunReal(page);
  await page.evaluate(() => { window.__game.invincible = true; });
  const first = await dbg(page);
  let nonPlaying = null;
  let maxGeo = 0, maxTex = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    await sleep(5000);
    const d = await dbg(page);
    if (d.state !== 'playing' && !nonPlaying) nonPlaying = d.state;
    maxGeo = Math.max(maxGeo, d.geometries);
    maxTex = Math.max(maxTex, d.textures);
  }
  const at90 = await dbg(page);
  check('7', '90 s real time: state stays playing', nonPlaying === null, nonPlaying ? `left playing: ${nonPlaying}` : `fps ${at90.fps.toFixed(0)}`);
  check('7', '90 s real time: s increases', at90.s > first.s + 10, `${first.s.toFixed(1)} -> ${at90.s.toFixed(1)}`);
  check('7', '90 s real time: geometries/textures < 400', maxGeo < 400 && maxTex < 400, `max geo ${maxGeo}, tex ${maxTex}`);
  await shot(page, '07-after-90s');

  for (const T of [1000, 3000, 6000, 10000, 20000]) {
    await page.evaluate((t) => window.__game.debugTeleport(t), T);
    await sleep(3000);
    const a = await dbg(page);
    maxGeo = Math.max(maxGeo, a.geometries);
    maxTex = Math.max(maxTex, a.textures);
    check('7', `teleport ${T}: state playing`, a.state === 'playing', a.state);
    check('7', `teleport ${T}: s at or past target`, a.s >= T, `s=${a.s.toFixed(1)}`);
    await sleep(3000);
    const b = await dbg(page);
    maxGeo = Math.max(maxGeo, b.geometries);
    maxTex = Math.max(maxTex, b.textures);
    check('7', `teleport ${T}: s keeps increasing`, b.s > a.s && b.state === 'playing', `${a.s.toFixed(1)} -> ${b.s.toFixed(1)}`);
    check('7', `teleport ${T}: geometries/textures < 400`, b.geometries < 400 && b.textures < 400, `geo ${b.geometries}, tex ${b.textures}`);
    if (T === 20000) await shot(page, '07-20km');
  }
  check('7', 'max geometries and textures over session < 400', maxGeo < 400 && maxTex < 400, `geo ${maxGeo}, tex ${maxTex}`);
  check('7', 'no page or console errors in long session', errs.length === start, errs.slice(start).join(' | '));
  await s.ctx.close();
});

await browser.close();

/* ---------------- report ---------------- */
check('all', 'no page or console errors across all scenarios', errs.length === 0, errs.slice(0, 5).join(' | '));
const rows = results.map((r) => ({ res: r.ok ? 'PASS' : 'FAIL', scn: r.scn, name: r.name, detail: r.detail }));
const wName = Math.max(10, ...rows.map((r) => r.name.length));
const wDet = Math.min(90, Math.max(6, ...rows.map((r) => r.detail.length)));
const line = `+------+------+-${'-'.repeat(wName)}-+-${'-'.repeat(wDet)}-+`;
console.log(`\nBase URL: ${BASE}\n${line}\n| Res  | Scn  | ${'Check'.padEnd(wName)} | ${'Detail'.padEnd(wDet)} |\n${line}`);
for (const r of rows) {
  const det = r.detail.length > wDet ? r.detail.slice(0, wDet - 1) + '…' : r.detail;
  console.log(`| ${r.res} | ${r.scn.padEnd(4)} | ${r.name.padEnd(wName)} | ${det.padEnd(wDet)} |`);
}
console.log(line);
const pass = rows.filter((r) => r.res === 'PASS').length;
console.log(`${pass}/${rows.length} checks passed`);
if (errs.length) console.log('Errors collected:\n  ' + errs.join('\n  '));
process.exitCode = pass === rows.length ? 0 : 1;
