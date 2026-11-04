// Prawdziwy tryb: Supabase (logowanie linkiem na maila, baza danych, kanał na żywo).
// Biblioteka ładuje się w przeglądarce z CDN, więc strona nie potrzebuje kroku budowania.

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm';
import { decorate, scheduleDate, numberFor } from '../model.js?v=202611042200';

const LS_RETURN = 'tablica-return-to';

const SESSION_SELECT = '*, session_participants(mentee_id, number, name, mentees(planned_sessions))';

const mapMentee = (r) => r && ({
  id: r.id, ownerId: r.owner_id, name: r.name, email: r.email, plannedSessions: r.planned_sessions,
  schedule: r.schedule, invitedAt: r.invited_at, createdAt: new Date(r.created_at).getTime()
});

const mapSession = (r) => r && decorate({
  id: r.id, ownerId: r.owner_id, title: r.title, template: r.template, startsAt: r.starts_at, durationMin: r.duration_min,
  status: r.status || 'planned', output: r.output || '', sharedSummary: r.shared_summary || '', frameworks: r.frameworks || [],
  clientName: r.client_name, clientEmail: r.client_email, number: r.number, total: r.total,
  participants: (r.session_participants || []).map(p => ({ menteeId: p.mentee_id, number: p.number, name: p.name, total: p.mentees?.planned_sessions })),
  createdAt: new Date(r.created_at).getTime()
});

