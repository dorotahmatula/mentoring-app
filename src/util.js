// Drobne narzędzia wspólne dla całej aplikacji.

export function h(tag, attrs, ...children) {
  const el = tag === 'svg' || tag === 'path' || tag === 'rect' || tag === 'circle' || tag === 'g'
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v; // tylko dla zaufanych, stałych ikon
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 12);

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

export function throttle(fn, ms) {
  let last = 0, t, lastArgs;
  return (...a) => {
    lastArgs = a;
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...lastArgs); }, ms - (now - last)); }
  };
}

export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  ta._fit = fit;
  return ta;
}

export function toast(msg, ms = 2600) {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.remove(), ms);
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

export function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return ''; }
}

const PATHS = {
  cursor: '<path d="M5 3l14 7-6 2-2 6z"/>',
  sticky: '<path d="M5 4h14v10l-6 6H5z"/><path d="M13 20v-6h6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
  shape: '<rect x="4" y="4" width="10" height="10" rx="1"/><circle cx="16" cy="16" r="5"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 8"/>',
  vote: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/>',
  emoji: '<circle cx="12" cy="12" r="9"/><path d="M8 14c1 1.5 2.4 2 4 2s3-.5 4-2"/><path d="M9 9.5h.01M15 9.5h.01"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H6a2 2 0 0 0-2 2v10"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>'
};

export function icon(name, size = 20) {
  return h('svg', { class: 'icon', viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', html: PATHS[name] || '' });
}
