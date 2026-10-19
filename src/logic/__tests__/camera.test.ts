/// <reference types="node" />
/**
 * The dashcam and the parking photo (Dashcam.java, Snap.java). Tests.java has no checks for
 * these, so these cover the rules ported from them: clip names, pruning to the space allowed,
 * harsh braking, the accelerometer's knock, when the dashboard records, and the photo's texts.
 * Run with `node --test src/logic/__tests__/camera.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as dashcam from '../dashcam.ts';
import { memoryPrefs } from '../prefs.ts';
import * as snap from '../snap.ts';

const GB = 1024 * 1024 * 1024;

test('dashcam: clip names', () => {
  const t = new Date(2026, 9, 15, 8, 30, 5).getTime();
  assert.equal(dashcam.clipName(t), '20261015-083005.mp4');
  assert.equal(dashcam.clipTime('20261015-083005.mp4'), t);
  assert.equal(dashcam.clipTime('notes.txt'), 0);
  assert.equal(dashcam.clipLabel('20261015-083005.mp4'), 'Thu 15 Oct, 8:30:05 am');
  assert.equal(dashcam.clipLabel(dashcam.clipName(new Date(2026, 9, 15, 0, 5, 0).getTime())), 'Thu 15 Oct, 12:05:00 am');
  assert.equal(dashcam.clipLabel('other.mp4'), 'other.mp4');
  // names sort by time
  assert.ok(dashcam.clipName(t) < dashcam.clipName(t + 61000));
});

test('dashcam: space and pruning', () => {
  const p = memoryPrefs();
  assert.equal(dashcam.spaceGB(p), 4);
  assert.equal(dashcam.spaceText(p), '4 GB, oldest clips deleted first');
  assert.equal(dashcam.nextSpace(p), 8);
  assert.equal(dashcam.nextSpace(p), 16);
  assert.equal(dashcam.nextSpace(p), 32);
  assert.equal(dashcam.nextSpace(p), 2);
  p.put('dashcamGB', '5'); // not a choice: back to the first
  assert.equal(dashcam.nextSpace(p), 2);

  const files = [
    { name: '20261015-083105.mp4', size: 1 * GB },
    { name: '20261015-083005.mp4', size: 1 * GB },
    { name: '20261015-083205.mp4', size: 1 * GB },
  ];
  assert.deepEqual(dashcam.prune(files, 4, null), [], 'fits');
  assert.deepEqual(dashcam.prune(files, 2, null), ['20261015-083005.mp4'], 'oldest first');
  assert.deepEqual(dashcam.prune(files, 1, null), ['20261015-083005.mp4', '20261015-083105.mp4']);
  assert.deepEqual(dashcam.prune(files, 1, '20261015-083005.mp4'), ['20261015-083105.mp4', '20261015-083205.mp4'], 'never the one recording');
  assert.equal(dashcam.sizeText(45 * 1024 * 1024), '45 MB');
  assert.equal(dashcam.sizeText(1.5 * GB), '1.5 GB');
});

test('dashcam: settings and texts', () => {
  const p = memoryPrefs();
  assert.equal(dashcam.rowText(p, 'recording'), 'off (switch above)', 'off by default');
  p.put('feat:dashcam', 'on');
  assert.equal(dashcam.rowText(p, 'recording'), 'recording');
  assert.equal(dashcam.facing(p), 'back');
  p.put('dashcamFacing', 'front');
  assert.equal(dashcam.facing(p), 'front');
  assert.equal(dashcam.sound(p), false);
  assert.equal(dashcam.joltG(p), 2);
  p.put('dashcamJolt', '0');
  assert.match(dashcam.joltText(p), /only harsh braking/);
  assert.equal(dashcam.savedText(3), '3 saved in dashcam/saved');
  assert.equal(dashcam.protectText(false, false), 'Turn on the dashcam in Settings > Driving');
  assert.equal(dashcam.protectText(true, true), 'Clip saved');
  assert.equal(dashcam.STATUS.error('busy'), 'camera error: busy');
});

test('dashcam: harsh braking keeps the clip', () => {
  const w = new dashcam.BrakeWatch();
  assert.equal(w.feed(60, 1000), false, 'first fix');
  assert.equal(w.feed(45, 2000), true, '15 km/h lost in a second');
  assert.equal(w.feed(30, 3000), false, 'quiet for 5 s');
  assert.equal(w.feed(30, 9000), false, 'gap too long to measure');
  assert.equal(w.feed(17, 10000), true, '13 km/h a second from over 20');
  const slow = new dashcam.BrakeWatch();
  slow.feed(18, 1000);
  assert.equal(slow.feed(2, 2000), false, 'not from over 20 km/h');
  const gentle = new dashcam.BrakeWatch();
  gentle.feed(60, 1000);
  assert.equal(gentle.feed(50, 2000), false, '10 km/h a second is not harsh');
  const start = new dashcam.BrakeWatch();
  start.feed(10, 1000);
  assert.equal(start.feed(25, 2000), false, 'a hard start keeps nothing');
  assert.equal(start.feed(5, 3000), false, '...and holds off braking for 5 s, as Drive.java');
  // 1.42 keeps clips on harsh braking only: a stop measured over less than half a second is ignored
  const hard = new dashcam.BrakeWatch();
  hard.feed(60, 1000);
  assert.equal(hard.feed(0, 1400), false, 'too short a gap to measure');
});

test('dashcam: a knock from the accelerometer', () => {
  const w = new dashcam.JoltWatch();
  assert.equal(w.feed(0, 0, 1, 0, 2), false, 'first reading sets gravity');
  for (let t = 50; t < 2000; t += 50) assert.equal(w.feed(0.1, 0.05, 1, t, 2), false, 'driving along');
  assert.equal(w.feed(2.5, 0, 1, 2000, 2), true, 'a 2.5 g knock');
  assert.equal(w.feed(2.5, 0, 1, 2050, 2), false, 'once, then quiet');
  assert.equal(w.feed(0, 2.6, 1, 8000, 2), true, 'again after 5 s');
  assert.equal(w.feed(0, 0, -3, 20000, 0), false, 'off');
  // mounted on its side: gravity along x is no knock
  const side = new dashcam.JoltWatch();
  side.feed(1, 0, 0, 0, 1);
  assert.equal(side.feed(1, 0.2, 0, 50, 1), false);
});

test('dashcam: the dashboard records from moving until parked', () => {
  const m = new dashcam.Motion();
  assert.equal(m.feed(0, 0), false, 'not before the first drive');
  assert.equal(m.feed(5, 1000), false);
  assert.equal(m.feed(30, 2000), true);
  assert.equal(m.feed(0, 3000), true, 'stopped at a light');
  assert.equal(m.feed(0, 3000 + dashcam.STILL_MS - 1), true);
  assert.equal(m.feed(0, 3000 + dashcam.STILL_MS + 1), false, 'still for 5 minutes');
  m.feed(40, 400000);
  m.parked();
  assert.equal(m.moving, false, 'parked');
  assert.equal(m.feed(0, 410000), false);
});

test('parking photo', () => {
  const p = memoryPrefs();
  assert.equal(snap.plan(p, true, true), 'view', 'on by default; the dashcam view takes it');
  assert.equal(snap.plan(p, true, false), 'ask');
  assert.equal(snap.plan(p, null, true), 'ask', 'permission not asked yet');
  assert.equal(snap.plan(p, false, true), 'none', 'camera refused');
  // the parking photo is part of the Parking switch since 1.35
  p.put('feat:parking', 'off');
  assert.equal(snap.plan(p, true, true), 'none');
  assert.deepEqual(snap.rotate(['latest.jpg', 'previous.jpg']), [{ from: 'latest.jpg', to: 'previous.jpg' }]);
  assert.deepEqual(snap.rotate([]), []);
  assert.equal(snap.takenText(new Date(2026, 9, 14, 20, 5).getTime()), 'Taken Wed 8:05 PM');
  assert.equal(snap.takenText(new Date(2026, 9, 15, 0, 30).getTime()), 'Taken Thu 12:30 AM');
  assert.equal(snap.rowText(true), 'tap to see it');
  assert.equal(snap.rowText(false), 'none yet');
  assert.equal(snap.rowText(false, false), 'needs a camera');
  assert.equal(snap.noneText(), 'No parking photo yet: one is taken when you park');
});
