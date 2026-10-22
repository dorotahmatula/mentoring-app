// Eksport sesji do PNG: czysty, czytelny układ (szablon, parking, Co zabieram, tablica) gotowy do wysłania klientce.

import { wrapLines, roundRect } from './board.js?v=202610221739';
import { fmtDate } from './util.js?v=202610221739';
import { HOW_FIELDS, TAKE_FIELDS, goalIds } from './template.js?v=202610221739';

const W = 1240, PAD = 72, INNER = W - PAD * 2;
const C = { ink: '#1A1A1A', muted: '#5F5F66', line: '#E8E8EB', accent: '#0F08A1', tint: '#F1F0FB', canvas: '#F6F5EE' };
const SANS = '"DM Sans", system-ui, sans-serif', SERIF = '"Merriweather", Georgia, serif';

export async function exportSessionPNG({ session, store, coachName, board, votes }) {
  try { await document.fonts.ready; } catch {}
  const boardCanvas = await board.renderToCanvas(INNER);
  const measure = document.createElement('canvas').getContext('2d');
  const marks = {};
  const height = layout(measure, { session, store, coachName, boardCanvas, votes, draw: false, marks });
  const cv = document.createElement('canvas');
  const dpr = 2;
  cv.width = W * dpr; cv.height = height * dpr;
  const ctx = cv.getContext('2d');
  ctx.scale(dpr, dpr);
  layout(ctx, { session, store, coachName, boardCanvas, votes, draw: true, marks });
  const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
  const name = `Sesja-${session.number}-${(session.clientName || 'klientka').replace(/[^\p{L}\p{N}]+/gu, '-')}.png`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return name;
}

