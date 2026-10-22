// Tablica do wspólnej pracy: karteczki, tekst, kształty, rysowanie, obrazy, emotki.
// Każdy element to osobny klucz item:<id> w stanie sesji, więc zmiany widać u obu osób na bieżąco.

import { h, uid, throttle, debounce, icon } from './util.js?v=202610221749';

export const STICKY_COLORS = ['#FFF4C2', '#FFE0EF', '#E6E4FB', '#DDF3E4'];
export const INK_COLORS = ['#0F08A1', '#5B4FD6', '#FF6633', '#1A1A1A'];
const EMOJIS = ['👍', '❤️', '⭐', '✅', '❓', '💡', '🔥', '🎯', '😊', '🙌', '⚡', '📌'];
const MIN = 0.25, MAX = 2.5;

export class Board {
  constructor(store, me, votes) {
    this.store = store;
    this.me = me;
    this.votes = votes;
    this.tool = 'select';
    this.view = { x: 0, y: 0, z: 1 };
    this.sel = null;
    this.editing = null;
    this.ink = INK_COLORS[0];
    this.pendingEmoji = null;
    this.nodes = new Map();
    this.active = false;
    this.toolListeners = new Set();
    this._build();
    this._bind();
    this.update(this.store.list('item:').map(([k]) => k));
    requestAnimationFrame(() => this.fit(true));
  }

