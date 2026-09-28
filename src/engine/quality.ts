/** Rendering budget: 'low' on phones and small GPUs (override with ?q=low / ?q=high). */
function detect(): 'high' | 'low' {
  const q = new URLSearchParams(location.search).get('q');
  if (q === 'low' || q === 'high') return q;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  const cores = navigator.hardwareConcurrency ?? 8;
  return (coarse && small) || cores <= 4 ? 'low' : 'high';
}

export const QUALITY = detect();
export const LOW = QUALITY === 'low';
