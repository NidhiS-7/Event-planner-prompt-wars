'use strict';
const $ = (id) => document.getElementById(id);
const form = $('plan-form'), statusEl = $('status'), out = $('result'), errBox = $('errors');
const submitBtn = $('submit'), regenBtn = $('regen');
$('date').min = new Date().toISOString().slice(0, 10);

const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text; // textContent only: AI output is never parsed as HTML
  if (cls) n.className = cls;
  return n;
};
const money = (n, c) => new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(n);
const store = {
  get(k) { try { return localStorage.getItem(k) === '1'; } catch { return false; } },
  set(k, v) { try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* storage unavailable */ } },
};

function checklist(items, prefix) {
  const ul = el('ul', undefined, 'checks');
  items.forEach((item, i) => {
    const id = `${prefix}-${i}`, li = el('li'), cb = el('input');
    cb.type = 'checkbox'; cb.id = id; cb.checked = store.get(id);
    cb.addEventListener('change', () => store.set(id, cb.checked));
    const label = el('label'); label.htmlFor = id;
    if (typeof item === 'string') label.textContent = item;
    else label.append(el('span', item.due, 'due'), ` — ${item.task}`);
    li.append(cb, label); ul.append(li);
  });
  return ul;
}

function panel(title, id) {
  const s = el('section', undefined, 'panel'); s.setAttribute('aria-labelledby', id);
  const h = el('h2', title); h.id = id; s.append(h); return s;
}

function render(plan, key) {
  out.replaceChildren();
  const head = panel('Your plan', 'plan-title');
  head.append(el('p', plan.summary), el('p', `Total budget: ${money(plan.total, plan.currency)}`));
  const print = el('button', 'Print or save as PDF', 'ghost'); print.type = 'button';
  print.addEventListener('click', () => window.print()); head.append(print);

  const b = panel('Budget breakdown', 'budget-title');
  const table = el('table'); table.append(el('caption', 'Suggested spend per category', 'sr-only'));
  const hr = el('tr');
  ['Category', 'Share', 'Amount', 'Why'].forEach((t, i) => { const th = el('th', t); th.scope = 'col'; if (i === 2) th.className = 'num'; hr.append(th); });
  const thead = el('thead'); thead.append(hr); table.append(thead);
  const tbody = el('tbody');
  plan.budget.forEach((r) => {
    const tr = el('tr'), share = el('td'), bar = el('div', undefined, 'bar'), fill = el('span');
    fill.style.width = `${Math.min(100, r.percent)}%`; bar.append(fill);
    share.append(`${r.percent}%`, bar);
    const rowHead = el('th', r.category); rowHead.scope = 'row';
    tr.append(rowHead, share, el('td', money(r.amount, plan.currency), 'num'), el('td', r.note));
    tbody.append(tr);
  });
  table.append(tbody); b.append(table);

  const t = panel('Timeline', 'timeline-title');
  t.append(checklist(plan.timeline, `${key}-t`));

  const v = panel('Vendor checklist', 'vendor-title');
  plan.vendors.forEach((x, i) => v.append(el('h3', x.vendor), checklist(x.tasks, `${key}-v${i}`)));

  const d = panel('Ideas for you', 'ideas-title'), ul = el('ul');
  plan.ideas.forEach((i) => ul.append(el('li', i))); d.append(ul);

  out.append(head, b, t, v, d);
  out.hidden = false; out.focus();
}

async function generate(fresh) {
  errBox.hidden = true;
  const body = Object.fromEntries(new FormData(form));
  body.fresh = fresh;
  submitBtn.disabled = regenBtn.disabled = true;
  statusEl.textContent = 'Planning your event with Gemini…';
  try {
    const res = await fetch('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');
    render(data, `${body.type}-${body.date}-${body.name}`.replace(/\W+/g, '_'));
    statusEl.textContent = data.cached ? 'Plan ready (from recent cache).' : 'Plan ready.';
    regenBtn.hidden = false;
  } catch (e) {
    statusEl.textContent = '';
    errBox.textContent = e.message; errBox.hidden = false;
  } finally { submitBtn.disabled = regenBtn.disabled = false; }
}

form.addEventListener('submit', (e) => { e.preventDefault(); generate(false); });
regenBtn.addEventListener('click', () => generate(true));
