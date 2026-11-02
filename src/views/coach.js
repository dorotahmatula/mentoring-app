// Ekrany mentorki: pulpit, nowa mentee, proces mentee, planowanie i karta sesji.

import { h, toast, uid } from '../util.js?v=202611021254';
import { shell, loading, failed, badge, privTag, visTag, bar, avatar, autoText, panel } from './ui.js?v=202611021254';
import { coachStatus, nextFor, numberFor, sessionTitle, hasTopic, fmtWhen, fmtDateLong, toLocalInput, fromLocalInput, scheduleDate, SCHEDULES, TEMPLATES, sortByNumber } from '../model.js?v=202611021254';
import { SessionStore } from '../store.js?v=202611021254';
import { goalIds, HOW_FIELDS, TAKE_FIELDS } from '../template.js?v=202611021254';

const DAYS = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb'];

async function loadPrivs(backend, sessions) {
  const out = new Map();
  await Promise.all(sessions.map(async s => { try { out.set(s.id, await backend.getSessionPrivate(s.id)); } catch { out.set(s.id, null); } }));
  return out;
}

// Wpisy z sesji na żywo (cele, jak działamy, co zabieram, parking) w formie do odczytu.
export async function readEntries(backend, session, me) {
  const st = new SessionStore(backend, session, me);
  try { await st.load(); } catch (e) { console.error(e); }
  return st;
}

export function goalsFrom(st) {
  return goalIds(st).map(id => ({ learn: st.get(`gf:${id}:learn`) || '', success: st.get(`gf:${id}:success`) || '', today: st.get(`gf:${id}:today`) || null }))
    .filter(g => g.learn.trim() || g.success.trim());
}

export function parkingFrom(st) {
  return st.list('park:').sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([k]) => st.get('ptext:' + k.slice(5)) || '').filter(t => t.trim());
}

// ============ PULPIT ============
export async function renderCoachHome(app, backend, user) {
  loading(app);
  let mentees, sessions;
  try { [mentees, sessions] = await Promise.all([backend.listMentees(), backend.listSessions()]); }
  catch (e) { console.error(e); failed(app, backend, user); return () => {}; }

  const upcoming = new Map();
  for (const m of mentees) { const n = nextFor(sessions, m.id); if (n) upcoming.set(n.id, n); }
  for (const s of sessions) if (s.status !== 'done' && s.startsAt && s.participants.length) upcoming.set(s.id, s);
  const list = [...upcoming.values()].sort((a, b) => (a.startsAt ? new Date(a.startsAt) : Infinity) - (b.startsAt ? new Date(b.startsAt) : Infinity)).slice(0, 8);
  const privs = await loadPrivs(backend, list);

  const todos = [];
  for (const m of mentees) {
    if (!m.invitedAt) todos.push([`Wyślij zaproszenie: ${m.name}`, '#/m/' + m.id, 'v']);
  }
  for (const s of list) {
    const p = privs.get(s.id);
    const who = s.joint ? `sesja wspólna · ${s.clientName}` : `sesja ${s.number} · ${s.clientName}`;
    if (!s.startsAt) todos.push([`Umów termin: ${who}`, '#/k/' + s.id, '']);
    if (!(p?.agenda || []).length) todos.push([`Przygotuj agendę: ${who}`, '#/k/' + s.id, '']);
    else if (!p.agendaReady) todos.push([`Dopnij agendę: ${who}`, '#/k/' + s.id, 'v']);
  }
  for (const s of sessions) if (s.status === 'done' && !(s.output || '').trim() && s.participants.length) todos.push([`Uzupełnij output: sesja ${s.number} · ${s.clientName}`, '#/k/' + s.id, 'v']);

  const nearest = list.find(s => s.startsAt);
  const rows = list.map(s => {
    const d = s.startsAt ? new Date(s.startsAt) : null;
    const st = coachStatus(s, privs.get(s.id));
    return h('div', { class: 'row' },
      h('div', { class: 'date-box' }, h('div', { class: 'small muted' }, d ? DAYS[d.getDay()] : 'termin'), h('div', { class: 'd' + (d ? '' : ' warn') }, d ? `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}` : '?')),
      h('div', { class: 'row-main' },
        h('span', { class: 'row-title' }, s.joint ? `${s.clientName} · sesja wspólna` : `${s.clientName} · Sesja ${s.number} z ${s.total}`),
        h('span', { class: 'small muted' }, `${sessionTitle(s)}${d ? ' · ' + fmtWhen(s.startsAt, { withDay: false }).split(' · ')[1] : ' · termin do ustalenia'}`)),
      badge(st),
      h('a', { href: '#/k/' + s.id, class: 'btn' }, s.startsAt ? 'Otwórz' : 'Umów'));
  });

  const cards = mentees.map(m => {
    const mine = sessions.filter(s => s.participants.some(p => p.menteeId === m.id));
    const done = mine.filter(s => s.status === 'done').length;
    const next = nextFor(sessions, m.id);
    return h('a', { href: '#/m/' + m.id, class: 'mentee-card' },
      h('span', { class: 'nm' }, m.name),
      h('span', { class: 'small muted' }, `Proces mentoringowy · ${mine.length} sesji`),
      bar(done, Math.max(mine.length, m.plannedSessions)),
      h('span', { class: 'small muted' }, `${done} z ${Math.max(mine.length, m.plannedSessions)} sesji · następna ${next ? (next.startsAt ? fmtWhen(next.startsAt) : 'do ustalenia') : '–'}`),
      !m.invitedAt ? h('span', { class: 'badge warn', style: { alignSelf: 'flex-start' } }, 'Bez zaproszenia') : null);
  });

  shell(app, backend, user, [],
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, `Dzień dobry, ${user.name}`),
        h('p', { class: 'sub' }, `${mentees.length} ${mentees.length === 1 ? 'mentee' : 'mentee'} w procesie${nearest ? ' · najbliższa sesja ' + fmtWhen(nearest.startsAt, { withTime: false }) : ''}`)),
      h('div', { class: 'actions' },
        mentees.length ? h('a', { href: '#/plan/new', class: 'btn btn-lg' }, '+ Zaplanuj sesję') : null,
        h('a', { href: '#/mentee/new', class: 'btn btn-primary btn-lg' }, '+ Dodaj mentee'))),
    mentees.length ? h('div', { class: 'cols2' },
      h('div', { class: 'main' }, panel('', 'Najbliższe sesje', null, rows.length ? h('div', { class: 'rows' }, rows) : h('p', { class: 'muted small' }, 'Brak zaplanowanych sesji.'))),
      h('div', { class: 'aside' }, panel('', 'Do zrobienia', null, todos.length ? todos.slice(0, 8).map(([t, href, cls]) => h('a', { href, class: 'todo ' + cls, style: { color: 'inherit', textDecoration: 'none' } }, t)) : h('p', { class: 'muted small' }, 'Wszystko gotowe.')))) : null,
    h('section', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('h2', { style: { margin: 0, fontSize: '16px' } }, 'Twoje mentee'),
      cards.length ? h('div', { class: 'mentee-cards' }, cards) : h('div', { class: 'panel' }, h('p', {}, 'Nie masz jeszcze mentee. Dodaj pierwszą osobę i jej plan sesji.'), h('a', { href: '#/mentee/new', class: 'btn btn-primary', style: { alignSelf: 'flex-start' } }, '+ Dodaj mentee'))));
  return () => {};
}

