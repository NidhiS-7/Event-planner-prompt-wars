'use strict';
const $ = (id) => document.getElementById(id);
const form = $('plan-form'), statusEl = $('status'), out = $('result'), errBox = $('errors');
const submitBtn = $('submit'), regenBtn = $('regen'), loader = $('loader'), flavor = $('flavor');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#4a2c82', '#d9921a', '#0f766e', '#c2410c', '#1d4ed8', '#4d7c0f', '#be185d', '#475569', '#92400e'];
const HINTS = {
  wedding: { name: "Riya & Aman's wedding", prefs: 'Outdoor evening, vegetarian menu, live folk music' },
  birthday: { name: "Aarav's 10th birthday", prefs: 'Space theme, games, a nut-free cake' },
  community: { name: 'Diwali Mela', prefs: 'Family friendly, food stalls, local artists, low cost' },
};
const MESSAGES = ['Scouting venues and vibes…', 'Splitting the budget…', 'Lining up vendors…', 'Writing your timeline…', 'Adding a few ideas…'];
const NS = 'http://www.w3.org/2000/svg';

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
};
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text; // textContent only: AI output is never parsed as HTML
  if (cls) n.className = cls;
  return n;
};
const money = (n, c) => new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const fmtDate = (d) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
const daysTo = (d) => { const t = new Date(); return Math.round((Date.parse(`${d}T00:00:00Z`) - Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())) / 864e5); };
const rel = (n) => (n <= 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

async function post(url, data) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

/* ---------- delight: count-up and confetti (both skipped for reduced motion) ---------- */
function countUp(node, to, fmt = String) {
  if (reduce) { node.textContent = fmt(to); return; }
  const start = performance.now();
  (function tick(now) {
    const p = Math.min(1, (now - start) / 800);
    node.textContent = fmt(Math.round(to * (1 - (1 - p) ** 3)));
    if (p < 1) requestAnimationFrame(tick);
  })(start);
}

function confetti() {
  if (reduce) return;
  const c = document.createElement('canvas');
  c.className = 'confetti'; c.setAttribute('aria-hidden', 'true');
  c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const g = c.getContext('2d');
  const bits = Array.from({ length: 110 }, () => ({
    x: c.width / 2 + (Math.random() - 0.5) * 200, y: c.height * 0.35, vx: (Math.random() - 0.5) * 12, vy: -Math.random() * 11 - 3,
    s: 5 + Math.random() * 6, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 0.4, col: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));
  let t = 0;
  (function frame() {
    g.clearRect(0, 0, c.width, c.height);
    bits.forEach((p) => {
      p.vy += 0.28; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col; g.globalAlpha = Math.max(0, 1 - t / 110);
      g.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.6); g.restore();
    });
    if (++t < 110) requestAnimationFrame(frame); else c.remove();
  })();
}

/* ---------- building blocks ---------- */
function panel(title, id, index) {
  const s = el('section', undefined, 'panel'); s.setAttribute('aria-labelledby', id); s.style.setProperty('--i', index);
  const h = el('h2', title); h.id = id; s.append(h); return s;
}

function checklist(items, prefix, extra) {
  const ul = el('ul', undefined, 'checks');
  items.forEach((item, i) => {
    const id = `${prefix}-${i}`, li = el('li'), cb = el('input'), label = el('label');
    cb.type = 'checkbox'; cb.id = id; cb.checked = ls.get(id) === '1'; label.htmlFor = id;
    cb.addEventListener('change', () => { ls.set(id, cb.checked ? '1' : '0'); applyFilter(); updateProgress(); });
    if (typeof item === 'string') label.textContent = item;
    else label.append(el('span', fmtDate(item.due), 'due'), ` — ${item.task} `, el('span', `(${rel(daysTo(item.due))})`, 'rel'));
    li.append(cb, label); ul.append(li);
  });
  if (extra) ul.id = extra;
  return ul;
}

function donut(rows, total, currency) {
  const wrap = el('div', undefined, 'donut-wrap'), svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 42 42'); svg.setAttribute('class', 'donut'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Budget split: ${rows.map((r) => `${r.category} ${r.percent}%`).join(', ')}`);
  let acc = 0; const arcs = [];
  rows.forEach((r, i) => {
    const c = document.createElementNS(NS, 'circle');
    Object.entries({ cx: 21, cy: 21, r: 15.9155, fill: 'none', 'stroke-width': 6, stroke: COLORS[i % COLORS.length], 'stroke-dashoffset': 25 - acc, class: 'arc' })
      .forEach(([k, v]) => c.setAttribute(k, v));
    c.style.strokeDasharray = '0 100'; acc += r.percent; arcs.push([c, r.percent]); svg.append(c);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => arcs.forEach(([c, p]) => {
    const len = Math.max(p - 0.6, 0.1); c.style.strokeDasharray = `${len} ${100 - len}`;
  })));
  const center = el('div', undefined, 'donut-center'); center.append(el('span', 'Total'), el('b', money(total, currency)));
  wrap.append(svg, center);
  return { wrap, svg, arcs: arcs.map(([c]) => c) };
}

/* ---------- live progress and filter ---------- */
let lastPct = 0;
function updateProgress() {
  const boxes = [...out.querySelectorAll('.checks input')], done = boxes.filter((b) => b.checked).length;
  const pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0, bar = $('progress');
  if (!bar) return;
  bar.setAttribute('aria-valuenow', pct); bar.firstChild.style.width = `${pct}%`;
  $('done-count').textContent = `${done} / ${boxes.length}`;
  if (pct === 100 && lastPct < 100) confetti();
  lastPct = pct;
}
function applyFilter() {
  const f = out.dataset.filter || 'all';
  out.querySelectorAll('#timeline-list li').forEach((li) => {
    const done = li.querySelector('input').checked;
    li.hidden = (f === 'pending' && done) || (f === 'done' && !done);
  });
}

/* ---------- actions: copy, calendar ---------- */
function planText(plan, title) {
  const L = [`${title} — plan`, plan.summary, '', 'BUDGET'];
  plan.budget.forEach((r) => L.push(`- ${r.category}: ${money(r.amount, plan.currency)} (${r.percent}%)`));
  L.push('', 'TIMELINE'); plan.timeline.forEach((t) => L.push(`- ${t.due}: ${t.task}`));
  L.push('', 'VENDORS'); plan.vendors.forEach((v) => { L.push(v.vendor); v.tasks.forEach((t) => L.push(`  [ ] ${t}`)); });
  L.push('', 'IDEAS'); plan.ideas.forEach((i) => L.push(`- ${i}`));
  return L.join('\n');
}
function downloadIcs(plan, title) {
  const esc = (s) => s.replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n');
  const ymd = (d) => d.replace(/-/g, '');
  const next = (d) => new Date(Date.parse(`${d}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gather//Event Planner//EN'];
  plan.timeline.forEach((t, i) => L.push('BEGIN:VEVENT', `UID:gather-${stamp}-${i}@gather.local`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${ymd(t.due)}`, `DTEND;VALUE=DATE:${ymd(next(t.due))}`, `SUMMARY:${esc(`${title}: ${t.task}`)}`, 'END:VEVENT'));
  L.push('END:VCALENDAR');
  const a = el('a'); a.href = URL.createObjectURL(new Blob([L.join('\r\n')], { type: 'text/calendar' }));
  a.download = 'event-timeline.ics'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Ask the planner (second Gemini feature) ---------- */
function askPanel(ctx, index) {
  const p = panel('Ask the planner', 'ask-title', index); p.id = 'ask';
  p.append(el('p', 'Need a rain plan, cheaper options or menu ideas? Ask Gemini about this event.', 'muted'));
  const answers = el('div'); answers.setAttribute('aria-live', 'polite');
  const row = el('form', undefined, 'ask-row'), input = el('input'), label = el('label', 'Your question', 'sr-only'), go = el('button', 'Ask');
  input.id = 'ask-input'; input.maxLength = 300; input.placeholder = 'e.g. What if it rains?'; label.htmlFor = 'ask-input'; go.type = 'submit';
  row.append(label, input, go);

  async function submit(q) {
    if (q.trim().length < 3) { input.focus(); return; }
    go.disabled = true; go.textContent = 'Thinking…';
    const box = el('div', undefined, 'answer'); box.append(el('strong', q)); answers.prepend(box);
    try {
      const { answer } = await post('/api/ask', { ...ctx, question: q });
      answer.split(/\n+/).forEach((line) => box.append(el('p', line)));
      input.value = '';
    } catch (e) { box.append(el('p', e.message)); }
    finally { go.disabled = false; go.textContent = 'Ask'; }
  }
  row.addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });
  const chips = el('div', undefined, 'chips');
  ['What is a good rain backup plan?', 'Where can I cut costs without it showing?', 'Suggest a simple menu'].forEach((q) => {
    const b = el('button', q, 'ghost small'); b.type = 'button'; b.addEventListener('click', () => submit(q)); chips.append(b);
  });
  p.append(chips, row, answers);
  return p;
}

