/// <reference types="node" />
/**
 * The boot art checks from Tests.java (bootArt()): the BMP, desc.txt, the stored zip and the
 * timeline, plus the PNG and a drawn frame. Run with `node --test src/logic/__tests__/bootart.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { unzipSync, unzlibSync } from 'fflate';

import * as art from '../bootart.ts';
import { memoryPrefs } from '../prefs.ts';

const near = (want: number, got: number, tol: number) => assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}`);
const END = art.FRAMES / art.FPS;

test('bootart: bmp', () => {
  // 3 x 2, as RGBA: 102030 FFFFFF 000000 / ABCDEF 010203 0A0B0C
  const hex = [0x102030, 0xffffff, 0x000000, 0xabcdef, 0x010203, 0x0a0b0c];
  const px = new Uint8Array(hex.flatMap((c) => [c >> 16, (c >> 8) & 255, c & 255, 255]));
  const b = art.bmp(px, 3, 2);
  assert.equal(b.length, 54 + 12 * 2);
  assert.equal(String.fromCharCode(b[0], b[1]), 'BM');
  assert.equal(b[18] | (b[19] << 8), 3);
  assert.equal(b[22] | (b[23] << 8), 2);
  assert.equal(b[28], 24);
  // bottom-up: the file's first row is the picture's last row, in blue-green-red order
  assert.equal(b[54], 0xef);
  assert.equal(b[56], 0xab);
  assert.equal(b[54 + 12], 0x30);
  assert.equal(b[54 + 9], 0); // row padding
});

test('bootart: desc.txt and timeline', () => {
  assert.equal(art.desc(1024, 600), '1024 600 25\np 1 0 part0\np 0 0 part1\n');
  near(0, art.markAlpha(0), 1e-9);
  near(1, art.markAlpha(2), 1e-9);
  near(0, art.spin(END), 1e-6);
  assert.ok(art.nameAlpha(2.5) === 0 && art.nameAlpha(END) === 1);
  assert.ok(art.shine(END) > 1);
  assert.equal(art.frameName(0), 'part0/000.png');
  assert.equal(art.frameName(89), 'part0/089.png');
  assert.equal(art.frameName(90), 'part1/000.png');
});

test('bootart: stored zip', () => {
  const z = art.storedZip([['desc.txt', new Uint8Array([0x78])], ['part0/000.png', new Uint8Array([1, 2, 3])]]);
  // local header: signature, then method 0 (stored) and sizes
  assert.deepEqual([...z.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(z[8] | (z[9] << 8), 0);
  const second = 30 + 8 + 1;
  assert.equal(z[second + 8] | (z[second + 9] << 8), 0);
  assert.equal(z[second + 18], 3); // compressed size
  const files = unzipSync(z);
  assert.deepEqual(Object.keys(files), ['desc.txt', 'part0/000.png']);
  assert.deepEqual([...files['part0/000.png']], [1, 2, 3]);
  assert.equal(art.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('bootart: png', () => {
  const px = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255]); // 2 x 2
  const p = art.png(px, 2, 2);
  assert.deepEqual([...p.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(String.fromCharCode(...p.subarray(12, 16)), 'IHDR');
  assert.equal(p[19], 2); // width
  assert.equal(p[25], 2); // RGB
  // undo the Sub filter and compare
  const idatLen = (p[33] << 24) | (p[34] << 16) | (p[35] << 8) | p[36];
  const raw = unzlibSync(p.subarray(41, 41 + idatLen));
  assert.equal(raw.length, 2 * 7);
  const row1 = raw.subarray(7, 14);
  assert.equal(row1[0], 1);
  assert.deepEqual([row1[1], row1[2], row1[3], (row1[4] + row1[1]) & 255], [0, 0, 255, 9]);
  assert.equal(art.base64(new Uint8Array([77, 97, 110])), 'TWFu');
  assert.equal(art.base64(new Uint8Array([77, 97])), 'TWE=');
});

test('bootart: frames draw the wheel and the names', () => {
  const c = art.canvas(350, 300);
  const m = art.mark('', undefined);
  assert.ok(m.wheel);
  art.draw(c, 0, m, 'OPENRATH', 'SWIFT');
  assert.ok(c.px.every((v, i) => (i % 4 === 3 ? v === 255 : v === 0)), 'the first frame is black');
  art.draw(c, END, m, 'OPENRATH', 'SWIFT');
  const at = (x: number, y: number) => c.px[(y * 350 + x) * 4 + 1];
  const k = 0.5;
  const cy = Math.round(222 * k);
  assert.ok(at(175, cy - Math.round((10.7 * 0.95 * 200 * k) / 24)) > 100, 'the rim is bright');
  assert.ok(at(175, cy) < 40, 'the hub has its hole');
  let lit = 0;
  for (let x = 0; x < 350; x++) for (let y = Math.round(424 * k) - 14; y < Math.round(424 * k) + 2; y++) if (at(x, y) > 80) lit++;
  assert.ok(lit > 50, 'the brand is drawn');
  const p = memoryPrefs({ carBrandName: 'Maruti Suzuki', carModel: 'Swift' });
  assert.equal(art.brandLine(p), 'MARUTI SUZUKI');
  assert.equal(art.brandLine(memoryPrefs()), 'OPENRATH');
  assert.equal(art.nameLine(p), 'SWIFT');
  const badge = art.mark('x', { x: { w: 10, h: 24, polys: [[[0, 0], [10, 0], [10, 24], [0, 24]]] } });
  assert.ok(!badge.wheel);
  art.draw(c, END, badge, '', '');
  assert.ok(at(175, 150) > 50, 'a badge is filled, centred when there are no names');
});

test('bootart: the whole animation', async () => {
  let frames = 0;
  const { zip, logo } = await art.make(64, 40, art.mark(''), 'OPENRATH', 'CAR', () => {
    frames++;
  });
  assert.equal(frames, art.FRAMES + 1);
  const files = unzipSync(zip);
  const names = Object.keys(files);
  assert.equal(names.length, art.FRAMES + 2);
  assert.equal(names[0], 'desc.txt');
  assert.equal(new TextDecoder().decode(files['desc.txt']), '64 40 25\np 1 0 part0\np 0 0 part1\n');
  assert.equal(names[1], 'part0/000.png');
  assert.equal(names[names.length - 1], 'part1/000.png');
  assert.equal(files['part0/045.png'][1], 0x50);
  assert.equal(logo.length, 54 + 64 * 3 * 40);
  const steps = art.instructions('/x', null, null);
  assert.ok(steps.startsWith('Saved in /x.'));
  assert.ok(steps.includes('STILL BOOT LOGO (safe):'));
  assert.ok(steps.includes('Some stereos have a Boot animation app'), 'without a boot animation app on the unit');
  const onStick = art.instructions('/x', '/usb', 'Boot Logo');
  assert.ok(onStick.startsWith('Saved in /x and on /usb.'));
  assert.ok(onStick.includes('This stereo has "Boot Logo"'));
});
