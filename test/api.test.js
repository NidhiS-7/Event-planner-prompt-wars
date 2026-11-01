'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

const NOW = () => new Date('2026-11-01T10:00:00Z');
const body = { type: 'birthday', guests: 40, budget: 60000, date: '2027-01-20', preferences: 'space theme' };
const fakeAI = (calls) => async (prompt) => {
  calls.push(prompt);
  return {
    summary: 'A cosmic party.', budget: [{ category: 'Food', percent: 60, note: 'Snacks' }, { category: 'Decor', percent: 40, note: 'Stars' }],
    timeline: [{ weeksBefore: 8, task: 'Book venue' }, { weeksBefore: 0, task: 'Party' }],
    vendors: [{ vendor: 'Baker', tasks: ['Order cake'] }], ideas: ['Planet cupcakes'],
  };
};

async function withServer(generate, fn) {
  const server = createApp({ generate, now: NOW }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const post = (base, b) => fetch(`${base}/api/plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('returns a shaped plan and reflects user input in the prompt', async () => {
  const calls = [];
  await withServer(fakeAI(calls), async (base) => {
    const res = await post(base, body);
    assert.equal(res.status, 200);
    const plan = await res.json();
    assert.equal(plan.budget.reduce((a, r) => a + r.amount, 0), 60000);
    assert.match(calls[0], /space theme/);
  });
});
test('caches identical requests and bypasses cache when fresh', async () => {
  const calls = [];
  await withServer(fakeAI(calls), async (base) => {
    await post(base, body);
    const second = await (await post(base, body)).json();
    assert.equal(second.cached, true); assert.equal(calls.length, 1);
    await post(base, { ...body, fresh: true }); assert.equal(calls.length, 2);
  });
});
test('400 on invalid input without calling the AI', async () => {
  const calls = [];
  await withServer(fakeAI(calls), async (base) => {
    const res = await post(base, { ...body, guests: -1 });
    assert.equal(res.status, 400); assert.equal(calls.length, 0);
  });
});
test('502 with a generic message when the AI fails', async () => {
  await withServer(async () => { throw new Error('secret upstream detail'); }, async (base) => {
    const res = await post(base, body);
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(await res.json()).includes('secret'));
  });
});
test('rejects oversized bodies and sets security headers', async () => {
  await withServer(fakeAI([]), async (base) => {
    const big = await post(base, { ...body, preferences: 'x'.repeat(20000) });
    assert.equal(big.status, 413);
    const res = await fetch(`${base}/healthz`);
    assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});
test('serves the accessible front page', async () => {
  await withServer(fakeAI([]), async (base) => {
    const html = await (await fetch(base)).text();
    assert.match(html, /<html lang="en">/); assert.match(html, /aria-live="polite"/);
  });
});
