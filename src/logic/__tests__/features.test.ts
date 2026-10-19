/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Features from '../features.ts';
import { memoryPrefs } from '../prefs.ts';

test('levels: the counts and what each level takes in', () => {
  let s = 0;
  let f = 0;
  let c = 0;
  let d = 0;
  for (const x of Features.ALL) {
    if (x.level === Features.SIMPLE) s++;
    else if (x.level === Features.FULL) f++;
    else if (x.level === Features.CUSTOM) c++;
    else d++;
  }
  assert.equal(s, 15, 'simple count');
  assert.equal(c, 8, 'custom count');
  assert.equal(d, 2, 'dev count');
  assert.ok(f > s && f > c, 'full has the most');
  assert.equal(Features.levelOf('max'), Features.CUSTOM, 'unknown name is custom');
  assert.equal(Features.levelOf('simple'), Features.SIMPLE);

  const weather = Features.get('weather') as Features.Feature;
  const score = Features.get('score') as Features.Feature;
  const eq = Features.get('eq') as Features.Feature;
  const widgets = Features.get('widgets') as Features.Feature;
  const maker = Features.get('maker') as Features.Feature;
  const cab = Features.get('cab') as Features.Feature;
  const obd = Features.get('obd') as Features.Feature;
  assert.ok(Features.inLevel(weather, Features.SIMPLE), 'weather in simple');
  assert.ok(!Features.inLevel(score, Features.SIMPLE), 'score not in simple');
  assert.ok(Features.inLevel(score, Features.FULL), 'score in full');
  assert.ok(!Features.inLevel(eq, Features.FULL) && Features.inLevel(eq, Features.CUSTOM), 'eq only in custom');
  assert.ok(!Features.inLevel(maker, Features.CUSTOM), 'maker in no level');
  assert.ok(!Features.onAt(score, Features.SIMPLE, true), 'simple turns score off');
  assert.ok(Features.onAt(score, Features.FULL, false), 'full turns score on');
  assert.ok(Features.onAt(widgets, Features.CUSTOM, false), 'custom puts widgets back on');
  assert.ok(!Features.onAt(eq, Features.CUSTOM, true), 'eq keeps its default (off)');
  assert.ok(Features.onAt(maker, Features.SIMPLE, true) && !Features.onAt(maker, Features.CUSTOM, false), 'maker untouched');
  assert.ok(Features.onAt(cab, Features.FULL, true) && !Features.onAt(cab, Features.FULL, false), 'cab stays as the owner set it');
  assert.ok(!Features.onAt(obd, Features.SIMPLE, true), 'obd off in simple');
  assert.ok(!Features.onAt(obd, Features.CUSTOM, false), 'obd not forced on');
});

test('levels: picking one, and what Settings shows', () => {
  const p = memoryPrefs();
  assert.ok(!Features.levelPicked(p));
  assert.equal(Features.level(p), Features.CUSTOM, 'custom until one is picked');
  Features.set(p, 'cab', true);
  Features.setLevel(p, Features.SIMPLE);
  assert.ok(Features.levelPicked(p));
  assert.equal(p.str('level', ''), 'simple');
  assert.equal(Features.on(p, 'weather'), true, 'simple keeps the weather');
  assert.equal(Features.on(p, 'score'), false, 'simple turns the score off');
  assert.equal(Features.on(p, 'cab'), false, 'cab is not part of Simple');
  Features.set(p, 'cab', true);
  Features.setLevel(p, Features.FULL);
  assert.equal(Features.on(p, 'cab'), true, 'at Full, cab stays as the owner set it');
  assert.equal(Features.on(p, 'score'), true, 'full turns the score back on');
  assert.ok(Features.shown(p, Features.get('weather') as Features.Feature));
  assert.ok(!Features.shown(p, Features.get('eq') as Features.Feature), 'another level’s switch is hidden');
  // developer mode: seven taps on Version; then every switch shows
  assert.ok(!Features.dev(p));
  p.put('devMode', 'on');
  assert.ok(Features.dev(p));
  assert.ok(Features.shown(p, Features.get('maker') as Features.Feature), 'developer mode shows even the hidden ones');
});