// ============ NOWA MENTEE ============
export async function renderNewMentee(app, backend, user) {
  const name = h('input', { class: 'field-input', id: 'nm-name', required: true, placeholder: 'np. Natalia' });
  const email = h('input', { class: 'field-input', id: 'nm-email', type: 'email', placeholder: 'adres mentee' });
  const countSel = h('select', { class: 'field-input', id: 'nm-count' }, [4, 5, 6, 8, 10].map(n => h('option', { value: n, selected: n === 6 }, `${n} sesji`)));
  const sched = h('select', { class: 'field-input', id: 'nm-sched' }, Object.entries(SCHEDULES).map(([k, v]) => h('option', { value: k }, v)));
  const first = h('input', { class: 'field-input', id: 'nm-first', type: 'datetime-local' });
  const planEl = h('div', { class: 'rows' });
  const topics = ['Jak działamy i cele'];

  function drawPlan() {
    const n = +countSel.value;
    const firstIso = fromLocalInput(first.value);
    planEl.replaceChildren(...Array.from({ length: n }, (_, i) => {
      const inp = h('input', { class: 'field-input slim', value: topics[i] || '', placeholder: 'Temat do ustalenia', 'aria-label': `Temat sesji ${i + 1}` });
      inp.addEventListener('input', () => { topics[i] = inp.value; });
      const when = scheduleDate(firstIso, sched.value, i);
      return h('div', { class: 'plan-row' }, h('span', { class: 'num' }, i + 1), inp, h('span', { class: 'when' }, when ? fmtWhen(when) : 'termin do ustalenia'));
    }));
  }
  [countSel, sched, first].forEach(el => el.addEventListener('change', drawPlan));
  first.addEventListener('input', drawPlan);
  drawPlan();

  const err = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Utwórz proces');
  const form = h('form', { style: { display: 'contents' } },
    h('div', { class: 'cols2' },
      h('div', { class: 'aside', style: { flex: '1 1 340px' } }, panel('', '1. Kto', null,
        h('label', { class: 'field-label', for: 'nm-name' }, 'Imię i nazwisko', name),
        h('label', { class: 'field-label', for: 'nm-email' }, 'E-mail (na niego wyślesz zaproszenie)', email)),
        panel('', '2. Proces', null,
          h('label', { class: 'field-label', for: 'nm-count' }, 'Plan startowy: liczba sesji', countSel),
          h('label', { class: 'field-label', for: 'nm-sched' }, 'Terminy', sched),
          h('label', { class: 'field-label', for: 'nm-first' }, 'Pierwsza sesja (opcjonalnie)', first))),
      h('div', { class: 'main', style: { flex: '1.4 1 440px' } }, panel('', '3. Plan sesji', h('span', { class: 'small muted' }, 'Mentee widzi temat i termin'), planEl, h('p', { class: 'small muted' }, 'Tematy i terminy uzupełniasz po drodze, każdy osobno. Agendy dodasz na karcie sesji.')))),
    err,
    h('div', { class: 'actions', style: { justifyContent: 'flex-end' } }, h('span', { class: 'small muted' }, 'Zaproszenie wyślesz w kolejnym kroku, z karty procesu.'), h('a', { href: '#/', class: 'btn btn-lg' }, 'Anuluj'), submit));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!name.value.trim()) { err.textContent = 'Wpisz imię mentee.'; name.focus(); return; }
    submit.disabled = true; err.textContent = '';
    try {
      const m = await backend.createMentee({ name: name.value, email: email.value, plannedSessions: +countSel.value, schedule: sched.value, firstStartsAt: fromLocalInput(first.value), topics });
      toast('Proces utworzony');
      location.hash = '#/m/' + m.id;
    } catch (ex) { console.error(ex); err.textContent = 'Nie udało się utworzyć procesu. Sprawdź połączenie.'; submit.disabled = false; }
  });
  shell(app, backend, user, ['Mentee', h('strong', {}, 'Nowa mentee')],
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Nowa mentee'), h('p', { class: 'sub' }, 'Dane, a pod spodem plan sesji. Tematy i daty możesz zmieniać w trakcie procesu.'))),
    form);
  setTimeout(() => name.focus(), 0);
  return () => {};
}

