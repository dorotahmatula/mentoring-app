// Głosowanie kropkami: każda osoba ma 3 kropki i może je postawić na celu, polu, temacie z parkingu albo karteczce.
// Klucz: vote:<id osoby>:<numer kropki> → { target, color, name }. Każdy pisze tylko swoje klucze, więc nie ma konfliktów.

import { h } from './util.js?v=202610221739';

export const VOTES_PER_PERSON = 3;
export const personColor = (p) => (p && p.isCoach ? '#0F08A1' : '#5B4FD6');

export class Votes {
  constructor(store, me) {
    this.store = store;
    this.me = me;
    this.widgets = new Set();
    this.changeListeners = new Set();
  }

  mine() {
    const out = [];
    for (let i = 0; i < VOTES_PER_PERSON; i++) {
      const key = `vote:${this.me.id}:${i}`;
      const v = this.store.get(key);
      if (v && v.target) out.push({ key, ...v });
    }
    return out;
  }

  remaining() { return VOTES_PER_PERSON - this.mine().length; }

  on(target) {
    return this.store.list('vote:').filter(([, v]) => v && v.target === target).map(([key, v]) => ({ key, ...v, mine: key.startsWith(`vote:${this.me.id}:`) }));
  }

  add(target) {
    for (let i = 0; i < VOTES_PER_PERSON; i++) {
      const key = `vote:${this.me.id}:${i}`;
      const v = this.store.get(key);
      if (!v || !v.target) { this.store.set(key, { target, color: personColor(this.me), name: this.me.name }, { now: true }); return true; }
    }
    return false;
  }

  remove(key) { if (key.startsWith(`vote:${this.me.id}:`)) this.store.set(key, null, { now: true }); }

  widget(target, extraClass = '') {
    const el = h('span', { class: 'votes ' + extraClass });
    const w = { el, target, draw: () => this._draw(w) };
    this.widgets.add(w);
    w.draw();
    return el;
  }

  _draw(w) {
    const list = this.on(w.target);
    const kids = list.map(v => v.mine
      ? h('button', { type: 'button', class: 'vote-dot', style: { background: v.color }, title: 'Twoja kropka (kliknij, żeby zdjąć)', 'aria-label': 'Zdejmij moją kropkę', onClick: (e) => { e.stopPropagation(); this.remove(v.key); } })
      : h('span', { class: 'vote-dot', style: { background: v.color }, title: v.name || 'Kropka', role: 'img', 'aria-label': 'Kropka: ' + (v.name || 'uczestnik') }));
    if (this.remaining() > 0) {
      kids.push(h('button', { type: 'button', class: 'vote-add', title: 'Postaw kropkę', 'aria-label': 'Postaw kropkę', onPointerdown: (e) => e.stopPropagation(), onClick: (e) => { e.stopPropagation(); this.add(w.target); } }, '+'));
    }
    w.el.replaceChildren(...kids);
  }

  refresh() {
    for (const w of [...this.widgets]) {
      if (!w.el.isConnected) { this.widgets.delete(w); continue; }
      w.draw();
    }
    this.changeListeners.forEach(fn => fn());
  }

  onChange(fn) { this.changeListeners.add(fn); return () => this.changeListeners.delete(fn); }
}
