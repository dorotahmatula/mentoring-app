// Wspólne pojęcia: mentee, sesje, statusy. Używane przez oba tryby (demo i Supabase) i przez ekrany.

export const TEMPLATES = {
  'jak-dzialamy': 'Jak działamy i cele + tablica',
  'none': 'Sama tablica'
};

export const SCHEDULES = {
  individual: 'Każdą sesję ustalam osobno',
  weekly: 'Stały rytm: co tydzień',
  biweekly: 'Stały rytm: co 2 tygodnie',
  monthly: 'Stały rytm: co miesiąc'
};

// Uzupełnia sesję o pola używane na ekranach: kto, która sesja, ile wszystkich.
export function decorate(s) {
  const parts = (s.participants || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pl'));
  s.participants = parts;
  s.clientName = parts.length ? parts.map(p => p.name).join(' + ') : (s.clientName || '');
  s.number = parts[0]?.number ?? s.number ?? 1;
  s.total = parts[0]?.total ?? s.total ?? Math.max(s.number || 1, 6);
  s.joint = parts.length > 1;
  return s;
}

export function numberFor(session, menteeId) {
  return session.participants?.find(p => p.menteeId === menteeId)?.number ?? session.number;
}

export function sessionTitle(s) {
  return (s.title || '').trim() || 'Temat do ustalenia';
}

export function hasTopic(s) { return !!(s.title || '').trim(); }

const DAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

export function fmtWhen(iso, { withDay = true, withTime = true } = {}) {
  if (!iso) return 'termin do ustalenia';
  const d = new Date(iso);
  if (isNaN(d)) return 'termin do ustalenia';
  const date = `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${withDay ? DAYS[d.getDay()] + ' ' : ''}${date}${withTime ? ' · ' + time : ''}`;
}

export function fmtDateLong(iso) {
  if (!iso) return 'termin do ustalenia';
  const d = new Date(iso);
  return d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Wartość dla pola <input type="datetime-local">
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }

// Status sesji widoczny dla mentorki: [tekst, rodzaj]
export function coachStatus(s, priv) {
  if (s.status === 'done') return ['Odbyta', 'ok'];
  const agenda = priv?.agenda || [];
  if (!s.startsAt && !hasTopic(s)) return ['Niezaplanowana', 'muted'];
  if (!s.startsAt) return ['Bez terminu', 'warn'];
  if (!agenda.length) return ['Brak agendy', 'warn'];
  if (!priv?.agendaReady) return ['Agenda do dopięcia', 'warn'];
  return ['Agenda gotowa', 'accent'];
}

export function menteeStatus(s, isNext) {
  if (s.status === 'done') return ['Odbyta', 'ok'];
  if (isNext) return ['Następna', 'accent'];
  return null;
}

// Rozwiązuje kolejność: następna sesja danej mentee = najniższy numer, który się jeszcze nie odbył.
export function nextFor(sessions, menteeId) {
  return sessions
    .filter(s => s.status !== 'done' && s.participants?.some(p => p.menteeId === menteeId))
    .sort((a, b) => numberFor(a, menteeId) - numberFor(b, menteeId))[0] || null;
}

export function sortByNumber(sessions, menteeId) {
  return sessions.slice().sort((a, b) => numberFor(a, menteeId) - numberFor(b, menteeId));
}

// Rytm: data kolejnej sesji na podstawie pierwszej
export function scheduleDate(firstIso, schedule, index) {
  if (!firstIso || schedule === 'individual' || index === 0) return index === 0 ? firstIso : null;
  const d = new Date(firstIso);
  if (schedule === 'weekly') d.setDate(d.getDate() + 7 * index);
  else if (schedule === 'biweekly') d.setDate(d.getDate() + 14 * index);
  else if (schedule === 'monthly') d.setMonth(d.getMonth() + index);
  return d.toISOString();
}