// ============ PROCES MENTEE ============
export async function renderMenteeProcess(app, backend, user, menteeId) {
  loading(app);
  let m, sessions, priv;
  try {
    [m, sessions, priv] = await Promise.all([backend.getMentee(menteeId), backend.listSessions(), backend.getMenteePrivate(menteeId)]);
  } catch (e) { console.error(e); failed(app, backend, user); return () => {}; }
  if (!m) { failed(app, backend, user, 'Nie ma takiej mentee.'); return () => {}; }
  const mine = sortByNumber(sessions.filter(s => s.participants.some(p => p.menteeId === m.id)), m.id);
  const privs = await loadPrivs(backend, mine);
  const done = mine.filter(s => s.status === 'done').length;
  const total = Math.max(mine.length, m.plannedSessions);
  const next = nextFor(sessions, m.id);

  // cele i frameworki
  const goalSession = mine.find(s => s.template === 'jak-dzialamy');
  const gst = goalSession ? await readEntries(backend, goalSession, user) : null;
  const goals = gst ? goalsFrom(gst) : [];
  const frameworks = mine.flatMap(s => (s.frameworks || []).map(f => ({ ...f, s })));

  const inviteBox = !m.email
    ? h('div', { class: 'invite' }, h('div', {}, h('div', { style: { fontWeight: 600 } }, `${m.name} nie ma adresu e-mail`), h('div', { class: 'small' }, 'Dodaj adres w panelu „Dane”, żeby wysłać zaproszenie.')))
    : !m.invitedAt
      ? h('div', { class: 'invite' },
        h('div', {}, h('div', { style: { fontWeight: 600 } }, `${m.name} nie ma jeszcze dostępu`), h('div', { class: 'small' }, `Wyślij zaproszenie, gdy proces jest gotowy. ${m.name} zaloguje się mailem ${m.email} i zobaczy plan.`)),
        inviteBtn('Wyślij zaproszenie', 'btn btn-primary btn-lg'))
      : h('div', { class: 'small muted' }, `Zaproszenie wysłane ${new Date(m.invitedAt).toLocaleDateString('pl-PL')} na ${m.email}. `, inviteBtn('Wyślij ponownie', 'btn btn-ghost'));

  function inviteBtn(label, cls) {
    const b = h('button', { type: 'button', class: cls }, label);
    b.addEventListener('click', async () => {
      b.disabled = true;
      try { await backend.inviteMentee(m.id); toast(`Wysłano zaproszenie na ${m.email}`); setTimeout(() => renderMenteeProcess(app, backend, user, menteeId), 400); }
      catch (e) { console.error(e); toast(/rate|limit|seconds/i.test(e.message || '') ? 'Za dużo maili w krótkim czasie. Spróbuj za kilka minut.' : 'Nie udało się wysłać zaproszenia.'); b.disabled = false; }
    });
    return b;
  }

  const rows = mine.map(s => {
    const n = numberFor(s, m.id);
    const others = s.participants.filter(p => p.menteeId !== m.id).map(p => p.name);
    return h('a', { href: '#/k/' + s.id, class: 'row' },
      h('span', { class: 'num' + (s.status === 'done' ? ' done' : hasTopic(s) || s.startsAt ? '' : ' empty') }, n),
      h('div', { class: 'row-main' },
        h('span', { class: 'row-title' + (hasTopic(s) ? '' : ' dim') }, sessionTitle(s)),
        h('span', { class: 'small muted' }, (s.status === 'done' && s.output ? 'output: ' + s.output.slice(0, 70) : fmtWhen(s.startsAt)) + (others.length ? ' · razem z ' + others.join(', ') : ''))),
      badge(coachStatus(s, privs.get(s.id))));
  });

  const nameIn = h('input', { class: 'field-input', value: m.name, 'aria-label': 'Imię' });
  const emailIn = h('input', { class: 'field-input', type: 'email', value: m.email, placeholder: 'adres mentee', 'aria-label': 'E-mail' });
  const saveData = h('button', { type: 'button', class: 'btn' }, 'Zapisz dane');
  saveData.addEventListener('click', async () => {
    try { await backend.updateMentee(m.id, { name: nameIn.value.trim() || m.name, email: emailIn.value }); toast('Zapisano'); renderMenteeProcess(app, backend, user, menteeId); }
    catch (e) { console.error(e); toast('Nie udało się zapisać.'); }
  });

  shell(app, backend, user, ['Mentee', h('strong', {}, m.name)],
    h('section', { class: 'panel', style: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px' } }, avatar(m.name, false, 52),
        h('div', {}, h('h1', { style: { margin: 0, fontFamily: 'var(--serif)', color: 'var(--accent)', fontSize: '26px' } }, m.name),
          h('span', { class: 'small muted' }, `Proces mentoringowy · ${total} sesji · ${SCHEDULES[m.schedule] ? SCHEDULES[m.schedule].replace('Stały rytm: ', '').replace('Każdą sesję ustalam osobno', 'terminy ustalane osobno') : ''}`))),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' } }, bar(done, total), h('span', { class: 'small muted' }, `${done} z ${total} sesji${next ? ' · następna ' + (next.startsAt ? fmtWhen(next.startsAt, { withTime: false }) : 'do ustalenia') : ''}`))),
    inviteBox,
    h('div', { class: 'cols2' },
      h('div', { class: 'main' }, panel('', 'Plan sesji', h('a', { href: '#/plan/new?m=' + m.id, class: 'small', style: { fontWeight: 500, textDecoration: 'none' } }, '+ Zaplanuj sesję'), h('div', { class: 'rows' }, rows))),
      h('div', { class: 'aside' },
        panel('', `O ${m.name}: główna myśl`, privTag(), autoText(priv.about, v => backend.saveMenteePrivate(m.id, { about: v }), { placeholder: 'Kilka zdań: kim jest, z czym przychodzi, na co uważać w procesie…', rows: 4, label: 'Główna myśl' })),
        panel('', 'Cele procesu', h('span', { class: 'small muted' }, goalSession ? `z sesji ${numberFor(goalSession, m.id)}` : ''),
          goals.length ? goals.map((g, i) => h('div', { class: 'kv' }, h('span', {}, `Cel ${i + 1}`), h('span', {}, g.learn || g.success), h('span', { class: 'small muted' }, `Gdzie jestem: ${g.today ? g.today + '/10' : '–'}`)))
            : h('p', { class: 'small muted' }, 'Cele wpisane w szablonie „Jak działamy i cele” pojawią się tu z oceną.')),
        panel('', 'Frameworki', null, frameworks.length ? frameworks.map(f => h('div', { class: 'panel-head' }, h('span', {}, f.name), badge(f.status === 'done' ? ['Done', 'ok'] : ['In progress', 'warn'])))
          : h('p', { class: 'small muted' }, 'Każdy framework z sesji trafi tu ze statusem done albo in progress.')),
        panel('private', 'Moje notatki', privTag(), autoText(priv.notes, v => backend.saveMenteePrivate(m.id, { notes: v }), { placeholder: 'Notatki o procesie, których mentee nie widzi.', rows: 4, label: 'Moje notatki' })),
        panel('', 'Dane', null, h('label', { class: 'field-label' }, 'Imię', nameIn), h('label', { class: 'field-label' }, 'E-mail', emailIn), h('div', {}, saveData)))));
  return () => {};
}

// ============ ZAPLANUJ SESJĘ ============
export async function renderPlanNew(app, backend, user, preselect) {
  loading(app);
  let mentees, sessions;
  try { [mentees, sessions] = await Promise.all([backend.listMentees(), backend.listSessions()]); }
  catch (e) { console.error(e); failed(app, backend, user); return () => {}; }
  const picked = new Set(preselect ? [preselect] : []);
  const boxes = mentees.map(m => {
    const cb = h('input', { type: 'checkbox', value: m.id, checked: picked.has(m.id) });
    cb.addEventListener('change', () => { cb.checked ? picked.add(m.id) : picked.delete(m.id); });
    const next = nextFor(sessions, m.id);
    return h('label', { class: 'switch', style: { justifyContent: 'flex-start', border: '1px solid var(--line)' } }, cb, avatar(m.name, false, 26), h('span', {}, m.name), h('span', { class: 'small muted', style: { marginLeft: 'auto' } }, next ? `następna: sesja ${numberFor(next, m.id)}` : ''));
  });
  const title = h('input', { class: 'field-input', id: 'pl-title', placeholder: 'Temat do ustalenia' });
  const when = h('input', { class: 'field-input', id: 'pl-when', type: 'datetime-local' });
  const tpl = h('select', { class: 'field-input', id: 'pl-tpl' }, Object.entries(TEMPLATES).map(([k, v]) => h('option', { value: k, selected: k === 'none' }, v)));
  const err = h('p', { class: 'error', role: 'alert' });
  const go = h('button', { type: 'submit', class: 'btn btn-primary btn-lg' }, 'Zaplanuj');
  const form = h('form', { style: { display: 'contents' } },
    panel('', 'Kto bierze udział', h('span', { class: 'small muted' }, 'Jedna osoba albo kilka: sesja wspólna liczy się w procesie każdej z nich'), ...boxes),
    panel('', 'Sesja', null,
      h('label', { class: 'field-label', for: 'pl-title' }, 'Temat', title),
      h('label', { class: 'field-label', for: 'pl-when' }, 'Termin (opcjonalnie)', when),
      h('label', { class: 'field-label', for: 'pl-tpl' }, 'Szablon na tablicy', tpl)),
    err, h('div', { class: 'actions', style: { justifyContent: 'flex-end' } }, h('a', { href: '#/', class: 'btn btn-lg' }, 'Anuluj'), go));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = [...picked];
    if (!ids.length) { err.textContent = 'Wybierz co najmniej jedną mentee.'; return; }
    go.disabled = true; err.textContent = '';
    try {
      // Pierwsza osoba: wykorzystujemy jej najbliższą pustą sesję z planu, jeśli taka jest.
      const first = ids[0];
      let target = sortByNumber(sessions.filter(x => x.status !== 'done' && x.participants.length === 1 && x.participants[0].menteeId === first && !x.startsAt && !hasTopic(x)), first)[0];
      if (!target) target = await backend.createSession({ menteeIds: [first] });
      for (const other of ids.slice(1)) await backend.addParticipant(target.id, other);
      const patch = { template: tpl.value };
      if (title.value.trim()) patch.title = title.value.trim();
      if (when.value) patch.startsAt = fromLocalInput(when.value);
      await backend.updateSession(target.id, patch);
      toast('Sesja zaplanowana');
      location.hash = '#/k/' + target.id;
    } catch (ex) { console.error(ex); err.textContent = 'Nie udało się zaplanować sesji.'; go.disabled = false; }
  });
  shell(app, backend, user, ['Sesje', h('strong', {}, 'Zaplanuj sesję')],
    h('div', { class: 'page-head' }, h('div', {}, h('span', { class: 'eyebrow' }, 'Planowanie sesji'), h('h1', {}, 'Zaplanuj sesję'), h('p', { class: 'sub' }, 'Wybierz uczestniczki. Agendę dodasz na karcie sesji.'))),
    mentees.length ? form : h('div', { class: 'panel' }, h('p', {}, 'Najpierw dodaj mentee.'), h('a', { href: '#/mentee/new', class: 'btn btn-primary', style: { alignSelf: 'flex-start' } }, '+ Dodaj mentee')));
  return () => {};
}

