/**
 * Unified input. Steering model: the player follows a lateral TARGET.
 *  - Touch / mouse drag: horizontal finger movement moves the target (relative drag, anywhere on screen).
 *  - Keyboard (←/→, A/D, Q/D): moves the target continuously.
 * Gameplay reads `consumeDrag()` (fraction of screen width since last frame) and `keyAxis`.
 */
export class Input {
  keyAxis = 0;
  private dragAccum = 0;
  private pointerId: number | null = null;
  private lastX = 0;
  enabled = true;
  /** True while a finger / mouse button is held. */
  holding = false;
  private keys = new Set<string>();
  onAnyKey: (code: string) => void = () => {};

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => { this.keys.clear(); this.updateAxis(); this.up(); });
  }

  private down = (e: PointerEvent) => {
    if (this.pointerId !== null) return;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.holding = true;
    e.preventDefault();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    const w = Math.max(1, window.innerWidth);
    this.dragAccum += (e.clientX - this.lastX) / w;
    this.lastX = e.clientX;
  };
  private up = (e?: PointerEvent) => {
    if (e && e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.holding = false;
  };
  private keydown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    this.updateAxis();
    this.onAnyKey(e.code);
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  private keyup = (e: KeyboardEvent) => { this.keys.delete(e.code); this.updateAxis(); };
  private updateAxis() {
    const l = this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.keys.has('KeyQ');
    const r = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    this.keyAxis = (r ? 1 : 0) - (l ? 1 : 0);
  }

  /** Horizontal drag since last call, as a fraction of screen width. */
  consumeDrag(): number {
    const d = this.dragAccum;
    this.dragAccum = 0;
    return this.enabled ? d : 0;
  }

  reset(): void { this.dragAccum = 0; }
}
