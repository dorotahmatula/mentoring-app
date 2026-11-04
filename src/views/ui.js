// Wspólne klocki ekranów: ramka strony, etykiety, pasek postępu, pola z autozapisem.

import { h, debounce, initials, toast } from '../util.js?v=202611042219';
import { topbar } from './chrome.js?v=202611042219';
import { personColor } from '../votes.js?v=202611042219';

export function shell(app, backend, user, crumbs, ...content) {
  app.replaceChildren(h('div', { class: 'page' },
    topbar(backend, user, { crumbs, right: [h('span', { class: 'small muted' }, user.name + (user.isCoach ? ' · mentorka' : ''))] }),
    h('div', { class: 'shell' }, h('div', { class: 'shell-inner' }, ...content))));
}

export function loading(app, text = 'Wczytuję…') {
  app.replaceChildren(h('div', { class: 'login-wrap' }, h('p', {}, text)));
}

export function failed(app, backend, user, text) {
  shell(app, backend, user, [], h('div', { class: 'panel' }, h('h2', {}, 'Coś poszło nie tak'), h('p', { class: 'muted' }, text || 'Nie udało się wczytać danych. Odśwież stronę.'), h('a', { href: '#/', class: 'btn', style: { alignSelf: 'flex-start' } }, 'Wróć na pulpit')));
}

export const badge = (st) => st ? h('span', { class: 'badge ' + st[1] }, st[0]) : null;

const LOCK = '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
const EYE = '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
const ic = (paths) => h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'aria-hidden': 'true', html: paths });
export const privTag = (t = 'tylko Ty') => h('span', { class: 'tag' }, ic(LOCK), t);
export const visTag = (t = 'widzi mentee') => h('span', { class: 'tag visible' }, ic(EYE), t);

export function bar(done, total, label) {
  return h('div', { class: 'bar', role: 'img', 'aria-label': label || `${done} z ${total} sesji` }, Array.from({ length: total }, (_, i) => h('span', { class: i < done ? 'on' : '' })));
}

export function avatar(name, isCoach = false, size) {
  return h('span', { class: 'avatar', style: { background: personColor({ isCoach }), ...(size ? { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' } : {}) }, 'aria-hidden': 'true' }, initials(name));
}

// Pole tekstowe z przyciskiem „Zapisz”. Dla bezpieczeństwa zapisuje się też samo po chwili bez pisania
// i przy wyjściu z pola, a status pokazuje, czy zmiana jest już zapisana.
export function autoText(value, onSave, { placeholder = '', rows = 3, label, input = false } = {}) {
  const el = input
    ? h('input', { class: 'field-input', value: value || '', placeholder, 'aria-label': label })
    : h('textarea', { class: 'field-input', rows, placeholder, 'aria-label': label, value: value || '' });
  const btn = h('button', { type: 'button', class: 'btn save-btn', hidden: true, 'aria-label': label ? `Zapisz: ${label}` : 'Zapisz' }, 'Zapisz');
  const status = h('span', { class: 'save-note', 'aria-live': 'polite' });
  let last = value || '';
  let saving = null;
  let noteTimer;
  const dirty = () => el.value !== last;
  const draw = () => { btn.hidden = !dirty(); if (dirty()) status.textContent = ''; };
  async function save() {
    if (!dirty()) return;
    if (saving) { await saving; if (!dirty()) return; }
    const v = el.value;
    btn.disabled = true; status.textContent = 'Zapisuję…';
    saving = (async () => {
      try { await onSave(v); last = v; status.textContent = 'Zapisano ✓'; clearTimeout(noteTimer); noteTimer = setTimeout(() => { if (!dirty()) status.textContent = ''; }, 2500); }
      catch (e) { console.error(e); status.textContent = ''; toast('Nie udało się zapisać. Sprawdź połączenie.'); }
    })();
    await saving; saving = null;
    btn.disabled = false; draw();
  }
  const auto = debounce(save, 1500);
  el.addEventListener('input', () => { draw(); auto(); });
  el.addEventListener('blur', (e) => { if (e.relatedTarget !== btn) auto.flush(); });
  btn.addEventListener('click', () => { auto.cancel?.(); save(); el.focus(); });
  if (input) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); auto.cancel?.(); save(); } });
  const wrap = input
    ? h('div', { class: 'edit-field inline' }, el, btn, status)
    : h('div', { class: 'edit-field' }, el, h('div', { class: 'edit-bar' }, status, btn));
  Object.defineProperty(wrap, 'value', { get: () => el.value });
  wrap.input = el;
  return wrap;
}

export function panel(cls, title, tagEl, ...body) {
  return h('section', { class: 'panel ' + (cls || '') }, h('div', { class: 'panel-head' }, h('h2', {}, title), tagEl), ...body);
}
