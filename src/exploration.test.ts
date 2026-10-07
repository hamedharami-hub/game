import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createLandmarkArrivalTracker, type ExplorationLandmark } from './exploration.ts';

const creek: ExplorationLandmark = {
  id: 'creek', x: 0, z: 0, radius: 3, cue: 'The water keeps moving.'
};
const grove: ExplorationLandmark = {
  id: 'grove', x: 12, z: 0, radius: 3, cue: 'The trees hold the quiet.'
};

test('an arrival is emitted once when entering a supplied landmark', () => {
  const tracker = createLandmarkArrivalTracker([creek]);

  assert.equal(tracker.update(0, 0, 0), undefined, 'starting inside primes state without a welcome cue');
  assert.equal(tracker.update(4, 0, 0), undefined);
  assert.equal(tracker.update(2.9, 0, 1), creek);
  assert.equal(tracker.update(2, 0, 2), undefined);
  assert.equal(tracker.update(0, 0, 30), undefined, 'waiting inside does not create a later cue');
});

test('cooldown suppresses quick re-entries until a later exit and re-entry', () => {
  const tracker = createLandmarkArrivalTracker([creek], { cooldownSeconds: 10 });

  assert.equal(tracker.update(5, 0, 0), undefined, 'the first sample primes outside state');
  assert.equal(tracker.update(0, 0, 1), creek);
  assert.equal(tracker.update(5, 0, 2), undefined, 'leaving rearms the landmark');
  assert.equal(tracker.update(0, 0, 5), undefined, 'a quick re-entry is suppressed');
  assert.equal(tracker.update(0, 0, 15), undefined, 'the suppressed entry is not delayed');
  assert.equal(tracker.update(5, 0, 16), undefined);
  assert.equal(tracker.update(0, 0, 16), creek, 'a fresh entry after cooldown can cue again');
});

test('each emitted arrival starts the shared cooldown for other landmarks', () => {
  const tracker = createLandmarkArrivalTracker([creek, grove], { cooldownSeconds: 8 });

  assert.equal(tracker.update(30, 0, 0), undefined);
  assert.equal(tracker.update(0, 0, 1), creek);
  assert.equal(tracker.update(12, 0, 2), undefined, 'the next place is visited during cooldown');
  assert.equal(tracker.update(12, 0, 20), undefined, 'remaining there does not delay its cue');
  assert.equal(tracker.update(20, 0, 21), undefined);
  assert.equal(tracker.update(12, 0, 21), grove);
});

test('overlapping landmarks keep the current arrival stable until it is exited', () => {
  const first = { id: 'first', x: 0, z: 0, radius: 4 } as const;
  const second = { id: 'second', x: 5, z: 0, radius: 4 } as const;
  const tracker = createLandmarkArrivalTracker([first, second], { cooldownSeconds: 0 });

  assert.equal(tracker.update(-10, 0, 0), undefined);
  assert.equal(tracker.update(1, 0, 1), first);
  assert.equal(tracker.update(3, 0, 2), undefined, 'crossing the overlap does not switch cues');
  assert.equal(tracker.update(4.1, 0, 3), second, 'leaving the first circle enters the second');
});

test('nearest containing landmark wins and ties follow supplied order', () => {
  const nearby = { id: 'nearby', x: 2, z: 0, radius: 5 } as const;
  const tracker = createLandmarkArrivalTracker([creek, nearby], { cooldownSeconds: 0 });

  assert.equal(tracker.update(-10, 0, 0), undefined);
  assert.equal(tracker.update(1.9, 0, 1), nearby);

  const tieTracker = createLandmarkArrivalTracker([creek, nearby], { cooldownSeconds: 0 });
  assert.equal(tieTracker.update(-10, 0, 0), undefined);
  assert.equal(tieTracker.update(1, 0, 1), creek);
});

test('invalid samples do not move or clear the active landmark', () => {
  const tracker = createLandmarkArrivalTracker([creek], { cooldownSeconds: 0 });

  assert.equal(tracker.update(5, 0, 0), undefined);
  assert.equal(tracker.update(0, 0, 1), creek);
  assert.equal(tracker.update(Number.NaN, 0, 2), undefined);
  assert.equal(tracker.update(5, 0, Number.POSITIVE_INFINITY), undefined);
  assert.equal(tracker.update(0, 0, 3), undefined, 'invalid samples did not clear the active entry');
  assert.equal(tracker.update(5, 0, 4), undefined);
  assert.equal(tracker.update(0, 0, 5), creek);
});

test('time is active-session input and never reads the machine wall clock', () => {
  const tracker = createLandmarkArrivalTracker([creek], { cooldownSeconds: 3 });
  const originalNow = Date.now;
  try {
    Date.now = () => { throw new Error('exploration must use supplied active time'); };
    assert.equal(tracker.update(5, 0, 6), undefined);
    assert.equal(tracker.update(0, 0, 7), creek);
    assert.equal(tracker.update(5, 0, 8), undefined);
    assert.equal(tracker.update(0, 0, 9), undefined, 'cooldown uses supplied seconds');
    assert.equal(tracker.update(5, 0, 10), undefined);
    assert.equal(tracker.update(0, 0, 10), creek);
  } finally {
    Date.now = originalNow;
  }
});

test('negative time clamps to session start and time never moves backwards', () => {
  const tracker = createLandmarkArrivalTracker([creek], { cooldownSeconds: 5 });

  assert.equal(tracker.update(5, 0, -50), undefined, 'the first sample primes outside state');
  assert.equal(tracker.update(0, 0, 0), creek);
  assert.equal(tracker.update(5, 0, 2), undefined);
  assert.equal(tracker.update(0, 0, 1), undefined, 'backward time stays at the last observed second');
  assert.equal(tracker.update(5, 0, 3), undefined);
  assert.equal(tracker.update(0, 0, 5), creek);
});
