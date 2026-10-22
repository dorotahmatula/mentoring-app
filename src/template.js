// Szablon „Jak działamy i cele” oraz boczny panel (Parking, Co zabieram).

import { h, uid, debounce, autosize, icon } from './util.js?v=202610221749';

const MAX_GOALS = 3;

export function genitive(name) {
  const n = (name || '').trim();
  if (/[kg]a$/i.test(n)) return n.slice(0, -1) + 'i';
  if (/a$/i.test(n)) return n.slice(0, -1) + 'y';
  return n;
}

export const HOW_FIELDS = (coachName) => [
  ['how:rhythm', 'Rytm i forma spotkań', 'np. co 2–3 tygodnie, 60–90 min, Google Meet'],
  ['how:roles', `Co biorę na siebie / czego oczekuję od ${genitive(coachName) || 'mentorki'}`, 'np. przychodzę z tematem; oczekuję pytań i perspektywy na prośbę'],
  ['how:broken', 'Co robimy, gdy coś nie działa lub trzeba przełożyć', 'np. mówimy o tym od razu; przekładamy maks. raz'],
  ['how:closing', 'Jak zamkniemy proces', 'np. sesja podsumowująca po ostatnim spotkaniu']
];

export const TAKE_FIELDS = (session) => [
  ['take:important', 'Co dziś odkryłam?'],
  ['take:next', session.number < session.total ? `Mój krok do sesji ${session.number + 1}` : 'Mój następny krok']
];

