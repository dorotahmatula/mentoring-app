// Stan jednej sesji: mapa klucz → wpis {key, value, ts, by}.
// Każda zmiana to osobny klucz, a nowszy wpis wygrywa, więc dwie osoby mogą pisać naraz bez nadpisywania sobie pracy.

const BIG = 60000; // większe wartości (obrazy) idą przez bazę, a kanałem leci tylko informacja o zmianie

export class SessionStore {
  constructor(backend, session, me) {
    this.backend = backend;
    this.session = session;
    this.me = me;
    this.entries = new Map();
    this.listeners = new Set();
    this.statusListeners = new Set();
    this.queue = new Map();
    this.saving = false;
    this.failed = false;
    this.conn = null;
    this.timer = null;
  }

  async load() {
    const list = await this.backend.loadEntries(this.session.id);
    list.forEach(e => this._merge(e));
  }

  connect(handlers) {
    this.conn = this.backend.join(this.session.id, this.me, {
      onEntry: (e) => this.receive(e),
      onPeers: handlers.onPeers,
      onStatus: handlers.onStatus
    });
  }

  disconnect() {
    this.flush();
    this.conn?.leave();
    this.conn = null;
  }

  _newer(a, b) { return !b || a.ts > b.ts || (a.ts === b.ts && String(a.by) > String(b.by)); }

  _merge(e) {
    if (!e || typeof e.key !== 'string') return false;
    const cur = this.entries.get(e.key);
    if (!this._newer(e, cur)) return false;
    this.entries.set(e.key, e);
    return true;
  }

  get(key) {
    const e = this.entries.get(key);
    return e ? e.value : undefined;
  }

  // Wszystkie żywe (nieusunięte) wpisy z danym początkiem klucza.
  list(prefix) {
    const out = [];
    for (const [k, e] of this.entries) if (k.startsWith(prefix) && e.value !== null && e.value !== undefined) out.push([k, e.value]);
    return out;
  }

  set(key, value, { now = false } = {}) {
    const cur = this.entries.get(key);
    let ts = Date.now();
    if (cur && cur.ts >= ts) ts = cur.ts + 1;
    const e = { key, value, ts, by: this.me.id };
    this._merge(e);
    this._emit([key], true);
    this.queue.set(key, e);
    const big = value && JSON.stringify(value).length > BIG;
    if (big) {
      // Najpierw zapis w bazie, potem sygnał dla drugiej osoby, żeby pobrała obraz.
      this.flush().then(() => this.conn?.send({ key, ts, by: this.me.id, ref: true }));
    } else {
      this.conn?.send(e);
      if (now) this.flush(); else this._schedule();
    }
  }

  receive(e) {
    if (!e) return;
    if (e.ref) {
      const cur = this.entries.get(e.key);
      if (cur && !this._newer(e, cur)) return;
      this.backend.getEntry(this.session.id, e.key).then(full => full && this.receive(full));
      return;
    }
    if (this._merge(e)) this._emit([e.key], false);
  }

  _schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 500);
    this._status();
  }

  async flush() {
    clearTimeout(this.timer);
    if (!this.queue.size) { this._status(); return; }
    const batch = [...this.queue.values()];
    this.queue.clear();
    this.saving = true; this._status();
    try {
      await this.backend.putEntries(this.session.id, batch);
      this.failed = false;
    } catch (err) {
      console.error('Zapis nie powiódł się', err);
      this.failed = true;
      for (const e of batch) if (!this.queue.has(e.key)) this.queue.set(e.key, e);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 4000);
    }
    this.saving = false; this._status();
  }

  pending() { return this.queue.size > 0 || this.saving; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onStatus(fn) { this.statusListeners.add(fn); return () => this.statusListeners.delete(fn); }
  _emit(keys, local) { this.listeners.forEach(fn => fn(keys, local)); }
  _status() { this.statusListeners.forEach(fn => fn({ pending: this.pending(), failed: this.failed })); }
}
