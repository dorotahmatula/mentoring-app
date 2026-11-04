// Ekrany mentee: mój proces i karta sesji.

import { h, toast } from '../util.js?v=202611042217';
import { shell, loading, failed, badge, bar, panel, autoText } from './ui.js?v=202611042217';
import { numberFor, sessionTitle, hasTopic, fmtWhen, fmtDateLong, nextFor, sortByNumber, menteeStatus } from '../model.js?v=202611042217';
import { HOW_FIELDS, TAKE_FIELDS, genitive } from '../template.js?v=202611042217';
import { readEntries, goalsFrom, parkingFrom } from './coach.js?v=202611042217';
import { exportSessionPNG } from '../export.js?v=202611042217';
import { Board } from '../board.js?v=202611042217';
import { Votes } from '../votes.js?v=202611042217';

async function context(backend) {
  const [mentees, sessions] = await Promise.all([backend.listMentees(), backend.listSessions()]);
  const me = mentees[0] || null;
  const mine = me ? sortByNumber(sessions.filter(s => s.participants.some(p => p.menteeId === me.id)), me.id) : [];
  return { me, mine, sessions };
}

function noProcess(app, backend, user) {
  shell(app, backend, user, [], h('div', { class: 'panel' },
    h('h1', { style: { margin: 0, fontFamily: 'var(--serif)', color: 'var(--accent)', fontSize: '26px' } }, 'Twój proces jeszcze się nie zaczął'),
    h('p', {}, `Jesteś zalogowana jako ${user.email || user.name}. Gdy mentorka doda Cię do procesu pod tym adresem, zobaczysz tu plan sesji.`),
    h('p', { class: 'small muted' }, 'Jeśli dostałaś zaproszenie na inny adres, wyloguj się i zaloguj tamtym.')));
}

// ============ MÓJ PROCES ============
export async function renderMyProcess(app, backend, user, cfg) {
  loading(app);
  let ctx;
  try { ctx = await context(backend); } catch (e) { console.error(e); failed(app, backend, user); return () => {}; }
  const { me, mine } = ctx;
  if (!me) { noProcess(app, backend, user); return () => {}; }
  const coachName = cfg.coachName || 'Dorota';
  const done = mine.filter(s => s.status === 'done');
  const total = Math.max(mine.length, me.plannedSessions || 0);
  const next = nextFor(mine, me.id);

  const goalSession = mine.find(s => s.template === 'jak-dzialamy');
  const gst = goalSession ? await readEntries(backend, goalSession, user) : null;
  const goals = gst ? goalsFrom(gst) : [];
  const how = gst ? HOW_FIELDS(coachName).map(([k, label]) => [label, gst.get(k)]).filter(([, v]) => (v || '').trim()) : [];

  // Do dokończenia: frameworki w toku i mój krok z ostatniej odbytej sesji
  const todo = [];
  const last = done.slice().sort((a, b) => numberFor(b, me.id) - numberFor(a, me.id))[0];
  if (last) {
    const lst = await readEntries(backend, last, user);
    const step = lst.get('take:next');
    if ((step || '').trim()) todo.push(['Mój krok', step, '#/k/' + last.id]);
  }
  for (const s of mine) for (const f of s.frameworks || []) if (f.status !== 'done') todo.push(['Do dokończenia', f.name, '#/k/' + s.id]);

  const hero = next
    ? h('section', { class: 'hero' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
        h('span', { class: 'k' }, `Następna sesja · ${next.joint ? 'wspólna' : `sesja ${numberFor(next, me.id)} z ${total}`}`),
        h('span', { class: 't' }, sessionTitle(next)),
        h('span', { class: 'w' }, next.startsAt ? fmtDateLong(next.startsAt) : 'Termin do ustalenia z mentorką')),
      h('div', { class: 'actions' }, h('a', { href: '#/k/' + next.id, class: 'btn ghost btn-lg' }, 'Karta sesji'), h('a', { href: '#/s/' + next.id, class: 'btn btn-lg' }, 'Otwórz tablicę')))
    : h('section', { class: 'hero' }, h('div', {}, h('span', { class: 't' }, done.length ? 'Wszystkie zaplanowane sesje są za Tobą' : 'Plan w przygotowaniu')));

  const rows = mine.map(s => h('a', { href: '#/k/' + s.id, class: 'row' },
    h('span', { class: 'num' + (s.status === 'done' ? ' done' : hasTopic(s) || s.startsAt ? '' : ' empty') }, numberFor(s, me.id)),
    h('div', { class: 'row-main' },
      h('span', { class: 'row-title' + (hasTopic(s) ? '' : ' dim') }, sessionTitle(s)),
      h('span', { class: 'small muted' }, (s.status === 'done' && s.output ? s.output.slice(0, 80) : fmtWhen(s.startsAt)) + (s.joint ? ' · sesja wspólna' : ''))),
    badge(menteeStatus(s, next && s.id === next.id))));

  shell(app, backend, user, [h('strong', {}, 'Mój proces')],
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, `Cześć, ${me.name.split(' ')[0]}`), h('p', { class: 'sub' }, `Proces mentoringowy · mentorka: ${coachName} · ${done.length} z ${total} sesji`)),
      bar(done.length, total)),
    hero,
    h('div', { class: 'cols2' },
      h('div', { class: 'main' }, panel('', 'Sesje', null, h('div', { class: 'rows' }, rows))),
      h('div', { class: 'aside' },
        panel('', 'Moje cele', null, goals.length
          ? goals.map((g, i) => h('div', { class: 'kv' }, h('span', {}, `Cel ${i + 1}`), h('span', {}, g.learn || g.success), g.success && g.learn ? h('span', { class: 'small muted' }, 'Po czym poznam: ' + g.success) : null, h('span', { class: 'small muted' }, `Gdzie jestem: ${g.today ? g.today + '/10' : '–'}`)))
          : h('p', { class: 'small muted' }, 'Cele zapiszemy razem na pierwszej sesji.')),
        how.length ? panel('', 'Jak działamy', null, ...how.map(([label, v]) => h('div', { class: 'kv' }, h('span', {}, label), h('span', {}, v)))) : null,
        panel('warm', 'Do dokończenia', null, todo.length
          ? todo.map(([k, v, href]) => h('a', { href, class: 'kv', style: { color: 'inherit', textDecoration: 'none' } }, h('span', {}, k), h('span', {}, v)))
          : h('p', { class: 'small muted' }, 'Nic nie czeka. Twój krok po sesji pojawi się tutaj.')))));
  return () => {};
}