function layout(ctx, { session, store, coachName, boardCanvas, votes, draw, marks }) {
  let y = 0;
  const text = (s, x, yy, font, color, align = 'left') => { if (!draw) return; ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top'; ctx.fillText(s, x, yy); };
  const para = (s, x, maxW, font, color, lh) => {
    ctx.font = font;
    const lines = wrapLines(ctx, s, maxW).filter((l, i, arr) => l || i < arr.length - 1);
    lines.forEach((l, i) => text(l, x, y + i * lh, font, color));
    y += Math.max(1, lines.length) * lh;
  };
  const voteDots = (target, x, yy) => {
    const list = votes.on(target);
    list.forEach((v, i) => { if (draw) { ctx.fillStyle = v.color; ctx.beginPath(); ctx.arc(x - i * 16, yy, 6, 0, Math.PI * 2); ctx.fill(); } });
  };

  if (draw) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, 100000); }
  y = 56;
  text('DOROTA MATUŁA · MENTORING', PAD, y, `600 12px ${SANS}`, C.muted);
  text(fmtDate(Date.now()), W - PAD, y, `400 13px ${SANS}`, C.muted, 'right');
  y += 36;
  text(session.title || 'Jak działamy i cele', PAD, y, `700 34px ${SERIF}`, C.accent);
  y += 52;
  text(`${session.clientName || ''} · Sesja ${session.number} z ${session.total}${coachName ? ' · mentorka: ' + coachName : ''}`, PAD, y, `500 16px ${SANS}`, C.muted);
  y += 34;
  for (let i = 0; i < session.total; i++) { if (draw) { ctx.fillStyle = i < session.number ? C.accent : C.line; roundRect(ctx, PAD + i * 40, y, 32, 6, 3); ctx.fill(); } }
  y += 40;

  const section = (title) => { y += 16; text(title.toUpperCase(), PAD, y, `600 13px ${SANS}`, C.accent); y += 28; };

  // Cele
  section('Cele');
  const ids = goalIds(store);
  ids.forEach((id, idx) => {
    const top = y;
    y += 20;
    text(`Cel ${idx + 1}`, PAD + 24, y, `600 13px ${SANS}`, C.muted); y += 26;
    for (const [f, label] of [['learn', 'Czego chcę się nauczyć'], ['success', 'Po czym poznam, że się udało']]) {
      text(label, PAD + 24, y, `400 13px ${SANS}`, C.muted); y += 20;
      para(store.get(`gf:${id}:${f}`) || '—', PAD + 24, INNER - 48, `400 17px ${SANS}`, C.ink, 25); y += 10;
    }
    const today = store.get(`gf:${id}:today`);
    text('Gdzie jestem dziś', PAD + 24, y, `400 13px ${SANS}`, C.muted);
    for (let i = 0; i < 10; i++) { if (draw) { ctx.fillStyle = today && i < today ? C.accent : C.line; ctx.beginPath(); ctx.arc(PAD + 160 + i * 20, y + 8, 7, 0, Math.PI * 2); ctx.fill(); } }
    text(today ? `${today}/10` : '—', PAD + 370, y, `600 14px ${SANS}`, C.ink);
    y += 34;
    if (draw) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; roundRect(ctx, PAD, top, INNER, y - top, 12); ctx.stroke(); }
    voteDots(`goal:${id}`, W - PAD - 20, top + 22);
    y += 14;
  });

  // Jak działamy
  section('Jak działamy');
  const howTop = y;
  y += 8;
  HOW_FIELDS(coachName).forEach(([key, label], i) => {
    y += 12;
    text(label, PAD + 24, y, `400 13px ${SANS}`, C.muted); y += 20;
    para(store.get(key) || '—', PAD + 24, INNER - 80, `400 17px ${SANS}`, C.ink, 25);
    voteDots(key, W - PAD - 20, y - 30);
    y += 12;
    if (draw && i < 3) { ctx.fillStyle = '#F0F0F2'; ctx.fillRect(PAD + 1, y, INNER - 2, 1); }
  });
  y += 8;
  if (draw) { ctx.strokeStyle = C.line; roundRect(ctx, PAD, howTop, INNER, y - howTop, 12); ctx.stroke(); }
  y += 14;

  // Parking
  const park = store.list('park:').sort((a, b) => (a[1].order || 0) - (b[1].order || 0));
  section('Parking: wracamy do tego później');
  if (!park.length) { text('Brak tematów', PAD, y, `400 15px ${SANS}`, C.muted); y += 24; }
  park.forEach(([k]) => {
    const id = k.slice(5);
    if (draw) { ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(PAD + 6, y + 11, 3.5, 0, Math.PI * 2); ctx.fill(); }
    para(store.get('ptext:' + id) || '—', PAD + 22, INNER - 60, `400 16px ${SANS}`, C.ink, 24);
    voteDots(k, W - PAD - 10, y - 12);
    y += 6;
  });

  // Co zabieram
  section('Co zabieram');
  const takeTop = y;
  if (draw && marks.take) { ctx.fillStyle = C.tint; roundRect(ctx, PAD, takeTop, INNER, marks.take, 14); ctx.fill(); }
  y += 20;
  TAKE_FIELDS(session).forEach(([key, label]) => {
    text(label, PAD + 24, y, `600 14px ${SANS}`, C.ink); y += 22;
    para(store.get(key) || '—', PAD + 24, INNER - 48, `400 16px ${SANS}`, '#2A2A40', 24); y += 14;
  });
  y += 6;
  marks.take = y - takeTop;
  y += 14;

  // Tablica
  if (boardCanvas) {
    section('Tablica');
    const bw = boardCanvas.width / 2, bh = boardCanvas.height / 2;
    if (draw) {
      ctx.drawImage(boardCanvas, PAD, y, bw, bh);
      ctx.strokeStyle = C.line; roundRect(ctx, PAD, y, bw, bh, 12); ctx.stroke();
    }
    y += bh + 20;
  }

  y += 24;
  text('mentoring.dorotamatula.pl', PAD, y, `400 12px ${SANS}`, C.muted);
  y += 56;
  return Math.ceil(y);
}
