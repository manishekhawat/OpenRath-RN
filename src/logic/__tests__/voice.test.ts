/// <reference types="node" />
/**
 * Voice commands, "ask the car" and the fault-code table in plain words (the matching checks from
 * 1.42's Tests.java). Run with `node --test src/logic/__tests__/voice.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as CarAnswer from '../caranswer.ts';
import * as FaultCodes from '../faultcodes.ts';
import * as voice from '../voice.ts';

const P = (s: string) => voice.str(voice.parse(s));

test('voice: the 1.42 commands', () => {
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
  assert.equal(P('show 360 view'), 'view360');
  assert.equal(P('read the news'), 'news');
  assert.equal(P('start the meter'), 'meter:start');
  assert.equal(P('meter band karo'), 'meter:stop');
  assert.equal(P('aaj kitna kamaya'), 'earnings');
  assert.equal(P('newspaper stand'), 'search:newspaper stand');
});

test('voice: questions about the car become "ask"', () => {
  assert.equal(P('how much fuel is left'), 'ask:fuel');
  assert.equal(P('कितना पेट्रोल है'), 'ask:fuel');
  assert.equal(P('any fault codes'), 'ask:faults');
  assert.equal(P("how's the engine"), 'ask:engine');
  assert.equal(P('how is the battery'), 'ask:battery');
  assert.equal(P('how far today'), 'ask:trip');
  // not questions about the car
  assert.equal(P('play FM 91.1'), 'fm:91.1');
  assert.equal(P('how many kilometer').startsWith('meter'), false);
});

test('ask the car: the answers', () => {
  assert.equal(CarAnswer.topic('how much fuel is left'), 'fuel');
  assert.equal(CarAnswer.topic('play FM 91.1'), null);
  const c = CarAnswer.car();
  assert.equal(CarAnswer.answer('fuel', c), "The engine adapter isn't connected, so I can't see the engine.");
  c.connected = true;
  c.fuel = 12;
  assert.equal(CarAnswer.answer('fuel', c), 'Fuel is low, 12 percent. Time to fill up.');
  c.fuel = 60;
  assert.equal(CarAnswer.answer('fuel', c), 'Fuel is at 60 percent.');
  c.volts = 12.6;
  c.rpm = 800;
  assert.ok(CarAnswer.answer('battery', c).includes('alternator'), 'alternator');
  c.volts = 11.5;
  assert.ok(CarAnswer.answer('battery', c).startsWith('The battery is weak'));
  c.coolant = 110;
  assert.ok(CarAnswer.answer('engine', c).startsWith('The engine is hot'), 'hot');
  c.coolant = 90;
  assert.ok(CarAnswer.answer('engine', c).startsWith('The engine looks fine.'));
  assert.equal(CarAnswer.answer('faults', c), "I haven't read the fault codes yet. Open the engine box and tap Read fault codes.");
  c.faults = 0;
  assert.equal(CarAnswer.answer('faults', c), 'No fault codes are stored.');
  c.faults = 2;
  c.worst = FaultCodes.STOP;
  assert.ok(CarAnswer.answer('faults', c).includes('Stop when it is safe'));
  // the trip computer answers even with no adapter
  const t = CarAnswer.car({ todayKm: 42.35, todaySec: 3600 });
  assert.equal(CarAnswer.answer('trip', t), 'Today you have driven 42.4 km in 60 minutes.');
});

test('fault codes in plain words', () => {
  assert.equal(FaultCodes.look('p0301').meaning, 'Misfire, cylinder 1', 'misfire meaning');
  assert.equal(FaultCodes.look('P0217').urgency, FaultCodes.STOP, 'overheat urgent');
  assert.equal(FaultCodes.look('P0399').meaning, 'Ignition or misfire', 'unknown family');
  assert.equal(FaultCodes.family('U0999'), "Network: the car's computers can't talk to each other");
  assert.equal(FaultCodes.family('P1234'), "Maker's own engine or gearbox code");
  assert.equal(FaultCodes.family('P12'), 'Unknown code');
  assert.equal(FaultCodes.worst(['P0420', 'P0217']), FaultCodes.STOP);
  assert.equal(FaultCodes.worst([]), -1, 'worst none');
  assert.ok(FaultCodes.explain('P0301').includes('Check: '));
  assert.ok(FaultCodes.KNOWN_COUNT > 80, 'about 95 common codes');
});

test('the floating mic stays on screen', () => {
  const [x, y] = voice.place(0.5, 0.5, 1000, 600, 64);
  assert.ok(Math.abs(x - 468) < 0.5, 'mic centred x');
  assert.ok(Math.abs(y - 268) < 0.5, 'mic centred y');
  const [ex, ey] = voice.place(1.2, -0.1, 1000, 600, 64);
  assert.ok(Math.abs(ex - 936) < 0.5, 'mic kept on screen x');
  assert.equal(ey, 0, 'mic kept on screen y');
});
