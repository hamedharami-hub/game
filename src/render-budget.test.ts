import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderBudget } from './render-budget.ts';

test('render budget leaves an idle window after costly drawing without blocking forever', () => {
  const budget = createRenderBudget();
  assert.equal(budget.ready(0), true);
  budget.rendered(10, 90);
  assert.equal(budget.ready(169), false);
  assert.equal(budget.ready(170), true);
  budget.rendered(200, 1200);
  assert.equal(budget.ready(1399), false);
  assert.equal(budget.ready(1400), true);
});

test('fast, negative or invalid render durations do not impose a long delay', () => {
  const budget = createRenderBudget();
  budget.rendered(0, 2);
  assert.equal(budget.ready(4), true);
  budget.rendered(10, 9);
  assert.equal(budget.ready(9), true);
  budget.rendered(NaN, 20);
  assert.equal(budget.ready(20), true);
});
