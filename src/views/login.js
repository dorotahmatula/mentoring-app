import { h } from '../util.js?v=202610221739';
import { topbar } from './chrome.js?v=202610221739';

export function renderLogin(backend, cfg) {
  const err = h('p', { class: 'error', role: 'alert' });
  let card;
  if (backend.mode === 'demo') {
    const name = h('input', { class: 'field-input', id: 'l-name', required: true, autocomplete: 'name', placeholder: 'np. Dorota' });
    const email = h('input', { class: 'field-input', id: 'l-email', type: 'email', autocomplete: 'email', placeholder: 'opcjonalnie' });
    const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('label', { class: 'field-label', for: 'l-name' }, 'Twoje imię', name),
      h('label', { class: 'field-label', for: 'l-email' }, 'E-mail', email),
      h('fieldset', { style: { border: 'none', padding: 0, margin: 0 } }, h('legend', { class: 'field-label', style: { marginBottom: '6px' } }, 'Kim jesteś?'),
        h('div', { class: 'seg' },
          h('label', {}, h('input', { type: 'radio', name: 'role', value: 'coach', checked: true }), h('span', {}, 'Mentorka')),
          h('label', {}, h('input', { type: 'radio', name: 'role', value: 'client' }), h('span', {}, 'Klientka')))),
      err,
      h('button', { type: 'submit', class: 'btn btn-primary', style: { height: '44px', justifyContent: 'center' } }, 'Wejdź'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!name.value.trim()) { err.textContent = 'Wpisz imię.'; return; }
      backend.signInDemo({ name: name.value, email: email.value, role: form.role.value });
    });
    card = h('div', { class: 'login-card' },
      h('h1', {}, 'Mentoring'),
      h('p', {}, 'Wspólna przestrzeń do sesji mentoringowych.'),
      h('div', { class: 'notice' }, 'Tryb demo: dane zostają w tej przeglądarce. Otwórz drugą kartę, żeby zobaczyć pracę we dwie.'),
      form);
    setTimeout(() => name.focus(), 0);
  } else {
    const email = h('input', { class: 'field-input', id: 'l-email', type: 'email', required: true, autocomplete: 'email', placeholder: 'twoj@adres.pl' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary', style: { height: '44px', justifyContent: 'center' } }, 'Wyślij link do logowania');
    const form = h('form', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('label', { class: 'field-label', for: 'l-email' }, 'Twój e-mail', email), err, btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true; btn.textContent = 'Wysyłam…';
      try {
        await backend.sendLoginLink(email.value);
        form.replaceWith(h('div', { class: 'notice', role: 'status' }, `Wysłałam link na ${email.value.trim()}. Otwórz maila na tym urządzeniu i kliknij link. Jeśli go nie widzisz, zajrzyj do spamu.`));
      } catch (ex) {
        console.error(ex);
        err.textContent = /rate|limit|seconds/i.test(ex.message || '') ? 'Za dużo prób w krótkim czasie. Spróbuj za kilka minut.' : 'Nie udało się wysłać linku. Sprawdź adres i spróbuj ponownie.';
        btn.disabled = false; btn.textContent = 'Wyślij link do logowania';
      }
    });
    card = h('div', { class: 'login-card' },
      h('h1', {}, 'Mentoring'),
      h('p', {}, `Wspólna przestrzeń do sesji z ${cfg.coachName ? cfg.coachName.replace(/a$/, 'ą') : 'mentorką'}. Zaloguj się adresem, na który dostałaś zaproszenie. Nie potrzebujesz hasła.`),
      form);
    setTimeout(() => email.focus(), 0);
  }
  return h('div', { class: 'page' }, topbar(backend, null), h('div', { class: 'login-wrap' }, card));
}