  // ---------- budowa ----------
  _build() {
    this.zoomLabel = h('span', { 'aria-live': 'polite' }, '100%');
    this.world = h('div', { class: 'world' });
    this.svg = h('svg', { class: 'strokes' });
    this.world.append(this.svg);
    this.selbar = h('div', { class: 'selbar', hidden: true });
    this.palette = h('div', { class: 'palette', hidden: true, role: 'menu', 'aria-label': 'Emotki' },
      EMOJIS.map(e => h('button', { type: 'button', role: 'menuitem', 'aria-label': 'Emotka ' + e, onClick: () => { this.pendingEmoji = e; this.palette.hidden = true; } }, e)));
    this.hint = h('div', { class: 'board-hint' }, 'Dwuklik w karteczkę edytuje tekst · dwuklik w puste miejsce dodaje karteczkę · Delete usuwa · Ctrl + kółko przybliża · Ctrl+V wkleja');
    this.viewport = h('div', { class: 'viewport', tabindex: '0', 'aria-label': 'Tablica do wspólnej pracy' }, this.world, this.selbar, this.palette, this.hint);
    this.fileInput = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', tabindex: '-1', 'aria-hidden': 'true', onChange: (e) => { const f = e.target.files[0]; if (f) this.addImageFile(f); e.target.value = ''; } });
    this.el = h('section', { class: 'board-card', 'aria-label': 'Tablica' },
      h('div', { class: 'board-head' },
        h('h2', {}, 'Tablica'),
        h('div', { class: 'zoom' },
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Oddal', onClick: () => this.zoomBy(1 / 1.2) }, '−'),
          this.zoomLabel,
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Przybliż', onClick: () => this.zoomBy(1.2) }, '+'),
          h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '32px' }, onClick: () => this.fit() }, 'Dopasuj'),
          h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Pełny ekran', title: 'Pełny ekran', onClick: () => this.toggleFull() }, icon('expand', 18))
        )
      ),
      this.viewport, this.fileInput);
  }

  _bind() {
    const vp = this.viewport;
    vp.addEventListener('pointerdown', (e) => this._down(e));
    vp.addEventListener('pointermove', (e) => this._move(e));
    vp.addEventListener('pointerup', (e) => this._up(e));
    vp.addEventListener('pointercancel', (e) => this._up(e));
    vp.addEventListener('dblclick', (e) => {
      // Po przeciągnięciu wskaźnik jest „przechwycony” przez tablicę, więc sprawdzamy, co faktycznie leży pod kursorem.
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit && hit.closest ? hit.closest('.item') : e.target.closest('.item');
      if (el && el.dataset.key === this.editing) return;
      if (this.lastTap && this.lastTap.key && Date.now() - this.lastTap.t < 600) return; // dwuklik był w karteczkę
      if (el && ['sticky', 'text', 'shape'].includes(el.dataset.type)) this.edit(el.dataset.key);
      else if (!el && this.tool === 'select') { const p = this.toWorld(e); this.create('sticky', p); }
    });
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0025));
      } else {
        this.view.x -= e.deltaX; this.view.y -= e.deltaY; this._applyView();
      }
    }, { passive: false });
    vp.addEventListener('dragover', (e) => { e.preventDefault(); });
    vp.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = [...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/'));
      if (f) this.addImageFile(f, this.toWorld(e));
    });
    this._onDocDown = (e) => { this.active = this.el.contains(e.target); if (!this.palette.contains(e.target) && e.target.closest?.('[data-tool="emoji"]') == null) this.palette.hidden = true; };
    this._onKey = (e) => this._key(e);
    this._onPaste = (e) => this._paste(e);
    document.addEventListener('pointerdown', this._onDocDown, true);
    document.addEventListener('keydown', this._onKey);
    document.addEventListener('paste', this._onPaste);
    this._ro = new ResizeObserver(() => this._placeSelbar());
    this._ro.observe(vp);
  }

  destroy() {
    document.removeEventListener('pointerdown', this._onDocDown, true);
    document.removeEventListener('keydown', this._onKey);
    document.removeEventListener('paste', this._onPaste);
    this._ro.disconnect();
  }

  // ---------- narzędzia i widok ----------
  setTool(t, { scroll = false } = {}) {
    this.tool = t;
    this.viewport.className = 'viewport tool-' + t;
    if (t === 'emoji') {
      this.palette.hidden = false;
      Object.assign(this.palette.style, { left: '16px', top: '16px' });
      this.palette.querySelector('button')?.focus();
    } else { this.palette.hidden = true; this.pendingEmoji = null; }
    if (t !== 'select') this.select(null);
    this.toolListeners.forEach(fn => fn(t));
    if (scroll) this.viewport.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  onTool(fn) { this.toolListeners.add(fn); }

  pickImage() { this.fileInput.click(); }

  toWorld(e) {
    const r = this.viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left - this.view.x) / this.view.z, y: (e.clientY - r.top - this.view.y) / this.view.z };
  }
  center() {
    const r = this.viewport.getBoundingClientRect();
    return { x: (r.width / 2 - this.view.x) / this.view.z, y: (r.height / 2 - this.view.y) / this.view.z };
  }
  _applyView() {
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.z})`;
    this.zoomLabel.textContent = Math.round(this.view.z * 100) + '%';
    this._placeSelbar();
  }
  zoomAt(sx, sy, f) {
    const z = Math.min(MAX, Math.max(MIN, this.view.z * f));
    const k = z / this.view.z;
    this.view.x = sx - (sx - this.view.x) * k;
    this.view.y = sy - (sy - this.view.y) * k;
    this.view.z = z;
    this._applyView();
  }
  zoomBy(f) { const r = this.viewport.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }

  bounds() {
    let b = null;
    for (const [key, v] of this.store.list('item:')) {
      const r = this.itemRect(key, v);
      if (!b) b = { ...r }; else {
        const x2 = Math.max(b.x + b.w, r.x + r.w), y2 = Math.max(b.y + b.h, r.y + r.h);
        b.x = Math.min(b.x, r.x); b.y = Math.min(b.y, r.y); b.w = x2 - b.x; b.h = y2 - b.y;
      }
    }
    return b;
  }
  itemRect(key, v) {
    if (v.type === 'stroke') {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [px, py] of v.points) { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); }
      const pad = (v.width || 3) * 2;
      return { x: v.x + x1 - pad, y: v.y + y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
    }
    const node = this.nodes.get(key);
    const w = v.w || node?.offsetWidth || 80, hh = v.h || node?.offsetHeight || 40;
    return { x: v.x, y: v.y, w, h: hh };
  }
  fit(initial = false) {
    const r = this.viewport.getBoundingClientRect();
    const b = this.bounds();
    if (!b) { this.view = { x: 40, y: 40, z: 1 }; this._applyView(); return; }
    const pad = 48;
    const z = Math.min(initial ? 1 : MAX, Math.max(MIN, Math.min((r.width - pad * 2) / b.w, (r.height - pad * 2) / b.h)));
    this.view.z = z;
    this.view.x = (r.width - b.w * z) / 2 - b.x * z;
    this.view.y = (r.height - b.h * z) / 2 - b.y * z;
    this._applyView();
  }
  toggleFull() {
    this.el.classList.toggle('full');
    setTimeout(() => this.fit(), 30);
  }

  // ---------- elementy ----------
  maxZ() { return Math.max(0, ...this.store.list('item:').map(([, v]) => v.z || 0)); }

  create(type, p, extra = {}) {
    const key = 'item:' + uid();
    const base = { type, z: this.maxZ() + 1, by: this.me.id };
    let v;
    if (type === 'sticky') v = { ...base, x: p.x - 90, y: p.y - 70, w: 180, h: 140, color: STICKY_COLORS[0], text: '' };
    else if (type === 'text') v = { ...base, x: p.x, y: p.y - 14, color: '#1A1A1A', text: '' };
    else if (type === 'shape') v = { ...base, x: p.x - 90, y: p.y - 55, w: 180, h: 110, color: this.ink, shape: 'rect', text: '' };
    else if (type === 'emoji') v = { ...base, x: p.x - 22, y: p.y - 22, emoji: extra.emoji };
    else v = { ...base, ...extra };
    Object.assign(v, extra);
    this.store.set(key, v, { now: true });
    if (type === 'sticky' || type === 'text') this.edit(key, true);
    else this.select(key);
    return key;
  }

  async addImageFile(file, at) {
    const src = await downscale(file, 1400);
    const img = await loadImage(src);
    const w = Math.min(360, img.width), hh = Math.round(w * img.height / img.width);
    const p = at || this.center();
    this.create('image', p, { x: p.x - w / 2, y: p.y - hh / 2, w, h: hh, src });
    this.setTool('select');
  }

  update(keys) {
    let selMoved = false;
    for (const key of keys) {
      if (!key.startsWith('item:')) continue;
      const v = this.store.get(key);
      const node = this.nodes.get(key);
      if (v === null || v === undefined) {
        if (node) { node.remove(); this.nodes.delete(key); }
        if (this.sel === key) this.select(null);
        if (this.editing === key) this.editing = null;
        continue;
      }
      if (!node) {
        const n = this._makeNode(key, v);
        this.nodes.set(key, n);
      }
      this._patch(key, v);
      if (this.sel === key) selMoved = true;
    }
    this._order();
    if (selMoved) this._placeSelbar();
  }

  _makeNode(key, v) {
    if (v.type === 'stroke') {
      const p = h('path', { 'data-key': key, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      this.svg.append(p);
      return p;
    }
    const content = h('div', { class: 'content' });
    const n = h('div', { class: 'item ' + v.type, 'data-key': key, 'data-type': v.type }, content);
    if (v.type === 'image') { content.replaceWith(h('img', { alt: 'Obraz na tablicy', draggable: 'false' })); }
    if (v.type === 'sticky') n.append(this.votes.widget(key, 'item-votes'));
    this.world.insertBefore(n, this.svg);
    return n;
  }

  _patch(key, v) {
    const n = this.nodes.get(key);
    if (v.type === 'stroke') {
      n.setAttribute('d', pathD(v.points));
      n.setAttribute('transform', `translate(${v.x} ${v.y})`);
      n.setAttribute('stroke', v.color || '#1A1A1A');
      n.setAttribute('stroke-width', v.width || 3);
      n.classList.toggle('sel', this.sel === key);
      return;
    }
    Object.assign(n.style, { left: v.x + 'px', top: v.y + 'px', zIndex: v.z || 1 });
    if (v.w) n.style.width = v.w + 'px';
    if (v.h) n.style.height = v.h + 'px';
    const c = n.querySelector('.content');
    if (v.type === 'sticky') { n.style.background = v.color; }
    if (v.type === 'text') { n.style.color = v.color; }
    if (v.type === 'shape') {
      n.classList.toggle('oval', v.shape === 'oval'); n.classList.toggle('rect', v.shape !== 'oval');
      n.style.borderColor = v.color; n.style.background = v.color + '14'; n.style.color = '#1A1A1A';
    }
    if (v.type === 'emoji') { c.textContent = v.emoji; n.style.fontSize = (v.size || 44) + 'px'; }
    if (v.type === 'image') { const img = n.querySelector('img'); if (img.getAttribute('src') !== v.src) img.src = v.src; }
    if (c && v.type !== 'emoji' && this.editing !== key && c.textContent !== (v.text || '')) c.textContent = v.text || '';
    if (v.type === 'text' && !v.text && this.editing !== key) c.textContent = '';
    n.classList.toggle('sel', this.sel === key);
    this._handle(n, key, v);
  }

  _handle(n, key, v) {
    const want = this.sel === key && ['sticky', 'shape', 'image'].includes(v.type) && this.editing !== key;
    let hd = n.querySelector(':scope > .handle');
    if (want && !hd) n.append(h('span', { class: 'handle', 'data-handle': key, 'aria-hidden': 'true' }));
    if (!want && hd) hd.remove();
  }

  _order() {
    const items = [...this.nodes.entries()].filter(([, n]) => n.tagName !== 'path').map(([k, n]) => [this.store.get(k)?.z || 0, n]);
    items.sort((a, b) => a[0] - b[0]).forEach(([, n]) => this.world.insertBefore(n, this.svg));
    const strokes = [...this.nodes.entries()].filter(([, n]) => n.tagName === 'path').map(([k, n]) => [this.store.get(k)?.z || 0, n]);
    strokes.sort((a, b) => a[0] - b[0]).forEach(([, n]) => this.svg.append(n));
  }

  select(key) {
    const prev = this.sel;
    this.sel = key;
    for (const k of [prev, key]) if (k && this.nodes.has(k)) this._patch(k, this.store.get(k));
    this._placeSelbar();
  }

  _placeSelbar() {
    const key = this.sel;
    const v = key && this.store.get(key);
    if (!v || this.editing) { this.selbar.hidden = true; return; }
    const r = this.itemRect(key, v);
    const sx = r.x * this.view.z + this.view.x, sy = r.y * this.view.z + this.view.y;
    const kids = [];
    const colors = v.type === 'sticky' ? STICKY_COLORS : (v.type === 'image' || v.type === 'emoji') ? [] : INK_COLORS;
    for (const c of colors) kids.push(h('button', { type: 'button', class: 'swatch', style: { background: c, outline: v.color === c ? '2px solid #0F08A1' : 'none', outlineOffset: '1px' }, 'aria-label': 'Kolor ' + c, onClick: () => this._change(key, { color: c }) }));
    if (v.type === 'shape') kids.push(h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '32px' }, onClick: () => this._change(key, { shape: v.shape === 'oval' ? 'rect' : 'oval' }) }, v.shape === 'oval' ? 'Prostokąt' : 'Koło'));
    if (v.type === 'emoji') kids.push(
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Pomniejsz', onClick: () => this._change(key, { size: Math.max(24, (v.size || 44) - 12) }) }, '−'),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Powiększ', onClick: () => this._change(key, { size: Math.min(160, (v.size || 44) + 12) }) }, '+'));
    if (['sticky', 'text', 'shape'].includes(v.type)) kids.push(h('button', { type: 'button', class: 'btn btn-ghost', style: { height: '32px' }, onClick: () => this.edit(key) }, 'Edytuj tekst'));
    kids.push(h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Na wierzch', title: 'Na wierzch', onClick: () => this._change(key, { z: this.maxZ() + 1 }) }, icon('front', 18)));
    kids.push(h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Usuń', title: 'Usuń', onClick: () => this.remove(key) }, icon('trash', 18)));
    this.selbar.replaceChildren(...kids);
    this.selbar.hidden = false;
    this.selbar.style.left = Math.max(8, sx) + 'px';
    this.selbar.style.top = Math.max(8, sy - 48) + 'px';
  }

  _change(key, patch) {
    const v = this.store.get(key);
    if (!v) return;
    this.store.set(key, { ...v, ...patch }, { now: true });
  }

  remove(key) {
    this.store.set(key, null, { now: true });
    for (const [vk, vv] of this.store.list('vote:')) if (vv.target === key && vk.startsWith(`vote:${this.me.id}:`)) this.store.set(vk, null, { now: true });
    this.select(null);
  }

  edit(key, fresh = false) {
    const n = this.nodes.get(key);
    const c = n?.querySelector('.content');
    if (!c) return;
    this.finishEdit();
    this.select(key);
    this.editing = key;
    this.selbar.hidden = true;
    this._handle(n, key, this.store.get(key));
    n.classList.add('editing');
    c.contentEditable = 'true';
    c.setAttribute('role', 'textbox');
    c.setAttribute('aria-multiline', 'true');
    c.focus();
    const range = document.createRange(); range.selectNodeContents(c);
    if (!fresh) range.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(range);
    const save = debounce(() => { const v = this.store.get(key); if (v) this.store.set(key, { ...v, text: c.innerText.replace(/\n$/, '') }); }, 250);
    const onInput = () => save();
    const onBlur = () => this.finishEdit();
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); c.blur(); } e.stopPropagation(); };
    c.addEventListener('input', onInput);
    c.addEventListener('blur', onBlur);
    c.addEventListener('keydown', onKey);
    this._editCleanup = () => {
      save.flush();
      c.removeEventListener('input', onInput); c.removeEventListener('blur', onBlur); c.removeEventListener('keydown', onKey);
      c.contentEditable = 'false'; c.removeAttribute('role'); n.classList.remove('editing');
      const v = this.store.get(key);
      if (v && v.type === 'text' && !(v.text || '').trim()) this.remove(key);
    };
  }

  finishEdit() {
    if (!this.editing) return;
    const key = this.editing;
    const cleanup = this._editCleanup;
    this.editing = null; this._editCleanup = null;
    cleanup && cleanup();
    const v = this.store.get(key);
    if (v) this._patch(key, v);
    this._placeSelbar();
  }

  // ---------- wskaźnik ----------
  _down(e) {
    if (this.selbar.contains(e.target) || this.palette.contains(e.target) || e.target.closest('.votes')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const p = this.toWorld(e);
    const itemEl = e.target.closest('.item');
    const path = e.target.closest('path[data-key]');
    if (this.editing && !(itemEl && itemEl.dataset.key === this.editing)) this.finishEdit();
    if (itemEl && itemEl.dataset.key === this.editing) return;
    // Własne wykrywanie dwukliku: dwa kliknięcia w tę samą karteczkę w krótkim czasie = edycja tekstu.
    const now = Date.now();
    const tapKey = itemEl?.dataset.key || null;
    if (tapKey && this.lastTap && this.lastTap.key === tapKey && now - this.lastTap.t < 450 && ['sticky', 'text', 'shape'].includes(itemEl.dataset.type) && this.tool === 'select') {
      this.lastTap = { key: null, t: now };
      e.preventDefault();
      this.edit(tapKey);
      return;
    }
    this.lastTap = { key: tapKey, t: now };
    this.viewport.focus({ preventScroll: true });
    const t = this.tool;
    if (t === 'pen') {
      this.drag = { mode: 'pen', origin: p, points: [[0, 0]], live: h('path', { fill: 'none', stroke: this.ink, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `translate(${p.x} ${p.y})` }) };
      this.svg.append(this.drag.live);
    } else if (t === 'sticky' || t === 'text' || t === 'shape') {
      this.create(t, p);
      this.setTool('select');
      e.preventDefault();
      return;
    } else if (t === 'emoji') {
      if (this.pendingEmoji) { this.create('emoji', p, { emoji: this.pendingEmoji }); this.pendingEmoji = null; this.setTool('select'); }
      else this.palette.hidden = false;
      return;
    } else {
      const handle = e.target.closest('[data-handle]');
      const key = handle?.dataset.handle || itemEl?.dataset.key || path?.dataset.key;
      if (handle) {
        const v = this.store.get(key);
        this.drag = { mode: 'resize', key, start: p, orig: { w: v.w, h: v.h }, ratio: v.type === 'image' ? v.h / v.w : null };
      } else if (key) {
        this.select(key);
        const v = this.store.get(key);
        this.drag = { mode: 'move', key, start: p, orig: { x: v.x, y: v.y }, moved: false };
      } else {
        this.select(null);
        this.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: this.view.x, oy: this.view.y };
        this.viewport.classList.add('panning');
      }
    }
    try { this.viewport.setPointerCapture(e.pointerId); } catch {}
    this._sync = throttle((key, patch) => this._change(key, patch), 60);
  }

  _move(e) {
    const d = this.drag;
    if (!d) return;
    if (d.mode === 'pan') {
      this.view.x = d.ox + (e.clientX - d.sx); this.view.y = d.oy + (e.clientY - d.sy); this._applyView();
      return;
    }
    const p = this.toWorld(e);
    if (d.mode === 'pen') {
      d.points.push([Math.round((p.x - d.origin.x) * 10) / 10, Math.round((p.y - d.origin.y) * 10) / 10]);
      d.live.setAttribute('d', pathD(d.points));
    } else if (d.mode === 'move') {
      const x = Math.round(d.orig.x + p.x - d.start.x), y = Math.round(d.orig.y + p.y - d.start.y);
      d.moved = true; d.last = { x, y };
      const n = this.nodes.get(d.key);
      if (n && n.tagName === 'path') n.setAttribute('transform', `translate(${x} ${y})`);
      else if (n) { n.style.left = x + 'px'; n.style.top = y + 'px'; }
      const v = this.store.get(d.key);
      if (v) this._sync(d.key, { x, y });
    } else if (d.mode === 'resize') {
      let w = Math.max(60, Math.round(d.orig.w + p.x - d.start.x));
      let hh = d.ratio ? Math.round(w * d.ratio) : Math.max(40, Math.round(d.orig.h + p.y - d.start.y));
      d.last = { w, h: hh };
      this._sync(d.key, { w, h: hh });
    }
  }

  _up(e) {
    const d = this.drag;
    this.drag = null;
    try { if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId); } catch {}
    this.viewport.classList.remove('panning');
    if (!d) return;
    if (d.mode === 'pen') {
      d.live.remove();
      if (d.points.length > 1) {
        const key = 'item:' + uid();
        this.store.set(key, { type: 'stroke', x: d.origin.x, y: d.origin.y, points: simplify(d.points), color: this.ink, width: 3, z: this.maxZ() + 1, by: this.me.id }, { now: true });
      }
    } else if ((d.mode === 'move' && d.moved) || d.mode === 'resize') {
      setTimeout(() => d.last && this._change(d.key, d.last), 70);
    }
  }

  _key(e) {
    if (!this.active || this.editing) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel) { e.preventDefault(); this.remove(this.sel); }
    else if (e.key === 'Escape') { if (this.el.classList.contains('full')) this.toggleFull(); this.select(null); this.setTool('select'); }
    else if (e.key === 'Enter' && this.sel) { const v = this.store.get(this.sel); if (v && ['sticky', 'text', 'shape'].includes(v.type)) { e.preventDefault(); this.edit(this.sel); } }
  }

  _paste(e) {
    if (!this.active || this.editing) return;
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); this.addImageFile(img.getAsFile()); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text && text.trim()) {
      e.preventDefault();
      const key = 'item:' + uid();
      const c = this.center();
      this.store.set(key, { type: 'sticky', x: c.x - 90, y: c.y - 70, w: 180, h: 140, color: STICKY_COLORS[0], text: text.trim().slice(0, 1000), z: this.maxZ() + 1, by: this.me.id }, { now: true });
      this.select(key);
    }
  }

  // ---------- eksport ----------
  async renderToCanvas(maxW) {
    const b = this.bounds();
    if (!b) return null;
    const pad = 24;
    const scale = Math.min(1.5, maxW / (b.w + pad * 2));
    const W = Math.round((b.w + pad * 2) * scale), H = Math.round((b.h + pad * 2) * scale);
    const cv = document.createElement('canvas');
    const dpr = 2;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FCFCFA'; ctx.fillRect(0, 0, W, H);
    ctx.scale(scale, scale);
    ctx.translate(pad - b.x, pad - b.y);
    const list = this.store.list('item:').map(([k, v]) => [k, v]).sort((a, b2) => (a[1].type === 'stroke') - (b2[1].type === 'stroke') || (a[1].z || 0) - (b2[1].z || 0));
    for (const [key, v] of list) await drawItem(ctx, v, this.itemRect(key, v));
    return cv;
  }
}

// ---------- pomocnicze ----------
function pathD(points) {
  if (!points.length) return '';
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) d += ` L${points[i][0]} ${points[i][1]}`;
  return d;
}

function simplify(points) {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i], [px, py] = out[out.length - 1];
    if (Math.hypot(x - px, y - py) >= 1.5 || i === points.length - 1) out.push(points[i]);
  }
  return out;
}

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

async function downscale(file, max) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}

export function wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/);
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
      else line = test;
    }
    lines.push(line);
  }
  return lines;
}

async function drawItem(ctx, v, r) {
  ctx.save();
  if (v.type === 'sticky') {
    ctx.shadowColor = 'rgba(0,0,0,0.10)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
    ctx.fillStyle = v.color; roundRect(ctx, r.x, r.y, r.w, r.h, 4); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#1A1A1A'; ctx.font = '15px "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'top';
    wrapLines(ctx, v.text, r.w - 28).forEach((l, i) => { if (14 + i * 20 + 20 < r.h) ctx.fillText(l, r.x + 14, r.y + 14 + i * 20); });
  } else if (v.type === 'text') {
    ctx.fillStyle = v.color || '#1A1A1A'; ctx.font = '18px "DM Sans", system-ui, sans-serif'; ctx.textBaseline = 'top';
    String(v.text || '').split('\n').forEach((l, i) => ctx.fillText(l, r.x + 4, r.y + 4 + i * 26));
  } else if (v.type === 'shape') {
    ctx.lineWidth = 2; ctx.strokeStyle = v.color; ctx.fillStyle = v.color + '14';
    if (v.shape === 'oval') { ctx.beginPath(); ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2); }
    else roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1A1A1A'; ctx.font = '15px "DM Sans", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = wrapLines(ctx, v.text, r.w - 20);
    lines.forEach((l, i) => ctx.fillText(l, r.x + r.w / 2, r.y + r.h / 2 + (i - (lines.length - 1) / 2) * 20));
  } else if (v.type === 'image') {
    try { const img = await loadImage(v.src); ctx.drawImage(img, r.x, r.y, r.w, r.h); } catch {}
  } else if (v.type === 'emoji') {
    ctx.font = `${v.size || 44}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; ctx.textBaseline = 'top';
    ctx.fillText(v.emoji, r.x, r.y);
  } else if (v.type === 'stroke') {
    ctx.strokeStyle = v.color; ctx.lineWidth = v.width || 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.translate(v.x, v.y);
    ctx.stroke(new Path2D(pathD(v.points)));
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
