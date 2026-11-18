/**
 * Unified input. Steering model: the player follows a lateral TARGET.
 *  - Touch / mouse drag: horizontal finger movement moves the target (relative drag, anywhere on screen).
 *    Only the first pointer steers (multi-touch ignored); the pointer is captured so the drag keeps
 *    working when the finger leaves the canvas. Pointers starting on UI controls are ignored.
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
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('lostpointercapture', this.up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // Window-level fallbacks for release (pointer capture unsupported / released outside the page).
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('keydown', this.keydown);
    window.addEventListener('keyup', this.keyup);
    window.addEventListener('blur', () => { this.keys.clear(); this.updateAxis(); this.release(); });
    // Block page zoom / scroll / selection gestures.
    const stop = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', stop, { passive: false });
    document.addEventListener('gesturechange', stop, { passive: false });
    document.addEventListener('touchmove', (e) => { if ((e.target as HTMLElement).closest?.('input[type=range]')) return; e.preventDefault(); }, { passive: false });
    document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
    document.addEventListener('dblclick', stop);
    document.addEventListener('selectstart', stop);
  }

  private down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest?.('button, input, a, [data-ui]')) return;
    if (this.pointerId !== null) return; // ignore additional fingers
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.lastX = e.clientX;
    this.holding = true;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.pointerId) return;
    // Use coalesced events for precise drags on high-rate touch screens.
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const w = Math.max(1, window.innerWidth);
    if (evs.length) {
      for (const c of evs) { this.dragAccum += (c.clientX - this.lastX) / w; this.lastX = c.clientX; }
    } else {
      this.dragAccum += (e.clientX - this.lastX) / w;
      this.lastX = e.clientX;
    }
    e.preventDefault();
  };
  private up = (e?: Event) => {
    if (e && 'pointerId' in e && (e as PointerEvent).pointerId !== this.pointerId) return;
    this.release();
  };
  private release() {
    if (this.pointerId !== null) { try { this.el.releasePointerCapture(this.pointerId); } catch { /* ignore */ } }
    this.pointerId = null;
    this.holding = false;
  }
  private keydown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    this.updateAxis();
    if (!e.repeat) this.onAnyKey(e.code);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code) && !(e.target as HTMLElement)?.closest?.('input')) e.preventDefault();
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
