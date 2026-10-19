/// <reference types="node" />
/**
 * The everyday helpers: QR codes, news, chores, trip games and the documents wallet (the matching
 * checks from Tests.java, and a few more). The car wash reminder and accident help went in 1.35.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as chores from '../chores.ts';
import * as errands from '../errands.ts';
import { mapsLink } from '../geo.ts';
import * as kids from '../kids.ts';
import * as news from '../news.ts';
import { memoryPrefs } from '../prefs.ts';
import * as qr from '../qr.ts';
import { dayKey } from '../trip.ts';
import * as wallet from '../wallet.ts';

const DAY = 86400000;

test('qr', () => {
  const m = qr.modules(mapsLink(28.6139, 77.209));
  assert.equal(m.length, 29, 'parking code stays version 3');
  assert.equal(m[0][0], true, 'finder corner dark');
  assert.ok(qr.modules(mapsLink(28.6, 77.2)).length >= 21);
  // finder pattern: a light ring inside the dark corner square
  assert.equal(m[1][1], false);
  assert.equal(m[3][3], true);
  // short text: version 1 with the higher error correction it fits
  assert.equal(qr.modules('hi').length, 21);
  // UTF-8 text encodes
  assert.ok(qr.modules(errands.wifiQr('कार', 'pass')).length >= 21);
  const p = qr.path(m);
  assert.equal(p.size, 29 + 2 * qr.BORDER);
  assert.ok(p.d.startsWith(`M${qr.BORDER} ${qr.BORDER}h7`), 'top row of the finder in one run');
  assert.equal(qr.scale(m, 370), 10);
  assert.equal(qr.scale(m, 10), 1);
});

const XML =
  '<rss><channel><title>Top stories - Google News</title>' +
  '<item><title>Monsoon to reach Kerala early, says IMD - The Hindu</title><link>x</link>' +
  '<source url="https://www.thehindu.com">The Hindu</source></item>' +
  '<item><title><![CDATA[Sensex &amp; Nifty hit record &#8216;highs&#8217;]]></title></item>' +
  '<item><title>India beat Australia by 6 wickets in Perth - ESPNcricinfo</title><source url="u">ESPNcricinfo</source></item>' +
  '<item><title></title></item>' +
  '<item><title>Four</title></item><item><title>Five</title></item><item><title>Six</title></item>' +
  '</channel></rss>';

test('news', () => {
  const l = news.parse(XML, news.COUNT);
  assert.equal(l.length, 5);
  assert.equal(l[0].title, 'Monsoon to reach Kerala early, says IMD');
  assert.equal(l[0].source, 'The Hindu');
  assert.equal(l[1].title, 'Sensex & Nifty hit record ‘highs’');
  assert.equal(l[1].source, '');
  assert.equal(l[3].title, 'Four', 'skips empty');
  assert.equal(news.parse('<html>blocked</html>', 5).length, 0);
  assert.equal(news.parse(null, 5).length, 0);
  const r = news.read(l, 'Top stories');
  assert.ok(r.startsWith('Here are the top headlines. One. Monsoon to reach Kerala early, says IMD. From The Hindu.'));
  assert.ok(r.includes('Five. Five.') && !r.includes('Six'));
  assert.equal(news.read([{ title: 'Four', source: '' }], 'Sports'), 'Here are the Sports headlines. One. Four.');
  assert.equal(news.read([], 'Top stories'), "There's no news to read yet.");
  assert.equal(news.readOne(l[2]), 'India beat Australia by 6 wickets in Perth. From ESPNcricinfo.');
  assert.equal(news.url('top'), 'https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en');
  assert.equal(news.url('SPORTS'), 'https://news.google.com/rss/headlines/section/topic/SPORTS?hl=en-IN&gl=IN&ceid=IN:en');
  assert.equal(news.topicName('NATION'), 'India');
  assert.equal(news.topicName('nonsense'), 'Top stories');
});

test('news: source from the title, cleaning, age', () => {
  const l = news.parse('<item><title>Budget session to begin on Monday, sources say - Hindustan Times</title></item>', 5);
  assert.deepEqual(l[0], { title: 'Budget session to begin on Monday, sources say', source: 'Hindustan Times' });
  // too short before the dash: kept whole
  assert.equal(news.parse('<item><title>Rain - Mumbai</title></item>', 5)[0].title, 'Rain - Mumbai');
  assert.equal(news.clean(' <b>A</b>&nbsp;&quot;B&quot;\n &#x20B9;5 &lt;3 '), 'A "B" ₹5 <3');
  assert.equal(news.age(0, 1000), '');
  assert.equal(news.age(1000, 30000), 'just now');
  assert.equal(news.age(0 + 1, 12 * 60000 + 1), '12 min ago');
  assert.equal(news.age(1, 3 * 3600000 + 1), '3 h ago');
  assert.equal(news.age(1, 3 * DAY + 1), '3 days ago');
  assert.equal(news.heading('SPORTS', 0, 5), 'SPORTS NEWS');
  assert.equal(news.heading('top', 1, 5 * 60000 + 1), 'TOP NEWS  ·  5 min ago');
  const items = [{ title: 'A\tB', source: 'C' }, { title: 'D', source: '' }];
  assert.deepEqual(news.decode(news.encode(items)), [{ title: 'A B', source: 'C' }, { title: 'D', source: '' }]);
});

test('news refresh: cache, every 30 minutes, retry after 3', async () => {
  const p = memoryPrefs({ newsCache: 'Old one\tPTI\n', newsAt: '1000' });
  let calls = 0;
  let fail = false;
  const get = async (u: string) => {
    calls++;
    assert.ok(u.includes('SPORTS'));
    if (fail) throw new Error('offline');
    return XML;
  };
  p.put('newsTopic', 'SPORTS');
  Object.assign(news.state, { items: [], at: 0, version: 0, busy: false, tried: 0, loaded: false });
  // loads the kept ones, then fetches as they are old
  await news.refresh(p, false, 1000 + news.FRESH_MS + 1, get);
  assert.equal(calls, 1);
  assert.equal(news.state.items.length, 5);
  assert.equal(p.str('newsAt', ''), String(1000 + news.FRESH_MS + 1));
  assert.ok(p.str('newsCache', '').startsWith('Monsoon to reach Kerala early, says IMD\tThe Hindu\n'));
  // fresh: no fetch
  await news.refresh(p, false, 1000 + news.FRESH_MS + 60000, get);
  assert.equal(calls, 1);
  // a failure keeps the headlines, and waits 3 minutes before trying again
  fail = true;
  const t = 1000 + 2 * news.FRESH_MS + 2;
  await news.refresh(p, false, t, get);
  assert.equal(calls, 2);
  assert.equal(news.state.items.length, 5);
  await news.refresh(p, false, t + news.RETRY_MS - 1, get);
  assert.equal(calls, 2);
  await news.refresh(p, false, t + news.RETRY_MS + 1, get);
  assert.equal(calls, 3);
  // switched off: nothing
  p.put('feat:news', 'off');
  await news.refresh(p, true, t + news.RETRY_MS + 2, get);
  assert.equal(calls, 3);
});

test('news: the kept headlines show before any fetch', async () => {
  const p = memoryPrefs({ newsCache: 'Old one\tPTI\n', newsAt: '1000', 'feat:news': 'off' });
  Object.assign(news.state, { items: [], at: 0, version: 0, busy: false, tried: 0, loaded: false });
  await news.refresh(p, false, 2000);
  assert.deepEqual(news.state.items, [{ title: 'Old one', source: 'PTI' }]);
  assert.equal(news.state.at, 1000);
});

test('chores: split', () => {
  const p = memoryPrefs({ fuelLog: JSON.stringify([{ t: 1, l: 30, rs: 3150.4, odo: 1000 }]) });
  assert.equal(chores.lastFill(p), 3150.4);
  assert.equal(chores.lastFill(memoryPrefs()), 0);
  assert.equal(chores.split(p, 1000, 3), 'Your UPI id (like name@okbank)');
  assert.equal(chores.setUpi(p, 'tech okaxis'), "That doesn't look like a UPI id (name@bank)");
  assert.equal(chores.setUpi(p, ' tech@okaxis ', 'Tech B'), null);
  assert.equal(chores.split(p, 1000, 1), 'At least 2 people');
  const c = chores.split(p, 1000, 3);
  assert.ok(typeof c !== 'string');
  assert.equal(c.title, 'Pay ₹334 each');
  assert.equal(c.text, 'upi://pay?pa=tech@okaxis&pn=Tech%20B&am=334.00&cu=INR&tn=Trip%20share');
  assert.ok(c.caption.startsWith('₹1000 split 3 ways.') && c.caption.endsWith('Pays tech@okaxis.'));
  assert.equal(p.str('splitPeople', ''), '3');
  p.put('feat:split', 'off');
  assert.equal(chores.off(p, 'split'), 'Turn on "Split the cost by UPI" in Settings > Features');
  assert.equal(chores.off(p, 'parkTimer'), null);
});

test('chores: parking', () => {
  const p = memoryPrefs();
  const now = 0;
  const c = chores.startParking(p, 60, now);
  assert.equal(p.str('parkEnds', ''), String(3600000));
  assert.ok(c.text.includes('dates=19700101T005000Z/19700101T010000Z'));
  assert.ok(c.title.startsWith('Parking ends at '));
  assert.equal(chores.parkEnds(p, now + 1000), 3600000);
  assert.equal(chores.parkEnds(p, now + 3600001), 0);
  assert.equal(chores.parkingRow(p, 3600001), 'a reminder on your phone; or say "parking timer"');
  assert.equal(chores.PARK_MINUTES.length, chores.PARK_LABELS.length);
});

test('chores: guest Wi-Fi', () => {
  const p = memoryPrefs();
  assert.equal(chores.hotspot(p), null);
  assert.equal(chores.setHotspot(p, ' ', 'x'), 'Hotspot name (as set on the unit)');
  assert.equal(chores.setHotspot(p, 'My;Car', 'p:ss'), null);
  const c = chores.hotspot(p);
  assert.equal(c?.text, 'WIFI:T:WPA;S:My\\;Car;P:p\\:ss;;');
  assert.equal(c?.caption, 'Point a phone camera at this to join "My;Car". It shares the unit\'s mobile data.');
  chores.setHotspot(p, 'Open', '');
  assert.equal(chores.hotspot(p)?.text, 'WIFI:T:nopass;S:Open;;');
});

test('kids', () => {
  assert.equal(kids.km(48400), '48');
  assert.equal(kids.km(4460), '4.5');
  assert.equal(kids.km(-1), '--');
  assert.equal(kids.km(10000), '10');
  const p = memoryPrefs();
  const now = 50 * DAY + 3600000;
  assert.equal(kids.player(p, 0), 'Left seat');
  assert.equal(kids.player(p, 1), 'Right seat');
  kids.rename(p, 1, ' Aarav ');
  kids.rename(p, 0, ' ');
  assert.equal(kids.player(p, 1), 'Aarav');
  assert.equal(kids.player(p, 0), 'Left seat');
  kids.point(p, 0, now);
  kids.point(p, 0, now);
  kids.point(p, 1, now);
  assert.equal(p.str('kidsScore', ''), dayKey(now) + '|2|1');
  assert.equal(kids.score(p, 0, now), 2);
  assert.equal(kids.score(p, 0, now + DAY), 0, 'scores start again each day');
  assert.deepEqual(kids.toggle(p, 'DL', now), ['DL']);
  assert.deepEqual(kids.toggle(p, 'KA', now), ['DL', 'KA']);
  assert.deepEqual(kids.toggle(p, 'DL', now), ['KA']);
  assert.equal(p.str('kidsStates', ''), dayKey(now) + '|KA');
  assert.deepEqual(kids.found(p, now + DAY), []);
  assert.equal(kids.platesHeading(1), 'Number plates from other states: 1 of 25 found today');
  let r = 0;
  const rnd = () => [0, 0, 0.35][r++];
  assert.equal(kids.nextColour(0, rnd), 3);
  assert.ok(kids.light('Yellow') && !kids.light('Red'));
});

test('kids: how far', () => {
  const p = memoryPrefs();
  assert.deepEqual(kids.targets(p), []);
  p.put('place:Home', '28.5,77.1');
  p.put('place:Office', JSON.stringify({ lat: 28.6, lon: 77.2 }));
  p.put('dest', '|28.7|77.3');
  let t = kids.targets(p);
  assert.deepEqual(t.map((x) => x.name), ["Where we're going", 'Home', 'Office']);
  assert.equal(t[2].lat, 28.6);
  p.put('destNick', "Nani's house");
  assert.equal(kids.targets(p)[0].name, "Nani's house");
  p.put('dest', '');
  p.put('destNick', '');
  p.put('lastDest', JSON.stringify({ name: 'India Gate', lat: 28.61, lon: 77.23, t: 1 }));
  t = kids.targets(p);
  assert.equal(t[0].name, 'India Gate');
  assert.equal(kids.targetIndex(p, 3), 0);
  assert.equal(kids.nextTarget(p, 3), 1);
  assert.equal(kids.nextTarget(p, 3), 2);
  assert.equal(kids.nextTarget(p, 3), 0);
  p.put('kidsTarget', '5');
  assert.equal(kids.targetIndex(p, 2), 1);
});

test('wallet', () => {
  assert.equal(wallet.which('RC_front.jpg'), 0);
  assert.equal(wallet.which('insurance.pdf'), -1, 'insurance pdf ignored');
  assert.equal(wallet.which('license.png'), 3);
  assert.equal(wallet.which('insurance.pdf', true), 1);
  assert.equal(wallet.which('Pollution under control.jpeg'), 2);
  assert.equal(wallet.which('holiday.jpg'), -1);
  assert.equal(wallet.ext('IMG_1.JPEG', 'image/jpeg'), 'jpg');
  assert.equal(wallet.ext('scan', 'application/pdf'), 'pdf');
  assert.equal(wallet.ext(null, null), 'jpg');
  assert.equal(wallet.mime('rc-1.png'), 'image/png');
  assert.equal(wallet.fileName(1, 'pdf', 5), 'insurance-5.pdf');
  const names = ['rc-10.jpg', 'rc-20.png', 'puc.pdf', 'notes.txt', 'rcx.jpg'];
  assert.equal(wallet.stored(names, 0), 'rc-20.png', 'the newest');
  assert.equal(wallet.stored(names, 2), 'puc.pdf');
  assert.equal(wallet.stored(names, 3), null);
  assert.deepEqual(wallet.index(names), ['rc-20.png', null, 'puc.pdf', null]);
  assert.equal(wallet.countText(names), '2 of 4 added');
  assert.equal(wallet.label(0, 0, 1), 'RC (registration)');
  assert.equal(wallet.label(2, 1, 2), 'PUC certificate   ·   tap for the next (2 of 2)');
  assert.ok(wallet.isPdf('puc.PDF'));
  assert.equal(wallet.importText(['Insurance']), 'Imported: Insurance.');
});

test('chores: trip share', () => {
  const p = memoryPrefs();
  assert.equal(chores.tripShare(p, 0, 0), 'Waiting for the GPS to find the car');
  const here = chores.tripShare(p, 28.5, 77.2);
  assert.ok(typeof here !== 'string' && here.title === 'Where we are now' && here.text === mapsLink(28.5, 77.2));
  p.put('dest', 'Agra|27.1751|78.0421');
  const trip = chores.tripShare(p, 28.5, 77.2);
  assert.ok(typeof trip !== 'string');
  assert.equal(trip.title, 'Our trip to Agra');
  assert.ok(trip.text.includes('destination=27.17510,78.04210'));
  assert.ok(/^About \d+ km to go in a straight line\. /.test(trip.caption));
});
