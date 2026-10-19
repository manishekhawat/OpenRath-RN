/**
 * The screenshots in docs/screenshots and the opening logo in docs/opening-logo.gif, as the
 * Android project's screenshots workflow takes them on an emulator: 1024 x 600, the usual 7 inch
 * stereo's screen. Here they come from the web build, with the stand-ins in scripts/shots/stubs
 * for what only a stereo has (camera, GPS, media library, files), a canned drive at 48 km/h and a
 * made-up day's trip, so the screens show what the driver would see rather than empty boxes.
 *
 *   npm run shots                        # export, then take every shot
 *   npm run shots -- --keep              # use the web build already in .shots/web
 *   npm run shots -- --keep --only looks # one part again: intro, setup, looks or screens
 *
 * Needs the dev dependencies (playwright-core, react-native-web) and a Chromium: the one Playwright
 * downloads, or any Chrome given in CHROME.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, '.shots', 'web');
const shots = join(root, 'docs', 'screenshots');
const frames = join(root, '.shots', 'frames');
const port = 8099;
const keep = process.argv.includes('--keep');
/** --only intro|setup|looks|screens takes that part again; without it, everything. */
const onlyAt = process.argv.indexOf('--only');
const only = onlyAt > 0 ? process.argv[onlyAt + 1] : '';
const wanted = (part) => only === '' || only === part;

/** The day the shots are taken from: a drive that has already covered a few kilometres. */
const TODAY = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const CAR = {
  setupDone: 'yes',
  carSetup: 'yes',
  permsExplained: 'yes',
  restoreAsked: 'yes',
  level: 'custom',
  welcome: 'Manish',
  carBrand: 'maruti',
  carBrandName: 'Maruti Suzuki',
  carModel: 'Swift Dzire',
  carShape: 'sedan',
  carBody: 'car',
  carColour: '-5232080',   // the Android colour int the car picture reads (a deep red)
  city: 'New Delhi',
  'feat:intro': 'off',
  'feat:nightDrive': 'off',   // the shots are taken in the afternoon, whatever the clock says
};

function trip() {
  return JSON.stringify({
    day: TODAY(),
    todayKm: 18.4,
    todaySec: 2040,
    driveKm: 6.2,
    driveSec: 540,
    driveTop: 72,
    odoKm: 42870,
    todayBrakes: 1,
    todayAccels: 2,
    todaySpeedSec: 45,
    park: null,
  });
}

/** Six days behind today: [km, seconds, harsh brakes, hard starts, seconds over the limit, score]. */
function history() {
  const days = {};
  const rows = [
    [24.6, 2760, 1, 2, 30, 88],
    [11.2, 1500, 0, 1, 0, 95],
    [46.8, 4980, 2, 3, 120, 79],
    [8.4, 1080, 0, 0, 0, 98],
    [31.5, 3300, 1, 1, 60, 86],
    [19.7, 2220, 0, 2, 15, 91],
  ];
  const d = new Date();
  for (let i = 0; i < rows.length; i++) {
    const day = new Date(d.getTime() - (i + 1) * 86400000);
    days[`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`] = rows[i];
  }
  return JSON.stringify(days);
}

/** Every screen, with the name its file gets. */
const SCREENS = [
  ['/map', 'map'],
  ['/music', 'music'],
  ['/news', 'news'],
  ['/video', 'video-window'],
  ['/apps', 'all-apps'],
  ['/places', 'saved-places'],
  ['/trips', 'trip-history'],
  ['/tripmenu', 'trip-menu'],
  ['/report', 'weekly-report'],
  ['/achievements', 'badges'],
  ['/fuel', 'fuel-log'],
  ['/care', 'car-care'],
  ['/tolls', 'tolls'],
  ['/chores', 'everyday-helpers'],
  ['/kids', 'kids-games'],
  ['/wallet', 'documents-wallet'],
  ['/dashcam', 'dashcam'],
  ['/parkphoto', 'parking-photo'],
  ['/view360', 'view-360'],
  ['/bootart', 'boot-animation'],
  ['/cab', 'cab'],
  ['/cab/earnings', 'cab-earnings'],
  ['/cab/meter', 'cab-meter'],
  ['/cab/cng', 'cab-cng'],
  ['/cab/notes', 'cab-notes'],
  ['/cab/papers', 'cab-papers'],
  ['/cab/phrases', 'cab-phrases'],
  ['/cab/hotspots', 'cab-hotspots'],
  ['/cab/sos', 'cab-sos'],
  ['/cab/settings', 'cab-settings'],
  ['/settings', 'settings'],
  ['/settings/level', 'settings-level'],
  ['/settings/features', 'settings-features'],
  ['/settings/road', 'settings-road-helpers'],
  ['/settings/theme', 'settings-themes'],
  ['/settings/layouts', 'settings-layouts'],
  ['/settings/profiles', 'settings-profiles'],
  ['/settings/backup', 'settings-backup'],
  ['/settings/reports', 'settings-usage-report'],
  ['/settings/diagnostics', 'settings-diagnostics'],
  ['/settings/about', 'settings-about'],
];

/** Screens that need longer than the usual wait: the map draws nothing until a few fixes are in. */
const SLOW = { map: 9000 };

