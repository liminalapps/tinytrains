// Show/hide with transitions. Panels start from a "hidden" look defined in CSS and transition to
// `.shown`; hiding removes `.shown` first and only sets [hidden] once the exit transition has played.

const timers = new WeakMap<HTMLElement, number>();

export function reveal(el: HTMLElement, show: boolean, ms = 340) {
  clearTimeout(timers.get(el));
  if (show) {
    if (!el.hidden && el.classList.contains('shown')) return;
    el.hidden = false;
    void el.offsetWidth; // reflow so the transition starts from the hidden look
    el.classList.add('shown');
  } else {
    if (el.hidden) return;
    el.classList.remove('shown');
    timers.set(
      el,
      window.setTimeout(() => {
        el.hidden = true;
        el.classList.remove('full');
      }, ms),
    );
  }
}

export const shown = (el: HTMLElement) => !el.hidden && el.classList.contains('shown');

/** Replay a one-shot CSS animation class (e.g. when a card's content swaps). */
export function replay(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Count a number up/down smoothly inside an element. */
export function tweenNumber(el: HTMLElement, to: number, ms = 700) {
  const from = Number(el.dataset.value ?? to);
  el.dataset.value = String(to);
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to.toLocaleString();
    return;
  }
  const t0 = performance.now();
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e).toLocaleString();
    if (k < 1 && el.dataset.value === String(to)) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