export function goalIds(store) {
  const ids = new Map();
  if (!store.entries.has('goal:g1')) ids.set('g1', 1);
  if (!store.entries.has('goal:g2')) ids.set('g2', 2);
  for (const [k, v] of store.list('goal:')) ids.set(k.slice(5), v.order ?? 0);
  return [...ids].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

// Pole tekstowe powiązane z kluczem w stanie sesji.
class Binder {
  constructor(store) { this.store = store; this.map = new Map(); }
  text(key, { placeholder = '', cls = 'inline-text', label, rows = 1 } = {}) {
    const ta = h('textarea', { class: cls, rows, placeholder, 'aria-label': label, value: this.store.get(key) || '' });
    autosize(ta);
    const save = debounce(() => this.store.set(key, ta.value), 300);
    ta.addEventListener('input', save);
    ta.addEventListener('blur', () => { save.flush(); });
    const set = this.map.get(key) || new Set();
    let seen = false;
    const fn = () => {
      if (ta.isConnected) seen = true;
      else if (seen) { set.delete(fn); return; }
      if (document.activeElement !== ta) { ta.value = this.store.get(key) || ''; ta._fit && ta._fit(); }
    };
    set.add(fn);
    this.map.set(key, set);
    return ta;
  }
  update(keys) {
    for (const k of keys) {
      const set = this.map.get(k);
      if (set) for (const fn of set) fn();
    }
  }
}

export class TemplateView {
  constructor(store, votes, session, coachName) {
    this.store = store; this.votes = votes; this.session = session; this.coachName = coachName;
    this.bind = new Binder(store);
    this.goalsEl = h('div', { class: 'col', role: 'group', 'aria-labelledby': 'cele-h' });
    this.scales = new Map();
    this.el = h('section', { class: 'template', 'aria-label': 'Szablon Jak działamy i cele' },
      h('div', { class: 'template-head' },
        h('h1', {}, session.title || 'Jak działamy i cele'),
        h('p', {}, 'Uzupełniamy razem. Pisze głównie klientka, mentorka dopytuje.')),
      h('div', { class: 'cols' }, this.goalsEl, this._how()));
    this._goals();
  }

  _goals() {
    const ids = goalIds(this.store);
    this.scales.clear();
    const cards = ids.map((id, i) => {
      const scale = h('div', { class: 'scale' });
      this.scales.set(id, scale);
      this._scale(id);
      return h('div', { class: 'goal' },
        h('div', { class: 'goal-top' },
          h('span', { class: 'goal-name' }, `Cel ${i + 1}`),
          h('div', { class: 'row-actions' },
            this.votes.widget(`goal:${id}`),
            ids.length > 1 ? h('button', { type: 'button', class: 'mini-btn', 'aria-label': `Usuń cel ${i + 1}`, title: 'Usuń cel', onClick: () => this._removeGoal(id) }, icon('close', 16)) : null)),
        h('div', { class: 'f' }, h('span', {}, 'Czego chcę się nauczyć'), this.bind.text(`gf:${id}:learn`, { label: `Cel ${i + 1}: czego chcę się nauczyć`, placeholder: 'Wpisz cel…' })),
        h('div', { class: 'f' }, h('span', {}, 'Po czym poznam, że się udało'), this.bind.text(`gf:${id}:success`, { label: `Cel ${i + 1}: po czym poznam, że się udało`, placeholder: 'Konkretny znak, że jest zmiana…' })),
        scale);
    });
    const add = ids.length < MAX_GOALS
      ? h('button', { type: 'button', class: 'btn btn-dashed', onClick: () => this._addGoal() }, `+ Dopisz cel ${ids.length + 1}`)
      : null;
    this.goalsEl.replaceChildren(h('h2', { class: 'col-title', id: 'cele-h' }, 'Cele'), ...cards, add);
  }

  _scale(id) {
    const el = this.scales.get(id);
    if (!el) return;
    const val = this.store.get(`gf:${id}:today`) || 0;
    const dots = [];
    for (let n = 1; n <= 10; n++) {
      dots.push(h('button', { type: 'button', class: n <= val ? 'on' : '', 'aria-label': `Gdzie jestem dziś: ${n} z 10`, 'aria-pressed': n === val ? 'true' : 'false',
        onClick: () => this.store.set(`gf:${id}:today`, n === val ? null : n, { now: true }) }, h('span')));
    }
    el.replaceChildren(h('span', { style: { fontSize: '12px', color: 'var(--muted)' } }, 'Gdzie jestem dziś'), h('div', { class: 'scale-dots', role: 'group', 'aria-label': 'Ocena od 1 do 10' }, dots), h('span', { class: 'scale-val' }, val ? `${val}/10` : '–'));
  }

  _addGoal() {
    const id = uid();
    this.store.set(`goal:${id}`, { order: Date.now() }, { now: true });
    requestAnimationFrame(() => this.goalsEl.querySelectorAll('.goal textarea')[goalIds(this.store).indexOf(id) * 2]?.focus());
  }

  _removeGoal(id) {
    const has = ['learn', 'success'].some(f => (this.store.get(`gf:${id}:${f}`) || '').trim());
    if (has && !confirmInline(this.goalsEl, id)) return;
    this.store.set(`goal:${id}`, null, { now: true });
  }

  _how() {
    const rows = HOW_FIELDS(this.coachName).map(([key, label, ph]) =>
      h('div', { class: 'how-row' }, h('span', { style: { fontSize: '12px', color: 'var(--muted)', paddingRight: '64px' } }, label), this.bind.text(key, { label, placeholder: ph }), this.votes.widget(key)));
    return h('div', { class: 'col' }, h('h2', { class: 'col-title' }, 'Jak działamy'), h('div', { class: 'how' }, rows));
  }

  update(keys) {
    if (keys.some(k => /^goal:[^:]+$/.test(k))) this._goals();
    for (const k of keys) { const m = /^gf:(.+):today$/.exec(k); if (m) this._scale(m[1]); }
    this.bind.update(keys);
  }
}

// Usuwanie celu z treścią wymaga drugiego kliknięcia, bez systemowych okienek.
const armed = new Set();
function confirmInline(root, id) {
  if (armed.has(id)) { armed.delete(id); return true; }
  armed.add(id);
  setTimeout(() => armed.delete(id), 3000);
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.textContent = 'Cel ma treść. Kliknij jeszcze raz, żeby go usunąć.';
  document.body.append(t); setTimeout(() => t.remove(), 2800);
  return false;
}

export class SideView {
  constructor(store, votes, session) {
    this.store = store; this.votes = votes; this.session = session;
    this.bind = new Binder(store);
    this.countEl = h('span', { class: 'count' }, '0');
    this.listEl = h('div', { class: 'park-list' });
    this.el = h('aside', { class: 'side', 'aria-label': 'Panel boczny' },
      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        h('div', { class: 'side-head' }, h('h2', {}, 'Parking'), this.countEl),
        h('p', { class: 'side-sub' }, 'Tematy, do których wrócimy na kolejnej sesji'),
        this.listEl,
        h('button', { type: 'button', class: 'btn btn-dashed', onClick: () => this._add() }, '+ Dodaj temat')),
      h('section', { class: 'takeaways', 'aria-labelledby': 'take-h' },
        h('h2', { id: 'take-h' }, 'Co zabieram'),
        ...TAKE_FIELDS(session).map(([key, label]) => h('label', { class: 'field-label' }, label, this.bind.text(key, { cls: '', label }))),
        h('p', { class: 'hint' }, 'Wypełnia mentee na koniec sesji. Zapisuje się samo i trafia do eksportu.')));
    this._list();
  }

  _items() { return this.store.list('park:').sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([k]) => k.slice(5)); }

  _list() {
    const ids = this._items();
    this.countEl.textContent = String(ids.length);
    this.listEl.replaceChildren(...ids.map(id => h('div', { class: 'park-item' },
      this.bind.text('ptext:' + id, { label: 'Temat na później', placeholder: 'Temat…' }),
      this.votes.widget('park:' + id),
      h('button', { type: 'button', class: 'mini-btn del', 'aria-label': 'Usuń temat', title: 'Usuń temat', onClick: () => this.store.set('park:' + id, null, { now: true }) }, icon('close', 14)))));
  }

  _add() {
    const id = uid();
    this.store.set('park:' + id, { order: Date.now() }, { now: true });
    const tas = this.listEl.querySelectorAll('textarea'); tas[tas.length - 1]?.focus();
  }

  update(keys) {
    if (keys.some(k => /^park:[^:]+$/.test(k))) this._list();
    this.bind.update(keys);
  }
}