/** The dashboard's looks: the boxes, then each picture layout. */
const LOOKS = [
  ['', 'dashboard-boxes'],
  ['bubbles', 'dashboard-bubbles'],
  ['scenery', 'dashboard-scenery'],
  ['columns', 'dashboard-columns'],
  ['picture_clock', 'dashboard-picture-clock'],
  ['strip', 'dashboard-strip'],
  ['twin_dials', 'dashboard-twin-dials'],
  ['room', 'dashboard-room'],
  ['big_clock', 'dashboard-big-clock'],
  ['lyrics', 'dashboard-lyrics'],
  ['cards', 'dashboard-cards-and-apps'],
  ['mission', 'dashboard-mission-control'],
  ['electric', 'dashboard-electric'],
  ['roadster', 'dashboard-roadster'],
];

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

/** Serves the exported build, falling back to index.html so the router's own paths open. */
function serve(dir) {
  const server = createServer(async (req, res) => {
    const asked = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = join(dir, normalize(asked).replace(/^(\.\.[/\\])+/, ''));
    for (const candidate of [file, join(dir, 'index.html')]) {
      try {
        const body = await readFile(candidate);
        res.writeHead(200, { 'content-type': TYPES[extname(candidate)] ?? 'application/octet-stream' });
        res.end(body);
        return;
      } catch {
        // the fallback next
      }
    }
    res.writeHead(404).end('not found');
  });
  return new Promise((ready) => server.listen(port, () => ready(server)));
}

function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (browsers && existsSync(browsers)) {
    for (const dir of ['chromium-1194', 'chromium']) {
      const guess = join(browsers, dir, 'chrome-linux', 'chrome');
      if (existsSync(guess)) return guess;
    }
  }
  return undefined;   // Playwright's own copy
}

async function shot(page, name) {
  await page.screenshot({ path: join(shots, name + '.png') });
  console.log('  ' + name);
}

/** Opens a path with the settings `prefs` already in place, as a unit that has been driven would have. */
async function open(context, path, prefs) {
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
  }, prefs);
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
  return page;
}

const settings = (extra = {}) => ({
  'openrath:prefs': JSON.stringify({ ...CAR, ...extra }),
  'openrath:trip': trip(),
  'openrath:history': history(),
});

async function main() {
  if (!keep) {
    await rm(join(root, '.shots'), { recursive: true, force: true });
    console.log('Exporting the web build…');
    const done = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', web], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, OPENRATH_SHOTS: '1', EXPO_OFFLINE: '1', CI: '1' },
    });
    if (done.status !== 0) process.exit(done.status ?? 1);
  }
  await mkdir(shots, { recursive: true });
  await mkdir(frames, { recursive: true });
  const server = await serve(web);
  const browser = await chromium.launch({ executablePath: chrome(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1024, height: 600 }, deviceScaleFactor: 1 });

  // ---- the wheel rolling in when the app opens, frame by frame
  if (wanted('intro')) {
    console.log('The opening logo…');
    const intro = await open(context, '/', { 'openrath:prefs': JSON.stringify({ ...CAR, 'feat:intro': 'on' }) });
    await intro.waitForTimeout(250);   // the first paint; a black frame is no way to open
    for (let i = 0; i < 30; i++) {
      await intro.screenshot({ path: join(frames, String(i).padStart(2, '0') + '.png') });
      await intro.waitForTimeout(75);
    }
    await intro.close();
  }

  // ---- the setup steps, as a stereo shows them the first time (the step it is on is remembered)
  if (wanted('setup')) {
  console.log('Setup…');
  const steps = ['setup-welcome', 'setup-permissions', 'setup-car', 'setup-look', 'setup-level', 'setup-apps', 'setup-phone-home'];
  for (const [step, name] of steps.entries()) {
    const page = await open(context, '/setup', { 'openrath:prefs': JSON.stringify({ setupStep: String(step) }) });
    await page.waitForTimeout(3000);
    await shot(page, name);
    await page.close();
  }

  // ---- the car step in Hindi, as the Android project's shots do
  const hindi = await open(context, '/setup', { 'openrath:prefs': JSON.stringify({ lang: 'hi', setupStep: '2' }) });
  await hindi.waitForTimeout(3000);
  await shot(hindi, 'setup-hindi');
  await hindi.close();
  }

  // ---- the dashboard in each look
  if (wanted('looks')) {
  console.log('Dashboards…');
  for (const [layout, name] of LOOKS) {
    const page = await open(context, '/', settings(layout ? { layout } : {}));
    await page.waitForTimeout(6000);   // a few GPS fixes, so the speed is moving
    await shot(page, name);
    await page.close();
  }
  }

  // ---- every other screen
  if (wanted('screens')) {
  console.log('Screens…');
  // one page for all of them: a tab each leaves the container short of memory, and a renderer
  // pushed out of it writes a black picture instead of the screen
  const page = await context.newPage();
  await page.addInitScript((seed) => {
    for (const [k, v] of Object.entries(seed)) window.localStorage.setItem(k, v);
  }, settings());
  for (const [path, name] of SCREENS) {
    await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load' });
    await page.waitForTimeout(SLOW[name] ?? 3000);
    await shot(page, name);
  }
  await page.close();
  }

  await browser.close();
  server.close();

  // ---- the frames into the opening logo's animation
  if (!wanted('intro')) return;
  const list = (await readdir(frames)).filter((n) => n.endsWith('.png')).sort();
  await writeFile(join(frames, 'list.txt'), list.map((n) => `file '${join(frames, n)}'\nduration 0.09`).join('\n') + '\n');
  const gif = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'), '-vf', 'scale=512:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse', join(root, 'docs', 'opening-logo.gif')],
    { stdio: 'ignore' },
  );
  console.log(gif.status === 0 ? '  docs/opening-logo.gif' : '  (no ffmpeg: the logo animation was left as it was)');
  console.log('Done.');
}

await main();
