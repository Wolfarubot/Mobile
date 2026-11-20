/**
 * Taps on iPhone and iPad Safari.
 *
 * Safari only sends a tap's click after checking whether the tap looked like a "hover": if anything on the page
 * changes as the finger lifts, it can keep the click back and wait for a second tap. The battlefield, the pick-up pops
 * and the menu's numbers change many times a second, so on a busy field a button could take two or three taps. The
 * press animation still played (it runs on finger down), but nothing opened.
 *
 * This sends the click itself as the finger lifts, and cancels Safari's own (so a tap never clicks twice). It acts
 * only on a plain tap: the finger lifted near where it went down, without the page scrolling in between. Text fields,
 * dropdowns, sliders and labels keep Safari's own handling, since they need its focus and keyboard behaviour.
 */

/** How far the finger may drift (px) and still count as a tap. */
const TAP_SLOP = 10;

/** Whether this is Safari on an iPhone or iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIosWebKit(nav: Navigator = navigator): boolean {
  return /iP(hone|ad|od)/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
}

/** Elements that keep the browser's own tap handling. */
const NATIVE = 'input, select, textarea, label, [contenteditable=""], [contenteditable="true"]';

export function installIosTap(win: Window = window): void {
  let start: { id: number; x: number; y: number; target: Element } | null = null;
  let scrolled = false;
  win.addEventListener(
    'touchstart',
    (e) => {
      // A second finger makes it a gesture, not a tap.
      if (e.touches.length !== 1) {
        start = null;
        return;
      }
      const t = e.changedTouches[0];
      start = t.target instanceof Element ? { id: t.identifier, x: t.clientX, y: t.clientY, target: t.target } : null;
      scrolled = false;
    },
    { capture: true, passive: true },
  );
  win.addEventListener(
    'touchmove',
    (e) => {
      const t = start && [...e.changedTouches].find((c) => c.identifier === start!.id);
      if (t && Math.hypot(t.clientX - start!.x, t.clientY - start!.y) > TAP_SLOP) start = null;
    },
    { capture: true, passive: true },
  );
  // A tap that stops a list mid-scroll only stops it, as it would anyway.
  win.addEventListener('scroll', () => (scrolled = true), { capture: true, passive: true });
  win.addEventListener('touchcancel', () => (start = null), { capture: true, passive: true });
  win.addEventListener(
    'touchend',
    (e) => {
      const s = start;
      start = null;
      if (!s || scrolled || e.touches.length) return;
      const t = [...e.changedTouches].find((c) => c.identifier === s.id);
      if (!t || Math.hypot(t.clientX - s.x, t.clientY - s.y) > TAP_SLOP) return;
      const target = s.target;
      if (!target.isConnected || target.closest(NATIVE)) return;
      if ((target.closest('button') as HTMLButtonElement | null)?.disabled) return;
      // No click from Safari, so it can't hold this one back or send a second.
      e.preventDefault();
      // Safari would have moved focus off a text field (closing the keyboard); do that too.
      const focused = win.document.activeElement;
      if (focused instanceof HTMLElement && focused !== target && focused.matches(NATIVE)) focused.blur();
      target.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: win,
          detail: 1,
          clientX: t.clientX,
          clientY: t.clientY,
          screenX: t.screenX,
          screenY: t.screenY,
        }),
      );
    },
    { capture: true, passive: false },
  );
}
