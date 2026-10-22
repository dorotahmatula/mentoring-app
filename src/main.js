import { h } from './util.js?v=202610221749';
import { createDemoBackend } from './backend/demo.js?v=202610221749';
import { renderLogin } from './views/login.js?v=202610221749';
import { renderDashboard } from './views/dashboard.js?v=202610221749';
import { renderSession } from './views/session.js?v=202610221749';

const cfg = window.TABLICA_CONFIG || {};
const app = document.getElementById('app');
let backend;
let cleanup = null;
let routing = Promise.resolve();

async function boot() {
  try {
    if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
      const { createSupabaseBackend } = await import('./backend/supabase.js?v=202610221749');
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
    const m = location.hash.match(/^#\/s\/([\w-]+)/);
    if (!user) { app.replaceChildren(renderLogin(backend, cfg)); return; }
    if (m) cleanup = await renderSession(app, backend, user, m[1], cfg);
    else cleanup = await renderDashboard(app, backend, user);
  }).catch(e => console.error(e));
}

boot();
