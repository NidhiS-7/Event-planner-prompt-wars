'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, normalizeBudget, shapePlan, buildPrompt } = require('../src/planner');

const NOW = new Date('2026-11-01T10:00:00Z');
const ok = { type: 'wedding', guests: 150, budget: 500000, date: '2027-02-14', city: 'Jabalpur' };

test('accepts valid input and defaults currency to INR', () => {
  const { errors, value } = validate(ok, NOW);
  assert.deepEqual(errors, []);
  assert.equal(value.currency, 'INR');
});
test('rejects bad type, guests, budget and dates', () => {
  assert.equal(validate({ ...ok, type: 'party' }, NOW).errors.length, 1);
  assert.equal(validate({ ...ok, guests: 0 }, NOW).errors.length, 1);
  assert.equal(validate({ ...ok, guests: 2.5 }, NOW).errors.length, 1);
  assert.equal(validate({ ...ok, budget: -5 }, NOW).errors.length, 1);
  assert.equal(validate({ ...ok, date: '2026-10-01' }, NOW).errors.length, 1);
  assert.equal(validate({ ...ok, date: 'tomorrow' }, NOW).errors.length, 1);
  assert.ok(validate({}, NOW).errors.length >= 4);
});
test('sanitises and truncates free text', () => {
  const { value } = validate({ ...ok, preferences: '<script>x</script>' + 'a'.repeat(500) }, NOW);
  assert.ok(!/[<>]/.test(value.preferences));
  assert.ok(value.preferences.length <= 300);
});
test('prompt fences user input as data', () => {
  assert.match(buildPrompt(validate(ok, NOW).value), /<user_input>[\s\S]*<\/user_input>/);
});
test('budget amounts always sum exactly to the total', () => {
  const rows = normalizeBudget([{ category: 'A', percent: 33 }, { category: 'B', percent: 33 }, { category: 'C', percent: 33 }], 100000.01);
  assert.equal(Math.round(rows.reduce((a, r) => a + r.amount, 0) * 100), 10000001);
});
test('budget ignores junk rows', () => {
  assert.deepEqual(normalizeBudget([{ category: '', percent: 5 }, { category: 'X', percent: -1 }], 100), []);
  assert.deepEqual(normalizeBudget('nope', 100), []);
});
test('timeline gets real due dates, clamped to today, sorted', () => {
  const raw = {
    budget: [{ category: 'Venue', percent: 100 }],
    timeline: [{ weeksBefore: 0, task: 'Event day' }, { weeksBefore: 500, task: 'Way too early' }, { weeksBefore: 4, task: 'Send invites' }],
    vendors: [{ vendor: 'Caterer', tasks: ['Book tasting'] }], ideas: ['Lanterns'],
  };
  const plan = shapePlan(raw, { ...ok, currency: 'INR' }, NOW);
  assert.equal(plan.timeline[0].due, '2026-11-01');
  assert.equal(plan.timeline.at(-1).due, '2027-02-14');
  const dues = plan.timeline.map((t) => t.due);
  assert.deepEqual(dues, [...dues].sort());
});
test('incomplete AI output is rejected', () => {
  assert.throws(() => shapePlan({ ideas: ['x'] }, { ...ok, currency: 'INR' }, NOW), /incomplete/);
});
