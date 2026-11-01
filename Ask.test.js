'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const { validateQuestion, shapeAnswer } = require('../src/ask');

const NOW = () => new Date('2026-11-01T10:00:00Z');
const ctx = { type: 'wedding', guests: 120, budget: 400000, date: '2027-02-14', city: 'Jabalpur' };

test('question must be present and the event context must still be valid', () => {
  assert.equal(validateQuestion({ ...ctx, question: 'hi' }, NOW()).errors.length, 1);
  assert.equal(validateQuestion({ ...ctx, guests: 0, question: 'Rain plan?' }, NOW()).errors.length, 1);
  assert.deepEqual(validateQuestion({ ...ctx, question: 'Rain plan?' }, NOW()).errors, []);
});
test('question is sanitised and truncated', () => {
  const { question } = validateQuestion({ ...ctx, question: '<b>Rain</b> plan?' + 'x'.repeat(400) }, NOW());
  assert.ok(!/[<>]/.test(question)); assert.ok(question.length <= 300);
});
test('empty AI answers are rejected', () => {
  assert.throws(() => shapeAnswer({}), /incomplete/);
  assert.equal(shapeAnswer({ answer: ' Hire a tent <b> ' }), 'Hire a tent b');
});

async function withServer(generate, fn) {
  const server = createApp({ generate, now: NOW }).listen(0);
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const post = (base, b) => fetch(`${base}/api/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });

test('POST /api/ask returns an answer and sends the question to the AI', async () => {
  const prompts = [];
  await withServer(async (p) => { prompts.push(p); return { answer: 'Book a tent.' }; }, async (base) => {
    const res = await post(base, { ...ctx, question: 'Rain backup plan?' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).answer, 'Book a tent.');
    assert.match(prompts[0], /Rain backup plan\?/);
  });
});
test('POST /api/ask: 400 for bad input, 502 when the AI fails', async () => {
  await withServer(async () => { throw new Error('boom'); }, async (base) => {
    assert.equal((await post(base, { ...ctx, question: '' })).status, 400);
    const res = await post(base, { ...ctx, question: 'Cheaper decor?' });
    assert.equal(res.status, 502);
    assert.ok(!JSON.stringify(await res.json()).includes('boom'));
  });
});