/* ---------- render ---------- */
function render(plan, key, body) {
  out.replaceChildren(); out.dataset.filter = 'all';
  const title = body.name || `${body.type} plan`, days = daysTo(body.date);

  const head = panel(title, 'plan-title', 0);
  head.append(el('p', plan.summary));
  const stats = el('div', undefined, 'stats'), mk = (label) => { const s = el('div', undefined, 'stat'), b = el('b', '0'); s.append(b, el('span', label)); stats.append(s); return b; };
  const dayB = mk(days <= 0 ? 'Event day' : 'Days to go'), guestB = mk('Budget per guest'), doneB = mk('Tasks done'); doneB.id = 'done-count';
  const prog = el('div', undefined, 'progress'); prog.id = 'progress'; prog.setAttribute('role', 'progressbar'); prog.setAttribute('aria-label', 'Checklist progress');
  ['valuemin', 'valuemax', 'valuenow'].forEach((k, i) => prog.setAttribute(`aria-${k}`, [0, 100, 0][i])); prog.append(el('span'));
  const actions = el('div', undefined, 'row');
  [['Copy plan', () => navigator.clipboard.writeText(planText(plan, title)).then(() => { statusEl.textContent = 'Plan copied to clipboard.'; }, () => { statusEl.textContent = 'Copy is not available in this browser.'; })],
    ['Add to calendar (.ics)', () => downloadIcs(plan, title)], ['Print or save as PDF', () => window.print()]].forEach(([t, fn]) => {
    const b = el('button', t, 'ghost'); b.type = 'button'; b.addEventListener('click', fn); actions.append(b);
  });
  head.append(stats, prog, actions);

  const b = panel('Budget breakdown', 'budget-title', 1), layout = el('div', undefined, 'budget');
  const d = donut(plan.budget, plan.total, plan.currency);
  const table = el('table'), hr = el('tr'), tbody = el('tbody');
  table.append(el('caption', 'Suggested spend per category', 'sr-only'));
  ['Category', 'Share', 'Amount', 'Why'].forEach((t, i) => { const th = el('th', t); th.scope = 'col'; if (i === 2) th.className = 'num'; hr.append(th); });
  const thead = el('thead'); thead.append(hr); table.append(thead);
  plan.budget.forEach((r, i) => {
    const tr = el('tr'), rowHead = el('th'), sw = el('span', undefined, 'swatch');
    sw.style.background = COLORS[i % COLORS.length]; rowHead.scope = 'row'; rowHead.append(sw, r.category);
    tr.append(rowHead, el('td', `${r.percent}%`), el('td', money(r.amount, plan.currency), 'num'), el('td', r.note));
    tr.addEventListener('mouseenter', () => { d.svg.classList.add('has-on'); d.arcs[i].classList.add('on'); });
    tr.addEventListener('mouseleave', () => { d.svg.classList.remove('has-on'); d.arcs[i].classList.remove('on'); });
    tbody.append(tr);
  });
  table.append(tbody); layout.append(d.wrap, table); b.append(layout);

  const t = panel('Timeline', 'timeline-title', 2), seg = el('div', undefined, 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Filter tasks');
  [['all', 'All'], ['pending', 'To do'], ['done', 'Done']].forEach(([v, text]) => {
    const f = el('button', text, 'small'); f.type = 'button'; f.setAttribute('aria-pressed', v === 'all');
    f.addEventListener('click', () => { out.dataset.filter = v; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === f)); applyFilter(); });
    seg.append(f);
  });
  t.append(seg, checklist(plan.timeline, `${key}-t`, 'timeline-list'));

  const v = panel('Vendor checklist', 'vendor-title', 3);
  plan.vendors.forEach((x, i) => v.append(el('h3', x.vendor), checklist(x.tasks, `${key}-v${i}`)));

  const ideas = panel('Ideas for you', 'ideas-title', 4), ul = el('ul', undefined, 'ideas');
  plan.ideas.forEach((i) => ul.append(el('li', i))); ideas.append(ul);

  out.append(head, b, t, v, ideas, askPanel({ ...body, fresh: undefined }, 5));
  out.hidden = false; out.focus({ preventScroll: true }); out.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  countUp(dayB, Math.max(days, 0)); countUp(guestB, Math.round(plan.total / body.guests), (n) => money(n, plan.currency));
  lastPct = 0; updateProgress(); applyFilter();
  const initial = [...out.querySelectorAll('.checks input')].filter((x) => x.checked).length; lastPct = initial ? 1 : 0;
  if (!initial) confetti();
}

