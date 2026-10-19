/// <reference types="node" />
/**
 * The soundboard's sounds, the video window, the phone-projection app, album-cover colours and
 * drag to seek (the matching checks from 1.42's Tests.java). Run with
 * `node --test src/logic/__tests__/media.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as player from '../player.ts';
import { memoryPrefs } from '../prefs.ts';
import * as Features from '../features.ts';
import * as soundboard from '../soundboard.ts';
import * as videos from '../videos.ts';

test('the soundboard makes six sounds', () => {
  for (let i = 0; i < soundboard.PADS.length; i++) {
    const snd = soundboard.make(i);
    let peak = 0;
    for (const v of snd) peak = Math.max(peak, Math.abs(v));
    const name = soundboard.PADS[i];
    assert.ok(snd.length > soundboard.RATE / 4 && snd.length < soundboard.RATE * 3, `soundboard ${name} length`);
    assert.ok(peak > 3000, `soundboard ${name} audible`);
    assert.ok(Math.abs(snd[0]) < 2000, `soundboard ${name} starts quiet`);
  }
  // the pads are quiet while the car moves
  assert.ok(soundboard.canPlay(0));
  assert.ok(soundboard.canPlay(5));
  assert.ok(!soundboard.canPlay(20));
});

test('a sound as a WAV file', () => {
  const w = soundboard.wav(soundboard.make(4));
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF');
  assert.equal(String.fromCharCode(...w.slice(8, 12)), 'WAVE');
  const v = new DataView(w.buffer);
  assert.equal(v.getUint32(24, true), soundboard.RATE, 'sample rate');
  assert.equal(v.getUint16(22, true), 1, 'mono');
  assert.equal(v.getUint16(34, true), 16, '16-bit');
  assert.equal(w.length, 44 + soundboard.make(4).length * 2);
});

test("the sounds are the Android version's", () => {
  // java.util.Random, so the noise in the applause and the fart is the same as on Android
  const r = new soundboard.JavaRandom(43);
  assert.equal(r.next(32), -1170489784);
  assert.equal(r.nextInt(42100), 21951);
  assert.ok(Math.abs(r.nextDouble() - 0.8527678824817223) < 1e-15);
  assert.ok(Math.abs(r.nextGaussian() + 0.48698340704546944) < 1e-15);
});

test('the video window', () => {
  assert.ok(videos.isVideo('Trip.MP4') && !videos.isVideo('song.mp3'), 'video file');
  assert.ok(videos.parked(0.5, 2000), 'video parked');
  assert.ok(!videos.parked(20, 2000), 'video moving');
  assert.ok(!videos.parked(0, -1) && !videos.parked(0, 60000), 'video no gps');
  assert.equal(videos.name('content://media/external/video/123/Trip%20one.mp4'), 'Trip one.mp4');
});

test('the phone-projection app', () => {
  assert.ok(player.looksLikeProjection('com.zjinnova.zlink', 'ZLink'), 'projection zlink');
  assert.ok(player.looksLikeProjection('com.xyz.box', 'AutoKit'), 'projection autokit label');
  assert.ok(player.looksLikeProjection('cn.manstep.phonemirrorBox', 'CarPlay'), 'projection carplay');
  assert.ok(!player.looksLikeProjection('com.google.android.projection.gearhead', 'Android Auto'), 'projection not gearhead');
  assert.ok(!player.looksLikeProjection('com.google.android.apps.maps', 'Maps'), 'projection not maps');
  // the button shows only with the feature on and an app chosen
  const p = memoryPrefs({ 'app:projection': 'com.zjinnova.zlink' });
  assert.equal(player.projectionApp(p), 'com.zjinnova.zlink');
  Features.set(p, 'projection', false);
  assert.equal(player.projectionApp(p), '');
  assert.equal(player.projectionApp(memoryPrefs()), '', 'nothing chosen');
});

test('album-cover colours', () => {
  const red = new Array(100).fill(0xffe02020);
  const c = player.artColour(red);
  assert.ok(c !== 0 && ((c >> 16) & 0xff) > ((c >> 8) & 0xff) * 3, 'art colour red');
  assert.ok(Math.max((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff) <= 150, 'art colour dark enough');
  assert.equal(player.artColour(new Array(100).fill(0xff808080)), 0, 'art colour grey');
  assert.equal(player.artColour([]), 0, 'art colour none');
  assert.equal(player.artColour(null), 0);
  const mix = new Array(100).fill(0xff909090);
  for (let i = 0; i < 30; i++) mix[i] = 0xff2050e0;
  assert.ok((player.artColour(mix) & 0xff) > ((player.artColour(mix) >> 16) & 0xff), 'art colour vivid wins');
});

test('drag to seek', () => {
  assert.equal(player.position(10000, 1000, 1, 6000, 200000), 15000, 'position moves on');
  assert.equal(player.position(10000, 1000, 0, 6000, 200000), 10000, 'position paused');
  assert.equal(player.position(199000, 0, 1, 5000, 200000), 200000, 'position capped');
  assert.equal(player.clockMs(187000), '3:07', 'clock');
  assert.equal(player.clockMs(3723000), '1:02:03', 'clock hours');
  assert.equal(player.seekTo(50, 200, 120), 30, 'a quarter along a two-minute song');
  assert.equal(player.seekTo(-5, 200, 120), 0, 'before the start');
  assert.equal(player.seekTo(500, 200, 120), 120, 'past the end');
  assert.equal(player.seekTo(50, 0, 120), 0, 'no bar yet');
  const p = memoryPrefs();
  assert.ok(player.seekable(p, player.FILES, 180), 'on by default for songs');
  assert.ok(!player.seekable(p, player.WEB, 180), 'radio has no length');
  assert.ok(!player.seekable(p, player.FILES, 0), 'length not known yet');
  Features.set(p, 'seek', false);
  assert.ok(!player.seekable(p, player.FILES, 180), 'switched off');
});
