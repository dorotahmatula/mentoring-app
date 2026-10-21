// Tryb demo: dane w localStorage tej przeglądarki, synchronizacja między kartami przez BroadcastChannel.
// Służy do testów i pokazania narzędzia bez zakładania kont. Każda karta to osobna osoba.

import { uid } from '../util.js';

const LS_SESSIONS = 'tablica-demo-sessions';
const LS_ENTRIES = (id) => 'tablica-demo-entries:' + id;
const SS_USER = 'tablica-demo-user';

function readJSON(store, key, fallback) {
  try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('Zapis lokalny nie powiódł się', e); }
}

const newer = (a, b) => !b || a.ts > b.ts || (a.ts === b.ts && String(a.by) > String(b.by));

export function createDemoBackend() {
  let user = readJSON(sessionStorage, SS_USER, null);
  const authListeners = new Set();

  return {
    mode: 'demo',
    async init() {},
    getUser: () => user,
    onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async signInDemo({ name, role, email }) {
      user = { id: 'u_' + uid(), name: name.trim(), email: (email || '').trim().toLowerCase(), isCoach: role === 'coach' };
      writeJSON(sessionStorage, SS_USER, user);
      authListeners.forEach(fn => fn(user));
      return user;
    },
    async signOut() {
      user = null;
      try { sessionStorage.removeItem(SS_USER); } catch {}
      authListeners.forEach(fn => fn(null));
    },

    async listSessions() {
      const all = readJSON(localStorage, LS_SESSIONS, []);
      const mine = user?.isCoach ? all : all.filter(s => !s.clientEmail || !user?.email || s.clientEmail === user.email);
      return mine.sort((a, b) => b.createdAt - a.createdAt);
    },
    async createSession({ clientName, clientEmail, number, total }) {
      const all = readJSON(localStorage, LS_SESSIONS, []);
      const s = { id: uid() + uid(), clientName, clientEmail: (clientEmail || '').toLowerCase(), number, total, title: 'Jak działamy i cele', template: 'jak-dzialamy', ownerId: user.id, createdAt: Date.now() };
      all.push(s);
      writeJSON(localStorage, LS_SESSIONS, all);
      return s;
    },
    async getSession(id) {
      return readJSON(localStorage, LS_SESSIONS, []).find(s => s.id === id) || null;
    },

    async loadEntries(id) {
      return Object.values(readJSON(localStorage, LS_ENTRIES(id), {}));
    },
    async getEntry(id, key) {
      return readJSON(localStorage, LS_ENTRIES(id), {})[key] || null;
    },
    async putEntries(id, entries) {
      const all = readJSON(localStorage, LS_ENTRIES(id), {});
      for (const e of entries) if (newer(e, all[e.key])) all[e.key] = e;
      writeJSON(localStorage, LS_ENTRIES(id), all);
    },

    join(id, me, { onEntry, onPeers, onStatus }) {
      const ch = new BroadcastChannel('tablica-demo:' + id);
      const peers = new Map();
      const emitPeers = () => onPeers([me, ...[...peers.values()].map(p => p.info)]);
      const hello = (type) => ch.postMessage({ type, peer: me });
      ch.onmessage = (ev) => {
        const m = ev.data || {};
        if (m.type === 'op') onEntry(m.entry);
        else if (m.type === 'hello' || m.type === 'here' || m.type === 'beat') {
          const isNew = !peers.has(m.peer.id);
          peers.set(m.peer.id, { info: m.peer, seen: Date.now() });
          if (m.type === 'hello') hello('here');
          if (isNew) emitPeers();
        } else if (m.type === 'bye') { peers.delete(m.peer.id); emitPeers(); }
      };
      hello('hello');
      emitPeers();
      onStatus && onStatus('live');
      const beat = setInterval(() => {
        hello('beat');
        const now = Date.now(); let changed = false;
        for (const [k, p] of peers) if (now - p.seen > 8000) { peers.delete(k); changed = true; }
        if (changed) emitPeers();
      }, 3000);
      const bye = () => hello('bye');
      window.addEventListener('pagehide', bye);
      return {
        send(entry) { ch.postMessage({ type: 'op', entry }); },
        leave() { bye(); clearInterval(beat); window.removeEventListener('pagehide', bye); ch.close(); }
      };
    }
  };
}
