import type { Settings } from '../core/types';

export interface GameOverInfo { distance: number; best: number; isRecord: boolean; biomeName: string }

/** Callbacks the UI fires; wired by the Game. */
export interface UIHandlers {
  onPlay(): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onMenu(): void;
  onSettingsChange(s: Settings): void;
  /** Skip the intro cinematic. */
  onSkipIntro(): void;
  /** Optional: every UI button press (wire to audio.play('click')). */
  onUiClick?(): void;
}

const FLAG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 21V3" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M7 4.2c3-1.6 5.2 1.6 8.6.2 1.2-.5 2.2-.4 3-.1v8.6c-.8-.3-1.8-.4-3 .1-3.4 1.4-5.6-1.8-8.6-.2z" fill="#ffb347" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** Format 1248 -> "1 248" (non-breaking space, French style). */
export function fmtM(n: number): string {
  return Math.floor(Math.max(0, n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const QUALITIES: Array<[Settings['quality'], string]> = [['auto', 'Auto'], ['low', 'Bas'], ['medium', 'Moyen'], ['high', 'Élevé']];

/**
 * DOM overlay inside #ui (UI agent). Built once; screens are toggled with CSS classes.
 */
export class UI {
  private root = document.getElementById('ui')!;
  private cur: Settings;
  private best = 0;
  private settingsFrom: 'menu' | 'pause' = 'menu';
  private introOn = false;

  private el!: {
    vig: HTMLElement; lines: HTMLCanvasElement; flash: HTMLElement;
    hud: HTMLElement; dist: HTMLElement; fps: HTMLElement; hint: HTMLElement; biome: HTMLElement;
    cine: HTMLElement; fade: HTMLElement;
    menu: HTMLElement; pause: HTMLElement; settings: HTMLElement; over: HTMLElement; best: HTMLElement;
  };
  private distShown = -1;
  private fxTarget = 0;
  private fxCur = 0;
  private fxRaf = 0;
  private fxLast = 0;
  private lineData: Array<{ a: number; p: number; v: number; l: number }> = [];
  private ctx: CanvasRenderingContext2D | null = null;
  private countRaf = 0;
  private hintTimer = 0;

  constructor(private h: UIHandlers, private getSettings: () => Settings) {
    this.cur = { ...getSettings() };
    this.build();
    window.addEventListener('resize', () => this.sizeCanvas());
    window.addEventListener('keydown', (e) => {
      if (this.introOn && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); this.skip(); }
    });
    for (let i = 0; i < 40; i++) this.lineData.push({ a: Math.random(), p: Math.random(), v: 0.8 + Math.random() * 1.2, l: 0.12 + Math.random() * 0.2 });
  }

  /* ---------------- construction ---------------- */

  private build(): void {
    const drips = [8, 24, 41, 63, 80].map((x, i) => `<i style="left:${x}%;animation-delay:${(i * 0.9).toFixed(1)}s;animation-duration:${(3.6 + i * 0.7).toFixed(1)}s"></i>`).join('');
    const touch = matchMedia('(pointer: coarse)').matches;
    this.root.innerHTML = `
      <div class="fx"><div class="vig"></div><canvas class="lines"></canvas><div class="flash"></div></div>
      <div class="hud">
        <button class="pause-btn" data-a="pause" aria-label="Pause"><i></i><i></i></button>
        <div class="hud-r"><div class="pill">${FLAG}<span class="dist">0&nbsp;m</span></div><div class="pill fps" hidden>60 FPS</div></div>
      </div>
      <div class="hint"><div class="pill">${touch
        ? '<span>Glisse ton doigt&nbsp;<span class="arrows">&larr;&nbsp;&rarr;</span>&nbsp;pour te déplacer</span>'
        : '<span><span class="arrows">&larr;&nbsp;&rarr;</span>&nbsp;ou Q / D, ou glisse la souris</span>'}</div></div>
      <div class="biome"><div class="kicker">Nouvelle zone</div><div class="rule"></div><div class="name"></div></div>
      <div class="scr" id="scr-menu">
        <div class="top">
          <h1 class="title"><span class="t1">Drain</span><span class="t2">Rifter<span class="drips">${drips}</span></span></h1>
          <p class="subtitle">Glisse &middot; Survis &middot; Descends</p>
        </div>
        <div class="bottom">
          <button class="btn primary" data-a="play">Jouer</button>
          <div class="best">Meilleur score&nbsp;: <b>0&nbsp;m</b></div>
          <button class="btn ghost" data-a="settings-menu">Paramètres</button>
        </div>
      </div>
      <div class="scr" id="scr-pause">
        <h2 class="h2">Pause</h2>
        <div class="stack">
          <button class="btn primary" data-a="resume" style="min-width:0;font-size:22px">Reprendre</button>
          <button class="btn" data-a="settings-pause">Paramètres</button>
          <button class="btn" data-a="menu">Menu</button>
        </div>
      </div>
      <div class="scr" id="scr-settings">
        <h2 class="h2">Paramètres</h2>
        <div class="panel">
          ${this.sliderRow('music', 'Musique')}
          ${this.sliderRow('sfx', 'Effets sonores')}
          ${this.sliderRow('sens', 'Sensibilité')}
          <div class="row"><div class="lab"><span>Qualité graphique</span></div>
            <div class="seg">${QUALITIES.map(([k, n]) => `<button data-q="${k}">${n}</button>`).join('')}</div></div>
          <div class="row inline"><span class="lab">Afficher les FPS</span><button class="sw" data-a="fps" role="switch" aria-label="Afficher les FPS"></button></div>
        </div>
        <div class="stack"><button class="btn" data-a="back">Retour</button></div>
      </div>
      <div class="scr" id="scr-over">
        <div class="card">
          <div class="lbl">Fin de course</div>
          <div class="big"><span class="num">0</span><small>m</small></div>
          <div class="badge" hidden>Nouveau record&nbsp;!</div>
          <div class="stats"><div><span class="lbl">Record</span><b class="o-best">0 m</b></div><div><span class="lbl">Zone</span><b class="o-biome">-</b></div></div>
        </div>
        <div class="stack"><button class="btn primary" data-a="again" style="min-width:0;font-size:22px">Rejouer</button><button class="btn" data-a="menu">Menu</button></div>
      </div>
      <div class="cine">
        <div class="bar top"></div><div class="bar bot"></div><div class="fade"></div>
        <button class="skip" data-a="skip">Passer &rsaquo;</button>
      </div>`;
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector(s) as T;
    this.el = {
      vig: q('.vig'), lines: q('.lines'), flash: q('.flash'),
      hud: q('.hud'), dist: q('.dist'), fps: q('.fps'), hint: q('.hint'), biome: q('.biome'),
      cine: q('.cine'), fade: q('.cine .fade'),
      menu: q('#scr-menu'), pause: q('#scr-pause'), settings: q('#scr-settings'), over: q('#scr-over'), best: q('#scr-menu .best b'),
    };
    this.ctx = this.el.lines.getContext('2d');
    this.sizeCanvas();

    // Button wiring (+ feedback sound). Pointer events never reach the game canvas: UI nodes are siblings of it.
    this.root.addEventListener('pointerdown', (e) => { if ((e.target as HTMLElement).closest('button,input')) e.stopPropagation(); });
    this.root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (!b) return;
      const a = b.dataset.a;
      if (b.dataset.q) { this.cur.quality = b.dataset.q as Settings['quality']; this.pushSettings(); this.syncSettings(); this.click(); return; }
      switch (a) {
        case 'play': this.click(); this.h.onPlay(); break;
        case 'pause': this.click(); this.h.onPause(); break;
        case 'resume': this.click(); this.h.onResume(); break;
        case 'again': this.click(); this.h.onRestart(); break;
        case 'menu': this.click(); this.h.onMenu(); break;
        case 'settings-menu': this.click(); this.openSettings('menu'); break;
        case 'settings-pause': this.click(); this.openSettings('pause'); break;
        case 'back': this.click(); this.setScreen(this.settingsFrom === 'pause' ? 'pause' : 'menu'); break;
        case 'fps': this.cur.showFps = !this.cur.showFps; this.pushSettings(); this.syncSettings(); this.click(); break;
        case 'skip': this.skip(); break;
      }
    });
    // Tapping anywhere on the cinematic skips it.
    this.el.cine.addEventListener('pointerdown', (e) => { if (!(e.target as HTMLElement).closest('button')) this.skip(); });
    const bindSlider = (id: string, apply: (v: number) => void) => {
      const inp = this.root.querySelector(`#sl-${id}`) as HTMLInputElement;
      inp.addEventListener('input', () => { apply(Number(inp.value)); this.pushSettings(); this.syncSettings(); });
      inp.addEventListener('change', () => this.click());
    };
    bindSlider('music', (v) => { this.cur.musicVolume = v / 100; });
    bindSlider('sfx', (v) => { this.cur.sfxVolume = v / 100; });
    bindSlider('sens', (v) => { this.cur.sensitivity = v / 100; });
    this.setScreen(null);
  }

  private sliderRow(id: string, label: string): string {
    const [min, max] = id === 'sens' ? [50, 200] : [0, 100];
    return `<div class="row"><div class="lab"><span>${label}</span><b id="v-${id}"></b></div><input id="sl-${id}" type="range" min="${min}" max="${max}" step="${id === 'sens' ? 5 : 1}" aria-label="${label}"></div>`;
  }

  private click(): void { this.h.onUiClick?.(); }

  private pushSettings(): void { this.h.onSettingsChange({ ...this.cur }); }

  private syncSettings(): void {
    const c = this.cur;
    const set = (id: string, v: number, txt: string, min: number, max: number) => {
      const inp = this.root.querySelector(`#sl-${id}`) as HTMLInputElement;
      inp.value = String(Math.round(v));
      inp.style.setProperty('--p', `${((v - min) / (max - min)) * 100}%`);
      (this.root.querySelector(`#v-${id}`) as HTMLElement).textContent = txt;
    };
    set('music', c.musicVolume * 100, `${Math.round(c.musicVolume * 100)} %`, 0, 100);
    set('sfx', c.sfxVolume * 100, `${Math.round(c.sfxVolume * 100)} %`, 0, 100);
    set('sens', c.sensitivity * 100, `${c.sensitivity.toFixed(2).replace(/0$/, '').replace('.', ',')}×`, 50, 200);
    this.root.querySelectorAll<HTMLElement>('.seg button').forEach((b) => b.classList.toggle('sel', b.dataset.q === c.quality));
    const sw = this.root.querySelector('.sw') as HTMLElement;
    sw.classList.toggle('on', c.showFps);
    sw.setAttribute('aria-checked', String(c.showFps));
    this.el.fps.hidden = !c.showFps;
  }

  private openSettings(from: 'menu' | 'pause'): void {
    this.settingsFrom = from;
    this.cur = { ...this.getSettings() };
    this.syncSettings();
    this.setScreen('settings');
  }

  private setScreen(name: 'menu' | 'pause' | 'settings' | 'over' | null): void {
    this.el.menu.classList.toggle('on', name === 'menu');
    this.el.pause.classList.toggle('on', name === 'pause');
    this.el.settings.classList.toggle('on', name === 'settings');
    this.el.over.classList.toggle('on', name === 'over');
  }

  private resetOverlays(): void {
    this.introOn = false;
    window.clearTimeout(this.hintTimer);
    this.el.hint.classList.remove('show');
    this.el.biome.classList.remove('show');
    this.el.hud.classList.remove('on');
    this.el.cine.classList.remove('on');
    this.el.cine.classList.add('out');
    this.setSpeedFx(0);
  }

  private skip(): void {
    if (!this.introOn) return;
    this.introOn = false; // only once
    this.click();
    this.blackFlash();
    this.h.onSkipIntro();
  }

  /** Cut to black then fade out (used on skip so the hand-off is not a hard pop). */
  private blackFlash(): void {
    this.el.fade.animate([{ opacity: 1 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' });
  }

  /* ---------------- public API (called by Game) ---------------- */

  showMenu(best: number): void {
    this.best = best;
    this.resetOverlays();
    window.cancelAnimationFrame(this.countRaf);
    this.el.best.textContent = `${fmtM(best)} m`;
    this.setScreen('menu');
  }

  /** Letterbox bars + fade from black + skip button. */
  showIntro(): void {
    this.resetOverlays();
    this.setScreen(null);
    this.introOn = true;
    this.el.cine.classList.remove('out');
    this.el.cine.classList.add('on');
    this.el.fade.animate([{ opacity: 1 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 1500, easing: 'ease-out' });
    const sk = this.el.cine.querySelector('.skip') as HTMLElement;
    sk.style.animation = 'none'; void sk.offsetWidth; sk.style.animation = '';
  }

  showHud(): void {
    // Leaves intro/pause/settings: retract the bars smoothly.
    const wasIntro = this.el.cine.classList.contains('on');
    this.introOn = false;
    this.setScreen(null);
    this.cur = { ...this.getSettings() };
    this.syncSettings();
    this.el.hud.classList.add('on');
    if (wasIntro) { this.el.cine.classList.add('out'); window.setTimeout(() => this.el.cine.classList.remove('on'), 650); }
    this.distShown = -1;
  }

  updateHud(distance: number, _speed: number, fps: number): void {
    const d = Math.floor(distance);
    if (d !== this.distShown) { this.distShown = d; this.el.dist.textContent = `${fmtM(d)} m`; }
    if (this.cur.showFps) {
      const f = Math.round(fps);
      const t = `${f} FPS`;
      if (this.el.fps.textContent !== t) this.el.fps.textContent = t;
    }
  }

  showControlsHint(): void {
    const h = this.el.hint;
    window.clearTimeout(this.hintTimer);
    h.classList.remove('show'); void h.offsetWidth; h.classList.add('show');
    this.hintTimer = window.setTimeout(() => h.classList.remove('show'), 3500);
  }

  showBiomeTitle(name: string): void {
    const b = this.el.biome;
    (b.querySelector('.name') as HTMLElement).textContent = name;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  /** Visual speed effect intensity 0..1 (vignette + speed lines). */
  setSpeedFx(k: number): void {
    this.fxTarget = Math.max(0, Math.min(1, k));
    if (!this.fxRaf && (this.fxTarget > 0.01 || this.fxCur > 0.01)) {
      this.fxLast = performance.now();
      this.fxRaf = requestAnimationFrame(this.fxLoop);
    }
  }

  private sizeCanvas(): void {
    const c = this.el?.lines;
    if (!c) return;
    c.width = Math.max(2, Math.round(window.innerWidth / 3));
    c.height = Math.max(2, Math.round(window.innerHeight / 3));
  }

  private fxLoop = (now: number): void => {
    const dt = Math.min(0.05, (now - this.fxLast) / 1000);
    this.fxLast = now;
    this.fxCur += (this.fxTarget - this.fxCur) * Math.min(1, dt * 6);
    const k = this.fxCur;
    if (k < 0.01 && this.fxTarget < 0.01) {
      this.fxCur = 0;
      this.el.vig.style.opacity = '0';
      this.el.lines.style.opacity = '0';
      this.ctx?.clearRect(0, 0, this.el.lines.width, this.el.lines.height);
      this.fxRaf = 0;
      return;
    }
    this.el.vig.style.opacity = (0.15 + 0.85 * k).toFixed(2);
    this.drawLines(dt, k);
    this.fxRaf = requestAnimationFrame(this.fxLoop);
  };

  private drawLines(dt: number, k: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const c = this.el.lines;
    const w = c.width, h = c.height;
    ctx.clearRect(0, 0, w, h);
    c.style.opacity = k > 0.12 ? '1' : '0';
    if (k <= 0.12) return;
    const cx = w / 2, cy = h * 0.46;
    const R = Math.hypot(w, h) * 0.55;
    const n = Math.floor(10 + 30 * k);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const L = this.lineData[i];
      L.p += dt * L.v * (0.6 + 1.6 * k);
      if (L.p > 1) { L.p -= 1; L.a = Math.random(); }
      // Angle biased to the left/right edges (avoid the very top/bottom centre).
      const base = (((L.a * 2) % 1) - 0.5) * 0.95 * Math.PI;
      const ang = L.a < 0.5 ? base : Math.PI - base;
      const r0 = R * (0.5 + 0.5 * L.p * L.p);
      const r1 = r0 + R * L.l * (0.5 + L.p);
      const a = Math.sin(L.p * Math.PI) * 0.5 * k;
      ctx.strokeStyle = `rgba(255,236,200,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0 * 1.15);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1 * 1.15);
      ctx.stroke();
    }
  }

  showPause(): void {
    this.el.hud.classList.remove('on');
    this.el.hint.classList.remove('show');
    this.el.biome.classList.remove('show');
    this.setSpeedFx(0);
    this.setScreen('pause');
  }

  showGameOver(info: GameOverInfo): void {
    this.resetOverlays();
    const o = this.el.over;
    (o.querySelector('.o-best') as HTMLElement).textContent = `${fmtM(info.best)} m`;
    (o.querySelector('.o-biome') as HTMLElement).textContent = info.biomeName;
    (o.querySelector('.badge') as HTMLElement).hidden = !info.isRecord;
    // Re-trigger the badge pop animation.
    const bd = o.querySelector('.badge') as HTMLElement;
    bd.style.animation = 'none'; void bd.offsetWidth; bd.style.animation = '';
    const num = o.querySelector('.num') as HTMLElement;
    const target = Math.floor(info.distance);
    window.cancelAnimationFrame(this.countRaf);
    const t0 = performance.now();
    const dur = Math.min(1400, 500 + target * 0.6);
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      num.textContent = fmtM(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) this.countRaf = requestAnimationFrame(step);
    };
    num.textContent = '0';
    this.countRaf = requestAnimationFrame(step);
    this.setScreen('over');
  }

  /** Flash on crash, etc. */
  flash(color: string): void {
    const f = this.el.flash;
    f.style.background = color;
    f.animate([{ opacity: 0.85 }, { opacity: 0 }], { duration: 520, easing: 'ease-out' });
  }
}