export async function createSupabaseBackend({ supabaseUrl, supabaseAnonKey, coachName }) {
  const { createClient } = await import(SUPABASE_ESM);
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });
  let user = null;
  const authListeners = new Set();

  async function nextNumber(menteeId) {
    const { data } = await sb.from('session_participants').select('number').eq('mentee_id', menteeId);
    return (data || []).reduce((m, r) => Math.max(m, r.number), 0) + 1;
  }
  async function isEmptyPlaceholder(s) {
    if (s.status === 'done' || s.startsAt || (s.title || '').trim() || s.participants.length !== 1) return false;
    const { data: priv } = await sb.from('session_private').select('agenda, summary, notes').eq('session_id', s.id).maybeSingle();
    if (priv && ((priv.agenda || []).length || (priv.summary || '').trim() || (priv.notes || '').trim())) return false;
    const { count } = await sb.from('session_entries').select('key', { count: 'exact', head: true }).eq('session_id', s.id);
    return !count;
  }

  async function toUser(session) {
    if (!session?.user) return null;
    const email = (session.user.email || '').toLowerCase();
    let isCoach = false;
    try {
      const { data } = await sb.from('coaches').select('email, name').eq('email', email).maybeSingle();
      isCoach = !!data;
      if (data?.name) return { id: session.user.id, email, name: data.name, isCoach };
    } catch {}
    const meta = session.user.user_metadata || {};
    return { id: session.user.id, email, name: meta.name || (isCoach ? coachName : email.split('@')[0]), isCoach };
  }

  return {
    mode: 'supabase',
    async init() {
      const { data } = await sb.auth.getSession();
      user = await toUser(data.session);
      if (location.hash.includes('access_token') || location.hash.includes('error_description')) {
        let back = '#/';
        try { back = localStorage.getItem(LS_RETURN) || '#/'; localStorage.removeItem(LS_RETURN); } catch {}
        history.replaceState(null, '', location.pathname + back);
      }
      if (data.session) { try { sb.realtime.setAuth(data.session.access_token); } catch {} }
      sb.auth.onAuthStateChange((_ev, session) => {
        // Supabase zaleca nie wołać innych zapytań wprost w tym miejscu, więc odkładamy je o chwilę.
        setTimeout(async () => {
          if (session) { try { sb.realtime.setAuth(session.access_token); } catch {} }
          const next = await toUser(session);
          if ((next?.id || null) !== (user?.id || null)) { user = next; authListeners.forEach(fn => fn(user)); }
        }, 0);
      });
    },
    getUser: () => user,
    onAuthChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); },

    async sendLoginLink(email) {
      try { localStorage.setItem(LS_RETURN, location.hash && !location.hash.includes('access_token') ? location.hash : '#/'); } catch {}
      const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
    },
    async signOut() { await sb.auth.signOut(); user = null; authListeners.forEach(fn => fn(null)); },

    // ---------- mentee ----------
    async listMentees() {
      const { data, error } = await sb.from('mentees').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data.map(mapMentee);
    },
    async getMentee(id) {
      const { data, error } = await sb.from('mentees').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return mapMentee(data);
    },
    async createMentee({ name, email, plannedSessions, schedule, firstStartsAt, topics }) {
      const { data: m, error } = await sb.from('mentees').insert({ owner_id: user.id, name: name.trim(), email: (email || '').trim().toLowerCase(), planned_sessions: plannedSessions, schedule }).select().single();
      if (error) throw error;
      const rows = Array.from({ length: plannedSessions }, (_, i) => ({
        owner_id: user.id, title: topics?.[i] || '', template: i === 0 ? 'jak-dzialamy' : 'none',
        starts_at: scheduleDate(firstStartsAt, schedule, i), status: 'planned', client_name: m.name, number: i + 1, total: plannedSessions
      }));
      const { data: ss, error: e2 } = await sb.from('sessions').insert(rows).select('id, number');
      if (e2) throw e2;
      const { error: e3 } = await sb.from('session_participants').insert(ss.map(x => ({ session_id: x.id, mentee_id: m.id, number: x.number, name: m.name })));
      if (e3) throw e3;
      return mapMentee(m);
    },
    async updateMentee(id, patch) {
      const row = {};
      if ('name' in patch) row.name = patch.name;
      if ('email' in patch) row.email = (patch.email || '').trim().toLowerCase();
      if ('plannedSessions' in patch) row.planned_sessions = patch.plannedSessions;
      if ('schedule' in patch) row.schedule = patch.schedule;
      const { error } = await sb.from('mentees').update(row).eq('id', id);
      if (error) throw error;
    },
    async inviteMentee(id) {
      const m = await this.getMentee(id);
      if (!m?.email) throw new Error('Brak adresu e-mail');
      const { error } = await sb.auth.signInWithOtp({ email: m.email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      const { error: e2 } = await sb.from('mentees').update({ invited_at: new Date().toISOString() }).eq('id', id);
      if (e2) throw e2;
    },
    async getMenteePrivate(id) {
      const { data } = await sb.from('mentee_private').select('about, notes').eq('mentee_id', id).maybeSingle();
      return data || { about: '', notes: '' };
    },
    async saveMenteePrivate(id, patch) {
      const { error } = await sb.from('mentee_private').upsert({ mentee_id: id, owner_id: user.id, ...patch });
      if (error) throw error;
    },

    // ---------- sesje ----------
    async listSessions() {
      const { data, error } = await sb.from('sessions').select(SESSION_SELECT).order('created_at', { ascending: true });
      if (error) throw error;
      return data.map(mapSession);
    },
    async createSession({ title, template, startsAt, durationMin, menteeIds }) {
      const ms = await Promise.all((menteeIds || []).map(id => this.getMentee(id)));
      const numbers = await Promise.all(ms.map(m => nextNumber(m.id)));
      const { data: s, error } = await sb.from('sessions').insert({ owner_id: user.id, title: title || '', template: template || 'none', starts_at: startsAt || null, duration_min: durationMin || 90, status: 'planned', client_name: ms.map(m => m.name).join(' + '), number: numbers[0] || 1, total: ms[0]?.plannedSessions || 6 }).select().single();
      if (error) throw error;
      if (ms.length) {
        const { error: e2 } = await sb.from('session_participants').insert(ms.map((m, i) => ({ session_id: s.id, mentee_id: m.id, number: numbers[i], name: m.name })));
        if (e2) throw e2;
      }
      return this.getSession(s.id);
    },
    async getSession(id) {
      const { data, error } = await sb.from('sessions').select(SESSION_SELECT).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? mapSession(data) : null;
    },
    async updateSession(id, patch) {
      const row = {};
      const map = { title: 'title', template: 'template', startsAt: 'starts_at', durationMin: 'duration_min', status: 'status', output: 'output', sharedSummary: 'shared_summary', frameworks: 'frameworks' };
      for (const [k, col] of Object.entries(map)) if (k in patch) row[col] = patch[k];
      const { error } = await sb.from('sessions').update(row).eq('id', id);
      if (error) throw error;
    },
    async addParticipant(sessionId, menteeId) {
      const m = await this.getMentee(menteeId);
      const all = await this.listSessions();
      const mine = all.filter(x => x.id !== sessionId && x.status !== 'done' && x.participants.some(p => p.menteeId === menteeId))
        .sort((a, b) => numberFor(a, menteeId) - numberFor(b, menteeId));
      let number = await nextNumber(menteeId);
      for (const x of mine) {
        if (await isEmptyPlaceholder(x)) { number = numberFor(x, menteeId); await sb.from('sessions').delete().eq('id', x.id); break; }
      }
      const { error } = await sb.from('session_participants').insert({ session_id: sessionId, mentee_id: menteeId, number, name: m.name });
      if (error) throw error;
    },
    async removeParticipant(sessionId, menteeId) {
      const s = await this.getSession(sessionId);
      if (!s || s.participants.length < 2) return;
      const p = s.participants.find(x => x.menteeId === menteeId);
      const { error } = await sb.from('session_participants').delete().eq('session_id', sessionId).eq('mentee_id', menteeId);
      if (error) throw error;
      if (p) {
        const { data: ns } = await sb.from('sessions').insert({ owner_id: user.id, title: '', template: 'none', status: 'planned', client_name: p.name, number: p.number, total: p.total || 6 }).select().single();
        if (ns) await sb.from('session_participants').insert({ session_id: ns.id, mentee_id: menteeId, number: p.number, name: p.name });
      }
    },
    async deleteSession(id) {
      const { error } = await sb.from('sessions').delete().eq('id', id);
      if (error) throw error;
    },
    async getSessionPrivate(id) {
      const { data } = await sb.from('session_private').select('agenda, agenda_ready, summary, notes').eq('session_id', id).maybeSingle();
      return data ? { agenda: data.agenda || [], agendaReady: data.agenda_ready, summary: data.summary, notes: data.notes } : { agenda: [], agendaReady: false, summary: '', notes: '' };
    },
    async saveSessionPrivate(id, patch) {
      const row = { session_id: id, owner_id: user.id };
      if ('agenda' in patch) row.agenda = patch.agenda;
      if ('agendaReady' in patch) row.agenda_ready = patch.agendaReady;
      if ('summary' in patch) row.summary = patch.summary;
      if ('notes' in patch) row.notes = patch.notes;
      const { error } = await sb.from('session_private').upsert(row);
      if (error) throw error;
    },

    async loadEntries(id) {
      const { data, error } = await sb.from('session_entries').select('key, value, ts, updated_by').eq('session_id', id);
      if (error) throw error;
      return data.map(r => ({ key: r.key, value: r.value, ts: Number(r.ts), by: r.updated_by }));
    },
    async getEntry(id, key) {
      const { data } = await sb.from('session_entries').select('key, value, ts, updated_by').eq('session_id', id).eq('key', key).maybeSingle();
      return data ? { key: data.key, value: data.value, ts: Number(data.ts), by: data.updated_by } : null;
    },
    async putEntries(id, entries) {
      const { error } = await sb.rpc('put_entries', { p_session: id, p_entries: entries.map(e => ({ key: e.key, value: e.value, ts: e.ts })) });
      if (error) throw error;
    },

    join(id, me, { onEntry, onPeers, onStatus }) {
      const ch = sb.channel('session:' + id, { config: { private: true, broadcast: { self: false }, presence: { key: me.id } } });
      ch.on('broadcast', { event: 'op' }, ({ payload }) => onEntry(payload));
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        onPeers(Object.values(state).map(list => list[0]).filter(Boolean));
      });
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') { await ch.track({ id: me.id, name: me.name, isCoach: me.isCoach }); onStatus && onStatus('live'); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus && onStatus('off');
      });
      return {
        send(entry) { ch.send({ type: 'broadcast', event: 'op', payload: entry }); },
        leave() { sb.removeChannel(ch); }
      };
    }
  };
}