test('merged switches follow their new one, and speed alerts keep the older key', () => {
  for (const [part, whole] of Features.PARTS) {
    assert.equal(Features.get(part), Features.get(whole), `${part} has no switch of its own`);
    assert.equal(Features.get(whole)?.id, whole, `${whole} has a switch`);
  }
  assert.equal(Features.parent('weather'), 'weather', 'plain id is itself');
  assert.equal(Features.parent('tollAhead'), 'tolls');
  const p = memoryPrefs();
  Features.set(p, 'tollAhead', false);
  assert.equal(Features.on(p, 'tolls'), false, 'an old id sets the switch it became part of');
  assert.equal(p.str('feat:tollAhead', '-'), '-', 'and keeps no switch of its own');
  // the removed features (1.35) are gone
  for (const id of ['wrongWay', 'overtake', 'holidayTraffic', 'commute', 'hill', 'wash', 'accidentHelp']) {
    assert.equal(Features.get(id), undefined, `${id} is gone`);
  }
  // speed alerts live in the Android app's "alerts" boolean
  const q = memoryPrefs();
  assert.equal(Features.on(q, 'speedAlerts'), true);
  Features.set(q, 'speedAlerts', false);
  assert.equal(q.str('alerts', ''), 'false');
  assert.equal(Features.on(q, 'speedAlerts'), false);
  assert.equal(Features.on(memoryPrefs({ alerts: 'false' }), 'speedAlerts'), false, 'a restored Android backup is read');
});

test('the mic’s place, from the two old switches', () => {
  assert.equal(Features.micPlace(memoryPrefs()), 'apps');
  assert.equal(Features.micPlace(memoryPrefs({ 'feat:floatMic': 'off' })), 'map');
  assert.equal(Features.micPlace(memoryPrefs({ 'feat:micOverApps': 'off' })), 'float');
  assert.equal(Features.micPlace(memoryPrefs({ micPlace: 'float' })), 'float');
  const p = memoryPrefs({ micPlace: 'map' });
  assert.equal(Features.on(p, 'floatMic'), false);
  assert.equal(Features.on(p, 'micOverApps'), false);
  const q = memoryPrefs({ micPlace: 'apps' });
  assert.ok(Features.on(q, 'floatMic') && Features.on(q, 'micOverApps'));
  Features.set(q, 'voice', false);
  assert.ok(!Features.on(q, 'floatMic'), 'no floating mic without voice commands');
});

test('the 1.42 switches exist, and this edition says which it does', () => {
  for (const id of [
    'smoothSpeed', 'places', 'appDrawer', 'dockStatus', 'hourlyWeather', 'calendar', 'artColour', 'seek', 'stopSummary',
    'setup', 'intro', 'autoTheme', 'tapFeedback', 'achievements', 'projection', 'soundboard', 'video', 'faultWords',
    'askCar', 'ledStrip', 'wake', 'updates', 'reports',
  ]) {
    assert.ok(Features.get(id) != null, `feature ${id} exists`);
  }
  assert.equal(Features.ALL.length, 89);
  for (const id of ['intro', 'setup', 'reports', 'places', 'achievements', 'wake', 'video', 'soundboard']) {
    assert.ok(Features.PORTED.has(id), `${id} is ported`);
  }
  for (const id of ['obd', 'tpms', 'keys', 'eq', 'widgets', 'updates', 'maker', 'ledStrip']) {
    assert.ok(!Features.PORTED.has(id), `${id} needs native Android code`);
  }
  for (const f of Features.ALL) assert.equal(f.ported, Features.PORTED.has(f.id), `${f.id}'s ported flag`);
  // the old ids and the removed features never reach PORTED
  for (const [part] of Features.PARTS) assert.ok(!Features.PORTED.has(part), `${part} is not a switch of its own`);
});

test('reports: off by default, and no level turns it on', () => {
  const r = Features.get('reports') as Features.Feature;
  assert.ok(r != null && !r.def, 'off by default');
  assert.ok(!Features.onAt(r, Features.SIMPLE, false) && !Features.onAt(r, Features.CUSTOM, false), 'no level turns it on');
  assert.ok(Features.onAt(r, Features.SIMPLE, true), 'and none turns it off either');
});