// ============ KARTA SESJI (mentorka) ============
export async function renderCoachSession(app, backend, user, sessionId) {
  loading(app);
  let s, priv, mentees, sessions;
  try { [s, priv, mentees, sessions] = await Promise.all([backend.getSession(sessionId), backend.getSessionPrivate(sessionId), backend.listMentees(), backend.listSessions()]); }
  catch (e) { console.error(e); failed(app, backend, user); return () => {}; }
  if (!s) { failed(app, backend, user, 'Nie ma takiej sesji.'); return () => {}; }
  const reload = () => renderCoachSession(app, backend, user, sessionId);
  const st = await readEntries(backend, s, user);
  const isDone = s.status === 'done';
  const save = async (patch, msg) => { try { await backend.updateSession(s.id, patch); Object.assign(s, patch); if (msg) toast(msg); } catch (e) { console.error(e); toast('Nie udało się zapisać.'); } };
  const savePriv = async (patch) => { try { await backend.saveSessionPrivate(s.id, patch); Object.assign(priv, patch); } catch (e) { console.error(e); toast('Nie udało się zapisać.'); } };

  // --- uczestniczki
  const chips = h('div', { class: 'chips' },
    s.participants.map(p => h('span', { class: 'person-chip' }, avatar(p.name, false), `${p.name} · sesja ${p.number} z ${p.total || '?'}`,
      s.participants.length > 1 ? h('button', { type: 'button', 'aria-label': `Usuń ${p.name} z sesji`, title: 'Usuń z sesji', onClick: async () => { await backend.removeParticipant(s.id, p.menteeId); toast(`${p.name} ma tę sesję z powrotem w swoim planie`); reload(); } }, '×') : null)));
  const others = mentees.filter(m => !s.participants.some(p => p.menteeId === m.id));
  if (others.length && !isDone) {
    const addBtn = h('button', { type: 'button', class: 'btn btn-dashed', style: { width: 'auto', height: '36px', borderRadius: '999px' } }, '+ Dodaj mentee');
    const wrap = h('span', { style: { position: 'relative' } }, addBtn);
    addBtn.addEventListener('click', () => {
      const pop = h('div', { class: 'menu-pop', style: { top: '40px', left: 0 } }, others.map(m => h('button', { type: 'button', onClick: async () => { pop.remove(); await backend.addParticipant(s.id, m.id); toast(`Dodano ${m.name}. Sesja liczy się też w jej procesie.`); reload(); } }, m.name)));
      wrap.append(pop);
      setTimeout(() => document.addEventListener('click', function off(ev) { if (!pop.contains(ev.target)) { pop.remove(); document.removeEventListener('click', off); } }), 0);
    });
    chips.append(wrap);
  }

  const titleIn = autoText(s.title, v => save({ title: v }), { input: true, placeholder: 'Temat do ustalenia', label: 'Temat' });
  const whenIn = h('input', { class: 'field-input', type: 'datetime-local', value: toLocalInput(s.startsAt), 'aria-label': 'Termin' });
  whenIn.addEventListener('change', () => save({ startsAt: fromLocalInput(whenIn.value) }, 'Zapisano termin'));
  const durIn = h('select', { class: 'field-input', 'aria-label': 'Czas trwania' }, [45, 60, 75, 90, 120].map(n => h('option', { value: n, selected: n === (s.durationMin || 90) }, `${n} min`)));
  durIn.addEventListener('change', () => save({ durationMin: +durIn.value }));
  const tplIn = h('select', { class: 'field-input', 'aria-label': 'Szablon na tablicy' }, Object.entries(TEMPLATES).map(([k, v]) => h('option', { value: k, selected: k === (s.template || 'none') }, v)));
  tplIn.addEventListener('change', () => save({ template: tplIn.value }, 'Zapisano szablon'));

  // --- agenda
  const agenda = (priv.agenda || []).map(a => ({ ...a, id: a.id || uid() }));
  const agendaEl = h('div', { class: 'rows' });
  const saveAgenda = () => savePriv({ agenda: agenda.map(({ id, min, title, note }) => ({ id, min, title, note })) });
  let agTimer;
  const queueAgenda = () => { clearTimeout(agTimer); agTimer = setTimeout(saveAgenda, 600); };
  function drawAgenda() {
    agendaEl.replaceChildren(...agenda.map((a, i) => {
      const min = h('input', { class: 'field-input slim min', value: a.min || '', placeholder: 'min', 'aria-label': 'Czas w minutach', inputmode: 'numeric' });
      const t = h('input', { class: 'field-input slim', value: a.title || '', placeholder: 'Punkt agendy', 'aria-label': 'Punkt agendy' });
      const n = h('input', { class: 'field-input slim', value: a.note || '', placeholder: 'Pytania, ćwiczenie, notatka', 'aria-label': 'Opis punktu' });
      min.addEventListener('input', () => { a.min = min.value; queueAgenda(); });
      t.addEventListener('input', () => { a.title = t.value; queueAgenda(); });
      n.addEventListener('input', () => { a.note = n.value; queueAgenda(); });
      return h('div', { class: 'agenda-row' }, min, h('div', { class: 'grow' }, t, n),
        h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Usuń punkt', title: 'Usuń punkt', onClick: () => { agenda.splice(i, 1); drawAgenda(); saveAgenda(); } }, '×'));
    }));
    sumEl.textContent = agenda.length ? `Razem ${agenda.reduce((x, a) => x + (parseInt(a.min, 10) || 0), 0)} min z ${s.durationMin || 90}` : 'Agenda w przygotowaniu. Dodaj punkty albo wklej plan przygotowany z Claude.';
  }
  const sumEl = h('p', { class: 'small muted' });
  const pasteBox = h('textarea', { class: 'field-input', rows: 5, placeholder: 'Wklej agendę, każdy punkt w osobnej linii, np.\n15 min – Otwarcie i bieżący case – Co jest teraz prawdziwym wyzwaniem?\n50 min – Mapa kompetencji' , hidden: true, 'aria-label': 'Wklejona agenda' });
  const pasteGo = h('button', { type: 'button', class: 'btn', hidden: true }, 'Dodaj punkty z tekstu');
  pasteGo.addEventListener('click', () => {
    const added = parseAgenda(pasteBox.value);
    if (!added.length) { toast('Nie rozpoznałam żadnych punktów.'); return; }
    agenda.push(...added); pasteBox.value = ''; pasteBox.hidden = true; pasteGo.hidden = true; drawAgenda(); saveAgenda(); toast(`Dodano ${added.length} punktów`);
  });
  const ready = h('input', { type: 'checkbox', checked: !!priv.agendaReady });
  ready.addEventListener('change', () => savePriv({ agendaReady: ready.checked }).then(() => toast(ready.checked ? 'Agenda oznaczona jako gotowa' : 'Agenda w przygotowaniu')));
  drawAgenda();

  // --- po sesji
  const outputIn = autoText(s.output, v => save({ output: v }), { placeholder: 'Najważniejszy wynik sesji: model, decyzja, plan…', rows: 3, label: 'Output sesji' });
  const fw = (s.frameworks && s.frameworks.length) ? s.frameworks.slice() : (s.template === 'jak-dzialamy' ? [{ name: 'Jak działamy i cele', status: 'in_progress' }] : []);
  const fwEl = h('div', { class: 'rows' });
  const saveFw = () => save({ frameworks: fw });
  function drawFw() {
    fwEl.replaceChildren(...fw.map((f, i) => h('div', { class: 'row', style: { padding: '10px 0' } },
      h('span', { class: 'row-main' }, f.name),
      h('div', { class: 'seg2', role: 'group', 'aria-label': `Status: ${f.name}` },
        h('button', { type: 'button', class: 'ip', 'aria-pressed': f.status !== 'done' ? 'true' : 'false', onClick: () => { f.status = 'in_progress'; drawFw(); saveFw(); } }, 'In progress'),
        h('button', { type: 'button', class: 'dn', 'aria-pressed': f.status === 'done' ? 'true' : 'false', onClick: () => { f.status = 'done'; drawFw(); saveFw(); } }, 'Done')),
      h('button', { type: 'button', class: 'mini-btn', 'aria-label': 'Usuń framework', onClick: () => { fw.splice(i, 1); drawFw(); saveFw(); } }, '×'))));
  }
  drawFw();
  const fwName = h('input', { class: 'field-input slim', placeholder: 'np. Mapa kompetencji', 'aria-label': 'Nazwa frameworku' });
  const fwAdd = h('button', { type: 'button', class: 'btn' }, 'Dodaj');
  fwAdd.addEventListener('click', () => { if (!fwName.value.trim()) return; fw.push({ name: fwName.value.trim(), status: 'in_progress' }); fwName.value = ''; drawFw(); saveFw(); });

  const takes = TAKE_FIELDS(s).map(([k, label]) => h('div', { class: 'kv' }, h('span', {}, label), h('span', {}, st.get(k) || h('span', { class: 'muted' }, 'Bez odpowiedzi'))));
  const parking = parkingFrom(st);

  const summaryIn = autoText(priv.summary, async v => { await savePriv({ summary: v }); if (shareCb.checked) await save({ sharedSummary: v }); }, { placeholder: 'Wklej esencję rozmowy przygotowaną z Claude na podstawie nagrania…', rows: 6, label: 'Podsumowanie z nagrania' });
  const shareCb = h('input', { type: 'checkbox', checked: !!(s.sharedSummary || '').trim() });
  shareCb.addEventListener('change', () => save({ sharedSummary: shareCb.checked ? summaryIn.value : '' }, shareCb.checked ? 'Podsumowanie widoczne dla mentee' : 'Podsumowanie ukryte'));
  const notesIn = autoText(priv.notes, v => savePriv({ notes: v }), { placeholder: 'Refleksja warsztatowa: gdzie dobre pytanie, gdzie rada za wcześnie…', rows: 4, label: 'Moje notatki z sesji' });

  // --- z poprzedniej sesji
  const prevPanels = [];
  for (const p of s.participants) {
    const prev = sessions.filter(x => x.participants.some(q => q.menteeId === p.menteeId) && numberFor(x, p.menteeId) < p.number && x.status === 'done').sort((a, b) => numberFor(b, p.menteeId) - numberFor(a, p.menteeId))[0];
    if (!prev) continue;
    const pst = await readEntries(backend, prev, user);
    prevPanels.push(h('div', { class: 'kv' }, h('span', {}, `${p.name} · sesja ${numberFor(prev, p.menteeId)}`),
      h('span', {}, 'Output: ' + (prev.output || '–')),
      pst.get('take:important') ? h('span', { class: 'small' }, `Co zabrała: „${pst.get('take:important')}”`) : null,
      parkingFrom(pst).length ? h('span', { class: 'small' }, 'Parking: ' + parkingFrom(pst).join('; ')) : null));
  }

  const markBtn = h('button', { type: 'button', class: 'btn btn-lg' }, isDone ? 'Przywróć jako zaplanowaną' : 'Oznacz jako odbytą');
  markBtn.addEventListener('click', async () => { await save({ status: isDone ? 'planned' : 'done', frameworks: fw }, isDone ? 'Sesja wróciła do planu' : 'Sesja oznaczona jako odbyta'); reload(); });
  const delBtn = !isDone && s.participants.length <= 1 ? h('button', { type: 'button', class: 'btn btn-ghost', style: { color: 'var(--danger)' } }, 'Usuń sesję') : null;
  if (delBtn) {
    let armed = false;
    delBtn.addEventListener('click', async () => {
      if (!armed) { armed = true; delBtn.textContent = 'Kliknij jeszcze raz, żeby usunąć'; setTimeout(() => { armed = false; delBtn.textContent = 'Usuń sesję'; }, 3000); return; }
      await backend.deleteSession(s.id); toast('Sesja usunięta'); history.back();
    });
  }

  const label = s.joint ? 'Sesja wspólna' : `Sesja ${s.number} z ${s.total}`;
  const crumbs = s.participants.length === 1 ? [h('a', { href: '#/m/' + s.participants[0].menteeId, style: { color: 'inherit', textDecoration: 'none' } }, s.participants[0].name), h('strong', {}, `Sesja ${s.number}`)] : [h('strong', {}, s.clientName)];

  shell(app, backend, user, crumbs,
    h('div', { class: 'page-head' },
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('span', { class: 'eyebrow' + (isDone ? ' ok' : '') }, `${label} · ${isDone ? 'odbyta' : 'przed spotkaniem'}`),
        h('h1', {}, hasTopic(s) ? s.title : (s.joint ? s.clientName : sessionTitle(s))),
        h('span', { class: 'sub', style: { margin: 0 } }, `${s.startsAt ? fmtDateLong(s.startsAt) : 'Termin do ustalenia'} · ${s.durationMin || 90} min`)),
      h('div', { class: 'actions' }, delBtn, markBtn, h('a', { href: '#/s/' + s.id, class: 'btn btn-primary btn-lg' }, isDone ? 'Otwórz tablicę z sesji' : 'Rozpocznij sesję na żywo'))),
    h('div', { class: 'cols2' },
      h('div', { class: 'main' },
        isDone ? panel('', 'Output sesji', visTag(), outputIn) : null,
        isDone ? panel('tint', `Co zabrała ${s.participants.map(p => p.name).join(' i ')}`, h('span', { class: 'small muted' }, 'z pola na tablicy'), ...takes) : null,
        isDone ? panel('', 'Frameworki z sesji', null, fwEl, h('div', { class: 'actions' }, fwName, fwAdd), h('p', { class: 'small muted' }, 'Framework „in progress” widzi mentee jako rzecz do dokończenia.')) : null,
        panel('', 'Sesja', null,
          h('div', { class: 'field-label' }, 'Kto bierze udział', chips),
          h('label', { class: 'field-label' }, 'Temat', titleIn),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '12px' } },
            h('label', { class: 'field-label', style: { flex: '1 1 200px' } }, 'Termin', whenIn),
            h('label', { class: 'field-label', style: { flex: '1 1 140px' } }, 'Czas trwania', durIn),
            h('label', { class: 'field-label', style: { flex: '1 1 200px' } }, 'Szablon na tablicy', tplIn))),
        panel('', 'Agenda', privTag('widzisz tylko Ty'), agendaEl, sumEl,
          h('div', { class: 'actions' },
            h('button', { type: 'button', class: 'btn btn-dashed', style: { width: 'auto' }, onClick: () => { agenda.push({ id: uid(), min: '', title: '', note: '' }); drawAgenda(); agendaEl.querySelectorAll('input')[agenda.length * 3 - 2]?.focus(); } }, '+ Punkt agendy'),
            h('button', { type: 'button', class: 'btn btn-dashed', style: { width: 'auto' }, onClick: () => { pasteBox.hidden = !pasteBox.hidden; pasteGo.hidden = pasteBox.hidden; if (!pasteBox.hidden) pasteBox.focus(); } }, 'Wklej agendę od Claude')),
          pasteBox, pasteGo,
          h('label', { class: 'switch', style: { background: '#F7F7F8' } }, 'Agenda gotowa', ready))),
      h('div', { class: 'aside' },
        panel('', s.participants.length > 1 ? 'Mentee widzą' : 'Mentee widzi', visTag('widoczne'), h('span', {}, `${sessionTitle(s)} · ${fmtWhen(s.startsAt)}`), h('span', { class: 'small muted' }, 'Temat i termin. Agenda, notatki i podsumowanie zostają u Ciebie.')),
        prevPanels.length ? panel('', 'Z poprzedniej sesji', null, ...prevPanels) : null,
        !isDone && parking.length ? panel('', 'Parking z tej sesji', null, ...parking.map(t => h('span', {}, t))) : null,
        isDone ? panel('private', 'Podsumowanie z nagrania', privTag(), h('p', { class: 'small' }, 'Esencja rozmowy przygotowana z Claude na podstawie nagrania.'), summaryIn, h('label', { class: 'switch' }, 'Udostępnij mentee', shareCb)) : null,
        isDone && parking.length ? panel('', 'Parking', null, ...parking.map(t => h('span', {}, t))) : null,
        panel('private', 'Moje notatki z sesji', privTag(), notesIn))));
  return () => { clearTimeout(agTimer); };
}

export function parseAgenda(text) {
  return String(text || '').split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const clean = line.replace(/^(?:[-•*]|\d+[.)])\s+/, '');
    const m = clean.match(/^(\d+)\s*(?:min|minut|')?\s*[–—:\-|·]?\s*(.*)$/i);
    let min = '', rest = clean;
    if (m && m[2]) { min = m[1]; rest = m[2]; }
    const parts = rest.split(/\s+[–—|]\s+|\s+-\s+/);
    return { id: uid(), min, title: (parts[0] || '').trim(), note: parts.slice(1).join(' – ').trim() };
  }).filter(a => a.title);
}
