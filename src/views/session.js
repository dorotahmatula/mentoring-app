// Ekran sesji na żywo.

import { h, icon, initials, toast } from '../util.js?v=202610221749';
import { SessionStore } from '../store.js?v=202610221749';
import { Votes, personColor, VOTES_PER_PERSON } from '../votes.js?v=202610221749';
import { Board } from '../board.js?v=202610221749';
import { TemplateView, SideView } from '../template.js?v=202610221749';
import { exportSessionPNG } from '../export.js?v=202610221749';
import { topbar } from './chrome.js?v=202610221749';

const TOOLS = [
  ['select', 'cursor', 'Zaznacz i przesuwaj'],
  ['sticky', 'sticky', 'Karteczka'],
  ['text', 'text', 'Tekst'],
  ['pen', 'pen', 'Rysuj'],
  ['shape', 'shape', 'Kształt'],
  ['image', 'image', 'Obraz'],
  null,
  ['vote', 'vote', 'Głosowanie kropkami'],
  ['emoji', 'emoji', 'Emotka']
];

export async function renderSession(app, backend, user, id, cfg) {
  app.replaceChildren(h('div', { class: 'login-wrap' }, h('p', {}, 'Wczytuję sesję…')));
  let session;
  try { session = await backend.getSession(id); } catch (e) { console.error(e); }
  if (!session) {
    app.replaceChildren(h('div', { class: 'page' }, topbar(backend, user),
      h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' }, h('h1', {}, 'Nie ma tej sesji'), h('p', {}, 'Link jest nieaktualny albo sesja należy do innej osoby. Sprawdź, czy logujesz się adresem, na który dostałaś zaproszenie.'), h('a', { href: '#/', class: 'btn btn-primary', style: { alignSelf: 'flex-start', textDecoration: 'none' } }, 'Wróć do listy sesji')))));
    return () => {};
  }

  // Klientka występuje pod imieniem z sesji, a nie pod adresem e-mail.
  user = user.isCoach ? user : { ...user, name: session.clientName || user.name };
  const store = new SessionStore(backend, session, user);
  try { await store.load(); } catch (e) { console.error(e); toast('Nie udało się wczytać zapisanych danych. Sprawdź połączenie.'); }
  const votes = new Votes(store, user);
  const coachName = cfg.coachName || 'Dorota';
  const tpl = new TemplateView(store, votes, session, coachName);
  const side = new SideView(store, votes, session);
  const board = new Board(store, user, votes);

  // nagłówek
  const progress = h('div', { class: 'progress', role: 'img', 'aria-label': `Postęp procesu: sesja ${session.number} z ${session.total}` },
    Array.from({ length: session.total }, (_, i) => h('span', { class: i < session.number ? 'on' : '' })));
  const avatars = h('div', { class: 'avatars' });
  const live = h('span', { class: 'live off' }, 'łączę…');
  const saveState = h('span', { class: 'save-state', 'aria-live': 'polite' }, '');
  const exportBtn = h('button', { type: 'button', class: 'btn' }, icon('download', 18), 'Eksportuj PNG');
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    try { board.finishEdit(); const name = await exportSessionPNG({ session, store, coachName, board, votes }); toast('Pobrano ' + name); }
    catch (e) { console.error(e); toast('Eksport się nie udał. Spróbuj jeszcze raz.'); }
    exportBtn.disabled = false;
  });
  const copyBtn = user.isCoach ? h('button', { type: 'button', class: 'btn btn-ghost', title: 'Kopiuj link dla klientki', onClick: async () => {
    const link = location.origin + location.pathname + '#/s/' + session.id;
    try { await navigator.clipboard.writeText(link); toast('Skopiowano link do sesji'); } catch { prompt('Link do sesji:', link); }
  } }, icon('link', 18), 'Link') : null;

  const header = topbar(backend, user, {
    crumbs: [session.clientName || 'Klientka', h('strong', {}, `Sesja ${session.number} z ${session.total} · ${session.title || 'Jak działamy i cele'}`)],
    center: progress,
    right: [h('div', { class: 'peers' }, avatars, live), saveState, copyBtn, exportBtn]
  });

  // narzędzia
  const toolBtns = new Map();
  const workspace = h('main', { class: 'workspace' });
  const body = h('div', { class: 'session-body' });
  const chip = h('span', { class: 'chip' }, h('span', { class: 'dot', style: { background: personColor(user) } }), h('span', {}));
  const drawChip = () => { chip.lastChild.textContent = `Głosowanie: ${VOTES_PER_PERSON} kropki na osobę, zostały Ci ${votes.remaining()}`; };
  drawChip();
  votes.onChange(drawChip);
  const nav = h('nav', { class: 'tools', 'aria-label': 'Narzędzia tablicy' }, TOOLS.map(t => {
    if (!t) return h('div', { class: 'divider', 'aria-hidden': 'true' });
    const [tool, ic, label] = t;
    const b = h('button', { type: 'button', class: 'icon-btn', 'data-tool': tool, 'aria-label': label, title: label, 'aria-pressed': tool === 'select' ? 'true' : 'false' }, icon(ic));
    b.addEventListener('click', () => {
      if (tool === 'image') { board.setTool('select'); board.pickImage(); return; }
      if (tool === 'vote') {
        const on = !body.classList.contains('voting');
        body.classList.toggle('voting', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        toast(on ? 'Głosowanie włączone: kliknij „+” przy celu, polu, temacie lub karteczce' : 'Głosowanie wyłączone');
        return;
      }
      board.setTool(tool, { scroll: true });
    });
    toolBtns.set(tool, b);
    return b;
  }));
  board.onTool((t) => { for (const [k, b] of toolBtns) if (k !== 'vote' && k !== 'image') b.setAttribute('aria-pressed', k === t ? 'true' : 'false'); });

  workspace.append(chip, tpl.el, board.el);
  body.append(nav, workspace, side.el);
  app.replaceChildren(h('div', { class: 'page' }, header, body));
  board.fit(true);

  // zmiany ze stanu
  const unsub = store.subscribe((keys) => {
    tpl.update(keys);
    side.update(keys);
    board.update(keys);
    if (keys.some(k => k.startsWith('vote:') || k.startsWith('item:') || /^(goal|park):[^:]+$/.test(k))) votes.refresh();
  });
  const unsubStatus = store.onStatus(({ pending, failed }) => {
    saveState.textContent = failed ? 'Brak zapisu, ponawiam…' : pending ? 'Zapisuję…' : 'Zapisano';
    saveState.style.color = failed ? 'var(--danger)' : '';
  });
  saveState.textContent = 'Zapisano';

  const peersById = new Map();
  store.connect({
    onPeers: (list) => {
      peersById.clear();
      for (const p of list) if (p && p.id) peersById.set(p.id, p);
      if (!peersById.has(user.id)) peersById.set(user.id, user);
      avatars.replaceChildren(...[...peersById.values()].map(p => h('span', { class: 'avatar', style: { background: personColor(p) }, title: p.id === user.id ? `${p.name} (Ty)` : p.name, role: 'img', 'aria-label': p.id === user.id ? `${p.name} (Ty)` : p.name }, initials(p.name))));
    },
    onStatus: (s) => { live.className = 'live' + (s === 'live' ? '' : ' off'); live.textContent = s === 'live' ? 'na żywo' : 'bez połączenia'; }
  });

  const onUnload = () => store.flush();
  window.addEventListener('pagehide', onUnload);
  const onVis = () => { if (document.visibilityState === 'hidden') store.flush(); };
  document.addEventListener('visibilitychange', onVis);

  return () => {
    unsub(); unsubStatus();
    window.removeEventListener('pagehide', onUnload);
    document.removeEventListener('visibilitychange', onVis);
    board.destroy();
    store.disconnect();
  };
}
