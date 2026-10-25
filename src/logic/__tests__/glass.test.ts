/// <reference types="node" />
/**
 * The Glass look (1.44): the setting and the wallpaper chosen, the colour sums the glass is made
 * of, and the wallpaper's own pixels, which are what the boot animation draws and what the
 * drawing on screen reproduces with gradients. Run with
 * `node --test src/logic/__tests__/glass.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as glass from '../glass.ts';
import { memoryPrefs } from '../prefs.ts';
import { lookOf } from '../theme.ts';

test('glass: on unless it is switched off, and which background', () => {
  const p = memoryPrefs();
  assert.ok(glass.wanted(p), 'the look the app starts with');
  assert.equal(glass.wall(p), 'aurora');
  assert.equal(glass.wallName(p), 'Aurora');

  glass.set(p, false);
  assert.ok(!glass.wanted(p));
  glass.set(p, true);
  assert.ok(glass.wanted(p));

  glass.setWall(p, 'ocean');
  assert.equal(glass.wall(p), 'ocean');
  assert.equal(glass.wallName(p), 'Ocean');
  glass.setWall(p, 'nonsense');
  assert.equal(glass.wall(p), 'aurora', 'anything else falls back to Aurora');

  // a background kept from an Android backup is read, junk and all
  p.put('glassWall', 'sunset');
  assert.equal(glass.wall(p), 'sunset');
  p.put('glassWall', '');
  assert.equal(glass.wall(p), 'aurora');
});

test('glass: fading, mixing and laying one colour over another', () => {
  assert.equal(glass.alpha('#FFFFFF'), 1, 'a colour without an alpha is opaque');
  assert.equal(glass.alpha('#FFFFFF80'), 128 / 255);

  assert.equal(glass.fade('#FFFFFF80', 0), '#FFFFFF00');
  assert.equal(glass.fade('#FFFFFF80', 1), '#FFFFFF80');
  assert.equal(glass.fade('#FFFFFFFF', 0.5), '#FFFFFF80');
  assert.equal(glass.fade('#FFFFFF80', 5), '#FFFFFF80', 'never more than it had');

  // the alpha travels with the colour, so a glass panel mixed with anything stays glass
  assert.equal(glass.mix('#FFFFFF00', '#00000000', 0.5), '#80808000');
  assert.equal(glass.mix('#FFFFFF', '#000000', 0.5), '#808080', 'two opaque colours stay opaque');

  // white at 15% over black is a dark grey; the same white over white is white
  assert.equal(glass.over('#FFFFFF26', '#000000'), '#262626');
  assert.equal(glass.over('#FFFFFFFF', '#000000'), '#FFFFFF');
  assert.equal(glass.over('#FFFFFF00', '#123456'), '#123456', 'nothing shows through nothing');
});

test('glass: the wallpaper is painted dark, top to bottom, with spots of colour on it', () => {
  const w = 40;
  const h = 24;
  for (let n = 0; n < 3; n++) {
    const px = glass.paint(n, w, h);
    assert.equal(px.length, w * h);
    assert.ok(
      px.every((c) => /^#[0-9A-F]{6}$/.test(c)),
      'opaque colours',
    );
    const { top, bottom, spots } = glass.spots(n);
    assert.equal(spots.length, 5);
    // the painted corners are the gradient's ends, tinted by whatever spot reaches them
    const dark = (c: string) => parseInt(c.substring(1, 3), 16) + parseInt(c.substring(3, 5), 16) + parseInt(c.substring(5, 7), 16);
    assert.ok(dark(top) < 300 && dark(bottom) < 300, 'both ends are dark enough for white text');
  }
  // an unknown wallpaper is Aurora
  assert.deepEqual(glass.paint(9, 4, 4), glass.paint(0, 4, 4));
  assert.deepEqual(glass.spots(-1), glass.spots(0));
  // one row high: the gradient has nowhere to go and the top colour is used
  assert.equal(glass.paint(0, 1, 1).length, 1);
});

test('glass: blurring, shading and averaging pixels', () => {
  // a single white pixel in the middle of black spreads out and nothing is left at full white
  const w = 9;
  const h = 9;
  const px = new Array(w * h).fill('#000000');
  px[4 * w + 4] = '#FFFFFF';
  const blurred = glass.blur(px, w, h, 2);
  assert.equal(blurred.length, px.length);
  assert.notEqual(blurred[4 * w + 4], '#FFFFFF', 'the middle is no longer white');
  assert.notEqual(blurred[4 * w + 2], '#000000', 'its neighbours have picked some up');
  assert.deepEqual(glass.blur(px, w, h, 0), px, 'no radius, no blurring');

  // three box blurs of a flat colour leave it exactly as it was, edges included
  const flat = new Array(w * h).fill('#204060');
  assert.deepEqual(glass.blur(flat, w, h, 3), flat);

  assert.deepEqual(glass.shade(['#FFFFFF', '#102030'], 0), ['#000000', '#000000']);
  assert.deepEqual(glass.shade(['#FFFFFF'], 1), ['#FFFFFF']);
  assert.deepEqual(glass.shade(['#FFFFFF'], 0.5), ['#808080']);

  assert.equal(glass.average(['#204060', '#204060']), '#204060');
  assert.equal(glass.average(['#000000', '#FFFFFF']), '#7F7F7F');
  assert.equal(glass.average([]), '#000000');
});

test('glass: the colour under everything is dark, and darker at night', () => {
  const bright = (c: string) => parseInt(c.substring(1, 3), 16) + parseInt(c.substring(3, 5), 16) + parseInt(c.substring(5, 7), 16);
  for (let n = 0; n < 3; n++) {
    const day = glass.backgroundOf(n, false);
    const night = glass.backgroundOf(n, true);
    assert.ok(/^#[0-9A-F]{6}$/.test(day));
    assert.ok(bright(day) < 240, 'white text reads on it');
    assert.ok(bright(night) < bright(day), 'darker after dark');
  }
  // a pop-up with nothing behind it gets an opaque panel, lighter than the background
  const bg = glass.backgroundOf(0, false);
  assert.ok(bright(glass.solid(bg, false)) > bright(bg));
  assert.ok(bright(glass.solid(bg, true)) < bright(glass.solid(bg, false)), 'night glass is dimmer');
});

test("glass: the theme's look dressed in glass keeps its accent", () => {
  const look = lookOf({ colours: { accent: '#FF8800', text: '#D8DCE2', textDim: '#8A8F96' }, cornerRadius: 14 });
  const g = glass.apply(look, 'aurora', false);
  assert.equal(g.accent, '#FF8800', "the theme's own accent stays");
  assert.equal(g.text, glass.TEXT);
  assert.equal(g.textDim, glass.DAY_DIM);
  assert.equal(g.panel, glass.DAY_FILL);
  assert.equal(g.panelTop, glass.DAY_TOP);
  assert.equal(g.edge, glass.DAY_EDGE);
  assert.equal(g.radius, glass.RADIUS);
  assert.equal(g.chrome, false);
  assert.equal(g.gradient, null, "the theme's gradient gives way to the wallpaper");
  assert.deepEqual(g.glass, { wall: 'aurora', which: 0, night: false, shade: glass.DAY_SHADE, picture: undefined });

  const night = glass.apply(look, 'ocean', true);
  assert.equal(night.panel, glass.NIGHT_FILL);
  assert.equal(night.textDim, glass.NIGHT_DIM);
  assert.equal(night.glass?.which, 2);
  assert.equal(night.glass?.shade, glass.NIGHT_SHADE);

  // a theme that highlights with its grey gets the glass grey, so the highlight still shows
  const grey = lookOf({ colours: { accent: '#8A8F96', textDim: '#8A8F96' } });
  assert.equal(glass.apply(grey, 'aurora', false).accent, glass.DAY_DIM);

  // "My picture" takes the theme's own background picture, and nothing when it has none
  const withPic = { ...look, backgroundImage: 'file:///themes/mine/background.jpg' };
  assert.equal(glass.apply(withPic, 'mine', false).glass?.picture, 'file:///themes/mine/background.jpg');
  assert.equal(glass.apply(withPic, 'mine', false).backgroundImage, undefined, 'it is the wallpaper now, not the panel picture');
  assert.equal(glass.apply(look, 'mine', false).glass?.picture, undefined);
  assert.equal(glass.apply(look, 'mine', false).glass?.which, 0, 'and Aurora is painted instead');
});