// ============ KARTA SESJI (mentee) ============
export async function renderMySession(app, backend, user, sessionId, cfg) {
  loading(app);
  let ctx, s;
  try { [ctx, s] = await Promise.all([context(backend), backend.getSession(sessionId)]); } catch (e) { console.error(e); failed(app, backend, user); return () => {}; }
  if (!s || !ctx.me) { failed(app, backend, user, 'Nie ma tej sesji albo należy do innej osoby.'); return () => {}; }
  const { me, mine } = ctx;
  const coachName = cfg.coachName || 'Dorota';
  const n = numberFor(s, me.id);
  const total = Math.max(mine.length, me.plannedSessions || 0);
  const isDone = s.status === 'done';
  const meUser = { ...user, name: me.name };
  const st = await readEntries(backend, s, meUser);

  const takes = TAKE_FIELDS({ ...s, number: n }).map(([k, label]) => h('label', { class: 'field-label' }, label,
    autoText(st.get(k), async v => { st.set(k, v); await st.flush(); }, { rows: 2, label, placeholder: 'Wpisz…' })));
  const parking = parkingFrom(st);
  const prev = mine.filter(x => x.status === 'done' && numberFor(x, me.id) < n).sort((a, b) => numberFor(b, me.id) - numberFor(a, me.id))[0];
  let prevStep = '';
  if (!isDone && prev) { const pst = await readEntries(backend, prev, meUser); prevStep = pst.get('take:next') || ''; }

  const pngBtn = h('button', { type: 'button', class: 'btn btn-lg' }, 'Pobierz PNG');
  pngBtn.addEventListener('click', async () => {
    pngBtn.disabled = true;
    const holder = h('div', { style: { position: 'fixed', left: '-5000px', top: 0, width: '1200px', height: '800px' }, 'aria-hidden': 'true' });
    let board;
    try {
      const votes = new Votes(st, meUser);
      board = new Board(st, meUser, votes);
      holder.append(board.el); document.body.append(holder);
      const name = await exportSessionPNG({ session: { ...s, number: n, total, clientName: s.clientName }, store: st, coachName, board, votes });
      toast('Pobrano ' + name);
    } catch (e) { console.error(e); toast('Eksport się nie udał. Spróbuj jeszcze raz.'); }
    try { board?.destroy(); } catch {}
    holder.remove();
    pngBtn.disabled = false;
  });

  shell(app, backend, user, [h('a', { href: '#/', style: { color: 'inherit', textDecoration: 'none' } }, 'Mój proces'), h('strong', {}, `Sesja ${n}`)],
    h('div', { class: 'page-head' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('span', { class: 'eyebrow' + (isDone ? ' ok' : '') }, `${s.joint ? 'Sesja wspólna · ' : ''}Sesja ${n} z ${total} · ${isDone ? 'odbyta' : 'przed nami'}`),
        h('h1', {}, sessionTitle(s)),
        h('span', { class: 'sub', style: { margin: 0 } }, `${s.startsAt ? fmtDateLong(s.startsAt) : 'Termin do ustalenia'}${s.joint ? ' · ' + s.clientName : ''}`)),
      h('div', { class: 'actions' }, isDone ? pngBtn : null, h('a', { href: '#/s/' + s.id, class: 'btn btn-primary btn-lg' }, isDone ? 'Zobacz tablicę' : 'Otwórz tablicę'))),
    h('div', { class: 'cols2' },
      h('div', { class: 'main' },
        isDone && (s.output || '').trim() ? panel('', 'Output sesji', null, h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, s.output)) : null,
        panel('tint', 'Co zabieram', h('span', { class: 'small muted' }, 'zapisuje się samo'), ...takes),
        isDone && (s.sharedSummary || '').trim() ? panel('', 'Podsumowanie sesji', h('span', { class: 'small muted' }, `od ${genitive(coachName)}`), h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, s.sharedSummary)) : null,
        !isDone ? panel('', 'Przed sesją', null,
          prevStep ? h('div', { class: 'kv' }, h('span', {}, `Mój krok z sesji ${numberFor(prev, me.id)}`), h('span', {}, prevStep)) : null,
          h('p', { class: 'small muted', style: { margin: 0 } }, 'Tablica otworzy się w przeglądarce. Wystarczy wejść w link w trakcie spotkania na Meet.')) : null),
      h('div', { class: 'aside' },
        (s.frameworks || []).length ? panel('', 'Frameworki', null, ...s.frameworks.map(f => h('div', { class: 'panel-head' }, h('span', {}, f.name), badge(f.status === 'done' ? ['Done', 'ok'] : ['In progress', 'warn'])))) : null,
        panel('', 'Parking', h('span', { class: 'small muted' }, 'wracamy do tego później'), parking.length ? parking.map(t => h('span', {}, t)) : h('p', { class: 'small muted', style: { margin: 0 } }, 'Brak tematów.')))));
  return () => { st.flush(); };
}
