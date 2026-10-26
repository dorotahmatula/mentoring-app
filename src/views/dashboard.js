import { h, fmtDate, toast } from '../util.js?v=202610261252';
import { topbar } from './chrome.js?v=202610261252';

export async function renderDashboard(app, backend, user) {
  const listEl = h('div', { class: 'session-list' });
  const err = h('p', { class: 'error', role: 'alert' });

  async function load() {
    let list = [];
    try { list = await backend.listSessions(); } catch (e) { console.error(e); err.textContent = 'Nie udało się wczytać sesji. Odśwież stronę.'; }
    if (!list.length) {
      listEl.replaceChildren(h('p', { class: 'empty' }, user.isCoach ? 'Nie masz jeszcze sesji. Utwórz pierwszą powyżej.' : 'Nie masz jeszcze sesji. Gdy mentorka ją utworzy, pojawi się tutaj.'));
      return;
    }
    listEl.replaceChildren(...list.map(s => h('a', { href: '#/s/' + s.id, class: 'card session-card' },
      h('span', { class: 'meta' }, `Sesja ${s.number} z ${s.total} · ${fmtDate(s.createdAt)}`),
      h('span', { class: 'who' }, s.clientName || 'Klientka'),
      h('span', { class: 'meta' }, s.title || 'Jak działamy i cele'),
      h('div', { class: 'progress', 'aria-hidden': 'true' }, Array.from({ length: s.total }, (_, i) => h('span', { class: i < s.number ? 'on' : '' }))))));
  }

  let form = null;
  if (user.isCoach) {
    const name = h('input', { class: 'field-input', id: 'n-name', required: true, placeholder: 'np. Natalia' });
    const email = h('input', { class: 'field-input', id: 'n-email', type: 'email', required: backend.mode !== 'demo', placeholder: 'adres klientki' });
    const num = h('input', { class: 'field-input', id: 'n-num', type: 'number', min: 1, max: 20, value: 1, required: true });
    const tot = h('input', { class: 'field-input', id: 'n-tot', type: 'number', min: 1, max: 20, value: 6, required: true });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary', style: { height: '44px' } }, 'Utwórz sesję');
    form = h('form', { class: 'card', style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('h2', { style: { margin: 0, fontSize: '17px' } }, 'Nowa sesja: Jak działamy i cele'),
      h('div', { class: 'form-grid' },
        h('label', { class: 'field-label', for: 'n-name' }, 'Imię klientki', name),
        h('label', { class: 'field-label', for: 'n-email' }, 'E-mail klientki', email),
        h('label', { class: 'field-label', for: 'n-num' }, 'Numer sesji', num),
        h('label', { class: 'field-label', for: 'n-tot' }, 'Wszystkich sesji', tot)),
      err, h('div', {}, btn));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = Math.max(1, +num.value || 1), t = Math.max(n, +tot.value || 6);
      btn.disabled = true;
      try {
        const s = await backend.createSession({ clientName: name.value.trim(), clientEmail: email.value.trim(), number: n, total: t });
        toast('Sesja utworzona');
        location.hash = '#/s/' + s.id;
      } catch (ex) { console.error(ex); err.textContent = 'Nie udało się utworzyć sesji. Sprawdź połączenie i uprawnienia.'; }
      btn.disabled = false;
    });
  }

  app.replaceChildren(h('div', { class: 'page' },
    topbar(backend, user, { right: [h('span', { class: 'live', style: { display: 'none' } }), h('span', { style: { fontSize: '14px', color: 'var(--muted)' } }, user.name + (user.isCoach ? ' · mentorka' : ''))] }),
    h('div', { class: 'dash' }, h('div', { class: 'dash-inner' },
      h('h1', {}, user.isCoach ? 'Twoje sesje' : `Cześć, ${user.name}`),
      form,
      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('h2', { style: { margin: 0, fontSize: '15px', color: 'var(--muted)' } }, user.isCoach ? 'Wszystkie sesje' : 'Twoje sesje'), listEl)))));
  await load();
  return () => {};
}
