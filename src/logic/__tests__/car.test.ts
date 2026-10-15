/// <reference types="node" />
/**
 * The 1.30 checks from Tests.java for the car profile, the 3D car (Car3D, View360.looks360) and
 * voice commands (Voice). Run with `node --test src/logic/__tests__/car.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as car from '../car.ts';
import * as car3d from '../car3d.ts';
import { memoryPrefs } from '../prefs.ts';
import * as voice from '../voice.ts';

const P = (s: string) => voice.str(voice.parse(s));

test('3d: every shape is a whole car, tops facing up', () => {
  for (const sh of car3d.SHAPES) {
    const fs = car3d.build(sh);
    assert.ok(fs.length > 60, `3d ${sh} faces`);
    let out = true;
    for (const f of fs) if (f.layer === 2 && f.c[1] > 0.5 && f.n[1] < -0.5) out = false;
    assert.ok(out, `3d ${sh} body tops face up`);
  }
});

test('3d: camera', () => {
  const cam = new car3d.Cam();
  cam.setup(1000, 600);
  const mid = cam.project(cam.target);
  assert.ok(Math.abs(mid[0] - 500) < 0.5 && Math.abs(mid[1] - 300) < 0.5, '3d target in the middle');
  assert.ok(cam.project(car3d.v(0, 0.7, 2))[2] < cam.project(car3d.v(0, 0.7, -2))[2] || cam.yaw > Math.PI / 2, '3d nose nearer from the front');
});

test('3d: paint puts the plate on the face it belongs to', () => {
  const cam = new car3d.Cam();
  const faces = car3d.build('hatch');
  // from the front the front plate shows, from behind the rear one; one at a time
  cam.yaw = 0;
  let s = car3d.paint(cam, 1000, 600, faces, car3d.dims('hatch'), car3d.COLOURS[0], false);
  assert.equal(s.plates.length, 1);
  assert.ok(s.plates[0].at > 0 && s.plates[0].at <= s.polys.length);
  assert.equal(s.ground.rings.length, 2);
  assert.equal(s.ground.spokes.length, 8);
  assert.equal(s.ground.shadow.length, 24);
  cam.yaw = Math.PI;
  s = car3d.paint(cam, 1000, 600, faces, car3d.dims('hatch'), car3d.COLOURS[0], false);
  assert.equal(s.plates.length, 1);
  // the plate matrix maps the picture's corners onto the quad
  const q = s.plates[0].q;
  const m = car3d.plateMatrix(q);
  const at = (x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  for (const [pt, want] of [
    [at(0, car3d.PLATE_H), q[0]],
    [at(car3d.PLATE_W, car3d.PLATE_H), q[1]],
    [at(0, 0), q[3]],
  ])
    assert.ok(Math.abs(pt[0] - want[0]) < 1e-6 && Math.abs(pt[1] - want[1]) < 1e-6);
});

test('3d: shape, colour and plate from the settings', () => {
  assert.equal(car3d.shape(memoryPrefs()), 'hatch');
  assert.equal(car3d.shape(memoryPrefs({ carBody: 'suv' })), 'suv');
  assert.equal(car3d.shape(memoryPrefs({ carShape: 'muv', carBody: 'suv' })), 'muv');
  assert.equal(car3d.shape(memoryPrefs({ carShape: 'bus' })), 'hatch');
  assert.equal(car3d.colour(memoryPrefs()), '#E9ECEF');
  // saved like Java's String.valueOf(int): 0xFFB3121B is -5041637
  assert.equal(car3d.colourPref('#B3121B'), '-5041637');
  assert.equal(car3d.colour(memoryPrefs({ carColour: '-5041637' })), '#B3121B');
  assert.equal(car3d.colour(memoryPrefs({ carColour: '#1e4f9c' })), '#1E4F9C');
  assert.equal(car3d.plate(memoryPrefs({ cabVehicle: ' dl 1c 1234 ' })), 'DL 1C 1234');
  assert.equal(car3d.plate(memoryPrefs({ carPlate: 'ka01ab0001', cabVehicle: 'x' })), 'KA01AB0001');
  assert.equal(car3d.plateText(''), 'OPENRATH');
  assert.equal(car3d.shade('#FFFFFF', [0, 1, 0], car3d.BODY).length, 7);
});

test('360 app names', () => {
  assert.ok(car3d.looks360('com.ts.avm', 'Panoramic') && car3d.looks360('com.x.y', '360 Safety') && !car3d.looks360('com.tw.radio', 'Radio'));
});

test('car: save', () => {
  const p = memoryPrefs();
  const off: string[] = [];
  car.save(p, { brandId: 'tata-motors', brandName: 'Tata Motors', model: 'Nexon EV Long Range', fuel: 'ev', tank: '30', shape: 'suv', colour: '#1E4F9C' }, (id, on) => {
    if (!on) off.push(id);
  });
  assert.equal(p.str('carSetup', ''), 'yes');
  assert.equal(p.str('carName', ''), 'NEXON EV LONG');
  assert.equal(p.str('tankL', 'none'), 'none'); // electric: no tank
  assert.equal(p.str('carShape', ''), 'suv');
  assert.equal(p.str('carBody', ''), 'suv');
  assert.equal(car3d.colour(p), '#1E4F9C');
  assert.deepEqual(off, car.FUEL_FEATURES);

  const q = memoryPrefs();
  car.save(q, { brandId: 'maruti-suzuki', brandName: 'Maruti Suzuki', model: 'Dzire', fuel: 'petrol', tank: '200', shape: 'sedan' }, () => {});
  assert.equal(q.str('tankL', ''), '120');
  assert.equal(q.str('carBody', ''), 'car');
  assert.equal(q.str('tank', 'none'), 'none');
  assert.equal(car.tankL(q), 120);
  assert.equal(car.tankL(memoryPrefs()), 40);
  assert.equal(car.tankFor('3'), 5);
  assert.equal(car.tankFor('37.4'), 37);
  assert.equal(car.tankFor(''), 0);
  assert.equal(car.tankFor('abc'), 0);
  assert.equal(car.summary(q), 'Maruti Suzuki Dzire, petrol');
  assert.equal(car.summary(memoryPrefs()), 'not set, petrol');
});

test('voice: 360', () => {
  assert.equal(P('show 360 view'), 'view360');
  assert.equal(P('three sixty camera'), 'view360');
});

test('voice: cab', () => {
  assert.equal(P('start the meter'), 'meter:start');
  assert.equal(P('meter band karo'), 'meter:stop');
  assert.equal(P('aaj kitna kamaya'), 'earnings');
  assert.equal(P('how many kilometer').startsWith('meter'), false);
});

test('voice: news', () => {
  assert.equal(P('read the news'), 'news');
  assert.equal(P('aaj ki khabar sunao'), 'news');
  assert.equal(P('समाचार सुनाओ'), 'news');
  assert.equal(P('headlines'), 'news');
  assert.equal(P('newspaper stand'), 'search:newspaper stand');
});

test('voice: commands', () => {
  assert.equal(P('FM 91.1'), 'fm:91.1');
  assert.equal(P('radio 98 point 3 lagao'), 'fm:98.3');
  assert.equal(P('एफएम ९३.५'), 'fm:93.5');
  assert.equal(P('104.0 fm'), 'fm:104.0');
  assert.equal(P('radio chalao'), 'fm');
  assert.equal(P('Call Mom'), 'call:mom');
  assert.equal(P('papa ko call karo'), 'call:papa');
  assert.equal(P('मम्मी को फोन लगाओ'), 'call:मम्मी');
  assert.equal(P('take me home'), 'home');
  assert.equal(P('घर ले चलो'), 'home');
  assert.equal(P('office chalo'), 'office');
  assert.equal(P('nearest petrol pump'), 'fuel');
  assert.equal(P('koi dhaba dikhao'), 'rest');
  assert.equal(P('gaana chalao'), 'music');
  assert.equal(P('अगला'), 'next');
  assert.equal(P('stop'), 'pause');
  assert.equal(P('awaaz badhao'), 'volUp');
  assert.equal(P('volume kam karo'), 'volDown');
  assert.equal(P('navigate to India Gate'), 'search:india gate');
  assert.equal(P('connaught place le chalo'), 'search:connaught place');
  assert.equal(P('Phoenix Mall'), 'search:phoenix mall');
  assert.equal(voice.parse(''), null);
  assert.equal(voice.parse(null), null);
});

test('voice: names and numbers', () => {
  assert.ok(voice.sameName('Mom', 'mummy'), 'same name mummy/Mom');
  assert.ok(voice.sameName('Mom', 'मम्मी'), 'same name मम्मी/Mom');
  assert.ok(voice.sameName('Dad', 'papa'), 'same name papa/Dad');
  assert.ok(!voice.sameName('Ravi', 'mummy'), 'different names');
  assert.equal(voice.number('98450 12345'), '9845012345');
  assert.equal(voice.number('mom'), '');
  assert.equal(voice.freq('911'), '91.1');
  assert.equal(voice.normalise('  FM  ९१ point 1? '), 'fm 91.1');
});

test('voice: driving and chores', () => {
  assert.equal(voice.parse('where did I park')?.kind, 'park');
  assert.equal(voice.parse('yahan paani bhara hai')?.kind, 'flood');
  assert.equal(voice.parse('nearest service centre')?.kind, 'service');
  assert.equal(voice.parse('save the clip')?.kind, 'clip');
  assert.equal(P('show my documents'), 'docs');
  assert.equal(P('कागज दिखाओ'), 'docs');
  assert.equal(P('fog mode on'), 'fog');
  assert.equal(P('bachchon ke games'), 'kids');
  assert.equal(voice.parse('split the cost')?.kind, 'split');
  assert.equal(voice.parse('parking timer')?.kind, 'parkTimer');
  assert.equal(voice.parse('air quality')?.kind, 'aqi');
  assert.equal(voice.parse('show the puc')?.kind, 'docs');
  assert.equal(voice.parse('turn on hotspot')?.kind, 'hotspot');
  assert.equal(voice.parse('weekly report')?.kind, 'weekly');
});

test('voice: a later guess wins only if it is a command', () => {
  assert.equal(voice.str(voice.pick(['phoenix mall', 'fm 91.1'])), 'fm:91.1');
  assert.equal(voice.str(voice.pick(['phoenix mall', 'phoenix hall'])), 'search:phoenix mall');
  assert.equal(voice.str(voice.pick(['take me home', 'fm 91.1'])), 'home');
  assert.equal(voice.pick([]), null);
});
