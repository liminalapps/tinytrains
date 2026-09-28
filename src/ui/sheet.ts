// On phones, cards are bottom sheets: drag the top edge up to expand, down to dismiss.

export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
export const isPhone = () => matchMedia('(max-width: 760px)').matches;

export function makeSheet(el: HTMLElement, onClose: () => void) {
  let y0 = 0;
  let dy = 0;
  let dragging = false;
  let id = -1;
  el.addEventListener('pointerdown', (e) => {
    if (!isPhone()) return;
    const top = el.getBoundingClientRect().top;
    const inGrab = e.clientY - top < 64 || (e.target as HTMLElement).closest('.tc-head, .sc-head');
    if (!inGrab || (e.target as HTMLElement).closest('button:not(.tc-head), a, input')) return;
    if (el.scrollTop > 0 && e.clientY - top >= 64) return;
    dragging = true;
    id = e.pointerId;
    y0 = e.clientY;
    dy = 0;
    el.style.transition = 'none';
  });
  addEventListener('pointermove', (e) => {
    if (!dragging || e.pointerId !== id) return;
    dy = e.clientY - y0;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    else if (!el.classList.contains('full')) el.style.transform = `translateY(${Math.max(dy, -40) * 0.4}px)`;
  });
  const end = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== id) return;
    dragging = false;
    el.style.transition = '';
    el.style.transform = '';
    if (dy > 110) {
      if (el.classList.contains('full')) el.classList.remove('full');
      else onClose();
    } else if (dy < -50) el.classList.add('full');
    else if (Math.abs(dy) < 6 && e.clientY - el.getBoundingClientRect().top < 28) el.classList.toggle('full');
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}
