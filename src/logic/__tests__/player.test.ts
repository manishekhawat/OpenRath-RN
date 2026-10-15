/// <reference types="node" />
/**
 * The app's own player and its sound rules: stations, songs, resume, quiet hours, parked music,
 * speed volume, sound profiles and ducking (the matching checks from Tests.java, and a few more).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Features from '../features.ts';
import * as player from '../player.ts';
import { memoryPrefs } from '../prefs.ts';
import * as sound from '../sound.ts';

const MIN = 60000;

test('quiet hours', () => {
  assert.ok(sound.inside(23, 22, 6), '23 h quiet');
  assert.ok(sound.inside(3, 22, 6), '3 h quiet');
  assert.ok(!sound.inside(6, 22, 6), '6 h not quiet');
  assert.ok(!sound.inside(12, 22, 6), '12 h not quiet');
  assert.equal(sound.hour(22), '10 pm');
  assert.equal(sound.hour(0), 'midnight');
  assert.equal(sound.hour(12), 'noon');
  assert.equal(sound.hour(7), '7 am');
  assert.ok(!sound.inside(10, 8, 8), 'same hours: never');
  assert.ok(sound.inside(10, 8, 18), 'daytime range');
  const p = memoryPrefs();
  assert.ok(!sound.quietNow(p, 23), 'off by default');
  Features.set(p, 'quiet', true);
  assert.ok(sound.quietNow(p, 23));
  assert.equal(sound.quietLevel(80, 40), 40, 'turned down');
  assert.equal(sound.quietLevel(30, 40), 30, 'already quiet');
  assert.equal(sound.cycle(sound.QUIET_FROM, 23), 0);
  assert.equal(sound.cycle(sound.QUIET_FROM, 0), 20);
  assert.equal(sound.cycle(sound.QUIET_VOL, 17), 20, 'unknown value starts over');
});

test('parked music', () => {
  assert.equal(sound.parkedDecide(true, 60 * MIN, 20, true, 800, 14.1), '', 'engine running');
  assert.equal(sound.parkedDecide(true, 19 * MIN + 5000, 20, true, 0, 12.4), 'warn');
  assert.equal(sound.parkedDecide(true, 21 * MIN, 20, true, 0, 12.4), 'pause');
  assert.equal(sound.parkedDecide(true, MIN, 20, true, 0, 11.7), 'pause', 'low battery');
  assert.equal(sound.parkedDecide(true, 31 * MIN, 20, false, -1, -1), 'remind', 'no obd');
  assert.equal(sound.parkedDecide(false, 99 * MIN, 20, true, 0, 12.0), '', 'silent');
  assert.equal(sound.parkedDecide(true, 25 * MIN, 20, false, -1, -1), '', 'no obd: 30 minutes at least');
  // once per stop, and again after driving off
  const k = new sound.Parked();
  assert.equal(k.tick(0, 0, true, 20), '');
  assert.equal(k.tick(0, 31 * MIN, true, 20), 'remind');
  assert.equal(k.tick(0, 40 * MIN, true, 20), '', 'said once');
  assert.equal(k.tick(30, 41 * MIN, true, 20), '');
  assert.equal(k.tick(0, 42 * MIN, true, 20), '');
  assert.equal(k.tick(0, 73 * MIN, true, 20), 'remind', 'a new stop');
  const o = new sound.Parked();
  o.tick(0, 0, true, 20, true, 0, 12.4);
  assert.equal(o.tick(0, 19 * MIN + 5000, true, 20, true, 0, 12.4), 'warn');
  assert.equal(o.tick(0, 21 * MIN, true, 20, true, 0, 12.4), 'pause');
  assert.equal(o.tick(0, 22 * MIN, true, 20, true, 0, 12.4), '', 'paused once');
  assert.equal(sound.parkedMin(memoryPrefs({ parkedMusicMin: '2' })), 5);
});

test('volume', () => {
  // Tests.java's extraSteps checks, through the speed setting
  const p = memoryPrefs();
  assert.equal(sound.speedSteps(p, 100), 0, 'off by default');
  Features.set(p, 'speedVolume', true);
  assert.equal(sound.speedPer(p), 20, 'medium by default');
  assert.equal(sound.speedSteps(p, 35), 0, 'town');
  assert.equal(sound.speedSteps(p, 40), 1, 'just over');
  assert.equal(sound.speedSteps(p, 100), 4, 'highway');
  p.put('speedVolPer', '3');
  assert.equal(sound.speedSteps(p, 250), 6, 'capped');
  const sv = new sound.SpeedVolume();
  assert.equal(sv.update(2, 10000), 2);
  assert.equal(sv.update(3, 11000), 2, 'no pumping');
  assert.equal(sv.update(3, 15000), 3);
  assert.equal(sv.update(0, 15500), 0, 'down at once');

  assert.equal(sound.volume(60, 0, false), 0.6);
  assert.ok(Math.abs(sound.volume(60, 3, false) - 0.8) < 1e-9, 'three steps up');
  assert.equal(sound.volume(95, 6, false), 1, 'capped at full');
  assert.equal(sound.volume(10, -5, false), 0, 'not below silent');
  assert.ok(Math.abs(sound.volume(50, 0, true) - 0.1) < 1e-9, 'ducked');

  const q = memoryPrefs();
  assert.equal(sound.profileSteps(q, 'highway'), 0, 'profiles off');
  Features.set(q, 'soundProfiles', true);
  assert.equal(sound.profileSteps(q, 'highway'), 2);
  assert.equal(sound.profileSteps(q, 'night'), -2);
  assert.equal(sound.profileSteps(q, 'city'), 0);
  q.put('sndVol:night', '-9');
  assert.equal(sound.profileSteps(q, 'night'), -5, 'kept to -5..5');
  assert.equal(sound.profileEq(q, 'highway'), 'Rock');
  assert.equal(sound.profileEq(q, 'city'), '');
});

test('duck', () => {
  const s = new sound.Speaking();
  assert.ok(s.start(), 'first sentence dips the music');
  assert.ok(!s.start(), 'second one overlaps');
  assert.ok(!s.end());
  assert.ok(s.on);
  assert.ok(s.end(), 'last one ends: music back');
  assert.ok(!s.end(), 'an extra end is ignored');
  assert.ok(!s.on);
});

test('stations', () => {
  const json = JSON.stringify([
    { name: ' Radio Mirchi ', url_resolved: 'https://a/mirchi', codec: 'MP3', tags: 'bollywood,hindi,music,entertainment,india,radio,fm' },
    { name: 'radio mirchi', url_resolved: 'https://b/mirchi', codec: 'MP3' },
    { name: 'Vividh Bharati', url: 'https://c/vb', codec: 'aac+' },
    { name: 'Opus FM', url_resolved: 'https://d/opus', codec: 'OGG' },
    { name: 'No URL', codec: 'MP3' },
    { name: 'Any', url_resolved: 'https://e/any' },
  ]);
  const l = player.parseStations(json);
  assert.deepEqual(
    l.map((t) => t.name),
    ['Radio Mirchi', 'Vividh Bharati', 'Any'],
    'trimmed, no repeats, MP3 or AAC only',
  );
  assert.equal(l[0].src, 'https://a/mirchi');
  assert.equal(l[0].sub, 'bollywood, hindi, music, entertainment, indi', 'tags cut at 40 characters');
  assert.equal(l[1].src, 'https://c/vb', 'url when not resolved');
  assert.deepEqual(player.parseStations('not json'), []);
  assert.deepEqual(player.parseStations(null), []);
  const many = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ name: 'S' + i, url: 'https://s/' + i, codec: 'MP3' })));
  assert.equal(player.parseStations(many).length, 50, 'fifty at most');
  // the kept copy reads back the same
  assert.deepEqual(player.parseStations(player.keepStations(json)), l);
  assert.ok(player.stationsUrl(player.HOSTS[0]).includes('countrycode=IN'));
});

test('stations fall back to the last list', async () => {
  const p = memoryPrefs();
  const ok = JSON.stringify([{ name: 'A', url: 'https://a', codec: 'MP3' }]);
  let tries = 0;
  const first = await player.fetchStations(p, async () => {
    if (tries++ === 0) throw new Error('down');
    return ok;
  });
  assert.equal(tries, 2, 'next mirror');
  assert.equal(first.length, 1);
  const offline = await player.fetchStations(p, async () => {
    throw new Error('offline');
  });
  assert.deepEqual(offline, first, 'from the stations pref');
});

test('songs and the list', () => {
  assert.equal(player.skip(0, -1, 5), 4, 'round to the last');
  assert.equal(player.skip(4, 1, 5), 0, 'round to the first');
  assert.equal(player.skip(3, 1, 0), 0);
  assert.equal(player.current([], 0), null);
  const p = memoryPrefs();
  player.saveIndex(p, player.WEB, 7);
  player.saveIndex(p, player.FILES, 3);
  assert.equal(p.str('station', ''), '7', 'same keys as the Android version');
  assert.equal(player.savedIndex(p, player.FILES), 3);
  assert.ok(player.isAudio('Song.MP3'));
  assert.ok(!player.isAudio('cover.jpg'));
  assert.equal(player.title('Kesariya.mp3'), 'Kesariya');
  assert.equal(player.title('.hidden'), '.hidden');
  assert.ok(!player.longEnough(9000), 'a ringtone');
  assert.ok(player.longEnough(200000));
  assert.ok(player.longEnough(null));
  assert.deepEqual(
    player.byName([{ name: 'b', sub: '', src: '' }, { name: 'A', sub: '', src: '' }]).map((t) => t.name),
    ['A', 'b'],
  );
  assert.equal(player.clock(65), '1:05');
  assert.equal(player.clock(3729), '1:02:09');
  assert.ok(player.retry(4));
  assert.ok(!player.retry(5), 'gives up after five errors');
  assert.equal(player.gaveUp(player.WEB), 'Web radio unreachable');
});

test('resume after switch-on', () => {
  const p = memoryPrefs();
  player.remember(p, 'web');
  assert.equal(player.toResume(p), 'web');
  player.remember(p, 'fm');
  assert.equal(player.toResume(p), '', "FM isn't this player's");
  assert.ok(!player.due(p, true), 'FM: not ours to resume');
  player.remember(p, 'files');
  assert.ok(player.due(p, true), 'app start');
  assert.ok(!player.due(p, false), 'only at start');
  player.remember(p, '');
  assert.ok(!player.due(p, true), 'stopped by the owner');
  player.remember(p, 'files');
  Features.set(p, 'resume', false);
  assert.ok(!player.due(p, true), 'switched off');
});