/* ---------- generate ---------- */
let timer;
function setLoading(on) {
  submitBtn.disabled = regenBtn.disabled = on; loader.hidden = !on; clearInterval(timer);
  if (on) { let i = 0; flavor.textContent = MESSAGES[0]; timer = setInterval(() => { flavor.textContent = MESSAGES[++i % MESSAGES.length]; }, 2200); }
}
async function generate(fresh) {
  errBox.hidden = true;
  const body = Object.fromEntries(new FormData(form));
  setLoading(true); statusEl.textContent = 'Planning your event with Gemini…';
  try {
    const data = await post('/api/plan', { ...body, fresh });
    render(data, `${body.type}-${body.date}-${body.name}`.replace(/\W+/g, '_'), body);
    statusEl.textContent = data.cached ? 'Plan ready (from recent cache).' : 'Plan ready.';
    regenBtn.hidden = false;
  } catch (e) {
    statusEl.textContent = ''; errBox.textContent = e.message; errBox.hidden = false;
  } finally { setLoading(false); }
}

/* ---------- form: hints and remembered inputs ---------- */
const today = new Date().toISOString().slice(0, 10);
$('date').min = today;
function applyHints() {
  const h = HINTS[form.elements.type.value];
  $('name').placeholder = h.name; $('preferences').placeholder = h.prefs;
}
try {
  const saved = JSON.parse(ls.get('gather-form') || '{}');
  Object.entries(saved).forEach(([k, v]) => { const f = form.elements[k]; if (f && !(k === 'date' && v < today)) f.value = v; });
} catch { /* ignore corrupt saved data */ }
applyHints();
form.addEventListener('input', () => { applyHints(); ls.set('gather-form', JSON.stringify(Object.fromEntries(new FormData(form)))); });
form.addEventListener('submit', (e) => { e.preventDefault(); generate(false); });
regenBtn.addEventListener('click', () => generate(true));
