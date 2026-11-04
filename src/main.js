import { h } from './util.js?v=202611042208';
import { createDemoBackend } from './backend/demo.js?v=202611042208';
import { renderLogin } from './views/login.js?v=202611042208';
import { renderCoachHome, renderNewMentee, renderMenteeProcess, renderPlanNew, renderCoachSession } from './views/coach.js?v=202611042208';
import { renderMyProcess, renderMySession } from './views/mentee.js?v=202611042208';
import { renderSession } from './views/session.js?v=202611042208';

const cfg = window.TABLICA_CONFIG || {};
const app = document.getElementById('app');
let backend;
let cleanup = null;
let routing = Promise.resolve();

async function boot() {
  try {
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      const { createSupabaseBackend } = await import('./backend/supabase.js?v=202611042208');
      backend = await createSupabaseBackend(cfg);
    } else backend = createDemoBackend();
    await backend.init();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'login-wrap' }, h('div', { class: 'login-card' }, h('h1', {}, 'Coś poszło nie tak'), h('p', {}, 'Nie udało się uruchomić aplikacji. Sprawdź połączenie z internetem i odśwież stronę.'))));
    return;
  }
  backend.onAuthChange(() => route());
  window.addEventListener('hashchange', () => route());
  route();
}

function route() {
  routing = routing.then(async () => {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const user = backend.getUser();
    if (!user) { app.replaceChildren(renderLogin(backend, cfg)); return; }
    const hash = location.hash || '#/';
    const [path, query] = hash.slice(1).split('?');
    const q = new URLSearchParams(query || '');
    const seg = path.split('/').filter(Boolean);
    window.scrollTo(0, 0);
    if (seg[0] === 's' && seg[1]) cleanup = await renderSession(app, backend, user, seg[1], cfg);
    else if (user.isCoach) {
      if (seg[0] === 'k' && seg[1]) cleanup = await renderCoachSession(app, backend, user, seg[1]);
      else if (seg[0] === 'mentee' && seg[1] === 'new') cleanup = await renderNewMentee(app, backend, user);
      else if (seg[0] === 'm' && seg[1]) cleanup = await renderMenteeProcess(app, backend, user, seg[1]);
      else if (seg[0] === 'plan' && seg[1] === 'new') cleanup = await renderPlanNew(app, backend, user, q.get('m'));
      else cleanup = await renderCoachHome(app, backend, user);
    } else {
      if (seg[0] === 'k' && seg[1]) cleanup = await renderMySession(app, backend, user, seg[1], cfg);
      else cleanup = await renderMyProcess(app, backend, user, cfg);
    }
  }).catch(e => console.error(e));
}

boot();
