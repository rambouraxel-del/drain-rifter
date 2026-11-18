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
}

/**
 * CONTRACT (UI agent owns src/ui/*): DOM overlay inside #ui. Placeholder implementation.
 */
export class UI {
  private root = document.getElementById('ui')!;
  private hudDist?: HTMLElement;

  constructor(private h: UIHandlers, private getSettings: () => Settings) {}

  private screen(html: string): HTMLElement {
    this.root.innerHTML = `<div class="screen">${html}</div>`;
    return this.root.firstElementChild as HTMLElement;
  }

  showMenu(best: number): void {
    const el = this.screen(`<h1>DRAIN RIFTER</h1><div>Record : ${Math.floor(best)} m</div><button data-a="play">Jouer</button>`);
    el.querySelector('[data-a=play]')!.addEventListener('click', () => this.h.onPlay());
  }
  showIntro(): void { this.root.innerHTML = ''; }
  showHud(): void {
    this.root.innerHTML = `<div class="hud"><button data-a="pause">II</button><span class="dist">0 m</span></div>`;
    this.hudDist = this.root.querySelector('.dist') as HTMLElement;
    this.root.querySelector('[data-a=pause]')!.addEventListener('click', () => this.h.onPause());
  }
  updateHud(distance: number, _speed: number, _fps: number): void { if (this.hudDist) this.hudDist.textContent = `${Math.floor(distance)} m`; }
  showControlsHint(): void {}
  showBiomeTitle(_name: string): void {}
  /** Visual speed effect intensity 0..1 (speed lines / vignette). */
  setSpeedFx(_k: number): void {}
  showPause(): void {
    const el = this.screen(`<h2>Pause</h2><button data-a="resume">Reprendre</button><button data-a="menu">Menu</button>`);
    el.querySelector('[data-a=resume]')!.addEventListener('click', () => this.h.onResume());
    el.querySelector('[data-a=menu]')!.addEventListener('click', () => this.h.onMenu());
  }
  showGameOver(info: GameOverInfo): void {
    const el = this.screen(`<h2>Game Over</h2><div>${Math.floor(info.distance)} m</div><div>Record : ${Math.floor(info.best)} m</div><button data-a="again">Rejouer</button><button data-a="menu">Menu</button>`);
    el.querySelector('[data-a=again]')!.addEventListener('click', () => this.h.onRestart());
    el.querySelector('[data-a=menu]')!.addEventListener('click', () => this.h.onMenu());
  }
  /** Flash on crash, etc. */
  flash(_color: string): void {}
}
