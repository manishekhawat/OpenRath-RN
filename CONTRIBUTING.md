# Contributing to OpenRath (React Native)

Thank you for helping. This is the React Native edition of [OpenRath](https://github.com/manishekhawat/OpenRath); the Android (Java) version is where the features are designed, and this repository follows it. Reports from a real head unit are the most useful contribution of all, because every unit is a little different.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

Use the issue forms on GitHub: a bug report, a feature request, or a stereo report to say how OpenRath runs on your unit. Include these:

- The unit's make and model, and its Android version.
- What you did, what you expected, and what happened.
- A photo of **Settings > Help > Diagnostics**, which lists the version, the GPS and the errors the app carried on from.

Security problems are reported privately instead: see [SECURITY.md](SECURITY.md).

## Building

You need Node 22.18 or newer, because `npm test` runs TypeScript straight through Node. A device build also needs the Android SDK, or an Expo account for EAS Build.

```sh
npm install
npm test            # the 197 logic checks carried over from the Android version
npm run typecheck   # tsc --noEmit
npm run lint
npx expo run:android   # build and install on a connected stereo or phone
```

`npx expo start` works with a development build. Expo Go runs most of it, but not the map's WebView settings or opening other apps. `npm run shots` rebuilds the screenshots and the opening logo in `docs/` from the web build.

Two generated files are checked in and must be regenerated rather than edited: `src/map/mapHtml.ts` (`npm run map`, from `assets/map`) and `src/data/hi.json` (`python3 scripts/hindi.py <OpenRath>/res src/data/hi.json`, from the Android project's string files). CI fails if the map page has drifted.

## Code style

- **Four layers.** `src/app` is routes and nothing else (Expo Router: every file there is a screen, `_layout.tsx` files are navigators). `src/components` is shared screen parts, `src/logic` is everything with no screen, `src/state` is the stores.
- **`src/logic` imports nothing from React, React Native or Expo.** That is what lets it be tested with plain `node --test`. Files in `src/logic` import their siblings **with** the `.ts` extension; files everywhere else import **without** it. Imports are in alphabetical order.
- **Logic that does not need the screen goes in `src/logic` with a test** in `src/logic/__tests__`. Node's type stripping is strip-only, so no TypeScript parameter properties and nothing else that needs transforming.
- **Don't swallow errors silently.** Where the app carries on after an exception, note it with `Diag.note('what it was doing', e)` so it shows in Settings > Help > Diagnostics.
- **User-facing text goes through `t()` or `f()`** from `src/logic/i18n`, with its Hindi in `src/data/hi.json`. A test fails for text with no translation. Regenerate the file rather than editing it by hand.
- **Every optional feature has a switch** in `src/logic/features.ts`, shown under "Turn on or off" in its Settings section, and its code checks `Features.on(prefs, id)`.
- **Colours come from the look** (`useLook`), never hard-coded, so themes apply. Sizes follow the 1024 x 600 screen the dashboard is designed at.
- **Comments explain why, not what.** User-facing text is plain English: short sentences, no jargon.
- Keep to the dependencies already in `package.json`. Use `npx expo install <package>` if a new one is genuinely needed, so the version matches the SDK.

## Pull requests

Keep each pull request to one change. Run `npm test`, `npm run typecheck` and `npm run lint` before opening it, and say which unit or phone you tried it on. A new feature needs a switch in `src/logic/features.ts` and a line in [CHANGELOG.md](CHANGELOG.md). The pull request form asks for each of these.

If the change ports something from the Android version, say which class it came from and add it to the table in [PORTING.md](PORTING.md).

## Releases

Tagging a version builds and signs the APK and makes the GitHub release: [RELEASING.md](RELEASING.md) has the steps and what the signing key needs.

## Licence

By contributing you agree that your work is released under the GNU General Public License, version 3 or later (see [LICENSE](LICENSE)).
