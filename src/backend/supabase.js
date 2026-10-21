// Prawdziwy tryb: Supabase (logowanie linkiem na maila, baza danych, kanał na żywo).
// Biblioteka ładuje się w przeglądarce z CDN, więc strona nie potrzebuje kroku budowania.

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.9/+esm';
const LS_RETURN = 'tablica-return-to';

const mapSession = (r) => r && ({
  id: r.id, clientName: r.client_name, clientEmail: r.client_email, number: r.number, total: r.total,
  title: r.title, template: r.template, ownerId: r.owner_id, createdAt: new Date(r.created_at).getTime()
});

export async function createSupabaseBackend({ supabaseUrl, supabaseAnonKey, coachName }) {
  const { createClient } = await import(SUPABASE_ESM);
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
  });
  let user = null;
  const authListeners = new Set();

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

    async listSessions() {
      const { data, error } = await sb.from('sessions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(mapSession);
    },
    async createSession({ clientName, clientEmail, number, total }) {
      const { data, error } = await sb.from('sessions').insert({
        owner_id: user.id, client_name: clientName, client_email: (clientEmail || '').trim().toLowerCase(),
        number, total, title: 'Jak działamy i cele', template: 'jak-dzialamy'
      }).select().single();
      if (error) throw error;
      return mapSession(data);
    },
    async getSession(id) {
      const { data, error } = await sb.from('sessions').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return mapSession(data);
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
