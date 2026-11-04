// Tryb demo: dane w localStorage tej przeglądarki, synchronizacja między kartami przez BroadcastChannel.
// Służy do testów i pokazania narzędzia bez zakładania kont. Każda karta to osobna osoba.

import { uid } from '../util.js?v=202611042219';
import { decorate, scheduleDate } from '../model.js?v=202611042219';

const LS = {
  sessions: 'tablica-demo-sessions',
  mentees: 'tablica-demo-mentees',
  menteePriv: 'tablica-demo-mentee-private',
  sessionPriv: 'tablica-demo-session-private',
  entries: (id) => 'tablica-demo-entries:' + id
};
const SS_USER = 'tablica-demo-user';

function readJSON(store, key, fallback) {
  try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('Zapis lokalny nie powiódł się', e); }
}
const newer = (a, b) => !b || a.ts > b.ts || (a.ts === b.ts && String(a.by) > String(b.by));
const clone = (o) => JSON.parse(JSON.stringify(o));

export function createDemoBackend() {
  let user = readJSON(sessionStorage, SS_USER, null);
  const authListeners = new Set();

  const allSessions = () => readJSON(localStorage, LS.sessions, []);
  const saveSessions = (list) => writeJSON(localStorage, LS.sessions, list);
  const allMentees = () => readJSON(localStorage, LS.mentees, []);
  const saveMentees = (list) => writeJSON(localStorage, LS.mentees, list);

  const myMenteeIds = () => {
    if (!user) return [];
    if (user.isCoach) return allMentees().map(m => m.id);
    return allMentees().filter(m => m.email && m.email === user.email).map(m => m.id);
  };

  function enrich(s) {
    const mentees = allMentees();
    const parts = (s.participants || []).map(p => {
      const m = mentees.find(x => x.id === p.menteeId);
      return { menteeId: p.menteeId, number: p.number, name: m?.name || p.name || '', total: m?.plannedSessions };
    });
    return decorate({ ...clone(s), participants: parts });
  }

  function visible(s) {
    if (!user) return false;
    if (user.isCoach) return true;
    const mine = myMenteeIds();
    return (s.participants || []).some(p => mine.includes(p.menteeId)) || (!!s.clientEmail && s.clientEmail === user.email);
  }

  function nextNumber(menteeId, ignoreId) {
    const nums = allSessions().filter(s => s.id !== ignoreId).flatMap(s => (s.participants || []).filter(p => p.menteeId === menteeId).map(p => p.number));
    return nums.length ? Math.max(...nums) + 1 : 1;
  }

  function isEmptyPlaceholder(s) {
    if (s.status === 'done' || s.startsAt || (s.participants || []).length !== 1) return false;
    const priv = readJSON(localStorage, LS.sessionPriv, {})[s.id];
    if (priv && ((priv.agenda || []).length || (priv.summary || '').trim() || (priv.notes || '').trim())) return false;
    return !Object.keys(readJSON(localStorage, LS.entries(s.id), {})).length;
  }

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

    // ---------- mentee ----------
    async listMentees() {
      const ids = myMenteeIds();
      return allMentees().filter(m => ids.includes(m.id)).sort((a, b) => a.createdAt - b.createdAt);
    },
    async getMentee(id) { return allMentees().find(m => m.id === id && myMenteeIds().includes(id)) || null; },
    async createMentee({ name, email, plannedSessions, schedule, firstStartsAt, topics }) {
      const m = { id: uid() + uid(), ownerId: user.id, name: name.trim(), email: (email || '').trim().toLowerCase(), plannedSessions, schedule, invitedAt: null, createdAt: Date.now() };
      saveMentees([...allMentees(), m]);
      const list = allSessions();
      for (let i = 0; i < plannedSessions; i++) {
        list.push({ id: uid() + uid(), ownerId: user.id, title: topics?.[i] || '', template: i === 0 ? 'jak-dzialamy' : 'none', startsAt: scheduleDate(firstStartsAt, schedule, i), durationMin: 90, status: 'planned', output: '', sharedSummary: '', frameworks: [], participants: [{ menteeId: m.id, number: i + 1 }], createdAt: Date.now() + i });
      }
      saveSessions(list);
      return m;
    },
    async updateMentee(id, patch) {
      saveMentees(allMentees().map(m => m.id === id ? { ...m, ...patch } : m));
    },
    async deleteMentee(id) {
      let list = allSessions();
      const gone = [];
      list = list.filter(s => {
        if (!(s.participants || []).some(p => p.menteeId === id)) return true;
        if (s.participants.length === 1) { gone.push(s.id); return false; }
        s.participants = s.participants.filter(p => p.menteeId !== id);
        return true;
      });
      saveSessions(list);
      const sp = readJSON(localStorage, LS.sessionPriv, {});
      gone.forEach(sid => { delete sp[sid]; try { localStorage.removeItem(LS.entries(sid)); } catch {} });
      writeJSON(localStorage, LS.sessionPriv, sp);
      const mp = readJSON(localStorage, LS.menteePriv, {}); delete mp[id]; writeJSON(localStorage, LS.menteePriv, mp);
      saveMentees(allMentees().filter(m => m.id !== id));
    },
    async inviteMentee(id) {
      saveMentees(allMentees().map(m => m.id === id ? { ...m, invitedAt: new Date().toISOString() } : m));
    },
    async getMenteePrivate(id) { return readJSON(localStorage, LS.menteePriv, {})[id] || { about: '', notes: '' }; },
    async saveMenteePrivate(id, patch) {
      const all = readJSON(localStorage, LS.menteePriv, {});
      all[id] = { ...(all[id] || { about: '', notes: '' }), ...patch };
      writeJSON(localStorage, LS.menteePriv, all);
    },

    // ---------- sesje ----------
    async listSessions() {
      return allSessions().filter(visible).map(enrich);
    },
    async createSession({ title, template, startsAt, durationMin, menteeIds }) {
      const s = { id: uid() + uid(), ownerId: user.id, title: title || '', template: template || 'none', startsAt: startsAt || null, durationMin: durationMin || 90, status: 'planned', output: '', sharedSummary: '', frameworks: [], participants: (menteeIds || []).map(mid => ({ menteeId: mid, number: nextNumber(mid) })), createdAt: Date.now() };
      saveSessions([...allSessions(), s]);
      return enrich(s);
    },
    async getSession(id) {
      const s = allSessions().find(x => x.id === id);
      return s && visible(s) ? enrich(s) : null;
    },
    async updateSession(id, patch) {
      saveSessions(allSessions().map(s => s.id === id ? { ...s, ...patch } : s));
    },
    async addParticipant(sessionId, menteeId) {
      let list = allSessions();
      const s = list.find(x => x.id === sessionId);
      if (!s || s.participants.some(p => p.menteeId === menteeId)) return;
      // Najbliższa nieodbyta sesja tej mentee: jeśli to pusty plan, zastępujemy ją sesją wspólną.
      const mine = list.filter(x => x.id !== sessionId && x.status !== 'done' && x.participants.some(p => p.menteeId === menteeId))
        .sort((a, b) => a.participants.find(p => p.menteeId === menteeId).number - b.participants.find(p => p.menteeId === menteeId).number);
      let number = nextNumber(menteeId, sessionId);
      const placeholder = mine.find(isEmptyPlaceholder);
      if (placeholder) { number = placeholder.participants[0].number; list = list.filter(x => x.id !== placeholder.id); }
      s.participants.push({ menteeId, number });
      saveSessions(list);
    },
    async setNumber(sessionId, menteeId, number) {
      saveSessions(allSessions().map(s => s.id === sessionId ? { ...s, participants: s.participants.map(p => p.menteeId === menteeId ? { ...p, number } : p) } : s));
    },
    async leaveSession(sessionId, menteeId) {
      saveSessions(allSessions().map(s => s.id === sessionId ? { ...s, participants: s.participants.filter(p => p.menteeId !== menteeId) } : s));
    },
    async removeParticipant(sessionId, menteeId) {
      const list = allSessions();
      const s = list.find(x => x.id === sessionId);
      if (!s || s.participants.length < 2) return;
      const p = s.participants.find(x => x.menteeId === menteeId);
      s.participants = s.participants.filter(x => x.menteeId !== menteeId);
      if (p) list.push({ id: uid() + uid(), ownerId: user.id, title: '', template: 'none', startsAt: null, durationMin: 90, status: 'planned', output: '', sharedSummary: '', frameworks: [], participants: [{ menteeId, number: p.number }], createdAt: Date.now() });
      saveSessions(list);
    },
    async deleteSession(id) { saveSessions(allSessions().filter(s => s.id !== id)); },
    async getSessionPrivate(id) { return readJSON(localStorage, LS.sessionPriv, {})[id] || { agenda: [], agendaReady: false, summary: '', notes: '' }; },
    async saveSessionPrivate(id, patch) {
      const all = readJSON(localStorage, LS.sessionPriv, {});
      all[id] = { ...(all[id] || { agenda: [], agendaReady: false, summary: '', notes: '' }), ...patch };
      writeJSON(localStorage, LS.sessionPriv, all);
    },

    // ---------- wpisy sesji na żywo ----------
    async loadEntries(id) { return Object.values(readJSON(localStorage, LS.entries(id), {})); },
    async getEntry(id, key) { return readJSON(localStorage, LS.entries(id), {})[key] || null; },
    async putEntries(id, entries) {
      const all = readJSON(localStorage, LS.entries(id), {});
      for (const e of entries) if (newer(e, all[e.key])) all[e.key] = e;
      writeJSON(localStorage, LS.entries(id), all);
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
