import { STOCK } from '../../shared/stock/index.ts';
import { StockPortraits } from '../ui/fleet.ts';

// Dev-only contact sheet of every rolling stock portrait: /stock.html?prefix=tokyo
const prefix = new URLSearchParams(location.search).get('prefix') ?? '';
const p = new StockPortraits();
document.body.style.cssText = 'margin:0;padding:12px;background:#f3f7fb;font:600 11px Nunito,sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:8px';
for (const spec of Object.values(STOCK).filter((s) => s.id.startsWith(prefix))) {
  const d = document.createElement('div');
  d.style.cssText = 'background:#fff;border-radius:10px;padding:4px;text-align:center';
  d.innerHTML = `<img src="${p.get(spec, '#e0457b')}" style="width:100%"><div>${spec.id}</div>`;
  document.body.appendChild(d);
}
