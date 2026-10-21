import { h, icon } from '../util.js';

export function topbar(backend, user, { crumbs = [], center = null, right = [] } = {}) {
  const left = h('div', { class: 'crumbs' },
    h('a', { href: '#/', class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, 'M'), 'Dorota Matuła · Mentoring'),
    crumbs.flatMap(c => [h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'), typeof c === 'string' ? h('span', {}, c) : c]));
  const out = user ? h('button', { type: 'button', class: 'mini-btn', title: 'Wyloguj', 'aria-label': 'Wyloguj', onClick: () => backend.signOut() }, icon('logout', 18)) : null;
  return h('header', { class: 'topbar' }, left, center, h('div', { class: 'peers' }, right, out));
}
